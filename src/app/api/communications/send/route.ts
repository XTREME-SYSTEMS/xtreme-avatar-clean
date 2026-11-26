import { communicationsAccess } from "@/lib/communications/access";
import { messageRequestId, transportResult } from "@/lib/communications/send-policy";
import { privateJson, readBoundedJson } from "@/lib/auth/http";
import { settingsDatabase } from "@/lib/communications/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHONE = /^\+[1-9]\d{7,14}$/;
type Channel = "sms" | "mms" | "whatsapp";

function parseRequest(body: unknown): { to: string; channel: Channel; message: string; mediaUrls: string[]; requestId: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).sort().join("|") !== "channel|mediaUrls|message|requestId|to") return null;
  if (typeof raw.to !== "string" || !PHONE.test(raw.to) ||
      !["sms", "mms", "whatsapp"].includes(String(raw.channel)) ||
      typeof raw.message !== "string" || !raw.message.trim() || raw.message.length > 1600 ||
      typeof raw.requestId !== "string" || !messageRequestId.test(raw.requestId) ||
      !Array.isArray(raw.mediaUrls) || raw.mediaUrls.length > 3 ||
      !raw.mediaUrls.every(v => typeof v === "string" && v.length <= 500)) return null;
  if (raw.channel === "sms" && raw.mediaUrls.length !== 0) return null;
  if (raw.channel === "mms" && raw.mediaUrls.length === 0) return null;
  if (raw.channel === "whatsapp" && raw.mediaUrls.length > 0) return null;
  return { to:raw.to, channel:raw.channel as Channel,
    message:raw.message.trim(), requestId:raw.requestId, mediaUrls:raw.mediaUrls as string[] };
}

export async function POST(request: Request) {
  const auth = await communicationsAccess(request, true);
  if (!auth.ok) return privateJson({ ok: false, code: auth.code }, auth.status);
  const parsed = await readBoundedJson(request, 6000);
  if (!parsed.ok) return privateJson({ ok:false, code:parsed.code }, parsed.status);
  const input = parseRequest(parsed.data);
  if (!input) return privateJson({ ok:false, code:"INVALID_MESSAGE" }, 400);
  const sql = settingsDatabase();
  if (!sql) return privateJson({ ok:false, code:"SETTINGS_DATABASE_NOT_CONFIGURED" }, 503);

  try {
    const consent = await sql.query(
      "SELECT id FROM avatar_app.consented_numbers WHERE workspace_id=$1 AND phone_e164=$2 AND revoked_at IS NULL AND $3=ANY(channels) AND consented_at<=now() LIMIT 1",
      [auth.workspace,input.to,input.channel],
    );
    if (consent.length !== 1) return privateJson({ ok:false, code:"CONSENT_NOT_RECORDED" }, 403);
  } catch {
    return privateJson({ ok:false, code:"CONSENT_CHECK_UNAVAILABLE" }, 503);
  }

  const base = process.env.COMMS_SERVICE_ORIGIN;
  const secret = process.env.COMMS_SERVICE_SECRET;
  if (!base || !secret || secret.length < 32) return privateJson({ ok:false, code:"SENDING_NOT_CONFIGURED" }, 503);
  let target: URL;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.hostname !== "xtreme-avatar-comms-api-production.up.railway.app" ||
        url.pathname !== "/" || url.search || url.hash || url.username || url.password || url.port) throw new Error("origin");
    target = new URL("/v1/messages", url);
  } catch { return privateJson({ ok:false, code:"SENDING_NOT_CONFIGURED" }, 503); }

  try {
    const response = await fetch(target, {
      method:"POST", cache:"no-store", redirect:"error",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer " + secret },
      body:JSON.stringify({
        workspaceId:auth.workspace,
        actorUserId:auth.actor,
        requestId:input.requestId, to:input.to, channel:input.channel,
        body:input.message, mediaUrls:input.mediaUrls,
      }),
      signal:AbortSignal.timeout(14000),
    });
    const outcome = transportResult(response.status, await response.json().catch(() => null), input.requestId);
    return privateJson(outcome.body, outcome.status);
  } catch {
    // Never retry an uncertain send. The same request ID must be reconciled against the server receipt.
    return privateJson({ ok:false, code:"SEND_OUTCOME_UNKNOWN", requestId:input.requestId }, 503);
  }
}

export async function GET(request: Request) {
  const auth = await communicationsAccess(request, true);
  if (!auth.ok) return privateJson({ ok: false, code: auth.code }, auth.status);
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId || !messageRequestId.test(requestId)) return privateJson({ ok: false, code: "INVALID_REQUEST" }, 400);
  const sql = settingsDatabase();
  if (!sql) return privateJson({ ok: false, code: "RECEIPT_UNAVAILABLE" }, 503);
  try {
    const [row] = await sql.query(
      "SELECT status FROM avatar_app.message_outbox WHERE workspace_id=$1 AND actor_user_id=$2 AND request_id=$3 LIMIT 1",
      [auth.workspace, auth.actor, requestId],
    );
    const status = row?.status ?? "not_recorded";
    return privateJson({ ok: true, scopeId: auth.scopeId, requestId, status });
  } catch { return privateJson({ ok: false, code: "RECEIPT_UNAVAILABLE" }, 503); }
}
