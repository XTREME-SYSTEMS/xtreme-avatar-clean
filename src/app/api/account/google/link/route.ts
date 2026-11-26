import { readAuthConfiguration } from "@/lib/auth/config";
import { beginGoogleLink } from "@/lib/auth/google-link";
import { googleLinkCookie } from "@/lib/auth/google-link-state";
import { isSameOriginMutation, privateJson, readBoundedJson } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = readAuthConfiguration();
  if (!config.configured) return privateJson({ ok: false, code: config.code }, 503);
  if (!isSameOriginMutation(request, config.value.appOrigin)) return privateJson({ ok: false, code: "ORIGIN_NOT_ALLOWED" }, 403);
  const body = await readBoundedJson(request, 1024);
  if (!body.ok) return privateJson({ ok: false, code: body.code }, body.status);
  const result = await beginGoogleLink(config.value, request.headers.get("cookie"), body.data);
  if (!result.ok) return privateJson({ ok: false, code: result.code }, result.status);
  if (result.alreadyLinked) return privateJson({ ok: true, alreadyLinked: true });
  const response = privateJson({ ok: true, alreadyLinked: false, url: result.url });
  response.headers.append("Set-Cookie", googleLinkCookie(result.marker));
  return response;
}
