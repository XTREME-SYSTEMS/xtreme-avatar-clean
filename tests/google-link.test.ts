import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { AVATAR_NEON_AUTH_BASE_URL } from "../src/lib/auth/config.ts";
import { SESSION_COOKIE, CHALLENGE_COOKIE } from "../src/lib/auth/http.ts";
import { beginGoogleLink, completeGoogleLink, readGoogleConnection } from "../src/lib/auth/google-link.ts";
import { GOOGLE_LINK_COOKIE, googleLinkCookie, issueGoogleLinkState, matchesGoogleLinkPrincipal, readGoogleLinkKey, readGoogleLinkState } from "../src/lib/auth/google-link-state.ts";

const config = { baseUrl: AVATAR_NEON_AUTH_BASE_URL, appOrigin: "https://avatar-clean.example.test" };
// Deliberately deterministic fixture bytes, never a provisioned or usable hosted secret.
const fixtureKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1));
const env = { AVATAR_AUTH_FLOW_SECRET: fixtureKey.toString("base64url") };
const userId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const sessionCookie = `${SESSION_COOKIE}=original-session`;
const expiry = "2099-01-01T00:00:00Z";
const principal = { userId, sessionId, expiresAt: Date.parse(expiry) };
const session = () => ({ user: { id: userId, name: "Fixture", email: "account@example.test", emailVerified: false, banned: false }, session: { id: sessionId, userId, expiresAt: expiry, activeOrganizationId: null } });
const row = (providerId = "credential") => ({ id: `account-${providerId}`, providerId, accountId: `provider-${providerId}`, userId, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", scopes: [] });

function fixture() {
  const state = {
    calls: [] as { url: URL; init?: RequestInit }[],
    session: session() as unknown, accounts: [row()] as unknown,
    sessionCookies: [] as string[], listCookies: [] as string[], linkCookies: [] as string[],
    readCount: 0, switchOnRead: 0, nullOnRead: 0,
    linkStatus: 200, listStatus: 200, sessionStatus: 200, dropLink: false,
    linkData: { url: "https://accounts.google.com/o/oauth2/v2/auth?state=provider-owned", redirect: false } as unknown,
  };
  const fetcher: typeof fetch = async (target, init) => {
    const url = new URL(String(target)); state.calls.push({ url, init });
    let data: unknown; let status = 200; let cookies: string[] = [];
    if (url.pathname.endsWith("/get-session")) {
      state.readCount++;
      data = state.session; status = state.sessionStatus; cookies = state.sessionCookies;
      if (state.switchOnRead === state.readCount) data = { ...session(), user: { ...session().user, id: otherId }, session: { ...session().session, userId: otherId } };
      if (state.nullOnRead === state.readCount) data = null;
    } else if (url.pathname.endsWith("/list-accounts")) {
      data = state.accounts; status = state.listStatus; cookies = state.listCookies;
    } else if (url.pathname.endsWith("/link-social")) {
      if (state.dropLink) throw new Error("Simulated network loss after start; no retry permitted");
      data = state.linkStatus === 200 ? state.linkData : { code: "LINKING_NOT_ALLOWED", message: "private-provider-description" };
      status = state.linkStatus; cookies = state.linkCookies;
    } else throw new Error(`Unexpected endpoint ${url.pathname}`);
    const headers = new Headers(); for (const value of cookies) headers.append("Set-Cookie", value);
    return Response.json(data, { status, headers });
  };
  return { state, fetcher };
}

function marker(now = Date.now()) {
  const value = issueGoogleLinkState(fixtureKey, config, principal, now);
  return { ...value, cookies: `${sessionCookie}; ${GOOGLE_LINK_COOKIE}=${value.cookie}`, url: new URL(`${config.appOrigin}/auth/callback/google/link?attempt=${value.state.attempt}`) };
}

test("a valid personal session without a workspace starts only the fixed Google link flow", async () => {
  const { state, fetcher } = fixture();
  const result = await beginGoogleLink(config, `${sessionCookie}; ${CHALLENGE_COOKIE}=unrelated-login-challenge`, {}, env, fetcher);
  assert.equal(result.ok, true); if (!result.ok || result.alreadyLinked) return;
  assert.match(result.url, /^https:\/\/accounts\.google\.com\//);
  const write = state.calls.find(({ url }) => url.pathname.endsWith("/link-social")); assert.ok(write);
  const body = JSON.parse(String(write.init?.body));
  assert.deepEqual(Object.keys(body).sort(), ["callbackURL", "disableRedirect", "errorCallbackURL", "provider"]);
  assert.equal(body.provider, "google"); assert.equal(body.disableRedirect, true);
  assert.equal(body.callbackURL, body.errorCallbackURL);
  const callback = new URL(body.callbackURL); assert.equal(callback.origin, config.appOrigin); assert.equal(callback.pathname, "/auth/callback/google/link");
  const parsed = readGoogleLinkState(`${GOOGLE_LINK_COOKIE}=${result.marker}`, fixtureKey, config); assert.ok(parsed);
  assert.equal(callback.searchParams.get("attempt"), parsed.attempt);
  assert.equal(matchesGoogleLinkPrincipal(parsed, fixtureKey, config, principal), true);
  for (const call of state.calls) {
    assert.equal(call.url.origin, new URL(config.baseUrl).origin);
    assert.equal(new Headers(call.init?.headers).get("cookie"), sessionCookie);
    assert.equal(new Headers(call.init?.headers).get("origin"), config.appOrigin);
    assert.equal(call.init?.cache, "no-store"); assert.equal(call.init?.redirect, "error");
    assert.equal(call.url.searchParams.has("neon_auth_session_verifier"), false);
  }
  assert.doesNotMatch(JSON.stringify(result), /original-session|unrelated-login-challenge|private-provider-description/);
  assert.doesNotMatch(Buffer.from(result.marker.split(".")[0], "base64url").toString(), new RegExp(`${userId}|${sessionId}`));
  assert.match(googleLinkCookie(result.marker), /^__Host-avatar_google_link=.*; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
});

test("missing or invalid key disables linking only; fresh status still works without revealing accounts", async () => {
  for (const settings of [{}, { AVATAR_AUTH_FLOW_SECRET: "not-a-real-key" }, { AVATAR_AUTH_FLOW_SECRET: Buffer.alloc(32).toString("base64url") }, { AVATAR_AUTH_FLOW_SECRET: `${env.AVATAR_AUTH_FLOW_SECRET}=` }]) {
    assert.equal(readGoogleLinkKey(settings), null);
    const { state, fetcher } = fixture();
    const result = await beginGoogleLink(config, sessionCookie, {}, settings, fetcher);
    assert.deepEqual(result, { ok: false, status: 503, code: "GOOGLE_LINK_NOT_CONFIGURED" }); assert.equal(state.calls.length, 0);
    const status = await readGoogleConnection(config, sessionCookie, settings, fetcher);
    assert.deepEqual(status.data, { state: "unlinked", linkAvailable: false, code: "GOOGLE_LINK_NOT_CONFIGURED" });
    assert.doesNotMatch(JSON.stringify(status), /account-credential|provider-credential|userId|scopes|original-session/);
  }
});

test("an already-linked Google account is verified without another OAuth start", async () => {
  const { state, fetcher } = fixture(); state.accounts = [row(), row("google")];
  assert.deepEqual(await beginGoogleLink(config, sessionCookie, {}, env, fetcher), { ok: true, alreadyLinked: true });
  assert.equal(state.calls.some(({ url }) => url.pathname.endsWith("/link-social")), false);
  assert.deepEqual((await readGoogleConnection(config, sessionCookie, {}, fetcher)).data, { state: "linked", linkAvailable: false });
});

test("caller-supplied identity, provider, redirect, scopes and tokens cannot enter link initiation", async () => {
  for (const data of [null, [], "", ...["userId", "provider", "callbackURL", "scopes", "idToken", "role", "emailVerified", "attempt"].map((key) => ({ [key]: "forged" }))]) {
    const { state, fetcher } = fixture();
    assert.deepEqual(await beginGoogleLink(config, sessionCookie, data, env, fetcher), { ok: false, status: 400, code: "GOOGLE_LINK_INVALID_INPUT" });
    assert.equal(state.calls.length, 0);
  }
});

test("anonymous, duplicate-cookie, expired, banned and malformed sessions cannot start linking", async () => {
  for (const cookies of [null, `${sessionCookie}; ${sessionCookie}`]) {
    const { state, fetcher } = fixture(); assert.equal((await beginGoogleLink(config, cookies, {}, env, fetcher)).ok, false); assert.equal(state.calls.length, 0);
  }
  for (const invalid of [null, {}, { ...session(), user: { ...session().user, banned: true } },
    { ...session(), session: { ...session().session, userId: otherId } },
    { ...session(), session: { ...session().session, expiresAt: "2000-01-01T00:00:00Z" } },
    { ...session(), user: { ...session().user, emailVerified: "false" } },
  ]) {
    const { state, fetcher } = fixture(); state.session = invalid;
    assert.equal((await beginGoogleLink(config, sessionCookie, {}, env, fetcher)).ok, false);
    assert.equal(state.calls.some(({ url }) => url.pathname.endsWith("/link-social")), false);
  }
});

test("session replacement, expiry, deletion, ambiguity or malformed Set-Cookie never changes the pinned account", async () => {
  const replacements = [
    [`${SESSION_COOKIE}=different-session`], [`${sessionCookie}; Max-Age=0`], [`${sessionCookie}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`],
    [`${SESSION_COOKIE}=; Max-Age=0`], [`${SESSION_COOKIE}=bad value`], [sessionCookie, sessionCookie],
  ];
  for (const phase of ["sessionCookies", "listCookies", "linkCookies"] as const) {
    for (const cookies of replacements) {
      const { state, fetcher } = fixture(); state[phase] = cookies;
      const result = await beginGoogleLink(config, sessionCookie, {}, env, fetcher);
      assert.equal(result.ok, false);
      assert.ok(state.calls.every((call) => new Headers(call.init?.headers).get("cookie") === sessionCookie));
      if (phase !== "linkCookies") assert.equal(state.calls.some(({ url }) => url.pathname.endsWith("/link-social")), false);
    }
  }
});

test("readback validates schema, every owner, and unique Google rows instead of accepting arbitrary provider content", async () => {
  for (const accounts of [null, {}, [{ ...row(), userId: otherId }], [{ ...row(), scopes: null }], [{ ...row(), createdAt: "invalid" }],
    [row(), { ...row("google"), userId: otherId }], [row("google"), row("google")],
    [row("google"), { ...row("google"), id: "other-google", accountId: "another-google" }],
    [{ ...row("google"), accountId: "" }], [{ ...row("google"), id: "" }],
  ]) {
    const { state, fetcher } = fixture(); state.accounts = accounts;
    const result = await readGoogleConnection(config, sessionCookie, env, fetcher);
    assert.equal(result.data.state, "unavailable"); assert.equal(result.data.linkAvailable, false);
    assert.equal((await beginGoogleLink(config, sessionCookie, {}, env, fetcher)).ok, false);
    assert.equal(state.calls.some(({ url }) => url.pathname.endsWith("/link-social")), false);
  }
});

test("account switching or revocation during status checks cannot start linking", async () => {
  for (const kind of ["switchOnRead", "nullOnRead"] as const) {
    const { state, fetcher } = fixture(); state[kind] = 2;
    assert.equal((await beginGoogleLink(config, sessionCookie, {}, env, fetcher)).ok, false);
    assert.equal(state.calls.some(({ url }) => url.pathname.endsWith("/link-social")), false);
  }
});

test("plain managed link return requires no new cookie or verifier and proves the same user's Google row", async () => {
  const { state, fetcher } = fixture(); state.accounts = [row(), row("google")];
  const attempt = marker();
  assert.deepEqual(await completeGoogleLink(config, attempt.url, attempt.cookies, env, fetcher), { ok: true });
  assert.deepEqual(state.calls.map(({ url }) => url.pathname), ["/neondb/auth/get-session", "/neondb/auth/list-accounts", "/neondb/auth/get-session"]);
});

test("irrelevant verifier/challenge never exchanges or adopts a sign-in session during linking", async () => {
  const { state, fetcher } = fixture(); state.accounts = [row("google")];
  const attempt = marker(); attempt.url.searchParams.set("neon_auth_session_verifier", "not-used-for-authentication");
  assert.equal((await completeGoogleLink(config, attempt.url, `${attempt.cookies}; ${CHALLENGE_COOKIE}=do-not-forward`, env, fetcher)).ok, true);
  for (const call of state.calls) {
    assert.equal(call.url.searchParams.has("neon_auth_session_verifier"), false);
    assert.equal(new Headers(call.init?.headers).get("cookie"), sessionCookie);
  }
});

test("wrong user, changed session, revocation and unavailable linked-account readback reject completion", async () => {
  const attempt = marker();
  for (const phase of ["user", "session", "revoked", "list", "cookie"] as const) {
    const { state, fetcher } = fixture(); state.accounts = [row("google")];
    if (phase === "user") state.session = { ...session(), user: { ...session().user, id: otherId }, session: { ...session().session, userId: otherId } };
    if (phase === "session") state.session = { ...session(), session: { ...session().session, id: "another-session" } };
    if (phase === "revoked") state.session = null;
    if (phase === "list") state.listStatus = 503;
    if (phase === "cookie") state.listCookies = [`${SESSION_COOKIE}=replacement-session`];
    const result = await completeGoogleLink(config, attempt.url, attempt.cookies, env, fetcher);
    assert.equal(result.ok, false);
    assert.equal(state.calls.some(({ url }) => url.pathname.endsWith("/link-social")), false);
    if (["user", "session", "revoked"].includes(phase)) assert.equal(state.calls.some(({ url }) => url.pathname.endsWith("/list-accounts")), false);
  }
});

test("absent Google record never turns a successful-looking callback into a linked state", async () => {
  const { fetcher } = fixture(); const attempt = marker();
  assert.deepEqual(await completeGoogleLink(config, attempt.url, attempt.cookies, env, fetcher), { ok: false, code: "GOOGLE_LINK_NOT_CONFIRMED" });
});

test("marker authenticity binds nonce, origin, issuer, purpose and bounded lifetime", () => {
  const attempt = marker();
  assert.ok(readGoogleLinkState(attempt.cookies, fixtureKey, config));
  for (const changed of [
    { exp: Math.floor(Date.now() / 1000) + 99999 }, { purpose: "other-purpose" }, { origin: "https://other.example.test" },
    { issuer: "https://other-auth.example.test" }, { v: 2 }, { iat: null },
  ]) {
    const payload = Buffer.from(JSON.stringify({ ...attempt.state, ...changed })).toString("base64url");
    const forged = `${payload}.${attempt.cookie.split(".")[1]}`;
    assert.equal(readGoogleLinkState(`${GOOGLE_LINK_COOKIE}=${forged}`, fixtureKey, config), null);
  }
  assert.equal(readGoogleLinkState(attempt.cookies, fixtureKey, { ...config, appOrigin: "https://other.example.test" }), null);
  assert.equal(readGoogleLinkState(attempt.cookies, fixtureKey, { ...config, baseUrl: "https://other-auth.example.test" }), null);
  assert.equal(readGoogleLinkState(attempt.cookies, fixtureKey, config, Date.now() + 601_000), null);
  assert.equal(readGoogleLinkState(attempt.cookies, fixtureKey, config, Date.now() - 10_000), null);
  assert.equal(readGoogleLinkState(`${attempt.cookies}; ${GOOGLE_LINK_COOKIE}=${attempt.cookie}`, fixtureKey, config), null);
  assert.equal(readGoogleLinkState(`${GOOGLE_LINK_COOKIE}=${attempt.cookie}=`, fixtureKey, config), null);
  assert.equal(readGoogleLinkState(`${GOOGLE_LINK_COOKIE}=${"a".repeat(2049)}`, fixtureKey, config), null);
  assert.equal(matchesGoogleLinkPrincipal(attempt.state, fixtureKey, config, { ...principal, userId: otherId }), false);
  assert.equal(matchesGoogleLinkPrincipal(attempt.state, fixtureKey, config, { ...principal, sessionId: "another-session" }), false);
});

test("a mismatched callback is rejected, and a copied valid callback can repeat only reads", async () => {
  const { state, fetcher } = fixture(); state.accounts = [row("google")];
  const old = marker(); const next = marker();
  assert.deepEqual(await completeGoogleLink(config, old.url, next.cookies, env, fetcher), { ok: false, code: "GOOGLE_LINK_ATTEMPT_INVALID" });
  assert.equal(state.calls.length, 0);
  for (let i = 0; i < 2; i++) assert.equal((await completeGoogleLink(config, next.url, next.cookies, env, fetcher)).ok, true);
  assert.equal(state.calls.length, 6);
  assert.equal(state.calls.every((call) => call.init?.method === "GET"), true);
});

test("a delayed callback response never changes cookies after a newer attempt has started", { timeout: 2000 }, async (t) => {
  // Execute the actual route handlers; only Next's source alias resolution is adapted.
  const aliases = registerHooks({ resolve(specifier, context, nextResolve) {
    return nextResolve(specifier.startsWith("@/") ? new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
  } });
  let callback: typeof import("../src/app/auth/callback/google/link/route.ts");
  let start: typeof import("../src/app/api/account/google/link/route.ts");
  try {
    callback = await import("../src/app/auth/callback/google/link/route.ts");
    start = await import("../src/app/api/account/google/link/route.ts");
  } finally { aliases.deregister(); }

  const settings = { ...env, NEON_AUTH_BASE_URL: config.baseUrl, AVATAR_APP_ORIGIN: config.appOrigin };
  const saved = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) process.env[key] = value;
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const reached = new Promise<void>((resolve) => { entered = resolve; });
  const { state, fetcher } = fixture();
  let firstList = true;
  t.mock.method(globalThis, "fetch", async (target: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(target).includes("/list-accounts") && firstList) {
      firstList = false; entered(); await gate;
      return Response.json([row("google")]);
    }
    return fetcher(target, init);
  });
  try {
    const old = marker();
    const delayed = callback.GET(new Request(old.url, { headers: { Cookie: old.cookies } }));
    await reached;
    const newer = await start.POST(new Request(`${config.appOrigin}/api/account/google/link`, {
      method: "POST", headers: { Cookie: old.cookies, Origin: config.appOrigin, "Content-Type": "application/json" }, body: "{}",
    }));
    assert.equal(newer.status, 200);
    const issued = newer.headers.getSetCookie(); assert.equal(issued.length, 1);
    const newMarker = readGoogleLinkState(issued[0].split(";")[0], fixtureKey, config); assert.ok(newMarker);
    assert.notEqual(newMarker.attempt, old.state.attempt);
    release();
    const returned = await delayed;
    assert.equal(returned.status, 303);
    assert.equal(returned.headers.get("location"), `${config.appOrigin}/account?auth_return=google-link`);
    assert.deepEqual(returned.headers.getSetCookie(), []);
    assert.match(returned.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(returned.headers.get("referrer-policy"), "no-referrer");
    const stale = await callback.GET(new Request(old.url, { headers: { Cookie: `${sessionCookie}; ${issued[0].split(";")[0]}` } }));
    assert.deepEqual(stale.headers.getSetCookie(), []);
    assert.match(stale.headers.get("location") ?? "", /link_issue=GOOGLE_LINK_ATTEMPT_INVALID$/);
    delete process.env.AVATAR_AUTH_FLOW_SECRET;
    const unavailable = await callback.GET(new Request(old.url, { headers: { Cookie: old.cookies } }));
    assert.deepEqual(unavailable.headers.getSetCookie(), []);
    assert.match(unavailable.headers.get("location") ?? "", /link_issue=GOOGLE_LINK_NOT_CONFIGURED$/);
    assert.equal(state.calls.filter(({ url }) => url.pathname.endsWith("/link-social")).length, 1);
  } finally {
    release();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("provider error and malformed callbacks remain fixed failures without linking, token exchange or raw text", async () => {
  for (const query of ["error=access_denied&error_description=private-value", "error=anything-private", "error=access_denied&error=again", "neon_auth_session_verifier=one&neon_auth_session_verifier=two"]) {
    const { state, fetcher } = fixture(); const attempt = marker(); attempt.url.search += `&${query}`;
    const result = await completeGoogleLink(config, attempt.url, attempt.cookies, env, fetcher);
    assert.equal(result.ok, false); assert.equal(state.calls.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /private-value|anything-private|one|two/);
  }
});

test("provider start errors and transport uncertainty never retry or claim a completed link", async () => {
  for (const kind of ["timeout", "denied", "replacement", "malformed", "unsafe-url"] as const) {
    const { state, fetcher } = fixture();
    if (kind === "timeout") state.dropLink = true;
    if (kind === "denied") state.linkStatus = 403;
    if (kind === "replacement") state.linkCookies = [`${SESSION_COOKIE}=do-not-adopt`];
    if (kind === "malformed") state.linkData = { url: "https://accounts.google.com/" };
    if (kind === "unsafe-url") state.linkData = { redirect: false, url: "http://accounts.google.com/" };
    const result = await beginGoogleLink(config, sessionCookie, {}, env, fetcher);
    assert.equal(result.ok, false); assert.equal(state.calls.filter(({ url }) => url.pathname.endsWith("/link-social")).length, 1);
    assert.doesNotMatch(JSON.stringify(result), /private-provider-description|do-not-adopt|accounts.google.com/);
  }
});
