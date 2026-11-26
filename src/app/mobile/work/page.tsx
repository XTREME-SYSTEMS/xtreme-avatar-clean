import type { Metadata } from "next";
import Link from "next/link";
import styles from "./work.module.css";

const operatorUrl = "https://eve-v3-factory.strategic-ai.chatgpt.site";
const pilotRepository = "https://github.com/XTREME-SYSTEMS/visual-x-eve-pilot";

export const metadata: Metadata = {
  title: "Work with Eve",
  robots: { index: false, follow: false },
};

export default function WorkPage() {
  return (
    <section className={styles.work} aria-labelledby="work-title">
      <h1 id="work-title" className={styles.title}>Work with Eve</h1>
      <p className={styles.intro}>Review builds and follow their progress.</p>

      <div className={styles.operator}>
        <div className={styles.emblem} aria-hidden="true">E</div>
        <div className={styles.detail}>
          <h2>Eve V3 Operator</h2>
          <p>Your private factory dashboard. Sign in with the account that has access to Eve.</p>
        </div>
        <a className={styles.primary} href={operatorUrl} rel="noreferrer">
          Open Eve <span aria-hidden="true">↗</span>
        </a>
      </div>

      <div className={styles.activity}>
        <h2>Approvals and evidence</h2>
        <Link href="/approvals/foreman">
          <span>Review Foreman actions</span><span className={styles.arrow} aria-hidden="true">→</span>
        </Link>
        <a href={pilotRepository + "/pulls"} rel="noreferrer">
          <span>Pull requests</span><span className={styles.arrow} aria-hidden="true">↗</span>
        </a>
        <a href={pilotRepository + "/actions"} rel="noreferrer">
          <span>Build checks</span><span className={styles.arrow} aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}

