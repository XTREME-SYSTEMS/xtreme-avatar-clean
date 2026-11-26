import plugin from "../../../plugins/xtreme-avatar/plugin.json" with { type: "json" };

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const MAX_BODY_BYTES = 16 * 1024;
const RESPONSE_HEADERS = { "Cache-Control": "no-store" };
const DESTINATIONS = [
  { id: "home", title: "Xtreme Avatar home", path: "/" },
  { id: "mobile", title: "Xtreme Avatar mobile home", path: "/mobile" },
] as const;

const LAUNCH_TOOL = {
  name: "get_xtreme_avatar_launch_links",
  title: "Open Xtreme Avatar",
  description:
    "Use when the user wants a link to the Xtreme Avatar website or mobile home. Omit destination to get both public links.",
  inputSchema: {
    type: "object",
    properties: {
      destination: { type: "string", enum: DESTINATIONS.map(({ id }) => id) },
    },
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: { securitySchemes: [{ type: "noauth" }] },
};

type RequestId = string | number;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rpcError(id: RequestId | null, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, {
    status,
    headers: RESPONSE_HEADERS,
  });
}

function rpcResult(id: RequestId, result: object) {
  return Response.json({ jsonrpc: "2.0", id, result }, { headers: RESPONSE_HEADERS });
}

function launcherOrigin(request: Request): URL | Response {
  const configuredOrigin = process.env.AVATAR_APP_ORIGIN;
  const url = configuredOrigin ? URL.parse(configuredOrigin) : null;
  const local = url?.protocol === "http:" && url.hostname === "127.0.0.1";
  if (
    !url ||
    (url.protocol !== "https:" && !local) ||
    (configuredOrigin !== url.origin && configuredOrigin !== `${url.origin}/`)
  ) {
    return rpcError(null, -32000, "Xtreme Avatar launcher origin is unavailable.", 503);
  }

  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== url.origin && (local || origin !== "https://chatgpt.com")) {
    return rpcError(null, -32000, "Origin is not allowed.", 403);
  }

  const version = request.headers.get("MCP-Protocol-Version");
  if (version !== null && !PROTOCOL_VERSIONS.includes(version)) {
    return rpcError(null, -32600, "Unsupported MCP-Protocol-Version.", 400);
  }
  return url;
}

async function readRequestText(body: Request["body"]): Promise<string | null> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function callLaunchTool(id: RequestId, params: Record<string, unknown> | undefined, origin: URL) {
  if (params?.name !== LAUNCH_TOOL.name) {
    return rpcError(id, -32602, "Unknown tool.");
  }
  const args = params.arguments === undefined ? {} : params.arguments;
  if (!isRecord(args) || Object.keys(args).some((key) => key !== "destination")) {
    return rpcError(id, -32602, "Expected an optional destination of home or mobile.");
  }
  const destinations = args.destination === undefined
    ? DESTINATIONS
    : DESTINATIONS.filter(({ id }) => id === args.destination);
  if (!destinations.length) {
    return rpcError(id, -32602, "Expected an optional destination of home or mobile.");
  }

  const links = destinations.map(({ title, path }) => `- [${title}](<${new URL(path, origin).href}>)`);
  return rpcResult(id, { content: [{ type: "text", text: links.join("\n") }] });
}

export async function POST(request: Request) {
  const origin = launcherOrigin(request);
  if (origin instanceof Response) return origin;
  const accept = request.headers.get("Accept")?.toLowerCase().split(",")
    .map((entry) => entry.trim().split(";")[0].trim()) ?? [];
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return rpcError(null, -32600, "Accept must include application/json and text/event-stream.", 406);
  }
  const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return rpcError(null, -32600, "Content-Type must be application/json.", 415);
  }
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
    return rpcError(null, -32600, "MCP request exceeds the size limit.", 413);
  }

  let message: unknown;
  try {
    const text = await readRequestText(request.body);
    if (text === null) return rpcError(null, -32600, "MCP request exceeds the size limit.", 413);
    message = JSON.parse(text);
  } catch {
    return rpcError(null, -32700, "Invalid JSON.", 400);
  }

  if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(null, -32600, "Expected a single JSON-RPC request or notification.", 400);
  }
  const { id, method, params } = message;
  if (id === undefined) {
    const accepted = method === "notifications/initialized" || method === "notifications/cancelled";
    return new Response(null, { status: accepted ? 202 : 400, headers: RESPONSE_HEADERS });
  }
  if (typeof id !== "string" && !(typeof id === "number" && Number.isFinite(id))) {
    return rpcError(null, -32600, "Invalid JSON-RPC request ID.", 400);
  }
  if (params !== undefined && !isRecord(params)) {
    return rpcError(id, -32602, "Expected an object for params.");
  }

  switch (method) {
    case "initialize": {
      if (
        typeof params?.protocolVersion !== "string" || !isRecord(params.capabilities) ||
        !isRecord(params.clientInfo) || typeof params.clientInfo.name !== "string" ||
        typeof params.clientInfo.version !== "string"
      ) {
        return rpcError(id, -32602, "Expected protocolVersion, capabilities, and clientInfo.");
      }
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(params.protocolVersion)
          ? params.protocolVersion
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: plugin.name, title: "Xtreme Avatar", version: plugin.version },
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return params?.cursor === undefined
        ? rpcResult(id, { tools: [LAUNCH_TOOL] })
        : rpcError(id, -32602, "Invalid tools cursor.");
    case "tools/call":
      return callLaunchTool(id, params, origin);
    default:
      return rpcError(id, -32601, "Method not found.");
  }
}

function methodNotAllowed(request: Request) {
  const origin = launcherOrigin(request);
  if (origin instanceof Response) return origin;
  return new Response(null, {
    status: 405,
    headers: { ...RESPONSE_HEADERS, Allow: "POST" },
  });
}

export { methodNotAllowed as GET, methodNotAllowed as DELETE };
