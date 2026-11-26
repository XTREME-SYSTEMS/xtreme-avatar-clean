import test from "node:test";
import assert from "node:assert/strict";
import { readAppCommand, pageName } from "../src/lib/voice/app-commands.ts";
import { applyCanvasCommand, createCanvasState } from "../src/lib/canvas-commands.ts";

test("Eden voice routes inside the approved application and refuses arbitrary destinations", () => {
  assert.deepEqual(readAppCommand("Eden, open the Create Packs page."), { type: "navigate", path: "/create", page: "create packs" });
  assert.equal(pageName("/create"), "create");
  assert.equal(readAppCommand("Eden, open https://example.com."), null);
  assert.equal(readAppCommand("Eden, execute JavaScript."), null);
  assert.equal(readAppCommand("Open chat"), null);
  assert.deepEqual(readAppCommand("Open chat", true), { type: "navigate", path: "/chat", page: "chat" });
  assert.equal(readAppCommand("Execute JavaScript", true), null);
  assert.deepEqual(readAppCommand("Confirm canvas change", true), { type: "confirm_canvas" });
  assert.deepEqual(readAppCommand("Eden, cancel canvas change"), { type: "cancel_canvas" });
});

test("speech commands change the same bounded canvas state as manual editing", () => {
  const add = readAppCommand("Hey Eden, add text Launch Plan");
  assert.equal(add?.type, "canvas");
  if (add?.type !== "canvas") return;
  const created = applyCanvasCommand(createCanvasState(), add.command);
  assert.equal(created.result.ok, true);
  const move = readAppCommand("Eden, move text 1 to 150 and 200.");
  assert.equal(move?.type, "canvas");
  if (move?.type !== "canvas") return;
  const moved = applyCanvasCommand(created.state, move.command);
  assert.deepEqual(moved.result.ok && moved.result.state.objects[0],
    { id: "text-1", type: "text", text: "Launch Plan", x: 150, y: 200 });
  assert.equal(readAppCommand("Eden, move text 1 to 1200 and 100."), null);
  assert.equal(readAppCommand("Eden, delete all objects"), null);
});
