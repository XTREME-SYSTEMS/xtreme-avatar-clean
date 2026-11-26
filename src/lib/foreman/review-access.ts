import type { VerifiedIdentityResult } from "../auth/types";

export type ForemanReviewAccess = "sign-in" | "select-workspace" | "restricted" | "unavailable" | "owner";

/** The decision screen consumes an identity verified against fresh Neon Auth membership. */
export function foremanReviewAccess(result: VerifiedIdentityResult): ForemanReviewAccess {
  switch (result.status) {
    case "anonymous":
      return "sign-in";
    case "membership_required":
      return "select-workspace";
    case "access_denied":
      return "restricted";
    case "unavailable":
      return "unavailable";
    case "authenticated":
      return result.identity.role === "owner" && result.identity.emailVerified
        ? "owner" : "restricted";
  }
}
