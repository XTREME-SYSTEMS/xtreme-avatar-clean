# Tavus render-only handoff

Tavus PAL `p669b9286c7c` uses Eden Skye face `rd3fce670df2`. Connector readback verified Echo mode, Daily transport, microphone disabled, empty greeting, dynamic greeting off, idle engagement off, disclosure off, and no tools. The PAL has zero deployments. The original `p78f5b305e3a` remains in full mode. No Tavus conversation was started for this implementation. [PAL Maker](https://maker.tavus.io/dev/pals/update?pal_id=p669b9286c7c)

## API

All methods are at `/api/eden/tavus-render` and require a fresh Neon session for a verified-email workspace owner. Mutations require the exact app origin and a JSON request. The server pins the PAL and face and accepts no caller-selected provider fields.

| Method | Input | Successful response |
| --- | --- | --- |
| GET | None | 200 `{ scopeId, transport: "daily-audio-echo", playbackVerified: false }` |
| POST | `{ scopeId, requestId }` | 201 `{ scopeId, requestId, conversationId, conversationUrl, meetingToken, maxDurationSeconds: 120, playbackVerified: false }` |
| DELETE | `{ scopeId, requestId }` | 200 `{ status: "ended" }` or 202 `{ status: "closing" }` |

`scopeId` is the same server-verified account/workspace hash the Gateway Live route returns. `requestId` is a lowercase UUID v4 and serves as the receipt and cleanup handle. Keep the join token in memory and pass it to Daily as a separate `token` option. The response is private and non-cacheable. Readiness is a configuration preflight. It never reserves a start or opens a room.

Errors have shape `{ error: string }`. Authentication and origin failures return 401 or 403. Wrong-workspace requests get 403. A missing room under the verified scope gets 404. A cancelled request before creation gets 408. Duplicate requests and start limits get 429. Missing credentials, disabled configuration, unavailable quota storage and provider readback failures get 503. After an uncertain creation outcome, the route returns 502 without retrying the create. Try cleanup with the same request ID if available. An unknown provider outcome stays charged against the start budget and the provider's timeouts bound any room that was created. If the end request fails, the route reads the stored room's status and confirms closure only when Tavus reports it ended.

## Isolated browser adapter

`src/lib/tavus/render-client.ts` exports `TavusRenderClient(scopeId, call, video)`. Supply a fresh [Daily call object](https://docs.daily.co/reference/daily-js/factory-methods/create-call-object) and a dedicated video element. The host app registers the Daily track and disconnect handlers. The adapter is dependency-free at build time and has no built-in SDK loading.

1. Probe `GET`, then start only on the owner's explicit video action. Show an app-owned visual AI disclosure before presenting the video, for example “Eden Skye is an AI avatar.” Call `await renderer.start()`.
2. When Daily exposes the PAL's remote camera track, call `renderer.attachAvatarVideo(participant.session_id, track)`. The adapter attaches just that video track, disables its audio output, and joins with camera and microphone disabled. The host owns track selection and room departure events.
3. Keep local Gateway Live playback as the audible output. After Gateway Live confirms `gleam`, forward only its generated 24 kHz mono PCM16LE Base64 output to `renderer.sendGleamAudio(delta)` while `renderer.ready` is true. Call `finishUtterance()` at a confirmed audio boundary and `interrupt()` when discarding output on barge-in. The host drops late deltas from an interrupted utterance. The adapter broadcasts audio-only Echo data messages in the private two-participant room and attaches no remote audio track.
4. Call `await renderer.close()` on hang-up, account change, or terminal media error. An unconfirmed close is surfaced to the caller. Use a fresh adapter for a new room.

Two independent media paths are involved, so measure facial synchronization and interruption on a real authorized canary. [Tavus Echo Interaction](https://docs.tavus.io/sections/event-schemas/conversation-echo), [Pipecat transport reference](https://reference-server.pipecat.ai/en/latest/_modules/pipecat/transports/tavus/transport.html), [Daily app messages](https://docs.daily.co/reference/daily-js/instance-methods/send-app-message)

## Enablement and rollback

- Set `AVATAR_TAVUS_RENDER_ENABLED=true` only for the reviewed environment. Pin its single authorized owner/workspace via `AVATAR_TAVUS_RENDER_SCOPE_ID` and set the finite UTC grant expiry `AVATAR_TAVUS_RENDER_GRANT_EXPIRES_AT`. The grant and Neon session must cover the full maximum room lifecycle.
- Supply the Tavus account's server-only `TAVUS_API_KEY` and the existing reviewed `AVATAR_SETTINGS_DATABASE_URL`. Apply `architecture/tavus-render-issuance.sql` to the existing Avatar settings database after approval. Grant its application role only `SELECT`, `INSERT`, and `UPDATE` on the table. The database enforces three starts per UTC day and a three-minute minimum between attempts. The feature flag can be switched off immediately while scoped cleanup remains available.
- Before a paid canary, verify authenticated positive and negative readiness, quota storage, face and PAL readback, SDK compatibility, browser audio/video permissions, and approved spend. In the canary verify exact-face video, only local Gleam audio, AV synchronization, interruption, authenticated cleanup, and provider timeout. A local credential and end-to-end playback have not been verified.
