import "server-only";
import { settingsDatabase } from "../communications/store";
import type { RenderStore } from "./render-handler";

export function tavusRenderStore(): RenderStore | null {
  const db = settingsDatabase();
  if (!db) return null;
  const query = (sql: string, params: string[] = []) =>
    db.query(sql, params, { fetchOptions: { signal: AbortSignal.timeout(4_000) } });
  return {
    async check() {
      await query("SELECT scope_id, cancelled_at FROM avatar_app.tavus_render_issuance LIMIT 0");
    },
    async reserve(scopeId, requestId) {
      // The single row lock serializes starts across server instances, including UTC rollover.
      const rows = await query(
        `INSERT INTO avatar_app.tavus_render_issuance AS r (scope_id, utc_day, request_ids, request_id, reserved_at)
         VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, ARRAY[$2::uuid], $2, CURRENT_TIMESTAMP)
         ON CONFLICT (scope_id) DO UPDATE SET
           previous_request_ids = CASE WHEN r.utc_day = EXCLUDED.utc_day THEN r.previous_request_ids
                                       WHEN r.utc_day = EXCLUDED.utc_day - 1 THEN r.request_ids ELSE '{}'::uuid[] END,
           request_ids = CASE WHEN r.utc_day = EXCLUDED.utc_day THEN r.request_ids || EXCLUDED.request_ids ELSE EXCLUDED.request_ids END,
           utc_day = EXCLUDED.utc_day,
           request_id = EXCLUDED.request_id,
           reserved_at = EXCLUDED.reserved_at,
           conversation_id = NULL,
           ended_at = NULL,
           cancelled_at = NULL
         WHERE r.reserved_at <= CURRENT_TIMESTAMP - interval '3 minutes'
           AND (r.utc_day <> EXCLUDED.utc_day OR cardinality(r.request_ids) < 3)
           AND NOT ($2::uuid = ANY (r.request_ids) OR $2::uuid = ANY (r.previous_request_ids))
         RETURNING scope_id`, [scopeId, requestId],
      );
      return rows.length === 1;
    },
    async saveRoom(scopeId, requestId, conversationId) {
      const rows = await query(
        `UPDATE avatar_app.tavus_render_issuance SET conversation_id = $3
         WHERE scope_id = $1 AND request_id = $2 AND (conversation_id IS NULL OR conversation_id = $3)
         RETURNING cancelled_at IS NOT NULL AS cancelled`,
        [scopeId, requestId, conversationId],
      );
      return rows.length === 1 ? { cancelled: rows[0].cancelled === true } : null;
    },
    async requestClose(scopeId, requestId) {
      const [row] = await query(
        `UPDATE avatar_app.tavus_render_issuance SET cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP)
         WHERE scope_id = $1 AND request_id = $2
         RETURNING conversation_id, ended_at IS NOT NULL AS ended`, [scopeId, requestId],
      );
      return row ? { conversationId: typeof row.conversation_id === "string" ? row.conversation_id : null, ended: row.ended === true } : null;
    },
    async markEnded(scopeId, requestId) {
      await query(
        `UPDATE avatar_app.tavus_render_issuance SET ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)
         WHERE scope_id = $1 AND request_id = $2`, [scopeId, requestId],
      );
    },
  };
}
