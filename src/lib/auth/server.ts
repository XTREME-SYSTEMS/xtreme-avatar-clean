import "server-only";
import { headers, cookies } from "next/headers";
import { readAuthConfiguration } from "./config";
import { createManagedAuthProvider } from "./provider";
import { resolveIdentity } from "./identity";
import { SESSION_COOKIE } from "./http";
import type { VerifiedIdentityResult } from "./types";

export type { VerifiedIdentity, VerifiedIdentityResult } from "./types";

/**
 * Core/action boundary: a fresh provider session plus a fresh matching membership.
 * No browser-supplied subject, org, role, cached JWT, or email alias grants access.
 */
export async function getVerifiedIdentity(): Promise<VerifiedIdentityResult> {
  const config = readAuthConfiguration();
  if (!config.configured) return { status: "unavailable", code: config.code };
  try {
    const incoming = await headers();
    const provider = createManagedAuthProvider(config.value, incoming.get("cookie"));
    const result = await resolveIdentity(provider, config.value.baseUrl);
    const changedCookies = provider.changedCookies();
    if (changedCookies.length) {
      // This helper is used in Route Handlers. Session refresh stays host-only.
      const store = await cookies();
      // Next serializes cookie values with encodeURIComponent; upstream values
      // are already encoded, so decode once before handing them to Next.
      for (const cookie of changedCookies) store.set(cookie.name ?? SESSION_COOKIE, decodeURIComponent(cookie.value), {
        path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge: cookie.maxAge, expires: cookie.expires,
      });
    }
    if (result.status === "authenticated") return { status: result.status, identity: result.identity };
    if (result.status === "unavailable" || result.status === "access_denied") return { status: result.status, code: result.code };
    return { status: result.status };
  } catch { return { status: "unavailable", code: "AUTH_UNAVAILABLE" }; }
}
