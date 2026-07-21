// scripts/test-best-move.mjs — lock test for the Best Move engine adapter
// (lib/bestMove.js) and the honesty contract of the #232 homepage. Pure +
// deterministic. Pins: condition never guessed, unrenderable picks dropped,
// slot split, photo-ref SSRF shape, metro fallback. Wire into prebuild.
import { readFileSync } from "fs";
import {
  normalizeCondition,
  isRenderablePick,
  splitPicks,
  pickPhotoUrl,
  fallbackCenter,
} from "../lib/bestMove.js";

let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };

// condition: real vocabulary in, mapped synonyms in, junk -> null (never guessed)
ok(normalizeCondition("clear") === "clear", "clear passes through");
ok(normalizeCondition("Sunny") === "clear", "sunny -> clear");
ok(normalizeCondition("Partly Cloudy") === "clouds", "partly cloudy -> clouds");
ok(normalizeCondition("Light drizzle") === "rain", "drizzle -> rain");
ok(normalizeCondition("Thunderstorms") === "storm", "thunderstorm -> storm");
ok(normalizeCondition("Sleet") === "snow", "sleet -> snow");
ok(normalizeCondition("volcanic ash") === null, "unknown -> null, never a guess");
ok(normalizeCondition("") === null && normalizeCondition(null) === null, "empty -> null");

// renderability: the UI's required fields, nothing more
const good = { name: "Bayfront Park", lat: 27.33, lng: -82.54, distance_mi: 4.2, reasons: ["x"] };
ok(isRenderablePick(good), "complete pick renders");
ok(!isRenderablePick({ ...good, name: "  " }), "blank name dropped");
ok(!isRenderablePick({ ...good, lat: NaN }), "bad lat dropped");
ok(!isRenderablePick({ ...good, distance_mi: -1 }), "negative distance dropped");
ok(!isRenderablePick(null), "null dropped");

// slot split: 1 hero, 2 backups, up to 3 unexpected; short lists degrade gracefully
const picks6 = [1, 2, 3, 4, 5, 6].map((i) => ({ ...good, name: "p" + i }));
const s6 = splitPicks(picks6);
ok(s6.hero.name === "p1" && s6.backups.length === 2 && s6.unexpected.length === 3, "6 picks fill all slots");
const s2 = splitPicks(picks6.slice(0, 2));
ok(s2.hero.name === "p1" && s2.backups.length === 1 && s2.unexpected.length === 0, "2 picks: hero + 1 backup");
const s0 = splitPicks([]);
ok(s0.hero === null && s0.backups.length === 0 && s0.unexpected.length === 0, "empty is explicit, not undefined");
const sBad = splitPicks([{ name: "no coords" }, good]);
ok(sBad.hero.name === "Bayfront Park", "unrenderable pick never becomes the hero");

// brand dedupe: three branches of one market fill ONE slot, not three
// (Detwiler's ×3 in a 25mi radius, verified live 2026-07-21)
const branches = [
  { ...good, name: "Detwiler's Farm Market" },
  { ...good, name: "Detwiler's Farm Market — Palmetto" },
  { ...good, name: "detwilers farm market" },
  { ...good, name: "Coquina Beach" },
];
const sDup = splitPicks(branches);
ok(sDup.hero.name === "Detwiler's Farm Market" && sDup.backups.length === 1 && sDup.backups[0].name === "Coquina Beach", "same-brand branches dedupe to the best-ranked one");

// photo refs: only the Google resource-name shape becomes a proxy URL
ok(
  pickPhotoUrl("places/ChIJabc123/photos/AWCwydjn0") ===
    "/api/photo?ref=" + encodeURIComponent("places/ChIJabc123/photos/AWCwydjn0") + "&w=640",
  "valid ref -> proxied URL"
);
ok(pickPhotoUrl("https://evil.example/img.jpg") === null, "arbitrary URL refused");
ok(pickPhotoUrl("") === null && pickPhotoUrl(null) === null, "empty ref refused");
ok(pickPhotoUrl("places/a/photos/b", 99999).endsWith("w=1600"), "width capped at 1600");
ok(pickPhotoUrl("places/a/photos/b", 10).endsWith("w=64"), "width floored at 64");

// fallback: nearest covered metro within 75mi, else Sarasota — never blank
ok(fallbackCenter(27.9, -82.46).label === "Tampa", "near Tampa -> Tampa centroid");
ok(fallbackCenter(64.2, -149.49).label === "Sarasota", "no coverage -> Sarasota home market");
ok(fallbackCenter(NaN, NaN).label === "Sarasota", "no location -> Sarasota home market");

// source contract: the adapter calls the real engine and only the real engine
const src = readFileSync(new URL("../lib/bestMove.js", import.meta.url), "utf8");
ok(src.includes('supabase.rpc("wf_best_picks"'), "adapter calls wf_best_picks");
ok(!/drive|min away|traffic/i.test(src), "no drive-time language in the adapter (unsourced)");

// UI contract: the section renders honest signals only, and home.js mounts it
const ui = readFileSync(new URL("../app/components/BestMove.js", import.meta.url), "utf8");
ok(ui.includes("Why Wayfind picked it"), "hero renders the why-bullets block");
ok(!/crowds?\s+are/i.test(ui), "no crowd-level claims (no wired source — #232 triage)");
ok(!/min away|drive time/i.test(ui), "distance renders as real miles, never drive time");
ok(!/Verified today/.test(ui), "no 'Verified today' until the freshness signal is defined");
ok(!/Updated just now/.test(ui), "no 'Updated just now' claim on Local Pulse");
ok(!ui.includes('"Free"') && !/label:\s*"Free"/.test(ui), "no Free chip — no wired price/free signal");
ok(ui.includes("pickPhotoUrl"), "images resolve via the SSRF-guarded photo proxy");
ok(ui.includes("BestMoveSkeleton") && ui.includes("aspectRatio"), "reserved-geometry loading skeleton present");
ok(ui.includes("siteTodayStr"), "date labels use siteTime (venue-local ET), never UTC slicing");
ok(!/toISOString\(\)\.slice/.test(ui), "no UTC date slicing (the ~8PM-ET bug)");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/import BestMove from "\.\/components\/BestMove"/.test(home), "home.js imports BestMove");
ok(home.includes("fetchBestPicks({"), "home.js calls the engine adapter");
ok(/\{!browseCat \? \(\s*<BestMove/.test(home), "Best Move stands down when a category is being browsed");

// LCP contract (perf/best-move-lcp): measured 10.5s LCP on 2026-07-21 came
// from a w=1200 hero + a fetch that could not start until hydration. Pin all
// three halves of the fix.
ok(ui.includes("pickPhotoUrl(hero.photo_ref, 800)"), "hero photo is w=800, matching the primer");
ok(!/pickPhotoUrl\([^)]*,\s*(1[2-9]\d\d|[2-9]\d{3})\)/.test(ui), "no photo call above w=800 (the 10.5s-LCP regression)");
const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
const bmPrime = layout.slice(layout.indexOf("wf_best_picks"));
ok(layout.includes("/rest/v1/rpc/wf_best_picks"), "layout primer fires the engine call pre-hydration");
ok(bmPrime.includes("27.5689") && bmPrime.includes("-82.4393"), "primer fallback coords stay in sync with DEFAULT_CENTER");
ok(bmPrime.includes("&w=800"), "primer warms the SAME w=800 URL the hero renders (cache hit, not a second download)");
ok(/\\\/photos\\\//.test(bmPrime) || /photos/.test(bmPrime), "primer validates the photo ref shape before preloading");
// one fetch per center; weather is awaited via ref, never a dep (the #233 swap sin)
const bmEffect = home.slice(home.indexOf("ONE call to the wf_best_picks"), home.indexOf("Suggested for Me:"));
ok(bmEffect.includes("weatherRef"), "effect waits for weather via a ref");
ok(/\}, \[screen, center\]\);/.test(bmEffect), "effect deps are [screen, center] only — no weather-triggered refetch/swap");

console.log(`test-best-move: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
