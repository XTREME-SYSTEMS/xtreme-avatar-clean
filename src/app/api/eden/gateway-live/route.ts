import "server-only";
import { getVerifiedIdentity } from "@/lib/auth/server";
import { settingsDatabase } from "@/lib/communications/store";
import { readBoundedJson, record } from "@/lib/core/contracts";
import { handleGatewayLive } from "@/lib/voice/gateway-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function handle(request: Request) {
  return handleGatewayLive(request, {
    getIdentity: getVerifiedIdentity,
    env: process.env,
    async verifyHostedGrant(grant) {
      const response = await fetch(grant.origin + "/v1/media/readiness", {
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4500),
        headers: { Authorization: `Bearer ${grant.token}`, Accept: "application/json" },
      });
      if (!response.ok) { await response.body?.cancel().catch(() => {}); return false; }
      const data = await readBoundedJson(response, 16_384);
      return record(data) && data.verification === "model_metadata_only";
    },
    async verifyQuotaStore() {
      const db = settingsDatabase();
      if (!db) return false;
      await db.query("SELECT scope_id FROM avatar_app.gateway_live_issuance LIMIT 0", [], { fetchOptions: { signal: AbortSignal.timeout(3500) } });
      return true;
    },
    async reserve(scopeId) {
      const db = settingsDatabase();
      if (!db) return null;
      const rows = await db.query(
        `INSERT INTO avatar_app.gateway_live_issuance (scope_id, utc_day, issued, last_issued_at)
         VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (scope_id) DO UPDATE SET
           utc_day = EXCLUDED.utc_day,
           issued = CASE WHEN gateway_live_issuance.utc_day = EXCLUDED.utc_day THEN gateway_live_issuance.issued + 1 ELSE 1 END,
           last_issued_at = EXCLUDED.last_issued_at
         WHERE gateway_live_issuance.last_issued_at <= CURRENT_TIMESTAMP - interval '1 minute'
           AND (gateway_live_issuance.utc_day <> EXCLUDED.utc_day OR gateway_live_issuance.issued < 6)
         RETURNING scope_id`,
        [scopeId], { fetchOptions: { signal: AbortSignal.timeout(3500) } },
      );
      return rows.length === 1;
    },
  });
}

export const GET = handle;
export const POST = handle;
