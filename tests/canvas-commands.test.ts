import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCanvasCommand, CANVAS_COMMAND_EVENT, CANVAS_OBJECT_LIMIT, createCanvasState, listenForCanvasCommands,
} from "../src/lib/canvas-commands.ts";
import type { CanvasCommand, CanvasCommandResult, CanvasTextObject } from "../src/lib/canvas-commands.ts";
import { layoutText } from "../src/components/phone-screens/canvas-renderer.ts";

function editor() {
  let state = createCanvasState();
  return (command: unknown): CanvasCommandResult => {
    const transition = applyCanvasCommand(state, command);
    state = transition.state;
    return transition.result;
  };
}

function success(result: CanvasCommandResult) {
  assert.ok(result.ok);
  return result;
}

test("text creates, updates, moves, deletes and restores the same layer through history", () => {
  const run = editor();
  const added = success(run({ type: "add_text", text: "Desert studio", x: 180 } satisfies CanvasCommand));
  assert.equal(added.objectId, "text-1");
  assert.equal(added.state.selectedId, "text-1");
  assert.deepEqual(added.state.objects, [{ id: "text-1", type: "text", text: "Desert studio", x: 180, y: 500 }]);

  run({ type: "update_text", id: "text-1", text: "Desert\nstudy" });
  const moved = success(run({ type: "move_object", id: "text-1", x: 1000, y: 0 }));
  assert.equal(moved.state.objects[0].x, 1000);
  assert.equal(moved.state.objects[0].y, 0);
  const deleted = success(run({ type: "delete_object", id: "text-1" }));
  assert.deepEqual(deleted.state.objects, []);
  assert.equal(deleted.state.selectedId, null);
  assert.deepEqual(success(run({ type: "undo" })).state.objects, moved.state.objects);
  assert.equal(success(run({ type: "undo" })).state.objects[0].x, 180);
  assert.deepEqual(success(run({ type: "redo" })).state.objects, moved.state.objects);
  assert.deepEqual(success(run({ type: "redo" })).state.objects, []);
});

test("unchanged commands preserve redo, new edits clear it, and layer IDs are never reused", () => {
  const run = editor();
  run({ type: "add_text", text: "First" });
  run({ type: "add_text", text: "Second" });
  run({ type: "undo" });
  const same = success(run({ type: "update_text", id: "text-1", text: "First" }));
  assert.equal(same.changed, false);
  assert.equal(same.state.canRedo, true);
  const deselected = success(run({ type: "select_object", id: null }));
  assert.equal(deselected.state.selectedId, null);
  assert.equal(deselected.state.canRedo, true);
  const third = success(run({ type: "add_text", text: "Third" }));
  assert.equal(third.objectId, "text-3");
  assert.equal(third.state.canRedo, false);
  assert.deepEqual(run({ type: "redo" }), { ok: false, error: "nothing_to_redo" });
});

test("invalid or unsupported payloads never change the document or run accessor fields", () => {
  const run = editor();
  let getterCalls = 0;
  for (const command of [
    null, ["get_state"], { type: "evaluate", code: "alert(1)" }, { type: "undo", extra: true },
    Object.create({ type: "undo" }),
    { type: "add_text", get text() { getterCalls++; return "must not be read"; } },
    { type: "add_text", text: "  " }, { type: "add_text", text: "a".repeat(161) },
    { type: "add_text", text: "a\nb\nc\nd\ne" }, { type: "add_text", text: "a\u0000" },
    { type: "add_text", text: "a", x: undefined }, { type: "add_text", text: "a", y: 1001 },
    { type: "move_object", id: "text-1", x: 1.5, y: 0 },
    { type: "move_object", id: "text-1", x: Infinity, y: 0 },
    { type: "move_object", id: "text-1", x: "500", y: 0 },
    { type: "add_text", text: "a", [Symbol("extra")]: 1 },
  ]) assert.deepEqual(run(command), { ok: false, error: "invalid_command" });

  assert.equal(getterCalls, 0);
  assert.deepEqual(run({ type: "delete_object", id: "text-1" }), { ok: false, error: "object_not_found" });
  assert.deepEqual(run({ type: "undo" }), { ok: false, error: "nothing_to_undo" });
  assert.deepEqual(success(run({ type: "get_state" })).state.objects, []);
});

test("object count and undo history are bounded and returned snapshots are detached", () => {
  const run = editor();
  for (let i = 0; i < CANVAS_OBJECT_LIMIT; i++) {
    success(run({ type: "add_text", text: `Label ${i}` }));
  }
  assert.deepEqual(run({ type: "add_text", text: "Overflow" }), { ok: false, error: "object_limit" });
  const snapshot = success(run({ type: "get_state" })).state;
  snapshot.objects[0].text = "Changed externally";
  snapshot.objects.pop();
  assert.equal(success(run({ type: "get_state" })).state.objects[0].text, "Label 0");
  assert.equal(success(run({ type: "get_state" })).state.objects.length, CANVAS_OBJECT_LIMIT);

  for (let i = 0; i < 52; i++) {
    success(run({ type: "move_object", id: "text-1", x: i, y: 0 }));
  }
  for (let i = 0; i < 50; i++) success(run({ type: "undo" }));
  assert.deepEqual(run({ type: "undo" }), { ok: false, error: "nothing_to_undo" });
});

test("the event replies once and synchronously for each request, then stops on cleanup", () => {
  const target = new EventTarget();
  const replies: unknown[] = [];
  const receive = (result: unknown) => replies.push(result);
  const send = (command: unknown) => target.dispatchEvent(new CustomEvent(CANVAS_COMMAND_EVENT, {
    detail: { command, respond: receive },
  }));
  const detach = listenForCanvasCommands(target, editor());
  target.dispatchEvent(new Event(CANVAS_COMMAND_EVENT));
  target.dispatchEvent(new CustomEvent(CANVAS_COMMAND_EVENT, { detail: { command: { type: "get_state" } } }));
  assert.deepEqual(replies, []);
  send({ type: "add_text", text: "First" });
  send({ type: "move_object", id: "text-1", x: 25, y: 90 });
  send({ type: "unknown" });
  assert.equal(replies.length, 3);
  assert.equal(success(replies[1] as CanvasCommandResult).state.objects[0].x, 25);
  assert.deepEqual(replies[2], { ok: false, error: "invalid_command" });

  detach();
  send({ type: "get_state" });
  assert.equal(replies.length, 3);
});

test("normalized extremes keep short and long text reachable, including multi-line text", () => {
  const object: CanvasTextObject = { id: "text-1", type: "text", text: "a very wide line\nnext line", x: 0, y: 0 };
  const measure = (text: string) => text.length * 40;
  const start = layoutText(object, measure);
  const end = layoutText({ ...object, x: 1000, y: 1000 }, measure);
  assert.equal(end.left - start.left, start.travelX);
  assert.equal(end.top - start.top, start.travelY);
  assert.ok(start.travelX > 0 && start.travelY > 0);
  assert.deepEqual(start.lines, ["a very wide line", "next line"]);
});
test("canvas approval revisions advance even when edits restore the same visible state", () => {
  const initial = applyCanvasCommand(createCanvasState(), { type: "add_text", text: "Launch Plan" }).state;
  const proposed = applyCanvasCommand(initial, { type: "get_state" }).result;
  const changed = applyCanvasCommand(initial, { type: "update_text", id: "text-1", text: "Changed" }).state;
  const restored = applyCanvasCommand(changed, { type: "update_text", id: "text-1", text: "Launch Plan" });
  assert.ok(proposed.ok && restored.result.ok);
  assert.deepEqual(restored.result.state.objects, proposed.state.objects);
  assert.ok(restored.result.state.revision > proposed.state.revision);
  assert.deepEqual(applyCanvasCommand(restored.state, { type: "get_state" }).state, restored.state);
});
