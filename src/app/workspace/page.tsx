import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/product";

export const metadata = { title: "Workspace" };

export default function WorkspacePage() {
  return <ModulePage module={modules.workspace} />;
}
