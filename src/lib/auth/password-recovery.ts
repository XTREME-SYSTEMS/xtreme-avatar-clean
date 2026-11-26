import type { AuthConfiguration } from "./config";

type RecoveryReply = { ok: boolean; status: number; code?: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN = /^[A-Za-z0-9._~-]{8,2048}$/;

export function validRecoveryEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 && EMAIL.test(value.trim());
}
export function validResetToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

async function sendToNeon(config: AuthConfiguration, endpoint: "request-password-reset" | "reset-password", body: Record<string, string>, fetcher: typeof fetch): Promise<number> {
  try {
    // No browser-supplied headers, cookies, auth tokens or arbitrary provider URLs are forwarded.
    const response = await fetcher(`${config.baseUrl}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: config.appOrigin },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel().catch(() => {});
    return response.status;
  } catch {
    return 503;
  }
}

export async function requestPasswordRecovery(
  config: AuthConfiguration, body: unknown, fetcher: typeof fetch = fetch,
): Promise<RecoveryReply> {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join(",") !== "email") {
    return { ok: false, status: 400, code: "INVALID_RECOVERY_REQUEST" };
  }
  const email = (body as Record<string, unknown>).email;
  if (!validRecoveryEmail(email)) return { ok: false, status: 400, code: "INVALID_RECOVERY_REQUEST" };
  const status = await sendToNeon(config, "request-password-reset", {
    email: email.trim(),
    redirectTo: `${config.appOrigin}/reset-password`,
  }, fetcher);
  if (status === 429) return { ok: false, status: 429, code: "RECOVERY_RATE_LIMITED" };
  if (status >= 500 || status === 404 || status === 405) return { ok: false, status: 503, code: "RECOVERY_UNAVAILABLE" };
  // Always return an identical result for known/unknown accounts and provider validation denial.
  return { ok: true, status: 200 };
}

export async function confirmPasswordRecovery(
  config: AuthConfiguration, body: unknown, fetcher: typeof fetch = fetch,
): Promise<RecoveryReply> {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join(",") !== "newPassword,token") {
    return { ok: false, status: 400, code: "INVALID_RESET_REQUEST" };
  }
  const { token, newPassword } = body as Record<string, unknown>;
  if (!validResetToken(token) || typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
    return { ok: false, status: 400, code: "INVALID_RESET_REQUEST" };
  }
  const status = await sendToNeon(config, "reset-password", { token, newPassword }, fetcher);
  if (status >= 200 && status < 300) return { ok: true, status: 200 };
  if (status === 429) return { ok: false, status: 429, code: "RECOVERY_RATE_LIMITED" };
  if (status >= 500 || status === 404 || status === 405) return { ok: false, status: 503, code: "RECOVERY_UNAVAILABLE" };
  return { ok: false, status: 400, code: "RESET_LINK_INVALID_OR_EXPIRED" };
}
