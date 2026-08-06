#!/usr/bin/env node
/**
 * check-intro-gate — the welcome/mood overlay's auto-show timing and its
 * once-per-DEVICE flag.
 *
 * WHY THIS EXISTS (2026-08-04). The gate popped 3.2 seconds after landing and
 * once per session. Measured, that cost money: intro_dismissed/intro_shown —
 * the share of people who exited it on purpose rather than abandoning the tab
 * — fell 78% → 73% → 37% → 14% day over day as paid traffic ramped, with
 * site-wide bounce going 22% → 55%. Owner decision: 2 minutes of VISIBLE time,
 * at most once per device, ever.
 *
 * Every one of those is a value or a wiring detail that regresses silently.
 * A timing constant can be halved in a one-line diff that reads like a tidy-up;
 * a `sessionStorage` read can come back because it looks simpler than a helper
 * import; and the manual "Find my vibe" button can be "consistently" gated by
 * the same flag, which DELETES the feature while every existing test stays
 * green. None of those break a page, so nothing goes red on its own.
 *
 * TWO KINDS OF ASSERTION HERE, deliberately:
 *
 *   §A executes lib/introGate.js against stubbed browser storage and asserts
 *      the RETURN VALUES — per CLAUDE.md, where the thing can be run, run it.
 *      A regex over that module would pass on a helper that reads the cookie
 *      and ignores it.
 *
 *   §B is static, over app/home.js, because the trigger lives inside a React
 *      effect that cannot be invoked outside a render. Those assertions are on
 *      syntactic POSITION and named constants, never bare substrings — /120000/
 *      would match a comment.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ---------------------------------------------------------------------------
// §A — RUN the durable helper. Stub just enough browser to be real storage.
// ---------------------------------------------------------------------------
function makeStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    _map: m,
  };
}

// A cookie jar that honours Max-Age/Path/SameSite syntactically the way
// document.cookie does: assignment appends/replaces one pair, reads return the
// whole "a=1; b=2" string.
function makeJar() {
  const jar = new Map();
  return {
    get value() { return [...jar].map(([k, v]) => k + "=" + v).join("; "); },
    set value(s) {
      const [pair] = String(s).split(";");
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    },
    _jar: jar,
  };
}

// A whole fresh "browser". `keep` lets a case simulate a partial clear: which
// of the three stores survive from a previous world.
function installBrowser({ dnt = null, optout = false, keepCookie = null, keepLocal = null } = {}) {
  const local = makeStore();
  const session = makeStore();
  const jar = makeJar();
  if (keepCookie) for (const [k, v] of keepCookie) jar._jar.set(k, v);
  if (keepLocal) for (const [k, v] of keepLocal) local._map.set(k, v);
  if (optout) local.setItem("wf_optout", "1");
  const doc = {};
  Object.defineProperty(doc, "cookie", { get: () => jar.value, set: (s) => { jar.value = s; }, configurable: true });
  const win = { doNotTrack: dnt };
  // node ships a read-only `navigator` getter, so every global goes on by
  // defineProperty rather than assignment.
  const put = (k, v) => Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
  put("window", win);
  put("document", doc);
  put("navigator", { doNotTrack: dnt });
  put("localStorage", local);
  put("sessionStorage", session);
  put("location", { protocol: "https:" });
  return { local, session, jar };
}

const gate = await import(fileURLToPath(new URL("../lib/introGate.js", import.meta.url)));
ok(typeof gate.introSeen === "function" && typeof gate.markIntroSeen === "function",
  "lib/introGate.js must export introSeen() and markIntroSeen()");

// A1. A brand-new device has not seen it; marking it makes introSeen() true.
{
  const w = installBrowser();
  ok(gate.introSeen() === false, "A1: a fresh device must NOT be treated as having seen the gate");
  gate.markIntroSeen();
  ok(gate.introSeen() === true, "A1: after markIntroSeen(), introSeen() must be true in the same session");
  ok(w.jar._jar.has("wf_intro_seen"), "A1: markIntroSeen must write a durable first-party cookie");
  ok(w.local.getItem("wf_intro_seen") !== null, "A1: markIntroSeen must mirror into localStorage");
}

// A2. A NEW SESSION on the same device (sessionStorage gone) still reads true —
// this is the whole point: once ever, not once per session.
{
  const prev = installBrowser();
  gate.markIntroSeen();
  const cookie = [...prev.jar._jar];
  const localRows = [...prev.local._map];
  installBrowser({ keepCookie: cookie, keepLocal: localRows });
  ok(gate.introSeen() === true, "A2: a new SESSION on the same device must still be gated (once ever, not once per session)");
}

// A3. Partial clears: either store alone is enough to remember.
{
  const seed = installBrowser();
  gate.markIntroSeen();
  const cookie = [...seed.jar._jar];
  const localRows = [...seed.local._map];

  installBrowser({ keepCookie: cookie }); // localStorage wiped, cookie kept
  ok(gate.introSeen() === true, "A3: a cleared localStorage must not resurrect the gate — the cookie still remembers");

  installBrowser({ keepLocal: localRows }); // cookies wiped, localStorage kept
  ok(gate.introSeen() === true, "A3: cleared cookies must not resurrect the gate — localStorage still remembers");
}

// A4. Clearing site data DOES reset it. This is the documented escape hatch;
// a helper that could not be reset would be an evercookie, which lib/deviceId's
// header explicitly promises this app does not ship.
{
  installBrowser();
  ok(gate.introSeen() === false, "A4: a full clear of site data must reset the gate (no evercookie behaviour)");
}

// A5. The durable cookie is long-lived, first-party and Secure on https.
{
  const w = installBrowser();
  let written = "";
  Object.defineProperty(globalThis.document, "cookie", {
    get: () => w.jar.value, set: (s) => { written = String(s); w.jar.value = s; }, configurable: true,
  });
  gate.markIntroSeen();
  ok(/wf_intro_seen=/.test(written), "A5: the cookie is named wf_intro_seen");
  ok(/Max-Age=(\d+)/.test(written) && Number(written.match(/Max-Age=(\d+)/)[1]) >= 365 * 24 * 3600,
    "A5: the cookie must outlive a single visit by at least a year");
  ok(/Path=\//.test(written) && /SameSite=Lax/.test(written) && /Secure/.test(written),
    "A5: Path=/, SameSite=Lax and Secure (on https) — the same first-party contract as the device id");
}

// A6. THE OPT-OUT. Do Not Track and wf_optout must both suppress the durable
// write and fall back to session-only. This is the assertion that keeps the
// flag lawful; it is asserted by CALLING, so a helper that reads the opt-out
// and then writes anyway cannot pass.
for (const [label, opts] of [["Do Not Track", { dnt: "1" }], ["wf_optout", { optout: true }]]) {
  const w = installBrowser(opts);
  gate.markIntroSeen();
  ok(!w.jar._jar.has("wf_intro_seen"), `A6: with ${label} set, NO durable cookie may be written`);
  ok(w.local.getItem("wf_intro_seen") === null, `A6: with ${label} set, NO durable localStorage row may be written`);
  ok(w.session.getItem("wf_intro_seen") !== null, `A6: with ${label} set, the SESSION flag is still written — opted out is not "nag me twice per visit"`);
  ok(gate.introSeen() === true, `A6: with ${label} set, the gate is still spent for the rest of THIS session`);
  // ...and a future visit may offer it again. That is the correct trade.
  const cookie = [...w.jar._jar];
  const localRows = [...w.local._map];
  installBrowser({ ...opts, keepCookie: cookie, keepLocal: localRows });
  ok(gate.introSeen() === false, `A6: with ${label} set, a FUTURE visit is not gated — nothing durable was stored`);
}

// A7. Negative control on the whole §A harness: a stub browser where nothing is
// ever written must never report "seen". If this passes while A1 also passes,
// the stubs are actually carrying state rather than always answering one way.
{
  installBrowser();
  ok(gate.introSeen() === false && gate.introSeen() === false,
    "A7: repeated reads without a write must stay false — the stub is not fabricating state");
}

// ---------------------------------------------------------------------------
// §B — the trigger in app/home.js. Static, but on position and named constants.
// ---------------------------------------------------------------------------
const HOME = fileURLToPath(new URL("../app/home.js", import.meta.url));
const rawHome = readFileSync(HOME, "utf8");
// Comments and string-literal contents out first. Five guards on this repo have
// gone green or red on their own explanatory prose; the block comment above
// INTRO_MIN_VISIBLE_MS names every value this file checks.
const home = rawHome
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");

// B1. The delay is a NAMED constant and it is at least two minutes.
const DECL = home.match(/const\s+INTRO_MIN_VISIBLE_MS\s*=\s*(\d+)\s*;/);
ok(!!DECL, "B1: the auto-show delay must be a named constant INTRO_MIN_VISIBLE_MS, not a literal buried in the setTimeout call");
ok(!!DECL && Number(DECL[1]) >= 120000,
  `B1: INTRO_MIN_VISIBLE_MS must be >= 120000 (owner decision 2026-08-04) — found ${DECL ? DECL[1] : "nothing"}`);

// Isolate the auto-show effect so the checks below cannot be satisfied by
// unrelated code elsewhere in this 8000-line file.
//
// A FIXED-LENGTH WINDOW IS NOT AN ISOLATION. The first version of this file
// sliced 4000 characters from the anchor, which ran past the effect's closing
// brace into the NEXT effect — and that next effect both removes a
// visibilitychange listener and touches dialogOpenRef.current, so two B-checks
// below passed on code they were not looking at. Caught by red-proving. The
// window now ENDS at the effect's own terminator, and both ends are asserted.
function sliceEffect(text, anchor) {
  const a = text.indexOf(anchor);
  if (a < 0) return "";
  const end = text.indexOf("}, []);", a);
  return end < 0 ? "" : text.slice(a, end);
}
const EFF_ANCHOR = "const sp0 = new URLSearchParams(landingSearchRef.current);";
ok(home.split(EFF_ANCHOR).length - 1 === 1,
  "B: the intro effect anchor must be unique in home.js — an ambiguous anchor makes every B assertion below meaningless");
const effect = sliceEffect(home, EFF_ANCHOR);
ok(effect.length > 0, "B: could not locate the intro auto-show effect — the anchors below prove nothing");
// Both ends verified: the window must contain the effect's own body and must
// NOT have run on into the dialogOpenRef mirror effect that follows it.
ok(/setIntroOpen\(true\)/.test(effect) && !/dialogOpenRef\.current\s*=/.test(effect),
  "B: the effect window overran into the following effect — narrow it before trusting anything below");

// B2. Visibility-aware, not a bare wall-clock setTimeout.
// Read from the RAW effect window for these two: the event name is a string
// literal, blanked by the strip above. Bounded to the same effect, so the two
// other visibilitychange effects in this file cannot satisfy them.
const rawEffect = sliceEffect(rawHome, EFF_ANCHOR);
ok(/addEventListener\(\s*"visibilitychange"\s*,/.test(rawEffect),
  "B2: the effect must subscribe to visibilitychange — a bare setTimeout greets a returning tab with a modal over unread content");
ok(/removeEventListener\(\s*"visibilitychange"\s*,/.test(rawEffect),
  "B2: the visibilitychange listener must be torn down in the effect's cleanup");
ok(/document\.visibilityState/.test(effect),
  "B2: elapsed time must be accumulated only while the document is visible");
ok(/INTRO_MIN_VISIBLE_MS\s*-\s*accrued\(\)/.test(effect),
  "B2: the timer must arm on REMAINING visible time (INTRO_MIN_VISIBLE_MS - accrued()), not restart from zero");
ok(!/setTimeout\([^,]+,\s*INTRO_MIN_VISIBLE_MS\s*\)/.test(effect),
  "B2: a single unconditional setTimeout(_, INTRO_MIN_VISIBLE_MS) is wall-clock, not visible time");

// B3. The once-ever flag comes from the durable helper, and the old
// sessionStorage read is GONE from the auto-show path.
ok(/import\s*\{[^}]*\bintroSeen\b[^}]*\}\s*from\s*(""|'')/.test(home) || /\bintroSeen\b/.test(home),
  "B3: home.js must import introSeen from lib/introGate");
ok(/if\s*\(\s*introSeen\(\)\s*\)\s*return\s*;/.test(effect),
  "B3: the auto-show must stand down on introSeen() — the durable once-per-device gate");
ok(!/sessionStorage\.getItem\(\s*(""|'')\s*\)\s*\)?\s*\{?[\s\S]{0,40}setTimeout/.test(effect) && !/wf_intro_seen/.test(home),
  "B3: the once-per-SESSION wf_intro_seen read must be gone from home.js (owner decision 2026-08-04 reverses v5.25)");

// B4. Courtesy: stand down after value, defer behind a dialog, bounded retries,
// and claimInterrupt still the last word.
ok(/wf_value_seen/.test(rawHome) && /valueSeen/.test(effect),
  "B4: the gate must stand down once value has been delivered (wf_value_seen)");

// B4b. THE SIGNAL SPLIT (owner decision 2026-08-04). wf_value_seen means
// "opened a place" and NOTHING else. It used to also be written when the
// homepage feed painted — which happens within seconds of every successful
// load, so a gate standing down on it would never fire at all. Re-merging the
// two keys is a one-line "cleanup" that silently retires this whole feature,
// and no other assertion in this file would notice.
const FEED_EFFECT = rawHome.match(/if \(suggested && suggested\.length\)[^\n]*\n/);
ok(!!FEED_EFFECT, "B4b: could not locate the feed-render effect — the split below is unproven");
ok(!!FEED_EFFECT && /sessionStorage\.setItem\("wf_results_seen"/.test(FEED_EFFECT[0]),
  "B4b: the feed-render effect must write wf_results_seen");
ok(!!FEED_EFFECT && !/wf_value_seen/.test(FEED_EFFECT[0]),
  "B4b: the feed painting must NOT set wf_value_seen — it fires within seconds of every load and would suppress the gate on 100% of visits");
// Exactly one writer, and it is the place-open site.
const VS_WRITES = [...rawHome.matchAll(/sessionStorage\.setItem\("wf_value_seen"/g)];
ok(VS_WRITES.length === 1,
  `B4b: wf_value_seen must have exactly ONE writer (opening a place) — found ${VS_WRITES.length}`);
ok(/sessionStorage\.setItem\("wf_value_seen", "1"\); \} catch \(e\) \{\} \/\/ v5\.37: opening a place/.test(rawHome),
  "B4b: the one wf_value_seen writer must be the place-open site");
// The intro reads the STRICT signal only.
ok(!/wf_results_seen/.test(rawEffect),
  "B4b: the intro gate must not read wf_results_seen — browsing the feed is not a reason to withhold the mood picker");
// ...and the giveaway keeps the loose one, so narrowing wf_value_seen did not
// silently shrink a different feature's reach.
ok(/if \(\(!sessionStorage\.getItem\("wf_value_seen"\) && !sessionStorage\.getItem\("wf_results_seen"\)\) \|\| dialogOpenRef\.current\)/.test(rawHome),
  "B4b: the giveaway prompt must retry until EITHER signal is set — its reach must not change as a side effect of the intro decision");
ok(/dialogOpenRef\.current/.test(effect),
  "B4: the gate must not fire over another open dialog");
ok(/INTRO_MAX_RETRIES/.test(effect) && /INTRO_RETRY_MS/.test(effect),
  "B4: deferrals must be bounded by named constants, never an unbounded retry loop");
ok(/if\s*\(!claimInterrupt\(\s*(""|'')\s*\)\)/.test(effect),
  "B4: claimInterrupt must remain the final gate before setIntroOpen(true) — it is what stops two overlays racing");

// B5. Stand-downs are instrumented, or "nobody saw it" and "it is broken" are
// the same shape in PostHog. All four reasons must be wired.
const REASONS = ["value_seen", "dialog_open", "interrupt_claimed", "retries_exhausted"];
// The reasons ARE string literals, blanked by the strip above on purpose, so
// these read the raw effect window — bounded, so a stray "value_seen"
// elsewhere in the file cannot satisfy them.
//
// Assert the standDown HELPER emits, not merely that the event name appears
// somewhere in the effect. Red-proving caught this: deleting the terminal
// emitter left the one-off deferral emitter behind, the event name still
// matched, and every terminal stand-down had silently stopped reporting.
const SD_BODY = rawEffect.match(/const standDown\s*=\s*\([\s\S]*?\n\s{6}\};/);
ok(!!SD_BODY, "B5: a standDown() helper must exist in the effect");
ok(!!SD_BODY && /logEvent\(\s*"intro_stand_down"/.test(SD_BODY[0]),
  "B5: standDown() must emit intro_stand_down — without it a suppressed gate and a broken gate look identical");
ok(!!SD_BODY && /why/.test(SD_BODY[0]) && /visible_ms/.test(SD_BODY[0]) && /attempt/.test(SD_BODY[0]),
  "B5: the stand-down event must carry why/visible_ms/attempt");
for (const r of REASONS) {
  ok(new RegExp('(standDown\\(\\s*"' + r + '"|why:\\s*"' + r + '")').test(rawEffect),
    `B5: stand-down reason "${r}" must be wired`);
}

// B6. ?intro=1 bypasses BOTH gates, and does so BEFORE either is consulted.
const PARAM_AT = effect.indexOf("setIntroOpen(true)");
const SEEN_AT = effect.indexOf("introSeen()");
ok(PARAM_AT > -1 && SEEN_AT > -1 && PARAM_AT < SEEN_AT,
  "B6: the ?intro=1 branch must open the sheet BEFORE introSeen() is consulted (QA/demo door)");
// Bounded and lazy: the param branch's open must be reached within a couple of
// hundred characters of the `sp0.get(...) === ...` test, so this cannot be
// satisfied by the timer path further down the effect.
ok(/get\(\s*(?:""|'')\s*\)\s*===\s*(?:""|'')\s*\)\s*\{[\s\S]{0,300}?setIntroOpen\(true\);\s*return;/.test(effect),
  "B6: the ?intro=1 branch must open immediately and return, skipping the visible-time timer");

// B7. Deep links and paid/campaign traffic still skip the auto-show (6cb95ec).
ok(/const\s+deepLink\s*=/.test(effect) && /const\s+paidVisit\s*=\s*hasAttribution\(parseAttribution\(/.test(effect),
  "B7: deep links and paid/campaign landings must still skip the auto-show");
ok(/if\s*\(\s*deepLink\s*\|\|\s*paidVisit\s*\)\s*return\s*;/.test(effect),
  "B7: the deepLink/paidVisit branch must return before the timer is armed");

// B7b. THE URL MUST BE THE LANDING URL, NOT WHATEVER IS LEFT BY THE TIME THE
// EFFECT RUNS. Caught in browser verification, not by any static check: the ?q
// strip (history.replaceState once `center` is known) is declared EARLIER in
// this component, so on a returning device with a saved location it runs first
// in the same commit. Reading window.location.search inside the auto-show
// effect therefore saw a bare "/" and served the mood gate to deep-link and
// paid visitors — the exact traffic 6cb95ec was written to protect. The query
// is captured during render, which precedes every effect.
ok(/const\s+landingSearchRef\s*=\s*useRef\(/.test(home),
  "B7b: the landing query string must be captured in a ref during render");
ok(/const landingSearchRef = useRef\(typeof window === "undefined" \? "" : window\.location\.search\);/.test(rawHome),
  "B7b: the capture must be SSR-safe (typeof window guard) and read location.search");
ok(/new URLSearchParams\(\s*landingSearchRef\.current\s*\)/.test(effect),
  "B7b: the auto-show effect must parse the CAPTURED landing query, not window.location.search (which an earlier effect may already have stripped)");
ok(/hasAttribution\(parseAttribution\(\s*landingSearchRef\.current\s*\)\)/.test(effect),
  "B7b: the paid/campaign check must read the captured landing query too — utm params are stripped by the same mechanism");
ok(!/window\.location\.search/.test(effect),
  "B7b: no read of window.location.search may remain inside the auto-show effect");

// B8. THE ONE THAT DELETES A FEATURE. The manual "Find my vibe" button opens
// the sheet forever; the once-ever flag gates the AUTO-show only. A gate added
// here would silently remove the only remaining door to this surface, and every
// other assertion in this file would stay green.
const VIBE = rawHome.match(/className="wf-vibe-button"[\s\S]{0,600}?aria-label="Find my vibe"/);
ok(!!VIBE, "B8: the Find my vibe button must exist — it is the only manual door to the mood sheet");
ok(!!VIBE && /setIntroOpen\(true\)/.test(VIBE[0]),
  "B8: the Find my vibe button must open the sheet");
ok(!!VIBE && !/introSeen\(/.test(VIBE[0]),
  "B8: the manual reopen must NOT consult introSeen() — the once-ever flag gates the auto-show only, and gating this deletes the feature");
// Positive control: the probe must be able to SEE a gate if one were added.
ok(/introSeen\(/.test('onClick={() => { if (introSeen()) return; setIntroOpen(true); }}'),
  "PROBE BROKEN: the B8 gate detector failed to flag a known-bad sample");

// B9. intro_shown must carry the new fields, and the manual/param paths must
// label themselves — otherwise every open reads as a timer fire.
ok(/introTriggerRef\.current\s*=\s*\{\s*trigger:\s*"param"/.test(rawHome),
  "B9: the ?intro=1 path must label itself trigger:\"param\"");
ok(/introTriggerRef\.current\s*=\s*\{\s*trigger:\s*"timer"/.test(rawHome),
  "B9: the timer path must label itself trigger:\"timer\"");
ok(/introTriggerRef\.current\s*=\s*\{\s*trigger:\s*"manual"/.test(rawHome),
  "B9: the Find my vibe path must label itself trigger:\"manual\"");

// ---------------------------------------------------------------------------
if (fail.length) {
  console.error("check-intro-gate: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-intro-gate: OK — ${pass} assertions ` +
  `(${DECL[1]}ms named visible-time threshold, visibility accumulator + teardown, ` +
  `durable once-per-device flag EXECUTED against stubbed storage across ` +
  `fresh/new-session/partial-clear/full-clear/DNT/wf_optout, ${REASONS.length} stand-down reasons, ` +
  `?intro=1 + deep-link + paid bypasses, manual reopen proven ungated with a positive control)`
);
