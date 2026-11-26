import { communicationsAccess } from "@/lib/communications/access";
import { privateJson, readBoundedJson } from "@/lib/auth/http";
import { parseConsent, parsePreferences, parseRevoke } from "@/lib/communications/validation";
import { loadWorkspaceCommunications, revokeConsentedNumber, saveConsentedNumber, saveWorkspacePreferences, settingsDatabase } from "@/lib/communications/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await communicationsAccess(request, request.method === "POST");
  if (!auth.ok) return privateJson({ ok: false, code: auth.code }, auth.status);
  const sql = settingsDatabase();
  if (!sql) return privateJson({ ok: false, code: "SETTINGS_DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const result = await loadWorkspaceCommunications(sql, auth.workspace);
    return privateJson({ ok: true, scopeId: auth.scopeId, ...result });
  } catch {
    return privateJson({ ok: false, code: "SETTINGS_UNAVAILABLE" }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await communicationsAccess(request, request.method === "POST");
  if (!auth.ok) return privateJson({ ok: false, code: auth.code }, auth.status);
  const sql = settingsDatabase();
  if (!sql) return privateJson({ ok: false, code: "SETTINGS_DATABASE_NOT_CONFIGURED" }, 503);
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
      saved = await saveWorkspacePreferences(sql, auth.workspace, auth.actor, parsed);
    } else if (action === "consent") {
      const parsed = parseConsent(data);
      if (!parsed) return privateJson({ ok: false, code: "INVALID_CONSENT" }, 400);
      saved = await saveConsentedNumber(sql, auth.workspace, auth.actor, parsed);
    } else if (action === "revoke") {
      const parsed = parseRevoke(data);
      if (!parsed) return privateJson({ ok: false, code: "INVALID_REVOCATION" }, 400);
      saved = await revokeConsentedNumber(sql, auth.workspace, auth.actor, parsed);
    } else return privateJson({ ok: false, code: "UNKNOWN_SETTINGS_ACTION" }, 400);
    if (!saved) return privateJson({ ok: false, code: "SETTINGS_CHANGED_REFRESH" }, 409);
    return privateJson({ ok: true });
  } catch {
    return privateJson({ ok: false, code: "SETTINGS_UNAVAILABLE" }, 503);
  }
}
