import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/product";

export const metadata = { title: "Lead Finder" };

export default function LeadsPage() {
  return <ModulePage module={modules.leads} />;
}
