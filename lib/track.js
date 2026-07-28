// lib/track.js — the one-call tracker for surfaces OUTSIDE the app shell.
//
// app/home.js has its own logEvent (PostHog + the Supabase events table + the
// Google bridge). Standalone pages like the paid landing route have no Supabase
// client and no logEvent in scope, so they use this instead.
//
// The contract that matters: ONE call here produces AT MOST one PostHog capture
// and one Google forward. Never call this and logEvent for the same action —
// that is precisely the double-count this indirection exists to prevent.
import { forwardToGoogle } from "./analytics";
import { attributionParams } from "./attribution";
import { noteSessionProgress } from "./activation";

export function track(event, params) {
  if (typeof window === "undefined") return { posthog: false, google: null, session: [] }; // SSR no-op
  const name = typeof event === "string" ? event.trim() : "";
  if (!name) return { posthog: false, google: null, session: [] };
  const attrib = (() => { try { return attributionParams(); } catch (e) { return {}; } })();
  const payload = Object.assign({}, params || {}, attrib);

  let captured = false;
  try {
    if (window.posthog) { window.posthog.capture(name, payload); captured = true; }
  } catch (e) {}

  let google = null;
  try { google = forwardToGoogle(name, payload); } catch (e) {}

  // Session-scoped milestones (first_intent / session_activated). Additive and
  // once-only — they never replace or duplicate the action event above.
  let session = [];
  try { session = noteSessionProgress(name, payload); } catch (e) {}

  return { posthog: captured, google, session };
}
