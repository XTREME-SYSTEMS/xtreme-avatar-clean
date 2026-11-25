import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/product";

export const metadata = { title: "Discovery" };

export default function DiscoveryPage() {
  return <ModulePage module={modules.discovery} />;
}
