import type { AuthConfiguration } from "./config";
import { createManagedAuthProvider, isRecord } from "./provider.ts";
import type { ManagedAuthProvider } from "./provider";
import { issueGoogleLinkState, matchesGoogleLinkPrincipal, readGoogleLinkKey, readGoogleLinkState } from "./google-link-state.ts";
import type { LinkPrincipal } from "./google-link-state";

type Failure = { ok: false; status: number; code: string };
type PrincipalResult = Failure | { ok: true; principal: LinkPrincipal };
export type GoogleConnectionStatus = {
  state: "linked" | "unlinked" | "signed_out" | "unavailable";
  linkAvailable: boolean; code?: string;
};
type Environment = Record<string, string | undefined>;
const fail = (status: number, code: string): Failure => ({ ok: false, status, code });
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f\u007f]/.test(value);
const date = (value: unknown): number => typeof value === "string" ? Date.parse(value) : NaN;
const same = (a: LinkPrincipal, b: LinkPrincipal) => a.userId === b.userId && a.sessionId === b.sessionId;

async function principal(provider: ManagedAuthProvider): Promise<PrincipalResult> {
  if (!provider.hasSessionCookie()) return fail(401, "GOOGLE_LINK_SIGN_IN_REQUIRED");
  const result = await provider.getSession();
  if (result.error?.status === 401 || (!result.error && result.data === null)) return fail(401, "GOOGLE_LINK_SIGN_IN_REQUIRED");
  if (result.error) return fail(503, "GOOGLE_LINK_SESSION_UNVERIFIED");
  if (!isRecord(result.data) || !isRecord(result.data.user) || !isRecord(result.data.session)) return fail(503, "GOOGLE_LINK_SESSION_UNVERIFIED");
  const { user, session } = result.data;
  const expiresAt = date(session.expiresAt);
  if (!id(user.id) || !id(session.id) || session.userId !== user.id ||
    typeof user.email !== "string" || user.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
    typeof user.emailVerified !== "boolean" || (user.banned !== undefined && user.banned !== false) ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return fail(403, "GOOGLE_LINK_SESSION_UNVERIFIED");
  return { ok: true, principal: { userId: user.id, sessionId: session.id, expiresAt } };
}

/** The live managed schema requires userId, accountId, dates and scopes on every row. */
function googleLinked(data: unknown, userId: string): boolean | null {
  if (!Array.isArray(data) || data.length > 100) return null;
  const ids = new Set<string>(); const accounts = new Set<string>(); let google = 0;
  for (const item of data) {
    if (!isRecord(item) || !id(item.id) || !id(item.accountId) || item.userId !== userId ||
      typeof item.providerId !== "string" || !/^[a-z0-9_-]{1,80}$/.test(item.providerId) ||
      !Number.isFinite(date(item.createdAt)) || !Number.isFinite(date(item.updatedAt)) ||
      !Array.isArray(item.scopes) || item.scopes.length > 128 || item.scopes.some((scope) => typeof scope !== "string" || scope.length > 512)) return null;
    const key = `${item.providerId}:${item.accountId}`;
    if (ids.has(item.id) || accounts.has(key)) return null;
    ids.add(item.id); accounts.add(key);
    if (item.providerId === "google" && ++google > 1) return null;
  }
  return google === 1;
}

async function readConnection(provider: ManagedAuthProvider, original: LinkPrincipal): Promise<Failure | { ok: true; linked: boolean; principal: LinkPrincipal }> {
  const accounts = await provider.listAccounts();
  const linked = accounts.error ? null : googleLinked(accounts.data, original.userId);
  if (linked === null) return fail(503, "GOOGLE_LINK_STATUS_UNVERIFIED");
  const after = await principal(provider);
  if (!after.ok || !same(after.principal, original)) return fail(403, "GOOGLE_LINK_SESSION_CHANGED");
  return { ok: true, linked, principal: after.principal };
}

/** No provider cookie is adopted or exposed by any operation in this module. */
export async function readGoogleConnection(
  config: AuthConfiguration, cookies: string | null, env: Environment = process.env, fetcher: typeof fetch = fetch,
): Promise<{ status: number; data: GoogleConnectionStatus }> {
  const provider = createManagedAuthProvider(config, cookies, fetcher, { pinSessionCookie: true });
  const current = await principal(provider);
  if (!current.ok) return {
    status: current.status, data: { state: current.status === 401 ? "signed_out" : "unavailable", linkAvailable: false, code: current.code },
  };
  const result = await readConnection(provider, current.principal);
  if (!result.ok) return { status: result.status, data: { state: "unavailable", linkAvailable: false, code: result.code } };
  const configured = readGoogleLinkKey(env) !== null;
  return { status: 200, data: {
    state: result.linked ? "linked" : "unlinked", linkAvailable: configured && !result.linked,
    ...(!configured && !result.linked ? { code: "GOOGLE_LINK_NOT_CONFIGURED" } : {}),
  } };
}

export async function beginGoogleLink(
  config: AuthConfiguration, cookies: string | null, body: unknown, env: Environment = process.env, fetcher: typeof fetch = fetch,
): Promise<Failure | { ok: true; alreadyLinked: true } | { ok: true; alreadyLinked: false; url: string; marker: string }> {
  if (!isRecord(body) || Object.keys(body).length !== 0) return fail(400, "GOOGLE_LINK_INVALID_INPUT");
  const key = readGoogleLinkKey(env);
  if (!key) return fail(503, "GOOGLE_LINK_NOT_CONFIGURED");
  const provider = createManagedAuthProvider(config, cookies, fetcher, { pinSessionCookie: true });
  const current = await principal(provider);
  if (!current.ok) return current;
  const connection = await readConnection(provider, current.principal);
  if (!connection.ok) return connection;
  if (connection.linked) return { ok: true, alreadyLinked: true };
  const marker = issueGoogleLinkState(key, config, connection.principal);
  if (marker.state.exp <= marker.state.iat) return fail(403, "GOOGLE_LINK_SESSION_UNVERIFIED");
  const result = await provider.linkGoogle(marker.state.attempt);
  if (result.error || !isRecord(result.data) || result.data.redirect !== false || typeof result.data.url !== "string" || result.data.url.length > 8192) {
    return fail(result.error?.status === 429 ? 429 : 503, "GOOGLE_LINK_START_UNVERIFIED");
  }
  try {
    const url = new URL(result.data.url);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return fail(503, "GOOGLE_LINK_START_UNVERIFIED");
    return { ok: true, alreadyLinked: false, url: url.toString(), marker: marker.cookie };
  } catch { return fail(503, "GOOGLE_LINK_START_UNVERIFIED"); }
}

/**
 * Read-only completion: linking already occurs in the managed provider callback.
 * Its OAuth state/PKCE and live-session/conflict policy remain authoritative.
 * An app marker provides correlation, not rollback or a provider mutation guard.
 * Never exchange an optional sign-in verifier or replace the original session.
 * Leave the marker to expire: a delayed response must not delete a newer attempt.
 */
export async function completeGoogleLink(
  config: AuthConfiguration, url: URL, cookies: string | null, env: Environment = process.env, fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; code?: string }> {
  const reject = (code: string) => ({ ok: false, code });
  if (url.origin !== config.appOrigin || url.pathname !== "/auth/callback/google/link" || url.href.length > 8192) return reject("GOOGLE_LINK_CALLBACK_INVALID");
  const key = readGoogleLinkKey(env);
  if (!key) return reject("GOOGLE_LINK_NOT_CONFIGURED");
  const state = readGoogleLinkState(cookies, key, config);
  const attempts = url.searchParams.getAll("attempt");
  if (!state || attempts.length !== 1 || attempts[0] !== state.attempt) return reject("GOOGLE_LINK_ATTEMPT_INVALID");
  const errors = url.searchParams.getAll("error");
  const verifiers = url.searchParams.getAll("neon_auth_session_verifier");
  if (errors.length > 1 || verifiers.length > 1 || (errors.length && verifiers.length)) return reject("GOOGLE_LINK_CALLBACK_INVALID");
  if (errors.length) return reject(errors[0] === "access_denied" ? "GOOGLE_LINK_DECLINED" : "GOOGLE_LINK_PROVIDER_REJECTED");
  const provider = createManagedAuthProvider(config, cookies, fetcher, { pinSessionCookie: true });
  const current = await principal(provider);
  if (!current.ok || !matchesGoogleLinkPrincipal(state, key, config, current.principal)) return reject("GOOGLE_LINK_SESSION_CHANGED");
  const connection = await readConnection(provider, current.principal);
  if (!connection.ok || !matchesGoogleLinkPrincipal(state, key, config, connection.principal)) return reject("GOOGLE_LINK_STATUS_UNVERIFIED");
  return connection.linked ? { ok: true } : reject("GOOGLE_LINK_NOT_CONFIRMED");
}
