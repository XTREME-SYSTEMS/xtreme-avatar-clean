"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { CommunicationsBoundary, type WorkspaceView } from "./workspace-boundary";
import { staleCommunicationsAccess } from "@/lib/communications/send-policy";
import { claimMessage, messageStorageKey, releaseMessage, settledReceipts } from "./message-recovery";
import styles from "./composer.module.css";

type Channel = "sms" | "mms" | "whatsapp";
type SendReply = { scopeId?: string; ok:boolean; code?:string; requestId?:string; status?:string };
const channels: {id:Channel;title:string;description:string}[] = [
  {id:"sms",title:"SMS",description:"Verified business sender ending 1174"},
  {id:"mms",title:"MMS",description:"Approved image messaging from the business sender"},
  {id:"whatsapp",title:"WhatsApp",description:"Twilio shared sandbox, testing only"},
];

export function CommunicationsComposer() {
  return <div className={styles.page+" phone-screen"}>
    <header className={styles.heading}>
      <p className={styles.eyebrow}>XTREME AVATAR / COMMUNICATIONS</p>
      <h1>Messages</h1>
      <p>Send a message to a contact who has agreed to hear from your workspace.</p>
    </header>
    <CommunicationsBoundary>{view => <ScopedComposer view={view} />}</CommunicationsBoundary>
  </div>;
}

function ScopedComposer({ view }: { view: WorkspaceView }) {
  const sending = useRef(false);
  const [retry, setRetry] = useState<{ key: string; requestId: string } | null>(null);
  const [channel,setChannel]=useState<Channel>("sms");
  const [selected,setSelected]=useState("");
  const [message,setMessage]=useState("");
  const [mediaUrl,setMediaUrl]=useState("");
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const recipients = view.contacts.filter(c => !c.revokedAt && c.channels.includes(channel));
  const canSend = !pending && recipients.some(x => x.phoneE164 === selected) && !!message.trim() &&
    (channel !== "mms" || !!mediaUrl.trim());
  function changeChannel(next: Channel) { setChannel(next); setSelected(""); setRetry(null); setNotice(""); setError(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || sending.current || !view.current()) return;
    sending.current = true;
    setPending(true); setError(""); setNotice("");
    const envelope = { to: selected, channel, message: message.trim(), mediaUrls: channel === "mms" ? [mediaUrl.trim()] : [] };
    let requestId = "";
    try {
      const key = await messageStorageKey(view.scopeId, envelope);
      if (!view.current()) return;
      if (!navigator.locks) throw new Error("storage");
      const claim = await navigator.locks.request(key, () => claimMessage(localStorage, key));
      requestId = claim.requestId;
      if (!view.current()) return;
      const headers = { "Content-Type": "application/json", "X-Avatar-Scope": view.scopeId };
      if (!claim.fresh && !(retry?.key === key && retry.requestId === requestId)) {
        // A lost reply can mean the provider accepted the first attempt. Read its receipt before doing anything else.
        const receipt = await fetch("/api/communications/send?requestId=" + requestId, { headers, cache: "no-store", credentials: "same-origin" });
        const result = await receipt.json() as SendReply;
        if (!view.current()) return;
        if (staleCommunicationsAccess(result.code)) { view.invalidate(); return; }
        if (!receipt.ok || !result.ok || result.scopeId !== view.scopeId || result.requestId !== requestId) throw new Error("receipt");
        if (result.status && settledReceipts.has(result.status)) {
          releaseMessage(localStorage, key, requestId, "confirmed");
          setRetry(null); setMessage(""); setMediaUrl("");
          setNotice("Previous request " + requestId + " has status " + result.status + ".");
        } else if (result.status === "not_recorded") {
          setRetry({ key, requestId });
          setNotice("No receipt is recorded yet. Submit again only if you want to retry the original request " + requestId + ".");
        } else {
          setNotice("This request is still awaiting confirmation. Check again to refresh its receipt. Request " + requestId);
        }
        return;
      }
      setRetry(null);
      const response = await fetch("/api/communications/send", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers,
        body: JSON.stringify({ ...envelope, requestId }),
      });
      const reply = await response.json() as SendReply;
      if (!view.current()) return;
      if (staleCommunicationsAccess(reply.code)) { view.invalidate(); return; }
      if (response.status === 202 && reply.ok && reply.requestId === requestId) {
        releaseMessage(localStorage, key, requestId, "confirmed");
        setNotice("Message accepted. Request " + requestId);
        setMessage(""); setMediaUrl("");
      } else {
        const rejections: Record<string, string> = {
          SENDING_NOT_CONFIGURED: "The messaging service needs its secure connection.",
          PROVIDER_NOT_READY: "The sender is unavailable for this channel.",
          INVALID_MESSAGE: "Check the recipient, message and media URL.",
          CONSENT_NOT_RECORDED: "This recipient has no recorded consent for the selected channel.",
          RECIPIENT_NOT_AUTHORIZED: "This recipient is unavailable for that channel.",
          WORKSPACE_BUDGET_REACHED: "Your workspace messaging budget has been reached.",
        };
        if (reply.code && Object.hasOwn(rejections, reply.code)) {
          releaseMessage(localStorage, key, requestId, claim.fresh ? "first-rejected" : "retry-rejected");
          setError(rejections[reply.code]);
        } else {
          setError("Delivery is unconfirmed. Submit the same draft to check its receipt. Request " + requestId);
        }
      }
    } catch {
      if (view.current()) setError(requestId
        ? "Delivery is unconfirmed. Submit the same draft to check its receipt. Request " + requestId
        : "Allow secure browser storage to keep a recovery key before sending.");
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  return <>
    <div className={styles.channelGrid} role="group" aria-label="Messaging channel">
      {channels.map(c=><button key={c.id} type="button" disabled={pending} aria-pressed={channel===c.id}
        className={channel===c.id?styles.selected:styles.channel} onClick={()=>changeChannel(c.id)}>
        <strong>{c.title}</strong><small>{c.description}</small></button>)}
    </div>
    {channel==="whatsapp"&&<p className={styles.warning}>WhatsApp is currently available through the Twilio shared sandbox, not a dedicated production sender. The recipient must have joined the sandbox, and WhatsApp messaging rules still apply.</p>}
    <section className={styles.panel}>
      <h2>New {channel.toUpperCase()} message</h2>
      {recipients.length===0?<p className={styles.warning}>No active consented numbers are recorded for {channel.toUpperCase()} in this workspace. <Link href="/settings/communications">Add a consented number</Link> before sending.</p>:null}
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>Recipient
          <select value={selected} onChange={e=>{setSelected(e.target.value);setRetry(null);setNotice("");setError("");}} disabled={pending}>
            <option value="">Choose a consented contact</option>
            {recipients.map(c=><option key={c.id} value={c.phoneE164}>{c.displayName} · {c.phoneE164}</option>)}
          </select>
        </label>
        <label className={styles.field}>Message
          <textarea required minLength={1} maxLength={1600} rows={5}
            value={message} onChange={e=>{setMessage(e.target.value);setRetry(null);setNotice("");setError("");}} disabled={pending}
            placeholder="Write your message…" />
        </label>
        {channel==="mms"&&<label className={styles.field}>Media URL
          <input type="url" required value={mediaUrl} onChange={e=>{setMediaUrl(e.target.value);setRetry(null);setNotice("");setError("");}} disabled={pending}
            placeholder="https://www.xtremeavatar.com/media/…" />
          <small>Use an existing HTTPS media file on xtremeavatar.com under /media/. Upload support will be added separately.</small>
        </label>}
        {notice&&<p className={styles.success} role="status">{notice}</p>}
        {error&&<p className={styles.error} role="alert">{error}</p>}
        <button className={styles.send} type="submit" disabled={!canSend}>{pending?"Checking…":retry?"Retry original request":"Send "+channel.toUpperCase()}</button>
      </form>
    </section>
    <div className={styles.links}>
      <Link href="/settings/communications">Manage consented numbers & preferences</Link>
      <Link href="/dashboard">Back to dashboard</Link>
    </div>
    <p className={styles.fine}>Message acceptance is not the same as carrier delivery. Outbound messages are never sent automatically from this screen.</p>
  </>;
}
