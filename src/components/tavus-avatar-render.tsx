"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DailyParticipant } from "@daily-co/daily-js";
import { TavusRenderClient } from "@/lib/tavus/render-client";
import { useVoiceOperator } from "./voice-operator";
import styles from "./tavus-avatar-render.module.css";

type Activity = {
  controller: AbortController;
  client?: TavusRenderClient;
  unsubscribe?: () => void;
  clearDeadline?: () => void;
};

function audible(delta: string) {
  const pcm = atob(delta);
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    const sample = pcm.charCodeAt(offset) | (pcm.charCodeAt(offset + 1) << 8);
    if (Math.abs(sample < 32_768 ? sample : sample - 65_536) >= 256) return true;
  }
  return false;
}

export function TavusAvatarRender({ mediaClassName, portrait }: { mediaClassName?: string; portrait: ReactNode }) {
  const voice = useVoiceOperator();
  const video = useRef<HTMLVideoElement>(null);
  const activity = useRef<Activity | null>(null);
  const [phase, setPhase] = useState<"idle" | "opening" | "rendering" | "closing">("idle");
  const [message, setMessage] = useState("");
  const speechConnected = voice?.phase === "connected";

  useEffect(() => {
    if (!speechConnected) return;
    return () => {
      const running = activity.current;
      activity.current = null;
      running?.controller.abort();
      running?.unsubscribe?.();
      running?.clearDeadline?.();
      void running?.client?.close().catch(() => {});
      setPhase("idle");
      setMessage("");
    };
  }, [speechConnected]);

  async function close(running: Activity, status: string) {
    if (activity.current !== running) return;
    activity.current = null;
    running.controller.abort();
    running.unsubscribe?.();
    running.clearDeadline?.();
    setPhase("closing");
    try {
      await running.client?.close();
      setMessage(status);
    } catch { setMessage("Video is off locally. Tavus did not confirm the room closed."); }
    finally { setPhase("idle"); }
  }

  async function open() {
    const scopeId = voice?.getScope();
    const element = video.current;
    if (!voice || !scopeId || !element || !speechConnected || activity.current) return;
    const running: Activity = { controller: new AbortController() };
    activity.current = running;
    setPhase("opening");
    setMessage("Checking Eden’s rendering room…");
    const signal = running.controller.signal;
    try {
      const check = await fetch("/api/eden/tavus-render", {
        cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      });
      if (!check.ok) throw new Error("renderer_not_ready");
      const readiness = await check.json();
      if (readiness.scopeId !== scopeId || readiness.transport !== "daily-audio-echo") throw new Error("renderer_not_ready");
      const { default: Daily } = await import("@daily-co/daily-js");
      signal.throwIfAborted();
      const call = Daily.createCallObject({ subscribeToTracksAutomatically: false });
      const client = running.client = new TavusRenderClient(scopeId, call, element);
      let joined = false;
      let remote: DailyParticipant | undefined;
      let currentTrack: MediaStreamTrack | undefined;
      const applyVideo = () => {
        if (!joined || !remote || activity.current !== running) return;
        const track = remote.tracks.video.persistentTrack ?? remote.tracks.video.track;
        if (!track || track.readyState !== "live" || track === currentTrack) return;
        client.attachAvatarVideo(remote.session_id, track);
        currentTrack = track;
        setPhase("rendering");
        setMessage("Eden’s video is connected. Speech comes from Gleam.");
      };
      call.on("participant-joined", ({ participant }) => {
        if (participant.local || signal.aborted) return;
        call.updateParticipant(participant.session_id, { setSubscribedTracks: {
          video: true, audio: false, screenAudio: false, screenVideo: false,
        } });
      });
      call.on("participant-updated", ({ participant }) => {
        if (participant.local || signal.aborted) return;
        try { remote = participant; applyVideo(); }
        catch { void close(running, "The avatar video track changed."); }
      });
      call.on("participant-left", ({ participant }) => {
        if (participant?.session_id === remote?.session_id) void close(running, "The avatar video ended.");
      });
      call.on("error", () => void close(running, "The avatar video connection ended."));
      await client.start();
      signal.throwIfAborted();
      joined = true;
      for (const participant of Object.values(call.participants())) {
        if (participant.local) continue;
        remote = participant;
        call.updateParticipant(participant.session_id, { setSubscribedTracks: {
          video: true, audio: false, screenAudio: false, screenVideo: false,
        } });
      }
      applyVideo();
      let trailingAudioAt = 0;
      running.unsubscribe = voice.receiveAudio(pcm => {
        if (signal.aborted || !element.srcObject) return;
        try {
          const now = performance.now();
          if (audible(pcm)) trailingAudioAt = now;
          if (now - trailingAudioAt < 250) client.sendGleamAudio(pcm);
          else client.finishUtterance();
        } catch { void close(running, "The avatar could not keep up with Gleam audio."); }
      });
      const deadline = setTimeout(() => void close(running, "The avatar video time limit ended."), 110_000);
      running.clearDeadline = () => clearTimeout(deadline);
    } catch {
      if (!signal.aborted) await close(running, "Live avatar is not ready in this workspace.");
    }
  }

  return <section className={styles.renderer} aria-label="Eden Skye avatar">
    <div className={`${styles.stage} ${mediaClassName ?? ""}`}>
      {phase !== "rendering" && portrait}
      <video className={styles.video} ref={video} muted autoPlay playsInline
        hidden={phase !== "rendering" || !speechConnected} aria-label="Eden Skye’s live video" />
    </div>
    <div className={styles.controls}>
      <p role="status">{speechConnected ? (message || "Eden’s face follows the active Gleam session.") : "Start Gleam to enable Eden’s live video."}</p>
      {!speechConnected && <button type="button" onClick={() => window.dispatchEvent(new Event("avatar:voice-open"))}>Open Gleam voice</button>}
      {speechConnected && phase === "idle" && <button type="button" onClick={() => void open()}>Start live avatar</button>}
      {speechConnected && (phase === "opening" || phase === "rendering") && <button type="button" onClick={() => {
        const running = activity.current;
        if (running) void close(running, "Avatar video is off.");
      }}>Stop avatar</button>}
      {speechConnected && phase === "idle" && <small>Eden Skye is an AI avatar. Video is metered separately. Only Gleam’s generated speech goes to the renderer.</small>}
    </div>
  </section>;
}
