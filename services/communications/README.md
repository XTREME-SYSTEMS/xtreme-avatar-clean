# Xtreme Avatar Communications Service

Canonical application: `XTREME-SYSTEMS/xtreme-avatar-clean`; deployed from `services/communications` into dedicated Railway project **Xtreme Avatar Communications**.

## Authority and storage

- **Avatar Neon** `delicate-scene-98135330`, `neondb`: `avatar_app.communication_settings`, `consented_numbers`, `communication_audit`, `messaging_senders`, `message_outbox`, `messaging_daily_usage`, `inbound_messages`.
- App login remains **Neon Auth**; the Next.js `/api/settings/communications` route authorizes owner/admin workspace membership and reads/writes only that verified workspace.
- Railway is the **provider transport**, not a new account system, Eden Core, or orchestration engine. It stores no Supabase connection string.
- The settings form records an owner-attested consent claim. It does not independently verify consent or trigger a send.

## Operational environment (server-side only)

- `AVATAR_DATABASE_URL`: existing Avatar Neon PostgreSQL URL (configured securely in Railway, never commit).
- `COMMS_PUBLIC_ORIGIN`: the exact Railway HTTPS public origin used to verify Twilio signature callbacks.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`: Twilio's authorized account; not copied from the historical bridge when inaccessible.
- `COMMS_SERVICE_SECRET`: service-to-service secret for `POST /v1/messages`, required before sends.
- `COMMS_SEND_ENABLED`: defaults to `false` until sender verification, opt-in evidence, registration, cost controls, and live receipt tests.
- `PORT`: injected by Railway; defaults to `3000` locally.

## Routes

- `GET /health`: service and configuration status, without secrets.
- `GET /ready`: performs a real Neon query; reports 503 if database unavailable.
- `POST /webhooks/twilio/inbound`: accepts signed Twilio requests. Unknown or unverified sender mappings are acknowledged **without** saving message content. Never mirrors untrusted inbound text into a system prompt.
- `POST /webhooks/twilio/status`: accepts signed Twilio delivery callbacks and updates matching message receipts.
- `POST /v1/messages`: requires a server bearer secret, verified active sender mapping, recipient consent in Neon, stable request ID, and explicit send enablement. Unknown send outcomes are not automatically retried. A nullable desired daily budget means no **additional app quota**, not unlimited provider entitlement.

## Remaining activation gates

1. Verify Railway `/health` and `/ready` against the actual Avatar Neon database.
2. Connect **Twilio credentials through Railway's protected Variables interface**, confirm account and intended sender ownership, A2P / toll-free and WhatsApp channel readiness; never copy X1/Supabase environment variables.
3. Register an owned sender in `avatar_app.messaging_senders` only after provider proof and correct workspace ownership. The table starts empty.
4. Verify signed inbound/status requests, one consented outbound SMS/MMS, status callback, suppression, billing, and duplication recovery.
5. Create a separate `send.otp` webhook with signature verification for Neon Phone Number; enable the Neon phone plugin only after one real OTP is delivered to the correct existing account.
6. Connect the Next.js backend to `POST /v1/messages` using verified Neon user and workspace identity and the server secret, not browser-controlled identity fields. Bring per-user Google/WhatsApp permissions online separately.

No production Twilio number, WhatsApp sender or existing Call Desk routing is changed by deploying this service. The new service does **not** silently remove the existing 25-message Call Desk cap. Once the new transport passes live messaging tests, owner-editable app preferences can be used as its separate daily allowance.
