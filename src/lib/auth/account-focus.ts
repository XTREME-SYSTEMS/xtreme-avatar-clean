/** Focus alone is not evidence of an account change. Keep idle anonymous drafts. */
export function accountFocusAction(status: string, pending: string | null): "refresh-draft" | "interrupt-signup" | "invalidate" {
  if (pending === "sign-up") return "interrupt-signup";
  if (status === "anonymous" && pending === null) return "refresh-draft";
  return "invalidate";
}

export const SIGN_UP_UNCERTAIN_MESSAGE = "We could not confirm whether account setup finished. Try signing in with this email and password before submitting another account request.";
