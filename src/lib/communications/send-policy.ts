export const messageRequestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function matchesScope(pinned: string | null, current: string) {
  return /^[a-f0-9]{64}$/.test(current) && pinned === current;
}

export function staleCommunicationsAccess(code?: string) {
  return ["WORKSPACE_CHANGED", "WORKSPACE_ACCESS_DENIED", "ADMIN_ACCESS_REQUIRED", "SIGN_IN_REQUIRED"].includes(code ?? "");
}

export function transportResult(status: number, body: unknown, requestId: string) {
  const reply = body && typeof body === "object" ? body as Record<string,unknown> : {};
  if (status === 202 && reply.ok === true && reply.requestId === requestId) {
    return { status: 202, body: { ok: true, status: "accepted", requestId } };
  }
  // Only the transport's known rejections prove it never submitted to Twilio.
  const rejections: Record<string, [number, string]> = {
    UNAUTHORIZED: [401, "SENDING_NOT_CONFIGURED"], INVALID_MESSAGE: [400, "INVALID_MESSAGE"],
    RECIPIENT_CONSENT_NOT_FOUND: [403, "RECIPIENT_NOT_AUTHORIZED"],
    ALREADY_SUBMITTED: [409, "REQUEST_ALREADY_SUBMITTED"],
    WORKSPACE_BUDGET_REACHED: [429, "WORKSPACE_BUDGET_REACHED"],
    MESSAGING_NOT_ENABLED: [503, "PROVIDER_NOT_READY"], SENDER_NOT_VERIFIED: [503, "PROVIDER_NOT_READY"],
  };
  const match = typeof reply.code === "string" && Object.hasOwn(rejections, reply.code) ? rejections[reply.code] : null;
  if (match && match[0] === status && reply.ok === false) {
    return { status: status === 401 ? 503 : status, body: { ok: false, code: match[1], requestId } };
  }
  return { status: 503, body: { ok: false, code: "SEND_OUTCOME_UNKNOWN", requestId } };
}
