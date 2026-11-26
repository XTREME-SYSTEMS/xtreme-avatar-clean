import type { Metadata } from "next";
import { AccountPanel } from "@/components/account/account-panel";
import { readAuthConfiguration } from "@/lib/auth/config";

export const metadata: Metadata = { title: "Your account | Xtreme Avatar" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ auth_error?: string; auth_return?: string }> }) {
  const query = await searchParams;
  return <AccountPanel configured={readAuthConfiguration().configured} googleError={query.auth_error === "google"} googleReturn={query.auth_return === "google"} />;
}
