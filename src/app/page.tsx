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
  { label: "Video", icon: "imgIconVideo", href: "/video" },
  { label: "Voice", icon: "imgIconMic1", href: "/voice" },
  { label: "Ideas", icon: "imgIconIdeasRadar", href: "/invention" },
  { label: "Tasks", icon: "imgIconTasks", href: "/tasks" },
  { label: "Calendar", icon: "imgIconCalendar", href: "/calendar" },
  { label: "Approvals", icon: "imgIconApproval", href: "/approvals" },
] as const;

/** Approved Home: Figma 16F1Pcf7WN23HfBlBBx2Mf, frame 42:13.
 * The Completion Center remains its own route at /finished.
 */
export default function HomePage() {
  return (
    <div className={styles.home} data-design-node="42:13">
      <section className={styles.intro} aria-labelledby="home-title">
        <h1 id="home-title">Good morning</h1>
        <p>Your AI command center for work, projects,<br />and ideas.</p>
      </section>

      <Link className={styles.talk} href="/voice" aria-describedby="voice-setup-status">
        <span className={styles.micDisc}><DesignIcon name="imgIconMic" /></span>
        <span className={styles.talkDivider} aria-hidden="true" />
        <span className={styles.talkCopy}>
          <strong>Talk to Eden</strong>
          <span className={styles.talkSubtitle}>Open your voice screen</span>
          <span className={styles.voiceStatus} id="voice-setup-status">
            <span className={styles.statusDot} aria-hidden="true" />Voice setup required
          </span>
        </span>
        <DesignIcon name="imgIconArrow" className={styles.talkArrow} />
      </Link>

      <Link className={styles.chatLink} href="/chat">Prefer to type? Chat with Eden <span aria-hidden="true">→</span></Link>

      <section className={styles.quickActions} aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title">Quick actions</h2>
        <div className={styles.actionGrid}>
          {actions.map((action) => {
            const className = [styles.actionTile, action.label === "Voice" ? styles.voiceTile : ""].join(" ");
            const content = <><DesignIcon name={action.icon} /><span>{action.label}</span></>;
            return <Link className={className} key={action.label} href={action.href}>{content}</Link>;
          })}
        </div>
      </section>

      <section className={styles.priorities} aria-labelledby="priorities-title">
        <div className={styles.priorityHeading}>
          <h2 id="priorities-title">Today&apos;s priorities</h2>
        </div>
        <div className={styles.priorityList}>
          <Link className={styles.priorityRow} href="/approvals" aria-label="Review approvals">
            <DesignIcon name="imgIconApproval1" className={styles.priorityIcon} />
            <span className={styles.priorityDivider} aria-hidden="true" />
            <span className={styles.priorityCopy}><strong>Review approvals</strong><span>View your approval queue</span></span>
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
