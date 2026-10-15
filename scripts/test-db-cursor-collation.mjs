// scripts/test-db-cursor-collation.mjs — PAGING CURSORS ARE THE DATABASE'S ORDER, NOT JAVASCRIPT'S.
//
// 2026-10-15 sibling sweep of PR #1816. wf_inventory.place_id is ordered by
// Postgres in en_US.UTF-8 collation ("ChIJZ_…" sorts AFTER "ChIJjbpE…"); JS `<=`
// compares UTF-16 code units, so `row.place_id <= cursor` called a correct next
// page a non-advance. Siblings fixed here: lib/socialReviewQueue.js
// (readSocialPages -> social_cursor_invalid:*) and lib/socialAcquisition.js
// (readAcquisitionInventory -> social_acquisition_inventory_cursor_invalid).
//
// A. drives the REAL readers against a fake supabase-js builder that orders and
//    filters `.gt()` with an en_US collator: every row reached exactly once.
// B. stall protections still fire (cursor row returned, repeated id, empty key).
// C. static sweep: no lib/app/scripts source compares a paging cursor with a JS
//    ordering operator (comment-stripped; positive control proves the probe).
// `--red-prove` restores the bytewise `<=` in copies of both modules and
// requires RED.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const pg = new Intl.Collator("en-US"); // stand-in for Postgres en_US.UTF-8
let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const ids = new Set(["ChIJjbpE8twRw4gRUbXfuHT99u4", "ChIJZ_J2k-w5w4gRQJ_gfD_8JXA"]);
while (ids.size < 1310) ids.add("ChIJ" + Array.from({ length: 23 }, () => ALPHA[Math.floor(rnd() * ALPHA.length)]).join(""));
const rows = [...ids].map((place_id, i) => ({ place_id, media_id: place_id, name: `P${i}`, lat: 27.5, lng: -82.4, metro: "sarasota", status: "OPERATIONAL" }))
  .sort((a, b) => pg.compare(a.place_id, b.place_id));
const inversions = rows.slice(1).filter((r, i) => r.place_id < rows[i].place_id).length;
assert.ok(inversions > 50, `setup: en_US order must disagree with code-unit order (found ${inversions})`);
const SIZE = 500;
const crossing = [...Array(SIZE)].map((_, k) => k).filter((k) => {
  for (let b = k + SIZE - 1; b + 1 < rows.length; b += SIZE) if (rows[b + 1].place_id < rows[b].place_id) return true;
  return false;
});
assert.ok(crossing.length > 20, `setup: page boundaries must cross a case inversion (found ${crossing.length} offsets)`);

// Fake supabase-js query builder over `pool`: honours order/gt/limit with the en_US collation.
const fakeDb = (pool, tamper = (page) => page) => ({
  from() {
    let cursor = null, limit = 1000;
    const q = {
      select() { return q; }, order() { return q; }, eq() { return q; }, in() { return q; }, abortSignal() { return q; },
      limit(n) { limit = n; return q; },
      gt(field, v) { cursor = v; return q; },
      then(resolve) { resolve({ data: tamper(pool.filter((r) => cursor === null || pg.compare(r.place_id, cursor) > 0).slice(0, limit), cursor), error: null }); },
    };
    return q;
  },
});

async function checkPaging(queue, acq) {
  let total = 0;
  for (const k of crossing.slice(0, 25)) {
    const pool = rows.slice(k);
    const a = await queue.readSocialPages(fakeDb(pool), "wf_inventory", "*", "place_id", { ceiling: 100000 });
    assert.equal(a.length, pool.length, `A(offset ${k}): readSocialPages reaches every row`);
    assert.equal(new Set(a.map((r) => r.place_id)).size, a.length, "A: no duplicates");
    const b = await acq.readAcquisitionInventory(fakeDb(pool), ["Tampa Bay"], { ceiling: 100000 });
    assert.equal(b.length, pool.length, `A(offset ${k}): readAcquisitionInventory reaches every row`);
    total += a.length + b.length;
  }
  return total;
}

async function checkStalls(queue, acq) {
  const cursorRow = rows[SIZE - 1];
  const again = (page, cursor) => (cursor === null ? page : [cursorRow, ...page.slice(0, -1)]); // DB "returns the cursor row"
  await assert.rejects(queue.readSocialPages(fakeDb(rows, again), "wf_inventory", "*", "place_id"), /social_cursor_invalid:wf_inventory/, "B: cursor row repeated (queue)");
  await assert.rejects(acq.readAcquisitionInventory(fakeDb(rows, again), ["Tampa Bay"]), /inventory_cursor_invalid/, "B: cursor row repeated (acquisition)");
  const dup = (page) => [page[0], page[0], ...page.slice(2)];
  await assert.rejects(queue.readSocialPages(fakeDb(rows, dup), "wf_inventory", "*", "place_id"), /social_cursor_invalid/, "B: repeated id (queue)");
  await assert.rejects(acq.readAcquisitionInventory(fakeDb(rows, dup), ["Tampa Bay"]), /inventory_cursor_invalid/, "B: repeated id (acquisition)");
  const blank = (page) => [{ ...page[0], place_id: "", media_id: "" }];
  await assert.rejects(queue.readSocialPages(fakeDb(rows, blank), "wf_inventory", "*", "place_id"), /social_cursor_invalid/, "B: empty key (queue)");
  await assert.rejects(acq.readAcquisitionInventory(fakeDb(rows, blank), ["Tampa Bay"]), /inventory_cursor_invalid/, "B: empty key (acquisition)");
}

// C. static sweep ---------------------------------------------------------------
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`\\])\/\/.*$/gm, "$1");
const OP = String.raw`(?:<=|>=|<(?!<)|>(?!>))`;
const KEY = String.raw`(?:next|nextCursor|last|lastId|row\.\w+|row\[\w+\]|r\.\w+|\w+\.place_id|place_id|\w+\.media_id|media_id)`;
const PROBE = new RegExp(String.raw`\b${KEY}\s*${OP}\s*cursor\b(?!\s*\.)|\bcursor\s*${OP}\s*${KEY}\b(?!\s*\.length)`);
// Owned by PR #1816 (still bytewise on main until it merges); the sweep fails if
// they are still bytewise AFTER #1816's own fix is gone, i.e. it only excuses them while unfixed.
const PENDING_1816 = new Set(["lib/mapAreaData.js", "lib/mapAreaRead.js"]);
const walk = (d, out = []) => {
  for (const f of readdirSync(d)) {
    if (["node_modules", ".next", ".git", ".claude"].includes(f)) continue;
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(m?js|jsx)$/.test(f)) out.push(p);
  }
  return out;
};
const flagged = (rel, src) => PROBE.test(stripComments(src)) && !PENDING_1816.has(rel);
function sweep() {
  const hits = [];
  let scanned = 0;
  for (const dir of ["lib", "app", "scripts"]) for (const f of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    if (/^scripts\/(test|check)-/.test(rel)) continue; // fake DBs in guards filter fixtures, they are not production readers
    scanned++;
    if (flagged(rel, readFileSync(f, "utf8"))) hits.push(rel);
  }
  return { hits, scanned };
}
// Positive controls: the probe must find the exact shapes that were the bug, and spare loop counters.
for (const bad of ["row.place_id <= cursor", "row[key] <= cursor", "nextCursor <= cursor", "(cursor && next <= cursor)", "cursor >= next"])
  assert.ok(PROBE.test(bad), `C: probe must flag ${bad}`);
for (const ok of ["while (cursor < list.length)", "cursor < tasks.length", "next === cursor", "style={{ cursor: 'pointer' }}"])
  assert.ok(!PROBE.test(ok), `C: probe must not flag ${ok}`);

const queue = await import("../lib/socialReviewQueue.js");
const acq = await import("../lib/socialAcquisition.js");
const total = await checkPaging(queue, acq);
await checkStalls(queue, acq);
const { hits, scanned } = sweep();
assert.deepEqual(hits, [], `C: JS ordering operators on a paging cursor in: ${hits.join(", ")}`);
console.log(`test-db-cursor-collation: OK — ${total} mixed-case row reads in en_US order (${inversions} code-unit inversions, ${crossing.length} case-crossing page offsets), stall refusals hold, ${scanned} files swept with 0 JS-ordered cursors (${PENDING_1816.size} owned by #1816)`);

if (process.argv.includes("--red-prove")) {
  const fileUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
  const mutate = (rel, find, replace) => {
    const raw = readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(raw.includes(find), `red-prove setup: ${rel} must contain ${JSON.stringify(find)}`);
    const src = raw.replace(find, replace).replace(/from\s+(['"])\.\/([^'"]+)\1/g, (_, q, f) => `from ${q}${fileUrl("lib/" + f)}${q}`);
    assert.notEqual(src, raw, "red-prove setup: mutation did not apply");
    return import("data:text/javascript," + encodeURIComponent(src));
  };
  const reds = [];
  const expectRed = async (label, fn) => {
    try { await fn(); } catch (e) {
      if (/red-prove setup/.test(String(e.message))) throw e;
      reds.push(label); console.log(`  RED as required: ${label} — ${String(e.message).split("\n")[0]}`); return;
    }
    throw new Error(`red-prove: ${label} stayed GREEN`);
  };
  await expectRed("readSocialPages compares bytewise", async () => {
    const q = await mutate("lib/socialReviewQueue.js", "if (!guard.admit(row[key])) throw", 'if (typeof row[key] !== "string" || (cursor !== null && row[key] <= cursor)) throw');
    await checkPaging(q, acq);
  });
  await expectRed("readAcquisitionInventory compares bytewise", async () => {
    const a = await mutate("lib/socialAcquisition.js", "if (!guard.admit(row?.place_id)) throw", 'if (!row?.place_id || (cursor !== null && row.place_id <= cursor)) throw');
    await checkPaging(queue, a);
  });
  await expectRed("guard stops refusing a seen key", async () => {
    const q = await mutate("lib/socialReviewQueue.js", "if (!guard.admit(row[key])) throw", "if (false) throw");
    await checkStalls(q, acq);
  });
  await expectRed("static sweep ignores a planted bytewise cursor", async () => {
    assert.equal(flagged("lib/planted.js", "if (row.place_id <= cursor) throw 1;"), false, "planted bytewise cursor must be flagged");
  });
  assert.equal(reds.length, 4);
  console.log(`test-db-cursor-collation: red-prove OK — ${reds.length}/4 mutations went RED`);
}
