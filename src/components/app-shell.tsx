import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";

const bottom = [
  { href: "/", label: "Home", icon: "/assets/205c0.svg" },
  { href: "/workspace", label: "Workspace", icon: "/assets/40391.svg" },
  { href: "/create", label: "Create", icon: "/assets/7a79f.svg" },
  { href: "/settings", label: "More", icon: "/assets/56fad.svg" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <Brand />
        <Link className="profile-link" href="/settings" aria-label="Open settings">
          <Image src="/assets/7a4c4.svg" alt="" width={28} height={28} />
        </Link>
      </header>
      <div className="gold-rule" />
      <main className="main-content">{children}</main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {bottom.map((item) => (
          <Link className={item.href === "/" ? "active" : undefined} href={item.href} key={item.href}>
            <Image src={item.icon} alt="" width={28} height={28} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
