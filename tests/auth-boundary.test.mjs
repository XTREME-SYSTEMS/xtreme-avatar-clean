import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_NEON_AUTH_BASE_URL, readAuthConfiguration } from '../src/lib/auth/config.ts';
import { SESSION_COOKIE, CHALLENGE_COOKIE, LEGACY_CHALLENGE_COOKIE, sessionCookieFromHeader, challengeCookieFromHeader, managedCookieFromSetCookie, serializeManagedCookie, isSameOriginMutation, readBoundedJson } from '../src/lib/auth/http.ts';
import { createManagedAuthProvider } from '../src/lib/auth/provider.ts';
import { resolveIdentity } from '../src/lib/auth/identity.ts';
import { readAccount, selectOrganization, performAuthAction } from '../src/lib/auth/account-service.ts';
import { beginGoogleSignIn, completeGoogleSignIn } from '../src/lib/auth/google.ts';
import { googleSignInErrorMessage } from '../src/lib/auth/google-errors.ts';

const config = { baseUrl: AVATAR_NEON_AUTH_BASE_URL, appOrigin: 'https://avatar-clean.example.test' };
const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  other: '00000000-0000-4000-8000-000000000002',
  org: '00000000-0000-4000-8000-000000000003',
  secondOrg: '00000000-0000-4000-8000-000000000004',
  member: '00000000-0000-4000-8000-000000000005',
  session: '00000000-0000-4000-8000-000000000006',
};
const opaque = 'synthetic-opaque-session.signed-test-value';
const cookie = `${SESSION_COOKIE}=${opaque}`;
const liveSession = () => ({
  user: { id: ids.user, name: 'Test Account', email: 'account@example.test', emailVerified: true },
  session: { id: ids.session, userId: ids.user, activeOrganizationId: ids.org, expiresAt: '2099-01-01T00:00:00.000Z', token: 'body-token-must-never-leave-server' },
});
const liveMember = () => ({ id: ids.member, userId: ids.user, organizationId: ids.org, role: 'owner' });
const json = (data, status = 200, setCookies = []) => {
  const headers = new Headers();
  for (const value of setCookies) headers.append('Set-Cookie', value);
  return Response.json(data, { status, headers });
};
function providerMock({ session = liveSession(), member = liveMember(), sessionError = null, memberError = null } = {}) {
  let reads = 0;
  return {
    getSession: async () => ({ data: session, error: sessionError }),
    getActiveMember: async () => { reads++; return { data: member, error: memberError }; },
    memberReads: () => reads,
  };
}

test('configuration fails closed unless the existing branch and exact HTTPS app origin are configured', () => {
  assert.deepEqual(readAuthConfiguration({}), { configured: false, code: 'AUTH_NOT_CONFIGURED' });
  assert.equal(readAuthConfiguration({ NEON_AUTH_BASE_URL: config.baseUrl, AVATAR_APP_ORIGIN: config.appOrigin }).configured, true);
  for (const base of ['https://evil.example.test/neondb/auth', `${config.baseUrl}?redirect=bad`, config.baseUrl.replace('neondb', 'otherdb')]) {
    assert.equal(readAuthConfiguration({ NEON_AUTH_BASE_URL: base, AVATAR_APP_ORIGIN: config.appOrigin }).configured, false);
  }
  for (const origin of ['http://localhost:3000', 'https://user:password@example.test', `${config.appOrigin}/account`, `${config.appOrigin}?q=bad`]) {
    assert.equal(readAuthConfiguration({ NEON_AUTH_BASE_URL: config.baseUrl, AVATAR_APP_ORIGIN: origin }).configured, false);
  }
});

test('only one opaque managed cookie is forwarded; forged local cache and duplicate cookies are ignored', () => {
  assert.equal(sessionCookieFromHeader(`other=secret; ${cookie}; __Secure-neon-auth.local.session_data=forged`), cookie);
  assert.equal(sessionCookieFromHeader('__Secure-neon-auth.local.session_data=forged'), null);
  assert.equal(sessionCookieFromHeader(`${cookie}; ${cookie}`), null);
  assert.equal(sessionCookieFromHeader(`${SESSION_COOKIE}=bad value`), null);
});

test('provider cookies cannot broaden domain, path, third-party context, or JS access', () => {
  const parsed = managedCookieFromSetCookie(`${cookie}; Domain=.example.test; Path=/auth; SameSite=None; Partitioned; Max-Age=3600`);
  assert.ok(parsed);
  const header = serializeManagedCookie(parsed);
  assert.match(header, /Path=\/; HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(header, /Domain=|Partitioned|SameSite=None/);
  assert.equal(managedCookieFromSetCookie('unrelated=secret; Path=/'), null);
  assert.match(serializeManagedCookie({ value: '', maxAge: 0, expires: new Date(0) }), /Max-Age=0/);
});

test('mutation CSRF guard requires exact configured origin and rejects missing, foreign and same-site origins', () => {
  const request = (origin, site = 'same-origin', url = `${config.appOrigin}/api/session`) => new Request(url, { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), 'Sec-Fetch-Site': site } });
  assert.equal(isSameOriginMutation(request(config.appOrigin), config.appOrigin), true);
  assert.equal(isSameOriginMutation(request(null), config.appOrigin), false);
  assert.equal(isSameOriginMutation(request('https://sibling.example.test', 'same-site'), config.appOrigin), false);
  assert.equal(isSameOriginMutation(request(config.appOrigin, 'same-origin', 'https://wrong.example.test/api/session'), config.appOrigin), false);
});

test('JSON uploads are bounded by both bytes and time', async () => {
  assert.equal((await readBoundedJson(new Request(config.appOrigin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'a'.repeat(50) }) }), 16)).status, 413);
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const slow = new Request(config.appOrigin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half' });
  assert.deepEqual(await readBoundedJson(slow, 64, 10), { ok: false, status: 408, code: 'REQUEST_TIMEOUT' });
  assert.equal(cancelled, true);
});

test('live identity requires matching user, session, organization and current membership', async () => {
  const result = await resolveIdentity(providerMock(), config.baseUrl);
  assert.equal(result.status, 'authenticated');
  assert.deepEqual(result.identity, { issuer: config.baseUrl, userId: ids.user, sessionId: ids.session, sessionExpiresAt: '2099-01-01T00:00:00.000Z', organizationId: ids.org, memberId: ids.member, role: 'owner', emailVerified: true });
  assert.doesNotMatch(JSON.stringify(result), /body-token-must-never-leave-server/);
});

test('no session, expired session and no selected organization cannot authorize Core', async () => {
  for (const session of [null, { ...liveSession(), session: { ...liveSession().session, expiresAt: '2000-01-01T00:00:00Z' } }]) {
    const provider = providerMock({ session });
    assert.equal((await resolveIdentity(provider, config.baseUrl)).status, 'anonymous');
    assert.equal(provider.memberReads(), 0);
  }
  const provider = providerMock({ session: { ...liveSession(), session: { ...liveSession().session, activeOrganizationId: null } } });
  assert.equal((await resolveIdentity(provider, config.baseUrl)).status, 'membership_required');
  assert.equal(provider.memberReads(), 0);
});

test('foreign user, foreign organization, removed membership and unsupported role explicitly deny access', async () => {
  const cases = [
    { session: { ...liveSession(), session: { ...liveSession().session, userId: ids.other } } },
    { member: { ...liveMember(), userId: ids.other } },
    { member: { ...liveMember(), organizationId: ids.secondOrg } },
    { member: { ...liveMember(), role: 'superadmin' } },
    { memberError: { status: 400, code: 'MEMBER_NOT_FOUND' } },
    { member: null },
  ];
  for (const example of cases) assert.equal((await resolveIdentity(providerMock(example), config.baseUrl)).status, 'access_denied');
});

test('an auth or membership outage stays unavailable and never falls back to cached authority', async () => {
  assert.equal((await resolveIdentity(providerMock({ sessionError: { status: 503, code: 'OUTAGE' } }), config.baseUrl)).status, 'unavailable');
  assert.equal((await resolveIdentity(providerMock({ memberError: { status: 503, code: 'OUTAGE' } }), config.baseUrl)).status, 'unavailable');
  assert.equal((await resolveIdentity(providerMock({ session: { unexpected: 'malformed' } }), config.baseUrl)).status, 'unavailable');
});

test('logout revocation is observed when a stolen pre-logout cookie is replayed, even with a forged local cache', async () => {
  let revoked = false;
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(input); calls.push(url.pathname);
    assert.equal(url.origin, new URL(config.baseUrl).origin);
    assert.equal(init.headers.get('cookie'), cookie);
    assert.equal(init.headers.get('origin'), config.appOrigin);
    assert.equal(init.headers.get('x-neon-auth-middleware'), 'true');
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
    if (url.pathname.endsWith('/sign-out')) { revoked = true; return json({ success: true }); }
    if (url.pathname.endsWith('/get-session')) { assert.equal(url.searchParams.get('disableCookieCache'), 'true'); return json(revoked ? null : liveSession()); }
    if (url.pathname.endsWith('/get-active-member')) return json(liveMember());
    throw new Error('Unexpected endpoint');
  };
  const oldCookie = `${cookie}; __Secure-neon-auth.local.session_data=forged-cached-owner`;
  assert.equal((await resolveIdentity(createManagedAuthProvider(config, oldCookie, fetcher), config.baseUrl)).status, 'authenticated');
  const logout = await performAuthAction(config, oldCookie, 'sign-out', {}, fetcher);
  assert.equal(logout.ok, true);
  assert.equal(logout.cookies.find((entry) => entry.name === SESSION_COOKIE)?.maxAge, 0);
  assert.equal((await resolveIdentity(createManagedAuthProvider(config, oldCookie, fetcher), config.baseUrl)).status, 'anonymous');
  assert.equal(calls.filter((path) => path.endsWith('/get-session')).length, 2);
});

test('failed sign-out does not claim revocation or erase the cookie as if successful', async () => {
  const result = await performAuthAction(config, cookie, 'sign-out', {}, async () => json({ code: 'OUTAGE' }, 503));
  assert.equal(result.ok, false); assert.equal(result.code, 'SIGN_OUT_FAILED'); assert.deepEqual(result.cookies, []);
});

test('email sign-in proves its new HttpOnly cookie; a response body token alone is rejected', async () => {
  const body = { email: 'account@example.test', password: 'synthetic-test-password' };
  const start = { user: liveSession().user, token: 'body-token-must-never-leave-server' };
  assert.equal((await performAuthAction(config, null, 'sign-in/email', body, async () => json(start))).ok, false);
  const calls = [];
  const result = await performAuthAction(config, null, 'sign-in/email', body, async (input, init) => {
    const url = new URL(input); calls.push(url.pathname);
    if (url.pathname.endsWith('/sign-in/email')) { assert.equal(init.method, 'POST'); return json(start, 200, [`${cookie}; Path=/; HttpOnly; Secure`]); }
    assert.equal(init.headers.get('cookie'), cookie);
    return json(liveSession());
  });
  assert.equal(result.ok, true); assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify({ ok: result.ok, code: result.code }), /body-token|synthetic-test-password/);
});

test('sanitized account response excludes raw user, session, and provider token fields', async () => {
  const provider = createManagedAuthProvider(config, cookie, async (input) => {
    const path = new URL(input).pathname;
    if (path.endsWith('/get-session')) return json(liveSession());
    if (path.endsWith('/get-active-member')) return json(liveMember());
    return json([{ id: ids.org, name: 'Test workspace', privateMetadata: 'not-for-browser' }]);
  });
  const response = await readAccount(provider, config.baseUrl);
  assert.equal(response.session.status, 'authenticated');
  const publicJson = JSON.stringify(response.session);
  for (const secret of [opaque, 'body-token', 'not-for-browser', ids.session, ids.user]) assert.ok(!publicJson.includes(secret));
});

test('selecting another user’s organization is rejected before any mutation', async () => {
  let mutations = 0;
  const provider = createManagedAuthProvider(config, cookie, async (input, init) => {
    const path = new URL(input).pathname;
    if (init.method === 'POST') mutations++;
    if (path.endsWith('/get-session')) return json(liveSession());
    if (path.endsWith('/get-active-member')) return json(liveMember());
    if (path.endsWith('/organization/list')) return json([{ id: ids.org, name: 'Own workspace' }]);
    throw new Error('Unexpected endpoint');
  });
  const result = await selectOrganization(provider, config.baseUrl, ids.secondOrg);
  assert.equal(result.session.status, 'access_denied'); assert.equal(mutations, 0);
});

test('organization selection is not reported successful until fresh membership agrees', async () => {
  let switched = false;
  const provider = createManagedAuthProvider(config, cookie, async (input) => {
    const path = new URL(input).pathname;
    if (path.endsWith('/get-session')) return json({ ...liveSession(), session: { ...liveSession().session, activeOrganizationId: switched ? ids.secondOrg : ids.org } });
    if (path.endsWith('/get-active-member')) return json({ ...liveMember(), organizationId: switched ? ids.secondOrg : ids.org });
    if (path.endsWith('/organization/list')) return json([{ id: ids.org, name: 'One' }, { id: ids.secondOrg, name: 'Two' }]);
    if (path.endsWith('/set-active')) { switched = true; return json({ id: ids.secondOrg }); }
    throw new Error('Unexpected endpoint');
  });
  const result = await selectOrganization(provider, config.baseUrl, ids.secondOrg);
  assert.equal(result.session.status, 'authenticated'); assert.equal(result.session.organization.id, ids.secondOrg);
});

test('unrecognized upstream content cancels its body and exposes no HTML or provider error text', async () => {
  let cancelled = false;
  const provider = createManagedAuthProvider(config, cookie, async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/html' } }));
  const result = await provider.getSession();
  assert.equal(result.error.code, 'AUTH_RESPONSE_INVALID'); assert.equal(cancelled, true);
});

test('Google starts through fixed managed endpoint and callback and accepts redirect:false with disableRedirect:true', async () => {
  const result = await beginGoogleSignIn(config, null, async (input, init) => {
    assert.equal(new URL(input).pathname, '/neondb/auth/sign-in/social');
    assert.deepEqual(JSON.parse(init.body), { provider: 'google', disableRedirect: true, callbackURL: `${config.appOrigin}/auth/callback/google`, errorCallbackURL: `${config.appOrigin}/auth/callback/google` });
    return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=provider-state', redirect: false }, 200, [`${CHALLENGE_COOKIE}=synthetic-challenge; Secure; HttpOnly; Partitioned`]);
  });
  assert.equal(result.ok, true); assert.match(result.url, /^https:/);
  assert.equal(result.cookies.at(-1).name, CHALLENGE_COOKIE);
  const unsafe = await beginGoogleSignIn(config, null, async () => json({ url: 'javascript:alert(1)', redirect: false }, 200, [`${CHALLENGE_COOKIE}=challenge`]));
  assert.equal(unsafe.ok, false);
});

test('Google normalizes identical provider compatibility cookies to one canonical challenge', async () => {
  for (const names of [[CHALLENGE_COOKIE, LEGACY_CHALLENGE_COOKIE], [LEGACY_CHALLENGE_COOKIE, CHALLENGE_COOKIE]]) {
    const result = await beginGoogleSignIn(config, null, async () => json({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?state=provider-state', redirect: false,
    }, 200, names.map((name) => `${name}=same-opaque-challenge; Max-Age=600; HttpOnly; Secure; SameSite=None; Partitioned`)));
    assert.equal(result.ok, true);
    const active = result.cookies.filter((entry) => entry.value && entry.maxAge !== 0);
    assert.deepEqual(active.map(({ name, value, maxAge }) => ({ name, value, maxAge })), [
      { name: CHALLENGE_COOKIE, value: 'same-opaque-challenge', maxAge: 600 },
    ]);
    assert.equal(result.cookies.filter((entry) => entry.maxAge === 0).length, 2);
  }
});

test('Google rejects conflicting provider challenges and identical duplicate browser challenges', async () => {
  const result = await beginGoogleSignIn(config, null, async () => json({
    url: 'https://accounts.google.com/o/oauth2/v2/auth?state=provider-state', redirect: false,
  }, 200, [`${CHALLENGE_COOKIE}=first; Max-Age=600`, `${LEGACY_CHALLENGE_COOKIE}=second; Max-Age=600`]));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'GOOGLE_CHALLENGE_UNVERIFIED');
  assert.deepEqual(result.cookies, []);
  assert.equal(challengeCookieFromHeader(`${CHALLENGE_COOKIE}=same; ${LEGACY_CHALLENGE_COOKIE}=same`), null);
});

test('Google provider errors become fixed account guidance without reading a session or exposing descriptions', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('Must not run'); };
  for (const [providerCode, expected] of [
    ['account_not_linked', 'GOOGLE_ACCOUNT_LINK_REQUIRED'],
    ['email_not_verified', 'GOOGLE_EMAIL_VERIFICATION_REQUIRED'],
    ['access_denied', 'GOOGLE_ACCESS_DENIED'],
    ['arbitrary-account@example.test', 'GOOGLE_PROVIDER_REJECTED'],
  ]) {
    const url = new URL(`${config.appOrigin}/auth/callback/google`);
    url.searchParams.set('error', providerCode);
    url.searchParams.set('error_description', 'sensitive-provider-detail');
    const result = await completeGoogleSignIn(config, url, null, fetcher);
    assert.equal(result.ok, false); assert.equal(result.code, expected);
    assert.equal(result.cookies.length, 2);
    assert.ok(result.cookies.every((entry) => entry.maxAge === 0));
    assert.ok(!JSON.stringify(result).includes('sensitive-provider-detail'));
    assert.ok(!JSON.stringify(result).includes('account@example.test'));
  }
  for (const query of ['?error=account_not_linked&error=access_denied', '?error=account_not_linked&neon_auth_session_verifier=v']) {
    const result = await completeGoogleSignIn(config, new URL(`${config.appOrigin}/auth/callback/google${query}`), null, fetcher);
    assert.equal(result.code, 'GOOGLE_CALLBACK_INVALID');
  }
  assert.equal(calls, 0);
});

test('Google account guidance does not interpolate untrusted error codes', () => {
  assert.match(googleSignInErrorMessage('GOOGLE_ACCOUNT_LINK_REQUIRED'), /email and password/);
  assert.match(googleSignInErrorMessage('GOOGLE_EMAIL_VERIFICATION_REQUIRED'), /verification/);
  assert.match(googleSignInErrorMessage('GOOGLE_ACCESS_DENIED'), /not approved/);
  assert.match(googleSignInErrorMessage('GOOGLE_CHALLENGE_MISSING'), /expired/);
  assert.ok(!googleSignInErrorMessage('<script>private-provider-detail</script>').includes('private-provider-detail'));
});

test('Google callback requires one verifier and one unambiguous challenge before any provider read', async () => {
  assert.equal(challengeCookieFromHeader(`${CHALLENGE_COOKIE}=a; ${LEGACY_CHALLENGE_COOKIE}=b`), null);
  assert.equal(challengeCookieFromHeader(`${CHALLENGE_COOKIE}=a; ${CHALLENGE_COOKIE}=b`), null);
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('Must not run'); };
  for (const [query, cookies] of [
    ['', `${CHALLENGE_COOKIE}=a`], ['?neon_auth_session_verifier=v', null],
    ['?neon_auth_session_verifier=v&neon_auth_session_verifier=v2', `${CHALLENGE_COOKIE}=a`],
    ['?neon_auth_session_verifier=%0a', `${CHALLENGE_COOKIE}=a`],
    ['?neon_auth_session_verifier=v', `${CHALLENGE_COOKIE}=a; ${LEGACY_CHALLENGE_COOKIE}=b`],
  ]) assert.equal((await completeGoogleSignIn(config, new URL(`${config.appOrigin}/auth/callback/google${query}`), cookies, fetcher)).ok, false);
  assert.equal(calls, 0);
});

test('Google one-time exchange establishes a new opaque cookie, rereads it, and consumes both challenge names', async () => {
  let calls = 0;
  const result = await completeGoogleSignIn(config, new URL(`${config.appOrigin}/auth/callback/google?neon_auth_session_verifier=synthetic-verifier`), `${CHALLENGE_COOKIE}=synthetic-challenge`, async (input, init) => {
    const url = new URL(input); calls++;
    assert.equal(init.method, 'GET'); assert.equal(url.pathname, '/neondb/auth/get-session');
    assert.equal(url.searchParams.get('disableCookieCache'), 'true');
    if (calls === 1) {
      assert.equal(url.searchParams.get('neon_auth_session_verifier'), 'synthetic-verifier');
      assert.equal(init.headers.get('cookie'), `${CHALLENGE_COOKIE}=synthetic-challenge`);
      return json(liveSession(), 200, [`${cookie}; HttpOnly; Secure; Path=/`]);
    }
    assert.equal(url.searchParams.has('neon_auth_session_verifier'), false);
    assert.equal(init.headers.get('cookie'), cookie);
    return json(liveSession());
  });
  assert.equal(result.ok, true); assert.equal(calls, 2);
  assert.equal(result.cookies.filter((entry) => entry.maxAge === 0).length, 2);
  assert.ok(!JSON.stringify(result).includes('synthetic-verifier'));
});

test('Google exchange does not fall back to a prior cookie or body token after failed proof', async () => {
  const callback = new URL(`${config.appOrigin}/auth/callback/google?neon_auth_session_verifier=synthetic-verifier`);
  const initialCookies = `${cookie}; ${CHALLENGE_COOKIE}=challenge`;
  const noNewCookie = await completeGoogleSignIn(config, callback, initialCookies, async () => json(liveSession()));
  assert.equal(noNewCookie.ok, false);
  const rejectedVerifier = await completeGoogleSignIn(config, callback, initialCookies, async () => json({ code: 'INVALID_VERIFIER' }, 401));
  assert.equal(rejectedVerifier.ok, false);
  let calls = 0;
  const changedUser = await completeGoogleSignIn(config, callback, initialCookies, async () => {
    if (++calls === 1) return json(liveSession(), 200, [`${cookie}; HttpOnly; Secure`]);
    return json({ ...liveSession(), user: { ...liveSession().user, id: ids.other }, session: { ...liveSession().session, userId: ids.other } });
  });
  assert.equal(changedUser.ok, false);
});
