import { CORE_ORIGIN, createCoreAuthorization, identityScopeId } from "./authorization.ts";
import { BodyLimitError, BodyTimeoutError, MAX_REQUEST_BYTES, readBoundedJson, record } from "./contracts.ts";
import { isSameOrigin } from "./handler.ts";
import type { CoreRequestDependencies } from "./handler.ts";

type VoiceOperation = "readiness" | "voice/start" | "voice/end";

const responseHeaders = {
  "cache-control": "private, no-store, max-age=0", pragma: "no-cache", vary: "Cookie", "x-content-type-options": "nosniff",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modelName = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: responseHeaders });
const failure = (error: string, status: number, scopeId?: string) => json({ error, ...(scopeId ? { scopeId } : {}) }, status);
const isId = (x: unknown): x is string => typeof x === "string" && uuid.test(x);
const isSdp = (x: unknown, max: number): x is string =>
  typeof x === "string" && x.length >= 10 && x.length <= max && /^v=0\r?\n/.test(x) && !x.includes("\0");

type VoiceInput = { scopeId: string; sdp: string; requestKey: string } | { scopeId: string; missionId: string };

function parseInput(operation: VoiceOperation, candidate: unknown): VoiceInput | null {
  if (!record(candidate) || typeof candidate.scopeId !== "string" || !/^[0-9a-f]{64}$/.test(candidate.scopeId)) return null;
  const fields = Object.keys(candidate).sort().join(",");
  if (operation === "voice/end" && fields === "missionId,scopeId" && isId(candidate.missionId)) {
    return { scopeId: candidate.scopeId, missionId: candidate.missionId };
  }
  if (operation === "voice/start" && fields === "requestKey,scopeId,sdp" && isSdp(candidate.sdp, 12_000)
      && typeof candidate.requestKey === "string" && /^[A-Za-z0-9_-]{8,96}$/.test(candidate.requestKey)) {
    return { scopeId: candidate.scopeId, requestKey: candidate.requestKey, sdp: candidate.sdp };
  }
  return null;
}

function readModelMetadata(body: unknown) {
  if (!record(body) || body.verification !== "model_metadata_only" || typeof body.voiceModelAccessVerified !== "boolean"
      || typeof body.model !== "string" || !modelName.test(body.model) || typeof body.voice !== "string" || !modelName.test(body.voice)) return null;
  const serverControlsConnected = body.serverControlsConnected === true;
  const nativeReasoningConfigured = body.nativeReasoningConfigured === true;
  const reasoningModelAccessVerified = body.reasoningModelAccessVerified === true;
  return { model: body.model, voice: body.voice, voiceModelAccessVerified: body.voiceModelAccessVerified, serverControlsConnected,
    voiceHistoryPersistence: body.voiceHistoryPersistence === true, nativeReasoningConfigured, reasoningModelAccessVerified,
    nativeReasoningReady: nativeReasoningConfigured && reasoningModelAccessVerified && typeof body.reasoningModel === "string" && modelName.test(body.reasoningModel),
    canStartVoice: body.voiceModelAccessVerified && serverControlsConnected, audioVerified: false };
}

function presentSessionResult(operation: "voice/start" | "voice/end", body: unknown, scopeId: string, input: VoiceInput) {
  const invalid = () => failure("outcome_unknown", 502, scopeId);
  if (!record(body)) return invalid();
  if (!isId(body.missionId)) return invalid();
  if (operation === "voice/end") {
    if (!input || !("missionId" in input) || body.missionId !== input.missionId || !["closed", "closing", "unknown"].includes(String(body.status))) return invalid();
    return json({ scopeId, missionId: body.missionId, status: body.status });
  }
  if (body.duplicate === true) return json({ scopeId, error: "already_requested", missionId: body.missionId }, 409);
  if (body.duplicate !== false || body.status !== "created" || !isId(body.receiptId) || !record(body.transport)
      || body.transport.type !== "webrtc" || !isSdp(body.transport.sdp, 60_000)) return invalid();
  return json({ scopeId, status: "created", missionId: body.missionId, receiptId: body.receiptId, sdp: body.transport.sdp }, 201);
}

async function authorizeVoice(dependencies: CoreRequestDependencies, delegation: "voice-readiness" | "voice-start" | "voice-end", expectedScope?: string) {
  const verified = await dependencies.getIdentity().catch(() => ({ status: "unavailable" } as const));
  if (verified.status === "anonymous") return { error: failure("sign_in_required", 401) };
  if (verified.status === "membership_required" || verified.status === "access_denied") return { error: failure("workspace_required", 403) };
  if (verified.status !== "authenticated") return { error: failure("identity_unavailable", 503) };
  const scopeId = identityScopeId(verified.identity);
  if (expectedScope && scopeId !== expectedScope) return { error: failure("workspace_changed", 403, scopeId) };
  const auth = createCoreAuthorization(verified.identity, dependencies.env, Math.floor(Date.now() / 1_000), delegation);
  if (auth.status !== "ready") return { error: failure(auth.code, auth.status === "access_denied" ? 403 : 503, scopeId) };

  return { token: auth.token, scopeId };
}

async function fetchCoreVoice(fetcher: typeof fetch, token: string, scopeId: string, path: string, providerInput?: Record<string, unknown>) {
  const unavailable = () => failure(providerInput ? "outcome_unknown" : "voice_not_ready", 503, scopeId);
  try {
    const response = await fetcher(CORE_ORIGIN + path, {
      method: providerInput ? "POST" : "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(providerInput ? 35_000 : 11_000),
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(providerInput ? { "content-type": "application/json" } : {}) },
      ...(providerInput ? { body: JSON.stringify(providerInput) } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 401 || response.status === 403) return { error: failure("core_access_denied", 403, scopeId) };
      if (response.status === 429) return { error: failure("rate_limit", 429, scopeId) };
      if (response.status === 400 || response.status === 413) return { error: failure("invalid_input", response.status, scopeId) };
      return { error: unavailable() };
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel().catch(() => {});
      return { error: unavailable() };
    }
    return { body: await readBoundedJson(response, providerInput ? 100_000 : 16_384) };
  } catch { return { error: unavailable() }; }
}

export async function handleVoiceRequest(request: Request, operation: string, dependencies: CoreRequestDependencies): Promise<Response> {
  if (operation !== "readiness" && operation !== "voice/start" && operation !== "voice/end") return failure("unknown_operation", 404);
  const method = operation === "readiness" ? "GET" : "POST";
  if (request.method !== method) return failure("method_not_allowed", 405);
  let input: VoiceInput | undefined;
  if (method === "POST") {
    if (!isSameOrigin(request, dependencies.env.AVATAR_APP_ORIGIN)) return failure("invalid_origin", 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return failure("invalid_input", 400);
    try {
      input = parseInput(operation, await readBoundedJson(request, MAX_REQUEST_BYTES)) ?? undefined;
      if (!input) return failure("invalid_input", 400);
    } catch (error) {
      if (error instanceof BodyTimeoutError) return failure("body_timeout", 408);
      return error instanceof BodyLimitError ? failure("body_too_large", 413) : failure("invalid_input", 400);
    }
  }
  const fetcher = dependencies.fetch ?? fetch;
  if (operation !== "voice/end") {
    // Probe with the read-only token. Direct POSTs cannot skip the provider model and close-control checks.
    const grant = await authorizeVoice(dependencies, "voice-readiness", input?.scopeId);
    if (grant.error) return grant.error;
    const result = await fetchCoreVoice(fetcher, grant.token, grant.scopeId, "/v1/media/readiness");
    if (result.error) return result.error;
    const metadata = readModelMetadata(result.body);
    if (!metadata) return failure("voice_not_ready", 503, grant.scopeId);
    if (operation === "readiness") return json({ scopeId: grant.scopeId, ...metadata });
    if (!metadata.canStartVoice) return failure("voice_not_ready", 503, grant.scopeId);
  }

  if (!input) return failure("invalid_input", 400);
  // Recheck the exact membership and finite grant after the network preflight. Closing needs no provider-model read.
  const grant = await authorizeVoice(dependencies, operation === "voice/start" ? "voice-start" : "voice-end", input.scopeId);
  if (grant.error) return grant.error;
  const result = "sdp" in input
    ? await fetchCoreVoice(fetcher, grant.token, grant.scopeId, "/v1/media/webrtc", { sdp: input.sdp, requestKey: input.requestKey })
    : await fetchCoreVoice(fetcher, grant.token, grant.scopeId, `/v1/media/sessions/${input.missionId}/close`, {});
  if (result.error) return result.error;
  return presentSessionResult(operation, result.body, grant.scopeId, input);
}
