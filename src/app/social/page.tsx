import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/product";

export const metadata = { title: "Auto Social" };

export default function SocialPage() {
  return <ModulePage module={modules.social} />;
}
