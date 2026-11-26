import { isSameOriginMutation, privateJson, readBoundedJson } from "../auth/http.ts";
import type { VerifiedIdentityResult } from "../auth/types.ts";
import { identityScopeId } from "../core/authorization.ts";
import { record } from "../core/contracts.ts";
import { requestIdPattern, renderRoomDurationSeconds, scopeIdPattern } from "./render-contract.ts";
import { tavusRenderProvider } from "./render-provider.ts";

export type RenderStore = {
  check: () => Promise<void>;
  reserve: (scopeId: string, requestId: string) => Promise<boolean>;
  saveRoom: (scopeId: string, requestId: string, conversationId: string) => Promise<{ cancelled: boolean } | null>;
  requestClose: (scopeId: string, requestId: string) => Promise<{ conversationId: string | null; ended: boolean } | null>;
  markEnded: (scopeId: string, requestId: string) => Promise<void>;
};

type Dependencies = {
  env: Readonly<Record<string, string | undefined>>;
  getIdentity: () => Promise<VerifiedIdentityResult>;
  getStore: () => RenderStore | null;
  fetch?: typeof fetch;
  audit: (event: string, requestId: string) => void;
};

const fail = (error: string, status: number) => privateJson({ error }, status);

export async function handleTavusRender(request: Request, deps: Dependencies) {
  const { env } = deps;
  const checking = request.method === "GET";
  const ending = request.method === "DELETE";
  if (!checking && !ending && request.method !== "POST") return fail("method_not_allowed", 405);

  let input: { scopeId: string; requestId: string } | undefined;
  if (!checking) {
    const appOrigin = env.AVATAR_APP_ORIGIN;
    if (!appOrigin?.startsWith("https://") || !isSameOriginMutation(request, appOrigin)) return fail("invalid_origin", 403);
    const body = await readBoundedJson(request, 256);
    if (!body.ok) return fail(body.code, body.status);
    const data = body.data;
    if (!record(data) || Object.keys(data).sort().join(",") !== "requestId,scopeId" ||
        typeof data.scopeId !== "string" || !scopeIdPattern.test(data.scopeId) ||
        typeof data.requestId !== "string" || !requestIdPattern.test(data.requestId)) return fail("invalid_input", 400);
    input = { scopeId: data.scopeId, requestId: data.requestId };
  }

  const verified = await deps.getIdentity().catch(() => ({ status: "unavailable" } as const));
  if (verified.status === "anonymous") return fail("sign_in_required", 401);
  if (verified.status === "unavailable") return fail("identity_unavailable", 503);
  if (verified.status !== "authenticated" || verified.identity.role !== "owner" || !verified.identity.emailVerified) {
    return fail("tavus_render_access_denied", 403);
  }
  const scopeId = identityScopeId(verified.identity);
  if (input && input.scopeId !== scopeId) return fail("workspace_changed", 403);
  const sessionExpiresAt = Date.parse(verified.identity.sessionExpiresAt);
  if (!(sessionExpiresAt > Date.now())) return fail("session_expired", 403);

  if (!ending) {
    if (env.AVATAR_TAVUS_RENDER_ENABLED !== "true") return fail("tavus_render_disabled", 503);
    const grantExpiresAt = Date.parse(env.AVATAR_TAVUS_RENDER_GRANT_EXPIRES_AT ?? "");
    const minimumExpiry = Date.now() + (renderRoomDurationSeconds + 45) * 1000;
    if (env.AVATAR_TAVUS_RENDER_SCOPE_ID !== scopeId || !(grantExpiresAt > minimumExpiry)) {
      return fail("tavus_render_grant_required", 403);
    }
    if (!(sessionExpiresAt > minimumExpiry)) return fail("session_expires_too_soon", 403);
  }

  const key = env.TAVUS_API_KEY?.trim();
  if (!key) return fail("tavus_key_required", 503);
  const store = deps.getStore();
  if (!store) return fail("tavus_render_store_unavailable", 503);
  const provider = tavusRenderProvider(key, deps.fetch ?? fetch);

  if (ending && input) {
    const { requestId } = input;
    try {
      const room = await store.requestClose(scopeId, requestId);
      if (!room) return fail("tavus_render_room_not_found", 404);
      if (room.ended) return privateJson({ status: "ended" });
      if (!room.conversationId) return privateJson({ status: "closing" }, 202);
      if (!room.ended) {
        if (!await provider.end(room.conversationId)) throw new Error("Tavus end failed");
        await store.markEnded(scopeId, requestId);
        deps.audit("ended", requestId);
      }
      return privateJson({ status: "ended" });
    } catch {
      deps.audit("end_unconfirmed", requestId);
      return fail("tavus_render_end_unconfirmed", 502);
    }
  }

  try {
    await store.check();
  } catch { return fail("tavus_render_store_unavailable", 503); }
  try {
    const problem = await provider.check();
    if (problem) return fail(problem, 503);
  } catch { return fail("tavus_render_preflight_failed", 503); }
  if (checking) return privateJson({ scopeId, transport: "daily-audio-echo", playbackVerified: false });
  if (!input) return fail("invalid_input", 400);
  const { requestId } = input;
  if (request.signal.aborted) return fail("tavus_render_start_cancelled", 408);

  try {
    if (!await store.reserve(scopeId, requestId)) return fail("tavus_render_start_limited", 429);
  } catch { return fail("tavus_render_store_unavailable", 503); }
  deps.audit("reserved", requestId);
  if (request.signal.aborted) return fail("tavus_render_start_cancelled", 408);

  let conversationId: string | null = null;
  let saved: { cancelled: boolean } | null = null;
  try {
    const created = await provider.create(requestId);
    conversationId = created.conversationId;
    if (conversationId) saved = await store.saveRoom(scopeId, requestId, conversationId);
    if (!created.room || !saved || saved.cancelled || request.signal.aborted) throw new Error("Unusable Tavus room");
    deps.audit("created", requestId);
    return privateJson({ ...created.room, scopeId, maxDurationSeconds: renderRoomDurationSeconds, playbackVerified: false }, 201);
  } catch {
    if (conversationId && !saved) await store.saveRoom(scopeId, requestId, conversationId).catch(() => null);
    const ended = conversationId && await provider.end(conversationId).catch(() => false);
    if (ended) await store.markEnded(scopeId, requestId).catch(() => {});
    deps.audit(ended ? "start_failed_room_ended" : "start_unconfirmed", requestId);
    return fail(ended ? "tavus_render_start_failed" : "tavus_render_start_unconfirmed", 502);
  }
}
