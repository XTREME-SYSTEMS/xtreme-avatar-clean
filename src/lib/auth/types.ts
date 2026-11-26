export type MemberRole = "owner" | "admin" | "member";

/** Provider identifiers only. Core must resolve its own explicit identity mapping. */
export type VerifiedIdentity = {
  issuer: string;
  userId: string;
  sessionId: string;
  sessionExpiresAt: string;
  organizationId: string;
  memberId: string;
  role: MemberRole;
  emailVerified: boolean;
};

export type VerifiedIdentityResult =
  | { status: "authenticated"; identity: VerifiedIdentity }
  | { status: "anonymous" }
  | { status: "membership_required" }
  | { status: "access_denied"; code: string }
  | { status: "unavailable"; code: string };

export type AccountUser = { name: string; email: string; emailVerified: boolean };
export type OrganizationChoice = { id: string; name: string };
export type AccountSession = {
  status: VerifiedIdentityResult["status"];
  code?: string;
  user?: AccountUser;
  organization?: { id: string; role: MemberRole };
  organizations?: OrganizationChoice[];
  organizationListUnavailable?: boolean;
  workspaceCreation?: "created" | "recovered";
};

export type AuthResolution = VerifiedIdentityResult & { user?: AccountUser };
