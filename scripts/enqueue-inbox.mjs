#!/usr/bin/env node
// scripts/enqueue-inbox.mjs — operator tool for the cheap in-box backfill.
//
// Calls public.wf_promotion_backfill() ONLY when WAYFIND_PROMOTE_BACKFILL=on
// and WAYFIND_PROMOTE_BACKFILL_LIMIT > 0. Default is off. Does not call
// Google. Does not widen PROMOTE_METROS. See lib/promoteEnqueue.js.
//
// Usage (owner, later — not in this PR):
//   WAYFIND_PROMOTE_BACKFILL=on WAYFIND_PROMOTE_BACKFILL_LIMIT=100 \
//     node scripts/enqueue-inbox.mjs
import { planBackfillEnqueue, PROMOTE_BACKFILL_ENV, PROMOTE_BACKFILL_ON } from "../lib/promoteEnqueue.js";

const plan = planBackfillEnqueue(process.env);
console.log("enqueue-inbox plan:");
console.log(`  switch ${PROMOTE_BACKFILL_ENV}=${process.env[PROMOTE_BACKFILL_ENV] || "(unset)"} (needs "${PROMOTE_BACKFILL_ON}")`);
console.log(`  enabled=${plan.enabled} willEnqueue=${plan.willEnqueue} estimateUSD=${plan.estimateUSD}`);
console.log(`  ${plan.reason}`);

if (!plan.enabled || plan.willEnqueue <= 0) {
  process.exit(2);
}

const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.error("enqueue-inbox: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — refused (no silent empty enqueue)");
  process.exit(2);
}

const r = await fetch(`${url}/rest/v1/rpc/${plan.rpc}`, {
  method: "POST",
  cache: "no-store",
  headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
  body: JSON.stringify({ p_metro: null, p_limit: plan.willEnqueue }),
});
if (!r.ok) {
  console.error(`enqueue-inbox: rpc ${plan.rpc} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  process.exit(1);
}
const n = await r.json();
console.log(`enqueue-inbox: queued ${n} in-box never-queued index rows (no Google call)`);
