/** Verified through Neon metadata for Avatar main, not the separate Core database. */
export const AVATAR_NEON_AUTH_BASE_URL =
  "https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth";

export type AuthConfiguration = { baseUrl: string; appOrigin: string };
export type AuthConfigurationResult =
  | { configured: true; value: AuthConfiguration }
  | { configured: false; code: "AUTH_NOT_CONFIGURED" | "AUTH_CONFIGURATION_INVALID" };

/** Called lazily so an unconfigured preview can still build and render honestly. */
export function readAuthConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AuthConfigurationResult {
  const baseUrl = env.NEON_AUTH_BASE_URL;
  const appOrigin = env.AVATAR_APP_ORIGIN;
  if (!baseUrl || !appOrigin) return { configured: false, code: "AUTH_NOT_CONFIGURED" };
  try {
    const authUrl = new URL(baseUrl);
    const appUrl = new URL(appOrigin);
    if (
      authUrl.toString().replace(/\/$/, "") !== AVATAR_NEON_AUTH_BASE_URL ||
      authUrl.username || authUrl.password || authUrl.search || authUrl.hash ||
      appUrl.protocol !== "https:" || appUrl.username || appUrl.password ||
      appUrl.search || appUrl.hash || appUrl.pathname !== "/"
    ) return { configured: false, code: "AUTH_CONFIGURATION_INVALID" };
    return { configured: true, value: { baseUrl: AVATAR_NEON_AUTH_BASE_URL, appOrigin: appUrl.origin } };
  } catch {
    return { configured: false, code: "AUTH_CONFIGURATION_INVALID" };
  }
}
