import type { Metadata } from "next";
import { ResetPasswordPanel } from "@/components/account/password-recovery-panels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset password | Xtreme Avatar", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ResetPasswordPage() { return <ResetPasswordPanel />; }
