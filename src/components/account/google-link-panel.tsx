"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountSession } from "@/lib/auth/types";
import type { GoogleConnectionStatus } from "@/lib/auth/google-link";
import styles from "./account-panel.module.css";

function linkMessage(code: unknown): string {
  if (code === "GOOGLE_LINK_NOT_CONFIGURED") return "Google linking setup is not complete yet. You can keep using your existing sign-in method.";
  if (code === "GOOGLE_LINK_DECLINED") return "Google linking was not approved. Check the connection status before trying again.";
  if (code === "GOOGLE_LINK_SIGN_IN_REQUIRED" || code === "GOOGLE_LINK_SESSION_CHANGED") return "Your sign-in changed or expired. Sign in again before connecting Google.";
  if (code === "GOOGLE_LINK_ATTEMPT_INVALID") return "This Google linking attempt expired or was replaced. Check the connection status before starting again.";
  return "We could not confirm the Google connection. Check its status before starting another request.";
}

function connectionStatus(value: unknown): value is GoogleConnectionStatus {
  if (!value || typeof value !== "object" || !("state" in value) || !("linkAvailable" in value)) return false;
  return ["linked", "unlinked", "signed_out", "unavailable"].includes(String(value.state)) && typeof value.linkAvailable === "boolean";
}

export function GoogleLinkPanel({ account, busy, returnIssue }: { account: AccountSession; busy: boolean; returnIssue?: string }) {
  const [status, setStatus] = useState<GoogleConnectionStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(returnIssue ? linkMessage(returnIssue) : "");
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setStatus(null);
    try {
      const response = await fetch("/api/account/google", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const value: unknown = await response.json();
      if (current !== generation.current || controller.signal.aborted) return;
      if (!connectionStatus(value)) throw new Error("Invalid connection status");
      setStatus(value);
    } catch {
      if (current === generation.current && !controller.signal.aborted) setStatus({ state: "unavailable", linkAvailable: false });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const activeRequest = request; const activeGeneration = generation;
    const invalidate = () => {
      ++activeGeneration.current; activeRequest.current?.abort();
      setStatus(null); setPending(false); setError("");
    };
    const onStorage = (event: StorageEvent) => { if (event.key === "avatar.auth.revision") invalidate(); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("avatar.auth") : null;
    if (channel) channel.onmessage = invalidate;
    window.addEventListener("storage", onStorage);
    window.addEventListener("avatar:session-change", invalidate);
    // Parent account changes and pending auth actions cancel any stale status or link URL.
    queueMicrotask(() => {
      if (!mounted) return;
      setPending(false);
      if (busy) setStatus(null);
      else void refresh();
    });
    return () => {
      mounted = false; ++activeGeneration.current; activeRequest.current?.abort();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("avatar:session-change", invalidate);
      channel?.close();
    };
  }, [account, busy, refresh]);

  async function connect() {
    if (busy || pending || status?.state !== "unlinked" || !status.linkAvailable) return;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/account/google/link", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal,
      });
      const result = await response.json() as { ok?: boolean; alreadyLinked?: boolean; url?: string; code?: string };
      if (current !== generation.current || controller.signal.aborted) return;
      if (!response.ok || result.ok !== true) {
        setError(linkMessage(result.code)); setStatus({ state: "unavailable", linkAvailable: false }); return;
      }
      if (result.alreadyLinked === true) { setPending(false); await refresh(); return; }
      if (result.alreadyLinked !== false || typeof result.url !== "string") throw new Error("Invalid link response");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Invalid link URL");
      window.location.assign(url.toString());
    } catch {
      if (current === generation.current && !controller.signal.aborted) {
        setError(linkMessage(undefined)); setStatus({ state: "unavailable", linkAvailable: false });
      }
    } finally { if (current === generation.current && !controller.signal.aborted) setPending(false); }
  }

  return <section className={styles.card} aria-busy={pending || !status}>
    <h2>Google sign-in</h2>
    <p>Connect Google to this signed-in account. Access to Gmail, Drive and other Google Workspace services is separate.</p>
    <div aria-live="polite">
      {!status && <p>Checking your Google connection…</p>}
      {status?.state === "linked" && <p className={styles.status}><span aria-hidden="true" />Google connected</p>}
      {status?.state === "unlinked" && <p>{status.linkAvailable ? "Google is not linked to this account yet." : "Google linking setup is not complete yet. You can keep using your existing sign-in method."}</p>}
      {(status?.state === "unavailable" || status?.state === "signed_out") && <p>{linkMessage(status.code)}</p>}
    </div>
    {status?.state === "unlinked" && <button className={styles.primary} type="button" onClick={() => void connect()} disabled={busy || pending || !status.linkAvailable}>{pending ? "Opening Google…" : "Connect Google"}</button>}
    {status && <button className={`${styles.secondary} ${styles.google}`} type="button" disabled={busy || pending} onClick={() => { setError(""); void refresh(); }}>Check Google status</button>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
