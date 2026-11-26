import Link from "next/link";
import { ApprovalsScreen } from "@/components/phone-screens/work-screens";
import styles from "./foreman/review.module.css";

export default function ApprovalsPage() {
  return <>
    <ApprovalsScreen />
    <nav className={styles.entry} aria-label="Foreman reviews">
      <Link className={styles.back} href="/approvals/foreman">Review Foreman actions →</Link>
    </nav>
  </>;
}
