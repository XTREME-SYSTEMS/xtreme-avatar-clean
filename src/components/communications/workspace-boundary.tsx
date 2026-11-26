"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { ConsentedNumber, MessagingPreferences } from "@/lib/communications/validation";

export type WorkspaceView = {
  scopeId: string;
  contacts: ConsentedNumber[];
  preferences: MessagingPreferences;
  current: () => boolean;
  invalidate: () => void;
};

export function CommunicationsBoundary({ children }: { children: (view: WorkspaceView) => ReactNode }) {
  const [view, setView] = useState<WorkspaceView | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let generation = 0;
    let stopped = false;
    let controller: AbortController | null = null;
    function refresh(visible: boolean, discardForm: boolean, synchronous = true) {
      const expected = ++generation;
      controller?.abort();
      const clear = () => { setChecking(true); if (discardForm) setView(null); setError(""); };
      if (synchronous) flushSync(clear);
      else clear();
      if (!visible || stopped) return;
      const read = new AbortController();
      controller = read;
      const current = () => !stopped && generation === expected;
      void (async () => {
        try {
          const response = await fetch("/api/settings/communications", { credentials: "same-origin", cache: "no-store", signal: read.signal });
          const data = await response.json();
          if (!current()) return;
          if (!response.ok || !data.ok || typeof data.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(data.scopeId) ||
              !Array.isArray(data.contacts) || !data.preferences) throw new Error("workspace");
          setView({ scopeId: data.scopeId, contacts: data.contacts, preferences: data.preferences, current, invalidate: discard });
          setChecking(false);
        } catch {
          if (current()) { setView(null); setChecking(false); setError("Sign in with an owner or administrator account to open communications."); }
        }
      })();
    }
    const show = () => refresh(!document.hidden, false);
    const discard = () => refresh(!document.hidden, true);
    const hide = () => refresh(false, false);
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === "avatar.auth.revision") discard(); };
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("avatar.auth") : null;
    channel?.addEventListener("message", discard);
    window.addEventListener("avatar:session-change", discard);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", show);
    window.addEventListener("pageshow", show);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", show);
    queueMicrotask(() => { if (!stopped && generation === 0) refresh(!document.hidden, false, false); });
    return () => {
      stopped = true;
      controller?.abort();
      channel?.close();
      window.removeEventListener("avatar:session-change", discard);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", show);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", show);
    };
  }, []);
  if (error) return <p role="alert">{error} <Link href="/account">Open account</Link></p>;
  return <>
    {checking && <p role="status">Checking your authorized workspace…</p>}
    {view && <div key={view.scopeId} hidden={checking} inert={checking}>{children(view)}</div>}
  </>;
}
