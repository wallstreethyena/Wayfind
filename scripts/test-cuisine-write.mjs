// scripts/test-cuisine-write.mjs — EXECUTES lib/cuisineWrite.writeCuisineLabels
// against a mock REST layer and asserts on the CALLS it makes.
//
// The invariant under lock: cuisine labels reach wf_inventory as per-row
// UPDATEs (PATCH + place_id filter), never as a POST+on_conflict upsert.
// Postgres checks NOT NULL on the INSERT tuple BEFORE conflict arbitration,
// so a partial-column upsert 23502s on `name` for EVERY batch — that is the
// exact defect that failed /api/cron/cuisine-classify nightly from 08-06
// (122 errors, whole batches lost), proven with a rolled-back probe on prod.
import { readFileSync } from "node:fs";
import { writeCuisineLabels } from "../lib/cuisineWrite.js";

let pass = 0;
const fail = (m) => { console.error("test-cuisine-write: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const upd = (id) => ({
  place_id: id, cuisines: ["coffee"], cuisine_confidence: 0.9,
  cuisine_sources: ["types"], cuisine_reason: "classified", cuisine_checked_at: "2026-08-12T00:00:00Z",
});

// 1 — shape of the calls: one PATCH per row, keyed by place_id, body without it.
{
  const calls = [];
  const rest = async (path, init) => { calls.push({ path, init }); return null; };
  const r = await writeCuisineLabels([upd("ChIJa"), upd("ChIJb"), upd("ChIJc")], rest);
  ok(r.written === 3 && r.failures.length === 0, "3 clean rows write clean");
  ok(calls.length === 3, "exactly one call per row");
  for (const c of calls) {
    ok(c.init.method === "PATCH", "every write is a PATCH (an UPDATE cannot 23502 on name)");
    ok(/^wf_inventory\?place_id=eq\.ChIJ/.test(c.path), `row is addressed by place_id filter (got ${c.path})`);
    ok(!c.path.includes("on_conflict"), "no on_conflict anywhere — the upsert path is the bug");
    const body = JSON.parse(c.init.body);
    ok(!("place_id" in body), "body carries only the cuisine columns, not the key");
    ok(!("name" in body) && !("category" in body), "body never touches identity columns");
    ok(body.cuisine_reason === "classified", "cuisine columns pass through");
  }
}

// 2 — failure isolation: one row throwing does not sink the others, and the
// failure is REPORTED with its id and reason (loud, per-row).
{
  const rest = async (path) => {
    if (path.includes("ChIJbad")) throw new Error("400 23502 probe");
    return null;
  };
  const r = await writeCuisineLabels([upd("ChIJa"), upd("ChIJbad"), upd("ChIJc")], rest);
  ok(r.written === 2, `the two good rows still write (got ${r.written})`);
  ok(r.failures.length === 1 && r.failures[0].place_id === "ChIJbad", "the failing row is named");
  ok(/23502/.test(r.failures[0].error), "the failure carries its reason");
}

// 3 — empty batch is a no-op, not a crash.
{
  const r = await writeCuisineLabels([], async () => fail("rest called for empty batch"));
  ok(r.written === 0 && r.failures.length === 0, "empty batch no-ops");
}

// 4 — a malformed update (no place_id) is a reported failure, never a
// filterless PATCH (which would update every row in the table).
{
  const calls = [];
  const r = await writeCuisineLabels([{ cuisines: ["thai"] }], async (p) => { calls.push(p); return null; });
  ok(calls.length === 0 && r.failures.length === 1, "keyless update is refused loudly, no call issued");
}

// 5 — wiring: both writers CALL the shared function and neither still carries
// the upsert (comment-stripped source; this half is structural because the
// route needs the Next runtime — the executable half is above).
{
  for (const [p, imp] of [
    ["app/api/cron/cuisine-classify/route.js", /import \{ writeCuisineLabels \} from "..\/..\/..\/..\/lib\/cuisineWrite"/],
    ["scripts/backfill-cuisine.mjs", /import \{ writeCuisineLabels \} from "..\/lib\/cuisineWrite.js"/],
  ]) {
    const code = readFileSync(p, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok(imp.test(code), `${p} imports the shared writer`);
    ok(/await writeCuisineLabels\(updates, rest\)/.test(code), `${p} calls writeCuisineLabels(updates, rest)`);
    ok(!code.includes("on_conflict=place_id"), `${p} no longer contains the upsert path`);
    ok(!/merge-duplicates/.test(code), `${p} no longer asks for merge-duplicates`);
  }
}

console.log(`test-cuisine-write: OK — ${pass} assertions (writer EXECUTED against mock REST: call shape, failure isolation, keyless refusal; wiring checked in route + backfill)`);
