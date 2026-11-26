import { readFile } from "node:fs/promises";
import { readAppCommand } from "./src/lib/voice/app-commands.ts";
import { applyCanvasCommand, createCanvasState } from "./src/lib/canvas-commands.ts";

const model = "openai/gpt-live-1";
const voice = "gleam";

async function readFixture(path) {
  const wave = await readFile(path);
  if (wave.toString("ascii", 0, 4) !== "RIFF" || wave.toString("ascii", 8, 12) !== "WAVE") throw new Error("invalid_wave");
  let pcmFormat = false;
  for (let offset = 12; offset + 8 < wave.length;) {
    const name = wave.toString("ascii", offset, offset + 4);
    const length = wave.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > wave.length) throw new Error("invalid_wave");
    if (name === "fmt " && length >= 16) pcmFormat = wave.readUInt16LE(start) === 1
      && wave.readUInt16LE(start + 2) === 1 && wave.readUInt32LE(start + 4) === 24000 && wave.readUInt16LE(start + 14) === 16;
    if (name === "data" && pcmFormat && length > 0 && length % 2 === 0 && length <= 24000 * 2 * 15) return wave.subarray(start, end);
    offset = end + length % 2;
  }
  throw new Error("invalid_pcm_fixture");
}

async function check() {
  const credential = process.env.AI_GATEWAY_API_KEY;
  if (!credential) throw new Error("missing_gateway_key");
  const fixture = process.argv[2] ? await readFixture(process.argv[2]) : null;
  const exerciseCanvas = process.argv.includes("--canvas");
  const expectedText = process.env.XTREME_VOICE_EXPECTED_TEXT?.trim().toLowerCase();
  if (exerciseCanvas && !fixture) throw new Error("missing_canvas_fixture");
  let canvas = createCanvasState();
  let result = null;
  let input = "";
  let delegationRequests = 0;
  const response = await fetch("https://ai-gateway.vercel.sh/v1/realtime/client-secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, routeKind: "live", expiresIn: 15 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`token_http_${response.status}`);
  const { token } = await response.json();
  const socket = new WebSocket("wss://ai-gateway.vercel.sh/v1/live/sessions", [
    "ai-gateway-realtime.v1", `ai-gateway-auth.${token}`,
  ]);
  let started = false;
  let audioBytes = 0;
  const transcript = [];
  await new Promise((resolve, reject) => {
    let pump;
    let delegation;
    const close = () => { clearInterval(pump); socket.send(JSON.stringify({ type: "session.close" })); };
    const fail = (code) => {
      clearTimeout(timeout);
      clearInterval(pump);
      clearTimeout(delegation);
      socket.close();
      reject(new Error(code));
    };
    const timeout = setTimeout(() => fail("gleam_timeout"), 35_000);
    const send = (event) => socket.send(JSON.stringify(event));
    socket.addEventListener("open", () => send({
      type: "session.start",
      session: { model, store: false, delegation: { type: "client" },
        ...(exerciseCanvas ? { instructions: "You are Eden. When the user asks to edit the canvas, generate <|SpawnThinking|> immediately. State the result only after the app confirms it." } : {}),
        audio: {
        format: { type: "audio/pcm", rate: 24000 },
        output: { voice },
      } },
    }), { once: true });
    socket.addEventListener("message", ({ data }) => {
      try {
        const event = JSON.parse(data);
        if (event.type === "error") {
          const code = typeof event.error?.code === "string" && /^[a-z_]{1,70}$/.test(event.error.code)
            ? event.error.code : "unknown";
          return fail(`gleam_provider_${code}`);
        }
        if (event.type === "session.started") {
          started = event.session?.audio?.output?.voice === voice;
          if (!started || !fixture) return close();
          let offset = 0;
          let silence = 0;
          pump = setInterval(() => {
            if (offset >= fixture.length && silence++ >= 400) return close();
            const frame = Buffer.alloc(960);
            fixture.copy(frame, 0, offset, Math.min(offset + frame.length, fixture.length));
            offset = Math.min(offset + frame.length, fixture.length);
            send({ type: "session.input_audio.append", audio: frame.toString("base64") });
          }, 20);
        }
        if (event.type === "session.output_audio.delta" && typeof event.delta === "string") audioBytes += Buffer.from(event.delta, "base64").length;
        if (event.type === "session.output_transcript.delta" && typeof event.delta === "string") transcript.push(event.delta);
        if (exerciseCanvas && event.type === "session.input_transcript.delta" && typeof event.delta === "string") input = (input + event.delta).slice(-500);
        if (exerciseCanvas && event.type === "session.delegation.created" && typeof event.delegation?.id === "string" && delegation === undefined) {
          delegationRequests++;
          delegation = setTimeout(() => {
            const action = readAppCommand(input, true);
            let content = "No supported canvas action ran.";
            if (action?.type === "canvas") {
              const executed = applyCanvasCommand(canvas, action.command);
              canvas = executed.state;
              result = executed.result;
              if (result.ok && result.changed) content = "Canvas updated. Object: " + result.objectId;
            }
            send({ type: "session.commentary.append", delegation_id: event.delegation.id, content });
          }, 750);
        }
        if (event.type === "session.closed") {
          if (!started) return fail("gleam_not_confirmed");
          if (fixture && (!audioBytes || !transcript.join("").trim())) return fail("gleam_empty_speech");
          if (exerciseCanvas && (!result?.ok || !result.changed || result.state.objects.length !== 1)) {
            console.error(JSON.stringify({ delegationRequests, inputTranscript: input, reply: transcript.join("").trim() }));
            return fail("gleam_canvas_action_not_confirmed");
          }
          if (expectedText && result?.ok && result.state.objects[0]?.text.trim().toLowerCase().replace(/[.!?]+$/, "") !== expectedText) {
            return fail("gleam_canvas_transcript_mismatch");
          }
          clearTimeout(timeout);
          clearInterval(pump);
          resolve(event.usage?.seconds);
          socket.close();
        }
      } catch { fail("gleam_invalid_event"); }
    });
    socket.addEventListener("error", () => fail("gleam_transport_error"), { once: true });
    socket.addEventListener("close", () => fail("gleam_close_unconfirmed"), { once: true });
  });
  console.log(JSON.stringify({ model, voice, started, closed: true,
    ...(fixture ? { transcript: transcript.join("").trim(), audioBytes } : {}),
    ...(result?.ok ? { canvas: result.state.objects } : {}) }));
}

check().catch(error => {
  console.error(JSON.stringify({ model, voice, error: /^[a-z_0-9]+$/.test(error?.message) ? error.message : "gleam_check_failed" }));
  process.exitCode = 1;
});
