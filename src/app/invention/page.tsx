import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/product";

export const metadata = { title: "Invention Machine" };

export default function InventionPage() {
  return <ModulePage module={modules.invention} />;
}
