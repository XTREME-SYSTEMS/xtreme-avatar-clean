import type { Metadata } from "next";
import { ForgotPasswordPanel } from "@/components/account/password-recovery-panels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Forgot password | Xtreme Avatar", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ForgotPasswordPage() { return <ForgotPasswordPanel />; }
