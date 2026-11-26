export type PendingRequest = { requestKey: string; text: string; scopeId: string; createdAt: number; turnId?: string };
export const PENDING_PREFIX = "avatar.pending-chat.v1.";
const MAX_AGE = 24 * 60 * 60 * 1_000;

type PendingStorage = Pick<Storage, "getItem" | "removeItem" | "length" | "key">;
function parsePending(raw: string | null, scopeId: string, now: number): PendingRequest | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (typeof value !== "object" || value === null || !("scopeId" in value)) return null;
    const p = value as PendingRequest;
    if (p.scopeId !== scopeId || typeof p.text !== "string" || !p.text.trim() || p.text.length > 5_000 || typeof p.requestKey !== "string" || !/^[a-zA-Z0-9_-]{8,96}$/.test(p.requestKey) || !Number.isFinite(p.createdAt) || now - p.createdAt > MAX_AGE || p.createdAt > now + 60_000 || (p.turnId !== undefined && (typeof p.turnId !== "string" || !p.turnId || p.turnId.length > 128))) return null;
    return p;
  } catch { return null; }
}
export function readPending(storage: PendingStorage, scopeId: string, now = Date.now()): PendingRequest | null {
  try {
    const prefix = `${PENDING_PREFIX}${scopeId}.`;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null && key.startsWith(prefix));
    const requests: PendingRequest[] = [];
    for (const key of keys) {
      const parsed = parsePending(storage.getItem(key), scopeId, now);
      if (parsed && key === prefix + parsed.requestKey) requests.push(parsed);
      else storage.removeItem(key);
    }
    return requests.sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
  } catch { return null; }
}
export function savePending(storage: Pick<Storage, "setItem">, pending: PendingRequest): boolean {
  try { storage.setItem(`${PENDING_PREFIX}${pending.scopeId}.${pending.requestKey}`, JSON.stringify(pending)); return true; } catch { return false; }
}
export function clearPending(storage: Pick<Storage, "removeItem">, scopeId: string, requestKey: string) {
  try { storage.removeItem(`${PENDING_PREFIX}${scopeId}.${requestKey}`); } catch { /* The server still retains accepted turns. */ }
}
