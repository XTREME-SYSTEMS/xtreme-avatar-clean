import { readAuthConfiguration } from "@/lib/auth/config";
import { completeGoogleLink } from "@/lib/auth/google-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = readAuthConfiguration();
  const result = config.configured
    ? await completeGoogleLink(config.value, new URL(request.url), request.headers.get("cookie"))
    : { ok: false, code: "GOOGLE_LINK_NOT_CONFIGURED" };
  const target = `/account?auth_return=google-link${result.ok ? "" : `&link_issue=${encodeURIComponent(result.code ?? "GOOGLE_LINK_NOT_CONFIRMED")}`}`;
  const headers = new Headers({
    Location: config.configured ? `${config.value.appOrigin}${target}` : target,
    "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  });
  // No cookie writes: an older callback may finish after a new link attempt starts.
  return new Response(null, { status: 303, headers });
}
