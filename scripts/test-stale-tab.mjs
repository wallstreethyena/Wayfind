// scripts/test-stale-tab.mjs — the stale-tab DECISIONS, asserted.
//
// lib/staleTab.js answers two questions for app/components/VersionWatch.js:
// "did this document come from a cache?" and "would a reload right now cost
// the user something?" Both were previously answered by a comment. One of
// those comments was wrong for three weeks — it claimed a tab that just
// loaded is necessarily the current build — and the cost was the owner
// looking at a bug we had already fixed, twice, on two different days.
//
// So the answers live in a pure module and are checked here.
import { documentMayBeStale, reloadBlockers, IDLE_MS } from "../lib/staleTab.js";

let fails = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.error(`  FAIL ${label}\n    got  ${g}\n    want ${w}`); fails++; }
  else console.log(`  ok   ${label}`);
};

console.log("documentMayBeStale — is this document off the wire or off a shelf?");
eq("no navigation entry at all ⇒ never guess", documentMayBeStale(null), false);
eq("undefined entry ⇒ never guess", documentMayBeStale(undefined), false);
eq("a normal navigation that transferred bytes is fresh",
  documentMayBeStale({ type: "navigate", transferSize: 14320 }), false);
eq("a 304 revalidation still transfers headers, so it is fresh",
  documentMayBeStale({ type: "reload", transferSize: 340 }), false);
eq("zero bytes on the wire ⇒ the browser answered from its own cache",
  documentMayBeStale({ type: "navigate", transferSize: 0 }), true);
eq("back/forward may skip revalidation entirely — THE iOS PATH",
  documentMayBeStale({ type: "back_forward", transferSize: 14320 }), true);
eq("a prerendered document predates the click",
  documentMayBeStale({ type: "prerender", transferSize: 14320 }), true);
eq("a missing transferSize is not treated as zero",
  documentMayBeStale({ type: "navigate" }), false);

console.log("reloadBlockers — what would a reload destroy right now?");
eq("nothing known ⇒ nothing blocking", reloadBlockers({}), []);
eq("no argument at all ⇒ nothing blocking", reloadBlockers(), []);
eq("an open sheet blocks", reloadBlockers({ hasOpenDialog: true }), ["dialog"]);
eq("a focused field blocks", reloadBlockers({ editing: true }), ["editing"]);
eq("a playing creator video blocks", reloadBlockers({ playingMedia: true }), ["media"]);
eq("offline blocks — a reload there delivers the error page, not the fix",
  reloadBlockers({ online: false }), ["offline"]);
eq("online: true is not a blocker", reloadBlockers({ online: true }), []);
eq("a touch one second ago blocks", reloadBlockers({ msSinceInteraction: 1000 }), ["busy"]);
eq("idle past the window does not block",
  reloadBlockers({ msSinceInteraction: IDLE_MS + 1 }), []);
eq("exactly at the window does not block (>= is the line)",
  reloadBlockers({ msSinceInteraction: IDLE_MS }), []);
eq("never touched (Infinity) does not block",
  reloadBlockers({ msSinceInteraction: Infinity }), []);
eq("every reason is reported, not just the first",
  reloadBlockers({ online: false, hasOpenDialog: true, editing: true, playingMedia: true, msSinceInteraction: 0 }),
  ["offline", "dialog", "editing", "media", "busy"]);

console.log("the idle window itself");
if (!(IDLE_MS >= 10000 && IDLE_MS <= 120000)) {
  console.error(`  FAIL IDLE_MS is ${IDLE_MS}ms — outside 10s..120s. Zero means we reload mid-scroll; a minute means the fix never lands.`);
  fails++;
} else console.log(`  ok   IDLE_MS = ${IDLE_MS}ms is inside 10s..120s`);

if (fails) { console.error(`\ntest-stale-tab: ${fails} FAILED`); process.exit(1); }
console.log("\ntest-stale-tab: OK");
