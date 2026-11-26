import type { ReactNode } from "react";

const drawings: Record<string, ReactNode> = {
  eden: <><ellipse cx="12" cy="12" rx="9" ry="5.7" transform="rotate(-45 12 12)"/><circle cx="12" cy="12" r="7.4"/></>,
  connect: <><circle cx="8" cy="8" r="5"/><circle cx="16" cy="16" r="5"/></>,
  work: <><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><rect x="2.5" y="6" width="19" height="14.5" rx="3"/><path d="M3 11q9 5 18 0"/></>,
  audio: <><rect x="9" y="2.5" width="6" height="13" rx="3"/><path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3M8.5 21.5h7"/></>,
  video: <><rect x="2" y="6" width="13.5" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/></>,
  chat: <path d="M4.3 16.5A8.5 8.5 0 1 1 7.5 20l-5 .9z"/>,
  phone: <path d="m6 3 3 4.5-2.1 2.4a15 15 0 0 0 7.1 7.1l2.4-2.1L21 18q.5 2.5-2.4 3.2C11 21 2.5 12.5 2.8 5.2 3 3 4.6 2.5 6 3Z"/>,
  arrow: <path d="m9 6 6 6-6 6"/>,
  back: <path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>,
};
export function MobileIcon({ name }: { name: keyof typeof drawings }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.65"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{drawings[name]}</svg>;
}
