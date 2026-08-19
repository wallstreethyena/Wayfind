// check-rail-scroll-reset.mjs — v8.22 (owner, live screenshots on every
// Activities submenu: "the rail for affiliates … starts mid way and it does
// not reset to the beginning … starting with the highest ranked ones and
// notice how some of them have no wayfind score — fix it globally").
//
// ROOT CAUSE the guard locks: UnifiedBrowseCommerceRail's horizontal scroller
// is ONE persistent DOM node across chip/submenu switches. React swaps the
// children; scrollLeft survives. One right-swipe in any submenu left every
// later submenu's rail opened mid-track — and because unscored national deals
// sort last (rightward), the rail APPEARED to lead with unranked cards.
//
// The contract, asserted by ROLE (position in the component body, never a
// bare substring):
//   1. the component holds a lane ref and an effect that zeroes scrollLeft
//      whenever the rail's content identity changes (category, sub-chip, or
//      the top-ranked card), so the rail always opens at its own #1;
//   2. the scroller div actually CARRIES that ref — an effect pointing at a
//      ref no element owns is the classic silent no-op;
//   3. a place-matched deal row carries its quality10 and the card renders it
//      through PlaceScoreChip's governed_score path (the same number its rank
//      uses) — while an unmatched deal keeps NO chip: we never invent a score.
import { readFileSync } from "node:fs";

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  FAIL: " + msg); fails++; } };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

// Scope every assertion to the component body so a matching string elsewhere
// in the 10k-line file can never stand in for the real thing.
const start = home.indexOf("function UnifiedBrowseCommerceRail(");
ok(start !== -1, "UnifiedBrowseCommerceRail exists in app/home.js");
const end = home.indexOf("\nfunction ", start + 10);
const body = start !== -1 ? home.slice(start, end === -1 ? undefined : end) : "";

// 1. the reset effect, keyed on the content identity
ok(/const laneRef = useRef\(null\)/.test(body),
  "browse rail: holds a lane ref for its scroller");
ok(/useEffect\(\(\) => \{ const el = laneRef\.current; if \(el\) el\.scrollLeft = 0; \}, \[browseCat, sub, laneSig\]\)/.test(body),
  "browse rail: zeroes scrollLeft when category, sub-chip or top card changes (the mid-track open bug)");
ok(/const laneSig = \(cards\.length && cards\[0\]\.key\) \|\| ""/.test(body),
  "browse rail: the content signature is the top-ranked card's key");

// 2. the ref is on the scroller element (not orphaned)
ok(/<div ref=\{laneRef\} style=\{\{ display: "flex", gap: 10, overflowX: "auto"/.test(body),
  "browse rail: the horizontal scroller carries laneRef — an unattached ref resets nothing");

// 3. the honest score chip on place-matched deals, in BOTH partner rails
ok(/quality10: dBase > 0 \? dBase : null/.test(body),
  "browse rail: deal rows carry quality10 (the same number their rank uses) — null for national deals");
ok(/card\.quality10 != null \? <PlaceScoreChip p=\{\{ governed_score: Math\.round\(card\.quality10 \* 10\) \}\}/.test(body),
  "browse rail: a place-matched deal renders the Wayfind score chip via governed_score");
const ut = home.indexOf("function UTDealsRail(");
ok(ut !== -1, "UTDealsRail exists in app/home.js");
const utEnd = home.indexOf("\nfunction ", ut + 10);
const utBody = ut !== -1 ? home.slice(ut, utEnd === -1 ? undefined : utEnd) : "";
ok(/d\.quality10 != null && Number\(d\.quality10\) > 0 \? <PlaceScoreChip p=\{\{ governed_score: Math\.round\(Number\(d\.quality10\) \* 10\) \}\}/.test(utBody),
  "UT deals rail: same rule — matched deal shows the score, unmatched shows none");

// Positive control: the component body was actually captured (a slice bug
// would make every regex "pass" against an empty string via the ok() polarity
// below — so prove the body contains a known landmark first).
ok(body.includes("browse_partner_rail"), "positive control: the sliced body is the real browse rail component");
ok(utBody.includes("ut_deal_rail"), "positive control: the sliced body is the real UT deals rail component");

if (fails) { console.error(`check-rail-scroll-reset: ${fails} FAILED`); process.exit(1); }
console.log("check-rail-scroll-reset: OK — 10 assertions; the partner rails open at their own #1 on every content change, and a place-matched deal shows the exact score its rank used (never an invented one)");
