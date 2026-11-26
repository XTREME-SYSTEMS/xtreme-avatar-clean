"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { PhoneIcon } from "@/components/phone-icon";
import styles from "./phone-shell.module.css";

const bottom = [
  { href: "/", label: "Home", icon: "imgIconHome" },
  { href: "/workspace", label: "Workspace", icon: "imgIconLayers" },
  { href: "/create", label: "Create", icon: "imgIconCreate" },
  { href: "/settings", label: "More", icon: "imgIconMore" },
];
const screens: Record<string, string> = {
  "/": "home", "/invention": "ideas", "/opportunity": "opportunity", "/discovery": "opportunity",
  "/video": "video", "/voice": "voice", "/tasks": "tasks", "/finished": "finished",
  "/workspace": "workspace", "/approvals": "approvals", "/contacts": "contacts", "/create": "create",
};
const workRoutes = new Set(["/workspace", "/mail", "/drive", "/calendar", "/contacts", "/tasks", "/maps", "/vault", "/wallet", "/notes", "/security", "/images"]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const focus = pathname === "/video" || pathname === "/create";
  const screen = screens[pathname] ?? "home";
  const chromeScreen = focus ? "home" : screen;
  const active = pathname === "/" ? "/" : workRoutes.has(pathname) ? "/workspace" : pathname === "/create" ? "/create" : "/settings";

  return <div className={`app-frame ${styles.shell} ${focus ? styles.focus : ""}`} data-phone-shell="shared">
    <div className={styles.backdrop} aria-hidden="true">
      <PhoneIcon screen={chromeScreen} name="imgV4BrushedAluminumTextureReusable" className={styles.fiber} />
      <PhoneIcon screen={chromeScreen} name="imgAtmosphereSilverPearlUpperRight" className={styles.upperGlow} />
      <PhoneIcon screen={chromeScreen} name="imgAtmosphereWhiteGraphiteMiddle" className={styles.middleGlow} />
      <PhoneIcon screen={chromeScreen} name="imgAtmosphereSilverLowerBevel" className={styles.lowerGlow} />
      <PhoneIcon screen={chromeScreen} name="imgV4CurvedSilverLightReusable" className={styles.curve} />
    </div>
    <div className={styles.deviceChrome} aria-hidden="true"><span>9:41</span><span className={styles.camera} /><span>▰ ▰ ▰</span></div>
    <header className="topbar">
      <Link href="/" aria-label="Xtreme Avatar home"><Brand /></Link>
      <Link className="profile-link" href="/settings" aria-label="Open More and settings"><PhoneIcon screen="home" name="imgIconUser" /></Link>
    </header>
    <div className="gold-rule" />
    <main className={`main-content ${styles.content}`} id="app-content" key={pathname}>{children}</main>
    {!focus && <nav className="bottom-nav" aria-label="Mobile navigation">
      {bottom.map(item => <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined} className={active === item.href ? "active" : undefined}>
        <PhoneIcon screen={chromeScreen} name={item.icon} /><span>{item.label}</span>
      </Link>)}
    </nav>}
  </div>;
}
