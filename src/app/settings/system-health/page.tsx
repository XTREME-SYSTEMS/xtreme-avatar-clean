import type { Metadata } from "next";
import { ReliabilityPanel } from "@/components/settings/reliability-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "System Health & Autonomy | Xtreme Avatar", robots: { index: false, follow: false } };

export default function Page() { return <ReliabilityPanel />; }
