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

// (b) executable replay. 2026-10-29: the claimed block no longer WRITES — it
// proposes (lib/deepLinkAction.js). The write moved to applyLinkAction, run
// only from confirmLinkAction on a trusted tap. So: the effect run 3x proposes
// once, and the lifted applyLinkAction body applies once / never toggles off.
const homeRaw = readFileSync(join(ROOT, "app/home.js"), "utf8");
const home = stripComments(homeRaw);
const blockRx = /if \(placeAction && placeActionGateRef\.current\.claim\(opened\.id, placeAction\)\) \{([^]*?)\n          \}\n/;
const m = blockRx.exec(home);
ok(!!m, "app/home.js deep-link effect must route the action through placeActionGateRef.current.claim(opened.id, placeAction)");
if (m) {
  for (const action of ["save", "like", "dislike"]) {
    const proposals = [];
    const g = { current: createPlaceActionGate() };
    const run = new Function("placeActionGateRef", "placeAction", "opened", "linkPlan", "setLinkActionPrompt",
      "if (placeAction && placeActionGateRef.current.claim(opened.id, placeAction)) {" + m[1] + "\n}");
    for (let r = 0; r < 3; r++) run(g, action, { id: "P1" }, { prompt: true }, (v) => proposals.push(v));
    ok(proposals.length === 1 && proposals[0].action === action, "3 effect runs for ?action=" + action + " propose exactly once (got " + proposals.length + ")");
    ok(!/quickSaveFavorite|toggleLike|toggleDislike/.test(m[1]), "the claimed deep-link block never writes state itself");
  }
}
const applyM = /function applyLinkAction\(place, action, extra\) \{([^]*?)\n  \}\n/.exec(home);
ok(!!applyM, "applyLinkAction(place, action, extra) found");
if (applyM) {
  const caps = [];
  const apply = new Function("quickSaveFavorite", "toggleLike", "toggleDislike", "isSavedNow", "isLikedNow", "isDislikedNow", "place", "action", "extra", applyM[1]);
  const qs = (p) => caps.push("save"); const tl = () => caps.push("like"); const td = () => caps.push("dislike");
  const no = () => false; const yes = () => true;
  for (const action of ["save", "like", "dislike"]) {
    caps.length = 0; apply(qs, tl, td, no, no, no, { id: "P1" }, action, {});
    ok(caps.join() === action, "control: confirmed ?action=" + action + " on an un-set place applies once (got " + caps.join() + ")");
  }
  caps.length = 0; apply(qs, tl, td, yes, no, no, { id: "P3" }, "save", {});
  ok(caps.length === 0, "?action=save on an already-saved place adds nothing and never un-saves it (idempotent add)");
  caps.length = 0; apply(qs, tl, td, no, yes, no, { id: "P4" }, "like", {});
  ok(caps.length === 0, "?action=like on a place already liked never toggles it off");
  caps.length = 0; apply(qs, tl, td, no, no, yes, { id: "P4" }, "dislike", {});
  ok(caps.length === 0, "?action=dislike on a place already disliked never toggles it off");
}

// (b2) the apply reads CURRENT state (refs), not the first render's closure.
ok(/if \(!isSavedNow\(place\.id\)\) quickSaveFavorite\(place, extra\)/.test(home), "deep-link save is judged on current state (isSavedNow), not the first render's stale lists");
ok(/const isSavedNow = \(id\) => Object\.values\(listsRef\.current/.test(home) && /listsRef\.current = lists;/.test(home), "isSavedNow reads listsRef, which tracks every render");
ok(/const isLikedNow = \(id\) => !!\(likedRef\.current/.test(home) && /likedRef\.current = liked;/.test(home) && /dislikedRef\.current = disliked;/.test(home), "like/dislike state refs track every render");
// share_open: one landing, claimed once through the same gate.
ok(/if \(placeActionGateRef\.current\.claim\(placeId, "share_open"\)\) \{\s*logEvent\("share_open", null, \{ kind: "place"/.test(home), "place share_open is claimed once through placeActionGateRef");
const shareRx = /logEvent\("share_open", null, \{ kind: "place"/g;
ok(('logEvent("share_open", null, { kind: "place", place_id: x })'.match(shareRx) || []).length === 1, "positive control: the share_open probe matches a literal emitter");
ok((home.match(shareRx) || []).length === 1, "exactly one place share_open emitter");
{
  // Replay the gate exactly as the effect does across two runs.
  const g = createPlaceActionGate(); let n = 0;
  for (let run = 0; run < 2; run++) if (g.claim("PX", "share_open")) n++;
  ok(n === 1, "two effect runs emit share_open once");
}
// Heart-save auto-file: EXECUTE lib/trips.filePlaceIntoTrips.
{
  const { filePlaceIntoTrips } = await import("../lib/trips.js");
  const place = { id: "T1", name: "Cafe", city: "Orlando", state: "FL", lat: 28.5, lng: -81.4 };
  const run = (trips, opts) => { const ev = []; let t = trips; filePlaceIntoTrips({ p: place, trips, setTrips: (fn) => { t = typeof fn === "function" ? fn(t) : fn; }, autoOrder: false, logEvent: (name) => ev.push(name), showToast: () => {}, ...opts }); return { ev, t }; };
  const first = run({}, { src: "quick_save" });
  ok(first.ev.join() === "trip_create", "heart save into a new trip: trip_create only, no stop_add (got " + first.ev.join() + ")");
  ok(run(first.t, { src: "quick_save" }).ev.length === 0, "heart save into an existing trip emits nothing");
  ok(run({}, { src: "card_itinerary", isCardItinerary: true }).ev.join() === "trip_create,stop_add,itinerary_item_added", "control: an explicit itinerary add keeps its events");
  ok(run({}, { src: "detail_plan" }).ev.includes("stop_add"), "control: a non-auto source still emits stop_add");
}
ok(/filePlaceIntoTrips\(\{ p, trips: tripsRef\.current, setTrips, autoOrder: itineraryFlags\.autoOrder, src: "quick_save"/.test(home) && /tripsRef\.current = trips;/.test(home), "quick_save auto-file judges trip_create against current trips (tripsRef)");

// (c) syntactic roles. The ONLY link-originated write is applyLinkAction, and
// its ONLY caller is confirmLinkAction, behind humanConfirmed().
const replayCalls = home.match(/quickSaveFavorite\(place, extra\)/g) || [];
ok(replayCalls.length === 1, "exactly one quickSaveFavorite(place, extra) link-apply call (found " + replayCalls.length + ")");
ok(!!applyM && /quickSaveFavorite\(place, extra\)/.test(applyM[1]), "that call sits inside applyLinkAction");
const applyCalls = home.match(/\bapplyLinkAction\(/g) || [];
ok(applyCalls.length === 2, "applyLinkAction is declared once and called once (found " + applyCalls.length + " occurrences)");
const confirmM = /function confirmLinkAction\(e\) \{([^]*?)\n  \}\n/.exec(home);
ok(!!confirmM && /if \(!humanConfirmed\(e, /.test(confirmM[1]) && confirmM[1].indexOf("humanConfirmed") < confirmM[1].indexOf("applyLinkAction("), "confirmLinkAction refuses before applying unless humanConfirmed(e)");
ok(/onClick=\{confirmLinkAction\}/.test(home), "confirmLinkAction is wired to the prompt button's click (a real user activation)");
ok(/import \{ createPlaceActionGate \} from "\.\.\/lib\/placeActionOnce\.js"/.test(home), "home.js imports the gate");
ok(/import \{ planDeepLinkAction, humanConfirmed, deepLinkEventProps, deepLinkPromptLabel \} from "\.\.\/lib\/deepLinkAction\.js"/.test(home), "home.js imports the deep-link policy (lib/deepLinkAction.js)");
ok((home.match(/function confirmLinkAction\(e\)/g) || []).length === 1, "exactly one confirmLinkAction");
ok((home.match(/function applyLinkAction\(place, action, extra\)/g) || []).length === 1, "exactly one applyLinkAction");
ok(/onClick=\{\(\) => setLinkActionPrompt\(null\)\}/.test(home), "the prompt can be dismissed without any write");
ok(!!confirmM && /applyLinkAction\(pending\.place, pending\.action, deepLinkEventProps\("human", pending\.action\)\)/.test(confirmM[1]), "a confirmed link action is labelled traffic_class:'human', trigger:'deep_link'");
ok(/placeActionGateRef\.current = createPlaceActionGate\(\)/.test(home), "gate lives in a ref (survives the effect re-run)");

// one PostHog emitter inside quickSaveFavorite: logEvent("save") once, and no second capture/track.
const qs = /function quickSaveFavorite\(p, extra\) \{([^]*?)\n  \}\n/.exec(home);
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
console.log("test-save-single-emitter: OK (gate executed, effect replayed 3x x 3 actions proposing once, applyLinkAction executed, 4 source files role-checked)");
