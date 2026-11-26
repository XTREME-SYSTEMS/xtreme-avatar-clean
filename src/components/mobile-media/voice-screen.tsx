"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { readVoiceReadiness, VoiceConnection } from "./voice-connection";
import type { VoiceReadiness, VoiceUpdate } from "./voice-connection";
import styles from "./media.module.css";

export function VoiceScreen() {
  const [ready, setReady] = useState<VoiceReadiness | null>(null);
  const [checkNumber, setCheckNumber] = useState(0);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<VoiceUpdate | null>(null);
  const [muted, setMuted] = useState(false);
  const [receipt, setReceipt] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const active = useRef<VoiceConnection | null>(null);
  const currentScope = useRef("");
  const inCall = status?.phase === "opening" || status?.phase === "connected";
  const pending = status?.phase === "pending" || status?.phase === "unconfirmed_start";

  useEffect(() => {
    let mounted = true;
    let sequence = 0;
    function discard() {
      currentScope.current = "";
      const call = active.current;
      active.current = null;
      if (call) void call.stop();
    }
    async function refresh() {
      const version = ++sequence;
      let next: VoiceReadiness | null = null;
      try {
        const response = await fetch("/api/eden/media/readiness", { cache: "no-store", signal: AbortSignal.timeout(20_000) });
        next = readVoiceReadiness(await response.json());
        if (!response.ok && next) next.ready = false;
      } catch { /* Remain unavailable until the authenticated check succeeds. */ }
      if (!mounted || version !== sequence) return;
      if (currentScope.current !== (next?.scopeId ?? "") || (!next?.ready && active.current)) {
        discard();
        setReceipt(""); setStatus(null); setMuted(false);
      }
      currentScope.current = next?.scopeId ?? "";
      setReady(next); setChecking(false);
    }
    function accountChanged() {
      discard(); setReady(null); setReceipt(""); setStatus(null); setMuted(false); setChecking(true); void refresh();
    }
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === "avatar.auth.revision") accountChanged(); };
    const auth = typeof BroadcastChannel === "function" ? new BroadcastChannel("avatar.auth") : null;
    if (auth) auth.onmessage = accountChanged;
    const hide = () => { if (active.current) void active.current.stop(); };
    const show = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("avatar:session-change", accountChanged);
    void refresh();
    return () => {
      mounted = false; discard(); auth?.close();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", storage);
      window.removeEventListener("avatar:session-change", accountChanged);
    };
  }, [checkNumber]);

  function start() {
    if (!ready?.ready || currentScope.current !== ready.scopeId || !audio.current || active.current) return;
    const call = new VoiceConnection(ready.scopeId, audio.current, update => {
      if (active.current !== call) return;
      setStatus(update);
      if (update.receiptId) setReceipt(update.receiptId);
      if (update.phase === "ended" || update.phase === "refused") active.current = null;
    });
    active.current = call; setMuted(false); setReceipt("");
    setStatus({ phase: "opening", message: "Allow microphone access to begin." });
    void call.start();
  }

  return <section className={styles.screen} aria-labelledby="voice-title">
    <Link className={styles.back} href="/mobile">← Eden</Link>
    <div className={styles.stage}><span className={styles.orbit} aria-hidden="true"><i /><i /><i /></span></div>
    <div className={styles.body}>
      <p className={styles.mode}>VOICE</p>
      <h1 id="voice-title">Talk to Eden</h1>
      <p role="status" aria-live="polite">{status?.phase === "connected" && muted ? "Voice session connected. Your microphone is muted." : status?.message ?? (checking ? "Checking your workspace…" : ready?.ready ? `OpenAI voice${ready.voice ? " · " + ready.voice : ""}. Start when you're ready to use the microphone.` : "Voice is waiting for an authorized Core connection in this workspace.")}</p>
      <audio ref={audio} autoPlay controls={status?.phase === "connected"} className={styles.player} aria-label="Eden’s voice" />
      {inCall ? <div className={styles.controls}>
        {status?.phase === "connected" && <button type="button" className={styles.secondary} aria-pressed={muted} onClick={() => { active.current?.setMuted(!muted); setMuted(!muted); }}>{muted ? "Unmute" : "Mute"}</button>}
        <button type="button" className={styles.primary} onClick={() => void active.current?.stop()}>End call</button>
      </div> : pending ? <button type="button" className={styles.secondary} onClick={() => void active.current?.check()}>{status?.phase === "unconfirmed_start" ? "Retry original request and close" : "Check call status"}</button> : ready?.ready ?
        <>
          {!ready.reasoningReady && <small>Voice conversation only</small>}
          <small id="voice-consent">Core saves voice transcripts in your workspace. This call uses your OpenAI voice allowance.</small>
          <button type="button" className={styles.primary} aria-describedby="voice-consent" onClick={start}>Start voice call</button>
        </> :
        <div className={styles.controls}><Link className={styles.primary} href="/account">Open account</Link><button type="button" className={styles.secondary} disabled={checking} onClick={() => { setChecking(true); setCheckNumber(n => n + 1); }}>Check again</button></div>}
      {receipt && <details className={styles.detail}><summary>Session receipt</summary><code>{receipt}</code></details>}
    </div>
  </section>;
}
