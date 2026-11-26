# Xtreme Avatar — clean application

The canonical frontend is `XTREME-SYSTEMS/xtreme-avatar-clean`. It contains the
Next.js 16 / TypeScript application, the approved brushed-aluminum and gold phone
design, all eleven restored phone layouts, supporting routes, account access and
an identity-bound Core chat adapter. It is no longer an empty specification repo.

Eden Core V2 remains the existing brain and memory authority on Railway. Neon
Managed Better Auth in the existing Avatar project remains the application
identity service. Core code, legacy app code, database schemas and credentials
have not been imported into this application.

## Development

Use Node.js 24 and the committed lockfile:

```sh
npm ci
npm run dev
npm run check
npm run build
```

The visual application builds without service credentials. Copy `.env.example`
to an ignored local environment file only when configuring an authorized HTTPS
development/preview origin. Do not put secret values in source or browser-public
variables. The managed auth adapter uses fixed provider endpoints; there is no
parallel local auth server or database credential in this first slice.

## What is implemented and what is verified

- The approved phone interface and navigation are implemented, with original asset
  provenance in `docs/PHONE_SCREEN_PROVENANCE.json`. Mock counts and the Demo data
  badge were removed in the preceding phone-restoration change.
- Create account, sign-in and workspace access use the existing managed Neon
  identity service. New accounts do not inherit another user's workspace or Core
  access. Account and workspace access use fresh provider session and membership checks,
  host-only HttpOnly cookies, same-origin mutation checks and honest error states.
- A signed-in account can read its Google connection status. Explicit linking has
  a separate callback bound to the original live session; it never adopts a new
  session or grants Workspace access. Linking stays disabled while the dedicated
  server-only `AVATAR_AUTH_FLOW_SECRET` is unset. Hosted linking is not yet verified.
- `/api/eden/chat` is a fixed server adapter for Core chat and chronological history.
  It preserves request identity across retries and validates bounded input/output.
- Core delegation stays disabled until a specifically approved Neon-to-Core
  identity mapping and constrained signing-key grant exist. No static owner token
  is shared among signed-in users.
- Source tests are separate from live sign-in, Core reply, tenant-denial and recovery
  acceptance. A passing build does not establish provider connectivity.
- Workspace data, Tavus playback, Live voice, generation and outbound communications
  remain unavailable until their real consent, media and receipt paths are verified.

See [auth/chat acceptance](docs/AUTH_AND_CHAT_ACCEPTANCE.md),
[Core identity requirements](docs/CORE_IDENTITY_BRIDGE_REQUIREMENTS.md), and
[service readiness](docs/SERVICE_CONNECTION_READINESS.md) for the concrete gates.
The current rollout keeps Neon accounts and the Xtreme Avatar brand. Google
sign-in setup has resumed; no Google organization migration is part of this work.
See [the account rollout handoff](docs/GOOGLE_INTERNAL_ROLLOUT.md).

## Release

Changes are reviewed on isolated branches. The production domain currently remains
with the existing application until the exact clean deployment passes
[release gates](docs/RELEASE_GATES.md), independent review and owner approval.
Do not treat a Figma preview or a Vercel READY build as a completed live integration.
