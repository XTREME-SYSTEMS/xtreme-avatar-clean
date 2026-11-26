import { timingSafeEqual } from "node:crypto";

const phone = /^\+[1-9]\d{7,14}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const channels = ["sms","mms","whatsapp"];

export function bearerMatches(header, secret) {
  if (!secret || typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const offered = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return offered.length === expected.length && timingSafeEqual(offered, expected);
}

export function normalizeTwilioAddress(address) {
  if (typeof address !== "string") return null;
  if (phone.test(address)) return { channel: "sms", e164: address };
  if (address.startsWith("whatsapp:") && phone.test(address.slice(9)))
    return { channel: "whatsapp", e164: address.slice(9) };
  return null;
}

export function validateOutbound(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.some(k=>!["workspaceId","actorUserId","requestId","to","channel","body","mediaUrls"].includes(k))) return null;
  const { workspaceId,actorUserId,requestId,to,channel,body,mediaUrls=[] } = input;
  if (typeof workspaceId !== "string" || !uuid.test(workspaceId) ||
      typeof actorUserId !== "string" || actorUserId.length < 8 || actorUserId.length > 128 ||
      typeof requestId !== "string" || !uuid.test(requestId) ||
      typeof to !== "string" || !phone.test(to) ||
      !channels.includes(channel) ||
      typeof body !== "string" || !body.trim() || body.length > 1600 ||
      !Array.isArray(mediaUrls) || mediaUrls.length > 3 ||
      (channel === "sms" && mediaUrls.length > 0) ||
      (channel === "mms" && mediaUrls.length === 0)) return null;
  const urls = [];
  for (const value of mediaUrls) {
    if (typeof value !== "string" || value.length > 500) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port ||
          !["www.xtremeavatar.com","xtremeavatar.com"].includes(url.hostname) ||
          !url.pathname.startsWith("/media/") || url.search || url.hash) return null;
      urls.push(url.href);
    } catch { return null; }
  }
  return {workspaceId,actorUserId,requestId,to,channel,body:body.trim(),mediaUrls:urls};
}

export function verifyTwilioInputs(params) {
  if (!params || typeof params !== "object") return false;
  const from = normalizeTwilioAddress(params.From);
  const to = normalizeTwilioAddress(params.To);
  const sid = params.MessageSid;
  if (!from || !to || typeof sid !== "string" || !/^SM[0-9a-f]{32}$/i.test(sid)) return false;
  if (from.channel !== to.channel) return false;
  return true;
}

export function safeMessageStatus(value) {
  return ["queued","accepted","sending","sent","delivered","undelivered","failed","read"].includes(value) ? value : null;
}
