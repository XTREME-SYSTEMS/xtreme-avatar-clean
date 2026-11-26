# V4 voice and Create Packs

[Approved V4 master](https://www.figma.com/design/QL4pYJBnwyfa2xiPOfGFUJ?node-id=42-10) ·
[Create Packs](https://www.figma.com/design/QL4pYJBnwyfa2xiPOfGFUJ?node-id=42-928) ·
[Account surface reference](https://www.xtremeavatar.com/account)

The dedicated V4 frontend uses shared sign-in card tokens for neutral cards.
Create Packs has a local editable text canvas, scene undo and redo, and a PNG
export. It does not claim to generate imagery, save to the workspace, or publish
a design. The existing Core chat endpoint remains the app's tenant-scoped chat
and memory boundary.

## Client behavior

The phone and mobile voice pages and the persistent control share one in-app
session across client-side routes. Eden Core owns the OpenAI GPT-Live connection
and confirms Gleam before the app starts microphone streaming. A one-time Core
ticket connects the browser to the relay. The signed-in app renews the server
lease with a fresh Neon session, membership and mission-bound delegation. The
app stops its microphone on call end, hidden page, sign-out or scope change.
Browser playback and transcripts are session-local.

Example commands while voice is in progress:

- “Eden, open Create Packs.”
- “Eden, add text Launch Plan.”
- “Eden, move text 1 to 150 and 200.”
- “Eden, read canvas.”
- “Eden, undo.”
- “Eden, cancel canvas change.”

Coordinates range from 0 to 1000. The command path resolves only known app
routes and typed editor commands. Review the proposed edit and press
**Confirm canvas change** on the mounted Create Packs screen. The app checks
the signed-in workspace again before applying the captured edit. An expired,
cancelled, or superseded proposal cannot change the canvas. Any intervening
canvas edit also invalidates the proposal. A read reports the current page or a
bounded canvas summary.
Other apps, emails, approvals and external execution require purpose-built
tenant-scoped tools and their own permission and receipt checks.

## Provider verification

`openai/gpt-realtime-2` and GPT-Live use different Gateway endpoints. Realtime 2
uses the existing Node runtime and the Gateway provider SDK for the proof.
The Gateway canaries exercise the two provider protocols independently of the
app's Core relay. Gleam is documented in the GPT-Live output-audio settings.

```powershell
node --env-file-if-exists=.env.local realtime-smoke.mjs
node --env-file-if-exists=.env.local gleam-smoke.mjs
node --env-file-if-exists=.env.local gleam-smoke.mjs artifacts/gleam-input.wav
node --env-file-if-exists=.env.local gleam-smoke.mjs artifacts/gleam-canvas.wav --canvas
```

The optional WAV fixtures must be synthesized or otherwise approved, mono
24 kHz PCM16 and no longer than 15 seconds. The `--canvas` fixture says “Eden,
add text hello world.” This canary uses the actual Gateway session and the app's
command parser and reducer with a disposable in-memory scene. It does not sign
into the deployed app. Never expose the Gateway key in browser responses or
proof logs. Use the linked deployment's Vercel OIDC identity when configured.

[Vercel Realtime](https://vercel.com/docs/ai-gateway/modalities/realtime) ·
[Vercel GPT-Live](https://vercel.com/docs/ai-gateway/modalities/realtime/gpt-live) ·
[OpenAI Live speech configuration](https://developers.openai.com/api/reference/resources/live/methods/create)

## Deployment gates

Keep `AVATAR_CORE_LIVE_RELAY_ENABLED=false` until the exact staging release,
approved Core signer, tenant-bound owner grant, Core relay quota and retention
policy are verified. Core owns the start reservation and cutoff. The earlier
Avatar Gateway issuance table is retained for rollback records. Test the
configured deadline, grant expiry, revocation and loss of the browser while
checking upstream close and usage receipts. Verify signed-in playback, budget
denial and role isolation before requesting production cutover.
[ChatGPT MCP launcher](XTREME_AVATAR_MCP.md) · [Release gates](RELEASE_GATES.md)
