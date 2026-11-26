import "server-only";
import { getVerifiedIdentity } from "@/lib/auth/server";
import { readAuthConfiguration } from "@/lib/auth/config";
import { handleTasks } from "@/lib/tasks/handler";
import { createTaskStore } from "@/lib/tasks/neon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request) {
  const auth = readAuthConfiguration();
  return handleTasks(request, {
    origin: auth.configured ? auth.value.appOrigin : null,
    identity: getVerifiedIdentity,
    store: () => createTaskStore(process.env),
  });
}
export const GET = handle;
export const POST = handle;
