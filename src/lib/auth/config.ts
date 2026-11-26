/** Verified through Neon metadata for Avatar main, not the separate Core database. */
export const AVATAR_NEON_AUTH_BASE_URL =
  "https://ep-cool-scene-bcic0kwx.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth";

export const AVATAR_TASK_QA_BRANCH = "eden/foreman-owner-review-20261126";
export const AVATAR_TASK_QA_ORIGIN =
  "https://xtreme-avatar-clean-git-eden-foreman-o-c1e230-xtreme-ai-systems.vercel.app";
const ISOLATED_NEON_HOST = /^[a-z0-9-]+\.neonauth\.[a-z0-9.-]+\.neon\.tech$/;
const PROD_AUTH_HOST = new URL(AVATAR_NEON_AUTH_BASE_URL).hostname;

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
    if (authUrl.protocol !== "https:" || authUrl.port ||
      authUrl.username || authUrl.password || authUrl.search || authUrl.hash ||
      appUrl.protocol !== "https:" || appUrl.username || appUrl.password ||
      appUrl.search || appUrl.hash || appUrl.pathname !== "/"
    ) return { configured: false, code: "AUTH_CONFIGURATION_INVALID" };
    const canonicalAuth = authUrl.toString().replace(/\/$/, "");
    if (env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === AVATAR_TASK_QA_BRANCH) {
      if (appUrl.origin !== AVATAR_TASK_QA_ORIGIN ||
          authUrl.hostname === PROD_AUTH_HOST || !ISOLATED_NEON_HOST.test(authUrl.hostname) ||
          authUrl.pathname.replace(/\/$/, "") !== "/neondb/auth" ||
          env.AVATAR_QA_NEON_AUTH_BASE_URL !== canonicalAuth) {
        return { configured: false, code: "AUTH_CONFIGURATION_INVALID" };
      }
      return { configured: true, value: { baseUrl: canonicalAuth, appOrigin: appUrl.origin } };
    }
    if (canonicalAuth !== AVATAR_NEON_AUTH_BASE_URL) {
      return { configured: false, code: "AUTH_CONFIGURATION_INVALID" };
    }
    return { configured: true, value: { baseUrl: AVATAR_NEON_AUTH_BASE_URL, appOrigin: appUrl.origin } };
  } catch {
    return { configured: false, code: "AUTH_CONFIGURATION_INVALID" };
  }
}

