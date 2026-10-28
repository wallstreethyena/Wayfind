// scripts/test-save-single-emitter.mjs — ONE tap on the place detail page emits ONE `save`.
//
// Incident (PostHog, 7 days): 374 `save` events from 189 users; on /p/* nearly
// every user+place pair had exactly 2 `save` events 110 to 1600 ms apart. Root
// cause: the /p/{id}?action=save deep-link effect in app/home.js re-runs when
// supabaseReady flips, and each run called quickSaveFavorite(opened). Each call
// is a full logEvent("save") (PostHog + GA + Supabase `events` row), and the
// second setLists updater then un-saved the place. Fixed by lib/placeActionOnce.js.
//
// This guard (a) EXECUTES the gate, (b) EXECUTES a faithful replay of the effect
// twice and counts `save` captures through a stubbed posthog, and (c) asserts on
// the syntactic role of every `save` emitter reachable from the detail sheet.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const ok = (c, m) => { if (!c) { console.error("test-save-single-emitter: FAIL — " + m); failures++; } };

const { createPlaceActionGate } = await import("../lib/placeActionOnce.js");
const { stripComments } = await import("./lib/guardHonestyAnalysis.mjs");

// (a) the gate itself
{ const g = createPlaceActionGate(); ok(g.claim("A", "save") === true, "first claim wins"); ok(g.claim("A", "save") === false, "second claim of same place+action loses"); }
{ const g = createPlaceActionGate(); g.claim("A", "save"); ok(g.claim("A", "like") === true && g.claim("B", "save") === true, "different action or place is a separate claim"); }
{ const g = createPlaceActionGate(); ok(g.claim("", "save") === false && g.claim("A", "") === false && g.claim(null, null) === false, "missing id/action never claims"); }

// (b) executable replay: the deep-link effect body run twice (supabaseReady false -> true)
// with the exact gated block lifted out of app/home.js, so a regression in the
// real source (not a copy) turns this red.
const homeRaw = readFileSync(join(ROOT, "app/home.js"), "utf8");
const home = stripComments(homeRaw);
const blockRx = /if \(placeAction && placeActionGateRef\.current\.claim\(opened\.id, placeAction\)\) \{([^]*?)\n          \}\n/;
const m = blockRx.exec(home);
ok(!!m, "app/home.js deep-link effect must route the action replay through placeActionGateRef.current.claim(opened.id, placeAction)");
if (m) {
  const caps = [];
  const posthog = { capture: (ev, props) => caps.push([ev, props && props.place_id]) };
  const quickSaveFavorite = (p) => posthog.capture("save", { place_id: p.id }); // quickSaveFavorite's only PostHog emit is logEvent("save")
  const toggleLike = (e, p) => posthog.capture("like", { place_id: p.id });
  const toggleDislike = (e, p) => posthog.capture("dislike", { place_id: p.id });
  const gateRef = { current: createPlaceActionGate() };
  const replay = new Function("placeActionGateRef", "quickSaveFavorite", "toggleLike", "toggleDislike", "placeAction", "opened",
    "if (placeAction && placeActionGateRef.current.claim(opened.id, placeAction)) {" + m[1] + "\n}");
  for (const action of ["save", "like", "dislike"]) {
    caps.length = 0;
    const g = { current: createPlaceActionGate() };
    for (let run = 0; run < 3; run++) replay(g, quickSaveFavorite, toggleLike, toggleDislike, action, { id: "P1" });
    ok(caps.length === 1 && caps[0][0] === action, "3 effect runs for ?action=" + action + " must capture exactly 1 " + action + " (got " + caps.length + ")");
  }
  caps.length = 0;
  replay(gateRef, quickSaveFavorite, toggleLike, toggleDislike, "save", { id: "P1" });
  replay(gateRef, quickSaveFavorite, toggleLike, toggleDislike, "save", { id: "P2" });
  ok(caps.length === 2, "a different place is a different tap");
}

// (c) syntactic roles. Every call to quickSaveFavorite(opened) lives inside that gate.
const replayCalls = home.match(/quickSaveFavorite\(opened\)/g) || [];
ok(replayCalls.length === 1, "exactly one quickSaveFavorite(opened) replay call (found " + replayCalls.length + ")");
const ungated = home.replace(blockRx, "");
// positive controls: the same probes DO find the calls in the full source (and in the source with the gate stripped back out)
const saveRx = /quickSaveFavorite\(opened\)/;
const reactRx = /toggleLike\(\{ stopPropagation\(\) \{\} \}, opened\)|toggleDislike\(\{ stopPropagation\(\) \{\} \}, opened\)/;
ok(saveRx.test("if (x) quickSaveFavorite(opened);") && reactRx.test("toggleLike({ stopPropagation() {} }, opened)"), "probe regexes match a literal known-good fixture");
ok(saveRx.test(home) && reactRx.test(home), "positive control: probes find the gated replay calls in the full source");
ok(saveRx.test(home.replace("placeActionGateRef.current.claim(opened.id, placeAction)", "true")) || !m, "positive control: probe still sees the call when the gate is removed");
ok(!saveRx.test(ungated), "no quickSaveFavorite(opened) outside the claim gate");
ok(!reactRx.test(ungated), "no like/dislike deep-link replay outside the claim gate");
ok(/import \{ createPlaceActionGate \} from "\.\.\/lib\/placeActionOnce\.js"/.test(home), "home.js imports the gate");
ok(/placeActionGateRef\.current = createPlaceActionGate\(\)/.test(home), "gate lives in a ref (survives the effect re-run)");

// one PostHog emitter inside quickSaveFavorite: logEvent("save") once, and no second capture/track.
const qs = /function quickSaveFavorite\(p\) \{([^]*?)\n  \}\n/.exec(home);
ok(!!qs, "quickSaveFavorite found");
if (qs) {
  ok((qs[1].match(/logEvent\("save"/g) || []).length === 1, "quickSaveFavorite emits logEvent(\"save\") exactly once");
  ok(!/\btrack\(|captureOrQueue\(|posthog|forwardToGoogle\(/.test(qs[1]), "quickSaveFavorite has no second capture path");
}
ok((home.match(/logEvent\("save"/g) || []).length === 1, "app/home.js has exactly one logEvent(\"save\") emit point");

// The detail sheet must not emit `save` itself; it only calls quickSaveFavorite.
const detail = stripComments(readFileSync(join(ROOT, "app/components/sheets/Detail.js"), "utf8"));
ok(!/(?:logEvent|track|captureOrQueue)\(\s*["'`]save["'`]/.test(detail), "Detail.js never emits save directly");
ok((detail.match(/quickSaveFavorite\(detail\)/g) || []).length === 1, "Detail.js has exactly one quickSaveFavorite(detail) call (addToTripOnly)");
const att = /function addToTripOnly\(\) \{([^]*?)\n  \}\n/.exec(detail);
ok(!!att && /quickSaveFavorite\(detail\)/.test(att[1]), "that call sits in addToTripOnly");

// lib/cardActions.toggleSave (rail cards) is a different surface with its own single track("save").
const ca = stripComments(readFileSync(join(ROOT, "lib/cardActions.js"), "utf8"));
ok((ca.match(/track\("save"/g) || []).length === 1, "lib/cardActions.js has exactly one track(\"save\")");

if (failures) { console.error("test-save-single-emitter: " + failures + " failure(s)"); process.exit(1); }
console.log("test-save-single-emitter: OK (gate executed, effect replayed 3x x 3 actions through a stubbed posthog, 4 source files role-checked)");
