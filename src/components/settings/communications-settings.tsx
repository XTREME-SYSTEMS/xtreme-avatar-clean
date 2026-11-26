"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EMPTY_PREFERENCES, type ConsentChannel, type ConsentedNumber, type MessagingPreferences } from "@/lib/communications/validation";
import styles from "./communications-settings.module.css";

type Load = { ok: boolean; code?: string; preferences?: MessagingPreferences; contacts?: ConsentedNumber[] };
type Draft = {
  displayName: string; phoneE164: string; purpose: "account" | "transactional" | "marketing" | "voice";
  channels: ConsentChannel[]; evidenceNote: string; revision: number;
};
const blank: Draft = { displayName: "", phoneE164: "", purpose: "transactional", channels: ["sms"], evidenceNote: "", revision: 0 };
const labels: Record<ConsentChannel,string> = { sms: "SMS", mms: "MMS", whatsapp: "WhatsApp", voice: "Voice" };

async function request(action: string, data: unknown): Promise<{ ok: boolean; code?: string }> {
  const response = await fetch("/api/settings/communications", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  const result = await response.json() as { ok?: boolean; code?: string };
  return { ok: response.ok && result.ok === true, code: result.code };
}

export function CommunicationsSettings() {
  const [loading,setLoading] = useState(true);
  const [access,setAccess] = useState<string | null>(null);
  const [prefs,setPrefs] = useState<MessagingPreferences>(EMPTY_PREFERENCES);
  const [budget,setBudget] = useState("");
  const [contacts,setContacts] = useState<ConsentedNumber[]>([]);
  const [draft,setDraft] = useState<Draft>(blank);
  const [attested,setAttested] = useState(false);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [error,setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/communications", { cache:"no-store", credentials:"same-origin" });
      const result = await response.json() as Load;
      if (!response.ok || !result.ok || !result.preferences || !Array.isArray(result.contacts)) {
        setAccess(result.code ?? "SETTINGS_UNAVAILABLE");
        return;
      }
      setAccess(null);
      setPrefs(result.preferences);
      setBudget(result.preferences.desiredDailyLimit === null ? "" : String(result.preferences.desiredDailyLimit));
      setContacts(result.contacts);
    } catch { setAccess("SETTINGS_UNAVAILABLE"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const limit = budget.trim() ? Number(budget) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 1000000)) {
      setError("Enter a daily preference between 1 and 1,000,000 or leave it blank for no app-level cap.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request("preferences", { ...prefs, desiredDailyLimit:limit });
      if (!result.ok) { setError(result.code === "SETTINGS_CHANGED_REFRESH" ? "Someone updated these settings. Refresh and review before saving." : "The settings could not be saved."); return; }
      setNotice("Workspace preferences saved to Neon. Provider configuration was not changed.");
      await load();
    } catch { setError("The settings request could not be completed."); }
    finally { setBusy(false); }
  }

  async function saveConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attested) { setError("Confirm that you have appropriate consent evidence for these channels."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request("consent", { ...draft, consentedAt: new Date().toISOString() });
      if (!result.ok) {
        setError(result.code === "SETTINGS_CHANGED_REFRESH"
          ? "That number has been updated. Refresh and review it before changing consent."
          : result.code === "INVALID_CONSENT" ? "Check the number, channels and evidence note." : "Consent record could not be saved.");
        return;
      }
      setDraft(blank); setAttested(false);
      setNotice("The number and owner-attested consent details were saved to Neon. No message was sent.");
      await load();
    } catch { setError("The consent request could not be completed."); }
    finally { setBusy(false); }
  }

  async function revoke(contact: ConsentedNumber) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request("revoke", { phoneE164:contact.phoneE164, revision:contact.revision });
      if (!result.ok) { setError("Could not record revocation. Refresh and try again."); return; }
      setNotice("Consent revoked in Xtreme Avatar's Neon records. Verify provider suppression lists separately.");
      await load();
    } catch { setError("The revocation request could not be completed."); }
    finally { setBusy(false); }
  }

  function edit(contact: ConsentedNumber) {
    setDraft({ displayName:contact.displayName, phoneE164:contact.phoneE164, purpose:contact.purpose,
      channels:contact.channels, evidenceNote:contact.evidenceNote, revision:contact.revision });
    setAttested(false); setError(""); setNotice("Review or update the consent evidence before saving this number.");
  }
  function toggleChannel(channel: ConsentChannel, checked: boolean) {
    setDraft(prev => ({ ...prev, channels: checked
      ? [...prev.channels.filter(c => c !== channel),channel]
      : prev.channels.filter(c => c !== channel) }));
  }
  return <div className={styles.screen + " phone-screen"}>
    <Link href="/settings" className={styles.topLink}>More / Settings</Link>
    <header className={styles.heading}><span>XTREME AVATAR</span><h1>Communications settings</h1>
      <p>Manage your workspace&apos;s channel preferences and consented numbers without changing code.</p></header>
    {loading && <div className={styles.panel} role="status"><p>Checking your workspace settings…</p></div>}
    {!loading && access && <section className={styles.panel}>
      <h2>Account access required</h2>
      <p>{access === "SETTINGS_DATABASE_NOT_CONFIGURED" ? "Neon settings storage is still being connected." :
        access === "ADMIN_ACCESS_REQUIRED" ? "Only a workspace owner or administrator can edit these settings." :
        "Sign in and choose an authorized workspace before editing communications."}</p>
      <Link className={styles.topLink} href="/account">Open account</Link>
      <button className={styles.minor} onClick={() => void load()}>Check again</button>
    </section>}
    {!loading && !access && <>
      {notice && <p className={styles.saved} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <section className={styles.panel}>
        <div className={styles.sectionHead}><h2>Channels & operations</h2><span className={styles.pill}>Neon workspace</span></div>
        <p className={styles.notice}>These are saved application preferences, not activation of Twilio, Neon phone login, or WhatsApp. Provider delivery and the existing Call Desk quota are checked separately.</p>
        <form className={styles.form} onSubmit={savePreferences}>
          <label className={styles.check}><input type="checkbox" checked={prefs.smsPreferred} onChange={e => setPrefs(p => ({...p,smsPreferred:e.target.checked}))} />Prefer SMS messaging</label>
          <label className={styles.check}><input type="checkbox" checked={prefs.mmsPreferred} onChange={e => setPrefs(p => ({...p,mmsPreferred:e.target.checked}))} />Prefer MMS / image messaging</label>
          <label className={styles.check}><input type="checkbox" checked={prefs.whatsappPreferred} onChange={e => setPrefs(p => ({...p,whatsappPreferred:e.target.checked}))} />Prefer WhatsApp when provider approval is complete</label>
          <label className={styles.field}>Desired daily message budget
            <input type="number" min={1} max={1000000} step={1} inputMode="numeric" placeholder="No app-level cap" value={budget} onChange={e => setBudget(e.target.value)} /></label>
          <p className={styles.hint}>Blank means no additional app-level message cap. It does not remove Twilio, Meta, registration, billing, consent or Call Desk transport restrictions.</p>
          <button className={styles.btn} type="submit" disabled={busy}>Save channel preferences</button>
        </form>
      </section>
      <section className={styles.panel}>
        <div className={styles.sectionHead}><h2>Consented numbers</h2><span className={styles.pill}>{contacts.length} records</span></div>
        <p>Record who has agreed to be contacted, the channel and why. Changes stay within the signed-in Neon workspace.</p>
        <div className={styles.form}>
          {contacts.length === 0 && <p className={styles.hint}>No numbers recorded in this workspace. Existing legacy contacts are not imported automatically.</p>}
          {contacts.map(contact => <article className={styles.contact} key={contact.id}>
            <div className={styles.contactHeader}><div><strong>{contact.displayName}</strong><small>{contact.phoneE164}</small></div><span className={styles.pill}>{contact.revokedAt ? "Revoked" : "Recorded"}</span></div>
            <small>{contact.channels.map(ch => labels[ch]).join(", ")} · {contact.purpose}</small>
            <small>Owner-recorded evidence: {contact.evidenceNote}</small>
            <div className={styles.contactActions}>
              <button className={styles.minor} type="button" disabled={busy} onClick={() => edit(contact)}>Edit</button>
              {!contact.revokedAt && <button className={styles.minor + " " + styles.danger} type="button" disabled={busy} onClick={() => void revoke(contact)}>Revoke consent</button>}
            </div>
          </article>)}
        </div>
      </section>
      <section className={styles.panel}>
        <h2>{draft.revision ? "Update consent record" : "Add consented number"}</h2>
        <form className={styles.form} onSubmit={saveConsent}>
          <label className={styles.field}>Contact label<input required maxLength={80} value={draft.displayName} onChange={e=>setDraft(d=>({...d,displayName:e.target.value}))} placeholder="Business contact" /></label>
          <label className={styles.field}>Phone number (international E.164)<input required type="tel" placeholder="+15551234567" pattern="\+[1-9][0-9]{7,14}" value={draft.phoneE164} onChange={e=>setDraft(d=>({...d,phoneE164:e.target.value}))} /></label>
          <label className={styles.field}>Consent purpose<select value={draft.purpose} onChange={e=>setDraft(d=>({...d,purpose:e.target.value as Draft["purpose"]}))}>
            <option value="account">Account / authentication</option><option value="transactional">Transactional / service</option><option value="marketing">Marketing</option><option value="voice">Voice calls</option>
          </select></label>
          <fieldset className={styles.form}><legend>Consented channels</legend>
            <div className={styles.grid}>{(["sms","mms","whatsapp","voice"] as const).map(channel =>
              <label className={styles.check} key={channel}><input type="checkbox" checked={draft.channels.includes(channel)} onChange={e=>toggleChannel(channel,e.target.checked)} />{labels[channel]}</label>)}</div>
          </fieldset>
          <label className={styles.field}>Consent evidence and date or circumstances
            <textarea required minLength={8} maxLength={500} value={draft.evidenceNote} onChange={e=>setDraft(d=>({...d,evidenceNote:e.target.value}))}
              placeholder="When, where and how this person agreed to these communications" /></label>
          <label className={styles.check}><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)} required />I confirm this number has the recorded consent for the selected channels.</label>
          <p className={styles.hint}>The app records the attestation time. It does not independently verify consent or override a Twilio/Meta opt-out.</p>
          <div className={styles.contactActions}>
            <button className={styles.btn} disabled={busy || !attested || draft.channels.length===0} type="submit">{busy ? "Saving…" : "Save number & consent"}</button>
            {draft.revision > 0 && <button className={styles.minor} type="button" onClick={()=>{setDraft(blank);setAttested(false);}} disabled={busy}>Cancel edit</button>}
          </div>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>Other controls</h2>
        <div className={styles.grid}><Link className={styles.topLink} href="/account">Account & sign-in</Link><Link className={styles.topLink} href="/connections">Integrations</Link><Link className={styles.topLink} href="/communications">Messages</Link><Link className={styles.topLink} href="/voice">Voice</Link></div>
        <p className={styles.hint}>Phone login, sending, WhatsApp sender approval and provider quotas will appear as effective controls only after their service connections are verified.</p>
      </section>
    </>}
  </div>;
}
