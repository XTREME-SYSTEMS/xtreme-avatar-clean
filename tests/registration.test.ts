import test from "node:test";
import assert from "node:assert/strict";
import { AVATAR_NEON_AUTH_BASE_URL } from "../src/lib/auth/config.ts";
import { privateJson, SESSION_COOKIE } from "../src/lib/auth/http.ts";
import { registerEmailAccount } from "../src/lib/auth/registration.ts";

const config = { baseUrl: AVATAR_NEON_AUTH_BASE_URL, appOrigin: "https://avatar-clean.example.test" };
const input = { name: "Example Account", email: "account@example.test", password: "test-only-password" };
const userId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const opaque = "synthetic-signup-session";
const cookie = `${SESSION_COOKIE}=${opaque}; Max-Age=3600; Secure; HttpOnly`;
const liveSession = () => ({
  user: { id: userId, name: input.name, email: input.email, emailVerified: false, banned: false },
  session: { id: "test-session", userId, expiresAt: "2099-01-01T00:00:00Z", activeOrganizationId: null, token: "never-expose-body-token" },
});

function fixture() {
  const state = {
    calls: [] as { url: URL; init?: RequestInit }[],
    created: { user: liveSession().user, token: "never-expose-body-token" } as unknown,
    fresh: liveSession() as unknown, existing: null as unknown,
    signupStatus: 200, freshStatus: 200, existingStatus: 200,
    cookies: [cookie], freshCookies: [] as string[], dropResponse: false,
  };
  const fetcher: typeof fetch = async (target, init) => {
    const url = new URL(String(target)); state.calls.push({ url, init });
    let body: unknown;
    let status: number;
    let setCookies: string[] = [];
    if (url.pathname.endsWith("/sign-up/email")) {
      if (state.dropResponse) throw new Error("Simulated lost registration response; no retry allowed");
      status = state.signupStatus;
      body = status === 200 ? state.created : { code: "USER_ALREADY_EXISTS", message: "private-provider-detail" };
      setCookies = state.cookies;
    } else if (url.pathname.endsWith("/get-session")) {
      const existing = new Headers(init?.headers).get("cookie") === `${SESSION_COOKIE}=old-session`;
      body = existing ? state.existing : state.fresh;
      status = existing ? state.existingStatus : state.freshStatus;
      setCookies = existing ? [] : state.freshCookies;
    } else throw new Error(`Unexpected provider action: ${url.pathname}`);
    const headers = new Headers();
    for (const value of setCookies) headers.append("Set-Cookie", value);
    return Response.json(body, { status, headers });
  };
  return { state, fetcher };
}

test("signup uses only the fixed managed endpoint, fixed callback and explicit credentials, then verifies a fresh session", async () => {
  const { state, fetcher } = fixture();
  const result = await registerEmailAccount(config, "irrelevant=not-forwarded", { ...input, name: `  ${input.name}  `, email: "  ACCOUNT@EXAMPLE.TEST  " }, fetcher);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "signed_in");
  assert.equal(result.status, 200);
  assert.deepEqual(state.calls.map(({ url }) => url.pathname), ["/neondb/auth/sign-up/email", "/neondb/auth/get-session"]);
  const first = state.calls[0];
  assert.equal(first.url.origin, new URL(config.baseUrl).origin);
  assert.equal(first.init?.method, "POST");
  assert.equal(first.init?.cache, "no-store");
  assert.equal(first.init?.redirect, "error");
  assert.equal(new Headers(first.init?.headers).get("cookie"), null);
  assert.equal(new Headers(first.init?.headers).get("origin"), config.appOrigin);
  assert.equal(new Headers(first.init?.headers).get("x-neon-auth-middleware"), "true");
  assert.deepEqual(JSON.parse(String(first.init?.body)), { ...input, callbackURL: `${config.appOrigin}/account`, rememberMe: true });
  assert.equal(state.calls[1].url.searchParams.get("disableCookieCache"), "true");
  assert.equal(new Headers(state.calls[1].init?.headers).get("cookie"), `${SESSION_COOKIE}=${opaque}`);
  assert.equal(result.cookies.find((item) => item.name === SESSION_COOKIE)?.value, opaque);
  const publicReply = privateJson({ ok: true, outcome: result.outcome }, result.status, result.cookies);
  assert.match(publicReply.headers.get("cache-control") ?? "", /private, no-store/);
  assert.equal(publicReply.headers.get("x-content-type-options"), "nosniff");
  assert.equal(publicReply.headers.get("referrer-policy"), "no-referrer");
  assert.match(publicReply.headers.getSetCookie()[0], /HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(await publicReply.text(), /test-only-password|body-token|synthetic-signup-session|emailVerified|userId|owner|coreTenant/);
});

test("invalid fields and caller-selected identity, role, tenant, verification or callback fail before provider access", async () => {
  const cases: unknown[] = [null, [], {}, { ...input, name: " " }, { ...input, name: "a".repeat(81) },
    { ...input, name: "Hidden\u202eName" }, { ...input, email: "bad-email" }, { ...input, email: "a".repeat(321) },
    { ...input, email: "hidden\u0000@example.test" }, { ...input, password: "short" }, { ...input, password: "p".repeat(129) },
    { ...input, password: null },
    ...["role", "userId", "tenantId", "organizationId", "emailVerified", "callbackURL", "rememberMe", "confirmPassword"].map((key) => ({ ...input, [key]: "forged" })),
  ];
  for (const data of cases) {
    const { state, fetcher } = fixture();
    const result = await registerEmailAccount(config, null, data, fetcher);
    assert.deepEqual(result, { ok: false, status: 400, code: "INVALID_REGISTRATION_INPUT", cookies: [] });
    assert.equal(state.calls.length, 0);
  }
});

test("documented password bounds are accepted without trimming the secret", async () => {
  for (const password of ["12345678", "x".repeat(128), "  password with spaces  "]) {
    const { state, fetcher } = fixture();
    const result = await registerEmailAccount(config, null, { ...input, password }, fetcher);
    assert.equal(result.ok, true);
    assert.equal(JSON.parse(String(state.calls[0].init?.body)).password, password);
  }
});

test("an existing live account cannot be silently replaced by registration", async () => {
  const { state, fetcher } = fixture(); state.existing = liveSession();
  const result = await registerEmailAccount(config, `${SESSION_COOKIE}=old-session`, input, fetcher);
  assert.deepEqual(result, { ok: false, status: 409, code: "ALREADY_SIGNED_IN", cookies: [] });
  assert.equal(state.calls.length, 1);
  assert.ok(state.calls[0].url.pathname.endsWith("/get-session"));
});

test("ambiguous cookies and unavailable or malformed current sessions cannot initiate registration", async () => {
  const duplicate = fixture();
  const result = await registerEmailAccount(config, `${SESSION_COOKIE}=one; ${SESSION_COOKIE}=two`, input, duplicate.fetcher);
  assert.equal(result.ok, false); assert.equal(duplicate.state.calls.length, 0);
  for (const kind of ["outage", "malformed", "expired", "banned"] as const) {
    const { state, fetcher } = fixture();
    if (kind === "outage") state.existingStatus = 503;
    if (kind === "malformed") state.existing = {};
    if (kind === "expired") state.existing = { ...liveSession(), session: { ...liveSession().session, expiresAt: "2000-01-01T00:00:00Z" } };
    if (kind === "banned") state.existing = { ...liveSession(), user: { ...liveSession().user, banned: true } };
    const reply = await registerEmailAccount(config, `${SESSION_COOKIE}=old-session`, input, fetcher);
    assert.equal(reply.ok, false); assert.equal(state.calls.length, 1);
  }
});

test("confirmed absent or expired old cookies are not forwarded into a new signup", async () => {
  for (const status of [200, 401]) {
    const { state, fetcher } = fixture(); state.existingStatus = status;
    const result = await registerEmailAccount(config, `${SESSION_COOKIE}=old-session`, input, fetcher);
    assert.equal(result.ok, true);
    assert.equal(new Headers(state.calls[1].init?.headers).get("cookie"), null);
    assert.equal(state.calls.filter(({ url }) => url.pathname.endsWith("/sign-up/email")).length, 1);
  }
});

test("duplicate accounts and provider denials return fixed guidance without exposing descriptions or granting a session", async () => {
  for (const [status, code] of [[422, "SIGN_UP_NOT_COMPLETED"], [400, "SIGN_UP_NOT_COMPLETED"], [403, "SIGN_UP_NOT_ALLOWED"], [429, "TOO_MANY_ATTEMPTS"]] as const) {
    const { state, fetcher } = fixture(); state.signupStatus = status;
    const result = await registerEmailAccount(config, null, input, fetcher);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.code, code); assert.deepEqual(result.cookies, []);
    assert.doesNotMatch(JSON.stringify(result), /private-provider-detail|USER_ALREADY_EXISTS|test-only-password/);
    assert.equal(state.calls.length, 1);
  }
});

test("synthetic success and body tokens without a managed cookie produce only neutral follow-up", async () => {
  for (const token of [null, "never-trust-this-body-token", undefined]) {
    const { state, fetcher } = fixture(); state.cookies = []; state.created = { user: liveSession().user, token };
    const result = await registerEmailAccount(config, null, input, fetcher);
    assert.deepEqual(result, { ok: true, status: 202, outcome: "follow_up", cookies: [] });
    assert.equal(state.calls.length, 1);
  }
});

test("malformed or foreign signup user cannot be accepted with or without a cookie", async () => {
  for (const created of [{}, { user: { ...liveSession().user, id: "" } }, { user: { ...liveSession().user, email: "other@example.test" } }, { user: { ...liveSession().user, banned: true } }]) {
    const { state, fetcher } = fixture(); state.created = created;
    const result = await registerEmailAccount(config, null, input, fetcher);
    assert.equal(result.ok, false); assert.deepEqual(result.cookies, []);
    assert.equal(state.calls.length, 1);
  }
});

test("fresh cookie readback must match the signup user, submitted email, active session and enabled account", async () => {
  const live = liveSession();
  for (const fresh of [null, {},
    { ...live, user: { ...live.user, id: otherId }, session: { ...live.session, userId: otherId } },
    { ...live, user: { ...live.user, email: "other@example.test" } },
    { ...live, user: { ...live.user, banned: true } },
    { ...live, session: { ...live.session, id: "" } },
    { ...live, session: { ...live.session, userId: otherId } },
    { ...live, session: { ...live.session, expiresAt: "2000-01-01T00:00:00Z" } },
    { ...live, session: { ...live.session, expiresAt: "invalid-date" } },
  ]) {
    const { state, fetcher } = fixture(); state.fresh = fresh;
    const result = await registerEmailAccount(config, null, input, fetcher);
    assert.deepEqual(result, { ok: false, status: 503, code: "SIGN_UP_UNVERIFIED", cookies: [] });
  }
});

test("expired or revoked managed cookies never yield successful signup even with a user-shaped response", async () => {
  for (const phase of ["signup", "readback"] as const) {
    const { state, fetcher } = fixture();
    const expired = `${SESSION_COOKIE}=expired-session; Max-Age=0`;
    if (phase === "signup") state.cookies = [expired];
    else state.freshCookies = [expired];
    const result = await registerEmailAccount(config, null, input, fetcher);
    assert.equal(result.ok, false); assert.deepEqual(result.cookies, []);
  }
});

test("transport loss, upstream failure and failed session readback stay uncertain without retrying the write", async () => {
  for (const phase of ["lost-response", "upstream-error", "readback"] as const) {
    const { state, fetcher } = fixture();
    if (phase === "lost-response") state.dropResponse = true;
    else if (phase === "upstream-error") state.signupStatus = 503;
    else state.freshStatus = 503;
    const result = await registerEmailAccount(config, null, input, fetcher);
    assert.deepEqual(result, { ok: false, status: 503, code: "SIGN_UP_UNVERIFIED", cookies: [] });
    assert.equal(state.calls.filter(({ url }) => url.pathname.endsWith("/sign-up/email")).length, 1);
  }
});
