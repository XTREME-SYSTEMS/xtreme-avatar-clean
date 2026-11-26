import { createHash } from "node:crypto";
import type { AccountReply } from "./account-service";
import type { ManagedAuthProvider } from "./provider";
import type { AccountSession, OrganizationChoice } from "./types";
import { isRecord } from "./provider.ts";
import { organizationChoices, resolveIdentity } from "./identity.ts";

const organizationId = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function respond(provider: ManagedAuthProvider, session: AccountSession, httpStatus: number): AccountReply {
  return { session, httpStatus, cookies: provider.changedCookies() };
}

function unavailable(provider: ManagedAuthProvider, code = "WORKSPACE_CREATION_UNVERIFIED", httpStatus = 503): AccountReply {
  return respond(provider, { status: "unavailable", code }, httpStatus);
}

function denied(provider: ManagedAuthProvider, code: string, httpStatus = 403): AccountReply {
  return respond(provider, { status: "access_denied", code }, httpStatus);
}

async function freshPrincipal(provider: ManagedAuthProvider, issuer: string) {
  const snapshot = await provider.getSession();
  // Validate the same fresh read without a second request or a local session cache.
  const resolution = await resolveIdentity({
    getSession: async () => snapshot,
    getActiveMember: () => provider.getActiveMember(),
  }, issuer);
  const valid = resolution.status === "authenticated" || resolution.status === "membership_required";
  const data = snapshot.data;
  return {
    resolution,
    userId: valid && isRecord(data) && isRecord(data.user) && typeof data.user.id === "string" ? data.user.id : null,
    sessionId: valid && isRecord(data) && isRecord(data.session) && typeof data.session.id === "string" ? data.session.id : null,
  };
}

type Principal = Awaited<ReturnType<typeof freshPrincipal>>;

function principalFailure(provider: ManagedAuthProvider, principal: Principal): AccountReply | null {
  const { resolution } = principal;
  if (resolution.status === "anonymous") return respond(provider, { status: "anonymous" }, 401);
  if (resolution.status === "access_denied") return denied(provider, resolution.code);
  if (resolution.status === "unavailable") return unavailable(provider, resolution.code);
  if (!principal.userId || !principal.sessionId) return unavailable(provider, "AUTH_RESPONSE_INVALID");
  return null;
}

type WorkspaceList = { choices: OrganizationChoice[]; matching?: OrganizationChoice; failure?: never } | { failure: AccountReply };

async function listWorkspaces(provider: ManagedAuthProvider, slug: string): Promise<WorkspaceList> {
  const result = await provider.listOrganizations();
  if (result.error?.status === 401) return { failure: respond(provider, { status: "anonymous" }, 401) };
  if (result.error?.status === 403) return { failure: denied(provider, "WORKSPACE_CREATE_DENIED") };
  if (result.error) return { failure: unavailable(provider, "MEMBERSHIP_UNAVAILABLE") };
  const choices = organizationChoices(result.data);
  if (!choices || !Array.isArray(result.data)) return { failure: unavailable(provider, "MEMBERSHIP_UNAVAILABLE") };
  const matches = result.data.filter((item) => isRecord(item) && item.slug === slug);
  if (matches.length > 1) return { failure: unavailable(provider, "AUTH_RESPONSE_INVALID") };
  const matching = matches.length === 1 ? choices.find((item) => item.id === matches[0].id) : undefined;
  return { choices, matching };
}

async function verifyWorkspace(
  provider: ManagedAuthProvider, issuer: string, original: Principal,
  workspace: OrganizationChoice, choices: OrganizationChoice[], outcome: "created" | "recovered",
): Promise<AccountReply> {
  let current = await freshPrincipal(provider, issuer);
  let failure = principalFailure(provider, current);
  if (failure) return failure;
  if (current.userId !== original.userId || current.sessionId !== original.sessionId) {
    return denied(provider, "WORKSPACE_IDENTITY_CHANGED");
  }
  if (current.resolution.status !== "authenticated" || current.resolution.identity.organizationId !== workspace.id) {
    // The candidate came from this session's own membership list and exact stable
    // first-workspace slug. Recover selection; never repeat an uncertain create.
    const selected = await provider.setActiveOrganization(workspace.id);
    if (selected.error?.status === 401) return respond(provider, { status: "anonymous" }, 401);
    if (selected.error) return selected.error.status >= 500 || selected.error.status === 429
      ? unavailable(provider) : denied(provider, "WORKSPACE_SELECTION_UNVERIFIED");
    current = await freshPrincipal(provider, issuer);
    failure = principalFailure(provider, current);
    if (failure) return failure;
  }
  const verified = current.resolution;
  if (current.userId !== original.userId || current.sessionId !== original.sessionId ||
    verified.status !== "authenticated" || verified.identity.organizationId !== workspace.id || verified.identity.role !== "owner") {
    return denied(provider, "WORKSPACE_OWNER_UNVERIFIED");
  }
  return respond(provider, {
    status: "authenticated", user: verified.user,
    organization: { id: verified.identity.organizationId, role: verified.identity.role },
    organizations: choices, workspaceCreation: outcome,
  }, outcome === "created" ? 201 : 200);
}

/**
 * Explicit first-workspace onboarding through the existing Managed Neon service.
 * Live contract: /open-api/generate-schema, POST /organization/create.
 * https://neon.com/docs/auth/guides/plugins/organization
 * The provider assigns its configured creator role. This creates no Core identity,
 * binding, tenant, grant, or historical-memory mapping.
 */
export async function createFirstWorkspace(provider: ManagedAuthProvider, issuer: string, input: unknown): Promise<AccountReply> {
  if (!isRecord(input) || Object.keys(input).some((key) => key !== "action" && key !== "name") ||
    input.action !== "createOrganization" || typeof input.name !== "string") {
    return denied(provider, "INVALID_WORKSPACE_NAME", 400);
  }
  const name = input.name.normalize("NFC").trim();
  if (!name || name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name)) return denied(provider, "INVALID_WORKSPACE_NAME", 400);

  const original = await freshPrincipal(provider, issuer);
  const failure = principalFailure(provider, original);
  if (failure) return failure;
  // Stable across retries and tabs, and independent of caller-supplied names.
  // Provider slug uniqueness prevents duplicate first workspaces after timeouts.
  const slug = `avatar-${createHash("sha256").update(JSON.stringify([issuer, original.userId])).digest("hex").slice(0, 32)}`;
  const before = await listWorkspaces(provider, slug);
  if (before.failure) return before.failure;
  if (before.matching) return verifyWorkspace(provider, issuer, original, before.matching, before.choices, "recovered");
  if (before.choices.length || original.resolution.status === "authenticated") {
    return denied(provider, "FIRST_WORKSPACE_ALREADY_EXISTS", 409);
  }

  const created = await provider.createOrganization(name, slug);
  if (created.error?.status === 401) return respond(provider, { status: "anonymous" }, 401);
  if (created.error?.status === 403) return denied(provider, "WORKSPACE_CREATE_DENIED");
  if (created.error?.status === 429) return unavailable(provider, "WORKSPACE_RATE_LIMITED", 429);
  const responseProvesId = !created.error && isRecord(created.data) && organizationId(created.data.id) && created.data.slug === slug;
  const after = await listWorkspaces(provider, slug);
  if (after.failure) return after.failure;
  if (!after.matching) return unavailable(provider);
  // A successful but contradictory provider response cannot authorize another ID.
  if (responseProvesId && isRecord(created.data) && created.data.id !== after.matching.id) {
    return denied(provider, "WORKSPACE_CREATION_MISMATCH");
  }
  return verifyWorkspace(provider, issuer, original, after.matching, after.choices, responseProvesId ? "created" : "recovered");
}
