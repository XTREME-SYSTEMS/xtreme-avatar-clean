"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { ConsentedNumber } from "@/lib/communications/validation";
import styles from "./composer.module.css";

type Channel = "sms" | "mms" | "whatsapp";
type ContactsReply = { ok:boolean; code?:string; contacts?:ConsentedNumber[] };
type SendReply = { ok:boolean; code?:string; requestId?:string; status?:string };
const channels: {id:Channel;title:string;description:string}[] = [
  {id:"sms",title:"SMS",description:"Verified business sender ending 1174"},
  {id:"mms",title:"MMS",description:"Approved image messaging from the business sender"},
  {id:"whatsapp",title:"WhatsApp",description:"Twilio shared sandbox, testing only"},
];

export function CommunicationsComposer() {
  const [contacts,setContacts]=useState<ConsentedNumber[]>([]);
  const [channel,setChannel]=useState<Channel>("sms");
  const [selected,setSelected]=useState("");
  const [message,setMessage]=useState("");
  const [mediaUrl,setMediaUrl]=useState("");
  const [pending,setPending]=useState(false);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [access,setAccess]=useState("");
  useEffect(() => {
    let mounted=true;
    queueMicrotask(async () => {
      try {
        const reply=await fetch("/api/settings/communications",{credentials:"same-origin",cache:"no-store"});
        const data=await reply.json() as ContactsReply;
        if(!mounted) return;
        if(!reply.ok || !data.ok || !Array.isArray(data.contacts)) setAccess(data.code || "SETTINGS_UNAVAILABLE");
        else setContacts(data.contacts.filter(c=>!c.revokedAt));
      }catch { if(mounted) setAccess("SETTINGS_UNAVAILABLE"); }
      finally{ if(mounted)setLoading(false); }
    });
    return ()=>{mounted=false};
  },[]);
  const recipients=contacts.filter(c=>c.channels.includes(channel));
  const canSend=!loading&&!access&&!pending&&recipients.some(x=>x.phoneE164===selected)&&!!message.trim()&&
    (channel!=="mms"||!!mediaUrl.trim());
  function changeChannel(next:Channel){setChannel(next);setSelected("");setNotice("");setError("");}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canSend)return;
    const requestId=crypto.randomUUID();
    setPending(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/communications/send",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({to:selected,channel,message:message.trim(),
          mediaUrls:channel==="mms"?[mediaUrl.trim()]:[],requestId}),
      });
      const reply=await response.json() as SendReply;
      if(response.status===202&&reply.ok){
        setNotice("Twilio accepted the message request. Carrier delivery is not yet confirmed. Request: "+requestId.slice(0,8));
        setMessage("");setMediaUrl("");
      }else if(reply.code==="SENDING_NOT_CONFIGURED"){
        setError("The secure website-to-Railway messaging connection needs its service key before sending.");
      }else if(reply.code==="PROVIDER_NOT_READY"){
        setError("The sender or provider is not ready for this channel. No delivery was confirmed.");
      }else if(reply.code==="CONSENT_NOT_RECORDED"||reply.code==="RECIPIENT_NOT_AUTHORIZED"){
        setError("This recipient's consent is not recorded for the selected channel.");
      }else if(reply.code==="SEND_OUTCOME_UNKNOWN"){
        setError("The provider outcome is uncertain. Do not resend until the request receipt is checked. Request: "+requestId);
      }else if(reply.code==="REQUEST_ALREADY_SUBMITTED"){
        setError("That request has already been submitted. Check its receipt rather than retry.");
      }else if(reply.code==="WORKSPACE_BUDGET_REACHED"){
        setError("Your workspace's chosen messaging budget has been reached.");
      }else setError("Sending wasn't completed. "+(reply.code||"Please check the connection."));
    }catch{
      setError("The network outcome is unknown. Do not retry blindly. Request: "+requestId);
    }finally{setPending(false);}
  }
  return <div className={styles.page+" phone-screen"}>
    <header className={styles.heading}>
      <p className={styles.eyebrow}>XTREME AVATAR / COMMUNICATIONS</p>
      <h1>Messages</h1>
      <p>Compose from your verified business channels. Every send is recorded against your workspace.</p>
    </header>
    <div className={styles.channelGrid} role="group" aria-label="Messaging channel">
      {channels.map(c=><button key={c.id} type="button" aria-pressed={channel===c.id}
        className={channel===c.id?styles.selected:styles.channel} onClick={()=>changeChannel(c.id)}>
        <strong>{c.title}</strong><small>{c.description}</small></button>)}
    </div>
    {channel==="whatsapp"&&<p className={styles.warning}>WhatsApp is currently available through the Twilio shared sandbox, not a dedicated production sender. The recipient must have joined the sandbox, and WhatsApp messaging rules still apply.</p>}
    <section className={styles.panel}>
      <h2>New {channel.toUpperCase()} message</h2>
      {loading?<p role="status">Checking your authorized workspace…</p>:null}
      {!loading&&access?<p role="alert">Sign in as a workspace owner or administrator to compose messages. <Link href="/account">Open account</Link></p>:null}
      {!loading&&!access&&recipients.length===0?<p className={styles.warning}>No active consented numbers are recorded for {channel.toUpperCase()} in this workspace. <Link href="/settings/communications">Add a consented number</Link> before sending.</p>:null}
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>Recipient
          <select value={selected} onChange={e=>setSelected(e.target.value)} disabled={loading||!!access||pending}>
            <option value="">Choose a consented contact</option>
            {recipients.map(c=><option key={c.id} value={c.phoneE164}>{c.displayName} · {c.phoneE164}</option>)}
          </select>
        </label>
        <label className={styles.field}>Message
          <textarea required minLength={1} maxLength={1600} rows={5}
            value={message} onChange={e=>setMessage(e.target.value)} disabled={pending||!!access}
            placeholder="Write your message…" />
        </label>
        {channel==="mms"&&<label className={styles.field}>Media URL
          <input type="url" required value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)} disabled={pending||!!access}
            placeholder="https://www.xtremeavatar.com/media/…" />
          <small>Use an existing HTTPS media file on xtremeavatar.com under /media/. Upload support will be added separately.</small>
        </label>}
        {notice&&<p className={styles.success} role="status">{notice}</p>}
        {error&&<p className={styles.error} role="alert">{error}</p>}
        <button className={styles.send} type="submit" disabled={!canSend}>{pending?"Submitting…":"Send "+channel.toUpperCase()}</button>
      </form>
    </section>
    <div className={styles.links}>
      <Link href="/settings/communications">Manage consented numbers & preferences</Link>
      <Link href="/dashboard">Back to dashboard</Link>
    </div>
    <p className={styles.fine}>Message acceptance is not the same as carrier delivery. Outbound messages are never sent automatically from this screen.</p>
  </div>;
}
