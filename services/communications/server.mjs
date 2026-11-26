import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import twilio from "twilio";
import { bearerMatches, normalizeTwilioAddress, safeMessageStatus, validateOutbound, verifyTwilioInputs } from "./policy.mjs";

const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.AVATAR_DATABASE_URL || "",
  twilioSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioToken: process.env.TWILIO_AUTH_TOKEN || "",
  publicOrigin: process.env.COMMS_PUBLIC_ORIGIN || "",
  sharedSecret: process.env.COMMS_SERVICE_SECRET || "",
  sendEnabled: process.env.COMMS_SEND_ENABLED === "true",
};
const validNeon = (() => {
  try {
    const url = new URL(config.databaseUrl);
    return (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
      url.hostname.endsWith(".neon.tech") && url.username && url.password;
  } catch { return false; }
})();
const sql = validNeon ? neon(config.databaseUrl) : null;
const twilioReady = Boolean(/^AC[0-9a-f]{32}$/i.test(config.twilioSid) && config.twilioToken);
const messaging = twilioReady ? twilio(config.twilioSid, config.twilioToken) : null;

function json(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}
function xml(res, status = 200) {
  res.writeHead(status, { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" });
  res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}
async function body(req, max) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > max) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function authorized(req) {
  return bearerMatches(req.headers.authorization, config.sharedSecret);
}
function publicWebhookUrl(path) {
  try {
    const url = new URL(config.publicOrigin);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash || url.port) return null;
    return new URL(path, url.origin).href;
  } catch { return null; }
}
function senderFromAddress(address) {
  return normalizeTwilioAddress(address)?.e164 ?? null;
}
async function handleTwilioWebhook(req, res, pathname) {
  if (!twilioReady || !sql) return json(res, 503, { ok: false, code: "PROVIDER_NOT_CONFIGURED" });
  const url = publicWebhookUrl(pathname);
  if (!url) return json(res, 503, { ok: false, code: "WEBHOOK_ORIGIN_NOT_CONFIGURED" });
  if (!req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded")) {
    return json(res, 415, { ok: false, code: "UNSUPPORTED_CONTENT_TYPE" });
  }
  const payload = await body(req, 65536);
  const fields = new URLSearchParams(payload);
  const params = Object.fromEntries(fields.entries());
  if (fields.size !== Object.keys(params).length) return json(res, 403, { ok: false, code: "AMBIGUOUS_WEBHOOK" });
  const signature = req.headers["x-twilio-signature"];
  if (!signature || Array.isArray(signature) || !twilio.validateRequest(config.twilioToken, signature, url, params)) {
    return json(res, 403, { ok: false, code: "INVALID_SIGNATURE" });
  }
  if (params.AccountSid !== config.twilioSid) return json(res, 403, { ok: false, code: "WRONG_TWILIO_ACCOUNT" });
  if (pathname.endsWith("/status")) {
    const status = safeMessageStatus(params.MessageStatus);
    if (status && typeof params.MessageSid === "string") {
      await sql.query(
        "UPDATE avatar_app.message_outbox SET status=$1, error_code=$2, updated_at=now() WHERE provider_message_sid=$3",
        [status, typeof params.ErrorCode === "string" ? params.ErrorCode.slice(0, 32) : null, params.MessageSid],
      );
    }
    return json(res, 200, { ok: true });
  }
  if (!verifyTwilioInputs(params)) return json(res, 400, { ok: false, code: "INVALID_PROVIDER_EVENT" });
  const sender = normalizeTwilioAddress(params.To);
  const from = senderFromAddress(params.From);
  if (!sender || !from) return json(res, 400, { ok: false, code: "INVALID_PROVIDER_EVENT" });
  const matches = await sql.query(
    "SELECT workspace_id FROM avatar_app.messaging_senders WHERE sender_e164=$1 AND enabled=true AND provider_verified=true AND $2=ANY(channels) LIMIT 1",
    [sender.e164, sender.channel],
  );
  // Unknown senders are acknowledged without storing private message content.
  if (matches.length === 0) return xml(res);
  const count = Number(params.NumMedia ?? 0);
  const mediaCount = Number.isInteger(count) && count >= 0 && count <= 10 ? count : 0;
  await sql.query(
    "INSERT INTO avatar_app.inbound_messages(provider_message_sid,workspace_id,from_e164,to_e164,channel,body,media_count) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (provider_message_sid) DO NOTHING",
    [params.MessageSid, matches[0].workspace_id, from, sender.e164, sender.channel,
      typeof params.Body === "string" ? params.Body.slice(0, 20000) : "", mediaCount],
  );
  return xml(res);
}
async function handleSend(req, res) {
  if (!authorized(req)) return json(res, 401, { ok:false, code:"UNAUTHORIZED" });
  if (!config.sendEnabled || !sql || !messaging || !publicWebhookUrl("/webhooks/twilio/status")) {
    return json(res, 503, { ok:false, code:"MESSAGING_NOT_ENABLED" });
  }
  const raw = await body(req, 8192);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return json(res, 400, { ok:false, code:"INVALID_REQUEST" }); }
  const input = validateOutbound(parsed);
  if (!input) return json(res, 400, { ok:false, code:"INVALID_MESSAGE" });
  const [consent, sender, prefs] = await Promise.all([
    sql.query(
      "SELECT id FROM avatar_app.consented_numbers WHERE workspace_id=$1 AND phone_e164=$2 AND revoked_at IS NULL AND $3=ANY(channels) AND consented_at<=now() LIMIT 1",
      [input.workspaceId,input.to,input.channel],
    ),
    sql.query(
      "SELECT sender_e164 FROM avatar_app.messaging_senders WHERE workspace_id=$1 AND enabled=true AND provider_verified=true AND $2=ANY(channels) LIMIT 2",
      [input.workspaceId,input.channel],
    ),
    sql.query(
      "SELECT desired_daily_limit FROM avatar_app.communication_settings WHERE workspace_id=$1",
      [input.workspaceId],
    ),
  ]);
  if (consent.length !== 1) return json(res, 403, { ok:false, code:"RECIPIENT_CONSENT_NOT_FOUND" });
  if (sender.length !== 1) return json(res, 503, { ok:false, code:"SENDER_NOT_VERIFIED" });
  const limit = prefs[0]?.desired_daily_limit === null || prefs[0] === undefined ? null : Number(prefs[0]?.desired_daily_limit);
  const hash = createHash("sha256").update(input.body).digest("hex");
  const reserved = await sql.query(
    "INSERT INTO avatar_app.message_outbox(workspace_id,request_id,actor_user_id,to_e164,sender_e164,channel,body_sha256,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved') ON CONFLICT (workspace_id,request_id) DO NOTHING RETURNING id",
    [input.workspaceId,input.requestId,input.actorUserId,input.to,sender[0].sender_e164,input.channel,hash],
  );
  if (reserved.length !== 1) return json(res, 409, { ok:false, code:"ALREADY_SUBMITTED" });
  if (limit !== null) {
    const quota = await sql.query(
      "INSERT INTO avatar_app.messaging_daily_usage(workspace_id,usage_date,reserved_count) VALUES ($1,current_date,1) ON CONFLICT (workspace_id,usage_date) DO UPDATE SET reserved_count=messaging_daily_usage.reserved_count+1 WHERE messaging_daily_usage.reserved_count < $2 RETURNING reserved_count",
      [input.workspaceId,limit],
    );
    if (quota.length !== 1) {
      await sql.query("UPDATE avatar_app.message_outbox SET status='budget_denied',updated_at=now() WHERE id=$1", [reserved[0].id]);
      return json(res, 429, { ok:false, code:"WORKSPACE_BUDGET_REACHED" });
    }
  }
  const recipient = input.channel === "whatsapp" ? "whatsapp:"+input.to : input.to;
  const from = input.channel === "whatsapp" ? "whatsapp:"+sender[0].sender_e164 : sender[0].sender_e164;
  try {
    const sent = await messaging.messages.create({
      to: recipient, from, body: input.body,
      ...(input.channel === "mms" ? { mediaUrl: input.mediaUrls } : {}),
      statusCallback: publicWebhookUrl("/webhooks/twilio/status"),
    });
    await sql.query(
      "UPDATE avatar_app.message_outbox SET status=$1,provider_message_sid=$2,updated_at=now() WHERE id=$3",
      [safeMessageStatus(sent.status) ?? "queued",sent.sid,reserved[0].id],
    );
    return json(res, 202, { ok:true, requestId:input.requestId, status:sent.status ?? "queued" });
  } catch {
    await sql.query("UPDATE avatar_app.message_outbox SET status='unknown',updated_at=now() WHERE id=$1", [reserved[0].id])
      .catch(() => {});
    return json(res, 503, { ok:false, code:"SEND_OUTCOME_UNKNOWN", requestId:input.requestId });
  }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname;
    if (req.method === "GET" && path === "/health") {
      return json(res, 200, { status:"online", version:"2026-11-26", databaseConfigured:!!sql, twilioConfigured:twilioReady, sendEnabled:config.sendEnabled });
    }
    if (req.method === "GET" && path === "/ready") {
      if (!sql) return json(res,503,{status:"not_ready",reason:"NEON_DATABASE_NOT_CONFIGURED"});
      await sql.query("SELECT 1 AS alive FROM avatar_app.communication_settings LIMIT 1");
      return json(res,200,{status:"ready",database:"neon"});
    }
    if (req.method === "POST" && ["/webhooks/twilio/inbound","/webhooks/twilio/status"].includes(path)) {
      return await handleTwilioWebhook(req,res,path);
    }
    if (req.method === "POST" && path === "/v1/messages") return await handleSend(req,res);
    return json(res,404,{ok:false,code:"NOT_FOUND"});
  } catch {
    return json(res,503,{ok:false,code:"SERVICE_UNAVAILABLE"});
  }
});
server.listen(config.port, "0.0.0.0");
