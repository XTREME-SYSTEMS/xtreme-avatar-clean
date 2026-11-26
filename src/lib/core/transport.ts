import { CORE_ORIGIN } from "./authorization.ts";
import { MAX_RESPONSE_BYTES, parseChatHistory, parseChatInput, parseChatTurn, readBoundedJson } from "./contracts.ts";
import type { ChatHistoryTurn, ChatInput, ChatTurn } from "./contracts.ts";

export type CoreError = { kind: "error"; state: "access_denied" | "failed" | "unknown" | "not_connected"; code: string; message: string; httpStatus: number };
export type CoreResult = { kind: "history"; messages: ChatHistoryTurn[] } | { kind: "turn"; turn: ChatTurn } | CoreError;
export type CoreTransportOptions = { token: string; origin: string; fetch?: typeof fetch; timeoutMs?: number };

const error = (state: CoreError["state"], code: string, message: string, httpStatus: number): CoreError => ({ kind: "error", state, code, message, httpStatus });

export async function callCoreChat(options: CoreTransportOptions, input?: ChatInput): Promise<CoreResult> {
  if (options.origin !== CORE_ORIGIN || !options.token || /[\r\n]/.test(options.token)) return error("not_connected", "core_configuration", "Eden's connection needs setup.", 503);
  const normalized = input ? parseChatInput(input) : undefined;
  if (input && !normalized) return error("failed", "invalid_input", "Enter a message between 1 and 5,000 characters.", 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const uncertain = () => error("unknown", "core_outcome_unknown", "The connection ended before the result was confirmed. Check this same request; it will keep its original request key.", 503);
  try {
    const response = await (options.fetch ?? fetch)(`${CORE_ORIGIN}/v1/chat`, {
      method: input ? "POST" : "GET",
      headers: { authorization: `Bearer ${options.token}`, accept: "application/json", ...(input ? { "content-type": "application/json" } : {}) },
      ...(normalized ? { body: JSON.stringify(normalized) } : {}),
      cache: "no-store", redirect: "error", signal: controller.signal,
    });
    if (!response.ok) {
      // Never relay raw upstream error bodies or headers to the browser.
      await response.body?.cancel().catch(() => {});
      if (response.status === 401 || response.status === 403) return error("access_denied", "core_access_denied", "Eden access is not approved for this account and workspace, or its grant has expired.", 403);
      if (response.status === 400 || response.status === 413) return error("failed", "invalid_input", "This message could not be accepted. Check its length and original request key.", response.status);
      if (response.status === 429) return error("failed", "rate_limit", "Please wait before checking this request again.", 429);
      return input ? uncertain() : error("not_connected", "core_unavailable", "Your conversation history is temporarily unavailable.", 503);
    }
    if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel().catch(() => {});
      return input ? uncertain() : error("not_connected", "invalid_core_response", "Eden returned an unreadable history response.", 502);
    }
    const body = await readBoundedJson(response, MAX_RESPONSE_BYTES);
    if (input) {
      const turn = parseChatTurn(body);
      return turn ? { kind: "turn", turn } : uncertain();
    }
    const messages = parseChatHistory(body);
    return messages ? { kind: "history", messages } : error("not_connected", "invalid_core_response", "Eden returned an unreadable history response.", 502);
  } catch {
    return input ? uncertain() : error("not_connected", "core_unavailable", "Your conversation history is temporarily unavailable.", 503);
  } finally { clearTimeout(timer); }
}
