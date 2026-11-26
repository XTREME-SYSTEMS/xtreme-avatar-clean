import Link from "next/link";
import { MobileIcon } from "@/components/mobile/icons";
import styles from "../mobile.module.css";

const routes = [
  { label: "Video with Eden", detail: "Open Eden’s Tavus room", icon: "video", href: "/mobile/video" },
  { label: "Phone call", detail: "Phone setup", icon: "phone", href: "/mobile/phone" },
  { label: "Message", detail: "SMS, MMS and WhatsApp", icon: "chat", href: "/mobile/messages" },
];
export default function MobileConnect() {
  return <section className={styles.inner} aria-labelledby="connect-title">
    <p className={styles.kicker}>Communications</p>
    <h1 id="connect-title">Connect</h1><p className={styles.sub}>Choose how you’d like to connect.</p>
    <div className={styles.rows}>{routes.map(item =>
      <Link className={styles.row} key={item.href} href={item.href}>
        <span className={styles.round}><MobileIcon name={item.icon}/></span>
        <span><strong>{item.label}</strong><small>{item.detail}</small></span>
        <MobileIcon name="arrow"/>
      </Link>)}</div>
  </section>;
}
