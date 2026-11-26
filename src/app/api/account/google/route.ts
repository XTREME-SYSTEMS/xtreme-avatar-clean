import { readAuthConfiguration } from "@/lib/auth/config";
import { readGoogleConnection } from "@/lib/auth/google-link";
import { privateJson } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = readAuthConfiguration();
  if (!config.configured) return privateJson({ state: "unavailable", linkAvailable: false, code: config.code }, 503);
  if (new URL(request.url).origin !== config.value.appOrigin) return privateJson({ state: "unavailable", linkAvailable: false, code: "ORIGIN_NOT_ALLOWED" }, 403);
  const result = await readGoogleConnection(config.value, request.headers.get("cookie"));
  return privateJson(result.data, result.status);
}
