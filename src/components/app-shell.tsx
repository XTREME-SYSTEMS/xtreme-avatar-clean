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
const workRoutes = new Set(["/workspace", "/mail", "/drive", "/calendar", "/contacts", "/tasks", "/maps", "/vault", "/wallet", "/notes", "/security", "/images", "/approvals", "/finished"]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const focus = pathname === "/video" || pathname === "/create";
  const workspace = workRoutes.has(pathname) || pathname.startsWith("/approvals/");
  const active = pathname === "/" || pathname === "/dashboard" ? "/" : workspace ? "/workspace" : pathname === "/create" ? "/create" : "/settings";

  return <div className={`app-frame ${styles.shell} ${focus ? styles.focus : ""}`} data-app-shell="responsive">
    <a className={styles.skip} href="#app-content">Skip to content</a>
    <header className="topbar">
      <Link href="/" aria-label="Xtreme Avatar home"><Brand /></Link>
      <Link className="profile-link" href="/account" aria-label="Open your account and workspace"><PhoneIcon screen="home" name="imgIconUser" /></Link>
    </header>
    <main className={`main-content ${styles.content}`} id="app-content" tabIndex={-1} key={pathname}>{children}</main>
    {!focus && <nav className="bottom-nav" aria-label="App navigation">
      {bottom.map(item => <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined} className={active === item.href ? "active" : undefined}>
        <PhoneIcon screen="home" name={item.icon} /><span>{item.label}</span>
      </Link>)}
    </nav>}
  </div>;
}

