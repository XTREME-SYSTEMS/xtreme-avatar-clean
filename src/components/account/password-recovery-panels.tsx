"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { validResetToken } from "@/lib/auth/password-recovery";
import styles from "./account-panel.module.css";

type RecoveryState = "idle" | "sending" | "sent" | "unavailable" | "rate_limited";
type ResetState = "waiting" | "ready" | "submitting" | "done" | "invalid" | "unavailable" | "rate_limited";

export function ForgotPasswordPanel() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<RecoveryState>("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const response = await fetch("/api/auth/password/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", cache: "no-store", body: JSON.stringify({ email: email.trim() }),
      });
      const result = await response.json() as { ok?: boolean };
      setState(response.ok && result.ok ? "sent" : response.status === 429 ? "rate_limited" : "unavailable");
    } catch { setState("unavailable"); }
  }
  return <div className={styles.account}>
    <header className={styles.heading}><span className={styles.eyebrow}>XTREME AVATAR</span><h1>Forgot password?</h1>
      <p>Enter your Xtreme Avatar account email. We will send a reset link if that account can receive password recovery emails.</p></header>
    <section className={styles.card}>
      {state === "sent" ? <p role="status" className={styles.notice}>If that email has an eligible account, a password reset link has been requested. Check your inbox and spam folder. Do not share the link.</p> :
        <form className={styles.form} onSubmit={submit}>
          <label>Email address<input name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={320} disabled={state === "sending"} /></label>
          <button className={styles.primary} type="submit" disabled={state === "sending"}>{state === "sending" ? "Requesting…" : "Send reset link"}</button>
        </form>}
      {state === "rate_limited" && <p role="alert" className={styles.error}>Too many requests. Please try again later.</p>}
      {state === "unavailable" && <p role="alert" className={styles.error}>Password recovery is temporarily unavailable. Your existing account has not been changed.</p>}
      <p className={styles.hint}>This resets an Xtreme Avatar password, not your Vercel or Google password.</p>
    </section>
    <Link className={styles.homeLink} href="/account">Back to sign in</Link>
  </div>;
}

export function ResetPasswordPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<ResetState>("waiting");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    const url = new URL(window.location.href);
    const values = url.searchParams.getAll("token");
    const receivedError = url.searchParams.has("error");
    // Strip bearer reset tokens from browser history immediately; they are never copied into links.
    window.history.replaceState(window.history.state, "", "/reset-password");
    queueMicrotask(() => {
      if (receivedError || values.length !== 1 || !validResetToken(values[0])) setState("invalid");
      else { setToken(values[0]); setState("ready"); }
    });
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "ready" || !token) return;
    if (password !== confirmation) return;
    setState("submitting");
    try {
      const response = await fetch("/api/auth/password/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", cache: "no-store", body: JSON.stringify({ token, newPassword: password }),
      });
      const result = await response.json() as { ok?: boolean };
      if (response.ok && result.ok) { setToken(null); setPassword(""); setConfirmation(""); setState("done"); }
      else setState(response.status === 429 ? "rate_limited" : response.status === 400 ? "invalid" : "unavailable");
    } catch { setState("unavailable"); }
  }
  return <div className={styles.account}>
    <header className={styles.heading}><span className={styles.eyebrow}>XTREME AVATAR</span><h1>Reset password</h1><p>Create a new password for your existing app account.</p></header>
    <section className={styles.card}>
      {state === "waiting" && <p role="status">Checking reset link…</p>}
      {state === "done" && <p role="status" className={styles.notice}>Password reset confirmed. Return to sign in with your new password.</p>}
      {state === "invalid" && <p role="alert" className={styles.error}>This reset link is invalid, expired, or already used. Request a new link.</p>}
      {state === "unavailable" && <p role="alert" className={styles.error}>Password recovery is temporarily unavailable. Please request another link if needed.</p>}
      {state === "rate_limited" && <p role="alert" className={styles.error}>Too many attempts. Please request a new link later.</p>}
      {(state === "ready" || state === "submitting") && <form className={styles.form} onSubmit={submit}>
        <label>New password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={state === "submitting"} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={state === "submitting"} /></label>
        {confirmation && password !== confirmation && <p role="alert" className={styles.error}>Passwords do not match.</p>}
        <button type="submit" className={styles.primary} disabled={state === "submitting" || password !== confirmation}>{state === "submitting" ? "Resetting…" : "Reset password"}</button>
      </form>}
      <Link className={styles.homeLink} href={state === "done" ? "/account" : "/forgot-password"}>{state === "done" ? "Go to sign in" : "Request a new reset link"}</Link>
    </section>
  </div>;
}
