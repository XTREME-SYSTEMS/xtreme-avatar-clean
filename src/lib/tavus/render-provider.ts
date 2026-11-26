import { readBoundedJson } from "../core/contracts.ts";
import { conversationIdPattern, readRenderRoom, renderRoomDurationSeconds } from "./render-contract.ts";

export const echoPalId = "p669b9286c7c";
export const edenFaceId = "rd3fce670df2";
const root = "https://tavusapi.com/v2";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function tavusRenderProvider(key: string, fetcher: typeof fetch) {
  function request(path: string, method: "GET" | "POST", body?: object) {
    return fetcher(root + path, {
      method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5_000),
      headers: { "x-api-key": key, accept: "application/json", ...(body && { "content-type": "application/json" }) },
      ...(body && { body: JSON.stringify(body) }),
    });
  }

  async function read(response: Response) {
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error("Tavus request failed");
    }
    return object(await readBoundedJson(response, 32_768));
  }

  return {
    async check() {
      const [pal, face] = await Promise.all([
        request("/pals/" + echoPalId, "GET").then(read),
        request("/faces/" + edenFaceId, "GET").then(read),
      ]);
      const layers = object(pal.layers);
      const transport = object(layers.transport);
      if (pal.pal_id !== echoPalId || pal.pipeline_mode !== "echo" || pal.default_face_id !== edenFaceId ||
          face.face_id !== edenFaceId || face.status !== "completed" || transport.transport_type !== "daily" ||
          object(transport.input_settings).microphone !== "disabled") return "tavus_render_pal_mismatch";
      // Tavus can deliver an automatic spoken disclosure when "auto" applies.
      if (pal.greeting !== "" || pal.dynamic_greeting !== false || pal.disclosure_type !== "off" ||
          object(layers.conversational_flow).idle_engagement !== "off") return "tavus_spoken_output_enabled";
      if (pal.callback_url !== null || !Array.isArray(pal.tool_ids) || pal.tool_ids.length ||
          !Array.isArray(pal.document_ids) || pal.document_ids.length ||
          !Array.isArray(pal.document_tags) || pal.document_tags.length || Object.keys(object(pal.skills)).length ||
          Object.keys(object(layers.mcp)).length || object(transport.room_settings).enable_recording !== "" ||
          object(transport.room_settings).enable_transcription !== false) return "tavus_render_pal_mismatch";
      return null;
    },

    async create(requestId: string) {
      const result = await read(await request("/conversations", "POST", {
        pal_id: echoPalId, face_id: edenFaceId, conversation_name: "Xtreme Avatar render " + requestId,
        require_auth: true, max_participants: 2, dynamic_greeting: false, participant_tags: [],
        properties: {
          max_call_duration: renderRoomDurationSeconds,
          participant_absent_timeout: 30,
          participant_left_timeout: 15,
          enable_recording: false,
          auto_start_recording: false,
          enable_closed_captions: false,
        },
      }));
      const conversationId = typeof result.conversation_id === "string" && conversationIdPattern.test(result.conversation_id)
        ? result.conversation_id : null;
      const room = result.status === "active" ? readRenderRoom({
        requestId, conversationId, conversationUrl: result.conversation_url, meetingToken: result.meeting_token,
      }) : null;
      return { conversationId, room };
    },

    async end(conversationId: string) {
      if (!conversationIdPattern.test(conversationId)) return false;
      const path = "/conversations/" + conversationId;
      const response = await request(path + "/end", "POST").catch(() => null);
      await response?.body?.cancel().catch(() => {});
      if (response?.ok) return true;
      // A provider timeout or another close can race this request. Confirm the exact room's terminal state.
      const result = await read(await request(path, "GET"));
      return result.conversation_id === conversationId && result.status === "ended";
    },
  };
}
