import { gateway } from "@ai-sdk/gateway";

const modelId = "openai/gpt-realtime-2";

async function main() {
  const { token, url } = await gateway.experimental_realtime.getToken({ model: modelId });
  const model = gateway.experimental_realtime(modelId);
  const config = model.getWebSocketConfig({ token, url });
  const socket = new WebSocket(config.url, config.protocols);
  const transcript = [];
  let audioBytes = 0;

  await new Promise((resolve, reject) => {
    const fail = (code) => {
      clearTimeout(timer);
      socket.close();
      reject(new Error(code));
    };
    const timer = setTimeout(() => fail("realtime_timeout"), 25_000);
    socket.addEventListener("open", async () => {
      try {
        const events = [
          { type: "conversation-item-create", item: { type: "text-message", role: "user", text: "For this voice connection check, say exactly: Xtreme Avatar voice is connected." } },
          { type: "response-create" },
        ];
        for (const event of events) socket.send(JSON.stringify(await model.serializeClientEvent(event)));
      } catch {
        fail("realtime_send_failed");
      }
    }, { once: true });
    socket.addEventListener("message", ({ data }) => {
      try {
        const parsed = model.parseServerEvent(JSON.parse(data));
        for (const event of Array.isArray(parsed) ? parsed : [parsed]) {
          if (event?.type === "audio-transcript-delta" || event?.type === "text-delta") transcript.push(event.delta);
          if (event?.type === "audio-delta") audioBytes += Buffer.from(event.delta, "base64").length;
          if (event?.type === "error") return fail("realtime_provider_error");
          if (event?.type === "response-done") {
            if (!transcript.join("").trim() || !audioBytes) return fail("realtime_empty_speech");
            clearTimeout(timer);
            resolve();
            socket.close();
          }
        }
      } catch {
        fail("realtime_invalid_event");
      }
    });
    socket.addEventListener("error", () => fail("realtime_connection_failed"), { once: true });
    socket.addEventListener("close", () => fail("realtime_closed_before_response"), { once: true });
  });

  console.log(JSON.stringify({ model: modelId, transcript: transcript.join("").trim(), audioBytes }));
}

main().catch((error) => {
  const code = /^realtime_[a-z_]+$/.test(error?.message) ? error.message : "realtime_token_failed";
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : undefined;
  console.error(JSON.stringify({ model: modelId, error: code, status }));
  process.exitCode = 1;
});
