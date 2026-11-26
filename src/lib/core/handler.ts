import { createCoreAuthorization, identityScopeId } from "./authorization.ts";
import type { VerifiedNeonIdentity } from "./authorization.ts";
import { BodyLimitError, BodyTimeoutError, MAX_REQUEST_BYTES, parseChatInput, readBoundedJson, record } from "./contracts.ts";
import { callCoreChat } from "./transport.ts";

type IdentityResult =
  | { status: "authenticated"; identity: VerifiedNeonIdentity }
  | { status: "anonymous" | "membership_required" | "access_denied" | "unavailable"; code?: string };
export type CoreRequestDependencies = {
  getIdentity: () => Promise<IdentityResult>;
  env: Record<string, string | undefined>;
  fetch?: typeof fetch;
};
const headers = {
  "cache-control": "private, no-store, max-age=0", pragma: "no-cache", vary: "Cookie",
  "x-content-type-options": "nosniff",
};
function json(body: unknown, status = 200) { return Response.json(body, { status, headers }); }
function failure(state: string, code: string, message: string, httpStatus: number, scopeId?: string) {
  return json({ kind: "error", state, code, message, ...(scopeId ? { scopeId } : {}) }, httpStatus);
}

export function isSameOrigin(request: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  try {
    const configured = new URL(expected);
    return configured.protocol === "https:" && configured.origin === expected
      && request.headers.get("origin") === expected
      && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}

/** A fixed-purpose BFF. The browser never provides an upstream URL, bearer, user or tenant. */
export async function handleChatRequest(request: Request, dependencies: CoreRequestDependencies): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return failure("failed", "method_not_allowed", "This action is not supported.", 405);
  if (request.method === "POST" && !isSameOrigin(request, dependencies.env.AVATAR_APP_ORIGIN)) return failure("access_denied", "invalid_origin", "Open this app's own page before sending a message.", 403);
  if (request.method === "POST" && !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return failure("failed", "invalid_input", "Send a JSON message.", 400);
  let body: Record<string, unknown> | undefined;
  let input;
  if (request.method === "POST") {
    try {
      const received = await readBoundedJson(request, MAX_REQUEST_BYTES);
      if (!record(received) || Object.keys(received).sort().join(",") !== "requestKey,scopeId,text") return failure("failed", "invalid_input", "This message contains unsupported fields.", 400);
      body = received;
      input = parseChatInput({ text: body.text, requestKey: body.requestKey });
      if (!input) return failure("failed", "invalid_input", "Enter a message between 1 and 5,000 characters.", 400);
    } catch (error) {
      if (error instanceof BodyTimeoutError) return failure("failed", "body_timeout", "The message took too long to upload. Please try again.", 408);
      return failure("failed", error instanceof BodyLimitError ? "body_too_large" : "invalid_json", "This message could not be read. Check its size and try again.", error instanceof BodyLimitError ? 413 : 400);
    }
  }
  // Verify AFTER the bounded upload, so a slow body cannot age the identity check.
  let verified: IdentityResult;
  try { verified = await dependencies.getIdentity(); }
  catch { return failure("not_connected", "identity_unavailable", "Your sign-in could not be verified. Please try again.", 503); }
  if (verified.status === "anonymous") return failure("access_denied", "sign_in_required", "Sign in to talk with Eden and recover your conversation.", 401);
  if (verified.status === "membership_required") return failure("access_denied", "workspace_required", "Choose a workspace on your account page first.", 403);
  if (verified.status === "access_denied") return failure("access_denied", "membership_denied", "Your membership does not allow access to this workspace.", 403);
  if (verified.status !== "authenticated") return failure("not_connected", "identity_unavailable", "Your sign-in connection needs setup.", 503);
  const scopeId = identityScopeId(verified.identity);
  // Reject an in-flight draft from a previous account or workspace after a switch.
  if (body && body.scopeId !== scopeId) return failure("access_denied", "workspace_changed", "Your account or workspace changed. Reload your conversation before sending.", 403, scopeId);
  const authorization = createCoreAuthorization(verified.identity, dependencies.env);
  if (authorization.status === "not_connected") return failure("not_connected", authorization.code, "You're signed in. Eden access is still being connected for this workspace.", 503, scopeId);
  if (authorization.status === "access_denied") return failure("access_denied", authorization.code, "Eden access has not been approved for this account and workspace, or its grant has expired.", 403, scopeId);
  const result = await callCoreChat({ ...authorization, fetch: dependencies.fetch }, input);
  if (result.kind === "error") {
    const { httpStatus, ...safeResult } = result;
    return json({ ...safeResult, scopeId }, httpStatus);
  }
  return json({ ...result, scopeId });
}
