"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReliabilityReceipt } from "../../../scripts/reliability/audit.mjs";
import styles from "./reliability-panel.module.css";

type Reply = { ok: boolean; code?: string; receipt?: ReliabilityReceipt };
const names: Record<string, string> = {
  home: "Website homepage",
  account: "Account and sign-in page",
  dashboard_access: "Anonymous dashboard protection",
  anonymous_session: "Anonymous session privacy",
  settings_boundary: "Protected settings",
  outbound_boundary: "Protected outbound messaging",
  railway_health: "Railway communications health",
  railway_neon: "Live Neon database readiness",
  apex_redirect: "Domain redirect",
};

export function ReliabilityPanel() {
  const [running, setRunning] = useState(false);
  const [receipt, setReceipt] = useState<ReliabilityReceipt | null>(null);
  const [error, setError] = useState("");
  async function audit() {
    if (running) return;
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/system/reliability", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const reply = await response.json() as Reply;
      if (!response.ok || reply.ok !== true || !reply.receipt) {
        setReceipt(null);
        setError(reply.code === "SIGN_IN_REQUIRED" || reply.code === "ADMIN_ACCESS_REQUIRED" || reply.code === "WORKSPACE_ACCESS_DENIED"
          ? "You need an owner or administrator session in an authorized workspace to run this audit."
          : "The audit service is unavailable. No repair has been attempted.");
        return;
      }
      setReceipt(reply.receipt);
    } catch {
      setReceipt(null);
      setError("Could not complete the read-only audit. No repair has been attempted.");
    } finally {
      setRunning(false);
    }
  }
  return <div className={styles.screen + " phone-screen"}>
    <Link href="/settings" className={styles.back}>More / Settings</Link>
    <header className={styles.header}>
      <span className={styles.eyebrow}>XTREME AVATAR / RELIABILITY</span>
      <h1>System Health &amp; Autonomy</h1>
      <p>Inspect the running application, its security boundaries, and communications health without changing a service.</p>
    </header>
    <section className={styles.panel}>
      <div className={styles.row}>
        <div><h2>Live health audit</h2><p>Nine public checks with bounded retries, timeout handling, and machine-readable receipts.</p></div>
        <span className={styles.pill}>Read-only</span>
      </div>
      <button className={styles.action} type="button" onClick={() => void audit()} disabled={running}>
        {running ? "Running checks…" : "Run health audit"}
      </button>
      <p className={styles.fine}>This tests anonymous public routes. It does not send SMS, WhatsApp, emails, or provider mutations.</p>
      {error && <div role="alert" className={styles.error}>{error} <Link href="/account">Check account</Link></div>}
      {receipt && <>
        <div className={styles.summary} role="status" aria-live="polite">
          <span className={receipt.summary.fail || receipt.summary.unknown ? styles.warning : styles.healthy}>
            {receipt.summary.pass} / {receipt.summary.total} passing
          </span>
          <span>{receipt.summary.fail} failed · {receipt.summary.unknown} unknown</span>
        </div>
        <p className={styles.fine}>Observed {new Date(receipt.observedAt).toLocaleString()} · Incident fingerprint {receipt.fingerprint}</p>
        <div className={styles.results}>
          {receipt.probes.map(check => <div className={styles.check} key={check.id}>
            <div><strong>{names[check.id] || check.id}</strong><small>{check.area} · HTTP {check.httpStatus ?? "unavailable"} · {check.durationMs} ms</small></div>
            <span className={check.result === "PASS" ? styles.good : check.result === "UNKNOWN" ? styles.unknown : styles.bad}>
              {check.result}
            </span>
          </div>)}
        </div>
        <div className={styles.outcome}>
          <strong>{receipt.remediation.status === "healthy" ? "No repair required" : "Further investigation required"}</strong>
          <p>Suggested next action: {receipt.remediation.next.replace(/_/g, " ")}.</p>
          <p>Changes performed by this audit: {receipt.mutationCount}. Guardian certification: {receipt.guardianCertified ? "verified" : "not certified"}.</p>
        </div>
      </>}
    </section>
    <section className={styles.panel}>
      <h2>Continuous reliability</h2>
      <p>Hourly monitoring was scheduled through your ChatGPT reliability task. It is separate from the on-demand check above. Its execution, repair decisions, and notifications need their own receipts.</p>
      <p>The existing EVE Foreman still needs a verified target-aware GitHub connection before it can repair Xtreme Avatar code automatically.</p>
      <div className={styles.links}>
        <a href="https://github.com/XTREME-SYSTEMS/xtreme-avatar-clean/pull/6" target="_blank" rel="noopener noreferrer">Reliability draft PR</a>
        <a href="https://github.com/XTREME-SYSTEMS/xtreme-avatar-clean/issues/7" target="_blank" rel="noopener noreferrer">Foreman connection tracker</a>
      </div>
    </section>
    <section className={styles.panel}>
      <h2>System controls</h2>
      <p>Use the existing authorized provider settings for communication preferences, contact consent, and workspace connections. This page does not create additional admin credentials or orchestration services.</p>
      <div className={styles.links}>
        <Link href="/settings/communications">Communications settings</Link>
        <Link href="/connections">Connected accounts</Link>
        <Link href="/dashboard">Dashboard</Link>
      </div>
    </section>
  </div>;
}
