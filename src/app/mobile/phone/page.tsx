import Link from "next/link";
import { MobileIcon } from "@/components/mobile/icons";
import styles from "../mobile.module.css";

export default function MobilePhone() {
  return <section className={styles.inner}>
    <p className={styles.kicker}>Communications</p><h1>Phone call</h1>
    <p className={styles.sub}>Phone calling needs setup.</p>
    <div className={styles.info}><MobileIcon name="phone"/><h2>Business line</h2>
      <p>The Xtreme Avatar service handles messages. A voice route for this line still needs to be connected.</p>
    </div>
    <Link href="/mobile/voice" className={styles.secondary}><MobileIcon name="audio"/>Use in-app voice</Link>
  </section>;
}
