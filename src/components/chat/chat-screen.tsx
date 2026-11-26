"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseChatHistory, parseChatTurn, record } from "@/lib/core/contracts";
import type { ChatHistoryTurn, ChatTurn } from "@/lib/core/contracts";
import { clearPending, readPending, savePending } from "./pending-request";
import type { PendingRequest } from "./pending-request";
import styles from "./chat-screen.module.css";

type Connection = "loading" | "ready" | "access_denied" | "not_connected";
const stateText = {
  completed: "Completed", pending: "Pending confirmation", failed: "Failed", unknown: "Result not confirmed",
};
function localStorageIfAvailable(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function ChatScreen({ mobile = false, conversationHome = false }: { mobile?: boolean; conversationHome?: boolean } = {}) {
  const [connection, setConnection] = useState<Connection>("loading");
  const [notice, setNotice] = useState("Opening your conversation…");
  const [messages, setMessages] = useState<ChatHistoryTurn[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [scopeId, setScopeId] = useState("");
  const sequence = useRef(0);
  const sending = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const version = ++sequence.current;
    try {
      const response = await fetch("/api/eden/chat", { cache: "no-store", signal: AbortSignal.timeout(35_000) });
      const body: unknown = await response.json();
      if (version !== sequence.current) return;
      if (!record(body)) throw new Error("invalid_response");
      if (body.kind !== "history" || typeof body.scopeId !== "string") {
        setConnection(body.state === "access_denied" ? "access_denied" : "not_connected");
        setNotice(typeof body.message === "string" ? body.message : "Your conversation is temporarily unavailable.");
        return;
      }
      const history = parseChatHistory(body);
      if (!history) throw new Error("invalid_history");
      setScopeId(body.scopeId); setMessages(history); setConnection("ready"); setNotice("");
      const storage = localStorageIfAvailable();
      let saved = storage ? readPending(storage, body.scopeId) : null;
      for (let recovered = 0; recovered < 30 && saved && storage && saved.turnId && history.some(turn => turn.id === saved!.turnId && (turn.status === "completed" || turn.status === "failed")); recovered++) {
        clearPending(storage, body.scopeId, saved.requestKey);
        saved = readPending(storage, body.scopeId);
      }
      if (saved) {
        setPending(saved); setNotice("A message is waiting for confirmation. Check it using its original request key.");
      }
    } catch {
      if (version !== sequence.current) return;
      setConnection("not_connected"); setNotice("Your conversation could not be loaded. Please try again.");
    }
  }, []);

  useEffect(() => {
    const invalidate = () => {
      ++sequence.current; activeRequest.current?.abort();
      // Clear the previous account synchronously in the account/focus event.
      setConnection("loading"); setMessages([]); setPending(null); setScopeId("");
      void load();
    };
    const onFocus = () => invalidate();
    const onAccountChange = () => { setText(""); invalidate(); };
    const onStorage = (event: StorageEvent) => { if (event.key === "avatar.auth.revision" || event.key === null) onAccountChange(); };
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("avatar.auth") : null;
    if (channel) channel.onmessage = onAccountChange;
    let mounted = true;
    // Cancel the initial fetch if React abandons this mount before its microtask.
    queueMicrotask(() => { if (mounted) void load(); });
    window.addEventListener("focus", onFocus);
    window.addEventListener("avatar:session-change", onAccountChange);
    window.addEventListener("storage", onStorage);
    const stop = () => { ++sequence.current; activeRequest.current?.abort(); };
    return () => { mounted = false; stop(); channel?.close(); window.removeEventListener("focus", onFocus); window.removeEventListener("avatar:session-change", onAccountChange); window.removeEventListener("storage", onStorage); };
  }, [load]);

  async function send(original?: PendingRequest) {
    if (sending.current || connection !== "ready" || !scopeId) return;
    const request = original ?? { text: text.trim(), requestKey: crypto.randomUUID(), scopeId, createdAt: Date.now() };
    if (!request.text || request.scopeId !== scopeId) return;
    // Do not send until the original key is durably retained for reload/retry.
    const storage = localStorageIfAvailable();
    if (!storage || !savePending(storage, request)) {
      setNotice("This browser could not save the recovery key. Allow site storage before sending so a lost connection cannot duplicate your request."); return;
    }
    sending.current = true; setBusy(true); setPending(request); setNotice("Waiting for Eden…");
    const version = ++sequence.current;
    const controller = new AbortController(); activeRequest.current = controller;
    try {
      const response = await fetch("/api/eden/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: request.text, requestKey: request.requestKey, scopeId: request.scopeId }),
        cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
      });
      const body: unknown = await response.json();
      if (version !== sequence.current) return;
      if (!record(body)) throw new Error("unconfirmed_response");
      if (body.kind !== "turn") {
        setNotice(typeof body.message === "string" ? body.message : "The result was not confirmed. Check the same request again.");
        if (body.state === "access_denied" || body.state === "not_connected") { setMessages([]); setConnection(body.state); }
        if ([400, 408, 413].includes(response.status) && ["invalid_input", "invalid_json", "body_too_large", "body_timeout"].includes(String(body.code))) {
          clearPending(storage, scopeId, request.requestKey); setPending(readPending(storage, scopeId)); setText(request.text);
        }
        return;
      }
      if (body.scopeId !== scopeId) throw new Error("unconfirmed_response");
      const turn = parseChatTurn(body.turn);
      if (!turn) throw new Error("unconfirmed_response");
      setMessages(current => [...current.filter(item => item.id !== turn.id), { ...turn, input: request.text }].slice(-30));
      setText("");
      if (turn.status === "completed" || turn.status === "failed") {
        clearPending(storage, scopeId, request.requestKey); const next = readPending(storage, scopeId); setPending(next);
        setNotice(next ? "Another message is waiting for confirmation." : turn.status === "completed" ? "" : "Eden could not finish this message. No automatic retry was sent.");
      } else {
        const retained = { ...request, turnId: turn.id }; savePending(storage, retained); setPending(retained);
        setNotice(turn.status === "pending" ? "This message is pending. Checking it will not send a second generation request." : "The result is uncertain. Its original request key has been kept for recovery.");
      }
    } catch {
      if (version === sequence.current) setNotice("The connection ended before the result was confirmed. Your original request key is saved; check this same request again.");
    } finally { if (activeRequest.current === controller) activeRequest.current = null; sending.current = false; setBusy(false); }
  }

  const needsAccount = connection === "access_denied" || connection === "not_connected";
  return <div className={conversationHome ? `${styles.screen} ${styles.conversationHome}` : `${styles.screen} phone-screen`}>
    {!conversationHome && <>
      <Link href={mobile ? "/mobile" : "/"} className={styles.back}>← Home</Link>
      <header className={styles.heading}><div><h1>Chat with Eden</h1><p>Your conversation, together with your workspace.</p></div><Link href="/account" className={styles.account}>Account</Link></header>
      <div className={styles.modeLinks}><span aria-current="page">Chat</span><Link href={mobile ? "/mobile/voice" : "/voice"}>Voice</Link><Link href={mobile ? "/mobile/video" : "/video"}>Video</Link></div>
    </>}
    {notice && !(conversationHome && (needsAccount || connection === "loading")) && <div className={styles.notice} role="status">{notice}</div>}
    {connection === "loading" && <p className={styles.empty}>Checking your sign-in and workspace…</p>}
    {needsAccount && <section className={styles.setup}>
      {conversationHome ? <p role="status">{notice}</p> : <>
        <h2>{connection === "access_denied" ? "Open your account" : "Your Eden connection"}</h2>
        <p>Your conversation will appear after your account and workspace have access.</p>
      </>}
      <div><Link href="/account">{conversationHome ? "Open your account" : "Account & workspace"}</Link><button onClick={() => void load()} type="button">Check again</button></div>
    </section>}
    {connection === "ready" && <>
      <section className={styles.history} aria-label="Conversation history" aria-live="polite">
        {!messages.length && <div className={styles.empty}><h2>What would you like to work on?</h2>{!conversationHome && <p>Send your first message to Eden.</p>}</div>}
        {messages.map(turn => <Turn key={turn.id} turn={turn} />)}
      </section>
      {pending && <section className={styles.recovery} aria-label="Pending message recovery"><p><strong>Message awaiting confirmation</strong></p><p>{pending.text}</p><small>The original message and request key are retained on this device for up to 24 hours. Signing out clears them.</small><button type="button" disabled={busy} onClick={() => void send(pending)}>{busy ? "Checking…" : "Check this request"}</button></section>}
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}>
        <label htmlFor="eden-message">Message Eden</label>
        <textarea id="eden-message" rows={3} maxLength={5_000} value={text} onChange={event => setText(event.target.value)} placeholder="What can we work on together?" disabled={busy || Boolean(pending)} />
        <div><small>{text.length.toLocaleString()} / 5,000</small><button type="submit" disabled={busy || Boolean(pending) || !text.trim()}>{busy ? "Sending…" : "Send"}</button></div>
      </form>
    </>}
  </div>;
}

function Turn({ turn }: { turn: ChatHistoryTurn & ChatTurn }) {
  return <article className={styles.turn}>
    <div className={styles.user}><strong>You</strong><p>{turn.input}</p></div>
    <div className={styles.eden}><div className={styles.turnHeading}><strong>Eden</strong><span>{stateText[turn.status]}</span></div>
      <p>{turn.status === "completed" ? turn.text : turn.status === "failed" ? "This response could not be completed." : turn.status === "pending" ? "Waiting for confirmation." : "The outcome has not been confirmed."}</p>
      {turn.status === "completed" && turn.providerResponseId && <details><summary>Response reference</summary><code>{turn.providerResponseId}</code></details>}
    </div>
  </article>;
}
