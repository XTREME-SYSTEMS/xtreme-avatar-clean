import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { InstallMobileApp, MobileNavigation } from "@/components/mobile/navigation";
import styles from "./mobile.module.css";

export const metadata: Metadata = {
  title: "Xtreme Avatar Mobile",
  description: "Talk with Eden Skye, open your communications, and work with Eve.",
  manifest: "/mobile.webmanifest",
  icons: { icon: "/mobile-art/icon-192.png", apple: "/mobile-art/icon-192.png" },
  appleWebApp: { capable: true, title: "Xtreme Avatar", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#101112", colorScheme: "dark",
};
export default function MobileLayout({ children }: { children: ReactNode }) {
  return <div className={styles.canvas}><div className={styles.shell}>
    <header className={styles.brandBar}><Link href="/mobile" aria-label="Xtreme Avatar mobile home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mobile-art/xa-mark.svg" alt="" width="26" height="26" />XTREME AVATAR
    </Link><InstallMobileApp /></header>
    <main id="app-content" className={styles.main}>{children}</main>
    <MobileNavigation />
  </div></div>;
}
