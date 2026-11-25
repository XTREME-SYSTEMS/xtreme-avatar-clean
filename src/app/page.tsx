import Link from "next/link";
import { homeDesignAssets } from "@/lib/home-design-assets";
import styles from "./home.module.css";

type AssetName = keyof typeof homeDesignAssets;

function DesignIcon({ name, className }: { name: AssetName; className?: string }) {
  const asset = homeDesignAssets[name];
  // Preserve the original SVG's intrinsic dimensions, including its effect bounds.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.src} alt="" aria-hidden="true" className={className} />;
}

const actions = [
  { label: "Video", icon: "imgIconVideo", available: false },
  { label: "Voice", icon: "imgIconMic1", available: false },
  { label: "Ideas", icon: "imgIconIdeasRadar", href: "/invention", available: true },
  { label: "Tasks", icon: "imgIconTasks", href: "/workspace", available: true },
  { label: "Calendar", icon: "imgIconCalendar", href: "/workspace", available: true },
  { label: "Approvals", icon: "imgIconApproval", href: "/finished", available: true },
] as const;

/** Approved Home: Figma 16F1Pcf7WN23HfBlBBx2Mf, frame 42:13.
 * The Completion Center remains its own route at /finished.
 */
export default function HomePage() {
  return (
    <div className={styles.home} data-design-node="42:13">
      <div className={styles.backdrop} aria-hidden="true">
        <DesignIcon name="imgV4BrushedAluminumTextureReusable" className={styles.fiber} />
        <DesignIcon name="imgAtmosphereSilverPearlUpperRight" className={styles.upperGlow} />
        <DesignIcon name="imgAtmosphereWhiteGraphiteMiddle" className={styles.middleGlow} />
        <DesignIcon name="imgAtmosphereSilverLowerBevel" className={styles.lowerGlow} />
        <DesignIcon name="imgV4CurvedSilverLightReusable" className={styles.curve} />
      </div>
      <div className={styles.deviceChrome} aria-hidden="true">
        <span>9:41</span><span className={styles.camera} /><span>▰ ▰ ▰</span>
      </div>

      <section className={styles.intro} aria-labelledby="home-title">
        <h1 id="home-title">Good morning</h1>
        <p>Your AI command center for work, projects,<br />and ideas.</p>
      </section>

      <button className={styles.talk} type="button" disabled aria-describedby="voice-setup-status">
        <span className={styles.micDisc}><DesignIcon name="imgIconMic" /></span>
        <span className={styles.talkDivider} aria-hidden="true" />
        <span className={styles.talkCopy}>
          <strong>Talk to Eden</strong>
          <span className={styles.talkSubtitle}>Start a voice session</span>
          <span className={styles.voiceStatus} id="voice-setup-status">
            <span className={styles.statusDot} aria-hidden="true" />Voice setup required
          </span>
        </span>
        <DesignIcon name="imgIconArrow" className={styles.talkArrow} />
      </button>

      <section className={styles.quickActions} aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title">Quick actions</h2>
        <div className={styles.actionGrid}>
          {actions.map((action) => {
            const className = [styles.actionTile, action.label === "Voice" ? styles.voiceTile : ""].join(" ");
            const content = <><DesignIcon name={action.icon} /><span>{action.label}</span></>;
            return action.available ? (
              <Link className={className} key={action.label} href={action.href}>{content}</Link>
            ) : (
              <button className={className} key={action.label} type="button" disabled
                aria-label={action.label + " — setup required"} title={action.label + " connection requires setup"}>
                {content}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.priorities} aria-labelledby="priorities-title">
        <div className={styles.priorityHeading}>
          <h2 id="priorities-title">Today&apos;s priorities</h2><span className={styles.demo}>Demo data</span>
        </div>
        <div className={styles.priorityList}>
          <Link className={styles.priorityRow} href="/finished" aria-label="Review approvals — demo; open Finished">
            <DesignIcon name="imgIconApproval1" className={styles.priorityIcon} />
            <span className={styles.priorityDivider} aria-hidden="true" />
            <span className={styles.priorityCopy}><strong>Review approvals</strong><span>2 items need review</span></span>
            <DesignIcon name="imgIconChev" className={styles.chevron} />
          </Link>
          <Link className={styles.priorityRow} href="/finished">
            <DesignIcon name="imgIconFinishedResultReceipt" className={styles.priorityIcon} />
            <span className={styles.priorityDivider} aria-hidden="true" />
            <span className={styles.priorityCopy}><strong>Finished</strong><span>Completed work &amp; results</span></span>
            <DesignIcon name="imgIconChev" className={styles.chevron} />
          </Link>
        </div>
      </section>
    </div>
  );
}
