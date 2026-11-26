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
session across client-side routes. The app uses the Gateway's GPT-Live
WebSocket and starts audio only after OpenAI confirms Gleam. Its deployment
flag defaults off. The mic stops on call end, hidden page, sign-out, or scope
change. Browser playback and transcript are session-local. This voice path does
not write shared Core history.

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
Gleam is documented in the GPT-Live output-audio settings, so the standalone
app selects GPT-Live without silently changing the user-selected voice.

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

On the existing clean preview, verify the exact Neon trusted origin and a
signed, finite Core identity and voice grant. Apply
`architecture/gateway-live-issuance.sql` to the approved Avatar application
database using the existing settings role and review rollback. The token
endpoint fails closed if the migration, credential, or verified workspace
grant is missing. It allows at most one reserved token per minute and six in
a UTC day per user/workspace scope. A failed provider call still consumes its
reservation. Confirm the provider's team-level spending cap independently.

Keep the preview separate from the legacy production domain. Verify signed-in
microphone playback, scope switching, denial at the configured budget, and
provider receipts before enabling production. The current direct Gateway route
uses a short-lived admission token. Its browser call limit is not a server-side
revocation or session cutoff. Confirm provider-enforced session limits or a
trusted relay before production enablement.
[ChatGPT MCP launcher](XTREME_AVATAR_MCP.md) · [Release gates](RELEASE_GATES.md)
