#!/usr/bin/env node
// The hourly ?source=repair photo run must reach undecided queue rows that sit
// below the first 1,000 (owner report 2026-11-27: the first 1,000 queue rows
// were all already decided, so the free Commons lane attempted zero places an
// hour while 1,962 open places waited). Hermetic: fetch is stubbed.
import assert from "node:assert/strict";
import { _fetchRepairQueueWorklistForTest as worklist } from "../lib/placePhotoBackfill.js";

const decided = Array.from({ length: 1000 }, (_, i) => `D${String(i).padStart(4, "0")}`);
const fresh = Array.from({ length: 30 }, (_, i) => `F${String(i).padStart(4, "0")}`);
const page2 = [...decided.slice(0, 600).map((id) => id + "x"), ...fresh]; // 630 rows: 600 decided + 30 new
const decidedSet = new Set([...decided, ...decided.slice(0, 600).map((id) => id + "x")]);
const calls = { queue: 0, photo: 0, inv: 0 };

function idsFrom(url) {
  const m = /place_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url));
  return m ? m[1].split(",").map((s) => s.replace(/^"|"$/g, "")) : [];
}
function stub(depth) {
  return async (url) => {
    const u = String(url);
    if (u.includes("wf_photo_repair_queue")) {
      calls.queue++;
      const offset = Number(/offset=(\d+)/.exec(u)?.[1] || 0);
      const rows = offset === 0 ? decided : offset === 1000 && depth > 1 ? page2 : [];
      return new Response(JSON.stringify(rows.map((place_id) => ({ place_id, detections: 1, status: "open" }))), { status: 200 });
    }
    if (u.includes("wf_place_photo")) {
      calls.photo++;
      return new Response(JSON.stringify(idsFrom(u).filter((id) => decidedSet.has(id)).map((place_id) => ({ place_id, status: "rejected" }))), { status: 200 });
    }
    if (u.includes("wf_inventory")) {
      calls.inv++;
      return new Response(JSON.stringify(idsFrom(u).map((place_id) => ({ place_id, name: place_id, status: "OPERATIONAL", category: "attractions", tags: [] }))), { status: 200 });
    }
    throw new Error("unexpected fetch " + u);
  };
}
const s = { url: "https://sb.test", key: "k" };

globalThis.fetch = stub(2);
const rows = await worklist(s, 1000, 40);
const ids = rows.map((r) => r.place_id);
for (const f of fresh) assert.ok(ids.includes(f), "undecided place below the first 1,000 reaches the worklist: " + f);
assert.equal(ids.filter((id) => id.endsWith("x")).length, 0, "decided rows from deeper pages are not carried");
assert.equal(ids.slice(0, 1000).join(), decided.join(), "first window keeps its order (decided rows still counted in the note)");
assert.ok(calls.queue >= 2, "a second page was read");

// Without a want (or when the first window is short), behaviour is the old single read.
calls.queue = 0;
globalThis.fetch = stub(2);
await worklist(s, 1000, 0);
assert.equal(calls.queue, 1, "want=0 reads exactly one page");

// Paging stops on an empty page, never loops.
calls.queue = 0;
globalThis.fetch = stub(1);
const shallow = await worklist(s, 1000, 40);
assert.equal(shallow.length, 1000, "no deeper rows -> first window only");
assert.ok(calls.queue <= 2, "stops after the first empty page");
console.log("test-repair-queue-starvation: OK — the repair lane pages past decided rows to undecided places, bounded");
