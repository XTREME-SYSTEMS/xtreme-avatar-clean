import "server-only";
import { getVerifiedIdentity } from "@/lib/auth/server";
import { handleCoreLiveRelay } from "@/lib/voice/core-live-relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function handle(request: Request) {
  return handleCoreLiveRelay(request, { getIdentity: getVerifiedIdentity, env: process.env });
}

export const GET = handle;
export const POST = handle;
