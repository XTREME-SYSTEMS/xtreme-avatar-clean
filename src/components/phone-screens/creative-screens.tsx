"use client";

import Link from "next/link";
import { useState } from "react";
import { PhoneIcon } from "@/components/phone-icon";
import { TavusAvatarRender } from "@/components/tavus-avatar-render";
import { VoiceOperatorPanel } from "@/components/voice-operator";
import styles from "./creative-screens.module.css";

function BackLink({ href = "/", children = "Home" }: { href?: string; children?: string }) {
  return <Link className={styles.back} href={href}><span aria-hidden="true">‹</span> {children}</Link>;
}

function RadarVisual() {
  return (
    <span className={styles.radarVisual} aria-hidden="true">
      <PhoneIcon screen="ideas" name="imgRadarHaloOuter" className={styles.orbLayer} />
      <PhoneIcon screen="ideas" name="imgRadarHaloMiddle" className={styles.orbLayer} />
      <PhoneIcon screen="ideas" name="imgRadarCenter" className={styles.orbLayer} />
      <PhoneIcon screen="ideas" name="imgIconRadar" className={styles.orbLayer} />
    </span>
  );
}

export function IdeasScreen() {
  const [period, setPeriod] = useState("Today");
  const [industry, setIndustry] = useState("All industries");
  return (
    <div className={`${styles.screen} phone-screen`} data-design-node="42:132">
      <header className={styles.heading}><h1>Ideas · Daily Radar</h1><p>Discover, compare and act on opportunity signals.</p></header>
      <div className={styles.filters}>
        <div className={styles.periods} aria-label="Research period">
          {["Today", "This week"].map(value => <button key={value} type="button" className={styles.pill} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value}</button>)}
        </div>
        <label className={styles.selectLabel}><span className={styles.visuallyHidden}>Industry</span><select value={industry} onChange={event => setIndustry(event.target.value)}><option>All industries</option><option>Construction</option><option>Local services</option><option>Technology</option></select></label>
      </div>
      <Link className={`${styles.metalCard} ${styles.featured}`} href="/opportunity">
        <div><p className={styles.eyebrow}>DAILY INTELLIGENCE</p><h2>Your next opportunity</h2><p className={styles.muted}>A space for ideas backed by research.</p><span className={styles.quietTag}>Awaiting research</span></div>
        <RadarVisual />
      </Link>
      <section className={styles.section} aria-labelledby="signals-title">
        <h2 id="signals-title">New signals</h2>
        <p className={styles.emptyNote} aria-live="polite">No verified signals {period === "Today" ? "today" : "this week"}{industry === "All industries" ? "." : ` for ${industry.toLowerCase()}.`}</p>
        <Link className={`${styles.metalCard} ${styles.actionRow}`} href="/opportunity"><PhoneIcon screen="ideas" name="imgIconIdea" /><span><strong>Explore an opportunity</strong><small>Research, assess and plan</small></span><PhoneIcon screen="ideas" name="imgIconArrow" /></Link>
        <Link className={`${styles.metalCard} ${styles.actionRow}`} href="/create"><PhoneIcon screen="ideas" name="imgIconChart" /><span><strong>Open invention studio</strong><small>Bring a new idea to the canvas</small></span><PhoneIcon screen="ideas" name="imgIconArrow" /></Link>
      </section>
      <p className={styles.footnote}>Research results will appear when your discovery service is connected.</p>
    </div>
  );
}

const routeDescriptions = {
  Research: "Define the problem, audience and evidence before assessing an opportunity.",
  Prototype: "Explore the visual canvas and prepare a concept for review.",
  "Owner review": "Review the proposed work and request changes before execution.",
} as const;

export function OpportunityScreen() {
  const [stage, setStage] = useState<keyof typeof routeDescriptions>("Research");
  return (
    <div className={`${styles.screen} phone-screen`} data-design-node="42:220">
      <BackLink href="/invention">Daily Radar</BackLink>
      <header className={styles.heading}><h1>Opportunity Detail</h1><p>Turn a researched idea into a clear next step.</p></header>
      <section className={`${styles.metalCard} ${styles.opportunityCard}`} aria-label="Selected opportunity">
        <div><p className={styles.eyebrow}>OPPORTUNITY WORKSPACE</p><h2>No opportunity<br />selected yet</h2><p className={styles.muted}>Research has not been connected.</p></div>
        <span className={styles.scoreRing} aria-label="No assessment score"><PhoneIcon screen="opportunity" name="imgScoreRing" /><strong>—</strong></span>
      </section>
      <section className={styles.section} aria-labelledby="assessment-title"><h2 id="assessment-title">Signal assessment</h2><dl className={`${styles.metalCard} ${styles.assessment}`}><div><dt>Demand</dt><dd>Not assessed</dd></div><div><dt>Execution fit</dt><dd>Not assessed</dd></div></dl></section>
      <section className={styles.section} aria-labelledby="route-title">
        <h2 id="route-title">Recommended route</h2>
        <div className={styles.filters} aria-label="Planning stage">{(Object.keys(routeDescriptions) as Array<keyof typeof routeDescriptions>).map(value => <button key={value} type="button" className={styles.pill} aria-pressed={stage === value} onClick={() => setStage(value)}>{value}</button>)}</div>
        <p className={styles.stageDescription} aria-live="polite">{routeDescriptions[stage]}</p>
        <Link className={`${styles.metalCard} ${styles.actionRow}`} href={stage === "Owner review" ? "/approvals" : "/create"}><PhoneIcon screen="opportunity" name="imgIconSpark" /><span><strong>{stage === "Owner review" ? "Open approvals" : "Open the planning canvas"}</strong><small>{stage === "Owner review" ? "Review versions and feedback" : "Prepare your idea before execution"}</small></span></Link>
      </section>
    </div>
  );
}

export function VideoScreen() {
  return (
    <div className={`${styles.screen} ${styles.videoScreen} phone-screen`} data-design-node="42:297">
      <BackLink />
      <h1 className={styles.visuallyHidden}>Video with Eden</h1>
      <TavusAvatarRender mediaClassName={styles.videoStage} portrait={<>
        <PhoneIcon screen="video" name="imgAvatarContentImagePhotoOnlyDemoNotVideo" alt="Eden avatar portrait" className={styles.portrait} />
        <div className={styles.videoShade} />
        <div className={styles.videoTop}><span className={styles.glassPill}>Eden Skye · AI Avatar</span></div>
      </>} />
    </div>
  );
}

export function VoiceScreen() {
  return (
    <div className={`${styles.screen} phone-screen`} data-design-node="42:375">
      <header className={styles.heading}><h1>Talk to Eden</h1><p>A natural conversation, with your work close by.</p></header>
      <div className={`${styles.metalCard} ${styles.voiceField}`}>
        <span className={styles.voiceVisual} aria-hidden="true"><PhoneIcon screen="voice" name="imgVoiceOuterGoldHalo" className={styles.orbLayer} /><PhoneIcon screen="voice" name="imgVoiceInnerRing" className={styles.orbLayer} /><PhoneIcon screen="voice" name="imgIconMic" className={styles.orbLayer} /></span>
        <VoiceOperatorPanel />
      </div>
      <div className={styles.relatedLinks}><Link href="/chat">Open text chat</Link><Link href="/video">Open avatar preview</Link><Link href="/connections">Connection settings</Link></div>
    </div>
  );
}
