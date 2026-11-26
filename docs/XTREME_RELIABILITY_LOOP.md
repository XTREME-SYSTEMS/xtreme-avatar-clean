# Xtreme Avatar Reliability Loop

Current status: V1 public canary PASSED; hourly ChatGPT monitoring SCHEDULED; unattended repair NOT independently verified.

Owner: Strategic Minds AI. Canonical target repository: XTREME-SYSTEMS/xtreme-avatar-clean.
This is a reliability contract for the existing Xtreme Avatar system, not another queue, factory, database, or control plane.

## Verified topology, November 26, 2026

- Vercel application: www.xtremeavatar.com, project prj_asiBXihtls04zu40GF0Mp2IxWM4c. Public routes and anonymous-access checks passed.
- Railway communications: project 7c706bdd-bf76-4472-8102-633f70820005, service 15d1d90a-09f5-4022-be9e-cc9f404fd30a. Public /health and /ready passed; no customer messages were sent by the audit.
- Neon Avatar: project delicate-scene-98135330, branch br-divine-hall-bcgshvxl. Railway /ready demonstrates an actual database query.
- EVE Foreman V2: Vercel project prj_KSNry8rDfbkU30OOA5XEWtbb20Kw. Its FACTORY_REPO currently points at xps-admin/eve-software-factory-template, NOT the Xtreme Avatar repo. Do not route Xtreme Avatar code repair to it before verifying a target-aware factory intake and GitHub App access. The latest observed deployment was READY preview only; production Foreman execution remains unverified.
- EVE LibreChat: online on the existing Railway project, but LibreChat is not itself a persistent Foreman repair worker.
- Owner monitoring: ChatGPT automation 6b07f6321dc48191820ee1025ff91c06 is scheduled hourly. Its unattended runs require independent receipt validation.
- Accountability: existing GitHub issues, commit SHAs, draft PRs and checks. No duplicate orchestration database.
- Guardian: independent release validation is a required separate actor, not yet certified for this feature.

## The closed loop

OBSERVE > CLASSIFY > CORRELATE > DIAGNOSE > SAFE REPAIR > RETEST > INDEPENDENT GUARDIAN > RECORD > MONITOR

1. Observe. Run npm run audit:reliability from a clean authorized checkout, or use equivalent provider-native read-only checks. Exactly nine anonymous public checks; never send a real message, fetch user data or send credentials to the audit.
2. Classify. Each probe is PASS, FAIL or UNKNOWN. Capture timing, HTTP status, UTC timestamp, source revision and stable incident fingerprint.
3. Correlate. Retry at most once and check real Vercel/Railway/Neon provider logs before drawing conclusions. A single timeout is not evidence of an application regression.
4. Issue ledger. Search for an open GitHub issue carrying the same fingerprint and source SHA. Update it if found, otherwise create one issue. Include exact target repo, owner, reproducer, acceptance, rollback and links. Do not create duplicate tickets.
5. Safe repair. At most one reversible authorized operation per iteration. Code repairs belong on feature branches and draft PRs. Railway redeploy is eligible only for a verified failed/crashed deployment with correct project, service and environment, no unrelated ongoing deploy, and a non-database cause. Check before/after health.
6. Guardian. Have a separate reviewer judge the exact diff and SHA: tenant isolation, auth, secrets, tests, rollback, observability, regression and provenance. Builder tests are not independent release certification.
7. Release. Production promotion, domain routing, secrets, identity, DB schema/data, customer messages, payments or permission changes require separate authorization and working provider grants. Failed or unknown mandatory checks block releases.
8. Retest. Repeat all probes, record a signed-off before/after receipt and stop. Persist the exact blocker and one next action if not healed.

## Commands

npm run test:reliability
npm run audit:reliability
node scripts/reliability/audit.mjs --write-receipt

The last command saves a local JSON receipt. It does not prove cloud persistence until uploaded through an authorized issue/artifact action. The canary never invokes Vercel, Railway, Neon, Twilio or GitHub write APIs.

A healthy audit returns nine passes: homepage HTTP 200; Account HTTP 200; anonymous dashboard HTTP 307 to Account; anonymous session HTTP 200 with no-store; private settings HTTP 401; anonymous outbound request HTTP 401 using an intentionally invalid phone number; Railway /health HTTP 200; Neon-backed /ready HTTP 200; apex domain HTTP 308 to www. An unauthorized HTTP 200 is a critical security finding, not a healthy result.

## Recovery policy

- Frontend or redirect regression: inspect the exact Vercel deployment, draft a code fix and test; never auto-reassign domains or blindly promote a build.
- Railway service crash: one native redeploy only after exact failure evidence, provider permission and a bounded rollback path; never endlessly restart.
- Neon readiness failure: inspect the connection and provider. No autonomous SQL migration, branch deletion, data mutation, password exposure or destructive reset.
- Auth and tenant isolation regression: open a critical incident and stop release. Never relax access checks to make tests green.
- Twilio failure: read existing consented message receipts and provider error codes. Never send an unsolicited test, change a webhook, or bypass an opt-out.
- WhatsApp: distinguish the shared sandbox from a production Meta-approved sender.
- EVE factory target mismatch: verify GitHub App installation, repo scope, source revision and authenticated intake before any label-based dispatch.
- One transient failure: retry one time; do not mutate anything.

## Initial evidence and outstanding work

At 2026-11-26 09:03:59 UTC the first live audit returned 9/9 PASS, zero unknown, mutationCount zero, guardianCertified false. Seven deterministic fault-injection and contract tests passed.

The hourly conditional ChatGPT automation is created, but its first unattended run is not proven.
EVE Foreman V2 is still configured for the template repo, not Xtreme Avatar. End-to-end Foreman intake, repair execution, independent Guardian and production release are not yet certified.
An authenticated Settings > System Health & Autonomy UI is proposed and must not be called operational until built and tested.

Every later iteration should preserve WHAT WAS FOUND, WHAT WAS HANDLED, WHAT WAS VERIFIED, WHAT REMAINS, immutable SHA, deployment IDs, before/after results, rollback reference, distinct Guardian verdict and evidence link. Suppress routine healthy notifications.
