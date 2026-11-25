import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/product";

export const metadata = { title: "Communications" };

export default function CommunicationsPage() {
  return <ModulePage module={modules.communications} />;
}
