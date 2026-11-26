import type { AuthConfiguration } from "./config";
import type { ManagedSessionCookie } from "./http";
import { CHALLENGE_COOKIE, LEGACY_CHALLENGE_COOKIE, SESSION_COOKIE, challengeCookieFromHeader, clearChallengeCookies } from "./http.ts";
import { createManagedAuthProvider, isRecord } from "./provider.ts";

/**
 * Hosted Neon owns Google OAuth state and PKCE. This BFF only relays its opaque
 * challenge and exchanges its one-time verifier through the existing get-session
 * endpoint, as in @neon/auth 0.8.2 src/server/middleware/oauth.ts.
 * https://neon.com/docs/auth/guides/setup-oauth
 * Google login does not grant Google Workspace API scopes.
 */
type GoogleResult = { ok: boolean; code?: string; cookies: ManagedSessionCookie[] };

function activeCookie(cookie: ManagedSessionCookie): boolean {
  return Boolean(cookie.value) && (cookie.maxAge === undefined || cookie.maxAge > 0) &&
    (cookie.expires === undefined || cookie.expires.getTime() > Date.now());
}

function sessionIdentity(data: unknown): { userId: string; sessionId: string } | null {
  if (!isRecord(data) || !isRecord(data.user) || !isRecord(data.session)) return null;
  const { user, session } = data;
  if (typeof user.id !== "string" || !user.id || typeof session.id !== "string" || !session.id || session.userId !== user.id ||
    typeof session.expiresAt !== "string") return null;
  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now() ? { userId: user.id, sessionId: session.id } : null;
}

export async function beginGoogleSignIn(
  config: AuthConfiguration, incomingCookies: string | null, fetcher: typeof fetch = fetch,
): Promise<GoogleResult & { url?: string }> {
  const provider = createManagedAuthProvider(config, incomingCookies, fetcher);
  const result = await provider.signInGoogle();
  if (result.error || !isRecord(result.data) || typeof result.data.url !== "string" || result.data.url.length > 8192) {
    return { ok: false, code: "GOOGLE_SIGN_IN_UNAVAILABLE", cookies: [] };
  }
  const challenges = provider.changedCookies().filter((cookie) =>
    (cookie.name === CHALLENGE_COOKIE || cookie.name === LEGACY_CHALLENGE_COOKIE) && activeCookie(cookie),
  );
  // Managed Neon currently emits both spellings with the same opaque value.
  // Normalize only that trusted-provider compatibility pair to one browser
  // cookie. Conflicting values and ambiguous incoming cookies still fail closed.
  const challenge = challenges.length === 1 ? challenges[0]
    : challenges.length === 2 && challenges[0].value === challenges[1].value
      ? challenges.find((cookie) => cookie.name === CHALLENGE_COOKIE)
      : undefined;
  if (!challenge) return { ok: false, code: "GOOGLE_CHALLENGE_UNVERIFIED", cookies: [] };
  try {
    // The URL comes only from our fixed Neon Google endpoint, never caller input.
    // A shared Google provider may use a Neon relay, so do not invent its hostname.
    const url = new URL(result.data.url);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Invalid OAuth URL");
    return { ok: true, url: url.toString(), cookies: [...clearChallengeCookies(), challenge] };
  } catch { return { ok: false, code: "GOOGLE_REDIRECT_UNVERIFIED", cookies: [] }; }
}

export async function completeGoogleSignIn(
  config: AuthConfiguration, callbackUrl: URL, incomingCookies: string | null, fetcher: typeof fetch = fetch,
): Promise<GoogleResult> {
  const fail = (code: string): GoogleResult => ({ ok: false, code, cookies: clearChallengeCookies() });
  const verifiers = callbackUrl.searchParams.getAll("neon_auth_session_verifier");
  if (callbackUrl.origin !== config.appOrigin || verifiers.length !== 1) return fail("GOOGLE_CALLBACK_INVALID");
  const verifier = verifiers[0];
  // These are defensive app limits; Neon documents the verifier as opaque.
  if (!verifier || new TextEncoder().encode(verifier).byteLength > 4096 || /[\u0000-\u0020\u007f]/.test(verifier) ||
    !challengeCookieFromHeader(incomingCookies)) return fail("GOOGLE_CHALLENGE_MISSING");
  const provider = createManagedAuthProvider(config, incomingCookies, fetcher);
  const exchange = await provider.exchangeGoogleVerifier(verifier);
  const exchangedIdentity = exchange.error ? null : sessionIdentity(exchange.data);
  if (!exchangedIdentity || !provider.changedCookies().some((cookie) => cookie.name === SESSION_COOKIE && activeCookie(cookie))) {
    return fail("GOOGLE_SESSION_UNVERIFIED");
  }
  // Prove the newly returned opaque cookie actually authenticates, without any verifier.
  const fresh = await provider.getSession();
  const freshIdentity = fresh.error ? null : sessionIdentity(fresh.data);
  if (!freshIdentity || freshIdentity.userId !== exchangedIdentity.userId || freshIdentity.sessionId !== exchangedIdentity.sessionId) {
    return fail("GOOGLE_SESSION_UNVERIFIED");
  }
  return {
    ok: true,
    cookies: [...provider.changedCookies().filter((cookie) => cookie.name === SESSION_COOKIE), ...clearChallengeCookies()],
  };
}
