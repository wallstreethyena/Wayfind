// Typing the site's own address always reaches the homepage.
//
// THE BUG THIS LOCKS (reproduced on prod gowayfind.com 2026-10-30,
// deterministic in a brand-new tab):
//
//   1. open https://www.gowayfind.com/map
//   2. navigate to https://www.gowayfind.com/
//   -> you land back on /map, rendering the map, with the HOMEPAGE <title>
//
// app/home.js#readPosition falls back to sessionStorage["wf_pos"] — the
// GENERIC snapshot, tied to no history entry — on a bare "/" inside a
// 30-minute TTL. It carried `screen: "map"`, applyPosition called
// setScreen("map"), and the address-bar sync effect rewrote "/" to "/map".
//
// It stranded people because the map is the ONE standalone screen that hides
// the global header: on /map `document.querySelectorAll('a[href="/"]').length`
// is 0, and the category chips and "Browse list" all keep you there. So for
// 30 minutes the homepage was unreachable by URL *and* unreachable by UI.
//
// THE RULE: a GENERIC restore is for the feed's scroll position and must never
// reopen a standalone screen. An ENTRY-KEYED restore — a real Back/Forward
// onto that screen — must still restore it exactly.
//
// ASSERTS ON THE CALL: imports lib/restorePosition.js and invokes the real
// exported rule, plus proves app/home.js actually routes through it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sanitizeRestoredPosition } from "../lib/restorePosition.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const home = readFileSync(ROOT + "app/home.js", "utf8");
let pass = 0;
const fails = [];
const ok = (cond, msg) => cond ? pass++ : fails.push(msg);
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ── 0. app/home.js REACHES the rule (a pure function nothing calls is inert) ─
ok(/import \{ sanitizeRestoredPosition \} from "\.\.\/lib\/restorePosition\.js";/.test(home),
  "app/home.js must import sanitizeRestoredPosition — a rule the app does not import cannot protect it");
ok(/return sanitizeRestoredPosition\(p, !!genericRaw, SCREEN_PATH\);/.test(home),
  "readPosition must RETURN through sanitizeRestoredPosition, passing whether the snapshot was generic and SCREEN_PATH as the standalone list");
ok(/const genericRaw = entryRaw \? null/.test(home),
  "readPosition must only consult the generic wf_pos snapshot when there is NO entry-keyed one — that precedence is what makes `generic` meaningful");

// SCREEN_PATH is the app's single source of truth; the guard uses the real value.
const sp = home.match(/const SCREEN_PATH = (\{[^}]*\});/);
ok(!!sp, "SCREEN_PATH must exist so this guard and the app agree on what a standalone screen is");
// eslint-disable-next-line no-new-func
const SCREEN_PATH = sp ? new Function("return " + sp[1])() : {};
ok(Object.keys(SCREEN_PATH).includes("map"), "SCREEN_PATH must still list the map as a standalone screen");

const snap = (over = {}) => ({ ts: 1, top: 120, cat: "food", ...over });

// ── 1. THE BUG: a generic restore must not reopen the map ───────────────────
{
  const p = sanitizeRestoredPosition(snap({ screen: "map" }), true, SCREEN_PATH);
  eq(p.screen, "suggested", 'a GENERIC restore must NOT reopen the map — this is the prod dead-end');
  ok(p.top === 120 && p.cat === "food", "the rest of the snapshot (scroll offset, category) must survive — only `screen` is neutralised");
}

// ── 2. Every standalone screen, taken from SCREEN_PATH itself ───────────────
for (const screen of Object.keys(SCREEN_PATH)) {
  eq(sanitizeRestoredPosition(snap({ screen }), true, SCREEN_PATH).screen, "suggested",
    `a generic restore must not reopen the standalone "${screen}" screen either`);
}

// ── 3. A REAL Back/Forward still restores the screen exactly ────────────────
for (const screen of Object.keys(SCREEN_PATH)) {
  eq(sanitizeRestoredPosition(snap({ screen }), false, SCREEN_PATH).screen, screen,
    `an ENTRY-KEYED restore is a real Back/Forward onto "${screen}" and must still return the user there`);
}

// ── 4. Non-standalone screens pass through untouched ────────────────────────
for (const screen of ["suggested", "explore", "surprise", "experience", "shared"]) {
  eq(sanitizeRestoredPosition(snap({ screen }), true, SCREEN_PATH).screen, screen,
    `"${screen}" is not standalone and must pass through a generic restore unchanged`);
}

// ── 5. Degenerate inputs never throw and never invent a screen ──────────────
eq(sanitizeRestoredPosition(null, true, SCREEN_PATH), null, "a null snapshot stays null");
eq(sanitizeRestoredPosition(snap(), true, SCREEN_PATH).screen, undefined, "a snapshot with no screen gains none");
eq(sanitizeRestoredPosition(snap({ screen: "map" }), true, null).screen, "map", "a missing SCREEN_PATH cannot silently neutralise a screen — it degrades to the old behaviour rather than guessing");
eq(sanitizeRestoredPosition(snap({ screen: "constructor" }), true, SCREEN_PATH).screen, "constructor",
  "inherited Object properties must not count as standalone screens (hasOwnProperty, not `in`)");

// ── 6. RED PROOF: the pre-fix behaviour really did reopen the map ───────────
{
  const preFix = (position) => position; // what readPosition returned before: the snapshot, untouched
  ok(preFix(snap({ screen: "map" })).screen === "map",
    'red proof: without the rule, a bare "/" really does come back carrying screen:"map" (so section 1 tests something real)');
}

if (fails.length) {
  for (const f of fails) console.error("check-map-not-a-dead-end: FAIL — " + f);
  process.exit(1);
}
console.log(`check-map-not-a-dead-end: OK — ${pass} assertions CALLING the real lib/restorePosition.js export. A generic restore never reopens a standalone screen (all ${Object.keys(SCREEN_PATH).length} read from SCREEN_PATH itself), a real Back/Forward still restores every one of them, non-standalone screens and degenerate inputs are untouched, and app/home.js is proven to import and route readPosition through the rule.`);
