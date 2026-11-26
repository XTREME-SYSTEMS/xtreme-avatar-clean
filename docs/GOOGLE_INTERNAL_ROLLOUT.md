# Neon accounts and deferred Google organization setup

Checkpoint: 2026-11-26 UTC. This is a deployment handoff, not a claim that Google configuration or live registration has passed.

## Intended outcome

Jeremy requested a visible Create account option so his boss can use the clean application. His subsequent decision is to keep Neon sign-in now and defer Google organization work. `xtremeavatar.com` remains the intended application address and brand. A person can use an existing work email for a Neon account without moving a company's Google Workspace domain. Future Google setup may use the Strategic Minds organization; the intended user's company domain may change later, so no organization migration is authorized by this registration change.

Keep the existing Vercel application, existing managed Neon identity service, and separate Eden Core runtime. Registering the application with Google Auth Platform later does not require moving its hosting to Google Cloud. The application's website/brand domain does not, by itself, establish a Google Workspace organization or provision a Google email account.

Account registration must create only the caller's managed Neon account. A new account does not join another person's workspace or receive a Core tenant mapping, signer, provider grant, or access to private conversations. The existing first-workspace form remains a separate, explicit action.

## Verified environment

| Item | Value and evidence |
| --- | --- |
| Canonical app repository | `XTREME-SYSTEMS/xtreme-avatar-clean`; working branch `feat/neon-core-chat-20261125` |
| Configured preview origin | `https://xtreme-avatar-clean-git-feat-neon-core-47e4c3-xtreme-ai-systems.vercel.app` |
| Application identity | Existing Neon project `delicate-scene-98135330`, branch `br-divine-hall-bcgshvxl`, database `neondb` |
| Managed Auth base | `https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth` |
| Email account creation | Live Neon config: email/password enabled and `allow_sign_up=true`; no policy changes made |
| Email verification | Live Neon config currently does not require verification at signup/signin. Registration must not claim the address is verified. Changing that shared policy requires a separate reviewed rollout. |
| Google social login | Live Neon config uses its shared Google application, with no custom client ID configured |
| Google project named by architecture | `xps-operations-494914` |
| Google Cloud CLI | SDK 549.0.0; an operator account is selected, but its API session requires reauthentication. Its different saved default project was left unchanged; each attempted read explicitly selected the architecture's project. |
| Google API access | Explicit project, billing, and enabled-services reads for `xps-operations-494914` all failed with reauthentication required; organization, audience, client, and permissions are UNKNOWN |
| Preview access | Vercel Authentication remains enabled. A Neon account alone does not grant access through that separate deployment protection. |

The project ID and the operator's email do not prove Google organization ownership. No Google project, client, scope, credential, audience, billing setting, or service was changed at this checkpoint. No invitation was sent.

## Three independent access decisions

1. **Google authorization audience.** Internal requires the Cloud project to belong to the same Workspace or Cloud Identity organization as its intended users. Verify the project's actual parent and the boss's work identity. If they are outside that organization, Internal is unsuitable; prepare the appropriate External flow instead. Google's login-only `openid`, `email`, and `profile` exception means External Testing's test-user list must not be treated as an application access control.
2. **Application and workspace access.** Managed email/password registration is separate from Google's audience. A Google Internal client does not make all app routes private, restrict email registration, or grant a company workspace. Preserve fresh server-side membership checks and grant only the intended workspace role through the managed invitation/membership flow. The boss's identity and destination workspace have not yet been provided.
3. **Protected preview access.** Keep Vercel's deployment protection. Grant a specific reviewer the supported scoped preview access or use an explicitly approved bounded review link. Do not disable project-wide protection to make a login test pass.

## Deferred Google sign-in wiring

The following is prepared for later review. Do not resume Google configuration, request reauthentication, migrate an organization, or change the provider merely to complete the current Neon registration request.

Use Google Auth Platform for the existing architecture-selected project:

- [Audience](https://console.cloud.google.com/auth/audience?project=xps-operations-494914)
- [Branding](https://console.cloud.google.com/auth/branding?project=xps-operations-494914)
- [Clients](https://console.cloud.google.com/auth/clients?project=xps-operations-494914)
- [Project settings](https://console.cloud.google.com/iam-admin/settings?project=xps-operations-494914)

Before changing audience, inspect the existing clients and users: a project-level change may affect other clients. Do not alter unrelated production clients. The CLI's expired session must be renewed by its user or the authorized console session used; do not extract browser credentials or bypass a permission denial.

For a supported standard Web application client used by managed Neon Google login, the provider callback is the full branch Auth URL followed by `/callback/google`:

```text
https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth/callback/google
```

The later application landing route is different:

```text
https://xtreme-avatar-clean-git-feat-neon-core-47e4c3-xtreme-ai-systems.vercel.app/auth/callback/google
```

The latter is already supplied by the clean app to managed Neon and its origin is already a trusted Neon redirect origin. Preserve exact origin matching; an immutable Vercel deployment hostname is not a substitute for the configured branch alias. Confirm the managed callback in the selected provider configuration before saving a custom client.

Keep a client secret in the provider's secure configuration. Do not put it in source, a browser-visible environment variable, logs, a PR, or chat. Updating the shared branch Google provider affects every application using it and needs a verified rollback and acceptance check.

Use only basic identity scopes for sign-in. Gmail, Drive, Contacts, and other Workspace features need their own implemented per-user authorization, minimal scopes, secure token storage, revocation handling, and actual read/write receipts. If automated agents or MCP workflows are added, Google's current client guidance calls for a separate agentic client, distinct from the standard interactive login client. Do not add domain-wide delegation or domain-wide trust as a shortcut.

## Existing-account caveat

The preceding hosted Google attempt returned the safe app code `GOOGLE_ACCOUNT_LINK_REQUIRED`, derived from the provider's `account_not_linked` error. Installing a custom Google client does not establish that this linking condition is repaired. Existing account owners must authenticate and use a supported, explicit linking or recovery flow. Never mark an email verified, merge identities by email, relax implicit linking, or manufacture a membership to pass a test.

## Acceptance and resume point

After the new registration revision is deployed, check the actual Create account form, password confirmation, keyboard/mobile use, and a user-controlled signup. Prove the fresh managed session, sign-out/reload/revocation behavior, existing-account response, and membership isolation. Automated provider-contract tests are source evidence; they do not prove a hosted user was created.

For the current request, obtain the boss's intended sign-in email and workspace before assigning access. Do not send an invitation or grant the owner's identity implicitly. Keep the existing production domain until the clean deployment passes its live acceptance and release gates.

For Google, resume only when the user returns to that deferred work. Read back the organization, audience, exact client/callback, and relevant permissions in an authenticated project console. Apply only the concrete suitable configuration, then verify an allowed organizational login and an outside-user denial where Internal is selected. Keep Core disabled until its separate approved identity and staging grant pass real chat acceptance.

## Primary references

- [Google audience settings](https://support.google.com/cloud/answer/15549945?hl=en)
- [Google OAuth client configuration and standard/agent client separation](https://support.google.com/cloud/answer/15549257?hl=en)
- [Google OAuth application states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [Neon managed Auth flow](https://neon.com/docs/auth/authentication-flow)
- [Neon provider and callback guidance](https://neon.com/docs/auth/guides/setup-oauth)
- [Better Auth email/password registration](https://www.better-auth.com/docs/authentication/email-password)
- [Better Auth accounts and explicit linking](https://www.better-auth.com/docs/concepts/users-accounts)
