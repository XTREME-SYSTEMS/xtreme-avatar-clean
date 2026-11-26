export const CANVAS_COMMAND_EVENT = "avatar:canvas-command";
export const CANVAS_POSITION_MAX = 1000;
export const CANVAS_TEXT_MAX = 160;
export const CANVAS_LINES_MAX = 4;
export const CANVAS_OBJECT_LIMIT = 32;
const HISTORY_LIMIT = 50;

export type CanvasPosition = { x: number; y: number };
export type CanvasTextObject = CanvasPosition & { id: string; type: "text"; text: string };

export type CanvasCommand =
  | ({ type: "add_text"; text: string } & Partial<CanvasPosition>)
  | { type: "update_text"; id: string; text: string }
  | ({ type: "move_object"; id: string } & CanvasPosition)
  | { type: "delete_object"; id: string }
  | { type: "select_object"; id: string | null }
  | { type: "get_state" }
  | { type: "undo" }
  | { type: "redo" };

export type CanvasSnapshot = {
  objects: CanvasTextObject[];
  selectedId: string | null;
  canUndo: boolean;
  canRedo: boolean;
};

export type CanvasCommandResult =
  | { ok: true; changed: boolean; objectId: string | null; state: CanvasSnapshot }
  | { ok: false; error: "invalid_command" | "object_not_found" | "object_limit" | "nothing_to_undo" | "nothing_to_redo" };

export type CanvasCommandEventDetail = { command: unknown; respond: (result: unknown) => void };

type CanvasDocument = {
  readonly objects: readonly Readonly<CanvasTextObject>[];
  readonly selectedId: string | null;
};

type CanvasEditorState = {
  readonly present: CanvasDocument;
  readonly past: readonly CanvasDocument[];
  readonly future: readonly CanvasDocument[];
  readonly nextId: number;
};

export function createCanvasState(): CanvasEditorState {
  return { present: { objects: [], selectedId: null }, past: [], future: [], nextId: 1 };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;

  // Read plain data fields only. Accessor properties do not belong to this contract.
  const keys = Reflect.ownKeys(value);
  if (keys.length > 4) return null;
  const record: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
    record[key] = descriptor.value;
  }
  return record;
}

function isText(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= CANVAS_TEXT_MAX
    && value.trim().length > 0
    && !Array.from(value).some(character => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 10) || (code >= 127 && code <= 159);
    })
    && value.split("\n").length <= CANVAS_LINES_MAX;
}

function isPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= CANVAS_POSITION_MAX;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^text-[1-9][0-9]{0,15}$/.test(value);
}

export function parseCanvasCommand(input: unknown): CanvasCommand | null {
  const command = readRecord(input);
  if (!command) return null;
  const { type, id, text, x, y } = command;
  const keys = Object.keys(command);
  switch (type) {
    case "add_text": {
      if (!isText(text) || keys.some(key => !["type", "text", "x", "y"].includes(key))) return null;
      const add: CanvasCommand = { type, text };
      if (Object.hasOwn(command, "x")) {
        if (!isPosition(x)) return null;
        add.x = x;
      }
      if (Object.hasOwn(command, "y")) {
        if (!isPosition(y)) return null;
        add.y = y;
      }
      return add;
    }
    case "update_text":
      return keys.length === 3 && isId(id) && isText(text) ? { type, id, text } : null;
    case "move_object":
      return keys.length === 4 && isId(id) && isPosition(x) && isPosition(y) ? { type, id, x, y } : null;
    case "delete_object":
      return keys.length === 2 && isId(id) ? { type, id } : null;
    case "select_object":
      return keys.length === 2 && (id === null || isId(id)) ? { type, id } : null;
    case "get_state":
    case "undo":
    case "redo":
      return keys.length === 1 ? { type } : null;
    default:
      return null;
  }
}

type Transition = { state: CanvasEditorState; result: CanvasCommandResult };

export function applyCanvasCommand(state: CanvasEditorState, input: unknown): Transition {
  let command: CanvasCommand | null;
  try {
    command = parseCanvasCommand(input);
  } catch {
    command = null;
  }
  const { objects, selectedId } = state.present;
  const fail = (error: Extract<CanvasCommandResult, { ok: false }>["error"]): Transition =>
    ({ state, result: { ok: false, error } });
  const success = (next: CanvasEditorState, objectId: string | null = null): Transition => ({
    state: next,
    result: {
      ok: true,
      changed: next !== state,
      objectId,
      state: {
        objects: next.present.objects.map(object => ({ ...object })),
        selectedId: next.present.selectedId,
        canUndo: next.past.length > 0,
        canRedo: next.future.length > 0,
      },
    },
  });
  const edit = (present: CanvasDocument, objectId: string, nextId = state.nextId) =>
    success({ present, past: [...state.past, state.present].slice(-HISTORY_LIMIT), future: [], nextId }, objectId);

  if (!command) return fail("invalid_command");
  switch (command.type) {
    case "get_state":
      return success(state);
    case "undo": {
      const prior = state.past.at(-1);
      if (!prior) return fail("nothing_to_undo");
      return success({ ...state, present: prior, past: state.past.slice(0, -1), future: [state.present, ...state.future] });
    }
    case "redo": {
      const [next, ...future] = state.future;
      if (!next) return fail("nothing_to_redo");
      return success({ ...state, present: next, past: [...state.past, state.present], future });
    }
    case "add_text": {
      if (objects.length >= CANVAS_OBJECT_LIMIT) return fail("object_limit");
      const id = `text-${state.nextId}`;
      const object: CanvasTextObject = { id, type: "text", text: command.text, x: command.x ?? 500, y: command.y ?? 500 };
      return edit({ objects: [...objects, object], selectedId: id }, id, state.nextId + 1);
    }
    case "select_object":
      if (command.id !== null && !objects.some(object => object.id === command.id)) return fail("object_not_found");
      return success(
        selectedId === command.id ? state : { ...state, present: { objects, selectedId: command.id } },
        command.id,
      );
    case "delete_object":
      if (!objects.some(object => object.id === command.id)) return fail("object_not_found");
      return edit({
        objects: objects.filter(object => object.id !== command.id),
        selectedId: selectedId === command.id ? null : selectedId,
      }, command.id);
    case "update_text":
    case "move_object": {
      const current = objects.find(object => object.id === command.id);
      if (!current) return fail("object_not_found");
      const updated = command.type === "update_text"
        ? { ...current, text: command.text }
        : { ...current, x: command.x, y: command.y };
      if (current.text === updated.text && current.x === updated.x && current.y === updated.y) {
        return success(state, current.id);
      }
      return edit({ objects: objects.map(object => object.id === updated.id ? updated : object), selectedId }, updated.id);
    }
  }
}

export function listenForCanvasCommands(target: EventTarget, execute: (command: unknown) => CanvasCommandResult) {
  function receive(event: Event) {
    if (!(event instanceof CustomEvent)) return;
    let detail: Record<string, unknown> | null;
    try {
      detail = readRecord(event.detail);
    } catch {
      return;
    }
    if (!detail || typeof detail.respond !== "function") return;
    const respond = detail.respond;
    const result = Object.hasOwn(detail, "command") && Object.keys(detail).length === 2
      ? execute(detail.command)
      : { ok: false, error: "invalid_command" } satisfies CanvasCommandResult;
    respond(result);
  }
  target.addEventListener(CANVAS_COMMAND_EVENT, receive);
  return () => target.removeEventListener(CANVAS_COMMAND_EVENT, receive);
}
