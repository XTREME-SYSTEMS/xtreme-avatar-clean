import Link from "next/link";
import { MobileIcon } from "@/components/mobile/icons";
import styles from "./mobile.module.css";

export default function MobileHome() {
  return <section className={styles.home} aria-labelledby="eden-title">
    <div className={styles.art} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mobile-art/eden-orbital.svg" alt="" width="340" height="204" />
    </div>
    <div className={styles.intro}>
      <p className={styles.kicker}>Personal assistant</p>
      <h1 id="eden-title">Eden Skye</h1><p className={styles.sub}>What would you like to work on?</p>
    </div>
    <div className={styles.actions}>
      <Link className={styles.primary} href="/mobile/voice"><MobileIcon name="audio"/>Talk to Eden</Link>
      <Link className={styles.secondary} href="/mobile/video"><MobileIcon name="video"/>Meet on video</Link>
      <Link className={styles.composer} href="/mobile/chat"><MobileIcon name="chat"/>Write to Eden…</Link>
    </div>
  </section>;
}
