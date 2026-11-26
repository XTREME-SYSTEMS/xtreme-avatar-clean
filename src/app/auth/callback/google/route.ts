import { readAuthConfiguration } from "@/lib/auth/config";
import { completeGoogleSignIn } from "@/lib/auth/google";
import { clearChallengeCookies, serializeManagedCookie } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = readAuthConfiguration();
  const result = config.configured
    ? await completeGoogleSignIn(config.value, new URL(request.url), request.headers.get("cookie"))
    : { ok: false, cookies: clearChallengeCookies() };
  // Always remove the verifier and all provider-supplied query values immediately.
  const target = result.ok ? "/account?auth_return=google" : "/account?auth_error=google";
  const headers = new Headers({
    Location: config.configured ? `${config.value.appOrigin}${target}` : target,
    "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  });
  for (const cookie of result.cookies) headers.append("Set-Cookie", serializeManagedCookie(cookie));
  return new Response(null, { status: 303, headers });
}
