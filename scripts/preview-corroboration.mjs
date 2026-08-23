// Hand-run probe (NOT a guard): what the new batch and the corroboration rule
// actually do to real rows. Run: node scripts/preview-corroboration.mjs
import { allCreators, creatorCountFor, creatorVideosFor, libraryStats, regionsWithFinds } from "../lib/creatorVideos.js";
import { lawfulSort, governedScoreOf } from "../lib/lawfulOrder.js";
import { toDisplayScore } from "../lib/score.js";

const s = libraryStats();
console.log(`LIBRARY: ${s.creatorCount} creators, ${s.spotCount} spots, ${s.cityCount} cities`);

const { creators } = allCreators();
const c = creators.find((x) => x.handle === "cailincoastal");
console.log(`\n@cailincoastal: ${c ? c.count : 0} spots`);
if (c) {
  const byCity = {};
  for (const sp of c.spots) byCity[sp.city || "(no city)"] = (byCity[sp.city || "(no city)"] || 0) + 1;
  console.log("  " + Object.entries(byCity).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));
}

// Every corroborated place in the whole library, found by walking it rather
// than by trusting the two we know about.
console.log("\nCORROBORATED PLACES (2+ distinct creators):");
const seen = new Set();
for (const cr of creators) {
  for (const sp of cr.spots) {
    if (seen.has(sp.key)) continue;
    seen.add(sp.key);
    const probe = { id: sp.placeId || null, name: sp.name, city: sp.city, address: sp.address };
    const n = creatorCountFor(probe, sp.city);
    if (n >= 2) {
      const who = creatorVideosFor(probe, sp.city).map((v) => v.creator).join(", ");
      console.log(`  ${String(n)}x  ${sp.name} (${sp.city || "—"})  ← ${who}`);
    }
  }
}

// The head-to-head the owner asked for: same quality, one corroborated.
console.log("\nRANK EFFECT — identical rating/reviews/distance, one corroborated:");
const rows = [
  { id: "ChIJizhkpNfHwogRbx738MsVHK4", name: "Heights Drive-Thru (2 creators)", rating: 4.6, reviews: 900, distance_mi: 3 },
  { id: "control-a", name: "Control, no creator", rating: 4.6, reviews: 900, distance_mi: 3 },
  { id: "ChIJU6N76oDBwogRjU3JNe6seko", name: "Eclipse Cafe (1 creator)", rating: 4.6, reviews: 900, distance_mi: 3 },
];
for (const r of lawfulSort(rows, null, "Tampa")) {
  console.log(`  ${toDisplayScore(governedScoreOf(r, "Tampa"))}  ${r.name}` + (r.trending ? `   🔥 ${r.trend_reason}` : ""));
}

console.log("\nCITY COVERAGE (renderable spots per city):");
console.log("  " + regionsWithFinds().slice(0, 14).map((r) => `${r.city}:${r.count}`).join("  "));
