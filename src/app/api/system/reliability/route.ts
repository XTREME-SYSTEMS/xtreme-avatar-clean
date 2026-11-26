import { readAuthConfiguration } from "@/lib/auth/config";
import { createManagedAuthProvider } from "@/lib/auth/provider";
import { resolveIdentity } from "@/lib/auth/identity";
import { privateJson } from "@/lib/auth/http";
import { runAudit } from "../../../../../scripts/reliability/audit.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-initiated, read-only public audit; never accepts a target URL or provider credentials from the caller. */
export async function GET(request: Request) {
  const config = readAuthConfiguration();
  if (!config.configured) return privateJson({ ok: false, code: "ACCOUNT_UNAVAILABLE" }, 503);
  if (new URL(request.url).origin !== config.value.appOrigin) {
    return privateJson({ ok: false, code: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  const provider = createManagedAuthProvider(config.value, request.headers.get("cookie"));
  const resolved = await resolveIdentity(provider, config.value.baseUrl);
  if (resolved.status !== "authenticated") {
    return privateJson({ ok: false, code: resolved.status === "anonymous" ? "SIGN_IN_REQUIRED" : "WORKSPACE_ACCESS_DENIED" },
      resolved.status === "anonymous" ? 401 : resolved.status === "unavailable" ? 503 : 403);
  }
  if (resolved.identity.role !== "owner" && resolved.identity.role !== "admin") {
    return privateJson({ ok: false, code: "ADMIN_ACCESS_REQUIRED" }, 403);
  }
  try {
    const receipt = await runAudit({ attempts: 2, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
    return privateJson({ ok: true, receipt });
  } catch {
    return privateJson({ ok: false, code: "AUDIT_UNAVAILABLE" }, 503);
  }
}
