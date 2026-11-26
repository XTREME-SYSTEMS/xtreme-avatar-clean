"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { AccountSession } from "@/lib/auth/types";
import { googleSignInErrorMessage } from "@/lib/auth/google-errors";
import { accountFocusAction, SIGN_UP_UNCERTAIN_MESSAGE } from "@/lib/auth/account-focus";
import { GoogleLinkPanel } from "./google-link-panel";
import styles from "./account-panel.module.css";

const SESSION_CHANGE_KEY = "avatar.auth.revision";
const PENDING_CHAT_PREFIX = "avatar.pending-chat.v1.";
type ScreenState = AccountSession | { status: "loading" };
type PendingAction = "sign-in" | "sign-up" | "google" | "sign-out" | "organization" | "create-organization" | null;

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
  if (code === "INVALID_REGISTRATION_INPUT") return "Enter your name, a valid email address, and a password with 8–128 characters.";
  if (code === "SIGN_UP_NOT_COMPLETED") return "We could not complete account setup. If you already have an account with this email, sign in with your existing password or Google account.";
  if (code === "SIGN_UP_NOT_ALLOWED") return "Account creation is not available right now. You can still sign in to an existing account.";
  if (code === "ALREADY_SIGNED_IN") return "You are already signed in. Sign out before creating another account.";
  if (code === "SIGN_UP_SESSION_UNVERIFIED") return "We could not confirm your current session. Refresh your account before creating another account.";
  if (code === "SIGN_UP_UNVERIFIED") return SIGN_UP_UNCERTAIN_MESSAGE;
  if (code === "TOO_MANY_ATTEMPTS") return "There have been too many attempts. Wait a moment before trying again.";
  if (code === "ORIGIN_NOT_ALLOWED" || code === "AUTH_NOT_CONFIGURED" || code === "AUTH_CONFIGURATION_INVALID") {
    return "Sign-in is not ready for this preview yet. Please check again shortly.";
  }
  return fallback;
}

export function AccountPanel({ configured, googleError = false, googleReturn = false, googleIssue, googleLinkReturn = false, googleLinkIssue }: { configured: boolean; googleError?: boolean; googleReturn?: boolean; googleIssue?: string; googleLinkReturn?: boolean; googleLinkIssue?: string }) {
  const [session, updateSession] = useState<ScreenState>(configured ? { status: "loading" } : { status: "unavailable", code: "AUTH_NOT_CONFIGURED" });
  const sessionRef = useRef<ScreenState>(session);
  const setSession = useCallback((next: ScreenState) => { sessionRef.current = next; updateSession(next); }, []);
  const [pending, updatePending] = useState<PendingAction>(null);
  const pendingRef = useRef<PendingAction>(null);
  const setPending = useCallback((next: PendingAction) => { pendingRef.current = next; updatePending(next); }, []);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(googleError ? googleSignInErrorMessage(googleIssue) : "");
  const [organizationId, setOrganizationId] = useState("");
  const generation = useRef(0);
  const refreshController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const authEpoch = useRef(0);
  const tabId = useRef("");

  const refreshSession = useCallback(async (preserveAnonymousDraft = false) => {
    const current = ++generation.current;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const result: unknown = await response.json();
      if (current !== generation.current) return;
      if (!isAccountSession(result)) throw new Error("Invalid session response");
      if (preserveAnonymousDraft && sessionRef.current.status === "anonymous" && result.status === "unavailable") {
        setError("We could not refresh your session. Your form is still here; check your connection before continuing.");
        return;
      }
      setSession(result);
      setOrganizationId(result.organization?.id ?? "");
    } catch {
      if (current === generation.current && !controller.signal.aborted) {
        if (preserveAnonymousDraft && sessionRef.current.status === "anonymous") {
          setError("We could not refresh your session. Your form is still here; check your connection before continuing.");
        } else setSession({ status: "unavailable", code: "AUTH_UNAVAILABLE" });
      }
    }
  }, [setSession]);

  useEffect(() => {
    const refreshVersion = generation;
    const refreshRequest = refreshController;
    const actionRequest = actionController;
    tabId.current ||= crypto.randomUUID();
    if (googleError || googleReturn || googleLinkReturn) window.history.replaceState(window.history.state, "", "/account");
    if (googleReturn || googleLinkReturn) notifySessionChange(tabId.current);
    let mounted = true;
    // Cancel the initial fetch if React abandons this mount before its microtask.
    queueMicrotask(() => { if (mounted && configured) void refreshSession(); });
    const invalidateAccount = (interruptedSignup = false) => {
      ++authEpoch.current;
      actionController.current?.abort();
      setSession({ status: "loading" }); setOrganizationId(""); setNotice(""); setPending(null);
      setError(interruptedSignup ? SIGN_UP_UNCERTAIN_MESSAGE : "");
      if (!interruptedSignup) setEmail("");
      setAuthMode("sign-in");
      void refreshSession();
    };
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      const action = accountFocusAction(sessionRef.current.status, pendingRef.current);
      if (action === "refresh-draft") void refreshSession(true);
      else invalidateAccount(action === "interrupt-signup");
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
  }, [configured, googleError, googleReturn, googleLinkReturn, refreshSession, setPending, setSession]);

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
      setEmail("");
      notifySessionChange(tabId.current);
      await refreshSession();
    } catch { if (epoch === authEpoch.current) setError("We could not reach sign-in. Check your connection and try again."); }
    finally { if (epoch === authEpoch.current) setPending(null); }
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("password") !== data.get("confirmPassword")) {
      setError("Your passwords do not match. Enter the same password in both fields.");
      return;
    }
    const submittedEmail = String(data.get("email") ?? "").trim();
    const { epoch, controller } = startAction("sign-up");
    try {
      const response = await fetch("/api/auth/sign-up/email", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), email: submittedEmail, password: data.get("password") }),
        signal: controller.signal,
      });
      const result = await response.json() as { ok?: boolean; code?: string; outcome?: string };
      if (epoch !== authEpoch.current || controller.signal.aborted) return;
      if (!response.ok || result.ok !== true) {
        setError(actionError(result.code, "We could not confirm whether account setup finished. Try signing in before creating another account."));
        if (result.code !== "INVALID_REGISTRATION_INPUT" && result.code !== "TOO_MANY_ATTEMPTS") {
          form.reset(); setAuthMode("sign-in"); setEmail(submittedEmail);
          notifySessionChange(tabId.current);
          await refreshSession();
        }
        return;
      }
      if (result.outcome !== "signed_in" && result.outcome !== "follow_up") throw new Error("Unverified account response");
      form.reset(); setAuthMode("sign-in");
      setEmail(result.outcome === "signed_in" ? "" : submittedEmail);
      if (result.outcome === "follow_up") {
        setNotice("You are not signed in yet. Try signing in with this email and password, or follow any verification email you receive.");
      }
      notifySessionChange(tabId.current);
      await refreshSession();
    } catch {
      if (epoch === authEpoch.current && !controller.signal.aborted) {
        form.reset(); setAuthMode("sign-in"); setEmail(submittedEmail);
        setError(SIGN_UP_UNCERTAIN_MESSAGE);
        notifySessionChange(tabId.current);
        await refreshSession();
      }
    } finally { if (epoch === authEpoch.current && !controller.signal.aborted) setPending(null); }
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

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const name = new FormData(form).get("name");
    const { epoch, controller } = startAction("create-organization");
    try {
      const response = await fetch("/api/session", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createOrganization", name }), signal: controller.signal,
      });
      const result: unknown = await response.json();
      if (epoch !== authEpoch.current) return;
      notifySessionChange(tabId.current);
      if (!response.ok || !isAccountSession(result) || result.status !== "authenticated" || !result.workspaceCreation) {
        const code = isAccountSession(result) ? result.code : undefined;
        if (code === "INVALID_WORKSPACE_NAME") setError("Enter a workspace name using 1–80 characters.");
        else if (code === "FIRST_WORKSPACE_ALREADY_EXISTS") setNotice("A workspace is already available. Choose it below.");
        else if (code === "WORKSPACE_CREATE_DENIED") setError("Your account cannot create a workspace. Ask an existing workspace owner to add you.");
        else if (code === "WORKSPACE_RATE_LIMITED") setError("There have been too many attempts. Wait a moment, then refresh your account.");
        else setError("We could not confirm the workspace setup. Refresh your account before trying again.");
        await refreshSession();
        return;
      }
      form.reset();
      setSession(result);
      setOrganizationId(result.organization?.id ?? "");
      setNotice(result.workspaceCreation === "created" ? "Your workspace has been created." : "Your existing workspace is open.");
    } catch {
      if (epoch === authEpoch.current) {
        notifySessionChange(tabId.current);
        setError("We could not confirm whether your workspace was created. Refresh your account before trying again.");
        await refreshSession();
      }
    } finally { if (epoch === authEpoch.current) setPending(null); }
  }

  const user = "user" in session ? session.user : undefined;
  const organizations = "organizations" in session ? session.organizations : undefined;
  const currentOrganization = "organization" in session ? session.organization : undefined;
  const needsSetup = session.status === "unavailable" && ["AUTH_NOT_CONFIGURED", "AUTH_CONFIGURATION_INVALID", "AUTH_ORIGIN_MISMATCH"].includes(session.code ?? "");

  return <div className={styles.account}>
    <header className={styles.heading}><span className={styles.eyebrow}>XTREME AVATAR</span><h1>Your account</h1><p>Sign in or create an account to keep your conversations and work in the right workspace.</p></header>

    {session.status === "loading" && <section className={styles.card} aria-live="polite"><p>Restoring your session…</p></section>}
    {session.status === "unavailable" && <section className={styles.card}>
      <h2>{needsSetup ? "Sign-in is being connected" : "We could not check your session"}</h2>
      <p>{needsSetup ? "Account access is not ready for this preview yet. You can still explore the app." : "Check your connection and try again. Your account details are protected while the service is unavailable."}</p>
      <button className={styles.secondary} type="button" onClick={() => void refreshSession()}>Check again</button>
    </section>}

    {session.status === "anonymous" && <section className={styles.card}>
      <div className={styles.authModes} role="group" aria-label="Account access">
        <button type="button" aria-pressed={authMode === "sign-in"} disabled={pending !== null} onClick={() => { setAuthMode("sign-in"); setNotice(""); setError(""); }}>Sign in</button>
        <button type="button" aria-pressed={authMode === "sign-up"} disabled={pending !== null} onClick={() => { setAuthMode("sign-up"); setNotice(""); setError(""); }}>Create account</button>
      </div>
      <h2>{authMode === "sign-up" ? "Create your account" : "Welcome back"}</h2>
      <p>{authMode === "sign-up" ? "Use your own email and password. You can choose or create a workspace after signing in." : "Use your Xtreme Avatar account to sign in."}</p>
      <button className={`${styles.secondary} ${styles.google}`} type="button" disabled={pending !== null} onClick={() => void signInGoogle()}>{pending === "google" ? "Opening Google…" : "Continue with Google"}</button>
      <div className={styles.divider}><span>or use your email</span></div>
      <form key={authMode} className={styles.form} onSubmit={authMode === "sign-up" ? signUp : signIn} aria-busy={pending === "sign-in" || pending === "sign-up"}>
        {authMode === "sign-up" && <label htmlFor="account-name">Your name<input id="account-name" name="name" type="text" autoComplete="name" required maxLength={80} disabled={pending !== null} /></label>}
        <label htmlFor="account-email">Email address<input id="account-email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} disabled={pending !== null} /></label>
        <label htmlFor="account-password">Password<input id="account-password" name="password" type="password" autoComplete={authMode === "sign-up" ? "new-password" : "current-password"} required minLength={authMode === "sign-up" ? 8 : undefined} maxLength={authMode === "sign-up" ? 128 : 1024} aria-describedby={authMode === "sign-up" ? "account-password-hint" : undefined} disabled={pending !== null} /></label>
        {authMode === "sign-up" && <>
          <p id="account-password-hint" className={styles.hint}>Use 8–128 characters. A longer, unique password helps protect your account.</p>
          <label htmlFor="account-confirm-password">Confirm password<input id="account-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={pending !== null} /></label>
        </>}
        <button className={styles.primary} type="submit" disabled={pending !== null}>{authMode === "sign-up" ? pending === "sign-up" ? "Creating account…" : "Create account" : pending === "sign-in" ? "Signing in…" : "Sign in"}</button>
      </form>
      {authMode === "sign-in" && <Link className={styles.homeLink} href="/forgot-password">Forgot your password?</Link>}
    </section>}

    {googleLinkIssue && session.status === "anonymous" && <p className={styles.error} role="alert">Google linking was not confirmed. Sign in, then check your account’s Google connection status.</p>}

    {user && <section className={styles.card}>
      <div className={styles.profile}><span className={styles.avatar} aria-hidden="true">{user.name.trim().slice(0, 1).toUpperCase() || "A"}</span><div><h2>{user.name}</h2><p className={styles.email}>{user.email}</p></div></div>
      {session.status === "authenticated" && <p className={styles.status}><span aria-hidden="true" />Signed in · {currentOrganization?.role}</p>}
      {session.status === "membership_required" && <p>{organizations?.length === 0 && !session.organizationListUnavailable ? "Create your first workspace or join an existing one to continue." : "Choose a workspace to continue. Signing in does not automatically grant workspace access."}</p>}
      {session.status === "access_denied" && <p>This account cannot access the selected workspace. Refresh your account or contact the workspace owner.</p>}
    </section>}

    {(session.status === "authenticated" || session.status === "membership_required") && <GoogleLinkPanel account={session} busy={pending !== null} returnIssue={googleLinkIssue} />}

    {(session.status === "authenticated" || session.status === "membership_required") && <section className={styles.card}>
      <h2>Your workspace</h2>
      {organizations?.length ? <form className={styles.form} onSubmit={switchOrganization}>
        <label htmlFor="account-workspace">Workspace<select id="account-workspace" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={pending !== null}>
          <option value="" disabled>Choose a workspace</option>
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
        </select></label>
        <button className={styles.secondary} type="submit" disabled={!organizationId || pending !== null || organizationId === currentOrganization?.id}>{pending === "organization" ? "Opening workspace…" : "Use this workspace"}</button>
      </form> : session.status === "membership_required" && organizations?.length === 0 && !session.organizationListUnavailable ? <>
        <p>Give your workspace a name. You will own this new workspace. Your Eden connection will be checked separately.</p>
        <form className={styles.form} onSubmit={createWorkspace} aria-busy={pending === "create-organization"}>
          <label htmlFor="account-workspace-name">Workspace name<input id="account-workspace-name" name="name" type="text" autoComplete="organization" required maxLength={80} placeholder="My workspace" disabled={pending !== null} /></label>
          <button className={styles.primary} type="submit" disabled={pending !== null}>{pending === "create-organization" ? "Creating workspace…" : "Create workspace"}</button>
        </form>
        <p>To join an existing workspace, ask its owner to add you.</p>
      </> : <p>{session.organizationListUnavailable ? "We could not load your workspaces. Refresh your account to try again." : "No workspace is assigned to this account yet. An existing workspace owner can invite you."}</p>}
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
