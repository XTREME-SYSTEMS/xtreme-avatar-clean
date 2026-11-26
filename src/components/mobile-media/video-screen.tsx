import Link from "next/link";
import { TavusAvatarRender } from "@/components/tavus-avatar-render";
import styles from "./media.module.css";

export function VideoScreen() {
  return <section className={styles.screen} aria-labelledby="video-title">
    <Link className={styles.back} href="/mobile">← Eden</Link>
    <div className={styles.body}>
      <p className={styles.mode}>VIDEO</p>
      <h1 id="video-title">See Eden</h1>
      <TavusAvatarRender mediaClassName={styles.videoStage} portrait={<span role="img" aria-label="Eden Skye’s Tavus portrait" />} />
    </div>
  </section>;
}
