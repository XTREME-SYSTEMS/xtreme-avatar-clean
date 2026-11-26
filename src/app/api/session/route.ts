import { readAuthConfiguration } from "@/lib/auth/config";
import { readAccount, selectOrganization } from "@/lib/auth/account-service";
import { createManagedAuthProvider, isRecord } from "@/lib/auth/provider";
import { isSameOriginMutation, privateJson, readBoundedJson } from "@/lib/auth/http";
import { createFirstWorkspace } from "@/lib/auth/workspace-onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = readAuthConfiguration();
  if (!config.configured) return privateJson({ status: "unavailable", code: config.code }, 503);
  if (new URL(request.url).origin !== config.value.appOrigin) return privateJson({ status: "unavailable", code: "AUTH_ORIGIN_MISMATCH" }, 503);
  const provider = createManagedAuthProvider(config.value, request.headers.get("cookie"));
  const result = await readAccount(provider, config.value.baseUrl);
  return privateJson(result.session, result.httpStatus, result.cookies);
}

export async function POST(request: Request) {
  const config = readAuthConfiguration();
  if (!config.configured) return privateJson({ status: "unavailable", code: config.code }, 503);
  if (!isSameOriginMutation(request, config.value.appOrigin)) return privateJson({ status: "access_denied", code: "ORIGIN_NOT_ALLOWED" }, 403);
  const body = await readBoundedJson(request, 1024);
  if (!body.ok) return privateJson({ status: "access_denied", code: body.code }, body.status);
  if (isRecord(body.data) && body.data.action === "createOrganization") {
    const provider = createManagedAuthProvider(config.value, request.headers.get("cookie"));
    const result = await createFirstWorkspace(provider, config.value.baseUrl, body.data);
    return privateJson(result.session, result.httpStatus, result.cookies);
  }
  if (!isRecord(body.data) || body.data.action !== "selectOrganization" || typeof body.data.organizationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.data.organizationId)) {
    return privateJson({ status: "access_denied", code: "INVALID_ORGANIZATION" }, 400);
  }
  const provider = createManagedAuthProvider(config.value, request.headers.get("cookie"));
  const result = await selectOrganization(provider, config.value.baseUrl, body.data.organizationId);
  return privateJson(result.session, result.httpStatus, result.cookies);
}
