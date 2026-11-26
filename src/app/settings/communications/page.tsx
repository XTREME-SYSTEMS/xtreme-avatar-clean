import type { Metadata } from "next";
import { CommunicationsSettings } from "@/components/settings/communications-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Communications settings | Xtreme Avatar", robots: { index: false, follow: false } };

export default function CommunicationsSettingsPage() {
  return <CommunicationsSettings />;
}
