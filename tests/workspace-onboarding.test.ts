import test from "node:test";
import assert from "node:assert/strict";
import { AVATAR_NEON_AUTH_BASE_URL } from "../src/lib/auth/config.ts";
import { SESSION_COOKIE } from "../src/lib/auth/http.ts";
import { createManagedAuthProvider } from "../src/lib/auth/provider.ts";
import { createFirstWorkspace } from "../src/lib/auth/workspace-onboarding.ts";

const config = { baseUrl: AVATAR_NEON_AUTH_BASE_URL, appOrigin: "https://avatar-clean.example.test" };
const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  other: "00000000-0000-4000-8000-000000000002",
  organization: "00000000-0000-4000-8000-000000000003",
  otherOrganization: "00000000-0000-4000-8000-000000000004",
  member: "00000000-0000-4000-8000-000000000005",
  session: "00000000-0000-4000-8000-000000000006",
  otherSession: "00000000-0000-4000-8000-000000000007",
};
const input = { action: "createOrganization", name: "My workspace" };
type Organization = { id: string; name: string; slug: string };

function fixture() {
  const state = {
    userId: ids.user, sessionId: ids.session, activeOrganizationId: null as string | null,
    organizations: [] as Organization[], calls: [] as string[], creates: [] as Record<string, unknown>[],
    signedOut: false, banned: false, expired: false, mismatchedUser: false,
    listStatus: 200, listMalformed: false, dropCreateResponse: false, dropCreateBeforePersist: false,
    createdResponseId: ids.organization, createdResponseMalformed: false,
    memberOverride: {} as Record<string, unknown>, memberStatus: 200,
    changeUserAfterCreate: false, changeSessionAfterCreate: false, leaveInactive: false,
    creationStatus: 200,
  };
  const fetcher: typeof fetch = async (target, init) => {
    const url = new URL(String(target));
    const endpoint = url.pathname.slice("/neondb/auth/".length);
    state.calls.push(endpoint);
    assert.equal(url.origin, new URL(config.baseUrl).origin);
    assert.equal(new Headers(init?.headers).get("cookie"), `${SESSION_COOKIE}=synthetic-session`);
    assert.equal(new Headers(init?.headers).get("origin"), config.appOrigin);
    if (endpoint === "get-session") {
      assert.equal(url.searchParams.get("disableCookieCache"), "true");
      return Response.json(state.signedOut ? null : {
        user: { id: state.userId, name: "Example User", email: "account@example.test", emailVerified: true, banned: state.banned },
        session: {
          id: state.sessionId, userId: state.mismatchedUser ? ids.other : state.userId,
          activeOrganizationId: state.activeOrganizationId,
          expiresAt: state.expired ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
          token: "body-token-not-for-browser",
        },
      });
    }
    if (endpoint === "organization/list") return Response.json(
      state.listMalformed ? { organizations: [] } : state.organizations,
      { status: state.listStatus },
    );
    if (endpoint === "organization/create") {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      state.creates.push(body);
      assert.deepEqual(Object.keys(body).sort(), ["keepCurrentActiveOrganization", "name", "slug"]);
      assert.equal(body.keepCurrentActiveOrganization, false);
      assert.match(String(body.slug), /^avatar-[0-9a-f]{32}$/);
      if (state.dropCreateBeforePersist) throw new Error("Simulated connection loss before persistence");
      if (state.creationStatus !== 200) return Response.json({ code: "CREATE_DENIED" }, { status: state.creationStatus });
      if (state.organizations.some((item) => item.slug === body.slug)) return Response.json({ code: "ORGANIZATION_ALREADY_EXISTS" }, { status: 400 });
      const created = { id: ids.organization, name: String(body.name), slug: String(body.slug) };
      state.organizations.push(created);
      if (!state.leaveInactive) state.activeOrganizationId = created.id;
      if (state.changeUserAfterCreate) state.userId = ids.other;
      if (state.changeSessionAfterCreate) state.sessionId = ids.otherSession;
      if (state.dropCreateResponse) throw new Error("Simulated lost response after persistence");
      return Response.json(state.createdResponseMalformed ? { unknown: true } : { ...created, id: state.createdResponseId });
    }
    if (endpoint === "organization/set-active") {
      const body = JSON.parse(String(init?.body));
      assert.ok(state.organizations.some((item) => item.id === body.organizationId));
      state.activeOrganizationId = body.organizationId;
      return Response.json({ id: state.activeOrganizationId });
    }
    if (endpoint === "organization/get-active-member") return Response.json({
      id: ids.member, userId: state.userId, organizationId: state.activeOrganizationId,
      role: "owner", ...state.memberOverride,
    }, { status: state.memberStatus });
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };
  const provider = (override: typeof fetch = fetcher) => createManagedAuthProvider(config, `${SESSION_COOKIE}=synthetic-session`, override);
  return { state, fetcher, provider };
}

test("first workspace uses only the explicit name and a server-derived slug, then proves live owner membership", async () => {
  const { state, provider } = fixture();
  const result = await createFirstWorkspace(provider(), config.baseUrl, { ...input, name: "  My workspace  " });
  assert.equal(result.httpStatus, 201);
  assert.equal(result.session.status, "authenticated");
  assert.equal(result.session.workspaceCreation, "created");
  assert.deepEqual(result.session.organization, { id: ids.organization, role: "owner" });
  assert.equal(state.creates[0].name, "My workspace");
  assert.equal(state.creates.length, 1);
  assert.ok(state.calls.indexOf("organization/create") > state.calls.indexOf("organization/list"));
  assert.ok(state.calls.indexOf("organization/get-active-member") > state.calls.indexOf("organization/create"));
  const exposed = JSON.stringify(result.session);
  for (const secret of [ids.user, ids.session, "body-token", "coreTenantId", "coreUserId"]) assert.ok(!exposed.includes(secret));
});

test("invalid names and caller-supplied identity, role, tenant or slug are rejected before any provider request", async () => {
  for (const data of [
    { ...input, name: " " }, { ...input, name: "a".repeat(81) }, { ...input, name: "Hidden\u202eName" },
    { ...input, name: "One\nTwo" }, { ...input, name: null },
    ...["userId", "role", "organizationId", "tenantId", "slug"].map((key) => ({ ...input, [key]: "forged" })),
  ]) {
    const { state, provider } = fixture();
    const result = await createFirstWorkspace(provider(), config.baseUrl, data);
    assert.equal(result.httpStatus, 400);
    assert.equal(state.calls.length, 0);
  }
});

test("signed-out, expired, banned and mismatched sessions cannot create a workspace", async () => {
  for (const kind of ["signedOut", "expired", "banned", "mismatchedUser"] as const) {
    const { state, provider } = fixture(); state[kind] = true;
    const result = await createFirstWorkspace(provider(), config.baseUrl, input);
    assert.ok(["anonymous", "access_denied"].includes(result.session.status));
    assert.equal(state.creates.length, 0);
  }
});

test("existing membership keeps the ordinary selector and never creates a second workspace", async () => {
  const { state, provider } = fixture();
  state.organizations.push({ id: ids.otherOrganization, name: "Existing team", slug: "existing-team" });
  const result = await createFirstWorkspace(provider(), config.baseUrl, input);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.session.code, "FIRST_WORKSPACE_ALREADY_EXISTS");
  assert.equal(state.creates.length, 0);
});

test("unavailable or malformed membership lists are never treated as an empty list", async () => {
  for (const kind of ["unavailable", "malformed"] as const) {
    const { state, provider } = fixture();
    if (kind === "unavailable") state.listStatus = 503;
    else state.listMalformed = true;
    const result = await createFirstWorkspace(provider(), config.baseUrl, input);
    assert.equal(result.session.status, "unavailable");
    assert.equal(state.creates.length, 0);
  }
});

test("create success alone cannot authorize a foreign, missing or non-owner membership", async () => {
  for (const override of [{ userId: ids.other }, { organizationId: ids.otherOrganization }, { role: "admin" }, { id: null }]) {
    const { state, provider } = fixture(); state.memberOverride = override;
    const result = await createFirstWorkspace(provider(), config.baseUrl, input);
    assert.equal(result.session.status, "access_denied");
    assert.equal(result.session.workspaceCreation, undefined);
  }
});

test("a changed account or session after creation cannot be accepted as the initiating principal", async () => {
  for (const key of ["changeUserAfterCreate", "changeSessionAfterCreate"] as const) {
    const { state, provider } = fixture(); state[key] = true;
    const result = await createFirstWorkspace(provider(), config.baseUrl, input);
    assert.equal(result.session.status, "access_denied");
    assert.equal(result.session.code, "WORKSPACE_IDENTITY_CHANGED");
    assert.equal(result.session.workspaceCreation, undefined);
  }
});

test("a lost create response recovers the same owned workspace without a second create, including retry with another name", async () => {
  const { state, provider } = fixture(); state.dropCreateResponse = true; state.leaveInactive = true;
  const result = await createFirstWorkspace(provider(), config.baseUrl, input);
  assert.equal(result.session.status, "authenticated");
  assert.equal(result.session.workspaceCreation, "recovered");
  assert.equal(state.creates.length, 1);
  assert.equal(state.calls.filter((path) => path === "organization/set-active").length, 1);
  const retry = await createFirstWorkspace(provider(), config.baseUrl, { ...input, name: "A different name" });
  assert.equal(retry.session.workspaceCreation, "recovered");
  assert.equal(state.creates.length, 1);
  assert.equal(state.organizations.length, 1);
  assert.equal(state.organizations[0].name, input.name);
});

test("an unknown create outcome with no verified workspace reports uncertainty and does not retry the write", async () => {
  const { state, provider } = fixture(); state.dropCreateBeforePersist = true;
  const result = await createFirstWorkspace(provider(), config.baseUrl, input);
  assert.equal(result.session.status, "unavailable");
  assert.equal(result.session.code, "WORKSPACE_CREATION_UNVERIFIED");
  assert.equal(state.creates.length, 1);
  assert.equal(state.organizations.length, 0);
});

test("contradictory create ID and fresh membership list fail closed", async () => {
  const { state, provider } = fixture(); state.createdResponseId = ids.otherOrganization;
  const result = await createFirstWorkspace(provider(), config.baseUrl, input);
  assert.equal(result.session.status, "access_denied");
  assert.equal(result.session.code, "WORKSPACE_CREATION_MISMATCH");
});

test("concurrent empty-list submissions use one stable slug and reconcile one provider-created workspace", async () => {
  const { state, provider, fetcher } = fixture();
  let emptyReads = 0;
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => { release = resolve; });
  const concurrentFetch: typeof fetch = async (target, init) => {
    if (new URL(String(target)).pathname.endsWith("/organization/list") && emptyReads < 2) {
      emptyReads++;
      if (emptyReads === 2) release();
      await bothRead;
      return Response.json([]);
    }
    return fetcher(target, init);
  };
  const results = await Promise.all([
    createFirstWorkspace(provider(concurrentFetch), config.baseUrl, input),
    createFirstWorkspace(provider(concurrentFetch), config.baseUrl, { ...input, name: "Another tab" }),
  ]);
  assert.deepEqual(results.map((item) => item.session.workspaceCreation).sort(), ["created", "recovered"]);
  assert.equal(state.organizations.length, 1);
  assert.equal(state.creates.length, 2);
  assert.equal(state.creates[0].slug, state.creates[1].slug);
  assert.equal(results[0].session.organization?.id, results[1].session.organization?.id);
});
