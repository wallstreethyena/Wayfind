// scripts/test-activation.mjs — prebuild gate for the PRIMARY metric.
//
// "Activated sessions" is the number every experiment on this product will be
// judged by, so the things that would silently corrupt it are pinned here:
//   - it must count a SESSION once, not once per action (no inflated numerator)
//   - a page view / result impression must never count as activation
//   - the definition must stay in lockstep with the affiliate event list
//   - it must be SSR-safe and never throw into a product code path
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { console.error("test-activation: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

const A = await import("../lib/activation.js");
const AN = await import("../lib/analytics.js");

// A Map-backed stand-in for sessionStorage so the once-only logic is testable
// without a browser.
const mkStore = () => { const m = new Map(); return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), _m: m }; };

/* ── the definition ────────────────────────────────────────────────────── */
{
  for (const e of ["detail_open", "save", "signup_completed"]) {
    ok(A.isActivationEvent(e), e + " counts as activation");
  }
  for (const e of AN.AFFILIATE_EVENTS) ok(A.isActivationEvent(e), e + " counts as activation");
  ok(A.ACTIVATION_EVENTS.length === 3 + AN.AFFILIATE_EVENTS.length, "activation set = detail_open + save + signup + all affiliate events");

  // The whole point of the metric: passive things are NOT activation.
  for (const e of ["$pageview", "page_view", "result_count_shown", "hero_impression",
                   "screen_view", "web_vitals", "signup_started", "search", "intent_chip"]) {
    ok(!A.isActivationEvent(e), e + " must NOT count as activation");
  }
  ok(A.isIntentEvent("search") && A.isIntentEvent("intent_chip"), "search/chip count as expressed intent");
  ok(!A.isIntentEvent("detail_open"), "detail_open is activation, not merely intent");

  ok(A.activationKind("signup_completed") === "signup", "signup bucket");
  ok(A.activationKind("tickets_out") === "affiliate", "affiliate bucket");
  ok(A.activationKind("save") === "save", "save bucket");
  ok(A.activationKind("detail_open") === "detail_open", "detail bucket");
}

/* ── once per session, never once per action ───────────────────────────── */
{
  const s = mkStore();
  const a = A.deriveSessionEvents("detail_open", s, 1000);
  ok(a.length === 1 && a[0].name === "session_activated", "first activation emits session_activated");
  ok(a[0].props.trigger === "detail_open", "the trigger is recorded");
  ok(a[0].props.ms_to_activate === 0, "time-to-activate starts at the session's first tracked action");

  const b = A.deriveSessionEvents("save", s, 2000);
  ok(b.length === 0, "a SECOND activation action does not re-activate the session");
  const c = A.deriveSessionEvents("tickets_out", s, 3000);
  ok(c.length === 0, "a third one does not either — the numerator cannot inflate");
}

// Time-to-activate measures from the session's first action, not from the
// activation itself.
{
  const s = mkStore();
  A.deriveSessionEvents("search", s, 5000);          // session starts here
  const act = A.deriveSessionEvents("detail_open", s, 12500);
  ok(act.length === 1, "activation still fires after an earlier intent event");
  ok(act[0].props.ms_to_activate === 7500, "ms_to_activate is measured from session start, got " + act[0].props.ms_to_activate);
}

/* ── first_intent, also once ───────────────────────────────────────────── */
{
  const s = mkStore();
  const a = A.deriveSessionEvents("search", s, 100);
  ok(a.length === 1 && a[0].name === "first_intent", "first intent emits first_intent");
  const b = A.deriveSessionEvents("intent_chip", s, 200);
  ok(b.length === 0, "a second intent action does not re-emit first_intent");

  // An activation action that is also the first thing they do emits BOTH, once.
  const s2 = mkStore();
  const both = A.deriveSessionEvents("detail_open", s2, 0);
  ok(both.length === 1 && both[0].name === "session_activated", "detail_open is activation only (not an intent event)");

  const s3 = mkStore();
  const chipThenOpen = A.deriveSessionEvents("intent_chip", s3, 0).concat(A.deriveSessionEvents("save", s3, 900));
  ok(chipThenOpen.length === 2, "a full intent->activation path emits exactly two milestones");
  ok(chipThenOpen[0].name === "first_intent" && chipThenOpen[1].name === "session_activated", "in order");
}

/* ── passive events never start or trip anything ───────────────────────── */
{
  const s = mkStore();
  const r = A.deriveSessionEvents("result_count_shown", s, 500);
  ok(r.length === 0, "a result impression emits no milestone");
  const p = A.deriveSessionEvents("$pageview", s, 600);
  ok(p.length === 0, "a page view emits no milestone — page depth is not the target");
  ok(!s.get(A.K_ACTIVATED), "the session is still not marked activated");
}

/* ── safety ────────────────────────────────────────────────────────────── */
{
  ok(typeof window === "undefined", "running SSR-like (no window)");
  let threw = null;
  try {
    A.noteSessionProgress("detail_open", { utm_source: "google" });
    A._resetSession();
    A.deriveSessionEvents(null, null, 0);
    A.deriveSessionEvents("", mkStore(), 0);
  } catch (e) { threw = e; }
  ok(!threw, "SSR + garbage input never throws (" + (threw && threw.message) + ")");
  ok(A.noteSessionProgress("detail_open").length === 0, "no sessionStorage on the server => no emission");

  // Campaign shape rides along; click IDs must not.
  const emitted = [];
  const store = mkStore();
  const derived = A.deriveSessionEvents("detail_open", store, 0);
  ok(derived[0].props.gclid === undefined, "no click ID on the milestone event");
}

/* ── wiring: exactly one choke point per surface ───────────────────────── */
{
  const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
  const track = readFileSync(join(ROOT, "lib/track.js"), "utf8");
  ok((home.match(/noteSessionProgress\(/g) || []).length === 1, "home.js calls noteSessionProgress from exactly one place");
  ok((track.match(/noteSessionProgress\(/g) || []).length === 1, "lib/track.js calls it from exactly one place");
  // Both live inside the same function that already captures to PostHog, so a
  // product action can never produce a milestone without its own event.
  // Match the CALL SITE, not the import at the top of the file.
  ok(home.indexOf("noteSessionProgress(action") > home.indexOf("function logEvent"), "the call sits inside logEvent");
}

if (failures) { console.error(`test-activation: ${failures} failure(s)`); process.exit(1); }
console.log("test-activation: OK");
