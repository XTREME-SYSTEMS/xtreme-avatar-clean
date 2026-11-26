export const CHANNELS = ["sms", "mms", "whatsapp", "voice"] as const;
export type ConsentChannel = (typeof CHANNELS)[number];

export type MessagingPreferences = {
  smsPreferred: boolean;
  mmsPreferred: boolean;
  whatsappPreferred: boolean;
  desiredDailyLimit: number | null;
  revision: number;
};

export type ConsentedNumber = {
  id: string;
  displayName: string;
  phoneE164: string;
  channels: ConsentChannel[];
  purpose: "account" | "transactional" | "marketing" | "voice";
  evidenceNote: string;
  consentedAt: string;
  revokedAt: string | null;
  revision: number;
};

export const EMPTY_PREFERENCES: MessagingPreferences = {
  smsPreferred: false, mmsPreferred: false, whatsappPreferred: false,
  desiredDailyLimit: null, revision: 0,
};
const PHONE = /^\+[1-9]\d{7,14}$/;
const PURPOSE = ["account", "transactional", "marketing", "voice"] as const;
export type ConsentInput = Omit<ConsentedNumber, "id" | "revokedAt">;

export function parsePreferences(value: unknown): MessagingPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join("|") !== "desiredDailyLimit|mmsPreferred|revision|smsPreferred|whatsappPreferred") return null;
  if (typeof v.smsPreferred !== "boolean" || typeof v.mmsPreferred !== "boolean" || typeof v.whatsappPreferred !== "boolean") return null;
  if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0) return null;
  if (v.desiredDailyLimit !== null && (!Number.isSafeInteger(v.desiredDailyLimit) || Number(v.desiredDailyLimit) < 1 || Number(v.desiredDailyLimit) > 1000000)) return null;
  return v as MessagingPreferences;
}

export function parseConsent(value: unknown): ConsentInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join("|") !== "channels|consentedAt|displayName|evidenceNote|phoneE164|purpose|revision") return null;
  if (typeof v.phoneE164 !== "string" || !PHONE.test(v.phoneE164) ||
      typeof v.displayName !== "string" || !v.displayName.trim() || v.displayName.length > 80 ||
      typeof v.evidenceNote !== "string" || v.evidenceNote.trim().length < 8 || v.evidenceNote.length > 500 ||
      typeof v.consentedAt !== "string" || !Number.isFinite(Date.parse(v.consentedAt)) ||
      Date.parse(v.consentedAt) > Date.now() + 60000 || Date.parse(v.consentedAt) < Date.parse("2000-01-01") ||
      !PURPOSE.includes(v.purpose as (typeof PURPOSE)[number]) ||
      !Array.isArray(v.channels) || v.channels.length < 1 || v.channels.length > 4 ||
      !v.channels.every(x => CHANNELS.includes(x)) ||
      new Set(v.channels).size !== v.channels.length ||
      !Number.isSafeInteger(v.revision) || Number(v.revision) < 0) return null;
  return v as ConsentInput;
}

export function parseRevoke(value: unknown): { phoneE164: string; revision: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join("|") !== "phoneE164|revision" ||
      typeof v.phoneE164 !== "string" || !PHONE.test(v.phoneE164) ||
      !Number.isSafeInteger(v.revision) || Number(v.revision) < 1) return null;
  return { phoneE164: v.phoneE164, revision: Number(v.revision) };
}
