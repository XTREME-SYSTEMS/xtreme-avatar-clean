import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthConfiguration } from "./config";

export const GOOGLE_LINK_COOKIE = "__Host-avatar_google_link";
const PURPOSE = "avatar.google-link.v1";
const MAX_AGE = 600;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
export type LinkPrincipal = { userId: string; sessionId: string; expiresAt: number };
export type LinkState = {
  v: 1; purpose: typeof PURPOSE; attempt: string; binding: string;
  issuer: string; origin: string; iat: number; exp: number;
};

function decode(value: string, limit: number): Buffer | null {
  if (!value || value.length > limit || !BASE64URL.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

/** Provision with 32 CSPRNG bytes encoded as base64url; length alone cannot prove entropy. */
export function readGoogleLinkKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const value = env.AVATAR_AUTH_FLOW_SECRET;
  const key = value ? decode(value, 43) : null;
  if (!key || key.length !== 32 || key.every((byte) => byte === key[0])) return null;
  return key;
}

function mac(key: Buffer, purpose: string, value: string): Buffer {
  return createHmac("sha256", key).update(`${PURPOSE}:${purpose}\n${value}`).digest();
}

function binding(key: Buffer, config: AuthConfiguration, principal: LinkPrincipal): string {
  return mac(key, "principal", JSON.stringify([config.baseUrl, config.appOrigin, principal.userId, principal.sessionId])).toString("base64url");
}

export function issueGoogleLinkState(key: Buffer, config: AuthConfiguration, principal: LinkPrincipal, now = Date.now()) {
  const state: LinkState = {
    v: 1, purpose: PURPOSE, attempt: randomBytes(32).toString("base64url"), binding: binding(key, config, principal),
    issuer: config.baseUrl, origin: config.appOrigin,
    iat: Math.floor(now / 1000), exp: Math.min(Math.floor(now / 1000) + MAX_AGE, Math.floor(principal.expiresAt / 1000)),
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return { state, cookie: `${payload}.${mac(key, "marker", payload).toString("base64url")}` };
}

export function readGoogleLinkState(header: string | null, key: Buffer, config: AuthConfiguration, now = Date.now()): LinkState | null {
  if (!header || header.length > 16_384) return null;
  const values = header.split(";").map((part) => part.trim()).filter((part) => part.slice(0, part.indexOf("=")) === GOOGLE_LINK_COOKIE);
  if (values.length !== 1) return null;
  const value = values[0].slice(GOOGLE_LINK_COOKIE.length + 1);
  if (value.length > 2048) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const payload = decode(parts[0], 1900);
  const signature = decode(parts[1], 43);
  if (!payload || !signature || signature.length !== 32 || !timingSafeEqual(signature, mac(key, "marker", parts[0]))) return null;
  try {
    const data: unknown = JSON.parse(payload.toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const state = data as Record<string, unknown>;
    if (Object.keys(state).length !== 8 || state.v !== 1 || state.purpose !== PURPOSE ||
      state.issuer !== config.baseUrl || state.origin !== config.appOrigin ||
      typeof state.attempt !== "string" || decode(state.attempt, 43)?.length !== 32 ||
      typeof state.binding !== "string" || decode(state.binding, 43)?.length !== 32 ||
      !Number.isSafeInteger(state.iat) || !Number.isSafeInteger(state.exp)) return null;
    const iat = state.iat as number; const exp = state.exp as number; const seconds = Math.floor(now / 1000);
    if (iat < 0 || iat > seconds + 5 || exp <= seconds || exp <= iat || exp > iat + MAX_AGE) return null;
    return state as LinkState;
  } catch { return null; }
}

export function matchesGoogleLinkPrincipal(state: LinkState, key: Buffer, config: AuthConfiguration, principal: LinkPrincipal): boolean {
  const expected = Buffer.from(binding(key, config, principal), "base64url");
  const actual = Buffer.from(state.binding, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function googleLinkCookie(value: string): string {
  return `${GOOGLE_LINK_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}
