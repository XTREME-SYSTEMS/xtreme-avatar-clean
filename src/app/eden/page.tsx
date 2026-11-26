import type { Metadata } from "next";
import Link from "next/link";
import { ChatScreen } from "@/components/chat/chat-screen";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "Eden Skye",
  robots: { index: false, follow: false },
};

export default function EdenHome() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/eden" className={styles.wordmark} aria-label="Xtreme Avatar home">
          Xtreme<span>Avatar</span>
        </Link>
        <nav aria-label="Workspace navigation">
          <Link href="/mobile/work">Workspace</Link>
          <Link href="/account">Account</Link>
        </nav>
      </header>
      <main id="app-content" className={styles.main}>
        <div className={styles.portrait} aria-hidden="true" />
        <div className={styles.conversation}>
          <h1>Eden <i>Skye</i></h1>
          <ChatScreen conversationHome />
        </div>
      </main>
    </div>
  );
}
