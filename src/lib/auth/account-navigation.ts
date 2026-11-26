import type { AccountSession } from "./types";

/** Only a freshly verified, workspace-scoped session may enter the dashboard.
 * Signup without a workspace, an uncertain response, or sign-out stays on Account.
 */
export function dashboardDestination(session: Pick<AccountSession, "status" | "organization"> | undefined): "/dashboard" | null {
  return session?.status === "authenticated" && typeof session.organization?.id === "string" && session.organization.id.length > 0
    ? "/dashboard" : null;
}
