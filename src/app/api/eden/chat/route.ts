import "server-only";
import { getVerifiedIdentity } from "@/lib/auth/server";
import { handleChatRequest } from "@/lib/core/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

function handle(request: Request) {
  return handleChatRequest(request, { getIdentity: getVerifiedIdentity, env: process.env });
}
export const GET = handle;
export const POST = handle;
