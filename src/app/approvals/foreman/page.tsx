import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { readAuthConfiguration } from "@/lib/auth/config";
import { resolveIdentity } from "@/lib/auth/identity";
import { createManagedAuthProvider } from "@/lib/auth/provider";
import { foremanReviewAccess, type ForemanReviewAccess } from "@/lib/foreman/review-access";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Foreman approvals",
  robots: { index: false, follow: false },
};

async function getAccess(): Promise<ForemanReviewAccess> {
  const config = readAuthConfiguration();
  if (!config.configured) return "unavailable";
  const request = await headers();
  const provider = createManagedAuthProvider(config.value, request.get("cookie"));
  // Unlike auth Route Handlers, this page does not set cookies or rotate credentials.
  const identity = await resolveIdentity(provider, config.value.baseUrl);
  return foremanReviewAccess(identity);
}

const notices = {
  "sign-in": ["Sign in to review", "Use your Xtreme Avatar account. The Foreman login and owner approval are separate."],
  "select-workspace": ["Choose your workspace", "Open your account and select the workspace you own, then return here."],
  restricted: ["Workspace owner access required", "Only the verified owner of the active workspace can review Foreman actions."],
  unavailable: ["Account verification unavailable", "No review was loaded. Check your account connection and try again."],
} as const;

export default async function ForemanReviewPage() {
  const access = await getAccess();

  return <section className={styles.review} aria-labelledby="foreman-review-title">
    <Link className={styles.back} href="/approvals">← All approvals</Link>
    <header className={styles.heading}>
      <p className={styles.eyebrow}>OWNER REVIEW</p>
      <h1 id="foreman-review-title">Foreman approvals</h1>
      <p>Review one action at a time before Eden reads, changes, or runs anything.</p>
    </header>

    {access !== "owner" ? <section className={styles.card} aria-labelledby="access-title">
      <h2 id="access-title">{notices[access][0]}</h2>
      <p>{notices[access][1]}</p>
      <Link className={styles.primary} href="/account">{access === "sign-in" ? "Open sign-in" : "Open your account"}</Link>
    </section> : <>
      <section className={styles.card} aria-labelledby="requests-title">
        <p className={styles.badge}>Owner verified</p>
        <h2 id="requests-title">Approval queue not connected</h2>
        <p role="status">Your sign-in is verified. This screen cannot load or submit decisions until the Foreman approval connection is enabled.</p>
      </section>
      <section className={styles.card} aria-labelledby="details-title">
        <h2 id="details-title">What you’ll review</h2>
        <dl className={styles.details}>
          <div><dt>Action</dt><dd>One read, write, or execution request.</dd></div>
          <div><dt>Target and revision</dt><dd>The exact system, environment, and version the request applies to.</dd></div>
          <div><dt>Impact</dt><dd>What changes, what it may cost, and when the request expires.</dd></div>
        </dl>
        <p>Opening an email or this page does not authorize anything.</p>
      </section>
    </>}
  </section>;
}
