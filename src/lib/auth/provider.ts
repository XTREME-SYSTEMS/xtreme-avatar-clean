import type { AuthConfiguration } from "./config";
import { challengeCookieFromHeader, managedCookieFromSetCookie, SESSION_COOKIE, sessionCookieFromHeader } from "./http.ts";
import type { ManagedSessionCookie } from "./http";

/**
 * Narrow HTTP adapter to the existing hosted identity service. There is no local
 * auth server, JWT minting, database adapter, or signed session cache.
 * Contract verified against this branch's /open-api/generate-schema on 2026-11-26.
 * https://neon.com/docs/auth/guides/plugins
 * https://neon.com/docs/auth/guides/plugins/organization
 * Cookie protocol: published @neon/auth 0.8.2 src/server/constants.ts and cookies.ts.
 * Revocation: https://www.better-auth.com/docs/concepts/session-management
 */
export type ProviderResult = { data: unknown; error: null | { status: number; code: string } };
type Endpoint = "get-session" | "sign-in/email" | "sign-in/social" | "sign-out" |
  "organization/list" | "organization/get-active-member" | "organization/set-active" | "organization/create";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createManagedAuthProvider(
  config: AuthConfiguration,
  incomingCookies: string | null,
  fetcher: typeof fetch = fetch,
) {
  let sessionCookie = sessionCookieFromHeader(incomingCookies);
  const challengeCookie = challengeCookieFromHeader(incomingCookies);
  const changedCookies = new Map<string, ManagedSessionCookie>();

  async function request(endpoint: Endpoint, method: "GET" | "POST", body?: unknown, verifier?: string): Promise<ProviderResult> {
    const url = new URL(`${config.baseUrl}/${endpoint}`);
    // No locally signed cache is accepted. Every authorization observes revocation.
    if (endpoint === "get-session") url.searchParams.set("disableCookieCache", "true");
    if (verifier) url.searchParams.set("neon_auth_session_verifier", verifier);
    const headers = new Headers({ Accept: "application/json", Origin: config.appOrigin, "x-neon-auth-middleware": "true" });
    const forwardedCookies = [sessionCookie, verifier ? challengeCookie : null].filter(Boolean).join("; ");
    if (forwardedCookies) headers.set("Cookie", forwardedCookies);
    if (method === "POST") headers.set("Content-Type", "application/json");
    try {
      const response = await fetcher(url, {
        method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        await response.body?.cancel();
        return { data: null, error: { status: 502, code: "AUTH_RESPONSE_INVALID" } };
      }
      const reader = response.body?.getReader();
      if (!reader) return { data: null, error: { status: 502, code: "AUTH_RESPONSE_INVALID" } };
      const decoder = new TextDecoder();
      let bytes = 0;
      let text = "";
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 65_536) {
            await reader.cancel();
            return { data: null, error: { status: 502, code: "AUTH_RESPONSE_INVALID" } };
          }
          text += decoder.decode(part.value, { stream: true });
        }
      } finally { reader.releaseLock(); }
      const data: unknown = JSON.parse(text + decoder.decode());
      if (!response.ok) {
        const code = isRecord(data) && typeof data.code === "string" && /^[A-Z0-9_]{1,80}$/.test(data.code)
          ? data.code : "AUTH_REQUEST_FAILED";
        return { data: null, error: { status: response.status, code } };
      }
      for (const value of response.headers.getSetCookie()) {
        const cookie = managedCookieFromSetCookie(value);
        if (!cookie) continue;
        changedCookies.set(cookie.name ?? SESSION_COOKIE, cookie);
        const expired = (cookie.maxAge !== undefined && cookie.maxAge <= 0) || (cookie.expires && cookie.expires.getTime() <= Date.now());
        if (cookie.name === SESSION_COOKIE) sessionCookie = cookie.value && !expired ? `${SESSION_COOKIE}=${cookie.value}` : null;
      }
      return { data, error: null };
    } catch { return { data: null, error: { status: 503, code: "AUTH_UNAVAILABLE" } }; }
  }

  return {
    getSession: () => sessionCookie ? request("get-session", "GET") : Promise.resolve({ data: null, error: null }),
    getActiveMember: () => request("organization/get-active-member", "GET"),
    listOrganizations: () => request("organization/list", "GET"),
    setActiveOrganization: (organizationId: string) => request("organization/set-active", "POST", { organizationId }),
    createOrganization: (name: string, slug: string) => request("organization/create", "POST", { name, slug, keepCurrentActiveOrganization: false }),
    signInEmail: (email: string, password: string) => request("sign-in/email", "POST", { email, password, rememberMe: true }),
    signInGoogle: () => request("sign-in/social", "POST", {
      provider: "google", disableRedirect: true,
      callbackURL: `${config.appOrigin}/auth/callback/google`,
      errorCallbackURL: `${config.appOrigin}/auth/callback/google`,
    }),
    exchangeGoogleVerifier: (verifier: string): Promise<ProviderResult> => challengeCookie
      ? request("get-session", "GET", undefined, verifier)
      : Promise.resolve({ data: null, error: { status: 403, code: "OAUTH_CHALLENGE_MISSING" } }),
    signOut: () => sessionCookie ? request("sign-out", "POST") : Promise.resolve({ data: { success: true }, error: null }),
    hasSessionCookie: () => sessionCookie !== null,
    changedCookies: (): ManagedSessionCookie[] => [...changedCookies.values()],
  };
}

export type ManagedAuthProvider = ReturnType<typeof createManagedAuthProvider>;
