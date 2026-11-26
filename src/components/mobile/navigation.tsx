"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MobileIcon } from "./icons";
import styles from "@/app/mobile/mobile.module.css";

const tabs = [
  { href: "/mobile", name: "Eden", icon: "eden" },
  { href: "/mobile/connect", name: "Connect", icon: "connect" },
  { href: "/mobile/work", name: "Work", icon: "work" },
];

export function MobileNavigation() {
  const path = usePathname();
  const current = path.startsWith("/mobile/work") ? "Work"
    : ["/mobile/connect", "/mobile/phone", "/mobile/messages", "/mobile/video"].includes(path) ? "Connect" : "Eden";
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/xtreme-mobile-sw.js", { scope: "/mobile" }).catch(() => {});
    }
  }, []);
  return <nav className={styles.tabs} aria-label="App navigation">
    {tabs.map(tab => <Link href={tab.href} key={tab.href} aria-current={current === tab.name ? "page" : undefined}>
      <MobileIcon name={tab.icon}/><span>{tab.name}</span>
    </Link>)}
  </nav>;
}

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function InstallMobileApp() {
  const [offer, setOffer] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    function available(event: Event) {
      const prompt = event as InstallPrompt;
      if (typeof prompt.prompt !== "function") return;
      event.preventDefault();
      setOffer(prompt);
    }
    const installed = () => setOffer(null);
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (!offer) return null;
  async function install() {
    if (!offer) return;
    setOffer(null);
    try { await offer.prompt(); await offer.userChoice; }
    catch { /* The browser may revoke its installation offer. */ }
  }
  return <button className={styles.install} type="button" onClick={() => void install()}>Install app</button>;
}
