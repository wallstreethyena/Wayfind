#!/usr/bin/env node
// scripts/report-editorial-coverage.mjs — what percentage of a metro's listed
// places actually have generated "known for" copy, per category.
//
// NOT a guard: it needs the database, and prebuild must run offline. It is the
// instrument the rollout is measured with, so it lives in the repo rather than
// in a chat message. `node scripts/report-editorial-coverage.mjs [metro]`.
//
// It reports COVERED / MISSING / SUPPRESSED separately on purpose. A place with
// no editorial because it failed the operational gate is not the same as one
// still waiting in the queue, and a place whose card was written but failed
// verification is a third thing again. Rolling those together produces a
// percentage that looks like progress and hides which of the three it is.
import { readFileSync } from "fs";

const metro = process.argv[2] || "orlando";
const CATS = ["food", "attractions", "nightlife", "hotels", "shopping"]; // rollout order

function env() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) {
    try {
      const f = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
      const g = (k) => (f.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "") || "";
      url = url || g("NEXT_PUBLIC_SUPABASE_URL");
      key = key || g("SUPABASE_SERVICE_ROLE_KEY") || g("SUPABASE_SERVICE_KEY");
    } catch (e) {}
  }
  return { url, key };
}

const { url, key } = env();
if (!url || !key) {
  console.error("report-editorial-coverage: no Supabase credentials — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Refusing to print a coverage table I could not measure.");
  process.exit(2);
}

async function rest(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: "Bearer " + key, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`${r.status} ${path.slice(0, 60)}`);
  return r.json();
}

const inv = await rest(`wf_inventory?metro=eq.${metro}&select=place_id,category,status&limit=10000`);
const eds = await rest(`wf_editorial?select=place_id,issues&limit=20000`);
const edById = new Map(eds.map((e) => [e.place_id, e]));
const published = (e) => e && (!Array.isArray(e.issues) || e.issues.length === 0);

console.log(`\nEditorial coverage — ${metro}, in rollout order\n`);
console.log("  category      listed  covered      missing  suppressed  unverified");
console.log("  " + "-".repeat(70));
let T = { listed: 0, covered: 0, missing: 0, suppressed: 0, unverified: 0 };
for (const cat of CATS) {
  const rows = inv.filter((r) => r.category === cat);
  const live = rows.filter((r) => r.status === "OPERATIONAL");
  const suppressed = rows.length - live.length;   // never eligible: the operational gate
  let covered = 0, unverified = 0;
  for (const r of live) {
    const e = edById.get(r.place_id);
    if (published(e)) covered++;
    else if (e) unverified++;                     // written, but failed verification
  }
  const missing = live.length - covered - unverified;
  const pct = rows.length ? ((100 * covered) / rows.length).toFixed(1) : "0.0";
  console.log(`  ${cat.padEnd(13)}${String(rows.length).padStart(5)}  ${(covered + " (" + pct + "%)").padEnd(14)}${String(missing).padStart(5)}  ${String(suppressed).padStart(10)}  ${String(unverified).padStart(10)}`);
  T = { listed: T.listed + rows.length, covered: T.covered + covered, missing: T.missing + missing, suppressed: T.suppressed + suppressed, unverified: T.unverified + unverified };
}
console.log("  " + "-".repeat(70));
const tp = T.listed ? ((100 * T.covered) / T.listed).toFixed(1) : "0.0";
console.log(`  ${"TOTAL".padEnd(13)}${String(T.listed).padStart(5)}  ${(T.covered + " (" + tp + "%)").padEnd(14)}${String(T.missing).padStart(5)}  ${String(T.suppressed).padStart(10)}  ${String(T.unverified).padStart(10)}\n`);
console.log("  covered    = a published wf_editorial row (no issues)");
console.log("  missing    = operational, listed, still waiting on the generator");
console.log("  suppressed = not OPERATIONAL, so deliberately never generated");
console.log("  unverified = a card was written but failed lib/atlasVerify and was NOT published\n");
