"use client";

import { useState } from "react";
import Link from "next/link";
import { PhoneIcon } from "@/components/phone-icon";
import styles from "./work-screens.module.css";

function Filters({ label, items, selected, onSelect }: {
  label: string;
  items: readonly string[];
  selected: string;
  onSelect: (item: string) => void;
}) {
  return <div className={styles.filters} role="group" aria-label={label}>
    {items.map((item) => <button key={item} type="button" aria-pressed={selected === item}
      className={selected === item ? styles.selected : undefined} onClick={() => onSelect(item)}>{item}</button>)}
  </div>;
}

function ScreenHeading({ title, description }: { title: string; description: string }) {
  return <header className={styles.heading}><h1>{title}</h1><p>{description}</p></header>;
}

const workspaceTools = [
  { name: "Gmail", icon: "imgIconMail", href: "/mail" },
  { name: "Drive", icon: "imgIconDrive", href: "/drive" },
  { name: "Calendar", icon: "imgIconCalendar", href: "/calendar" },
  { name: "Vault", icon: "imgIconVault", href: "/vault" },
  { name: "Maps", icon: "imgIconMap", href: "/maps" },
  { name: "Contacts", icon: "imgIconUsers", href: "/contacts" },
  { name: "Images", icon: "imgIconImage", href: "/images" },
  { name: "Wallet", icon: "imgIconWallet", href: "/wallet" },
  { name: "Keep", icon: "imgIconNote", href: "/notes" },
  { name: "My tasks", icon: "imgIconTasks", href: "/mobile/tasks" },
] as const;

export function WorkspaceScreen() {
  const [tab, setTab] = useState("Tools");
  return <div className={`${styles.screen} phone-screen`} data-design-node="42:634">
    <ScreenHeading title="Workspace" description="Connected services, available by permission." />
    <Filters label="Workspace view" items={["Tools", "Connections", "Ask Eden"]} selected={tab} onSelect={setTab} />
    {tab === "Tools" && <div className={styles.toolsGrid} aria-label="Workspace tools">
      {workspaceTools.map((tool) => <Link className={styles.tool} href={tool.href} key={tool.name}>
        <PhoneIcon screen="workspace" name={tool.icon} className={styles.toolIcon} /><span>{tool.name}</span>
      </Link>)}
    </div>}
    {tab === "Ask Eden" && <section className={`${styles.panel} ${styles.askPanel}`}>
      <PhoneIcon screen="workspace" name="imgIconUsers" className={styles.rowIcon} />
      <div><h2>Bring your work to Eden</h2><p>Ask about your calendar, files, or next task.</p></div>
      <Link className={styles.textLink} href="/voice">Open Talk to Eden <span aria-hidden="true">→</span></Link>
    </section>}
    <section className={styles.section} aria-labelledby="service-permissions-heading">
      <h2 id="service-permissions-heading">Service permissions</h2>
      <Link className={`${styles.panel} ${styles.permission}`} href="/connections">
        <PhoneIcon screen="workspace" name="imgIconShield" className={styles.rowIcon} />
        <div><h3>Google account</h3><p>Connect to access your own data</p><span className={styles.status}>Connection required</span></div>
      </Link>
      <Link className={`${styles.panel} ${styles.permission}`} href="/security">
        <PhoneIcon screen="workspace" name="imgIconVault1" className={styles.rowIcon} />
        <div><h3>Scope-aware access</h3><p>Each service requests its own permissions.</p><span className={styles.subtleLink}>Review your permissions <span aria-hidden="true">→</span></span></div>
      </Link>
    </section>
  </div>;
}

const taskFilters = ["All", "Ready", "In review", "Finished"] as const;

export function TasksScreen() {
  const [filter, setFilter] = useState<string>("All");
  const queueDescription = filter === "All" ? "Connect your account to see your work queue." : `Connect your account to see tasks marked ${filter.toLowerCase()}.`;
  return <div className={`${styles.screen} phone-screen`} data-design-node="42:445">
    <ScreenHeading title="Tasks · Auto Loop" description="Authorized requests become trackable work." />
    <Link className={`${styles.panel} ${styles.permission}`} href="/mobile/tasks">
      <PhoneIcon screen="tasks" name="imgIconFile" className={styles.rowIcon} />
      <div><h2>My private tasks</h2><p>Create and revisit personal tasks in your verified workspace. These are not automatically dispatched to the AI work queue.</p><span className={styles.subtleLink}>Open my tasks <span aria-hidden="true">→</span></span></div>
    </Link>
    <section className={`${styles.panel} ${styles.workflow}`} aria-label="Task workflow stages">
      <p className={styles.eyebrow}>TASK WORKFLOW</p>
      <ol>{["Needs input", "Ready", "Running", "Review", "Finished"].map((stage) => <li key={stage}>
        <PhoneIcon screen="tasks" name={stage === "Ready" ? "imgStepReady" : "imgStepNeedsInput"} className={styles.stepIcon} /><span>{stage}</span>
      </li>)}</ol>
    </section>
    <section className={styles.section} aria-labelledby="task-queue-heading">
      <h2 id="task-queue-heading">AI work queue</h2>
      <Filters label="Task status" items={taskFilters} selected={filter} onSelect={setFilter} />
      <div className={`${styles.panel} ${styles.empty}`} role="status">
        <PhoneIcon screen="tasks" name="imgIconFile" className={styles.emptyIcon} />
        <h3>Your next task starts here</h3><p>{queueDescription}</p>
        <Link className={styles.textLink} href="/connections">View connections <span aria-hidden="true">→</span></Link>
      </div>
      <div className={styles.relatedLinks}><Link href="/approvals">Review approvals <span aria-hidden="true">→</span></Link><Link href="/finished">Finished work <span aria-hidden="true">→</span></Link></div>
    </section>
    <div className={`${styles.panel} ${styles.connectionNote}`}>
      <PhoneIcon screen="tasks" name="imgIconLock" className={styles.noteIcon} /><p>Connect your account to load tasks.</p>
    </div>
  </div>;
}

export function ApprovalsScreen() {
  const [status, setStatus] = useState("In review");
  const [kind, setKind] = useState("Brand");
  return <div className={`${styles.screen} ${styles.approvals} phone-screen`} data-design-node="42:756">
    <ScreenHeading title="Approvals" description="Decide, revise, and preserve every version." />
    <Filters label="Approval status" items={["In review", "Approved", "Revisions"]} selected={status} onSelect={setStatus} />
    <Filters label="Approval type" items={["Plan", "Logo", "Brand", "Web pack"]} selected={kind} onSelect={setKind} />
    <section className={`${styles.panel} ${styles.previewPanel}`} aria-labelledby="approval-preview-title">
      <div className={styles.previewHeading}><p className={styles.eyebrow}>{kind.toUpperCase()} PREVIEW</p><span className={styles.status}>Not connected</span></div>
      <div className={styles.previewCanvas}>
        <PhoneIcon screen="approvals" name="imgApprovalCanvasCarbonAndPlatinumScreensaver" className={styles.approvalArtwork} />
        <div className={styles.previewPlaceholder}><span>Your preview will appear here</span></div>
      </div>
      <h2 id="approval-preview-title">No approval selected</h2>
      <p role="status">Connect to view {kind.toLowerCase()} items {status === "In review" ? "awaiting review" : status === "Approved" ? "you have approved" : "with requested revisions"}.</p>
    </section>
    <div className={styles.approvalActions}>
      <button type="button" disabled title="Connect and select an item to revise"><PhoneIcon screen="approvals" name="imgIconApproval" className={styles.buttonIcon} /><span>Revise with comment</span></button>
      <button type="button" disabled title="Connect and select an item to approve"><PhoneIcon screen="approvals" name="imgIconCheck" className={styles.buttonIcon} /><span>Approve</span></button>
    </div>
    <section className={styles.feedback} aria-labelledby="feedback-heading">
      <h2 id="feedback-heading">What should change?</h2>
      <div className={styles.feedbackChips}>
        {["Too busy", "Typography", "Layout", "Different imagery", "Missing detail"].map((item) => <button type="button" disabled key={item}>{item}</button>)}
      </div>
      <label className={styles.srOnly} htmlFor="approval-feedback">Revision feedback</label>
      <textarea id="approval-feedback" disabled placeholder="Select an item to leave feedback…" rows={2} />
      <p className={styles.finePrint}>Connect your account to review and send feedback.</p>
    </section>
  </div>;
}

export function FinishedScreen() {
  const [filter, setFilter] = useState("Recent");
  return <div className={`${styles.screen} phone-screen`} data-design-node="42:545">
    <ScreenHeading title="Finished" description="Completed work, deliverables, and evidence." />
    <Filters label="Deliverable type" items={["Recent", "Files", "Reports", "Approvals"]} selected={filter} onSelect={setFilter} />
    <section className={`${styles.panel} ${styles.completion}`}>
      <p className={styles.eyebrow}>COMPLETION CENTER</p>
      <h2>Your outcomes, all in one place</h2><p>Completed work will appear here.</p>
    </section>
    <section className={styles.section} aria-labelledby="finished-list-heading">
      <h2 id="finished-list-heading">{filter === "Recent" ? "Recent deliverables" : filter}</h2>
      <div className={`${styles.panel} ${styles.empty}`} role="status">
        <PhoneIcon screen="finished" name={filter === "Approvals" ? "imgIconTasks" : "imgIconFile"} className={styles.emptyIcon} />
        <h3>Connect to see your results</h3><p>Your {filter === "Recent" ? "completed work" : filter.toLowerCase()} will load after you connect your account.</p>
        <Link className={styles.textLink} href="/connections">View connections <span aria-hidden="true">→</span></Link>
      </div>
    </section>
    <div className={styles.relatedLinks}><Link href="/tasks">Open work queue <span aria-hidden="true">→</span></Link><Link href="/approvals">Review approvals <span aria-hidden="true">→</span></Link></div>
  </div>;
}

export function ContactsScreen() {
  const [query, setQuery] = useState("");
  return <div className={`${styles.screen} phone-screen`} data-design-node="42:845">
    <ScreenHeading title="Contacts" description="Communication is consent-first and reviewable." />
    <label className={`${styles.panel} ${styles.search}`}>
      <PhoneIcon screen="contacts" name="imgIconUsers" className={styles.rowIcon} />
      <span className={styles.srOnly}>Search contacts</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts" />
    </label>
    {query.trim() && <p className={styles.searchNotice} role="status">Connect your account to search for “{query.trim()}”.</p>}
    <section className={styles.section} aria-labelledby="selected-contact-heading">
      <h2 id="selected-contact-heading">Selected contact</h2>
      <div className={`${styles.panel} ${styles.contactCard}`}>
        <div className={styles.contactAvatar}><PhoneIcon screen="contacts" name="imgIconUsers" className={styles.rowIcon} /></div>
        <div><h3>No contact selected</h3><p>Your contacts will appear after connecting.</p><span className={styles.status}>Connection required</span></div>
      </div>
    </section>
    <div className={styles.contactActions} aria-label="Contact actions">
      {[{ label: "Call", icon: "imgIconPhone" }, { label: "Text", icon: "imgIconMail" }, { label: "Add AI", icon: "imgIconSpark" }].map((action) => <button key={action.label} type="button" disabled title="Connect and select a contact first">
        <PhoneIcon screen="contacts" name={action.icon} className={styles.toolIcon} /><span>{action.label}</span>
      </button>)}
    </div>
    <section className={styles.section} aria-labelledby="batch-messaging-heading">
      <h2 id="batch-messaging-heading">Safe batch messaging</h2>
      <div className={`${styles.panel} ${styles.permission}`}>
        <PhoneIcon screen="contacts" name="imgIconShield" className={styles.rowIcon} />
        <div><h3>Preview recipients and message</h3><p>Review recipients and permissions before sending.</p><span className={styles.status}>Connection required</span></div>
      </div>
      <Link className={styles.textLink} href="/workspace">Open Workspace connections <span aria-hidden="true">→</span></Link>
    </section>
  </div>;
}
