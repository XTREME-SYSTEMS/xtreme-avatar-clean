import "server-only";
import { neon } from "@neondatabase/serverless";
import type { ConsentInput, ConsentedNumber, MessagingPreferences } from "./validation";

export function settingsDatabase() {
  const value = process.env.AVATAR_SETTINGS_DATABASE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return null;
    if (!url.hostname.endsWith(".neon.tech") || !url.username || !url.password) return null;
    return neon(value);
  } catch { return null; }
}
type Sql = NonNullable<ReturnType<typeof settingsDatabase>>;
type Row = Record<string, unknown>;
const asDate = (v: unknown) => v instanceof Date ? v.toISOString() : String(v);

export async function loadWorkspaceCommunications(sql: Sql, workspace: string): Promise<{
  preferences: MessagingPreferences; contacts: ConsentedNumber[];
}> {
  const [prefs, contacts] = await Promise.all([
    sql.query("SELECT sms_preferred,mms_preferred,whatsapp_preferred,desired_daily_limit,revision FROM avatar_app.communication_settings WHERE workspace_id=$1", [workspace]),
    sql.query("SELECT id::text AS id, display_name,phone_e164,channels,purpose,evidence_note,consented_at,revoked_at,revision FROM avatar_app.consented_numbers WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 300", [workspace]),
  ]);
  const x = prefs[0] as Row | undefined;
  return {
    preferences: x ? {
      smsPreferred: x.sms_preferred === true,
      mmsPreferred: x.mms_preferred === true,
      whatsappPreferred: x.whatsapp_preferred === true,
      desiredDailyLimit: x.desired_daily_limit === null ? null : Number(x.desired_daily_limit),
      revision: Number(x.revision),
    } : { smsPreferred: false, mmsPreferred: false, whatsappPreferred: false, desiredDailyLimit: null, revision: 0 },
    contacts: contacts.map(c => {
      const row = c as Row;
      return {
        id: String(row.id), displayName: String(row.display_name), phoneE164: String(row.phone_e164),
        channels: Array.isArray(row.channels) ? row.channels as ConsentedNumber["channels"] : [],
        purpose: row.purpose as ConsentedNumber["purpose"],
        evidenceNote: String(row.evidence_note), consentedAt: asDate(row.consented_at),
        revokedAt: row.revoked_at ? asDate(row.revoked_at) : null, revision: Number(row.revision),
      };
    }),
  };
}

export async function saveWorkspacePreferences(sql: Sql, workspace: string, actor: string, input: MessagingPreferences): Promise<boolean> {
  const stmt = [
    "WITH saved AS (INSERT INTO avatar_app.communication_settings",
    "(workspace_id,sms_preferred,mms_preferred,whatsapp_preferred,desired_daily_limit,updated_by)",
    "VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (workspace_id) DO UPDATE SET",
    "sms_preferred=EXCLUDED.sms_preferred,mms_preferred=EXCLUDED.mms_preferred,",
    "whatsapp_preferred=EXCLUDED.whatsapp_preferred,desired_daily_limit=EXCLUDED.desired_daily_limit,",
    "updated_by=EXCLUDED.updated_by,updated_at=now(),revision=communication_settings.revision+1",
    "WHERE communication_settings.revision=$7 RETURNING workspace_id),",
    "audit AS (INSERT INTO avatar_app.communication_audit(workspace_id,action,actor_user_id)",
    "SELECT workspace_id,'preferences_saved',$6 FROM saved RETURNING id) SELECT workspace_id FROM saved",
  ].join(" ");
  const result = await sql.query(stmt, [workspace,input.smsPreferred,input.mmsPreferred,input.whatsappPreferred,input.desiredDailyLimit,actor,input.revision]);
  return result.length === 1;
}

export async function saveConsentedNumber(sql: Sql, workspace: string, actor: string, input: ConsentInput): Promise<boolean> {
  const stmt = [
    "WITH saved AS (INSERT INTO avatar_app.consented_numbers",
    "(workspace_id,phone_e164,display_name,channels,purpose,evidence_note,consented_at,updated_by)",
    "VALUES ($1,$2,$3,string_to_array($4,','),$5,$6,$7::timestamptz,$8)",
    "ON CONFLICT (workspace_id,phone_e164) DO UPDATE SET",
    "display_name=EXCLUDED.display_name,channels=EXCLUDED.channels,purpose=EXCLUDED.purpose,",
    "evidence_note=EXCLUDED.evidence_note,consented_at=EXCLUDED.consented_at,",
    "revoked_at=NULL,updated_by=EXCLUDED.updated_by,updated_at=now(),revision=consented_numbers.revision+1",
    "WHERE consented_numbers.revision=$9 RETURNING id,workspace_id),",
    "audit AS (INSERT INTO avatar_app.communication_audit(workspace_id,record_id,action,actor_user_id)",
    "SELECT workspace_id,id::text,'consent_saved',$8 FROM saved RETURNING id) SELECT id FROM saved",
  ].join(" ");
  const result = await sql.query(stmt, [
    workspace,input.phoneE164,input.displayName.trim(),input.channels.join(","),input.purpose,
    input.evidenceNote.trim(),input.consentedAt,actor,input.revision,
  ]);
  return result.length === 1;
}

export async function revokeConsentedNumber(sql: Sql, workspace: string, actor: string, input: { phoneE164: string; revision: number }): Promise<boolean> {
  const stmt = [
    "WITH saved AS (UPDATE avatar_app.consented_numbers SET revoked_at=now(),updated_by=$1,",
    "updated_at=now(),revision=revision+1 WHERE workspace_id=$2 AND phone_e164=$3",
    "AND revision=$4 AND revoked_at IS NULL RETURNING id,workspace_id),",
    "audit AS (INSERT INTO avatar_app.communication_audit(workspace_id,record_id,action,actor_user_id)",
    "SELECT workspace_id,id::text,'consent_revoked',$1 FROM saved RETURNING id) SELECT id FROM saved",
  ].join(" ");
  const result = await sql.query(stmt,[actor,workspace,input.phoneE164,input.revision]);
  return result.length === 1;
}
