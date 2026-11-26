import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import plugin from "../plugins/xtreme-avatar/plugin.json" with { type: "json" };
import connection from "../plugins/xtreme-avatar/mcp.json" with { type: "json" };
import { DELETE, GET, POST } from "../src/app/mcp/route.ts";

const LOCAL_ORIGIN = "http://127.0.0.1:3000";
const PROTOCOL_VERSION = "2025-11-25";
const TOOL = "get_xtreme_avatar_launch_links";
const HEADERS = {
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
};
const CLIENT = { name: "avatar-launcher-test", version: "1.0.0" };

function rpc(method: string, id?: string | number, params?: object) {
  return { jsonrpc: "2.0", method, id, params };
}

function post(message: object, headers?: Record<string, string>) {
  return POST(new Request(`${LOCAL_ORIGIN}/mcp`, {
    method: "POST",
    headers: { ...HEADERS, ...headers },
    body: JSON.stringify(message),
  }));
}

async function exerciseLauncher(
  send: (message: object, headers?: Record<string, string>) => Promise<Response>,
  origin: string,
) {
  const init = await send(rpc("initialize", 0, {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT,
  }));
  assert.equal(init.status, 200);
  assert.ok(init.headers.get("content-type")?.startsWith("application/json"));
  assert.equal(init.headers.get("mcp-session-id"), null);
  assert.deepEqual(await init.json(), {
    jsonrpc: "2.0",
    id: 0,
    result: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: plugin.name, title: "Xtreme Avatar", version: plugin.version },
    },
  });

  const headers = { "MCP-Protocol-Version": PROTOCOL_VERSION };
  const ready = await send(rpc("notifications/initialized"), headers);
  assert.equal(ready.status, 202);
  assert.equal(await ready.text(), "");

  const discovery = await send(rpc("tools/list", "list"), headers);
  assert.equal(discovery.status, 200);
  const list = await discovery.json();
  assert.equal(list.id, "list");
  assert.equal(list.result.tools.length, 1);
  const [tool] = list.result.tools;
  assert.equal(tool.name, TOOL);
  assert.deepEqual(tool.inputSchema, {
    type: "object",
    properties: { destination: { type: "string", enum: ["home", "mobile"] } },
    additionalProperties: false,
  });
  assert.deepEqual(tool.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(tool._meta, { securitySchemes: [{ type: "noauth" }] });

  const home = `${origin}/`;
  const mobile = `${origin}/mobile`;
  const both = await send(rpc("tools/call", 2, { name: TOOL }), headers);
  assert.equal(both.status, 200);
  assert.deepEqual(await both.json(), {
    jsonrpc: "2.0",
    id: 2,
    result: { content: [{
      type: "text",
      text: `- [Xtreme Avatar home](<${home}>)\n- [Xtreme Avatar mobile home](<${mobile}>)`,
    }] },
  });

  for (const [destination, title, url] of [
    ["home", "Xtreme Avatar home", home],
    ["mobile", "Xtreme Avatar mobile home", mobile],
  ]) {
    const call = await send(rpc("tools/call", destination, {
      name: TOOL,
      arguments: { destination },
    }), headers);
    assert.equal(call.status, 200);
    const result = await call.json();
    assert.equal(result.id, destination);
    assert.deepEqual(result.result.content, [{ type: "text", text: `- [${title}](<${url}>)` }]);
  }

  return [home, mobile];
}

const originalOrigin = process.env.AVATAR_APP_ORIGIN;
before(() => { process.env.AVATAR_APP_ORIGIN = LOCAL_ORIGIN; });
after(() => {
  if (originalOrigin === undefined) delete process.env.AVATAR_APP_ORIGIN;
  else process.env.AVATAR_APP_ORIGIN = originalOrigin;
});

test("the manifest connects to the dedicated MCP route on the existing local server", () => {
  assert.deepEqual(connection.mcpServers, {
    [plugin.name]: { type: "streamable-http", url: `${LOCAL_ORIGIN}/mcp` },
  });
});

test("the anonymous launcher initializes, lists one tool, and returns only approved links", async () => {
  await exerciseLauncher(post, LOCAL_ORIGIN);
});

test("the launcher rejects private tools and arbitrary destinations even with browser credentials", async () => {
  for (const params of [
    { name: "get_account" },
    { name: "read_canvas" },
    { name: TOOL, arguments: { destination: "https://other.example" } },
    { name: TOOL, arguments: { destination: "/account" } },
    { name: TOOL, arguments: { destination: null } },
    { name: TOOL, arguments: { destination: "home", path: "/canvas" } },
  ]) {
    const response = await post(rpc("tools/call", 3, params), {
      Authorization: "Bearer test-credential",
      Cookie: "session=test-credential",
    });
    const body = await response.json();
    assert.equal(body.id, 3);
    assert.equal(body.error.code, -32602);
    assert.equal(body.result, undefined);
    assert.doesNotMatch(JSON.stringify(body), /test-credential|other\.example/);
  }
});

test("links use the server origin and requests with an untrusted Origin are forbidden", async () => {
  const message = rpc("tools/call", 4, { name: TOOL });
  for (const Origin of ["https://other.example", "https://chatgpt.com", "null"]) {
    const response = await post(message, { Origin });
    assert.equal(response.status, 403);
  }
  const response = await post(message, {
    Origin: LOCAL_ORIGIN,
    Host: "other.example",
    "X-Forwarded-Host": "other.example",
    "X-Forwarded-Proto": "https",
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /http:\/\/127\.0\.0\.1:3000\/mobile/);

  process.env.AVATAR_APP_ORIGIN = "https://avatar.example";
  try {
    const hosted = await post(message, { Origin: "https://chatgpt.com" });
    assert.equal(hosted.status, 200);
    assert.match(await hosted.text(), /https:\/\/avatar\.example\/mobile/);
  } finally {
    process.env.AVATAR_APP_ORIGIN = LOCAL_ORIGIN;
  }
});

test("missing or invalid server configuration makes the MCP entry point unavailable", async () => {
  try {
    delete process.env.AVATAR_APP_ORIGIN;
    assert.equal((await post(rpc("tools/list", 5))).status, 503);
    for (const origin of [
      "http://avatar.example", "https://avatar.example/path", "https://avatar.example/?q=x",
      "https://user:password@avatar.example",
    ]) {
      process.env.AVATAR_APP_ORIGIN = origin;
      const response = await post(rpc("tools/list", 5));
      assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /password|avatar\.example/);
    }
  } finally {
    process.env.AVATAR_APP_ORIGIN = LOCAL_ORIGIN;
  }
});

test("the stateless transport negotiates supported initialization versions", async () => {
  for (const [requested, negotiated] of [
    ["2025-06-18", "2025-06-18"],
    ["2025-03-26", "2025-03-26"],
    ["1900-01-01", PROTOCOL_VERSION],
  ]) {
    const response = await post(rpc("initialize", "init", {
      protocolVersion: requested, capabilities: {}, clientInfo: CLIENT,
    }));
    assert.equal((await response.json()).result.protocolVersion, negotiated);
  }
  const ping = await post(rpc("ping", "ping"), { "MCP-Protocol-Version": "2025-03-26" });
  assert.deepEqual(await ping.json(), { jsonrpc: "2.0", id: "ping", result: {} });
  const versionError = await post(rpc("ping", 6), { "MCP-Protocol-Version": "1900-01-01" });
  assert.equal(versionError.status, 400);
});

test("transport errors use JSON-RPC errors or the required HTTP status", async () => {
  const malformed = await POST(new Request(`${LOCAL_ORIGIN}/mcp`, {
    method: "POST", headers: HEADERS, body: "{",
  }));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, -32700);
  assert.equal((await post([rpc("ping", 1)])).status, 400);
  assert.equal((await post(rpc("ping", 2), { Accept: "text/plain" })).status, 406);
  assert.equal((await post(rpc("ping", 3), { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await post(rpc("ping", "é".repeat(8192)))).status, 413);
  const unknown = await post(rpc("resources/list", 4));
  assert.equal((await unknown.json()).error.code, -32601);
  const get = GET(new Request(`${LOCAL_ORIGIN}/mcp`));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("Allow"), "POST");
  assert.equal(DELETE(new Request(`${LOCAL_ORIGIN}/mcp`, { method: "DELETE" })).status, 405);
});

const smokeOrigin = process.env.XTREME_AVATAR_MCP_TEST_ORIGIN;
test("the running Next.js server serves the MCP flow and both returned pages", {
  skip: !smokeOrigin,
}, async () => {
  assert.ok(smokeOrigin);
  assert.match(smokeOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const send = (message: object, headers?: Record<string, string>) => fetch(`${smokeOrigin}/mcp`, {
    method: "POST",
    headers: { ...HEADERS, ...headers },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(30_000),
  });
  const links = await exerciseLauncher(send, smokeOrigin);
  const stream = await fetch(`${smokeOrigin}/mcp`, {
    headers: { Accept: "text/event-stream", "MCP-Protocol-Version": PROTOCOL_VERSION },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(stream.status, 405);
  assert.equal(stream.headers.get("Allow"), "POST");
  for (const link of links) {
    const response = await fetch(link, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Xtreme Avatar/i);
  }
});
