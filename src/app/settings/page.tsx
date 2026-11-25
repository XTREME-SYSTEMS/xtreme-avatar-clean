import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/product";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return <ModulePage module={modules.settings} />;
}
