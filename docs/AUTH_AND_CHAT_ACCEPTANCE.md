# Neon account and Core chat implementation

## What this change implements

The clean phone shell now links to an account page and text chat. Account requests
use the existing Avatar Managed Better Auth service through a fixed server adapter.
The adapter forwards only the managed opaque session cookie; it does not create a
second identity server, use a local JWT session cache, or connect to Core's database.
Every protected chat request checks the current provider session and organization
membership. A browser-provided subject, role, email or tenant cannot grant access.

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

Required hosted checks after configuration:

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
