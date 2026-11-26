import type { AuthConfiguration } from "./config";
import type { ManagedSessionCookie } from "./http";
import { clearChallengeCookies, SESSION_COOKIE } from "./http.ts";
import { createManagedAuthProvider, isRecord } from "./provider.ts";

export type RegistrationResult =
  | { ok: true; status: 200 | 202; outcome: "signed_in" | "follow_up"; cookies: ManagedSessionCookie[] }
  | { ok: false; status: number; code: string; cookies: ManagedSessionCookie[] };

const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128;
const normalizedEmail = (value: unknown): string | null => typeof value === "string" ? value.trim().toLowerCase() : null;
const failure = (status: number, code: string): RegistrationResult => ({ ok: false, status, code, cookies: [] });

function sessionUser(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.session)) return null;
  const { user, session } = value;
  const expiresAt = typeof session.expiresAt === "string" ? Date.parse(session.expiresAt) : NaN;
  if (!id(user.id) || !id(session.id) || session.userId !== user.id || user.banned === true ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return user;
}

/**
 * Managed signup only: no auth-table writes, account linking, workspace or Core grants.
 * Contract: this branch's /open-api/generate-schema, read 2026-11-26.
 * Password defaults and synthetic-response semantics:
 * https://better-auth.com/docs/authentication/email-password
 */
export async function registerEmailAccount(
  config: AuthConfiguration, incomingCookies: string | null, data: unknown,
  fetcher: typeof fetch = fetch,
): Promise<RegistrationResult> {
  if (!isRecord(data) || Object.keys(data).length !== 3 ||
    !Object.keys(data).every((key) => ["name", "email", "password"].includes(key)) ||
    typeof data.name !== "string" || !data.name.trim() || data.name.length > 80 ||
    /[\p{Cc}\p{Cf}]/u.test(data.name) || typeof data.email !== "string" || data.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()) || /[\p{Cc}\p{Cf}]/u.test(data.email) ||
    typeof data.password !== "string" || data.password.length < 8 || data.password.length > 128) {
    return failure(400, "INVALID_REGISTRATION_INPUT");
  }
  const email = data.email.trim().toLowerCase();
  if (email.length > 320) return failure(400, "INVALID_REGISTRATION_INPUT");

  // Creating another account must not silently replace an existing live session.
  const current = createManagedAuthProvider(config, incomingCookies, fetcher);
  const mentionsSessionCookie = incomingCookies?.split(";").some((part) => part.trim().split("=", 1)[0] === SESSION_COOKIE);
  if (mentionsSessionCookie && !current.hasSessionCookie()) return failure(400, "SIGN_UP_SESSION_UNVERIFIED");
  if (current.hasSessionCookie()) {
    const existing = await current.getSession();
    if (existing.error && existing.error.status !== 401) return failure(503, "SIGN_UP_SESSION_UNVERIFIED");
    if (!existing.error && existing.data !== null) {
      return sessionUser(existing.data) ? failure(409, "ALREADY_SIGNED_IN") : failure(503, "SIGN_UP_SESSION_UNVERIFIED");
    }
  }

  // A confirmed expired/absent old session is never forwarded into registration.
  const provider = createManagedAuthProvider(config, null, fetcher);
  const created = await provider.signUpEmail(data.name.trim(), email, data.password);
  if (created.error) {
    if (created.error.status === 429) return failure(429, "TOO_MANY_ATTEMPTS");
    if (created.error.status === 403) return failure(403, "SIGN_UP_NOT_ALLOWED");
    if (created.error.status >= 400 && created.error.status < 500) return failure(422, "SIGN_UP_NOT_COMPLETED");
    // The write might have completed before a timeout or unreadable response.
    return failure(503, "SIGN_UP_UNVERIFIED");
  }
  if (!isRecord(created.data) || !isRecord(created.data.user) || !id(created.data.user.id) ||
    normalizedEmail(created.data.user.email) !== email || created.data.user.banned === true) {
    return failure(503, "SIGN_UP_UNVERIFIED");
  }

  const issuedCookie = provider.changedCookies().some((cookie) => cookie.name === SESSION_COOKIE && cookie.value);
  if (!issuedCookie) {
    // Verification/auto-sign-in policy can deliberately return a synthetic user.
    // Neither a user-shaped response nor a body token proves a new account/session.
    return { ok: true, status: 202, outcome: "follow_up", cookies: [] };
  }
  if (!provider.hasSessionCookie()) return failure(503, "SIGN_UP_UNVERIFIED");
  const verified = await provider.getSession();
  const user = verified.error ? null : sessionUser(verified.data);
  if (!user || user.id !== created.data.user.id || normalizedEmail(user.email) !== email || !provider.hasSessionCookie()) {
    return failure(503, "SIGN_UP_UNVERIFIED");
  }
  return {
    ok: true, status: 200, outcome: "signed_in",
    cookies: [...provider.changedCookies().filter((cookie) => cookie.name === SESSION_COOKIE), ...clearChallengeCookies()],
  };
}
