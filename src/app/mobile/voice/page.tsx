import Link from "next/link";
import { VoiceOperatorPanel } from "@/components/voice-operator";
import styles from "@/components/mobile-media/media.module.css";

export default function MobileVoicePage() {
  return <section className={styles.screen} aria-labelledby="voice-title">
    <Link className={styles.back} href="/mobile">← Eden</Link>
    <div className={styles.stage}><span className={styles.orbit} aria-hidden="true"><i /><i /><i /></span></div>
    <div className={styles.body}>
      <p className={styles.mode}>VOICE</p>
      <h1 id="voice-title">Talk to Eden</h1>
      <VoiceOperatorPanel />
    </div>
  </section>;
}
