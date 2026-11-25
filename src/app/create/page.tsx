import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/product";

export const metadata = { title: "Create" };

export default function CreatePage() {
  return <ModulePage module={modules.create} />;
}
