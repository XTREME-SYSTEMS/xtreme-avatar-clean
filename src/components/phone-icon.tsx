import { phoneDesignAssets } from "@/lib/phone-design-assets";

export function PhoneIcon({ screen, name, className, alt = "" }: {
  screen: string; name: string; className?: string; alt?: string;
}) {
  const asset = phoneDesignAssets[screen]?.[name];
  if (!asset) throw new Error(`Missing approved design asset: ${screen}/${name}`);
  // Official locally stored artwork. SVGs keep their intrinsic dimensions.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.src} alt={alt} aria-hidden={alt ? undefined : true} className={className} />;
}
