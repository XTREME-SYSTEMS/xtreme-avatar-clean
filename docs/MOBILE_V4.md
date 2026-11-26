# Xtreme Avatar Mobile V4

Open `/mobile` for the Android/iOS web app. Its web manifest uses standalone display and the Figma mark as the installation icon. The worker provides an offline reconnect page and never stores workspace content. The existing home and dashboard link to the mobile view.

## Design provenance

The editable [mobile design](https://www.figma.com/design/NH3SPqlofpHSEmrfnjR1tO?node-id=2-73) uses the approved [V4 material system](https://www.figma.com/design/16F1Pcf7WN23HfBlBBx2Mf?node-id=42-13). The bundled orbital is node 2:72 and the brand mark is node 2:39. The video still is the published [Tavus portrait](https://cdn.replica.tavus.io/70247/thumbnail.jpg) associated with Eden’s current deployment. Font licenses accompany the local Inter and Instrument Serif files.

## Connections

| Screen | Runtime |
| --- | --- |
| Chat | Existing Neon session and Core V2 chat handler. Each completed response must have a Core receipt. The actual generation provider is determined by Core routing. |
| Voice | Same-origin authenticated app adapter to the existing Core media readiness, WebRTC and close operations. Core owns provider grants, cost limits and session receipts. Every start rechecks model access and server-side close controls. If native reasoning is unavailable, the screen offers conversation only. It discloses workspace transcript storage before microphone access. |
| Video | Owner's existing Tavus-hosted Eden Skye landing page. This independent session does not receive Core's chat or microphone audio. |
| Messages | Existing Neon workspace consent settings, same-origin messaging handler and Railway Twilio service. WhatsApp uses the shared test sandbox. Write requests pin the signed-in scope. An uncertain send retains its request ID and can be reconciled against the workspace and actor’s Neon receipt. |
| Phone | Setup status. The existing communications service exposes messaging webhooks only. |
| Work | Opens the private Eve V3 dashboard and pilot repository checks. Eve handles its own authentication and execution. |

## Preview acceptance

Bind the specific preview origin to managed Neon Auth and its trusted origins before testing login. Verify the server signer, issuer, key ID, audience, client ID and explicit Neon-to-Core mapping in both services. A voice-enabled binding adds a `voiceGrant` with `approvalRef` and `expiresAt` to the existing owner mapping. Core must also allow the media scopes. Confirm the chosen OpenAI voice, project, session budget, audible round trip, interruption and end receipt on a phone. Check the actual response provider ID before describing chat as OpenAI-powered.

Messaging requires matching `COMMS_SERVICE_SECRET` and scoped settings on the app and Railway service. An owner-authorized message to a consented test recipient must return a provider receipt and delivery callback. The UI alone cannot attest delivery.

Production release and shared Core-to-Tavus audio remain pending independent end-to-end verification and owner release approval.
