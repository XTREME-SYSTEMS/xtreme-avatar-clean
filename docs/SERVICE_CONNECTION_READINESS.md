# Service connection readiness

Evidence snapshot: 2026-11-26, approximately 02:07 UTC. This is an implementation handoff, not a production certificate. Reads only were used to inspect provider configuration; no avatar conversation, OAuth grant, message, file access, contact access, or provider write was started.

## Decision and mandatory gates

Reuse the existing Eden Universal Core V2 API. Keep its intelligence, profile, memory, ownership checks, and receipts authoritative. Do not clone Core, import the legacy Avatar application, or create another brain, database, queue, or scheduler. The clean app supplies the interface and authenticated server adapters.

**Brain gate:** a verified app identity must resolve to a real Core subject and tenant membership. Core must authenticate the bridge and authorize the requested operation. Email equality, a configured credential, or successful Google sign-in is not this proof.

**Bootstrap gate:** complete the existing app/Core provisioning and profile/context prerequisites for that same identity; verify the applicable service configuration, grant, expiry and budget before enabling provider actions. Missing or revoked membership must fail closed. This names an acceptance gate, not a newly invented bootstrap endpoint. Do not provision a default owner or tenant as a fallback.

The current Core audit found a material identity mismatch: Neon exposes an EdDSA/Ed25519 signing key, while the served Core verifier expects its RS256 access-token contract and Core membership records. Forwarding a Neon bearer directly is not an implemented authentication bridge. A server-side exchange/bridge or deliberate Core verifier adaptation must be verified first. See the parallel Core/auth audit before choosing the implementation.

## Verified Tavus resources

The selected native Tavus connector passed configuration, authentication, and a downstream API read probe. This verifies account access, not live audio/video delivery.

| Existing resource | Observed configuration | Reuse boundary |
| --- | --- | --- |
| Eden face `rd3fce670df2` | Name Eden Skye; status `completed` | Reusable face candidate; playback not tested |
| Eden PAL `p78f5b305e3a` | `full` pipeline; `tavus-gpt-terra`; no external LLM base configured; Eden face | Existing hosted conversational brain; does not establish Core-backed conversation |
| Eden PAL `p62de58bd862` | `full` pipeline; `tavus-gemma`; no external LLM base configured; Eden face | Same distinction; do not silently replace its current behavior |
| Echo PAL `pipecat0` | `echo`; Daily transport; transport microphone disabled | Candidate for an app-supplied audio-echo stream |
| Echo PAL `pipecat-stream` | `echo`; Daily transport; transport microphone enabled | Candidate for publishing generated model audio as an input track; do not publish the user's microphone as the assistant's speech |
| Embed deployment `912d9c39-bf54-4e8e-80d9-311c860fd7c9` | Active; “Xtreme Avatar GPT Site Embed”; uses full PAL `p78f5b305e3a` | Existing embed is not the required Core audio bridge |

The embed allows `https://www.xtremeavatar.com` plus older GPT-site and Vercel preview origins. A new app origin is not automatically authorized. No deployment or origin was changed.

PAL `p78f5b305e3a` has Tavus memory disabled and one attached `xtreme_avatar_execute` tool delivered by app message with an empty argument schema. This is configuration evidence only; no successful execution or shared Core identity was verified.

The selected Core PAL, face, voice, model and feature-switch values remain unverified because the Railway OAuth inspection withholds environment values. The resource IDs above are available candidates, not proof that Core currently selects them.

## Existing Core media contract

Source pin: [`Strategic-Minds-AI/eden-universal-core-v2` at `75e4f7a84a263dc70d6974dc87da15352fbbcca9`](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/tree/75e4f7a84a263dc70d6974dc87da15352fbbcca9). Existing service: Railway `core-api`, staging, `https://core-api-staging-dec8a723.up.railway.app`.

| Method and path | Contract |
| --- | --- |
| `GET /v1/media/context` | Owner-bound Core profile and completed conversation startup context |
| `GET /v1/media/readiness` | Configured/model-metadata readiness; not playback evidence |
| `POST /v1/media/webrtc` | Strict JSON `{ requestKey, sdp }`; creates an OpenAI Live WebRTC session |
| `GET /v1/media/sessions/{missionId}` | Existing session status |
| `POST /v1/media/sessions/{missionId}/close` | Closes the owned Live session |
| `POST /v1/media/tavus/start` | Strict JSON `{ requestKey, liveMissionId }`; requires an active owned Live mission |
| `POST /v1/media/tavus/end` | Strict JSON `{ missionId }`; ends the owned Tavus conversation |

Media reads require `knowledge:read`, `profile:read`, and `tool:execute`; creation/close/end also require `task:submit`. These are Core operation grants, not Google OAuth scopes. `requestKey` is 8–96 ASCII letters, digits, underscores or hyphens; mission IDs are UUIDs.

Successful Live creation supplies `missionId`, `receiptId`, `sessionId`, and `transport: { type: "webrtc", sdp }`, plus the configured model/voice and verification flags. The provider route is OpenAI `/v1/live/sessions`, not an interchangeable Realtime endpoint. Source explicitly reports `sharedStartupContext: true`, `delegationConnected: false`, `providerToolExecutionVerified: false`, and `providerPlaybackVerified: false`; do not turn those into claims of a complete shared tool loop.

Successful Tavus creation supplies `missionId`, `receiptId`, `conversationId`, `conversationUrl`, `meetingToken`, `maxDurationSeconds`, `speechProducer: "openai-gpt-live"`, `audioEchoRequired: true`, and `playbackVerified: false`. It verifies an Echo PAL, a completed face and Daily transport when specified. Its request requires a private room, bounds duration to the Live session/grant, and requests recording disabled. The API validates an HTTPS `tavus.daily.co` room URL.

Duplicate starts return status/mission information with null transport or join credentials. Handle that as reconciliation of an existing operation, not a fresh usable session. Do not generate a new request key automatically after an uncertain provider outcome.

Sources: [API routes](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/blob/75e4f7a84a263dc70d6974dc87da15352fbbcca9/src/api/server.ts), [Live adapter](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/blob/75e4f7a84a263dc70d6974dc87da15352fbbcca9/src/providers/live-web.ts), [Tavus adapter](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/blob/75e4f7a84a263dc70d6974dc87da15352fbbcca9/src/providers/tavus-echo.ts).

### Media work still required

1. Complete the Brain/Bootstrap gates and implement a same-origin, authenticated app-to-Core adapter. Keep long-lived provider credentials off the browser.
2. Consume the returned SDP and join the private Daily room with its short-lived meeting token. Treat that token as sensitive session material; do not put it in logs or durable app state.
3. Implement one explicit audio bridge: either Base64 audio echo with a compatible microphone-disabled PAL, or a generated-audio track with a compatible microphone-enabled PAL. Core currently creates/checks/ends the room; it does not forward the Live audio into Tavus.
4. Coordinate cancellation/interruptions, avoid duplicate audio playback, and close both services on explicit hang-up and recoverable failure. Confirm the selected PAL's microphone mode; the current Core adapter does not enforce that field.
5. Prove audible output, synchronized facial playback, interruption, session ownership, revocation and bounded cleanup before enabling the live status. Verify delegated Core tools separately.

Tavus officially supports external audio in [Echo Mode](https://docs.tavus.io/sections/conversational-video-interface/echo-mode) and [GPT Live integrations](https://docs.tavus.io/sections/integrations/speech-to-speech). Audio echo bypasses Tavus's conversational/TTS layers; Echo does not provide Tavus perception. [Echo](https://docs.tavus.io/sections/event-schemas/conversation-echo) and [interrupt](https://docs.tavus.io/sections/event-schemas/conversation-interrupt) are explicit interaction events. [Private rooms](https://docs.tavus.io/sections/conversational-video-interface/conversation/customizations/private-rooms) use a meeting token for joining.

An alternative full-pipeline custom LLM requires an authenticated OpenAI-compatible, SSE-streaming `/chat/completions` adapter. That adapter was not established in the inspected Core contract. Do not point Tavus's LLM base URL at an arbitrary Core route. See [Tavus custom LLM requirements](https://docs.tavus.io/sections/conversational-video-interface/pal/llm.md). Choosing that path also does not preserve OpenAI's generated audio automatically.

## Gmail, Drive and Contacts

Clean app source pin: [`a5ff195f26741a3e23861944afb584b403e17030`](https://github.com/XTREME-SYSTEMS/xtreme-avatar-clean/tree/a5ff195f26741a3e23861944afb584b403e17030). At that revision `/mail`, `/drive`, `/contacts` and `/connections` are truthful setup/empty-state screens. There are no app OAuth callback or Workspace API handlers in that source tree. Current auth/chat implementation work must be reviewed separately.

The existing [integration contract](https://github.com/XTREME-SYSTEMS/xtreme-avatar-clean/blob/a5ff195f26741a3e23861944afb584b403e17030/docs/INTEGRATION_CONTRACT.md) names Google Cloud project `xps-operations-494914` and requires separate sign-in and Workspace-consent flows. The Neon audit found its Google provider is for login; that does not establish Gmail, Drive or Contacts permission. No actual app Workspace grant or gateway execution receipt for these services was verified.

### Scope plan for the first useful reads

| App capability | Candidate Google scope | Boundary |
| --- | --- | --- |
| Inbox and message reading | `https://www.googleapis.com/auth/gmail.readonly` | No send/delete permission; restricted scope |
| Drive file browser, metadata only | `https://www.googleapis.com/auth/drive.metadata.readonly` | No file-content download; restricted scope |
| User-selected Drive files | `https://www.googleapis.com/auth/drive.file` | Narrow per-file grant with a picker; includes modification rights for selected files, so app writes still need their own authorization |
| Read/download across Drive, if actually required | `https://www.googleapis.com/auth/drive.readonly` | Broader access; restricted scope; do not silently substitute it for selected-file access |
| Contacts list/search | `https://www.googleapis.com/auth/contacts.readonly` | Use People API with an explicit field mask; no contact writes |

Scope selection must match the implemented feature. Gmail draft management is not a send-free grant: `gmail.compose` also permits sending. Keep outbound actions unavailable until separately implemented and authorized. Google documents the applicable sensitive/restricted scope review requirements; a configured OAuth client is not proof those requirements are complete.

Primary references: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Drive scopes and per-file access](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [People contacts API](https://developers.google.com/people/api/rest/v1/people.connections/list/).

### Next Workspace implementation

1. Verify the existing Google project's enabled Gmail/Drive/People APIs, approved web OAuth client, consent audience/status, and selected app origin. These values were not verified by this audit.
2. Determine whether the existing gateway can supply a proven per-user/per-tenant Workspace grant and typed operation. Reuse that contract if verified; a static catalog entry or the ChatGPT connector is not an app OAuth grant. Do not create a second gateway or scheduler.
3. Implement a Workspace authorization start and callback in the chosen existing app/server adapter. Register the exact callback URI for the exact OAuth client. Keep it separate from the Neon social-login callback; no concrete Workspace callback path is established yet.
4. Bind one-time state and PKCE to the signed-in user, tenant, intended service and fixed return route. Exchange the code server-side, check the actually returned scopes/account identity, and store refresh tokens encrypted under the verified app ownership boundary. Request offline/incremental access as needed; handle denial, expiry, revocation and partial grants.
5. Wire bounded, paginated reads to `/mail`, `/drive` and `/contacts`. Return only needed fields. Contacts use `people/me/connections` with `personFields`; Drive access must respect the selected scope's file boundary. Display connected status only after grant verification and a successful scoped read.
6. Verify revoked-grant and cross-user/tenant denial, reconnect behavior and receipts. Keep Google content out of shared Core personal memory unless an explicit scoped workflow authorizes its use.

Google requires the redirect URI to match the registered value exactly and documents state, offline access, incremental consent and granted-scope checks in its [web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server).

## Acceptance status

| Gate | Current result |
| --- | --- |
| Native Tavus account read access | Verified |
| Existing completed Eden face and Echo PAL candidates | Verified configuration |
| App identity mapped to authorized Core membership | Requires implementation/verification |
| Selected deployed Core PAL/face/voice and metered-use configuration | Values inaccessible through the inspected Railway OAuth response |
| Live audio-to-avatar bridge and delegated tool delivery | Requires implementation and real execution evidence |
| Existing Workspace OAuth client/callback/grants in the clean app | Not verified; app routes require implementation |
| Gmail/Drive/Contacts execution through the existing gateway | Not verified |
| Production release | Pending the existing release gates; no release performed by this audit |
