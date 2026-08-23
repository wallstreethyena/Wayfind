// Hand-run benchmark (NOT a guard) for the creator resolver + lawful sort.
import { creatorVideosFor } from "../lib/creatorVideos.js";
import { lawfulSort } from "../lib/lawfulOrder.js";

const miss = { id: "x", name: "Some Restaurant 1", rating: 4.5 };
let t = process.hrtime.bigint();
for (let k = 0; k < 20000; k++) creatorVideosFor(miss, "Tampa");
console.log("resolver MISS: " + (Number(process.hrtime.bigint() - t) / 1e6 / 20000 * 1000).toFixed(2) + " us/call (was 28.60)");

const hit = { id: "ChIJizhkpNfHwogRbx738MsVHK4", name: "Heights Drive-Thru" };
t = process.hrtime.bigint();
for (let k = 0; k < 20000; k++) creatorVideosFor(hit, "Tampa");
console.log("resolver placeId HIT: " + (Number(process.hrtime.bigint() - t) / 1e6 / 20000 * 1000).toFixed(2) + " us/call (was 1.10)");

const mk = (i) => ({ id: "x" + i, name: "Some Restaurant " + i, rating: 4.5, reviews: 300 + i, distance_mi: 4 });
for (const n of [12, 40, 120]) {
  const rows = Array.from({ length: n }, (_, i) => mk(i));
  const t2 = process.hrtime.bigint();
  for (let k = 0; k < 80; k++) lawfulSort(rows.map((r) => ({ ...r })), null, "Tampa");
  console.log(n + " rows: " + (Number(process.hrtime.bigint() - t2) / 1e6 / 80).toFixed(2) + " ms per lawfulSort");
}
