import test from "node:test";
import assert from "node:assert/strict";
import { readPending, savePending, clearPending, PENDING_PREFIX } from "../src/components/chat/pending-request.ts";

function storage() {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
const now = Date.now();
const a = { scopeId: "account_a", requestKey: "original_key_a", text: "First message", createdAt: now };
const b = { scopeId: "account_a", requestKey: "original_key_b", text: "Second tab's message", createdAt: now + 1 };

test("concurrent tabs preserve independent original request keys across reload and completion", () => {
  const s = storage();
  assert.equal(savePending(s, a), true); assert.equal(savePending(s, b), true);
  assert.equal(s.length, 2); assert.deepEqual(readPending(s, "account_a", now), a);
  savePending(s, { ...a, turnId: "turn_one" }); assert.equal(s.length, 2);
  clearPending(s, "account_a", a.requestKey);
  assert.deepEqual(readPending(s, "account_a", now + 2), b);
});

test("one account cannot recover another account's pending message", () => {
  const s = storage(); savePending(s, a);
  assert.equal(readPending(s, "account_b", now), null); assert.equal(s.length, 1);
});

test("expired and malformed local recovery records are discarded", () => {
  const s = storage(); savePending(s, { ...a, createdAt: now - 25 * 60 * 60 * 1000 });
  assert.equal(readPending(s, a.scopeId, now), null); assert.equal(s.length, 0);
  s.setItem(`${PENDING_PREFIX}${a.scopeId}.12345678`, JSON.stringify({ ...a, requestKey: 12345678 }));
  assert.equal(readPending(s, a.scopeId, now), null);
  s.setItem(`${PENDING_PREFIX}${a.scopeId}.${a.requestKey}`, JSON.stringify({ ...a, turnId: {} }));
  assert.equal(readPending(s, a.scopeId, now), null);
});

test("storage failure prevents dispatch readiness rather than losing the recovery key", () => {
  assert.equal(savePending({ setItem() { throw new Error("quota"); } }, a), false);
});
