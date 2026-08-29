#!/usr/bin/env node
// scripts/test-landing-why-fits.mjs — Why it fits is a sourced two-beat or empty.
//
// THE LIVE BUG (2026-08-29, /nightlife/parrish):
//   HAS sourced two-beat: Welcome To The Farm, Oscura, McCurdy's
//   HAS FILLER (generic vibe + "N.N mi from the town center"):
//     The Mable, Pangea Alchemy Lab, Cortez Clam Factory
//   EMPTY (correct until a two-beat exists): St. Pete Comedy Club, Dracula's
//     Legacy, Apollo Beach Society Wine Bar, Right Around the Corner Arcade Bar,
//     Trailer Daddy, My Rich Uncle, Jaxx Wing Co., Good Night John Boy,
//     The Clam House Bar & Grill
//
// House rule 2026-08-20: two-beat sourced distinction + physical why-sit OR
// EMPTY. Never address/hours/deals/name restatement. Miles-from-center is filler.
// No LLM-on-render. Landing uses the same editorial fields as house cards
// (landingWhyFits / placeCardHook). A heading with a blank body is not allowed.
//
// Asserted ON THE CALL.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isDistanceFillerWhy,
  isFillerWhyFits,
  isGenericVibeFiller,
  isUsableCardHook,
  toHookLine,
} from "../lib/editorialHook.js";
import { landingWhyFits, placeCardHook, rankingWhyLine } from "../lib/rankingWhy.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("test-landing-why-fits: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (rel) => {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  if (!src) fail(rel + " is empty");
  return src;
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const PANGEA_FILLER = "A creative cocktail lounge with moody lighting and a hidden-night-out feel.";
const MABLE_FILLER = "A cozy neighborhood bar with creative burgers and a relaxed local atmosphere.";
const CORTEZ_FILLER = "A laid-back seafood institution where locals come for fresh Gulf seafood.";
const PANGEA_LIVE = "A creative cocktail lounge with moody lighting and a hidden-night-out feel · 18.6 mi from the town center.";
const FARM_WHY = "Country artist Chase Rice built this with Forward Hospitality in St. Petersburg's old MacDinton's space, opening November 18, 2022. The bar pours from a list of nearly 100 whiskeys alongside cocktails like the Cowboy Crush margarita, with live country music on the calendar. It reads as a working bar first, novelty second.";
const OSCURA_WHY = "Two Manatee High friends built the venue Bradenton didn't have: espresso and ricotta toast until mid-afternoon, then touring punk, indie and hardcore acts paired with regional openers under disco balls and tropical plants.";
const MCCURDY_WHY = "McCurdy's has run stand-up in Sarasota since Pam and Les McCurdy founded it in 1988. Cabaret seating puts most chairs under 35 feet from the stage, and this is the club where Dan Whitney first tried his Larry the Cable Guy radio character out on a live audience after a backstage chat with Les.";
const GOLD = "Winner of the 2023 Cuban Sandwich Festival's World's Best award, with a patio that overlooks a pond.";

ok(isDistanceFillerWhy(PANGEA_LIVE) === true, "live Pangea line is distance filler");
ok(isDistanceFillerWhy("17.3 mi from the town center") === true, "bare miles-from-center is filler");
ok(isDistanceFillerWhy(FARM_WHY) === false, "Welcome To The Farm two-beat is not distance filler");
ok(isGenericVibeFiller(PANGEA_FILLER) === true, "Pangea curated hook is generic vibe filler");
ok(isGenericVibeFiller(MABLE_FILLER) === true, "The Mable curated hook is generic vibe filler");
ok(isGenericVibeFiller(CORTEZ_FILLER) === true, "Cortez Clam Factory curated hook is generic vibe filler");
ok(isGenericVibeFiller(FARM_WHY) === false, "Welcome To The Farm is not generic vibe");
ok(isGenericVibeFiller(OSCURA_WHY) === false, "Oscura is not generic vibe");
ok(isGenericVibeFiller(MCCURDY_WHY) === false, "McCurdy's is not generic vibe");
ok(isGenericVibeFiller(GOLD) === false, "Cracked Pepper gold is not generic vibe");
ok(isFillerWhyFits(PANGEA_LIVE) === true, "live Pangea why-it-fits is filler");
ok(isUsableCardHook(PANGEA_LIVE, "Pangea Alchemy Lab") === false,
  "isUsableCardHook blanks miles-from-center (every surface inherits)");

ok(landingWhyFits({ name: "Pangea Alchemy Lab", hook: PANGEA_FILLER, distMi: 18.6 }) === "",
  "Pangea curated vibe + distance renders EMPTY");
ok(landingWhyFits({ name: "Pangea Alchemy Lab", distMi: 18.6 }) === "",
  "name-only Pangea (curated hook lookup, the live path) still blanks filler");
ok(landingWhyFits({ name: "The Mable - Bar & Grill", distMi: 17.3 }) === "",
  "live Mable name still blanks the curated filler hook");
ok(landingWhyFits({ name: "Cortez Clam Factory", distMi: 16.9 }) === "",
  "name-only Cortez blanks the curated filler hook");
ok(landingWhyFits({ name: "The Mable - Bar & Grill", hook: MABLE_FILLER, distMi: 17.3 }) === "",
  "The Mable curated vibe + distance renders EMPTY");
ok(landingWhyFits({ name: "Cortez Clam Factory", hook: CORTEZ_FILLER, distMi: 16.9 }) === "",
  "Cortez Clam Factory curated vibe + distance renders EMPTY");

ok(landingWhyFits({ name: "Welcome To The Farm", id: "farm" }, { why_here: FARM_WHY }).includes("Chase Rice"),
  "Welcome To The Farm fleet why_here RENDERS — copy existed, list must not hide it");
ok(landingWhyFits({ name: "Oscura", id: "oscura" }, { why_here: OSCURA_WHY }).includes("400")
    || landingWhyFits({ name: "Oscura", id: "oscura" }, { why_here: OSCURA_WHY }).includes("punk"),
  "Oscura fleet why_here RENDERS");
ok(landingWhyFits({ name: "McCurdy's Comedy Theatre", id: "mcc" }, { why_here: MCCURDY_WHY }).includes("1988"),
  "McCurdy's fleet why_here RENDERS");

ok(landingWhyFits({ name: "St. Pete Comedy Club", id: "spc" }) === "",
  "St. Pete Comedy Club stays empty — no sourced two-beat in Atlas/curated");
ok(landingWhyFits({ name: "Dracula's Legacy Wine Bar & Bistro", id: "drac" }) === "",
  "Dracula's Legacy stays empty — do not invent a hook");
ok(landingWhyFits({ name: "Trailer Daddy", id: "td" }) === "",
  "Trailer Daddy stays empty");
ok(landingWhyFits({ name: "The Clam House Bar & Grill", id: "clam" }) === "",
  "The Clam House stays empty");

{
  const siestaWhy = landingWhyFits({ name: "Siesta Beach", id: "ChIJjfu2YPBBw4gRo41o9hwHfmg", distMi: 12 });
  ok(siestaWhy.length >= 20, "Siesta landing why is the sourced Atlas line, not empty");
  ok(!/mi from the town center/i.test(siestaWhy),
    "a sourced landing why never appends miles-from-center");
}

ok(rankingWhyLine({ name: "Pangea Alchemy Lab", hook: PANGEA_FILLER, distMi: 18.6 }) === "",
  "rankingWhyLine on Pangea filler is empty — distance is not appended");
{
  const siestaRank = rankingWhyLine({
    name: "Siesta Beach", id: "ChIJjfu2YPBBw4gRo41o9hwHfmg", distMi: 2.1,
  });
  ok(siestaRank.length >= 20, "rankingWhyLine(Siesta) still emits the Atlas why");
  ok(!/mi from the town center/i.test(siestaRank),
    "rankingWhyLine no longer appends town-center miles");
}

ok(placeCardHook({ name: "The Cracked Pepper Cafe", hook: GOLD }).includes("Cuban Sandwich Festival"),
  "house-card gold line still ships through placeCardHook");
ok(toHookLine(FARM_WHY, "Welcome To The Farm").length >= 20,
  "toHookLine still compresses the Farm two-beat (does not empty it)");

{
  const land = strip(read("lib/landing.js"));
  ok(land.length > 500, "positive control: landing.js body after comment-strip");
  ok(/landingWhyFits\(p,\s*eds\[p\.id\]\)/.test(land),
    "the Why it fits block CALLS landingWhyFits(p, eds[p.id])");
  ok(!/whyLine\(p,\s*cat\.singular\)/.test(land),
    "landing cards no longer fall back to whyLine (that appended miles-from-center)");
  ok(/if \(!why\) return null/.test(land),
    "empty why returns null — no Why it fits heading with a blank body");
  ok(!/mi from the town center/.test(land),
    "landing.js does not template miles-from-center into Why it fits");
}

{
  const rw = strip(read("lib/rankingWhy.js"));
  ok(/export function landingWhyFits\s*\(/.test(rw),
    "landingWhyFits is declared (syntactic position)");
  ok(!/mi from the town center/.test(rw),
    "rankingWhy.js no longer appends miles-from-center");
}

console.log(`test-landing-why-fits: OK — ${pass} assertions (filler stripped; sourced two-beats render; empty cards stay empty; no distance)`);
