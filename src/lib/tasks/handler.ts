import { isSameOriginMutation, privateJson, readBoundedJson } from "../auth/http.ts";
import type { VerifiedIdentity, VerifiedIdentityResult } from "../auth/types";

export type Task = { id: string; title: string };
export type TaskStore = {
  list: (actor: VerifiedIdentity) => Promise<Task[]>;
  save: (actor: VerifiedIdentity, task: Task) => Promise<Task | null>;
};
const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleTasks(
  request: Request,
  dependencies: { origin: string | null; identity: () => Promise<VerifiedIdentityResult>; store: () => TaskStore | null },
): Promise<Response> {
  const { origin, identity, store } = dependencies;
  const write = request.method === "POST";
  if (!write && request.method !== "GET") return privateJson({ code: "METHOD_NOT_ALLOWED" }, 405);
  if (!origin) return privateJson({ code: "TASKS_NOT_CONFIGURED" }, 503);
  if (write && !isSameOriginMutation(request, origin)) return privateJson({ code: "ORIGIN_DENIED" }, 403);
  const session = await identity();
  if (session.status === "unavailable") return privateJson({ code: "ACCOUNT_UNAVAILABLE" }, 503);
  if (session.status === "anonymous") return privateJson({ code: "SIGN_IN_REQUIRED" }, 401);
  if (session.status !== "authenticated" || !session.identity.emailVerified) {
    return privateJson({ code: "VERIFIED_WORKSPACE_REQUIRED" }, 403);
  }
  const actor = session.identity;
  try {
    const db = store();
    if (!db) return privateJson({ code: "TASKS_NOT_CONFIGURED" }, 503);
    if (!write) return privateJson({ tasks: await db.list(actor) });
    const body = await readBoundedJson(request, 2048);
    if (!body.ok) return privateJson({ code: body.code }, body.status);
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return privateJson({ code: "INVALID_TASK" }, 400);
    const input = body.data as Record<string, unknown>;
    if (Object.keys(input).some((key) => key !== "id" && key !== "title") ||
        typeof input.id !== "string" || !requestId.test(input.id) ||
        typeof input.title !== "string" || /[\u0000-\u001f\u007f]/.test(input.title)) {
      return privateJson({ code: "INVALID_TASK" }, 400);
    }
    const title = input.title.trim();
    if (!title || title.length > 160) return privateJson({ code: "INVALID_TASK" }, 400);
    const saved = await db.save(actor, { id: input.id.toLowerCase(), title });
    return saved ? privateJson({ task: saved }) : privateJson({ code: "REQUEST_ID_CONFLICT" }, 409);
  } catch {
    return privateJson({ code: "TASK_STORAGE_UNAVAILABLE" }, 503);
  }
}
