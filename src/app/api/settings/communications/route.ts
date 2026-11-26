import { readAuthConfiguration } from "@/lib/auth/config";
import { createManagedAuthProvider } from "@/lib/auth/provider";
import { resolveIdentity } from "@/lib/auth/identity";
import { isSameOriginMutation, privateJson, readBoundedJson } from "@/lib/auth/http";
import { parseConsent, parsePreferences, parseRevoke } from "@/lib/communications/validation";
import { loadWorkspaceCommunications, revokeConsentedNumber, saveConsentedNumber, saveWorkspacePreferences, settingsDatabase } from "@/lib/communications/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request: Request) {
  const config = readAuthConfiguration();
  if (!config.configured) return { ok: false as const, code: config.code, status: 503 };
  if (new URL(request.url).origin !== config.value.appOrigin) {
    return { ok: false as const, code: "ORIGIN_NOT_ALLOWED", status: 403 };
  }
  const provider = createManagedAuthProvider(config.value, request.headers.get("cookie"));
  const identity = await resolveIdentity(provider, config.value.baseUrl);
  if (identity.status !== "authenticated") return {
    ok: false as const, code: identity.status === "anonymous" ? "SIGN_IN_REQUIRED" : "WORKSPACE_ACCESS_DENIED",
    status: identity.status === "anonymous" ? 401 : 403,
  };
  if (identity.identity.role !== "owner" && identity.identity.role !== "admin") {
    return { ok: false as const, code: "ADMIN_ACCESS_REQUIRED", status: 403 };
  }
  const sql = settingsDatabase();
  if (!sql) return { ok: false as const, code: "SETTINGS_DATABASE_NOT_CONFIGURED", status: 503 };
  return { ok: true as const, workspace: identity.identity.organizationId, actor: identity.identity.userId, sql };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return privateJson({ ok: false, code: auth.code }, auth.status);
  try {
    const result = await loadWorkspaceCommunications(auth.sql, auth.workspace);
    return privateJson({ ok: true, ...result });
  } catch {
    return privateJson({ ok: false, code: "SETTINGS_UNAVAILABLE" }, 503);
  }
}

export async function POST(request: Request) {
  const config = readAuthConfiguration();
  if (!config.configured) return privateJson({ ok: false, code: config.code }, 503);
  if (!isSameOriginMutation(request, config.value.appOrigin)) {
    return privateJson({ ok: false, code: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  const auth = await authorize(request);
  if (!auth.ok) return privateJson({ ok: false, code: auth.code }, auth.status);
  const body = await readBoundedJson(request, 8192);
  if (!body.ok) return privateJson({ ok: false, code: body.code }, body.status);
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return privateJson({ ok: false, code: "INVALID_SETTINGS_REQUEST" }, 400);
  }
  const { action, data } = body.data as Record<string, unknown>;
  if (Object.keys(body.data).sort().join("|") !== "action|data") {
    return privateJson({ ok: false, code: "INVALID_SETTINGS_REQUEST" }, 400);
  }
  try {
    let saved: boolean;
    if (action === "preferences") {
      const parsed = parsePreferences(data);
      if (!parsed) return privateJson({ ok: false, code: "INVALID_PREFERENCES" }, 400);
      saved = await saveWorkspacePreferences(auth.sql, auth.workspace, auth.actor, parsed);
    } else if (action === "consent") {
      const parsed = parseConsent(data);
      if (!parsed) return privateJson({ ok: false, code: "INVALID_CONSENT" }, 400);
      saved = await saveConsentedNumber(auth.sql, auth.workspace, auth.actor, parsed);
    } else if (action === "revoke") {
      const parsed = parseRevoke(data);
      if (!parsed) return privateJson({ ok: false, code: "INVALID_REVOCATION" }, 400);
      saved = await revokeConsentedNumber(auth.sql, auth.workspace, auth.actor, parsed);
    } else return privateJson({ ok: false, code: "UNKNOWN_SETTINGS_ACTION" }, 400);
    if (!saved) return privateJson({ ok: false, code: "SETTINGS_CHANGED_REFRESH" }, 409);
    return privateJson({ ok: true });
  } catch {
    return privateJson({ ok: false, code: "SETTINGS_UNAVAILABLE" }, 503);
  }
}
