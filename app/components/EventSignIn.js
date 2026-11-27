"use client";
// app/components/EventSignIn.js - the header "Sign in" on event pages
// (premium polish pass, 2026-11-27). Both event routes (/florida-events/[slug]
// and /events/[city]/[slug]) are server pages with no member context, and they
// had no way to sign in at all, so a reader who arrived from a shared link
// could save an event but never sync it.
//
// Same look as the homepage header pill (.wf-signin-button, app/home.js). The
// sign in sheet itself lives in the app shell, so the pill links to
// /favorites?return=<this event> (lib/authReturn.js): the shell opens sign in
// and, once it succeeds, sends the reader straight back to this event page.
// Because it carries the .wf-signin-button class, EventLogVisit's card finds
// it as the page's sign in door too.
//
// Signed in, it becomes "Your saves" and opens the saved screen. Server HTML
// always carries the signed-out pill; the session is read in the browser.
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { signInUrlWithReturn } from "../../lib/authReturn.js";
// The homepage pill's colors (kit.js C.border / C.card / C.light), copied as
// literals so this small client island does not pull kit.js (score, Google,
// price helpers) into every event page bundle.
const C = { border: "#2D3748", card: "#1C2230", light: "#CBD5E1" };

const PILL = {
  flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
  border: "1px solid " + C.border, background: C.card, color: C.light, fontSize: 12, fontWeight: 700,
  textDecoration: "none", whiteSpace: "nowrap", lineHeight: 1.2, minHeight: 32, boxSizing: "border-box",
};

function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" /><path d="M5.5 19.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
    </svg>
  );
}

export default function EventSignIn({ returnPath }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!supabase) return undefined;
    let dead = false;
    supabase.auth.getSession()
      .then(({ data }) => { if (!dead) setSignedIn(!!(data && data.session && data.session.user)); })
      .catch(() => {});
    const sub = supabase.auth.onAuthStateChange((_e, session) => { if (!dead) setSignedIn(!!(session && session.user)); });
    return () => { dead = true; try { sub && sub.data && sub.data.subscription && sub.data.subscription.unsubscribe(); } catch {} };
  }, []);
  if (signedIn) {
    return <a href="/favorites" className="wf-event-account" data-event-account="saves" style={PILL}><PersonIcon />Your saves</a>;
  }
  return (
    <a href={signInUrlWithReturn(returnPath)} className="wf-signin-button" data-event-account="signin" aria-label="Sign in" title="Sign in" style={PILL}>
      <PersonIcon />Sign in
    </a>
  );
}
