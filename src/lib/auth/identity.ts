import type { AccountUser, AuthResolution, OrganizationChoice } from "./types";
import type { ProviderResult } from "./provider";
import { isRecord } from "./provider.ts";

type IdentityProvider = { getSession(): Promise<ProviderResult>; getActiveMember(): Promise<ProviderResult> };
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128;

function profile(user: Record<string, unknown>): AccountUser {
  return {
    name: typeof user.name === "string" ? user.name.slice(0, 160) : "Your account",
    email: typeof user.email === "string" ? user.email.slice(0, 320) : "",
    emailVerified: user.emailVerified === true,
  };
}

/** Authenticated identity, active scope, and live membership must all agree. */
export async function resolveIdentity(provider: IdentityProvider, issuer: string, now = Date.now()): Promise<AuthResolution> {
  try {
    const reply = await provider.getSession();
    if (reply.error) return reply.error.status === 401
      ? { status: "anonymous" } : { status: "unavailable", code: "AUTH_UNAVAILABLE" };
    if (reply.data === null) return { status: "anonymous" };
    if (!isRecord(reply.data) || !isRecord(reply.data.user) || !isRecord(reply.data.session)) {
      return { status: "unavailable", code: "AUTH_RESPONSE_INVALID" };
    }
    const { user, session } = reply.data;
    if (!id(user.id) || !id(session.id) || session.userId !== user.id) {
      return { status: "access_denied", code: "IDENTITY_MISMATCH" };
    }
    const expiresAt = typeof session.expiresAt === "string" || session.expiresAt instanceof Date
      ? new Date(session.expiresAt).getTime() : NaN;
    if (!Number.isFinite(expiresAt)) return { status: "unavailable", code: "AUTH_RESPONSE_INVALID" };
    if (expiresAt <= now) return { status: "anonymous" };
    const accountUser = profile(user);
    if (user.banned === true) return { status: "access_denied", code: "ACCOUNT_DISABLED", user: accountUser };
    if (session.activeOrganizationId === null || session.activeOrganizationId === undefined) {
      return { status: "membership_required", user: accountUser };
    }
    if (!id(session.activeOrganizationId)) return { status: "access_denied", code: "INVALID_ORGANIZATION", user: accountUser };

    const membership = await provider.getActiveMember();
    if (membership.error) {
      if (membership.error.status === 401) return { status: "anonymous" };
      return membership.error.status >= 500 || membership.error.status === 429
        ? { status: "unavailable", code: "MEMBERSHIP_UNAVAILABLE" }
        : { status: "access_denied", code: "MEMBERSHIP_MISSING", user: accountUser };
    }
    const member = membership.data;
    if (!isRecord(member) || !id(member.id) || member.userId !== user.id || member.organizationId !== session.activeOrganizationId) {
      return { status: "access_denied", code: "MEMBERSHIP_MISMATCH", user: accountUser };
    }
    if (member.role !== "owner" && member.role !== "admin" && member.role !== "member") {
      return { status: "access_denied", code: "UNSUPPORTED_ROLE", user: accountUser };
    }
    return {
      status: "authenticated", user: accountUser,
      identity: {
        issuer, userId: user.id, sessionId: session.id, sessionExpiresAt: new Date(expiresAt).toISOString(),
        organizationId: member.organizationId, memberId: member.id, role: member.role, emailVerified: user.emailVerified === true,
      },
    };
  } catch { return { status: "unavailable", code: "AUTH_UNAVAILABLE" }; }
}

export function organizationChoices(value: unknown): OrganizationChoice[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const choices: OrganizationChoice[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !id(item.id) || typeof item.name !== "string" || !item.name.trim() || seen.has(item.id)) return null;
    seen.add(item.id);
    choices.push({ id: item.id, name: item.name.slice(0, 160) });
  }
  return choices;
}
