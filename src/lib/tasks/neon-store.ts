import "server-only";
import { neon } from "@neondatabase/serverless";
import type { VerifiedIdentity } from "../auth/types";
import type { Task, TaskStore } from "./handler";

const task = (row: Record<string, unknown>): Task => {
  if (typeof row.id !== "string" || typeof row.title !== "string") throw new Error("invalid task row");
  return { id: row.id, title: row.title };
};

export function createTaskStore(env: NodeJS.ProcessEnv): TaskStore | null {
  if (env.AVATAR_TASKS_ENABLED !== "true" || !env.AVATAR_TASK_DB_URL) return null;
  let url: URL;
  try { url = new URL(env.AVATAR_TASK_DB_URL); } catch { return null; }
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.username !== "avatar_task_runtime" || !url.hostname.endsWith(".neon.tech") ||
      url.searchParams.get("sslmode") !== "require") return null;
  const sql = neon(env.AVATAR_TASK_DB_URL);
  const scope = (actor: VerifiedIdentity) => sql`
    select set_config('avatar_task.issuer', ${actor.issuer}, true),
      set_config('avatar_task.workspace', ${actor.organizationId}, true),
      set_config('avatar_task.subject', ${actor.userId}, true)`;
  return {
    async list(actor) {
      const [, rows] = await sql.transaction([scope(actor), sql`
        select request_id::text as id, title from avatar_task.tasks
        where issuer = ${actor.issuer} and workspace_id = ${actor.organizationId} and subject_id = ${actor.userId}
        order by created_at desc, request_id desc limit 50
      `]);
      return rows.map(task);
    },
    async save(actor, input) {
      const [,, rows] = await sql.transaction([scope(actor), sql`
        insert into avatar_task.tasks (issuer, workspace_id, subject_id, request_id, title)
        values (${actor.issuer}, ${actor.organizationId}, ${actor.userId}, ${input.id}::uuid, ${input.title})
        on conflict (issuer, workspace_id, subject_id, request_id) do nothing
      `, sql`
        select request_id::text as id, title from avatar_task.tasks
        where issuer = ${actor.issuer} and workspace_id = ${actor.organizationId}
          and subject_id = ${actor.userId} and request_id = ${input.id}::uuid
      `]);
      if (rows.length !== 1) throw new Error("task read-back unavailable");
      const saved = task(rows[0]);
      return saved.title === input.title ? saved : null;
    },
  };
}
