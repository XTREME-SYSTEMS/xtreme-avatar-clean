import { readAuthConfiguration } from "@/lib/auth/config";
import { completeGoogleSignIn } from "@/lib/auth/google";
import { clearChallengeCookies, serializeManagedCookie } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = readAuthConfiguration();
  const result = config.configured
    ? await completeGoogleSignIn(config.value, new URL(request.url), request.headers.get("cookie"))
    : { ok: false, code: "AUTH_NOT_CONFIGURED", cookies: clearChallengeCookies() };
  // Only our fixed classifications are recorded. Never log a callback URL,
  // verifier, raw provider error, cookie, token, email or account identifier.
  if (!result.ok) console.warn(JSON.stringify({ event: "avatar.google.callback_denied", code: result.code }));
  // Always remove the verifier and all provider-supplied query values immediately.
  const target = result.ok ? "/account?auth_return=google"
    : `/account?auth_error=google&auth_issue=${encodeURIComponent(result.code ?? "GOOGLE_CALLBACK_INVALID")}`;
  const headers = new Headers({
    Location: config.configured ? `${config.value.appOrigin}${target}` : target,
    "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  });
  for (const cookie of result.cookies) headers.append("Set-Cookie", serializeManagedCookie(cookie));
  return new Response(null, { status: 303, headers });
}
