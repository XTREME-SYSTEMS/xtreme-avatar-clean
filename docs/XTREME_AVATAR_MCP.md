# Xtreme Avatar MCP launcher

The canonical Next.js app serves Streamable HTTP at `/mcp`. The
`get_xtreme_avatar_launch_links` tool lets ChatGPT answer “Open Xtreme Avatar”
or “Give me the Xtreme Avatar mobile link” with a link the user can follow.
The destination allowlist contains the existing public home (`/`) and mobile
home (`/mobile`). Omitting `destination` returns both. The only accepted
destination IDs are `home` and `mobile`.

The tool is anonymous, read-only and idempotent. It builds links from the
server-side `AVATAR_APP_ORIGIN` and the fixed paths. A missing or invalid origin
returns HTTP 503. A hosted connection requires the exact approved HTTPS
origin. HTTP on `127.0.0.1` is supported for local validation. Server-to-server
requests can omit `Origin`. If supplied, it must match the configured app
origin or, for a hosted HTTPS app, `https://chatgpt.com`.

The endpoint serves JSON responses without a session. It supports
`initialize`, `notifications/initialized`, `ping`, `tools/list`, and
`tools/call` with the initialization-based MCP revisions
`2025-11-25`, `2025-06-18`, and `2025-03-26`. The launcher uses chat links.
[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[OpenAI MCP server guidance](https://developers.openai.com/plugins/build/mcp-server).

## Local validation

Use Node.js 24 and the checkout's locked dependencies. Run the protocol tests
with `node --test tests/xtreme-avatar-mcp.test.ts`. They also run as part of
`npm run test:integration`.

```powershell
$env:AVATAR_APP_ORIGIN = "http://127.0.0.1:3000"
npm run dev -- --hostname 127.0.0.1 --port 3000
```

From a second terminal, run the same tests against the running Next.js route.
The live test initializes, acknowledges initialization, discovers and calls the
tool, then fetches the returned pages.

```powershell
$env:XTREME_AVATAR_MCP_TEST_ORIGIN = "http://127.0.0.1:3000"
node --test tests/xtreme-avatar-mcp.test.ts
```

`plugins/xtreme-avatar/plugin.json` and `mcp.json` are the source manifest and
local connection for the same endpoint. A hosted package would need its
connection URL set to the approved HTTPS deployment after release approval.
The [repository release gates](RELEASE_GATES.md) apply.

## Account, Canvas, and ChatGPT Live

Account and Canvas data and actions are outside this launcher. Enabling them
requires a provisioned ChatGPT MCP OAuth authorization-code flow with PKCE,
protected-resource discovery, resource-bound access tokens, and verified
Avatar user and tenant scopes. Browser sessions and existing Google sign-in
serve the Avatar website. The MCP endpoint neither reads those sessions nor
uses them as tool credentials.
[OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth).

ChatGPT Live can invoke plugins available to the user's account, subject to
connection and workspace settings. This plugin's availability and behavior in
ChatGPT Live require host verification. Xtreme Avatar's in-app custom speech
uses the [Avatar voice operator](V4_VOICE_AND_CANVAS.md). The MCP launcher
returns links and handles no microphone audio, voice sessions, or speech
configuration. [ChatGPT Voice](https://help.openai.com/en/articles/20001274-chatgpt-voice).
