import Link from "next/link";
import styles from "./media.module.css";

// Provider readback: active Eden Skye landing-page deployment, PAL p78f5b305e3a.
const hostedEden = "https://maker.tavus.io/deployments/5b2376e5-769e-4e9a-ba33-5d56c66bf3d4";

export function VideoScreen() {
  return <section className={styles.screen} aria-labelledby="video-title">
    <Link className={styles.back} href="/mobile">← Eden</Link>
    <div className={styles.videoStage} role="img" aria-label="Eden Skye’s Tavus portrait" />
    <div className={styles.body}>
      <p className={styles.mode}>VIDEO</p>
      <h1 id="video-title">See Eden</h1>
      <p>Meet Eden Skye in her Tavus video room. This opens a separate session. Your private Core conversation stays in Xtreme Avatar.</p>
      <a className={styles.primary} href={hostedEden} target="_blank" rel="noopener noreferrer">Open Eden on Tavus ↗</a>
      <small>Starting video in Tavus uses your account’s video minutes.</small>
    </div>
  </section>;
}
