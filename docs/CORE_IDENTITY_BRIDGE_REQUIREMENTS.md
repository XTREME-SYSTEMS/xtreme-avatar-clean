# Core identity bridge requirements

Checked on 2026-11-26 against the existing Railway Core deployment and the existing Avatar Neon Auth branch. This document separates an implementable clean-app server adapter from the additional trust and identity decisions required to enable it.

**Source implementation is eligible. Live authenticated Core operation remains blocked until the exact identity mapping, signing-key trust, client grant, and owner chat grant are verified.** No live key, permission, membership, database record, or deployment is created by this document.

## Existing system boundary

- Application: `XTREME-SYSTEMS/xtreme-avatar-clean`.
- Application identity and data: Neon Auth / Managed Better Auth, project `delicate-scene-98135330`, current branch `br-divine-hall-bcgshvxl`.
- Intelligence and memory: the separately deployed `Strategic-Minds-AI/eden-universal-core-v2` API.
- Current Core origin: `https://core-api-staging-dec8a723.up.railway.app`.
- Current hosted source: `75e4f7a84a263dc70d6974dc87da15352fbbcca9`.
- Railway deployment: `89f2437a-0469-47e3-a240-eaee2cef5bdc`, observed `SUCCESS`.
- PR #46 head: `b3fc1ec141a9f3667bf44d227034fbc90d4ec88e`. Its two commits after the hosted source change CI and PostgreSQL QA files, not the runtime auth/chat contract.

Do not copy Core into this app, add an authentication server, use an engineering gateway token as an application-user token, or import legacy authentication code. The adapter delegates an identity already authenticated by the existing Neon service. It does not register users, authenticate passwords, issue login sessions, or become another identity provider for the user interface.

## What is verified, and what is not

Fresh public Core checks returned `/healthz` 200, `/readyz` 200 with `scope: "database-only"`, and anonymous `/v1/profile` 401. Both health endpoints explicitly retain `release: "blocked"`. These observations do not prove a signed application request or model entitlement.

Core protected-resource metadata still publishes `https://visual-x-next-git-preview-foundation-xtreme-ai-systems.vercel.app` as the primary authorization server. The implementation can additionally accept explicitly configured issuers with pinned keys. Public metadata does not enumerate those additional issuers, so it cannot determine whether a particular additional application issuer is trusted.

Railway's connected OAuth API returned `valuesRedacted: true`. Relevant auth and chat variable names are present, but their configured values, including audience, allowed clients, additional issuers, and grant expiry, were not available through that connection. Never infer the required audience from the API URL.

The current Neon Auth base is:

`https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth`

Its published JWKS returned one `EdDSA` / `OKP` / `Ed25519` key. The hosted Core verifier accepts only `RS256`, with JWT header type `at+jwt`. A Neon token signed by that published Ed25519 key cannot be forwarded unchanged to the current Core verifier.

Neon's separate OAuth 2.1 authorization-server plugin is disabled with no registered resources. This does not mean ordinary Neon sign-in is disabled. Enabling that plugin is not an implied part of implementing this adapter.

## Core does not provide the missing token exchange

The inspected hosted Core server is a protected resource server. It validates bearer tokens and serves protected application routes. Its OAuth-related public endpoint is `GET /.well-known/oauth-protected-resource`.

There is no implemented Neon token exchange, login, authorization-code issuance, or token-issuing endpoint in the inspected server. Do not invent `/token`, `/oauth/token`, or an exchange URL. The historical frontend kit in Core PR #44 explicitly leaves `currentOwnerScopedEdenToken` unimplemented; its BFF route map also omits chat.

The chosen clean-app implementation is a server-only, short-lived **RS256 delegation adapter** compatible with Core's existing verifier. The clean app verifies the current Neon session and membership, resolves a reviewed identity binding, then signs only the fixed claims permitted for that binding. Tokens never enter browser JavaScript or responses.

## Clean-app configuration

All fields below are server-only. There are no guessed defaults, browser overrides, static owner-bearer fallback, or arbitrary exchange endpoint. Missing, partial, malformed, or incompatible configuration disables the affected Core capability and produces a safe error. Do not log the private key, bearer, raw cookie, session token, or full binding document.

| Variable | Requirement |
| --- | --- |
| `CORE_CHAT_ENABLED` | Must be exactly `true` only after the reviewed live grant. The review preview keeps it `false`. |
| `AVATAR_APP_ORIGIN` | Exact configured clean-app HTTPS origin; the delegation issuer must equal it. Also used for auth and mutation-origin checks. |
| `CORE_API_BASE_URL` | Verified HTTPS Core origin, without credentials, query, fragment, or arbitrary path. Requests use fixed application endpoints. |
| `CORE_AUTH_ISSUER` | Exact approved clean-app delegation issuer. For Core's existing additional-issuer mechanism, use an exact HTTPS origin without a port, path, query, fragment, or wildcard. It is distinct from the Neon Auth issuer. |
| `CORE_AUTH_AUDIENCE` | Exact existing Core `EDEN_OAUTH_AUDIENCE`; nonempty and not `*`. The public resource URL is not proof of this value. |
| `CORE_AUTH_CLIENT_ID` | Exact client identifier explicitly allowed by Core. It does not come from a browser request. |
| `CORE_AUTH_KEY_ID` | Approved unique RSA key ID matching `/^[A-Za-z0-9_-]{1,80}$/` and the trusted public JWK. |
| `CORE_AUTH_PRIVATE_KEY` | Approved RSA private key available only to the clean app's server process. Never copied from another app or exported from a connector. Synthetic test keys do not establish a deployed trust grant. |
| `CORE_IDENTITY_BINDINGS_JSON` | Strict, bounded, explicitly approved mapping of live Neon identity and membership tuples to canonical Core user/tenant UUID pairs. No wildcard, email, organization-name, or default-owner mapping. |

Configuration presence is not an approval receipt. The runtime must stay unavailable for real Core calls until the actual mapping and corresponding Core trust configuration have been reviewed and read back.

The implemented binding document has this exact shape. The angle-bracket values
below are intentionally invalid examples; replace them only with verified records
and an actual reviewed approval reference. `expiresAt` is a required finite UTC
expiry. The current owner slice permits only `neonRole: "owner"`.

```json
{
  "version": 1,
  "bindings": [{
    "issuer": "https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth",
    "neonUserId": "<verified Neon user UUID>",
    "neonOrganizationId": "<verified Neon organization UUID>",
    "neonMemberId": "<verified live membership UUID>",
    "neonRole": "owner",
    "coreUserId": "<approved lowercase Core user UUID>",
    "coreTenantId": "<approved lowercase Core tenant UUID>",
    "approvalRef": "<reviewed grant reference>",
    "expiresAt": "<approved UTC expiry>"
  }]
}
```

## Binding and membership rules

Every binding must contain all of these exact identity facts, with the implementation's strict schema rejecting unknown fields:

1. The verified Neon Auth issuer/base identity for the selected project and branch.
2. Neon user ID.
3. Neon organization ID.
4. Neon organization membership ID.
5. The exact current membership role.
6. Canonical Core user UUID and Core tenant UUID.

Each issuance must validate a current server-side Neon session and re-read the applicable live membership. The selected organization must belong to that verified user. Browser JSON, an unverified cookie value, an email address, or a user-supplied tenant header is not evidence of identity or membership.

For this owner-preview slice, require the approved live owner membership and issue only Core role `owner`. A missing membership, changed role, changed membership ID, deleted/recreated membership, different organization, different issuer, or revoked session must deny issuance. Do not automatically update a binding to match a new identity or role.

Enforce uniqueness in both directions:

- One `(Neon issuer, Neon user ID, Neon organization ID)` principal may resolve to only one binding. Membership ID and role are equality checks, not additional keys permitting conflicting bindings for that principal.
- One `(Core tenant UUID, Core user UUID)` pair may be delegated by only one approved Neon principal in this adapter's configuration.

Use exact, case-sensitive provider identifiers. Core IDs must be valid canonical UUIDs accepted by Core's verifier; do not generate replacement identities or infer mappings from matching emails. Reject all bindings if the configured mapping contains conflicting or malformed entries. Do not silently choose the first matching row.

The runtime mapping is separate from historical shared-memory reconciliation. It does not authorize reassigning any existing memory, receipt, company namespace, or project namespace.

## Delegation-token contract

The clean server may create a token only after the preceding checks pass:

```text
Protected header:
  alg = RS256
  typ = at+jwt
  kid = the approved CORE_AUTH_KEY_ID

Claims:
  iss       = exact CORE_AUTH_ISSUER
  aud       = exact CORE_AUTH_AUDIENCE
  client_id = exact CORE_AUTH_CLIENT_ID
  sub       = approved Core user UUID
  tenant_id = approved Core tenant UUID
  roles     = ["owner"]
  scope     = "knowledge:read tool:execute profile:read"
  iat       = current integer Unix seconds
  exp       = iat + a fixed 60–90 second lifetime
  jti       = fresh cryptographically random identifier
```

`memory:read` and all write, task, approval, media, and administrative scopes are deliberately absent from this first chat delegation. Client input cannot extend the scope or replace any identity claim. Do not cache a bearer across users or reuse a token after its short lifetime.

Validate the key as an RSA signing key with **2048–4096 modulus bits and exponent 65537**. Core's current pinned-key validator requires public JWK `kty: "RSA"`, `alg: "RS256"`, `use: "sig"`, and `e: "AQAB"`; it bounds the modulus to 256–512 bytes. A test that accepts any key of at least 2048 bits would incorrectly accept an 8192-bit key that Core rejects. RSA-PSS, EC, and Ed25519 keys do not satisfy this RS256 delegation contract.

Core independently validates signature, issuer, audience, client, token age, required claims, and UUID shape. Its live SQL authorization requires an active Core tenant and active membership whose role matches the signed role. Chat additionally checks the exact configured owner/tenant and expiring provider grant. App-side mapping never replaces these checks.

## Required Core trust grant and its security limitation

No live Core change is executed by this package. Before a new clean-app key is enabled, the Core operator must verify the following against the existing staging service:

- The clean issuer is accepted by the intended Core policy. The existing pinned-key implementation permits at most two additional exact HTTPS origins.
- The corresponding **public** RSA JWK is present in `EDEN_TRUSTED_PUBLIC_JWKS_JSON`, with the expected unique `kid`. This document does not authorize copying or moving any private key. The existing implementation allows one to three public keys.
- The client ID is explicitly allowed by `EDEN_OAUTH_CLIENT_IDS` and the app uses the exact `EDEN_OAUTH_AUDIENCE`.
- The canonical Core tenant and membership are active with owner-role parity.
- The pair exactly matches `EDEN_CHAT_TENANT_ID` / `EDEN_CHAT_USER_ID`, and `EDEN_CHAT_GRANT_EXPIRES_AT` remains valid for the approved provider/model use.
- Existing trust and issuer configuration is preserved except for the exact approved change. Do not replace the primary issuer, broaden wildcard access, or manufacture membership to make a test pass.

### Shared pinned-key trust pool

The current Core implementation uses one pinned key set with a shared issuer/client policy. It does **not** bind each key ID to one issuer, client, subject, tenant, role, or scope ceiling. Any holder of a trusted private key can cryptographically sign claims for any accepted issuer/client; the live membership checks confirm that the claimed membership exists, not that this particular signer was allowed to assert it.

The clean app's strict mapping protects its ordinary issuance path. It does not turn the existing Core key set into a cryptographically restricted per-application delegation grant.

**This is a live trust-grant/release gate.** Source implementation and synthetic tests may proceed with the adapter disabled. Do not activate the new signer merely because local tests pass. The independent reviewer must assess the actual signing authority before a live grant. For a least-privilege owner preview, the preferable Core hardening is one exact permitted principal pair and the fixed three-scope ceiling for this key.

### Smallest proposed Core hardening, not an existing API

An isolated future Core source change can extend the existing verifier rather than add an auth server:

1. In `src/auth/access-token.ts`, define a strict trusted-signer policy that binds a verified key ID to exact issuer, audience, client ID, permitted Core principal pair(s), role(s), and allowed scopes.
2. After cryptographic verification, validate the protected header and verified claims against that binding before returning an `Actor`. A clean key must not sign for a legacy issuer/client, and the clean issuer/client must not be accepted through an unrelated key. Reject unknown, duplicate, ambiguous, or incomplete policy entries.
3. In `src/api/main.ts`, load the reviewed policy as server configuration and pass it to the existing pinned verifier. Preserve the existing cryptographic, claim, scope, role, and live membership checks. Do not obtain trust from token claims or arbitrary discovery.
4. Add verifier tests for clean-key/legacy-issuer substitution, unrelated-key/clean-issuer substitution, wrong client or audience, wrong owner or tenant, role/scope escalation, expired tokens, and valid bounded delegation.

Binding only issuer and client is not enough to constrain which Core user/tenant a signer can assert. No new endpoint or configuration variable for this proposed hardening should be advertised as available until its implementation and hosted revision are verified.

## Exact first-chat API contract

### Request

```http
POST /v1/chat
Authorization: Bearer <server-only Core delegation>
Content-Type: application/json
```

```json
{"text":"The user's message","requestKey":"stable_request_key_123"}
```

This is a strict object: no other fields. `text` is trimmed and limited to 1–5000 JavaScript string characters; `requestKey` matches `/^[a-zA-Z0-9_-]{8,96}$/`. Core's complete JSON request-body ceiling is 16384 bytes. The clean adapter should validate a bounded byte stream before parsing; a declared Content-Length is not sufficient.

### Response and history

```ts
type CoreChatResponse = {
  id: string;
  status: "pending" | "completed" | "failed" | "unknown";
  text: string | null;
  providerResponseId: string | null;
  usage: unknown | null;
  errorCode: string | null;
  createdAt: string;
  profileRevision: number | null;
};

// GET /v1/chat
type CoreChatHistory = {
  messages: Array<CoreChatResponse & { input: string }>;
};
```

HTTP 200 is not proof of completion. Text, provider response ID, and usage are exposed only for completed rows. Usage varies between the direct and metered transports; do not require the direct OpenAI token-count shape for every completed response.

History contains at most the latest 30 records, returned oldest to newest. It does not expose `requestKey`. There is no separate per-request lookup or arbitrary conversation-ID endpoint in this served contract. Keep request keys for unresolved submissions in the clean app's own UI/request state, scoped to the current signed-in user; do not create a second conversational memory authority.

### Idempotency and errors

Core reserves a durable row for `(tenant, owner, requestKey)` before dispatch. Its input hash includes normalized text, selected model, persona/revision, and the metered-transport marker where applicable. The same key returns the existing result only if those inputs match. Pending and unknown outcomes are never automatically redispatched. Changing preferences can therefore make reuse of an old key conflict.

Keep the same request key if a request needs readback after a lost response. A refreshed short-lived bearer does not require a new request key. Never silently create a fresh request key after timeout, disconnect, or an unknown outcome. A repeat of the same pending request is not evidence that the provider ran twice or completed.

| HTTP status | Core response |
| --- | --- |
| 400 | `invalid_input` or `invalid_json` |
| 401 | `invalid_access_token` |
| 403 | `access_denied`, including owner/grant/membership failures and chat idempotency conflicts |
| 413 | `body_too_large` |
| 429 | `rate_limit` |
| 503 | `capability_not_connected` or `service_unavailable` |

Do not promise HTTP 409 for a chat idempotency conflict: the current Core server maps its internal authorization/conflict exception to 403. Some provider failures return HTTP 200 with a failed/unknown row; other uncertain outcomes return 503 after the durable admission has been retained. The clean UI must represent those states honestly.

## First-chat acceptance and remaining release gates

Source tests must exercise session/membership expiry and revocation; issuer, user, organization, member-ID and role changes; absent/conflicting mappings; signing-key type/size errors; fixed scope; cross-user/tenant denial; same request-key reuse; changed-payload conflict; malformed/oversized responses; and upstream timeout without redispatch. Use synthetic identities and test keys. Source tests do not prove live grants.

Before an authenticated staging chat test:

1. Verify clean preview deployment identity and its actual Neon callback/trusted-origin configuration.
2. Obtain a real Neon session, verify the exact live source tuple, and confirm the explicitly approved canonical Core mapping.
3. Verify the approved Core signer policy/public key, audience, client ID, membership, and unexpired owner/provider grant.
4. Prove authenticated `/v1/profile` and `/v1/connections` readback without claiming provider generation from those reads.
5. Only within the applicable metered-use authorization, submit one harmless text turn, retain the response ID/status, and read it back from history. Verify negative identity tests and ambiguous-outcome handling.
6. Obtain independent exact-source validation before the affected release or any production cutover.

Historical shared-memory issue #47 and PRs #46/#37 remain separate cutover gates. The first chat token omits `memory:read`, so its source-supported ordinary conversation path can be tested without enabling Neon memory migration. It still uses Core's durable chat storage. Do not present this limited slice as full memory, media, tool execution, or product completion.

Rollback for this clean-app source package is to revert its adapter/routes or remove its enablement configuration. Any future Core trust change needs its own reviewed rollback that revokes the exact new signer/client without disrupting unrelated existing issuers. No historical identity or memory record should be modified as a rollback shortcut.

## Primary evidence

- [Hosted token verifier](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/blob/75e4f7a84a263dc70d6974dc87da15352fbbcca9/src/auth/access-token.ts)
- [Hosted runtime composition](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/blob/75e4f7a84a263dc70d6974dc87da15352fbbcca9/src/api/main.ts)
- [Hosted membership authorization](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/blob/75e4f7a84a263dc70d6974dc87da15352fbbcca9/src/knowledge/service.ts)
- [Hosted HTTP routes and error mapping](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/blob/75e4f7a84a263dc70d6974dc87da15352fbbcca9/src/api/server.ts)
- [Hosted chat implementation](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/blob/75e4f7a84a263dc70d6974dc87da15352fbbcca9/src/providers/chat.ts)
- [Current Neon Auth public JWKS](https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth/.well-known/jwks.json)
- [Current Core protected-resource metadata](https://core-api-staging-dec8a723.up.railway.app/.well-known/oauth-protected-resource)
- [Hosted-to-PR-46 source comparison](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/compare/75e4f7a84a263dc70d6974dc87da15352fbbcca9...b3fc1ec141a9f3667bf44d227034fbc90d4ec88e)
- [Historical frontend kit's explicitly missing token handoff](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/blob/f1b69bbd2fc8568ab7d22928dc78694634200d0b/frontend-kit/modules/README.md)
- [Historical memory identity/cutover issue #47](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/issues/47)
