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
  const replayRaw = new Function("placeActionGateRef", "quickSaveFavorite", "toggleLike", "toggleDislike", "isSavedNow", "placeAction", "opened", "isLikedNow", "isDislikedNow",
    "if (placeAction && placeActionGateRef.current.claim(opened.id, placeAction)) {" + m[1] + "\n}");
  const replay = (g, qs, tl, td, saved, action, opened, liked = () => false, disliked = () => false) => replayRaw(g, qs, tl, td, saved, action, opened, liked, disliked);
  for (const action of ["save", "like", "dislike"]) {
    caps.length = 0;
    const g = { current: createPlaceActionGate() };
    for (let run = 0; run < 3; run++) replay(g, quickSaveFavorite, toggleLike, toggleDislike, () => false, action, { id: "P1" });
    ok(caps.length === 1 && caps[0][0] === action, "3 effect runs for ?action=" + action + " must capture exactly 1 " + action + " (got " + caps.length + ")");
  }
  caps.length = 0;
  replay(gateRef, quickSaveFavorite, toggleLike, toggleDislike, () => false, "save", { id: "P1" });
  replay(gateRef, quickSaveFavorite, toggleLike, toggleDislike, () => false, "save", { id: "P2" });
  ok(caps.length === 2, "a different place is a different tap");
  caps.length = 0;
  replay({ current: createPlaceActionGate() }, quickSaveFavorite, toggleLike, toggleDislike, () => true, "save", { id: "P3" });
  ok(caps.length === 0, "?action=save on an already-saved place adds nothing and never un-saves it (idempotent add)");
  // 2026-10-28 delta: like/dislike links SET, never toggle off an already-set reaction.
  for (const action of ["like", "dislike"]) {
    caps.length = 0;
    replay({ current: createPlaceActionGate() }, quickSaveFavorite, toggleLike, toggleDislike, () => false, action, { id: "P4" }, () => action === "like", () => action === "dislike");
    ok(caps.length === 0, "?action=" + action + " on a place already " + action + "d never toggles it off");
    caps.length = 0;
    replay({ current: createPlaceActionGate() }, quickSaveFavorite, toggleLike, toggleDislike, () => false, action, { id: "P5" }, () => false, () => false);
    ok(caps.length === 1, "control: ?action=" + action + " on an un-reacted place applies once");
  }
}

// (b2) 2026-10-28 delta. The replay reads CURRENT state (refs), not the first render's closure.
ok(/if \(!isSavedNow\(opened\.id\)\) quickSaveFavorite\(opened\)/.test(home), "deep-link save is judged on current state (isSavedNow), not the first render's stale lists");
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
