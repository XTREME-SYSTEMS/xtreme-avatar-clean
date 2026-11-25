import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/product";

export default function HomePage() {
  return <ModulePage module={modules.avatar} />;
}
