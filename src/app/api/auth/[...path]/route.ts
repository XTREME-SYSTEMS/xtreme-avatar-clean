import { readAuthConfiguration } from "@/lib/auth/config";
import { performAuthAction } from "@/lib/auth/account-service";
import { isSameOriginMutation, privateJson, readBoundedJson } from "@/lib/auth/http";
import { beginGoogleSignIn } from "@/lib/auth/google";
import { registerEmailAccount } from "@/lib/auth/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The catch-all shape does not grant a catch-all proxy: only four exact actions. */
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (path !== "sign-in/email" && path !== "sign-up/email" && path !== "sign-in/google" && path !== "sign-out") return privateJson({ ok: false, code: "NOT_FOUND" }, 404);
  const config = readAuthConfiguration();
  if (!config.configured) return privateJson({ ok: false, code: config.code }, 503);
  if (!isSameOriginMutation(request, config.value.appOrigin)) return privateJson({ ok: false, code: "ORIGIN_NOT_ALLOWED" }, 403);
  const body = await readBoundedJson(request);
  if (!body.ok) return privateJson({ ok: false, code: body.code }, body.status);
  if (path === "sign-up/email") {
    const result = await registerEmailAccount(config.value, request.headers.get("cookie"), body.data);
    return privateJson(result.ok ? { ok: true, outcome: result.outcome } : { ok: false, code: result.code }, result.status, result.cookies);
  }
  if (path === "sign-in/google") {
    const result = await beginGoogleSignIn(config.value, request.headers.get("cookie"));
    return privateJson(result.ok ? { ok: true, url: result.url } : { ok: false, code: result.code }, result.ok ? 200 : 503, result.cookies);
  }
  const result = await performAuthAction(config.value, request.headers.get("cookie"), path, body.data);
  return privateJson({ ok: result.ok, ...(result.code ? { code: result.code } : {}) }, result.status, result.cookies);
}

export async function GET() { return privateJson({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405); }
