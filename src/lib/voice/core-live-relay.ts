import { createCoreAuthorization } from "../core/authorization.ts";
import { isSameOrigin } from "../core/handler.ts";
import type { CoreRequestDependencies } from "../core/handler.ts";
import { readBoundedJson, record } from "../core/contracts.ts";

const voice = "gleam";
const relayPath = "/v1/media/relay";
const scopePattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const modelPattern = /^gpt-live-[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });
const fail = (error: string, status: number) => json({ error }, status);

type Input = { scopeId: string; requestKey: string } | { scopeId: string; missionId: string };

async function relayInput(request: Request): Promise<Input | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  const input = await readBoundedJson(request, 256).catch(() => null);
  if (!record(input) || Object.keys(input).length !== 2 || typeof input.scopeId !== "string" || !scopePattern.test(input.scopeId)) return null;
  if (typeof input.requestKey === "string" && uuidPattern.test(input.requestKey)) return { scopeId: input.scopeId, requestKey: input.requestKey };
  if (typeof input.missionId === "string" && uuidPattern.test(input.missionId)) return { scopeId: input.scopeId, missionId: input.missionId };
  return null;
}

export async function handleCoreLiveRelay(request: Request, deps: CoreRequestDependencies) {
  if (request.method !== "GET" && request.method !== "POST") return fail("method_not_allowed", 405);
  const { env } = deps;
  let input: Input | null = null;
  if (request.method === "POST") {
    if (!isSameOrigin(request, env.AVATAR_APP_ORIGIN)) return fail("invalid_origin", 403);
    input = await relayInput(request);
    if (!input) return fail("invalid_input", 400);
  }
  const identity = await deps.getIdentity().catch(() => ({ status: "unavailable" } as const));
  if (identity.status === "anonymous") return fail("sign_in_required", 401);
  if (identity.status === "unavailable") return fail("identity_unavailable", 503);
  if (identity.status !== "authenticated") return fail("workspace_required", 403);
  if (env.AVATAR_CORE_LIVE_RELAY_ENABLED !== "true") return fail("live_setup_required", 503);
  const missionId = input && "missionId" in input ? input.missionId : undefined;
  const grant = createCoreAuthorization(identity.identity, env, undefined, "voice-relay", missionId);
  if (grant.status !== "ready") return fail(grant.code, grant.status === "access_denied" ? 403 : 503);
  if (input && input.scopeId !== grant.scopeId) return fail("workspace_changed", 403);

  const path = missionId ? `${relayPath}/${missionId}/lease` : `${relayPath}/${input ? "tickets" : "readiness"}`;
  try {
    const response = await (deps.fetch ?? fetch)(grant.origin + path, {
      method: input ? "POST" : "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(6_000),
      headers: { Authorization: `Bearer ${grant.token}`, Accept: "application/json", ...(input && { "Content-Type": "application/json" }) },
      ...(input && { body: JSON.stringify("requestKey" in input ? { requestKey: input.requestKey } : {}) }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 403) return fail("voice_grant_denied", 403);
      if (response.status === 409) return fail("voice_session_busy", 409);
      if (response.status === 429) return fail("voice_quota_reached", 429);
      return fail("voice_relay_unavailable", 503);
    }
    const data = await readBoundedJson(response, 8192);
    if (!record(data)) return fail("invalid_voice_relay_receipt", 502);
    if (missionId) {
      const leaseExpiresAt = typeof data.leaseExpiresAt === "string" ? Date.parse(data.leaseExpiresAt) : NaN;
      const deadlineAt = typeof data.deadlineAt === "string" ? Date.parse(data.deadlineAt) : NaN;
      if (data.missionId !== missionId || !(leaseExpiresAt > Date.now() && leaseExpiresAt <= grant.expiresAt * 1000 && leaseExpiresAt <= deadlineAt)) {
        return fail("invalid_voice_relay_receipt", 502);
      }
      return json({ missionId, scopeId: grant.scopeId, leaseExpiresAt, deadlineAt });
    }
    if (data.voice !== voice || typeof data.model !== "string" || !modelPattern.test(data.model)) return fail("invalid_voice_relay_receipt", 502);
    if (!input) return data.ready === true ? json({ scopeId: grant.scopeId, model: data.model, voice }) : fail("voice_relay_unavailable", 503);
    const socketUrl = grant.origin.replace(/^https:/, "wss:") + relayPath + "/socket";
    if (response.status !== 201 || typeof data.ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.ticket) ||
        typeof data.missionId !== "string" || !uuidPattern.test(data.missionId) || data.socketUrl !== socketUrl ||
        typeof data.expiresAt !== "number" || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now() / 1000 || data.expiresAt > grant.expiresAt ||
        typeof data.leaseRenewAfterMs !== "number" || !Number.isSafeInteger(data.leaseRenewAfterMs) || data.leaseRenewAfterMs < 1000 || data.leaseRenewAfterMs > 5000) {
      return fail("invalid_voice_relay_receipt", 502);
    }
    return json({ scopeId: grant.scopeId, model: data.model, voice, socketUrl, ticket: data.ticket, missionId: data.missionId,
      expiresAt: data.expiresAt, leaseRenewAfterMs: data.leaseRenewAfterMs }, 201);
  } catch {
    return fail("voice_relay_unavailable", 503);
  }
}
