import { createHash, createPrivateKey, randomUUID, sign } from "node:crypto";
import { record } from "./contracts.ts";

// These are the existing verified staging boundaries, not browser-supplied destinations.
export const NEON_ISSUER = "https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth";
export const CORE_ORIGIN = "https://core-api-staging-dec8a723.up.railway.app";
export const CHAT_SCOPES = "knowledge:read tool:execute profile:read";

export type VerifiedNeonIdentity = {
  issuer: string;
  userId: string;
  sessionId: string;
  sessionExpiresAt: string;
  organizationId: string;
  memberId: string;
  role: string;
};
type Env = Record<string, string | undefined>;
export type CoreAuthorization =
  | { status: "ready"; token: string; origin: string; scopeId: string; expiresAt: number }
  | { status: "not_connected"; code: "core_bridge_not_configured" | "core_bridge_invalid" }
  | { status: "access_denied"; code: "core_identity_not_granted" | "session_expired" | "voice_not_granted" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonicalCoreUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safeId = /^[a-zA-Z0-9_-]{1,80}$/;
const origin = (value: string) => {
  try { const u = new URL(value); return value.length <= 512 && u.protocol === "https:" && u.origin === value && !u.username && !u.password && !u.port && !u.hostname.includes("*") && u.hostname.includes("."); } catch { return false; }
};
export function identityScopeId(identity: Pick<VerifiedNeonIdentity, "issuer" | "userId" | "organizationId">): string {
  return createHash("sha256").update(JSON.stringify([identity.issuer, identity.userId, identity.organizationId])).digest("hex");
}

type Delegation = "chat" | "voice-readiness" | "voice-start" | "voice-end" | "voice-relay";

function validVoiceGrant(grant: unknown): grant is { approvalRef: string; expiresAt: string } {
  return record(grant) && Object.keys(grant).sort().join(",") === "approvalRef,expiresAt"
    && typeof grant.approvalRef === "string" && grant.approvalRef.trim().length >= 8 && grant.approvalRef.length <= 512
    && typeof grant.expiresAt === "string" && Number.isFinite(Date.parse(grant.expiresAt));
}

/** Called only after a fresh provider session and membership read. No static owner bearer. */
export function createCoreAuthorization(identity: VerifiedNeonIdentity, env: Env, now = Math.floor(Date.now() / 1_000), delegation: Delegation = "chat", relayMissionId?: string): CoreAuthorization {
  if (env.CORE_CHAT_ENABLED !== "true") return { status: "not_connected", code: "core_bridge_not_configured" };
  const names = ["CORE_API_BASE_URL", "CORE_AUTH_ISSUER", "CORE_AUTH_AUDIENCE", "CORE_AUTH_CLIENT_ID", "CORE_AUTH_KEY_ID", "CORE_AUTH_PRIVATE_KEY", "CORE_IDENTITY_BINDINGS_JSON", "AVATAR_APP_ORIGIN"] as const;
  if (names.some(name => !env[name])) return { status: "not_connected", code: "core_bridge_not_configured" };
  try {
    if (env.CORE_API_BASE_URL !== CORE_ORIGIN || !origin(env.CORE_AUTH_ISSUER!) || env.CORE_AUTH_ISSUER !== env.AVATAR_APP_ORIGIN || !safeId.test(env.CORE_AUTH_KEY_ID!)) throw new Error("invalid_binding");
    if (!env.CORE_AUTH_AUDIENCE!.trim() || env.CORE_AUTH_AUDIENCE === "*" || env.CORE_AUTH_AUDIENCE!.length > 512 || !env.CORE_AUTH_CLIENT_ID!.trim() || env.CORE_AUTH_CLIENT_ID!.length > 256 || env.CORE_IDENTITY_BINDINGS_JSON!.length > 32_768) throw new Error("invalid_binding");
    const config: unknown = JSON.parse(env.CORE_IDENTITY_BINDINGS_JSON!);
    if (!record(config) || Object.keys(config).sort().join(",") !== "bindings,version" || config.version !== 1 || !Array.isArray(config.bindings) || config.bindings.length < 1 || config.bindings.length > 25) throw new Error("invalid_binding");
    const sources = new Set<string>();
    const targets = new Set<string>();
    let selected: Record<string, unknown> | undefined;
    for (const entry of config.bindings) {
      if (!record(entry) || Object.keys(entry).filter(name => name !== "voiceGrant").sort().join(",") !== "approvalRef,coreTenantId,coreUserId,expiresAt,issuer,neonMemberId,neonOrganizationId,neonRole,neonUserId" || entry.issuer !== NEON_ISSUER || entry.neonRole !== "owner") throw new Error("invalid_binding");
      for (const name of ["neonUserId", "neonOrganizationId", "neonMemberId", "coreUserId", "coreTenantId"]) if (typeof entry[name] !== "string" || !uuid.test(entry[name] as string)) throw new Error("invalid_binding");
      if (!canonicalCoreUuid.test(entry.coreUserId as string) || !canonicalCoreUuid.test(entry.coreTenantId as string)) throw new Error("invalid_binding");
      if (typeof entry.approvalRef !== "string" || entry.approvalRef.length < 8 || entry.approvalRef.length > 512 || typeof entry.expiresAt !== "string" || !Number.isFinite(Date.parse(entry.expiresAt))) throw new Error("invalid_binding");
      if (Object.hasOwn(entry, "voiceGrant") && !validVoiceGrant(entry.voiceGrant)) throw new Error("invalid_voice_grant");
      const source = JSON.stringify([entry.issuer, entry.neonUserId, entry.neonOrganizationId]);
      const target = JSON.stringify([entry.coreTenantId, entry.coreUserId]);
      if (sources.has(source) || targets.has(target)) throw new Error("duplicate_binding");
      sources.add(source); targets.add(target);
      if (entry.issuer === identity.issuer && entry.neonUserId === identity.userId && entry.neonOrganizationId === identity.organizationId) selected = entry;
    }
    const sessionExpiry = Date.parse(identity.sessionExpiresAt) / 1_000;
    if (!Number.isFinite(sessionExpiry) || sessionExpiry <= now + 5) return { status: "access_denied", code: "session_expired" };
    if (!selected || selected.neonMemberId !== identity.memberId || selected.neonRole !== identity.role || Date.parse(selected.expiresAt as string) / 1_000 <= now + 5) return { status: "access_denied", code: "core_identity_not_granted" };
    let scope = CHAT_SCOPES;
    const identityExpiry = Math.min(sessionExpiry, Date.parse(selected.expiresAt as string) / 1_000);
    let expiry = Math.min(now + 60, identityExpiry);
    let relayClaims: Record<string, string | number> | undefined;
    if (delegation !== "chat") {
      const grant = selected.voiceGrant;
      if (!validVoiceGrant(grant)) return { status: "access_denied", code: "voice_not_granted" };
      // An expired media grant can only release an existing Core-owned session.
      // Membership, the primary identity mapping and the Core owner check still apply.
      if (delegation !== "voice-end") {
        expiry = Math.min(expiry, Date.parse(grant.expiresAt) / 1_000);
        if (expiry <= now + 5) return { status: "access_denied", code: "voice_not_granted" };
      }
      if (delegation === "voice-start" || delegation === "voice-end") scope += " task:submit";
      if (delegation === "voice-relay") {
        if (relayMissionId && !canonicalCoreUuid.test(relayMissionId)) throw new Error("invalid_relay_mission");
        scope = "voice:relay";
        expiry = Math.min(expiry, now + 20);
        const grantExpiresAt = Math.floor(Math.min(identityExpiry, Date.parse(grant.expiresAt) / 1_000));
        const grantId = createHash("sha256").update(JSON.stringify([
          identity.issuer, identity.userId, identity.organizationId, identity.memberId, identity.sessionId,
          selected.coreUserId, selected.coreTenantId, selected.approvalRef, grant.approvalRef,
        ])).digest("hex");
        relayClaims = {
          voice_grant_expires_at: grantExpiresAt, voice_grant_id: grantId,
          ...(relayMissionId ? { voice_relay_mission_id: relayMissionId } : {}),
        };
      }
    }
    const key = createPrivateKey(env.CORE_AUTH_PRIVATE_KEY!);
    const details = key.asymmetricKeyDetails;
    if (key.asymmetricKeyType !== "rsa" || !details?.modulusLength || details.modulusLength < 2048 || details.modulusLength > 4096 || details.modulusLength % 8 !== 0 || details.publicExponent !== BigInt(65537)) throw new Error("invalid_key");
    const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encoded({ alg: "RS256", typ: "at+jwt", kid: env.CORE_AUTH_KEY_ID });
    const claims = encoded({
      iss: env.CORE_AUTH_ISSUER, aud: env.CORE_AUTH_AUDIENCE, client_id: env.CORE_AUTH_CLIENT_ID,
      sub: selected.coreUserId, tenant_id: selected.coreTenantId, roles: ["owner"], scope,
      iat: now, exp: Math.floor(expiry), jti: randomUUID(),
      ...relayClaims,
    });
    const unsigned = `${header}.${claims}`;
    const token = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url")}`;
    return { status: "ready", token, origin: CORE_ORIGIN, scopeId: identityScopeId(identity), expiresAt: Math.floor(expiry) };
  } catch {
    // Do not leak private-key parse errors, binding records or service configuration.
    return { status: "not_connected", code: "core_bridge_invalid" };
  }
}
