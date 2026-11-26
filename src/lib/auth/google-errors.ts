/** Fixed user-facing guidance; never reflect provider descriptions or URL values. */
export function googleSignInErrorMessage(code: unknown): string {
  if (code === "GOOGLE_ACCOUNT_LINK_REQUIRED") {
    return "Google is not linked to your existing account. Sign in with your email and password.";
  }
  if (code === "GOOGLE_EMAIL_VERIFICATION_REQUIRED") {
    return "Your account email needs verification before Google sign-in can finish. Use your existing email and password to sign in.";
  }
  if (code === "GOOGLE_ACCESS_DENIED") {
    return "Google sign-in was not approved. You can try again or use your email and password.";
  }
  if (code === "GOOGLE_CHALLENGE_MISSING") {
    return "This sign-in attempt expired or its browser cookie is unavailable. Start Google sign-in again from this page.";
  }
  return "Google sign-in could not be completed. Please try again or use your email and password.";
}
