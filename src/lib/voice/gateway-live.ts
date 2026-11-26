import { createCoreAuthorization } from "../core/authorization.ts";
import type { CoreAuthorization } from "../core/authorization.ts";
import { isSameOrigin } from "../core/handler.ts";
import type { CoreRequestDependencies } from "../core/handler.ts";
import { readBoundedJson, record } from "../core/contracts.ts";

export const liveModel = "openai/gpt-live-1";
export const liveVoice = "gleam";
export const liveSocket = "wss://ai-gateway.vercel.sh/v1/live/sessions";
const tokenEndpoint = "https://ai-gateway.vercel.sh/v1/realtime/client-secrets";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });
const fail = (error: string, status: number) => json({ error }, status);

type Dependencies = CoreRequestDependencies & {
  verifyHostedGrant: (grant: Extract<CoreAuthorization, { status: "ready" }>) => Promise<boolean>;
  verifyQuotaStore: () => Promise<boolean>;
  reserve: (scopeId: string) => Promise<boolean | null>;
};

export async function handleGatewayLive(request: Request, dependencies: Dependencies) {
  const { env } = dependencies;
  if (request.method !== "GET" && request.method !== "POST") return fail("method_not_allowed", 405);
  const starting = request.method === "POST";
  let requestedScope: string | undefined;
  if (starting) {
    if (!isSameOrigin(request, env.AVATAR_APP_ORIGIN)) return fail("invalid_origin", 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return fail("invalid_input", 400);
    try {
      const input = await readBoundedJson(request, 256);
      if (!record(input) || Object.keys(input).length !== 1 ||
          typeof input.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(input.scopeId)) return fail("invalid_input", 400);
      requestedScope = input.scopeId;
    } catch { return fail("invalid_input", 400); }
  }
  const identity = await dependencies.getIdentity().catch(() => ({ status: "unavailable" } as const));
  if (identity.status === "anonymous") return fail("sign_in_required", 401);
  if (identity.status === "unavailable") return fail("identity_unavailable", 503);
  if (identity.status !== "authenticated") return fail("workspace_required", 403);
  const grant = createCoreAuthorization(identity.identity, env, undefined, "voice-readiness");
  if (grant.status !== "ready") return fail(grant.code, grant.status === "access_denied" ? 403 : 503);
  if (requestedScope && requestedScope !== grant.scopeId) return fail("workspace_changed", 403);
  const credential = env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim();
  if (env.AVATAR_GATEWAY_LIVE_ENABLED !== "true" || !credential || !env.AVATAR_SETTINGS_DATABASE_URL) return fail("live_setup_required", 503);
  if (grant.expiresAt - Math.ceil(Date.now() / 1000) < 25) return fail("voice_grant_expires_soon", 403);
  if (!await dependencies.verifyHostedGrant(grant).catch(() => false)) return fail("hosted_voice_grant_unverified", 503);
  if (!starting) {
    const available = await dependencies.verifyQuotaStore().catch(() => false);
    return available ? json({ scopeId: grant.scopeId, model: liveModel, voice: liveVoice }) : fail("voice_quota_unavailable", 503);
  }

  try {
    if (grant.expiresAt - Math.ceil(Date.now() / 1000) < 25) return fail("voice_grant_expires_soon", 403);
    const allowed = await dependencies.reserve(grant.scopeId);
    if (allowed === null) return fail("voice_quota_unavailable", 503);
    if (!allowed) return fail("voice_quota_reached", 429);
    if (grant.expiresAt - Math.ceil(Date.now() / 1000) < 25) return fail("voice_grant_expires_soon", 403);
    const response = await (dependencies.fetch ?? fetch)(tokenEndpoint, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: liveModel, routeKind: "live", expiresIn: 15 }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return fail("voice_provider_unavailable", response.status === 429 ? 429 : 502);
    }
    const payload = await readBoundedJson(response, 8192);
    if (!record(payload) || typeof payload.token !== "string" || !/^[A-Za-z0-9_.-]{16,4096}$/.test(payload.token) ||
        typeof payload.expiresAt !== "number" || !Number.isSafeInteger(payload.expiresAt) ||
        payload.expiresAt > grant.expiresAt || payload.expiresAt * 1000 <= Date.now()) return fail("invalid_provider_token", 502);
    return json({ token: payload.token, expiresAt: payload.expiresAt, scopeId: grant.scopeId, model: liveModel, voice: liveVoice });
  } catch { return fail("voice_provider_unavailable", 503); }
}
