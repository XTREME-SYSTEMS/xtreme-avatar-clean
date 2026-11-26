export const SESSION_COOKIE = "__Secure-neon-auth.session_token";
export const CHALLENGE_COOKIE = "__Secure-neon-auth.session_challenge";
export const LEGACY_CHALLENGE_COOKIE = "__Secure-neon-auth.session_challange";
type ManagedCookieName = typeof SESSION_COOKIE | typeof CHALLENGE_COOKIE | typeof LEGACY_CHALLENGE_COOKIE;
const COOKIE_VALUE = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/;

export type ManagedSessionCookie = { name?: ManagedCookieName; value: string; maxAge?: number; expires?: Date };

/** Never forward the app's other cookies, local caches, or duplicate session cookies. */
export function sessionCookieFromHeader(header: string | null): string | null {
  return namedCookieFromHeader(header, SESSION_COOKIE);
}

function namedCookieFromHeader(header: string | null, name: ManagedCookieName): string | null {
  if (!header || header.length > 16_384) return null;
  const matches = header.split(";").map((part) => part.trim()).filter((part) =>
    part.slice(0, part.indexOf("=")) === name,
  );
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return value.length <= 4096 && COOKIE_VALUE.test(value) ? `${name}=${value}` : null;
}

/** Two different challenge names, or duplicate values, are an ambiguous attempt. */
export function challengeCookieFromHeader(header: string | null): string | null {
  if (!header) return null;
  const names = header.split(";").map((part) => part.trim().split("=", 1)[0]);
  if (names.filter((name) => name === CHALLENGE_COOKIE || name === LEGACY_CHALLENGE_COOKIE).length !== 1) return null;
  return namedCookieFromHeader(header, CHALLENGE_COOKIE) ?? namedCookieFromHeader(header, LEGACY_CHALLENGE_COOKIE);
}

/** Only the managed opaque session cookie crosses the proxy; it stays host-only. */
export function managedCookieFromSetCookie(header: string): ManagedSessionCookie | null {
  const [pair, ...attributes] = header.split(";");
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator).trim();
  if (name !== SESSION_COOKIE && name !== CHALLENGE_COOKIE && name !== LEGACY_CHALLENGE_COOKIE) return null;
  const value = pair.slice(separator + 1).trim();
  if (value.length > 4096 || (value && !COOKIE_VALUE.test(value))) return null;
  const result: ManagedSessionCookie = { name, value };
  for (const attribute of attributes) {
    const index = attribute.indexOf("=");
    const name = attribute.slice(0, index).trim().toLowerCase();
    const attributeValue = attribute.slice(index + 1).trim();
    if (name === "max-age" && /^-?\d+$/.test(attributeValue)) {
      const maxAge = Number(attributeValue);
      if (Number.isSafeInteger(maxAge)) result.maxAge = Math.min(maxAge, 60 * 60 * 24 * 30);
    }
    if (name === "expires") {
      const expires = new Date(attributeValue);
      if (Number.isFinite(expires.getTime())) result.expires = expires;
    }
  }
  return result;
}

export function serializeManagedCookie(cookie: ManagedSessionCookie): string {
  let value = `${cookie.name ?? SESSION_COOKIE}=${cookie.value}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  if (cookie.maxAge !== undefined) value += `; Max-Age=${cookie.maxAge}`;
  if (cookie.expires) value += `; Expires=${cookie.expires.toUTCString()}`;
  return value;
}

export function clearChallengeCookies(): ManagedSessionCookie[] {
  return ([CHALLENGE_COOKIE, LEGACY_CHALLENGE_COOKIE] as const).map((name) => ({ name, value: "", maxAge: 0, expires: new Date(0) }));
}

export function isSameOriginMutation(request: Request, appOrigin: string): boolean {
  try {
    return new URL(request.url).origin === appOrigin &&
      request.headers.get("origin") === appOrigin &&
      (!request.headers.has("sec-fetch-site") || request.headers.get("sec-fetch-site") === "same-origin");
  } catch { return false; }
}

export async function readBoundedJson(request: Request, limit = 4096, timeoutMs = 5000): Promise<
  { ok: true; data: unknown } | { ok: false; status: number; code: string }
> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return { ok: false, status: 415, code: "JSON_REQUIRED" };
  }
  if (!request.body) return { ok: false, status: 400, code: "INVALID_REQUEST" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("Request body timeout"));
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return { ok: false, status: 413, code: "REQUEST_TOO_LARGE" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return { ok: true, data: JSON.parse(text + decoder.decode()) as unknown };
  } catch { return { ok: false, status: timedOut ? 408 : 400, code: timedOut ? "REQUEST_TIMEOUT" : "INVALID_REQUEST" }; }
  finally { clearTimeout(timer); reader.releaseLock(); }
}

export function privateJson(data: unknown, status = 200, cookies: ManagedSessionCookie[] = []): Response {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Vary": "Cookie, Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", serializeManagedCookie(cookie));
  return Response.json(data, { status, headers });
}
