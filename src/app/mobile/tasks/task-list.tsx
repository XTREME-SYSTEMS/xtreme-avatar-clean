"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Task } from "@/lib/tasks/handler";
import styles from "./tasks.module.css";

type View = "loading" | "ready" | "sign-in" | "workspace" | "unavailable";
export function TaskList() {
  const [view, setView] = useState<View>("loading");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef<Task | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const stop = new AbortController();
    fetch("/api/tasks", { cache: "no-store", signal: stop.signal }).then(async response => {
      if (stop.signal.aborted) return;
      if (response.status === 401) { setView("sign-in"); return; }
      if (response.status === 403) { setView("workspace"); return; }
      if (!response.ok) { setView("unavailable"); return; }
      const data = await response.json();
      if (stop.signal.aborted) return;
      if (!Array.isArray(data.tasks)) { setView("unavailable"); return; }
      setTasks(data.tasks);
      setView("ready");
    }).catch(() => { if (!stop.signal.aborted) setView("unavailable"); });
    return () => stop.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view !== "ready" || !title.trim() || busy.current) return;
    busy.current = true;
    setSaving(true);
    setNotice("");
    try {
      const input = pending.current?.title === title.trim() ? pending.current : { id: crypto.randomUUID(), title: title.trim() };
      pending.current = input;
      const response = await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (response.status === 401 || response.status === 403) {
        setTasks([]);
        setView(response.status === 401 ? "sign-in" : "workspace");
        return;
      }
      if (!response.ok) throw new Error("save not confirmed");
      const { task } = await response.json();
      if (task?.id !== input.id || task?.title !== input.title) throw new Error("save not confirmed");
      setTasks(previous => [task, ...previous.filter(t => t.id !== task.id)]);
      setTitle("");
      pending.current = null;
      setNotice("Task saved.");
    } catch { setNotice("I couldn’t confirm the save. Retry without changing the title to avoid a duplicate."); }
    finally { busy.current = false; setSaving(false); }
  }

  return <section className={styles.tasks} aria-labelledby="tasks-title">
    <Link className={styles.back} href="/mobile/work">← Work</Link>
    <h1 id="tasks-title">My tasks</h1>
    <p>Tasks are private to you in the workspace you’re signed into.</p>
    {view === "loading" && <p role="status">Checking your workspace…</p>}
    {view === "unavailable" && <p role="status">Task storage isn’t available in this environment. Nothing was saved.</p>}
    {(view === "sign-in" || view === "workspace") && <p>
      <Link className={styles.back} href="/account">{view === "sign-in" ? "Sign in to Xtreme Avatar" : "Check your verified workspace"}</Link>
      {" "}then return to My tasks.
    </p>}
    {view === "ready" && <>
      <form onSubmit={save} className={styles.form}>
        <label htmlFor="new-task">New task</label>
        <input id="new-task" value={title} maxLength={160} required disabled={saving}
          onChange={event => setTitle(event.target.value)} placeholder="What needs doing?" />
        <button type="submit" disabled={saving || !title.trim()}>{saving ? "Saving…" : "Save task"}</button>
      </form>
      <p role="status">{notice}</p>
      {tasks.length ? <ul className={styles.list}>{tasks.map(task => <li key={task.id}>{task.title}</li>)}</ul> : <p>No saved tasks yet.</p>}
    </>}
  </section>;
}
