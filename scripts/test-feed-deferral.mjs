// scripts/test-feed-deferral.mjs — locks the INP fix for direct place landings.
//
// Field p75 mobile INP was 430ms (good <= 200ms), dominated by INPUT DELAY on
// /p/{id}: that route renders <Home initialPlaceId=...>, so the whole home feed
// mounted and fetched underneath the place sheet and every response re-rendered
// the giant tree while the visitor tried to tap. Fix: lib/feedDeferral.js +
// the gate in app/home.js. This guard fails if either is removed or loosened.
//
// Behavior first (import + call the helper), then syntactic-role checks on
// app/home.js with comments stripped, each with a positive and negative control.
import { readFileSync } from "fs";
import { FEED_DEFERRAL_MAX_WAIT_MS, initialFeedReleased, isFeedDeferred, shouldReleaseFeed } from "../lib/feedDeferral.js";
import { stripComments } from "./lib/guardHonestyAnalysis.mjs";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// ---- 1. behavior of the pure helper ----
ok(initialFeedReleased("ChIJabc") === false, "direct place landing starts DEFERRED (not released)");
ok(initialFeedReleased(null) === true && initialFeedReleased(undefined) === true && initialFeedReleased("") === true, "home page / (no initialPlaceId) is released from the start: / behavior unchanged");
ok(isFeedDeferred("ChIJabc", false) === true, "place landing + not released => deferred");
ok(isFeedDeferred("ChIJabc", true) === false, "place landing + released => feed renders");
ok(isFeedDeferred(null, false) === false && isFeedDeferred(null, true) === false, "no initialPlaceId is never deferred, whatever the flag");
ok(shouldReleaseFeed({ detailOpen: true, detailWasOpen: true, screen: "suggested" }) === false, "sheet open on the home screen: stay deferred");
ok(shouldReleaseFeed({ detailOpen: false, detailWasOpen: false, screen: "suggested" }) === false, "before the sheet has opened: stay deferred (open is in flight)");
ok(shouldReleaseFeed({ detailOpen: false, detailWasOpen: true, screen: "suggested" }) === true, "sheet closed after being open: release");
ok(shouldReleaseFeed({ detailOpen: true, detailWasOpen: true, screen: "saved" }) === true, "visitor switched screen: release");
ok(shouldReleaseFeed({ detailOpen: false, detailWasOpen: false, screen: "suggested", placeOpenSettled: true }) === true, "place failed to open: release so the page is not blank");
// One-way: the derived flag, fed the released state, is never deferred again.
{
  let released = initialFeedReleased("ChIJabc");
  const trace = [];
  for (const s of [
    { detailOpen: false, detailWasOpen: false, screen: "suggested" },
    { detailOpen: true, detailWasOpen: true, screen: "suggested" },
    { detailOpen: false, detailWasOpen: true, screen: "suggested" },
    { detailOpen: true, detailWasOpen: true, screen: "suggested" }, // re-open after release
  ]) {
    if (!released && shouldReleaseFeed(s)) released = true; // mirrors the effect in home.js
    trace.push(isFeedDeferred("ChIJabc", released));
  }
  ok(JSON.stringify(trace) === "[true,true,false,false]", "defers until first close, releases exactly once, never re-defers: " + JSON.stringify(trace));
}

// ---- 2. syntactic role in app/home.js (comments stripped) ----
const home = stripComments(readFileSync(new URL("../app/home.js", import.meta.url), "utf8"));
const check = (src) => ({
  failSafe: /if\s*\(\s*detail\s*\)\s*return;\s*const\s+feedFailSafe\s*=\s*setTimeout\(\(\)\s*=>\s*setFeedReleased\(true\)\s*,\s*FEED_DEFERRAL_MAX_WAIT_MS\s*\);\s*return\s*\(\)\s*=>\s*clearTimeout\(feedFailSafe\);\s*\}\s*,\s*\[\s*detail\s*,\s*screen\s*,\s*feedReleased\s*\]/.test(src),
  importsHelper: /import\s*\{[^}]*\binitialFeedReleased\b[^}]*\bisFeedDeferred\b[^}]*\bshouldReleaseFeed\b[^}]*\}\s*from\s*"\.\.\/lib\/feedDeferral\.js"/.test(src),
  stateInit: /const\s*\[\s*feedReleased\s*,\s*setFeedReleased\s*\]\s*=\s*useState\(\s*\(\)\s*=>\s*initialFeedReleased\(\s*initialPlaceId\s*\)\s*\)/.test(src),
  derived: /const\s+feedDeferred\s*=\s*isFeedDeferred\(\s*initialPlaceId\s*,\s*feedReleased\s*\)/.test(src),
  // the heavy subtree renders only when NOT deferred
  // test-city-gate pins the literal `screen === "suggested" && (() => {`, so the gate is the FIRST statement inside that IIFE
  gatedFeed: /\{\s*screen\s*===\s*"suggested"\s*&&\s*\(\(\)\s*=>\s*\{\s*if\s*\(\s*feedDeferred\s*\)\s*return\s*<div\s+data-wf-feed-deferred="1"/.test(src),
  placeholder: /data-wf-feed-deferred="1"\s+aria-hidden="true"/.test(src),
  releaseEffect: /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(\s*feedReleased\s*\)\s*return;[\s\S]{0,300}shouldReleaseFeed\(\{[^}]*detailOpen[^}]*screen[^}]*\}\)[\s\S]{0,80}setFeedReleased\(true\)[\s\S]{0,260}\}\s*,\s*\[\s*detail\s*,\s*screen\s*,\s*feedReleased\s*\]\s*\)/.test(src),
  // the ungated form must be gone: the IIFE must not open straight into the feed body
  ungated: /\{\s*screen\s*===\s*"suggested"\s*&&\s*\(\(\)\s*=>\s*\{\s*(?=\S)(?!if\s*\(\s*feedDeferred\s*\))/.test(src),
  // every write to the flag is a release (true) — never a re-defer
  writes: [...src.matchAll(/setFeedReleased\(([^)]*)\)/g)].map((m) => m[1].trim()),
  failureRelease: /shouldReleaseFeed\(\{\s*placeOpenSettled:\s*true\s*\}\)\)\s*setFeedReleased\(true\)/.test(src) && /\.catch\(\(e\)\s*=>\s*\{\s*setFeedReleased\(true\);/.test(src),
});
const r = check(home);
ok(r.importsHelper, "app/home.js imports initialFeedReleased, isFeedDeferred, shouldReleaseFeed from lib/feedDeferral.js");
ok(r.stateInit, "feedReleased state is initialised from initialFeedReleased(initialPlaceId) (hydration-safe: reads only the prop)");
ok(r.derived, "feedDeferred is derived via isFeedDeferred(initialPlaceId, feedReleased)");
ok(r.gatedFeed, 'the feed subtree is gated: first statement of the `screen === "suggested" && (() => {` block is `if (feedDeferred) return <placeholder/>`');
ok(r.placeholder, "a cheap placeholder renders while deferred");
ok(!r.ungated, "the feed subtree must not render ungated on screen === \"suggested\" alone");
ok(r.releaseEffect, "the release effect exists, runs only while deferred, and is keyed on [detail, screen, feedReleased]");
ok(r.writes.length === 4 && r.writes.every((w) => w === "true"), "setFeedReleased is only ever called with true (one-way). Found: " + JSON.stringify(r.writes));
ok(r.failureRelease, "a place that fails to open (null or thrown) still releases the feed");
ok(r.failSafe, "while no sheet is open a timer releases the feed, and it is cleared when the sheet opens or the effect re-runs");
ok(Number.isInteger(FEED_DEFERRAL_MAX_WAIT_MS) && FEED_DEFERRAL_MAX_WAIT_MS >= 3000 && FEED_DEFERRAL_MAX_WAIT_MS <= 15000, "the fail-safe waits long enough for a slow place lookup and short enough that a page is never left empty: " + FEED_DEFERRAL_MAX_WAIT_MS);
{
  const brokenFailSafe = home.replace("const feedFailSafe = setTimeout(", "const feedFailSafe = (0, ");
  ok(brokenFailSafe !== home && check(brokenFailSafe).failSafe === false, "negative control: removing the fail-safe timer is detected");
}

// ---- 3. controls: the probes can see a positive and fail on a broken copy ----
ok(Object.entries(r).filter(([k]) => !["ungated", "writes"].includes(k)).every(([, v]) => v === true), "positive control: all probes find the real source");
const brokenUngated = home.replace('if (feedDeferred) return <div data-wf-feed-deferred="1"', 'if (false) return <div data-wf-feed-deferred="1"');
ok(brokenUngated !== home, "negative control setup: mutation applied");
ok(check(brokenUngated).gatedFeed === false && check(brokenUngated).ungated === true, "negative control: removing the gate is detected");
const brokenRedefer = home.replace("setFeedReleased(true);\n", "setFeedReleased(false);\n");
ok(check(brokenRedefer).writes.some((w) => w === "false") || brokenRedefer === home, "negative control: a re-defer write is detected");
const brokenInit = home.replace("initialFeedReleased(initialPlaceId)", "false");
ok(check(brokenInit).stateInit === false, "negative control: a changed initial state is detected");

if (failn) { console.error(`\n${failn}/${n} assertions FAILED`); process.exit(1); }
console.log(`test-feed-deferral: ${n} assertions OK (helper called directly; home.js ${home.length} chars scanned, comments stripped)`);
