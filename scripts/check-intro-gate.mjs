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
/* ── B. THE INTRO NEVER AUTO-OPENS (2026-08-06, owner decision) ────────────
 *
 * This section used to assert the SHAPE of an auto-show gate: a named
 * INTRO_MIN_VISIBLE_MS >= 120000, a visibilitychange accumulator so the clock
 * only ran while the page was actually looked at, a bounded retry ladder, an
 * interrupt claim, stand-down telemetry, and deep-link/paid bypasses. All of
 * that existed to make an interruption as polite as an interruption can be.
 *
 * The owner removed the interruption instead. Measured over 14 days, owner
 * excluded: 36 of 58 intro dismissals were the X and only 15 were the CTA —
 * most people closed it rather than used it. An earlier pass had already found
 * the same for paid traffic (dismissal quality fell 78% -> 14% as paid volume
 * ramped) and exempted paid and deep-link visits; this removes the timer for
 * everyone rather than keeping a gate only some visitors escape.
 *
 * The sheet is kept — it moved into the discovery menu, where it is chosen
 * rather than inflicted. So the invariant is now far simpler and far stronger,
 * and these assertions are NOT weaker than the ones they replace: a gate can be
 * subtly wrong in a dozen ways, whereas "no auto-open exists" is a property you
 * can check exhaustively.
 */
const OPENS = [...home.matchAll(/setIntroOpen\(\s*true\s*\)/g)];
ok(OPENS.length === 1,
  `B: setIntroOpen(true) must appear exactly once in home.js — every extra site is a way the sheet can open unbidden (found ${OPENS.length})`);

// The one call must be a user gesture, not an effect. Slice a window around it
// and require an onClick between the enclosing statement and the call.
const OPEN_AT = OPENS.length === 1 ? OPENS[0].index : -1;
const WINDOW = OPEN_AT > -1 ? home.slice(Math.max(0, OPEN_AT - 600), OPEN_AT) : "";
// NOTE ON `home` vs `rawHome`: this guard blanks string CONTENTS, so any
// assertion about a literal must read rawHome. Checking `aria-label="Find my
// vibe"` against `home` would match `aria-label=""` and pass vacuously — the
// exact failure mode this file was written to avoid, one level up.
ok(/onMood=\{\s*\(\)\s*=>/.test(WINDOW) || /onClick=\{/.test(WINDOW),
  "B: the only setIntroOpen(true) must sit in a user-gesture handler (the menu's onMood arrow), not a timer or an effect");
ok(/\]\.map\(\(\[ic, lbl, go\]\)[\s\S]{0,400}?onClick=\{go\}/.test(home),
  "B: the discovery menu must render its rows as onClick — otherwise onMood is never a gesture");
ok(!/useEffect\(/.test(WINDOW.slice(-400)),
  "B: setIntroOpen(true) must not be reachable from inside a useEffect — that is an auto-open by another name");

// No timer may reach it, and the gate's machinery must be gone rather than
// merely unreferenced: a dormant constant invites someone to wire it back.
ok(!/setTimeout\([^)]*setIntroOpen/.test(home),
  "B: no setTimeout may open the intro");
for (const dead of ["INTRO_MIN_VISIBLE_MS", "INTRO_RETRY_MS", "INTRO_MAX_RETRIES", "intro_stand_down"]) {
  ok(!new RegExp("\\b" + dead + "\\b").test(home),
    `B: ${dead} is auto-show machinery and must be gone, not left dormant for someone to re-wire`);
}
ok(!/get\(\s*["']intro["']\s*\)/.test(rawHome),
  "B: the ?intro=1 auto-open door must be gone — a URL that pops the sheet is still a pop-up");

/* ── C. AND IT MUST STILL HAVE A DOOR ──────────────────────────────────────
 * Removing the only entry point is how a surface becomes unreachable — this
 * repo has shipped that exact bug (MenuSheet's five dead sub-states). The
 * sheet moved, so prove the new door exists and is user-visible.
 */
ok(/"What are you feeling\?", onMood/.test(rawHome),
  "C: the discovery menu must carry the mood row");
ok(!/"Date night ideas"/.test(rawHome),
  "C: the Date night ideas row must be gone — it duplicated the date-night hero slide on the same screen");
ok(/onMood=\{/.test(home),
  "C: DiscoveryMenu must be passed an onMood handler, or the row is inert");
ok(/src: "discovery_menu"/.test(rawHome),
  "C: opening from the menu must be attributable, so the move can be measured against the pop-up baseline");
ok(!/aria-label="Find my vibe"/.test(rawHome),
  "C: the old search-bar sparkle must be gone — it was the pop-up's other door");
ok(!/wf-vibe-button/.test(rawHome),
  "C: the sparkle's styling hook must go with it, or the next reader re-adds the button to match the CSS");

if (fail.length) {
  console.error("check-intro-gate: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-intro-gate: OK — ${pass} assertions ` +
  `(the intro NEVER auto-opens: exactly one setIntroOpen(true), inside a user-gesture handler, ` +
  `no setTimeout path, and the gate's machinery — visible-time threshold, retry ladder, ` +
  `stand-down telemetry, ?intro=1 door — is removed rather than left dormant; ` +
  `the sheet still HAS a door in the discovery menu, and the search-bar sparkle is gone; ` +
  `durable once-per-device storage + DNT/opt-out contract unchanged)`
);
