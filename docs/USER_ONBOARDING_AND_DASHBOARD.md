# Xtreme Avatar: sign-in, dashboard, and future onboarding

Status: **Dashboard-first implemented on the clean feature branch. Guided onboarding is a future implementation, not an enabled product.**

## Active flow (November 26, 2026)

1. Visitor signs in with managed Neon email/password, Google, or creates an account.
2. If the account has no active verified workspace membership, it stays on Account to create or select an authorized workspace. Creating a user never grants arbitrary organization access.
3. Only after the app receives a fresh, authorized active workspace does it route the user to **/dashboard**.
4. `/dashboard` performs its own server-side session and workspace membership check, reuses the approved phone-style Home command center, and displays the active workspace and user name.
5. The Account page remains accessible through the profile icon for Google connection, workspace changes, and sign-out. Existing signed-in users visiting Account deliberately are **not** auto-redirected.
6. A successful Google login follows the same decision. A Google account-link callback remains on Account and does **not** trigger a dashboard jump.
7. Inconsistent, anonymous, expired, banned, or membership-required identities never receive dashboard access.

## Planned guided onboarding (proposed, not live)

Once the underlying capabilities are actually connected, offer a skippable first-run wizard:

1. **Identity and workspace:** workspace name, company or personal use, team membership; tenant isolation.
2. **Avatar:** select a stock face or create one through a licensed provider with clear rights, pricing, and an explicit preview.
3. **Voice:** choose from actually available and permitted live voice names; demonstrate the audio rather than promising Sol/Gleam identity.
4. **Knowledge:** choose available industry packs and upload scoped user or company materials with clear data ownership and privacy boundaries.
5. **Skills and autonomous work:** offer approved capability tiers, manual vs autonomous permissions, action receipts, budgets, and review gates.
6. **Connections:** optional Gmail, Calendar, Drive, Contacts, SMS/MMS, WhatsApp, and phone auth with distinct provider OAuth scopes, readiness, and opt-in.
7. **Dashboard assembly:** show only enabled and authorized tools, plus clearly marked setup shortcuts for not-yet-connected tools.
8. **Upgrades:** optional invention machine, skins, tool packs, intelligence packs. Pricing, payment entitlement, and trial rules must be real before purchase buttons are enabled.

Onboarding choices should be stored in scoped Neon records and recover after interruption; completion should be idempotent and per workspace/user as appropriate. Skipping onboarding must not block access to the basic dashboard. Neither payment entitlements nor vendor permissions are inferred from a selected UI option.

**Current release choice:** for owner and boss testing, use a working dashboard first. Do not delay account access on unverified avatar, memory, voice, or billing features.
