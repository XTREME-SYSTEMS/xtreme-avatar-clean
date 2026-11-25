import Image from "next/image";

export function Brand() {
  return (
    <div className="brand" aria-label="Xtreme Avatar, XPS Intelligence">
      <Image src="/assets/446a7.svg" alt="" width={59} height={59} priority />
      <span className="brand-copy">
        <strong>XTREME AVATAR</strong>
        <small>XPS INTELLIGENCE</small>
      </span>
    </div>
  );
}
