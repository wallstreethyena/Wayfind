"use client";
// "Log your visit" on a standalone event page (/florida-events/[slug]). The
// page is server rendered with no member context, so this wrapper reads the
// session itself. Signed out: the card's Sign in uses the site's own sign in
// door (the header .wf-signin-button) and the card is not shown at all when the
// page has no such door, so there is never a dead button.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../../lib/supabase";

const LogVisitCard = dynamic(() => import("./LogVisitCard"), { ssr: false, loading: () => null });

function signInDoor() {
  try { return document.querySelector(".wf-signin-button"); } catch { return null; }
}

export default function EventLogVisit({ eventId, eventName = "" }) {
  const [state, setState] = useState({ ready: false, user: null, door: false });
  useEffect(() => {
    let dead = false;
    const door = !!signInDoor();
    if (!supabase) { setState({ ready: true, user: null, door }); return undefined; }
    supabase.auth.getSession().then(({ data }) => {
      if (!dead) setState({ ready: true, user: (data && data.session && data.session.user) ? { id: data.session.user.id } : null, door });
    }).catch(() => { if (!dead) setState({ ready: true, user: null, door }); });
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (!dead) setState((s) => ({ ...s, ready: true, user: session && session.user ? { id: session.user.id } : null }));
    });
    return () => { dead = true; try { sub && sub.data && sub.data.subscription && sub.data.subscription.unsubscribe(); } catch {} };
  }, []);
  if (!eventId || !state.ready) return null;
  if (!state.user && !state.door) return null;
  return (
    <div style={{ margin: "14px 0" }}>
      <LogVisitCard refKind="event" refId={eventId} placeName={eventName} user={state.user}
        onSignIn={() => { const d = signInDoor(); if (d) { try { d.click(); } catch {} } }} />
    </div>
  );
}
