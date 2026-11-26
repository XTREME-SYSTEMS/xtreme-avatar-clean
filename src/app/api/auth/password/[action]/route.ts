import { readAuthConfiguration } from "@/lib/auth/config";
import { isSameOriginMutation, privateJson, readBoundedJson } from "@/lib/auth/http";
import { confirmPasswordRecovery, requestPasswordRecovery } from "@/lib/auth/password-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (action !== "request" && action !== "confirm") return privateJson({ ok: false, code: "NOT_FOUND" }, 404);
  const config = readAuthConfiguration();
  if (!config.configured) return privateJson({ ok: false, code: config.code }, 503);
  if (!isSameOriginMutation(request, config.value.appOrigin)) return privateJson({ ok: false, code: "ORIGIN_NOT_ALLOWED" }, 403);
  const body = await readBoundedJson(request, 3072);
  if (!body.ok) return privateJson({ ok: false, code: body.code }, body.status);
  const reply = action === "request"
    ? await requestPasswordRecovery(config.value, body.data)
    : await confirmPasswordRecovery(config.value, body.data);
  return privateJson(reply.ok ? { ok: true } : { ok: false, code: reply.code }, reply.status);
}
export async function GET() { return privateJson({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405); }
