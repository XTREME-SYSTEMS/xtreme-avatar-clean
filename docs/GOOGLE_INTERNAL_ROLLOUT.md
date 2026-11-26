# Neon accounts and resumed Google sign-in setup

Checkpoint: 2026-11-26 UTC. This handoff records observed configuration, an unsaved client form, and the remaining live acceptance work.

## Intended outcome

Jeremy requested a visible Create account option and the application's own sign-on so his boss can use the clean application. Google setup has now resumed alongside Neon email/password accounts. `xtremeavatar.com` remains the intended application address and Xtreme Avatar remains the brand. A person can use an existing work email for a Neon account without moving a company's Google Workspace domain. No organization migration or project-parent change is part of this work.

Keep the existing Vercel application, existing managed Neon identity service, and separate Eden Core runtime. Configuring Google Auth Platform does not require moving application hosting to Google Cloud. The application's website/brand domain does not, by itself, establish a Google Workspace organization or provision a Google email account.

Account registration must create only the caller's managed Neon account. A new account does not join another person's workspace or receive a Core tenant mapping, signer, provider grant, or access to private conversations. The existing first-workspace form remains a separate, explicit action.

## Verified environment

| Item | Value and evidence |
| --- | --- |
| Canonical app repository | `XTREME-SYSTEMS/xtreme-avatar-clean`; working branch `feat/neon-core-chat-20261125` |
| Known deployed clean source | `380f654b7d12ad02b3fd46920319c36d5ba9a7f9`; the preview's Create account UI rendered. A real user-controlled signup has not yet been tested. |
| Configured preview origin | `https://xtreme-avatar-clean-git-feat-neon-core-47e4c3-xtreme-ai-systems.vercel.app` |
| Application identity | Existing Neon project `delicate-scene-98135330`, branch `br-divine-hall-bcgshvxl`, database `neondb` |
| Managed Auth base | `https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth` |
| Email account creation | Live Neon config: email/password enabled and `allow_sign_up=true`; no policy changes made |
| Email verification | Live Neon config currently does not require verification at signup/signin. Registration must not claim the address is verified. Changing that shared policy requires a separate reviewed rollout. |
| Google social login | Live Neon config uses its shared Google application, with no custom client ID configured |
| Google project and console access | The signed-in browser can access `xps-operations-494914` under Jeremy's Strategic Minds AI account. |
| Google branding | Application name: **Xtreme Avatar**. Application home page: `https://www.xtremeavatar.com`. Privacy policy link: `https://www.xtremeavatar.com/privacy`. Terms link is empty. |
| Google audience and publishing state | **External**, **In production**, observed in Google Auth Platform. Preserve these settings and the existing clients. This publishing label does not establish that the clean application has passed release acceptance. |
| Google project organization | Actual organization/Workspace parent remains **UNKNOWN**. Neither the project name nor the signed-in account's email establishes it. |
| New Google Web client | Form prepared but **UNSAVED**; details below. Create is enabled, but the client has not been created. |
| Preview access | Vercel Authentication remains enabled. A Neon account alone does not grant access through that separate deployment protection. |

Earlier `gcloud` project, billing, and service reads failed because that CLI session required reauthentication. The authenticated browser console is usable; those CLI errors do not establish a Google outage or missing project access.

No Google or Neon configuration has been changed at this checkpoint. The prepared form has not issued a client ID or secret. Existing clients, audience, scopes, billing, services, and organization ownership remain unchanged. No invitation was sent.

## Three independent access decisions

1. **Google authorization audience.** The current project is External and In production. Keep that audience while configuring this additional standard sign-in client. An Internal audience would require verified project-organization ownership and eligible users; that evidence is absent, and no conversion to Internal is authorized here. Google's audience is separate from permission to enter a company workspace in this app.
2. **Application and workspace access.** Managed email/password registration is separate from Google's audience. A Google Internal client does not make all app routes private, restrict email registration, or grant a company workspace. Preserve fresh server-side membership checks and grant only the intended workspace role through the managed invitation/membership flow. The boss's identity and destination workspace have not yet been provided.
3. **Protected preview access.** Keep Vercel's deployment protection. Grant a specific reviewer the supported scoped preview access or use an explicitly approved bounded review link. Do not disable project-wide protection to make a login test pass.

## Existing clients and prepared new client

The signed-in console showed two existing clients. Preserve both:

| Existing client | Observed configuration | Handling |
| --- | --- | --- |
| Xtreme Avatar Platform | Client ID `129011362159-bhi52bu5ab9um2p8269jvm54kpbbtnro.apps.googleusercontent.com`; its only authorized callback is `https://www.xtremeavatar.com/api/connections/google/callback` | Legacy client; leave its callback and credentials unchanged. It is not the new managed Neon sign-in client. |
| Existing XPS operator client | Present in the same project; no changes made | Preserve its configuration and audience assumptions. |

The following new-client form is prepared in Google Auth Platform:

| Field | Prepared value |
| --- | --- |
| Application type | Web application |
| Name | `Xtreme Avatar Clean - Neon Sign-in` |
| Authorized JavaScript origins | None; the planned login uses the server-mediated flow |
| Authorized redirect URIs | Exactly the managed Neon callback shown below |
| AI agent option | Unchecked; this is the standard interactive sign-in client |
| Submission state | **Create enabled; form UNSAVED; client NOT CREATED** |

Intended sign-in scopes are only `openid`, `email`, and `profile`. Preparing this form has not granted those scopes, configured a custom Neon provider, linked any account, or changed the project's audience.

Use Google Auth Platform for the existing architecture-selected project:

- [Audience](https://console.cloud.google.com/auth/audience?project=xps-operations-494914)
- [Branding](https://console.cloud.google.com/auth/branding?project=xps-operations-494914)
- [Clients](https://console.cloud.google.com/auth/clients?project=xps-operations-494914)
- [Project settings](https://console.cloud.google.com/iam-admin/settings?project=xps-operations-494914)

Use the existing authenticated console session for the reviewed configuration. Preserve the current audience and unrelated production clients; project-level audience changes can affect them. Do not extract browser credentials, renew CLI authentication merely for this handoff, or bypass a permission denial.

## Two distinct callbacks

The sole authorized redirect URI in the prepared Google Web client is the full branch Auth URL followed by `/callback/google`:

```text
https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth/callback/google
```

The later application landing route is different:

```text
https://xtreme-avatar-clean-git-feat-neon-core-47e4c3-xtreme-ai-systems.vercel.app/auth/callback/google
```

The latter is supplied by the clean app to managed Neon, and its origin is already a trusted Neon redirect origin. It is the later application landing route, not a replacement for Google's provider callback. The legacy `/api/connections/google/callback` is also a separate route. Preserve exact origin matching; an immutable Vercel deployment hostname is not a substitute for the configured branch alias. Read back the selected provider and the full managed callback before submitting the new client.

Keep a client secret in the provider's secure configuration. Do not put it in source, a browser-visible environment variable, logs, a PR, or chat. Updating the shared branch Google provider affects every application using it and needs a verified rollback and acceptance check.

Gmail, Drive, Contacts, and other Workspace features need a separate implemented per-user consent flow, minimal scopes, secure token storage, refresh/revocation handling, and actual read/write receipts. Basic Google sign-in grants no Workspace data access. If automated agents or MCP workflows later require Google authorization, assess the separate agentic-client requirements without changing this standard interactive client. Do not add domain-wide delegation or domain-wide trust as a shortcut.

## Provider setup and rollback checkpoint

Official Neon guidance supports replacing shared Google credentials with the application's own Client ID and secret through the existing provider's Configure dialog or branch-scoped PATCH API. In the observed `Vercel: Xtreme-AI-Systems` console, however, Configure displayed the shared-keys notice without credential fields, and Add OAuth provider was disabled. Published Vercel-managed integration limitations do not explain this specific screen. Its cause and this account's effective provider-edit permission remain unverified; do not infer that all Vercel-managed projects lack custom OAuth support or bypass a permission denial.

**A non-deleting rollback to shared credentials is not established.** The [PATCH contract](https://neon.com/docs/reference/api/auth/update-branch-neon-auth-oauth-provider) says omitted `client_id` and `client_secret` preserve their current values. Its request and the native connector expose optional strings, with no shared/reset flag or nullable-clear contract. The [inspected CLI source](https://github.com/neondatabase/neon-pkgs/blob/4f76a1a21c2b9b8f4a5bef7c5988f07499b60fe9/packages/cli/src/commands/neon_auth.ts) reuses the add command's shared-credential help text but passes optional fields into the same PATCH operation. That wording is not evidence that an empty update restores shared credentials. Do not guess empty-string/null behavior or delete and re-add the provider. Keep the existing branch provider unchanged until Neon confirms a supported rollback that preserves users and the provider.

The prepared managed callback follows Neon's documented production setup. Google's [production policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance) separately requires domain verification and recommends an owned-domain mapping for shared service-provider domains. No Neon Auth custom-domain procedure or verification exception was established by this review. Preparing a client with the documented callback is not a claim that Jeremy owns `neon.tech`, that an automatically added authorized domain is verified, or that public branding verification has passed.

## Branding review and public-domain requirements

The prior Google review identified three specific issues:

- The application home page URL was not registered to the operator.
- The home page was behind a login.
- The logo did not uniquely identify the brand.

These findings remain acceptance items until corrected and verified. Check domain ownership under the appropriate authorized account; provide a public home page and privacy policy that can be opened without Google, Neon, or Vercel login; and use a clear, distinctive Xtreme Avatar logo consistent with the application name. An HTTP response or a new OAuth client alone does not resolve Google's ownership or branding review. Read back the saved URLs before resubmitting verification. Keep the protected clean preview separate from the public branding pages.

## Existing-account caveat

The existing credential-based account's hosted Google attempt returned the safe app code `GOOGLE_ACCOUNT_LINK_REQUIRED`, derived from the provider's `account_not_linked` error. Neon still uses its shared Google provider. Installing a custom Google client does not establish that this linking condition is repaired.

Explicit linking is implemented in this source changeset and independently reviewed. It requires an already authenticated account and the supported managed-provider flow, pins the original session cookie, validates user-owned account rows, and uses a separate signed attempt marker. Its callback performs only fresh reads and sends no Set-Cookie header; markers expire naturally within 600 seconds or are replaced by an explicit new start. The dedicated server-only `AVATAR_AUTH_FLOW_SECRET` remains unset in the hosted preview, so live link initiation stays disabled. Read-only connection status does not require that key.

No successful hosted managed Google callback/linking round trip or revocation acceptance has been verified at this checkpoint. Neon performs its account-link write before the application callback: rejecting an app callback does not prove that the provider refused a revoked session or conflicting identity. Existing account owners must authenticate before linking. Never mark an email verified, merge identities by email, relax implicit linking, or manufacture a membership to pass a test.

## Acceptance and resume point

The Create account UI has rendered on the preview at source `380f654b7d12ad02b3fd46920319c36d5ba9a7f9`. Complete a user-controlled signup and check password confirmation, keyboard/mobile use, the fresh managed session, sign-out/reload/revocation behavior, existing-account responses, and membership isolation. Automated provider-contract tests are source evidence; they do not prove a hosted user was created.

For the current request, obtain the boss's intended sign-in email and workspace before assigning access. Do not send an invitation or grant the owner's identity implicitly. Keep the existing production domain until the clean deployment passes its live acceptance and release gates.

Google work is active again. Resume at the unsaved **Xtreme Avatar Clean - Neon Sign-in** Web-client form, preserving the existing clients and External/In production audience. After the reviewed client is created, read back its non-secret client ID and sole callback, configure its secret only through the managed provider's secure settings, and verify the actual hosted flow. Because the Neon branch provider is shared, retain a reviewed rollback path before changing it.

The source implementation and independent review passed the 17 focused linking checks, including a delayed old callback that must not erase a newer attempt. Complete the combined source check/build, then conduct a controlled hosted test for the same authenticated account, normal linking, conflict denial, sign-out and revocation before return. Do not treat a created client, a provider setting, a mocked test or the absence of an error page as proof of a successful managed session. Keep Core disabled until its separate approved identity and staging grant pass real chat acceptance. Preserve the existing production domain until the clean deployment passes live acceptance and release gates.

## Domain topology snapshot

A read-only audit at approximately 04:02 UTC on 2026-11-26 found `eve.xtremeavatar.com` on Railway's separate EVE Factory Chat / LibreChat service, with verified DNS and a valid certificate. An older successful deployment served one running replica while three newer attempts had failed. Its root returned the LibreChat page and its anonymous current-user endpoint returned 401; full operator/factory authorization was not certified. This hostname was not established as the separate MCP gateway endpoint.

At that snapshot, apex/www still served the original `xtreme-avatar-platform` production deployment, while clean source `380f654` remained a protected Vercel preview. Keep these application, engineering, and gateway responsibilities separate; recheck the live topology before a domain cutover. Signed-in EVE cookie scope was not observed, so retain host-only cookie isolation as a verification requirement.

## Primary references

- [Google audience settings](https://support.google.com/cloud/answer/15549945?hl=en)
- [Google OAuth client configuration and standard/agent client separation](https://support.google.com/cloud/answer/15549257?hl=en)
- [Google OAuth application states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [Neon managed Auth flow](https://neon.com/docs/auth/authentication-flow)
- [Neon provider and callback guidance](https://neon.com/docs/auth/guides/setup-oauth)
- [Neon provider update contract](https://neon.com/docs/reference/api/auth/update-branch-neon-auth-oauth-provider)
- [Neon Vercel-managed account behavior and limitations](https://neon.com/docs/guides/vercel-managed-integration)
- [Google production domain and branding requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
- [Better Auth email/password registration](https://www.better-auth.com/docs/authentication/email-password)
- [Better Auth accounts and explicit linking](https://www.better-auth.com/docs/concepts/users-accounts)
