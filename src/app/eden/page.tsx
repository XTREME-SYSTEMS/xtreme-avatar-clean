import type { Metadata } from "next";
import Link from "next/link";
import { readAuthConfiguration } from "@/lib/auth/config";
import { ChatScreen } from "@/components/chat/chat-screen";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "Eden Skye",
  robots: { index: false, follow: false },
};

export default function EdenHome() {
  const previewWithoutAuth = process.env.VERCEL_ENV === "preview" && !readAuthConfiguration().configured;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/eden" className={styles.wordmark} aria-label="Xtreme Avatar home">
          Xtreme<span>Avatar</span>
        </Link>
        <nav aria-label="Workspace navigation">
          {previewWithoutAuth ? <>
            <a href="https://www.xtremeavatar.com/workspace">Workspace</a>
            <a href="https://www.xtremeavatar.com/account">Account</a>
          </> : <>
            <Link href="/mobile/work">Workspace</Link>
            <Link href="/account">Account</Link>
          </>}
        </nav>
      </header>
      <main id="app-content" className={styles.main}>
        <div className={styles.portrait} aria-hidden="true" />
        <div className={styles.conversation}>
          <h1>Eden <i>Skye</i></h1>
          {previewWithoutAuth ? <div className={styles.handoff}>
            <p>Open your conversation on Xtreme Avatar.</p>
            <a href="https://www.xtremeavatar.com/chat">Continue to chat <span aria-hidden="true">↗</span></a>
          </div> : <ChatScreen conversationHome />}
        </div>
      </main>
    </div>
  );
}
