import "server-only";
import { getVerifiedIdentity } from "@/lib/auth/server";
import { handleVoiceRequest } from "@/lib/core/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request, context: { params: Promise<{ operation: string[] }> }) {
  const { operation } = await context.params;
  return handleVoiceRequest(request, operation.join("/"), { getIdentity: getVerifiedIdentity, env: process.env });
}

export const GET = handle;
export const POST = handle;
