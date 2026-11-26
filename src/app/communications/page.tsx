import type { Metadata } from "next";
import { CommunicationsComposer } from "@/components/communications/composer";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title:"Messages | Xtreme Avatar",robots:{index:false,follow:false} };
export default function Page(){return <CommunicationsComposer />;}
