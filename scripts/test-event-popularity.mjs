// Demand ranking for intent-specific event shelves. Pure fixtures plus source
// checks proving where the two accepted upstream observations enter Wayfind.
import { readFileSync } from "node:fs";
import { eventPopularitySignal, rankIntentEvents } from "../lib/eventPopularity.js";

let pass = 0;
const fail = (message) => { console.error("test-event-popularity: FAIL — " + message); process.exit(1); };
const ok = (condition, message) => { if (!condition) fail(message); pass += 1; };
const bucketOf = (event) => event.bucket;
const event = (id, extra = {}) => ({ id, bucket: "concerts", date: "2026-10-10", time: "20:00", ...extra });

// Missing is an abstention. Presentation/commerce fields are not demand.
for (const row of [null, {}, { local_rank: "" }, { rank: NaN }, { rank: Infinity },
  { local_rank: -1 }, { local_rank: 101 }, { rank: -0.1 }, { rank: 100.1 },
  { phq_attendance: -1 }, { popularity_score: -1 }, { popularity_score: 10.1 },
  { image: "/poster.jpg", ticketed: true, destKind: "external", status: "sold_out" }]) {
  ok(eventPopularitySignal(row) === null, `invalid/non-demand row abstains: ${JSON.stringify(row)}`);
}

const local = eventPopularitySignal({ local_rank: "82.5", rank: 99, phq_attendance: 50000, popularity_score: 10 });
ok(local.value === 82.5 && local.rawValue === 82.5 && local.field === "local_rank" && local.provenance === "PredictHQ",
  "numeric-string local_rank is normalized with explicit PredictHQ provenance and wins the documented priority");
const global = eventPopularitySignal({ rank: "71" });
ok(global.value === 71 && global.field === "rank" && global.provenance === "PredictHQ", "global rank is a bounded PredictHQ fallback");
const attendance = eventPopularitySignal({ phq_attendance: "999" });
ok(attendance.field === "phq_attendance" && attendance.rawValue === 999 && attendance.value > 59 && attendance.value < 61,
  "predicted attendance keeps raw provenance and receives a bounded logarithmic value");
ok(eventPopularitySignal({ phq_attendance: 1000000000 }).value === 100, "very large valid attendance is capped at 100");
const curated = eventPopularitySignal({ popularity_score: "8.7" });
ok(curated.value === 87 && curated.rawValue === 8.7 && curated.field === "popularity_score" && curated.provenance === "Wayfind curated",
  "curated 0..10 popularity is normalized to 0..100 with its own provenance");
ok(eventPopularitySignal({ local_rank: 101, rank: 60 }).field === "rank", "an invalid preferred field does not hide a valid lower-priority observation");

// Observed demand leads, descending; unknown is not silently coerced to zero.
{
  const rows = [
    event("unknown-big-stature", { image: "/x", destKind: "external" }),
    event("measured-zero", { local_rank: 0, bucket: "comedy" }),
    event("mid", { rank: 40 }),
    event("high", { popularity_score: 9 }),
  ];
  const before = rows.slice();
  const ranked = rankIntentEvents(rows, bucketOf);
  ok(ranked.map((e) => e.id).join(",") === "high,mid,measured-zero,unknown-big-stature",
    "known demand sorts descending and every measured signal leads unknown demand, including an honest zero");
  ok(rows.every((row, i) => row === before[i]), "ranking does not mutate the caller's array");
}

// Existing stature and date law remains the fallback, including signal ties.
{
  const rows = [
    event("unknown-soon-comedy", { bucket: "comedy", date: "2026-10-01" }),
    event("unknown-late-concert", { date: "2026-11-01", image: "/poster", destKind: "external" }),
    event("tie-late", { rank: 70, date: "2026-12-01" }),
    event("tie-soon", { rank: 70, date: "2026-09-01" }),
  ];
  const ranked = rankIntentEvents(rows, bucketOf).map((e) => e.id);
  ok(ranked.join(",") === "tie-soon,tie-late,unknown-late-concert,unknown-soon-comedy",
    "equal demand falls back to date after stature; unknown rows fall back to existing stature then date");
}

ok(rankIntentEvents(null, bucketOf).length === 0, "non-array input safely returns an empty list");
const stableA = event("stable-a", { rank: 50 });
const stableB = event("stable-b", { rank: 50 });
ok(rankIntentEvents([stableA, stableB], bucketOf).map((e) => e.id).join(",") === "stable-a,stable-b",
  "complete ties preserve input order deterministically");

// Provenance controls: PredictHQ creates these exact measured fields and the
// cross-provider deduper copies them onto the destination-bearing winner.
const route = readFileSync(new URL("../app/api/events/route.js", import.meta.url), "utf8");
const pipeline = readFileSync(new URL("../lib/eventsPipeline.js", import.meta.url), "utf8");
const curatedSource = readFileSync(new URL("../lib/curatedEvents.js", import.meta.url), "utf8");
ok(/source:\s*"PredictHQ"[\s\S]{0,900}rank:\s*isFinite\(e\.rank\)[\s\S]{0,300}local_rank:\s*isFinite\(e\.local_rank\)[\s\S]{0,300}phq_attendance:\s*isFinite\(e\.phq_attendance\)/.test(route),
  "route observes all three demand fields on PredictHQ rows");
for (const field of ["rank", "local_rank", "phq_attendance"]) {
  ok(new RegExp(`keep\\.${field} == null && other\\.${field} != null[\\s\\S]{0,100}keep\\.${field} = other\\.${field}`).test(pipeline),
    `dedupe carries PredictHQ ${field} onto the surviving destination-bearing event`);
}
ok(/"editorial_score,uniqueness_score,popularity_score,source_url/.test(curatedSource),
  "curated reads popularity_score from the governed event store");

console.log(`test-event-popularity: OK — ${pass} assertions (bounded observed demand; provenance explicit; stature/date fallback; no image/ticket/sellout inference)`);
