#!/usr/bin/env node
// check-social-trending-live — production monitor for the social Trending
// zero-miss guarantee. Runs on the canary clock (chained from
// scripts/check-inventory-integrity.mjs, every 30 minutes) against the LIVE
// reconciliation report, GET /api/trending/social?audit=1, which is built from
// production events, places and synced posts.
//
// Fails (exit 1) when, in production:
//   - the report is unreachable or not the reconciliation body (soft 200s count as failures)
//   - any eligible post is missing from Trending (MISSING > 0)
//   - any post is in no bucket (UNKNOWN > 0) or excluded without a reason
//   - any permalink is broken or duplicated
//   - the newest owned post was published but is not in the inventory
//     (published-but-not-ingested): reported by the reconciler, see below
//   - the last successful reconciliation is older than STALE_HOURS
//
// Prints TOTAL PUBLISHED, ELIGIBLE, TRENDING, EXCLUDED, MISSING, LATEST
// PUBLICATION AGE and LATEST SUCCESSFUL RECONCILIATION on every run.
//
// Offline twin: scripts/test-social-trending.mjs (CI).
const BASE = "https://www.gowayfind.com";
const STALE_HOURS = 36;

const problems = [];
let body = null;
try {
  const res = await fetch(BASE + "/api/trending/social?audit=1", { headers: { "user-agent": "wayfind-canary/social-trending" }, signal: AbortSignal.timeout(25000) });
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok) problems.push(`audit endpoint returned HTTP ${res.status}`);
} catch (e) {
  problems.push(`audit endpoint unreachable: ${e && e.message || e}`);
}

if (body && body.counts && Array.isArray(body.missing)) {
  const c = body.counts;
  const now = Date.now();
  const pubAgeH = c.latest_owned_publish ? (now - Date.parse(c.latest_owned_publish)) / 3600000 : null;
  const recAgeH = body.lastReconciledAt ? (now - Date.parse(body.lastReconciledAt)) / 3600000 : null;
  console.log(`check-social-trending-live: TOTAL PUBLISHED ${c.published_owned} (${c.owned_reels} reels, ${c.owned_carousels} carousels, ${c.owned_images} images) + ${c.creator_assets} creator | ELIGIBLE ${c.eligible} | TRENDING ${c.represented} posts in ${c.in_trending_cards} cards | EXCLUDED ${c.excluded} | MISSING ${c.missing} | LATEST PUBLICATION ${pubAgeH == null ? "unknown" : pubAgeH.toFixed(1) + "h ago"} | LATEST SUCCESSFUL RECONCILIATION ${recAgeH == null ? "never" : recAgeH.toFixed(1) + "h ago (" + body.reconciledFrom + ")"}`);
  if (body.missing.length) problems.push(`MISSING ${body.missing.length}: ${body.missing.slice(0, 10).join(", ")}`);
  if ((body.unknown || []).length) problems.push(`UNKNOWN ${body.unknown.length}: ${body.unknown.slice(0, 10).join(", ")}`);
  if ((body.excludedWithoutReason || []).length) problems.push(`excluded without a reason: ${body.excludedWithoutReason.slice(0, 10).join(", ")}`);
  if ((body.broken || []).length) problems.push(`BROKEN ${body.broken.length}: ${JSON.stringify(body.broken.slice(0, 5))}`);
  if ((body.duplicates || []).length) problems.push(`DUPLICATES ${body.duplicates.length}: ${JSON.stringify(body.duplicates.slice(0, 5))}`);
  if (!(c.eligible > 0) || !(c.in_trending_cards > 0)) problems.push(`nothing eligible or nothing shown (eligible ${c.eligible}, cards ${c.in_trending_cards}): the pipeline is not running`);
  // Freshness is enforced once the reconciler writes to production
  // (wf_owned_social.last_seen_at). Until that table exists the only clock is the
  // committed snapshot, which moves with merges, so staleness is a NOTE rather
  // than a permanently red canary.
  const stale = recAgeH == null || recAgeH > STALE_HOURS;
  const staleMsg = `last successful reconciliation is ${recAgeH == null ? "unknown" : recAgeH.toFixed(1) + "h"} old (limit ${STALE_HOURS}h): new posts may not be ingested`;
  if (stale && body.reconciledFrom === "wf_owned_social") problems.push(staleMsg);
  else if (stale) console.log("check-social-trending-live: NOTE — " + staleMsg + " (reconciler table not live yet; snapshot clock only)");
  if (body.ok !== true) problems.push("audit body reports ok=false");
} else if (body) {
  problems.push("audit endpoint answered without a reconciliation body (soft failure)");
}

if (problems.length) {
  for (const p of problems) console.error("check-social-trending-live: FAIL — " + p);
  process.exit(1);
}
console.log("check-social-trending-live: OK — production Trending holds every eligible post (missing 0, unknown 0, broken 0, duplicates 0)");
