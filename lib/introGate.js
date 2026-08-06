// lib/introGate.js — "has this device already been offered the mood gate?"
//
// OWNER DECISION 2026-08-04, superseding the v5.25 "once per SESSION" rule.
// The welcome/mood overlay now auto-shows AT MOST ONCE PER DEVICE, EVER. The
// old comment in app/home.js read "the concierge greets each visit but never
// nags within one"; measured, that greeting was costing money —
// intro_dismissed/intro_shown (the share of people who exited the gate on
// purpose rather than abandoning the tab) fell 78% → 73% → 37% → 14% day over
// day while site-wide bounce went 22% → 55%. A full-screen modal on a repeat
// visit is a nag, not a concierge. If you are here because "the intro stopped
// showing on my second visit" looks like a bug: it is the intent. The manual
// "Find my vibe" button (logEvent "intro_reopen") opens it on demand, forever.
//
// STORAGE. This reuses lib/deviceId.js's first-party primitives rather than
// re-implementing them — that module's header warns about exactly this: "a
// second implementation quietly drifting from the opt-out contract". Same
// shape as the device id: a long-lived first-party cookie MIRRORED into
// localStorage, so a partial clear of either store does not lose the value,
// and a full "clear site data" resets it (which is the documented escape
// hatch for a visitor who wants the gate back).
//
// WHAT IS STORED. A timestamp. This is a functional UI preference, not an
// analytics identifier — it says "this browser has been shown the gate", it
// does not identify a person and is never joined to one.
// Explicit .js extension so scripts/check-intro-gate.mjs can import and RUN
// this module under plain node — the guard asserts on return values, not on
// this file's source text, and node ESM will not resolve an extensionless path.
import { wfOptedOut, readWfCookie, writeWfCookie } from "./deviceId.js";

const WF_INTRO_KEY = "wf_intro_seen";
const WF_INTRO_MAXAGE = 2 * 365 * 24 * 3600; // 2 years, same as the device cookie

// True if the auto-show has already been spent on this device (or, for an
// opted-out visitor, already spent in this session). Callers must treat a
// `true` as "do not AUTO-show" — never as "do not open at all".
export function introSeen() {
  try {
    if (typeof window === "undefined") return true; // SSR: never auto-show
    // The session flag is written for everyone, opted out or not, so it is the
    // first thing checked and the only thing an opted-out visitor has.
    try { if (sessionStorage.getItem(WF_INTRO_KEY)) return true; } catch (e) {}
    // Opted out: no durable record exists by design, so the session flag above
    // was the whole answer. They may be offered the gate again on a future
    // visit — the correct trade for someone who asked not to be tracked.
    if (wfOptedOut()) return false;
    try { if (localStorage.getItem(WF_INTRO_KEY)) return true; } catch (e) {}
    return !!readWfCookie(WF_INTRO_KEY);
  } catch (e) { return false; }
}

// Spend the auto-show. Called from every path that closes the sheet, so a
// visitor who saw it once — however they left it — is not asked again.
export function markIntroSeen() {
  try {
    if (typeof window === "undefined") return;
    // Session-only for an opted-out visitor: they still are not nagged twice
    // inside one visit, but nothing durable is written for them.
    try { sessionStorage.setItem(WF_INTRO_KEY, "1"); } catch (e) {}
    if (wfOptedOut()) return;
    const stamp = String(Date.now());
    try { localStorage.setItem(WF_INTRO_KEY, stamp); } catch (e) {}
    writeWfCookie(WF_INTRO_KEY, stamp, WF_INTRO_MAXAGE); // mirrored, survives a partial clear
  } catch (e) {}
}
