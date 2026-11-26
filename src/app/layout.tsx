import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { VoiceOperator } from "@/components/voice-operator";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Xtreme Avatar",
    template: "%s · Xtreme Avatar",
  },
  description:
    "The clean-room Xtreme Avatar application foundation for AI Avatar, Invention Machine, Lead Finder, and Auto Social.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090b0e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <VoiceOperator><AppShell>{children}</AppShell></VoiceOperator>
      </body>
    </html>
  );
}
