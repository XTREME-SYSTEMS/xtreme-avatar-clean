"use client";

import Link from "next/link";
import { useReducer, useState } from "react";
import { PhoneIcon } from "@/components/phone-icon";
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

const waveformHeights = [10, 18, 25, 12, 30, 37, 22, 15, 29, 36, 23, 12, 31, 39, 19, 12, 25, 32, 16, 10, 7];

export function VideoScreen() {
  const [captions, setCaptions] = useState(false);
  const [silverTheme, setSilverTheme] = useState(false);
  return (
    <div className={`${styles.screen} ${styles.videoScreen} phone-screen`} data-design-node="42:297">
      <BackLink />
      <h1 className={styles.visuallyHidden}>Video with Eden</h1>
      <section className={`${styles.videoStage} ${silverTheme ? styles.silverTheme : ""}`} aria-label="Avatar preview">
        <PhoneIcon screen="video" name="imgAvatarContentImagePhotoOnlyDemoNotVideo" alt="Eden avatar portrait preview" className={styles.portrait} />
        <div className={styles.videoShade} />
        <div className={styles.videoTop}><span className={styles.glassPill}>● Preview · AI Avatar</span><button type="button" className={styles.glassPill} onClick={() => setSilverTheme(value => !value)} aria-pressed={silverTheme}><PhoneIcon screen="video" name="imgVideoIconTheme" />{silverTheme ? "Silver" : "Skin / Theme"}</button></div>
        <div className={styles.videoBottom}>
          {captions && <p className={styles.captionPlaceholder} role="status">Captions will appear during an active session.</p>}
          <p className={styles.mediaStatus}>Static portrait · Video setup required</p>
          <button type="button" className={styles.startVideo} disabled>Connect video to begin</button>
          <div className={styles.waveform} aria-hidden="true">{waveformHeights.map((height, index) => <i key={index} style={{ height }} />)}</div>
          <div className={styles.videoControls} aria-label="Video controls">
            <button type="button" disabled title="A connected voice session is required"><PhoneIcon screen="video" name="imgVideoIconMic" /><span>Mute</span></button>
            <button type="button" disabled title="A connected video session is required"><PhoneIcon screen="video" name="imgVideoIconCamera" /><span>Camera</span></button>
            <button type="button" onClick={() => setCaptions(value => !value)} aria-pressed={captions}><PhoneIcon screen="video" name="imgVideoIconCaptions" /><span>Captions</span></button>
            <button type="button" disabled title="There is no active response to interrupt"><PhoneIcon screen="video" name="imgVideoIconInterrupt" /><span>Interrupt</span></button>
            <Link className={styles.endVideo} href="/" aria-label="Close avatar preview"><PhoneIcon screen="video" name="imgVideoIconEnd" /><span>Close</span></Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export function VoiceScreen() {
  return (
    <div className={`${styles.screen} phone-screen`} data-design-node="42:375">
      <header className={styles.heading}><h1>Talk to Eden</h1><p>A natural conversation, with your work close by.</p></header>
      <button type="button" className={`${styles.metalCard} ${styles.voiceField}`} disabled aria-describedby="voice-help">
        <span className={styles.voiceVisual} aria-hidden="true"><PhoneIcon screen="voice" name="imgVoiceOuterGoldHalo" className={styles.orbLayer} /><PhoneIcon screen="voice" name="imgVoiceInnerRing" className={styles.orbLayer} /><PhoneIcon screen="voice" name="imgIconMic" className={styles.orbLayer} /></span>
        <strong>Voice setup required</strong>
      </button>
      <div className={styles.voiceStates} aria-label="Voice session status"><span>Microphone off</span><span>Not connected</span><span>No audio</span></div>
      <section className={styles.section} aria-labelledby="memory-title"><h2 id="memory-title">Conversation memory</h2><div className={`${styles.metalCard} ${styles.memoryCard}`}><p className={styles.eyebrow}>YOUR CONVERSATION</p><p>No voice conversation yet.</p><small id="voice-help">Voice and shared history need to be connected before a session can begin.</small></div></section>
      <div className={styles.relatedLinks}><Link href="/chat">Open text chat</Link><Link href="/video">Open avatar preview</Link><Link href="/connections">Connection settings</Link></div>
    </div>
  );
}

type PromptHistory = { past: string[]; present: string; future: string[] };
type PromptAction = { type: "edit"; value: string } | { type: "undo" } | { type: "redo" };
function promptReducer(state: PromptHistory, action: PromptAction): PromptHistory {
  if (action.type === "edit") return action.value === state.present ? state : { past: [...state.past, state.present].slice(-50), present: action.value, future: [] };
  if (action.type === "undo" && state.past.length) return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
  if (action.type === "redo" && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  return state;
}

const studios = [
  { name: "Apps", icon: "imgIconBox", placeholder: "Describe the app you want to create…" },
  { name: "Workflow", icon: "imgIconGear", placeholder: "Describe the workflow you want to create…" },
  { name: "AI agents", icon: "imgIconSpark", placeholder: "Describe the agent you want to create…" },
  { name: "Design", icon: "imgIconImage", placeholder: "Describe what to create or change…" },
] as const;

export function CreateScreen() {
  const [studio, setStudio] = useState<(typeof studios)[number]>(studios[3]);
  const [prompt, dispatch] = useReducer(promptReducer, { past: [], present: "", future: [] });
  return (
    <div className={`${styles.screen} ${styles.createScreen} phone-screen`} data-design-node="42:931">
      <div className={styles.createHeading}><BackLink /><h1>Create with Eden</h1><button type="button" className={styles.micButton} disabled aria-label="Voice input requires setup"><PhoneIcon screen="create" name="imgMicrophone" /></button></div>
      <section className={styles.canvas} aria-label="Canvas preview">
        <PhoneIcon screen="create" name="imgImageCanvasDesertStudy" alt="Desert study: a sculpted arch and curved stairway framing the setting sun" className={styles.canvasImage} />
        <div className={styles.canvasToolbar}><strong>Desert study</strong><button type="button" disabled={!prompt.past.length} onClick={() => dispatch({ type: "undo" })} aria-label="Undo prompt edit">Undo</button><button type="button" disabled={!prompt.future.length} onClick={() => dispatch({ type: "redo" })} aria-label="Redo prompt edit">Redo</button><button type="button" disabled title="Connect storage before saving a canvas">Save</button></div>
        <div className={styles.canvasNotice}><span>CANVAS PREVIEW</span><p>Describe your idea below.</p></div>
      </section>
      <section className={styles.studioSection} aria-label="Generation studios"><p>Generation studios · choose a category</p><div className={styles.studioGrid}>{studios.map(item => <button type="button" key={item.name} aria-pressed={studio.name === item.name} onClick={() => setStudio(item)}><PhoneIcon screen="create" name={item.icon} /><span>{item.name}</span></button>)}</div></section>
      <div className={styles.composer}><label className={styles.visuallyHidden} htmlFor="canvas-prompt">Describe what to create or change</label><textarea id="canvas-prompt" value={prompt.present} onChange={event => dispatch({ type: "edit", value: event.target.value })} placeholder={studio.placeholder} rows={2} maxLength={2000} aria-describedby="canvas-setup" /><div className={styles.composerFooter}><button type="button" disabled title="Image uploads need to be connected">+ Add image</button><span>Eden · {studio.name}</span><button type="button" className={styles.sendPrompt} disabled aria-label="Generate requires setup">↑</button></div></div>
      <p className={styles.footnote} id="canvas-setup">Draft text is local to this page. Image generation and saving need setup.</p>
    </div>
  );
}
