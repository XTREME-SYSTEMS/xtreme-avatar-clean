import { isSameOriginMutation } from "@/lib/auth/http";
import { readAuthConfiguration } from "@/lib/auth/config";
import { resolveIdentity } from "@/lib/auth/identity";
import { createManagedAuthProvider } from "@/lib/auth/provider";
import { identityScopeId } from "@/lib/core/authorization";
import { matchesScope } from "./send-policy";

export async function communicationsAccess(request: Request, requireScope: boolean) {
  const config = readAuthConfiguration();
  if (!config.configured) return { ok: false as const, code: config.code, status: 503 };
  if (new URL(request.url).origin !== config.value.appOrigin ||
      (request.method === "POST" && !isSameOriginMutation(request, config.value.appOrigin))) {
    return { ok: false as const, code: "ORIGIN_NOT_ALLOWED", status: 403 };
  }
  const provider = createManagedAuthProvider(config.value, request.headers.get("cookie"));
  const result = await resolveIdentity(provider, config.value.baseUrl);
  if (result.status !== "authenticated") return { ok: false as const,
    code: result.status === "anonymous" ? "SIGN_IN_REQUIRED" : "WORKSPACE_ACCESS_DENIED",
    status: result.status === "anonymous" ? 401 : 403 };
  if (!["admin", "owner"].includes(result.identity.role)) return { ok: false as const, code: "ADMIN_ACCESS_REQUIRED", status: 403 };
  const scopeId = identityScopeId(result.identity);
  if (requireScope && !matchesScope(request.headers.get("x-avatar-scope"), scopeId)) {
    return { ok: false as const, code: "WORKSPACE_CHANGED", status: 409 };
  }
  return { ok: true as const, scopeId, workspace: result.identity.organizationId, actor: result.identity.userId };
}
