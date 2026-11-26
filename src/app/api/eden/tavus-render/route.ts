import "server-only";
import { getVerifiedIdentity } from "@/lib/auth/server";
import { handleTavusRender } from "@/lib/tavus/render-handler";
import { tavusRenderStore } from "@/lib/tavus/render-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

function handle(request: Request) {
  return handleTavusRender(request, {
    env: process.env,
    getIdentity: getVerifiedIdentity,
    getStore: tavusRenderStore,
    audit(event, requestId) {
      console.info(JSON.stringify({ service: "tavus-render", event, requestId }));
    },
  });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
