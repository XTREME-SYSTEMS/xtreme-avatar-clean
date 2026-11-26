import { parseCanvasCommand } from "../canvas-commands.ts";
import type { CanvasCommand } from "../canvas-commands.ts";

const routes = {
  home: "/", ideas: "/invention", "daily radar": "/invention", opportunity: "/opportunity",
  video: "/video", voice: "/voice", tasks: "/tasks", finished: "/finished",
  workspace: "/workspace", approvals: "/approvals", contacts: "/contacts",
  create: "/create", "create packs": "/create", canvas: "/create", calendar: "/calendar",
  chat: "/chat", account: "/account", connections: "/connections", settings: "/settings",
  discovery: "/discovery", "lead finder": "/leads", "auto social": "/social",
  communications: "/communications", dashboard: "/dashboard", mail: "/mail", drive: "/drive",
  maps: "/maps", vault: "/vault", wallet: "/wallet", notes: "/notes", security: "/security",
  images: "/images", mobile: "/mobile", "mobile work": "/mobile/work", "mobile connect": "/mobile/connect",
  "mobile voice": "/mobile/voice", "mobile video": "/mobile/video", "mobile chat": "/mobile/chat",
  "mobile phone": "/mobile/phone", messages: "/mobile/messages", "communication settings": "/settings/communications",
} as const;

export type AppCommand =
  | { type: "navigate"; path: (typeof routes)[keyof typeof routes]; page: string }
  | { type: "read_page" }
  | { type: "confirm_canvas" | "cancel_canvas" }
  | { type: "canvas"; command: CanvasCommand };

export function pageName(path: string) {
  return Object.entries(routes).find(([, route]) => route === path)?.[0] ?? "another page";
}

function canvas(value: unknown): AppCommand | null {
  const command = parseCanvasCommand(value);
  return command ? { type: "canvas", command } : null;
}

export function readAppCommand(transcript: string, delegated = false): AppCommand | null {
  if (transcript.length > 500) return null;
  const invocation = transcript.trim().match(/^(?:hey\s+)?eden[,\s:]+(.+)$/i);
  if (!invocation && !delegated) return null;
  const phrase = (invocation?.[1] ?? transcript).trim();
  const normalized = phrase.replace(/[.!?]+$/, "").toLowerCase();
  const navigation = normalized.match(/^(?:open|go to|navigate to) (?:the )?(.+?)(?: page)?$/);
  if (navigation && Object.hasOwn(routes, navigation[1])) {
    const page = navigation[1] as keyof typeof routes;
    return { type: "navigate", path: routes[page], page };
  }
  if (normalized === "what page is this" || normalized === "read this page") return { type: "read_page" };
  if (normalized === "confirm canvas change") return { type: "confirm_canvas" };
  if (normalized === "cancel canvas change") return { type: "cancel_canvas" };
  if (["read canvas", "describe canvas", "what is on the canvas"].includes(normalized)) return canvas({ type: "get_state" });
  if (normalized === "undo" || normalized === "redo") return canvas({ type: normalized });
  const add = phrase.match(/^add text[,:]?\s+(.+)$/i);
  if (add) return canvas({ type: "add_text", text: add[1].trim().replace(/^["“]|["”]$/g, "") });
  const update = phrase.match(/^(?:edit|change|update) (?:text[ -]?)([1-9][0-9]{0,15}) to (.+)$/i);
  if (update) return canvas({ type: "update_text", id: `text-${update[1]}`, text: update[2].trim() });
  const move = normalized.match(/^move text[ -]?([1-9][0-9]{0,15}) to (\d{1,4})[ ,]+(?:and )?(\d{1,4})$/);
  if (move) return canvas({ type: "move_object", id: `text-${move[1]}`, x: Number(move[2]), y: Number(move[3]) });
  const target = normalized.match(/^(select|delete|remove) text[ -]?([1-9][0-9]{0,15})$/);
  if (target) return canvas({ type: target[1] === "select" ? "select_object" : "delete_object", id: `text-${target[2]}` });
  return null;
}
