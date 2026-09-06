#!/usr/bin/env node
/**
 * diagnose-degraded-answer — the partial-category-failure path, driven through
 * the REAL route handlers against REAL inventory, with exactly one category
 * forced to fail.
 *
 * WHY THIS IS A DIAGNOSTIC AND NOT A GUARD. It needs live Supabase credentials
 * and a network round trip, and a guard that reaches the database on every
 * build fails on an unrelated blip — a guard that fires on correct code is
 * worse than no guard (CLAUDE.md). The GUARD for this behaviour is
 * check-identity-before-cap, which drives both pools with injected fetches and
 * no network. This file is the on-demand proof that the guard's contract is the
 * one the shipped routes actually honour, and it belongs in the Friday audit
 * pass beside scripts/audit_candidate_starvation.py.
 *
 * WHAT IT PROVED, 2026-09-06. Run against main at 95010039 — that is, the code
 * as shipped — every surface failed:
 *
 *   /api/night-out       one category refused -> degraded=false,
 *                        cache-control: public, s-maxage=3600   (415 -> 149 ranked)
 *   /api/today-discovery same                                   (1104 -> 782)
 *   /api/birthday        same                                   (125 -> 35)
 *
 * A Birthday answer holding 35 of 125 ranked places, handed to the CDN for an
 * hour, on one stalled nightlife read. Run against the fix, all three serve
 * their surviving categories, report `degraded: true`, and send `no-store`,
 * while a fully healthy run keeps the public hour it earned.
 *
 * The fault is injected at globalThis.fetch — the one seam every reader goes
 * through — so nothing test-only exists in the shipped code. Two of the three
 * categories are answered by the real database; one is refused.
 *
 * Read-only. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 *   node scripts/diagnose-degraded-answer.mjs
 */
import { setTimeout as sleep } from "node:timers/promises";
import { sbEnv } from "../lib/serverCache.js";

// Refuse rather than report. Without credentials EVERY category fails, so every
// answer is legitimately degraded and every assertion below "fails" for a reason
// that has nothing to do with the code — which is exactly the shape of a
// diagnostic nobody trusts.
if (!sbEnv()) {
  console.error("diagnose-degraded-answer: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. This drives the real routes against real inventory and cannot tell a partial failure from no database at all without them.");
  process.exit(2);
}

const realFetch = globalThis.fetch;
let killed = 0;
const failOne = (pattern) => {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (pattern.test(url)) { killed++; throw new Error("injected: category read refused"); }
    return realFetch(input, init);
  };
};
const healthy = () => { globalThis.fetch = realFetch; };

const LAT = 27.5949, LNG = -82.4265;
const url = (ep) => `https://www.gowayfind.com/api/${ep}?lat=${LAT}&lng=${LNG}`;

const SURFACES = [
  { ep: "night-out", mod: "../app/api/night-out/route.js", kill: /category\.eq\.attractions|secondary_categories\.cs\.%7Battractions%7D|secondary_categories\.cs\.\{attractions\}/ },
  { ep: "today-discovery", mod: "../app/api/today-discovery/route.js", kill: /category=eq\.beach/ },
  { ep: "birthday", mod: "../app/api/birthday/route.js", kill: /category=eq\.nightlife/ },
];

const read = async (res) => {
  const cc = res.headers.get("cache-control");
  let body = null;
  try { body = await res.clone().json(); } catch (e) {}
  const rails = Array.isArray(body?.rails) ? body.rails : [];
  return {
    status: res.status,
    cacheControl: cc,
    degraded: body?.degraded,
    sourceFailures: body?.sourceStats?.sourceFailures ?? body?.sourceFailures,
    rails: rails.length,
    cards: rails.reduce((n, r) => n + (r.places?.length || 0), 0),
    ranked: rails.reduce((n, r) => n + (r.total || 0), 0),
  };
};

let bad = 0;
for (const s of SURFACES) {
  const { GET } = await import(new URL(s.mod, import.meta.url).href);
  console.log(`\n=== /api/${s.ep}`);

  healthy();
  const okRes = await GET(new Request(url(s.ep)));
  const ok = await read(okRes);
  console.log("  all categories healthy :", JSON.stringify(ok));

  await sleep(400);
  killed = 0;
  failOne(s.kill);
  // A different geo cell, so the healthy run above cannot be served from cache
  // and make the partial run look fine.
  const partRes = await GET(new Request(`https://x/api/${s.ep}?lat=${LAT + 0.35}&lng=${LNG + 0.35}`));
  const part = await read(partRes);
  healthy();
  console.log(`  one category refused   : ${JSON.stringify(part)}   (fetches killed: ${killed})`);

  const problems = [];
  if (!killed) problems.push("POSITIVE CONTROL FAILED: no fetch was actually refused, so the row below proves nothing");
  if (ok.status !== 200) problems.push(`healthy run did not return 200 (${ok.status})`);
  if (ok.degraded !== false) problems.push(`a fully healthy answer reports degraded=${ok.degraded} — a flag that is always true gets discarded`);
  if (!/public/.test(ok.cacheControl || "")) problems.push(`a healthy answer is not publicly cacheable (${ok.cacheControl}) — the fix must not cost the CDN its hour`);
  if (part.status === 200) {
    if (part.degraded !== true) problems.push(`ONE CATEGORY FAILED AND THE ANSWER REPORTS degraded=${part.degraded}`);
    if (part.cacheControl !== "no-store") problems.push(`a partial answer was handed to the CDN with "${part.cacheControl}" — it would be pinned on every reader in the cell`);
    if (!part.cards) problems.push("the partial answer composed nothing — the surviving categories must still serve");
  } else if (part.status !== 503) {
    problems.push(`partial run returned ${part.status}`);
  }
  for (const p of problems) { bad++; console.log("  ✗ " + p); }
  if (!problems.length) console.log("  ✓ surviving categories served, answer marked degraded, no-store, healthy run still public");
}
console.log(bad ? `\nFAIL — ${bad} problem(s)` : "\nOK — every surface serves its surviving categories, says the answer is partial, and refuses to cache it");
process.exit(bad ? 1 : 0);
