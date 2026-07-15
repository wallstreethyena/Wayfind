// Guardrail: the "hours / open-closed" contract (v6.31).
//
// Two live bugs this locks shut, forever:
//  1) The detail sheet sat on "Loading hours…" permanently whenever the extra
//     place-detail fetch failed or returned nothing — because a bare `null` was
//     cached and null reads as "still fetching". The fix caches a resolved
//     sentinel and falls back to the weekday text captured at search time.
//  2) The list card said "Open" while the detail sheet said "Closed", because
//     the list computes open/closed LIVE from the hours periods (liveOpen) while
//     the sheet trusted the stale cached openNow. Open/closed must be computed
//     from the same source everywhere.
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";

const fail = (m) => { console.error("check-hours: FAIL — " + m); process.exit(1); };
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const detail = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
const shell = shellSrc();

// 1) Search results must carry the human weekday text, so the sheet has hours
//    to show without waiting on (or depending on) the second fetch.
if (!google.includes("weekdayDescriptions"))
  fail("lib/google.js no longer captures regularOpeningHours.weekdayDescriptions on search results");

// 2) openDetail must never cache a bare null place-detail (that = perpetual spinner).
//    A resolved sentinel has to be stored when the fetch comes back empty.
if (!/if \(!extra\) extra = \{[^}]*_resolved: true/.test(home))
  fail("openDetail can cache a bare null place-detail — the sheet will hang on 'Loading hours…'");

// 3) The sheet must fall back to the search-time weekday text.
if (!detail.includes("detail.oh.weekdayDescriptions"))
  fail("Detail sheet does not fall back to detail.oh.weekdayDescriptions for hours");

// 4) "Loading hours…" may only show while the fetch is genuinely unresolved
//    (detailExtra === null), never as the resting state.
if (!/detailExtra === null \? "Loading hours…"/.test(detail))
  fail("Detail hours 'Loading…' state is not gated on detailExtra === null");

// 5) The detail header open/closed must be computed live (openState/liveOpen),
//    never straight off the stale cached openNow.
if (!detail.includes("liveOpen(detail)") || !detail.includes("openState"))
  fail("Detail header open/closed is not computed live via liveOpen(detail)");

// 6) liveOpen stays the single source of truth for the open/closed pill.
if (!/function liveOpen\(p\)/.test(shell))
  fail("liveOpen() helper is missing from the shell");

console.log("check-hours: OK — hours never hang, open/closed computed live everywhere");
