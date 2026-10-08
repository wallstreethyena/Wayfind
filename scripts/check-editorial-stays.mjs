#!/usr/bin/env node
// Lock for the owner rule (2026-10-07): "once it is written, it stays there."
//
// A verified wf_editorial line is permanent. This guard asserts:
//   1. planReconcile (lib/editorialReconcile.js) restores ONLY rows the reconcile
//      job itself demoted, and only once the place is OPERATIONAL again (executed).
//   2. No source file in app/ or lib/ deletes wf_editorial rows (static, with a
//      positive control proving each probe can fire).
//   3. The Atlas build path inserts with resolution=ignore-duplicates (never
//      overwrites); merge-duplicates appears exactly once, only in refresh mode,
//      which enqueues verified rows only.
//   4. The reconcile route uses planReconcile and its restore write repeats the
//      marker-only filter.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

// 1. planReconcile, executed.
const R = await import(pathToFileURL(path.join(ROOT, "lib/editorialReconcile.js")).href);
const M = R.DEMOTE_MARKER;
ok(M === "not-servable-inventory", "marker must stay 'not-servable-inventory' (the value already stored in production rows)");
const plan = R.planReconcile({
  published: ["a", "b"], servable: ["a"],
  demoted: [
    { place_id: "c", verified: false, issues: [M] },                    // reopened -> restore
    { place_id: "d", verified: false, issues: [M] },                    // still closed -> stay hidden
    { place_id: "e", verified: false, issues: ["FAILED VERIFICATION"] }, // never ours -> never restore
    { place_id: "f", verified: false, issues: [M, "dash"] },             // extra issue -> never restore
    { place_id: "g", verified: true, issues: [M] },                      // not demoted -> nothing to do
  ],
  operational: ["c", "e", "f", "g"],
});
ok(JSON.stringify(plan.stale) === '["b"]', "published-but-not-servable must be demoted (stale=['b']), got " + JSON.stringify(plan.stale));
ok(JSON.stringify(plan.restore) === '["c"]', "only the reconcile-demoted, now OPERATIONAL row may be restored (restore=['c']), got " + JSON.stringify(plan.restore));
ok(R.isReconcileDemoted({ verified: false, issues: [M] }) === true, "isReconcileDemoted positive control");
ok(R.isReconcileDemoted({ verified: false, issues: null }) === false, "a row with no issues is not ours to restore");

// 2. No deletes of wf_editorial anywhere in app/ or lib/.
const DEL_CLIENT = /from\(\s*["'`]wf_editorial["'`]\s*\)[\s\S]{0,120}?\.delete\(/;
const DEL_REST = /wf_editorial[?"'`][^\n]{0,240}method:\s*["'`]DELETE/;
ok(DEL_CLIENT.test('db.from("wf_editorial").delete().eq("x",1)'), "probe self-test: client delete pattern must fire on a known positive");
ok(DEL_REST.test('fetch(`${u}/rest/v1/wf_editorial?place_id=eq.1`, { method: "DELETE" })'), "probe self-test: REST delete pattern must fire on a known positive");
let scanned = 0;
const walk = (dir) => {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) { if (name !== "node_modules" && !name.startsWith(".")) walk(rel); continue; }
    if (!/\.(m?js|jsx|ts|tsx)$/.test(name)) continue;
    scanned++;
    const src = strip(read(rel));
    ok(!DEL_CLIENT.test(src) && !DEL_REST.test(src), `${rel} must never delete wf_editorial rows (owner: once written, it stays)`);
  }
};
walk("app"); walk("lib");
ok(scanned > 100, `scan must actually cover app/ and lib/ (scanned ${scanned})`);

// 3. Atlas never overwrites a published line except with a verified refresh.
const atlas = strip(read("app/api/cron/atlas-build/route.js"));
const merges = atlas.match(/resolution=merge-duplicates/g) || [];
ok(merges.length === 1, `atlas-build must use merge-duplicates exactly once (refresh only), found ${merges.length}`);
const refreshIdx = atlas.indexOf("} else if (refreshMode) {");
const mergeIdx = atlas.indexOf("resolution=merge-duplicates");
const insertIdx = atlas.indexOf("resolution=ignore-duplicates", mergeIdx);
ok(refreshIdx > 0 && mergeIdx > refreshIdx && insertIdx > mergeIdx, "merge-duplicates must sit inside the refreshMode branch, followed by the ignore-duplicates build insert");

// 4. Reconcile route wiring.
const rec = strip(read("app/api/cron/editorial-reconcile/route.js"));
ok(/import\s*\{[^}]*\bplanReconcile\b[^}]*\}\s*from\s*["'][^"']*lib\/editorialReconcile["']/.test(rec), "reconcile route must import planReconcile");
ok(/planReconcile\s*\(/.test(rec), "reconcile route must call planReconcile");
const restoreWrite = rec.match(/update\(\s*\{\s*verified:\s*true[\s\S]{0,260}?\.select\(/);
ok(!!restoreWrite && /containedBy\(\s*["']issues["']\s*,\s*\[\s*DEMOTE_MARKER\s*\]\s*\)/.test(restoreWrite[0]) && /\.eq\(\s*["']verified["']\s*,\s*false\s*\)/.test(restoreWrite[0]),
  "the verified:true restore write must repeat the marker-only filter (eq verified false + containedBy [DEMOTE_MARKER])");

if (bad) { console.error(`check-editorial-stays: FAIL — ${bad}/${n}`); process.exit(1); }
console.log(`check-editorial-stays: OK — ${n} assertions (restore logic executed; ${scanned} app/lib files scanned for wf_editorial deletes with two self-tested probes; atlas overwrite + reconcile restore wiring)`);
