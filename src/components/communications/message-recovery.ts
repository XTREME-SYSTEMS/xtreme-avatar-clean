import { messageRequestId } from "../../lib/communications/send-policy.ts";

type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Envelope = { channel: string; to: string; message: string; mediaUrls: string[] };

export async function messageStorageKey(scopeId: string, input: Envelope) {
  const data = JSON.stringify([scopeId, input.channel, input.to, input.message.trim(), input.mediaUrls]);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  return "avatar.outbound.v1." + scopeId + "." + hash;
}

/** The composer calls this inside an exclusive same-origin Web Lock for this fingerprint. */
export function claimMessage(storage: RecoveryStorage, key: string) {
  const prior = storage.getItem(key);
  if (prior !== null) {
    if (!messageRequestId.test(prior)) throw new Error("invalid_recovery_record");
    return { requestId: prior, fresh: false };
  }
  const requestId = crypto.randomUUID();
  storage.setItem(key, requestId);
  if (storage.getItem(key) !== requestId) throw new Error("recovery_storage_unavailable");
  return { requestId, fresh: true };
}

export function releaseMessage(storage: RecoveryStorage, key: string, requestId: string,
  outcome: "confirmed" | "first-rejected" | "retry-rejected") {
  // A rejection of a replay does not resolve the earlier ambiguous submission.
  if (outcome === "retry-rejected") return;
  if (storage.getItem(key) === requestId) storage.removeItem(key);
}

export const settledReceipts = new Set(["accepted", "queued", "sending", "sent", "delivered", "read", "undelivered", "failed", "budget_denied"]);
