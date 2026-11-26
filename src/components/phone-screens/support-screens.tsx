"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PhoneIcon } from "@/components/phone-icon";
import styles from "./support-screens.module.css";

const menu = [
  { title: "Talk to Eden", detail: "Voice conversation", href: "/voice", screen: "home", icon: "imgIconMic1" },
  { title: "Video", detail: "Meet your AI avatar", href: "/video", screen: "home", icon: "imgIconVideo" },
  { title: "Ideas", detail: "Explore your next idea", href: "/invention", screen: "home", icon: "imgIconIdeasRadar" },
  { title: "Opportunity", detail: "Research and next steps", href: "/opportunity", screen: "home", icon: "imgIconIdeasRadar" },
  { title: "Tasks", detail: "Your work queue", href: "/tasks", screen: "home", icon: "imgIconTasks" },
  { title: "Calendar", detail: "Plan your day", href: "/calendar", screen: "home", icon: "imgIconCalendar" },
  { title: "Approvals", detail: "Review and revise", href: "/approvals", screen: "home", icon: "imgIconApproval" },
  { title: "Finished", detail: "Results and deliverables", href: "/finished", screen: "home", icon: "imgIconFinishedResultReceipt" },
  { title: "Contacts", detail: "People and conversations", href: "/contacts", screen: "workspace", icon: "imgIconUsers" },
  { title: "Create", detail: "Your creative canvas", href: "/create", screen: "workspace", icon: "imgIconImage" },
  { title: "Lead Finder", detail: "Find your next customer", href: "/leads", screen: "workspace", icon: "imgIconMap" },
  { title: "Auto Social", detail: "Content and campaigns", href: "/social", screen: "workspace", icon: "imgIconImage" },
  { title: "Communications", detail: "Calls and messages", href: "/communications", screen: "workspace", icon: "imgIconMail" },
  { title: "Connections", detail: "Accounts and permissions", href: "/connections", screen: "workspace", icon: "imgIconShield" },
];

export function MoreScreen() {
  return <div className={`${styles.screen} phone-screen`}>
    <header className={styles.heading}><h1>More</h1><p>All your tools, together.</p></header>
    <div className={styles.menu} aria-label="All app screens">
      {menu.map(item => <Link href={item.href} key={item.href} className={styles.menuItem}>
        <PhoneIcon screen={item.screen} name={item.icon} /><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className={styles.arrow} aria-hidden="true">›</span>
      </Link>)}
    </div>
  </div>;
}

export function ConnectionsScreen() {
  const providers = [
    { name: "Your account", detail: "Sign in to load your own workspace and history." },
    { name: "Eden", detail: "Chat, voice, and shared conversation history." },
    { name: "Google Workspace", detail: "Calendar, contacts, email, and files." },
    { name: "Avatar", detail: "A live video companion for your conversations." },
  ];
  return <div className={`${styles.screen} phone-screen`}>
    <Link className={styles.back} href="/settings">← More</Link>
    <header className={styles.heading}><h1>Connections</h1><p>Your accounts, on your terms.</p></header>
    <p className={styles.notice}>Account setup is still being completed. Your personal data will appear after sign-in is available.</p>
    <div className={styles.stack}>{providers.map(provider => <section className={styles.panel} key={provider.name}>
      <div className={styles.titleRow}><h2>{provider.name}</h2><span className={styles.status}>Setup required</span></div><p>{provider.detail}</p>
    </section>)}</div>
    <Link className={styles.back} href="/workspace">Open Workspace →</Link>
  </div>;
}

const subscribeToCalendar = () => () => {};
const serverCalendarMonth = () => "";
function currentCalendarMonth() { const now = new Date(); return `${now.getFullYear()}:${now.getMonth()}`; }

export function CalendarScreen() {
  const monthStamp = useSyncExternalStore(subscribeToCalendar, currentCalendarMonth, serverCalendarMonth);
  const [offset, setOffset] = useState(0);
  const [day, setDay] = useState<number | null>(null);
  if (!monthStamp) return <div className={`${styles.screen} phone-screen`}><header className={styles.heading}><h1>Calendar</h1><p>Opening your calendar…</p></header></div>;
  const [year, monthIndex] = monthStamp.split(":").map(Number);
  const month = new Date(year, monthIndex + offset, 1);
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(month);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const moveMonth = (delta: number) => { setOffset(value => value + delta); setDay(null); };
  return <div className={`${styles.screen} phone-screen`}>
    <header className={styles.heading}><h1>Calendar</h1><p>Make room for what matters.</p></header>
    <section className={styles.panel} aria-label="Calendar month">
      <div className={styles.monthHeader}><button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button><h2>{label}</h2><button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>›</button></div>
      <div className={styles.calendarGrid} role="group" aria-label={label}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(name => <span className={styles.weekday} key={name}>{name}</span>)}
        {Array.from({ length: month.getDay() }, (_, i) => <span key={`blank-${i}`} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map(date => <button key={date} type="button" aria-label={`${label} ${date}`} aria-pressed={day === date} onClick={() => setDay(date)} className={day === date ? styles.selectedDay : undefined}>{date}</button>)}
      </div>
    </section>
    <section className={`${styles.panel} ${styles.empty}`} role="status">
      <PhoneIcon screen="home" name="imgIconCalendar" />
      <h2>{day ? `Plans for ${month.toLocaleString("en-US", { month: "short" })} ${day}` : "Your plans, in one place"}</h2>
      <p>Connect your calendar to see your appointments.</p><Link href="/connections">View connections →</Link>
    </section>
  </div>;
}

const toolDefinitions = {
  mail: { title: "Mail", subtitle: "Your conversations, organized.", icon: "imgIconMail", copy: "Connect your email account to see your inbox." },
  drive: { title: "Drive", subtitle: "Your files, close at hand.", icon: "imgIconDrive", copy: "Connect Google Drive to browse your files and shared drives." },
  vault: { title: "Vault", subtitle: "Keep your important work together.", icon: "imgIconVault", copy: "Sign in to view your saved resources." },
  maps: { title: "Maps", subtitle: "Explore places and opportunities.", icon: "imgIconMap", copy: "Your places and search results will appear after setup." },
  images: { title: "Images", subtitle: "A home for your visual work.", icon: "imgIconImage", copy: "Your saved images will appear after sign-in." },
  wallet: { title: "Wallet", subtitle: "Your account and usage.", icon: "imgIconWallet", copy: "Sign in to view your own account information." },
  notes: { title: "Keep", subtitle: "Capture what you want to remember.", icon: "imgIconNote", copy: "Connect your account to load your saved notes." },
  security: { title: "Permissions", subtitle: "You decide what Eden can access.", icon: "imgIconShield", copy: "Your connected accounts and permissions will appear after sign-in." },
  leads: { title: "Lead Finder", subtitle: "Find your next customer.", icon: "imgIconMap", copy: "Connect your account to search for businesses and save qualified leads." },
  social: { title: "Auto Social", subtitle: "Your brand, consistently present.", icon: "imgIconImage", copy: "Connect your account to plan content and review campaigns." },
  communications: { title: "Communications", subtitle: "Calls and messages, together.", icon: "imgIconMail", copy: "Connect your account to access your conversations." },
} as const;

export function ToolScreen({ kind }: { kind: keyof typeof toolDefinitions }) {
  const tool = toolDefinitions[kind];
  return <div className={`${styles.screen} phone-screen`}>
    <Link href="/workspace" className={styles.back}>← Workspace</Link>
    <header className={styles.heading}><h1>{tool.title}</h1><p>{tool.subtitle}</p></header>
    <section className={`${styles.panel} ${styles.empty}`}>
      <PhoneIcon screen="workspace" name={tool.icon} /><h2>Make it yours</h2><p>{tool.copy}</p><Link href="/connections">View connections →</Link>
    </section>
    {kind === "images" && <Link href="/create" className={styles.menuItem}><PhoneIcon screen="workspace" name="imgIconImage" /><span><strong>Open creative canvas</strong><small>Explore the image workspace</small></span><span aria-hidden="true">›</span></Link>}
    {kind === "communications" && <div className={styles.stack}><Link className={styles.menuItem} href="/voice"><PhoneIcon screen="home" name="imgIconMic1" /><strong>Voice</strong><span aria-hidden="true">›</span></Link><Link className={styles.menuItem} href="/contacts"><PhoneIcon screen="workspace" name="imgIconUsers" /><strong>Contacts</strong><span aria-hidden="true">›</span></Link></div>}
  </div>;
}
