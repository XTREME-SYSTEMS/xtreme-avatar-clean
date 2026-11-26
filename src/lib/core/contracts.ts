export type ChatStatus = "pending" | "completed" | "failed" | "unknown";

export type ChatTurn = {
  id: string;
  status: ChatStatus;
  text: string | null;
  providerResponseId: string | null;
  usage: unknown | null;
  errorCode: string | null;
  createdAt: string;
  profileRevision: number | null;
};

export type ChatHistoryTurn = ChatTurn & { input: string };
export type ChatInput = { text: string; requestKey: string };
export const MAX_REQUEST_BYTES = 16_384;
export const MAX_RESPONSE_BYTES = 262_144;

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseChatInput(value: unknown): ChatInput | null {
  if (!record(value) || Object.keys(value).sort().join(",") !== "requestKey,text") return null;
  if (typeof value.text !== "string" || typeof value.requestKey !== "string") return null;
  const text = value.text.trim();
  if (text.length < 1 || text.length > 5_000 || !/^[a-zA-Z0-9_-]{8,96}$/.test(value.requestKey)) return null;
  const input = { text, requestKey: value.requestKey };
  return new TextEncoder().encode(JSON.stringify(input)).length <= MAX_REQUEST_BYTES ? input : null;
}

const nullableString = (value: unknown, max: number) => value === null || (typeof value === "string" && value.length <= max);

export function parseChatTurn(value: unknown): ChatTurn | null {
  if (!record(value) || typeof value.id !== "string" || !value.id || value.id.length > 128) return null;
  if (!["pending", "completed", "failed", "unknown"].includes(String(value.status))) return null;
  if (!nullableString(value.text, 120_000) || !nullableString(value.providerResponseId, 512) || !nullableString(value.errorCode, 256)) return null;
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return null;
  if (value.profileRevision !== null && (!Number.isSafeInteger(value.profileRevision) || Number(value.profileRevision) < 0)) return null;
  if (!Object.hasOwn(value, "usage")) return null;
  if (value.status === "completed" && typeof value.text !== "string") return null;
  // A pending/uncertain turn must never be shown as a completed answer.
  if (value.status !== "completed" && (value.text !== null || value.providerResponseId !== null || value.usage !== null)) return null;
  return {
    id: value.id,
    status: value.status as ChatStatus,
    text: value.text as string | null,
    providerResponseId: value.providerResponseId as string | null,
    usage: value.usage,
    errorCode: value.errorCode as string | null,
    createdAt: value.createdAt,
    profileRevision: value.profileRevision as number | null,
  };
}

export function parseChatHistory(value: unknown): ChatHistoryTurn[] | null {
  if (!record(value) || !Array.isArray(value.messages) || value.messages.length > 30) return null;
  const messages: ChatHistoryTurn[] = [];
  for (const candidate of value.messages) {
    const turn = parseChatTurn(candidate);
    if (!turn || !record(candidate) || typeof candidate.input !== "string" || candidate.input.length > 5_000) return null;
    messages.push({ ...turn, input: candidate.input });
  }
  return messages;
}

export class BodyLimitError extends Error {}
export class BodyTimeoutError extends Error {}

/** Bound the bytes actually received, including chunked responses without Content-Length. */
export async function readBoundedJson(source: Request | Response, limit: number, timeoutMs = 5_000): Promise<unknown> {
  const advertised = source.headers.get("content-length");
  if (advertised && /^\d+$/.test(advertised) && Number(advertised) > limit) {
    await source.body?.cancel().catch(() => {});
    throw new BodyLimitError("body_too_large");
  }
  if (!source.body) throw new SyntaxError("empty_body");
  const reader = source.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new BodyTimeoutError("body_timeout");
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new BodyLimitError("body_too_large");
      parts.push(value);
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { all.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
}
