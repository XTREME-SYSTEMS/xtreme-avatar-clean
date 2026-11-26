import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import HomePage from "../page";
import { readAuthConfiguration } from "@/lib/auth/config";
import { readAccount } from "@/lib/auth/account-service";
import { createManagedAuthProvider } from "@/lib/auth/provider";
import { dashboardDestination } from "@/lib/auth/account-navigation";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Dashboard | Xtreme Avatar",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const config = readAuthConfiguration();
  if (!config.configured) {
    return <section className={styles.notice}>
      <h1>Dashboard temporarily unavailable</h1>
      <p>Your workspace connection is not configured yet.</p>
      <Link href="/account">Back to your account</Link>
    </section>;
  }
  const incoming = await headers();
  const provider = createManagedAuthProvider(config.value, incoming.get("cookie"));
  const result = await readAccount(provider, config.value.baseUrl);
  if (result.session.status === "anonymous" || result.session.status === "membership_required" || result.session.status === "access_denied") {
    redirect("/account");
  }
  if (!dashboardDestination(result.session)) {
    return <section className={styles.notice}>
      <h1>Could not verify your workspace</h1>
      <p>Your account and workspace must be available before opening the dashboard. Try refreshing your account.</p>
      <Link href="/account">Check account</Link>
    </section>;
  }
  const workspace = result.session.organizations?.find(x => x.id === result.session.organization?.id)?.name || "Your workspace";
  return <>
    <div className={styles.bar}>
      <div className={styles.identity}><span className={styles.eyebrow}>YOUR DASHBOARD</span>
        <strong>{workspace}</strong>
        <small>Signed in as {result.session.user?.name || "your account"}</small>
      </div>
      <Link href="/account" className={styles.account}>Manage account</Link>
    </div>
    <HomePage />
    <nav className={styles.links} aria-label="Personalize your workspace">
      <Link href="/workspace">Workspace tools</Link>
      <Link href="/settings/communications">Communications settings</Link>
      <Link href="/connections">Connections</Link>
    </nav>
  </>;
}
