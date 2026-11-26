import assert from "node:assert/strict";
import test from "node:test";
import { handleTasks, type Task, type TaskStore } from "../src/lib/tasks/handler.ts";
import type { VerifiedIdentity, VerifiedIdentityResult } from "../src/lib/auth/types";

const origin = "https://avatar.example.test";
const uuid = "fe05719b-0c11-4bec-a5d7-0bccda682042";
const actor: VerifiedIdentity = {
  issuer: "https://identity.example.test", userId: "owner-a", sessionId: "session-a",
  sessionExpiresAt: "2030-01-01T00:00:00Z", organizationId: "alpha", memberId: "member-a",
  role: "owner", emailVerified: true,
};
const get = () => new Request(origin + "/api/tasks");
const post = (body: unknown, originOverride = origin) => new Request(origin + "/api/tasks", {
  method: "POST", headers: {"Content-Type": "application/json", Origin: originOverride}, body: JSON.stringify(body),
});

function testStore() {
  const data = new Map<string, Map<string, Task>>();
  const key = (a: VerifiedIdentity) => JSON.stringify([a.issuer,a.organizationId,a.userId]);
  const store: TaskStore = {
    list: async a => [...(data.get(key(a))?.values() ?? [])],
    save: async (a,input) => {
      const k = key(a), space = data.get(k) ?? new Map<string,Task>();
      data.set(k,space);
      const existing = space.get(input.id);
      if (existing) return existing.title===input.title ? existing : null;
      space.set(input.id,input);
      return input;
    },
  };
  const forUser = (identity: VerifiedIdentityResult) => (request: Request) =>
    handleTasks(request,{origin,identity:async()=>identity,store:()=>store});
  return { forUser, data };
}

test("save, reload and duplicate retry preserve exactly one verified task", async () => {
  const { forUser } = testStore();
  const route = forUser({status:"authenticated",identity:actor});
  for (const request of [post({id:uuid,title:"  One verified task "}), post({id:uuid,title:"One verified task"})]) {
    const reply = await route(request);
    assert.equal(reply.status,200);
    assert.deepEqual(await reply.json(),{task:{id:uuid,title:"One verified task"}});
    assert.match(reply.headers.get("cache-control")!,/no-store/);
  }
  const reloaded = forUser({status:"authenticated",identity:{...actor,sessionId:"session-b"}});
  assert.deepEqual(await (await reloaded(get())).json(),{tasks:[{id:uuid,title:"One verified task"}]});
  assert.equal((await route(post({id:uuid,title:"Substituted task"}))).status,409);
});
test("same user in a different workspace and other users cannot read the task", async () => {
  const { forUser } = testStore();
  await forUser({status:"authenticated",identity:actor})(post({id:uuid,title:"Private task"}));
  for (const identity of [{...actor,organizationId:"bravo"}, {...actor,userId:"owner-b"}]) {
    const other = forUser({status:"authenticated",identity});
    assert.deepEqual(await (await other(get())).json(),{tasks:[]});
  }
});
test("unauthenticated, unverified, malformed and cross-origin writes are refused", async () => {
  const { forUser, data } = testStore();
  const x = {id:uuid,title:"Do not save"};
  const route = forUser({status:"authenticated",identity:actor});
  assert.equal((await forUser({status:"anonymous"})(post(x))).status,401);
  assert.equal((await forUser({status:"authenticated",identity:{...actor,emailVerified:false}})(post(x))).status,403);
  assert.equal((await route(post(x,"https://other.example.test"))).status,403);
  assert.equal((await route(post({...x,organizationId:"bravo"}))).status,400);
  assert.equal((await route(post({...x,title:"x".repeat(3000)}))).status,413);
  assert.equal(data.size,0);
});
test("if storage is not available, the handler cannot claim a save", async () => {
  const r = await handleTasks(post({id:uuid,title:"No receipt"}), {
    identity:async()=>({status:"authenticated",identity:actor}),origin,store:()=>null,
  });
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{code:"TASKS_NOT_CONFIGURED"});
});
