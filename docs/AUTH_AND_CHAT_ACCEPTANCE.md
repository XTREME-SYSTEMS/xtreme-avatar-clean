# Neon account and Core chat implementation

## What this change implements

The clean phone shell now links to an account page and text chat. Account requests
use the existing Avatar Managed Better Auth service through a fixed server adapter.
The adapter forwards only the managed opaque session cookie; it does not create a
second identity server, use a local JWT session cache, or connect to Core's database.
Every protected chat request checks the current provider session and organization
membership. A browser-provided subject, role, email or tenant cannot grant access.

The account page includes a deliberate Create account option with name, email,
password and confirmation. Its server route accepts only the registration fields
and calls the existing managed `sign-up/email` endpoint. It does not accept a role,
organization, user ID or caller-selected callback. A signed-in outcome requires a
fresh managed session matching the provider's signup user and submitted email;
a body token alone cannot establish authentication. A response without that proof
uses neutral follow-up guidance, including when the provider conceals whether an
account already exists. Registration does not grant a company workspace or Core
access. Existing provider email-verification and linking settings are preserved.

A signed-in account with a verified empty workspace list can explicitly create its
first workspace by entering a display name. The existing Managed Neon organization
service assigns membership; the app rechecks the initiating user, session, exact
organization, and owner membership before reporting success. A stable server-derived
slug and the existing provider uniqueness constraint protect retries and concurrent
tabs. An uncertain creation is recovered by reading the same workspace, without
automatically repeating the create request. Existing memberships keep their selector.
This action creates no Core tenant, identity binding, permission grant, or historical
memory mapping. See [Neon's organization contract](https://neon.com/docs/auth/guides/plugins/organization).

The Core adapter implements the currently served `/v1/chat` POST and GET contract.
It only contacts the verified staging origin and validates bounded JSON in both
directions. A scoped server delegation can be minted only when an explicitly
approved, unexpired one-to-one identity binding and signing configuration exist.
Chat scopes are fixed to `knowledge:read tool:execute profile:read`; historical
memory migration is outside this first acceptance slice.

The client keeps an original request key with each unresolved submission on this
device for up to 24 hours, separately for every account/workspace and request.
Concurrent tabs cannot overwrite each other's recovery keys. It never silently
redispatches under a new key after a timeout. Completed, pending, failed, unknown,
access-denied and setup-required states have distinct behavior. Sign-out clears
pending local text; it is not a second shared memory store.

## Source checks versus live acceptance

`npm run check` runs lint, TypeScript, the original clean-room policy and behavioral
auth/Core tests. Tests use synthetic sessions/keys/responses; they do not prove a
real provider grant, a generated response, avatar playback, or production readiness.
The new CI job also builds the exact source without provider secrets.

At revision `1eaace0`, hosted Google sign-in reached account selection and basic
sign-in consent, then returned without a verified application session. The fixed
callback diagnostic confirmed `GOOGLE_ACCOUNT_LINK_REQUIRED`. This is an existing
account-linking condition, not evidence that a new Google client repairs it. The
owner's subsequent email/password attempt was rejected. Source tests do not
establish a successful hosted login, registration, or workspace creation.

Jeremy has chosen Neon account access for the immediate rollout and deferred
Google organization changes. See [the account and Google handoff](GOOGLE_INTERNAL_ROLLOUT.md)
for the intended `xtremeavatar.com` brand/domain and future organization decisions.

Required hosted checks after configuration:

- Complete user-controlled registration, confirm the exact new managed session,
  and distinguish an existing account, denied signup, verification follow-up and
  uncertain response. Do not create production test identities or claim an email
  was verified from an unverified provider field.
- Sign in, reload, select only a workspace where the user is a member, then sign out.
- Verify a revoked session and a foreign user/organization cannot call Core.
- Verify the approved issuer, audience, client and key policy on the exact Core
  deployment; do not assume a primary metadata issuer lists every accepted issuer.
- Read the authenticated Core profile/connections, obtain a genuine chat response
  and provider reference, reload history, and recover the same request after a lost
  response without a new generation key.
- Exercise account switching in a second tab while the first tab has a request in
  flight. The old view must be cleared and its response ignored.
- Verify mobile account/chat layout, current clean-room dependency policy and
  independent review. Keep the existing production domain until release gates pass.

## Configuration and rollout

`vercel.json` disables automatic Git deployments for every branch with
`git.deploymentEnabled: false`. Create review deployments explicitly as Preview
deployments of the exact reviewed source revision. Production promotion and domain
assignment remain gated by independent release checks and owner approval. See
[Vercel's Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration).

Only `NEON_AUTH_BASE_URL` and the exact `AVATAR_APP_ORIGIN` are needed for the
account adapter. The auth origin is pinned to the existing verified Avatar branch.
The preview host must be trusted by Neon. No new Neon project or branch is created.

`CORE_CHAT_ENABLED` remains false in the review preview. The other Core variables
in `.env.example` are deliberately empty. Do not fill them with guessed IDs or copy
credentials from the legacy application. The identity binding shape and precise
live grant requirements are in [CORE_IDENTITY_BRIDGE_REQUIREMENTS.md](CORE_IDENTITY_BRIDGE_REQUIREMENTS.md).
The current Core verifier shares a pool of trusted keys; constrain the new key to
the reviewed principal pair and scope ceiling before granting it trust.

Google Workspace data consent remains separate from Google account sign-in.
Tavus, Live voice, generated images and outbound communications remain unavailable
until their actual identity-bound journeys pass the tests described in
[SERVICE_CONNECTION_READINESS.md](SERVICE_CONNECTION_READINESS.md).

## Rollback

The feature is isolated on `feat/neon-core-chat-20261125`, based on the existing
phone-restoration branch. Revert this feature commit or redeploy the preceding
preview. Disabling `CORE_CHAT_ENABLED` stops delegation. There are no application
schema, historical-memory, production-domain, or existing Core runtime changes in
this source slice. Revoke any separately granted key and mapping when retiring a
live binding; deleting frontend code alone does not revoke an issued credential.
