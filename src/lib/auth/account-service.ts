import type { AccountSession, AuthResolution } from "./types";
import type { AuthConfiguration } from "./config";
import { organizationChoices, resolveIdentity } from "./identity.ts";
import { createManagedAuthProvider, isRecord } from "./provider.ts";
import type { ManagedAuthProvider } from "./provider";
import type { ManagedSessionCookie } from "./http";
import { clearChallengeCookies, SESSION_COOKIE } from "./http.ts";

export type AccountReply = { session: AccountSession; cookies: ManagedSessionCookie[]; httpStatus: number };

function publicSession(result: AuthResolution): AccountSession {
  if (result.status === "authenticated") return {
    status: result.status, user: result.user,
    organization: { id: result.identity.organizationId, role: result.identity.role },
  };
  if (result.status === "anonymous") return { status: "anonymous" };
  if (result.status === "membership_required") return { status: result.status, user: result.user };
  return { status: result.status, code: result.code, ...(result.user ? { user: result.user } : {}) };
}

function reply(provider: ManagedAuthProvider, session: AccountSession, httpStatus?: number): AccountReply {
  return {
    session, cookies: provider.changedCookies(),
    httpStatus: httpStatus ?? (session.status === "unavailable" ? 503 : session.status === "access_denied" ? 403 : 200),
  };
}

export async function readAccount(provider: ManagedAuthProvider, issuer: string): Promise<AccountReply> {
  const resolution = await resolveIdentity(provider, issuer);
  const session = publicSession(resolution);
  if (resolution.status === "authenticated" || resolution.status === "membership_required") {
    const organizations = await provider.listOrganizations();
    if (organizations.error?.status === 401) return reply(provider, { status: "anonymous" });
    const choices = organizations.error ? null : organizationChoices(organizations.data);
    if (choices) session.organizations = choices;
    else session.organizationListUnavailable = true;
  }
  return reply(provider, session);
}

/** Scope selection is always authorized by the managed provider for this session. */
export async function selectOrganization(provider: ManagedAuthProvider, issuer: string, organizationId: string): Promise<AccountReply> {
  const current = await resolveIdentity(provider, issuer);
  if (current.status !== "authenticated" && current.status !== "membership_required") {
    return reply(provider, publicSession(current), current.status === "anonymous" ? 401 : undefined);
  }
  const organizations = await provider.listOrganizations();
  if (organizations.error) return reply(provider, { status: "unavailable", code: "MEMBERSHIP_UNAVAILABLE" });
  const choices = organizationChoices(organizations.data);
  if (!choices?.some((item) => item.id === organizationId)) {
    return reply(provider, { status: "access_denied", code: "ORGANIZATION_NOT_ALLOWED" });
  }
  const selected = await provider.setActiveOrganization(organizationId);
  if (selected.error) return reply(provider, {
    status: selected.error.status >= 500 ? "unavailable" : "access_denied",
    code: selected.error.status >= 500 ? "MEMBERSHIP_UNAVAILABLE" : "ORGANIZATION_NOT_ALLOWED",
  });
  const next = await resolveIdentity(provider, issuer);
  if (next.status !== "authenticated") return reply(provider, publicSession(next));
  if (next.identity.organizationId !== organizationId) {
    return reply(provider, { status: "access_denied", code: "ORGANIZATION_SWITCH_UNVERIFIED" });
  }
  return reply(provider, { ...publicSession(next), organizations: choices });
}

export type AuthActionResult = { ok: boolean; status: number; code?: string; cookies: ManagedSessionCookie[] };

export async function performAuthAction(
  config: AuthConfiguration, incomingCookies: string | null, action: "sign-in/email" | "sign-out", data: unknown,
  fetcher: typeof fetch = fetch,
): Promise<AuthActionResult> {
  const provider = createManagedAuthProvider(config, incomingCookies, fetcher);
  if (action === "sign-out") {
    const result = await provider.signOut();
    if (result.error || !isRecord(result.data) || result.data.success !== true) return {
      ok: false, status: result.error?.status === 429 ? 429 : 503, code: "SIGN_OUT_FAILED", cookies: [],
    };
    return { ok: true, status: 200, cookies: [{ name: SESSION_COOKIE, value: "", maxAge: 0, expires: new Date(0) }, ...clearChallengeCookies()] };
  }
  if (!isRecord(data) || typeof data.email !== "string" || typeof data.password !== "string" ||
    data.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()) ||
    data.password.length < 1 || data.password.length > 1024) {
    return { ok: false, status: 400, code: "INVALID_CREDENTIAL_INPUT", cookies: [] };
  }
  const result = await provider.signInEmail(data.email.trim(), data.password);
  if (result.error) {
    const { status } = result.error;
    return {
      ok: false, status: status === 429 ? 429 : status === 401 || status === 400 ? 401 : 503,
      code: status === 429 ? "TOO_MANY_ATTEMPTS" : status === 401 || status === 400 ? "INVALID_CREDENTIALS" : "AUTH_UNAVAILABLE",
      cookies: [],
    };
  }
  // A body token is never accepted as a substitute for a managed HttpOnly cookie.
  if (!provider.changedCookies().some((cookie) => cookie.name === SESSION_COOKIE && cookie.value) || !provider.hasSessionCookie()) {
    return { ok: false, status: 503, code: "SIGN_IN_UNVERIFIED", cookies: [] };
  }
  const verified = await provider.getSession();
  if (verified.error || !isRecord(verified.data) || !isRecord(verified.data.session) || !isRecord(verified.data.user) ||
    typeof verified.data.user.id !== "string" || !verified.data.user.id || verified.data.session.userId !== verified.data.user.id ||
    !isRecord(result.data) || !isRecord(result.data.user) || result.data.user.id !== verified.data.user.id ||
    typeof verified.data.session.expiresAt !== "string" || new Date(verified.data.session.expiresAt).getTime() <= Date.now() ||
    !Number.isFinite(new Date(verified.data.session.expiresAt).getTime())) {
    return { ok: false, status: 503, code: "SIGN_IN_UNVERIFIED", cookies: [] };
  }
  return { ok: true, status: 200, cookies: provider.changedCookies() };
}
