"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { AccountSession } from "@/lib/auth/types";
import styles from "./account-panel.module.css";

const SESSION_CHANGE_KEY = "avatar.auth.revision";
const PENDING_CHAT_PREFIX = "avatar.pending-chat.v1.";
type ScreenState = AccountSession | { status: "loading" };

function notifySessionChange(sender: string) {
  window.dispatchEvent(new CustomEvent("avatar:session-change", { detail: { source: "account" } }));
  try { localStorage.setItem(SESSION_CHANGE_KEY, `${Date.now()}:${crypto.randomUUID()}`); } catch { /* Storage may be unavailable. */ }
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("avatar.auth");
    channel.postMessage({ type: "session-change", sender });
    channel.close();
  }
}

function clearPendingChat() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) if (key?.startsWith(PENDING_CHAT_PREFIX)) localStorage.removeItem(key);
  } catch { /* Private browsing can disable local storage. */ }
}

function isAccountSession(value: unknown): value is AccountSession {
  return value !== null && typeof value === "object" && "status" in value &&
    ["authenticated", "anonymous", "membership_required", "access_denied", "unavailable"].includes(String(value.status));
}

function actionError(code: unknown, fallback: string): string {
  if (code === "INVALID_CREDENTIALS") return "That email and password did not match. Please try again.";
  if (code === "INVALID_CREDENTIAL_INPUT") return "Enter your email and password to sign in.";
  if (code === "TOO_MANY_ATTEMPTS") return "There have been too many attempts. Wait a moment before trying again.";
  if (code === "ORIGIN_NOT_ALLOWED" || code === "AUTH_NOT_CONFIGURED" || code === "AUTH_CONFIGURATION_INVALID") {
    return "Sign-in is not ready for this preview yet. Please check again shortly.";
  }
  return fallback;
}

export function AccountPanel({ configured, googleError = false, googleReturn = false }: { configured: boolean; googleError?: boolean; googleReturn?: boolean }) {
  const [session, setSession] = useState<ScreenState>(configured ? { status: "loading" } : { status: "unavailable", code: "AUTH_NOT_CONFIGURED" });
  const [pending, setPending] = useState<"sign-in" | "google" | "sign-out" | "organization" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(googleError ? "Google sign-in could not be completed. Please try again." : "");
  const [organizationId, setOrganizationId] = useState("");
  const generation = useRef(0);
  const refreshController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const authEpoch = useRef(0);
  const tabId = useRef("");

  const refreshSession = useCallback(async () => {
    const current = ++generation.current;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const result: unknown = await response.json();
      if (current !== generation.current) return;
      if (!isAccountSession(result)) throw new Error("Invalid session response");
      setSession(result);
      setOrganizationId(result.organization?.id ?? "");
    } catch {
      if (current === generation.current && !controller.signal.aborted) {
        setSession({ status: "unavailable", code: "AUTH_UNAVAILABLE" });
      }
    }
  }, []);

  useEffect(() => {
    const refreshVersion = generation;
    const refreshRequest = refreshController;
    const actionRequest = actionController;
    tabId.current ||= crypto.randomUUID();
    if (googleError || googleReturn) window.history.replaceState(window.history.state, "", "/account");
    if (googleReturn) notifySessionChange(tabId.current);
    let mounted = true;
    // Cancel the initial fetch if React abandons this mount before its microtask.
    queueMicrotask(() => { if (mounted && configured) void refreshSession(); });
    const invalidateAccount = () => {
      ++authEpoch.current;
      actionController.current?.abort();
      setSession({ status: "loading" }); setOrganizationId(""); setNotice(""); setError(""); setPending(null);
      void refreshSession();
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") invalidateAccount();
    };
    const onStorage = (event: StorageEvent) => { if (event.key === SESSION_CHANGE_KEY) invalidateAccount(); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("avatar.auth") : null;
    if (channel) channel.onmessage = (event: MessageEvent<{ sender?: string }>) => {
      if (event.data?.sender !== tabId.current) invalidateAccount();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      mounted = false;
      ++refreshVersion.current;
      refreshRequest.current?.abort();
      actionRequest.current?.abort();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, [configured, googleError, googleReturn, refreshSession]);

  function startAction(kind: NonNullable<typeof pending>) {
    ++generation.current;
    refreshController.current?.abort();
    const controller = new AbortController();
    actionController.current?.abort();
    actionController.current = controller;
    setPending(kind); setError(""); setNotice("");
    return { epoch: authEpoch.current, controller };
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const { epoch, controller } = startAction("sign-in");
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
        signal: controller.signal,
      });
      const result = await response.json() as { ok?: boolean; code?: string };
      if (epoch !== authEpoch.current) return;
      if (!response.ok || result.ok !== true) {
        setError(actionError(result.code, "We could not finish signing in. Please try again."));
        return;
      }
      form.reset();
      notifySessionChange(tabId.current);
      await refreshSession();
    } catch { if (epoch === authEpoch.current) setError("We could not reach sign-in. Check your connection and try again."); }
    finally { if (epoch === authEpoch.current) setPending(null); }
  }

  async function signInGoogle() {
    if (pending) return;
    const { epoch, controller } = startAction("google");
    try {
      const response = await fetch("/api/auth/sign-in/google", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal,
      });
      const result = await response.json() as { ok?: boolean; url?: string };
      if (epoch !== authEpoch.current) return;
      if (!response.ok || result.ok !== true || !result.url) throw new Error("Google sign-in unavailable");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Invalid sign-in URL");
      window.location.assign(url.toString());
    } catch { if (epoch === authEpoch.current) setError("We could not open Google sign-in. Please try again."); }
    finally { if (epoch === authEpoch.current) setPending(null); }
  }

  async function signOut() {
    if (pending) return;
    const { epoch, controller } = startAction("sign-out");
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal,
      });
      const result = await response.json() as { ok?: boolean; code?: string };
      if (epoch !== authEpoch.current) return;
      if (!response.ok || result.ok !== true) {
        setError("We could not confirm sign-out. Please try again; your session has not been marked signed out.");
        return;
      }
      clearPendingChat();
      setSession({ status: "anonymous" });
      setOrganizationId("");
      setNotice("You are signed out.");
      notifySessionChange(tabId.current);
      await refreshSession();
    } catch { if (epoch === authEpoch.current) setError("We could not reach sign-out. Check your connection and try again."); }
    finally { if (epoch === authEpoch.current) setPending(null); }
  }

  async function switchOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !organizationId) return;
    const { epoch, controller } = startAction("organization");
    try {
      const response = await fetch("/api/session", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "selectOrganization", organizationId }),
        signal: controller.signal,
      });
      const result: unknown = await response.json();
      if (epoch !== authEpoch.current) return;
      if (!response.ok || !isAccountSession(result) || result.status !== "authenticated") {
        setError("We could not open that workspace. Refresh your account and try again.");
        await refreshSession();
        return;
      }
      setSession(result);
      setOrganizationId(result.organization?.id ?? "");
      setNotice("Your workspace is ready.");
      notifySessionChange(tabId.current);
    } catch { if (epoch === authEpoch.current) setError("We could not switch workspaces. Check your connection and try again."); }
    finally { if (epoch === authEpoch.current) setPending(null); }
  }

  const user = "user" in session ? session.user : undefined;
  const organizations = "organizations" in session ? session.organizations : undefined;
  const currentOrganization = "organization" in session ? session.organization : undefined;
  const needsSetup = session.status === "unavailable" && ["AUTH_NOT_CONFIGURED", "AUTH_CONFIGURATION_INVALID", "AUTH_ORIGIN_MISMATCH"].includes(session.code ?? "");

  return <div className={styles.account}>
    <header className={styles.heading}><span className={styles.eyebrow}>XTREME AVATAR</span><h1>Your account</h1><p>Sign in to keep your conversations and work in the right workspace.</p></header>

    {session.status === "loading" && <section className={styles.card} aria-live="polite"><p>Restoring your session…</p></section>}
    {session.status === "unavailable" && <section className={styles.card}>
      <h2>{needsSetup ? "Sign-in is being connected" : "We could not check your session"}</h2>
      <p>{needsSetup ? "Account access is not ready for this preview yet. You can still explore the app." : "Check your connection and try again. Your account details are protected while the service is unavailable."}</p>
      <button className={styles.secondary} type="button" onClick={() => void refreshSession()}>Check again</button>
    </section>}

    {session.status === "anonymous" && <section className={styles.card}>
      <h2>Welcome back</h2><p>Use your Xtreme Avatar account to sign in.</p>
      <button className={`${styles.secondary} ${styles.google}`} type="button" disabled={pending !== null} onClick={() => void signInGoogle()}>{pending === "google" ? "Opening Google…" : "Continue with Google"}</button>
      <div className={styles.divider}><span>or use your email</span></div>
      <form className={styles.form} onSubmit={signIn} aria-busy={pending === "sign-in"}>
        <label htmlFor="account-email">Email address<input id="account-email" name="email" type="email" autoComplete="username" required maxLength={320} disabled={pending !== null} /></label>
        <label htmlFor="account-password">Password<input id="account-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={pending !== null} /></label>
        <button className={styles.primary} type="submit" disabled={pending !== null}>{pending === "sign-in" ? "Signing in…" : "Sign in"}</button>
      </form>
    </section>}

    {user && <section className={styles.card}>
      <div className={styles.profile}><span className={styles.avatar} aria-hidden="true">{user.name.trim().slice(0, 1).toUpperCase() || "A"}</span><div><h2>{user.name}</h2><p className={styles.email}>{user.email}</p></div></div>
      {session.status === "authenticated" && <p className={styles.status}><span aria-hidden="true" />Signed in · {currentOrganization?.role}</p>}
      {session.status === "membership_required" && <p>Choose a workspace to continue. Signing in does not automatically grant workspace access.</p>}
      {session.status === "access_denied" && <p>This account cannot access the selected workspace. Refresh your account or contact the workspace owner.</p>}
    </section>}

    {(session.status === "authenticated" || session.status === "membership_required") && <section className={styles.card}>
      <h2>Your workspace</h2>
      {organizations?.length ? <form className={styles.form} onSubmit={switchOrganization}>
        <label htmlFor="account-workspace">Workspace<select id="account-workspace" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={pending !== null}>
          <option value="" disabled>Choose a workspace</option>
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
        </select></label>
        <button className={styles.secondary} type="submit" disabled={!organizationId || pending !== null || organizationId === currentOrganization?.id}>{pending === "organization" ? "Opening workspace…" : "Use this workspace"}</button>
      </form> : <p>{session.organizationListUnavailable ? "We could not load your workspaces. Refresh your account to try again." : "No workspace is assigned to this account yet. An existing workspace owner can invite you."}</p>}
    </section>}

    <div aria-live="polite" aria-atomic="true">{notice && <p className={styles.notice}>{notice}</p>}</div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {(user || session.status === "access_denied") && <div className={styles.actions}>
      <button type="button" className={styles.secondary} disabled={pending !== null} onClick={() => { setError(""); void refreshSession(); }}>Refresh account</button>
      <button type="button" className={styles.signOut} disabled={pending !== null} onClick={() => void signOut()}>{pending === "sign-out" ? "Signing out…" : "Sign out"}</button>
    </div>}
    <Link className={styles.homeLink} href="/">Back to Home</Link>
  </div>;
}
