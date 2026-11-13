#!/usr/bin/env node
// scripts/verify-synthetic-viator-cleanup.mjs — Read-only deterministic proof of the
// synthetic attribution predicate on live `wf_viator_clicks` & `wf_tp_clicks` (Mission 4).
// Never mutates production; emits exact counts, zero-overlap proofs, and SHA-256 digest.

import {
  isSyntheticViatorClickRow,
  isSyntheticTravelpayoutsClickRow,
  hashClickTokenSet,
} from "../lib/attributionHygiene.js";

const rawUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!rawUrl || !key || rawUrl.includes("example.supabase.co") || rawUrl.includes("guardtest-")) {
  console.log("verify-synthetic-viator-cleanup: SKIP (no live Supabase credentials)");
  process.exit(0);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function fetchAll(table, select, filter = "") {
  const out = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const qs = `select=${encodeURIComponent(select)}${filter ? "&" + filter : ""}&order=click_token.asc&limit=${pageSize}&offset=${offset}`;
    const r = await fetch(`${rawUrl}/rest/v1/${table}?${qs}`, { headers });
    if (!r.ok) throw new Error(`${table} HTTP ${r.status}`);
    const batch = await r.json();
    out.push(...batch);
    if (batch.length < pageSize) break;
    offset += batch.length;
  }
  return out;
}

const [allClicks, bookings, bookingEvents, tpClicks] = await Promise.all([
  fetchAll(
    "wf_viator_clicks",
    "click_token,offer_id,surface,placement_campaign,content_id,gclid,gbraid,wbraid,verified_google_campaign_id,visitor_context_hash,clicked_at",
  ),
  fetchAll("wf_viator_bookings", "booking_ref,click_token").catch(() => []),
  fetchAll("wf_viator_booking_events", "event_key,click_token").catch(() => []),
  fetchAll("wf_tp_clicks", "click_token,provider,offer_id,surface,content_id,clicked_at"),
]);

const syntheticViator = allClicks.filter(isSyntheticViatorClickRow);
const cleanViator = allClicks.filter((r) => !isSyntheticViatorClickRow(r));
const exact1234P5 = allClicks.filter((r) => r.offer_id === "1234P5");

const bookingTokens = new Set(bookings.map((b) => b.click_token).filter(Boolean));
const eventTokens = new Set(bookingEvents.map((e) => e.click_token).filter(Boolean));

const bookingOverlap = syntheticViator.filter((r) => bookingTokens.has(r.click_token));
const eventOverlap = syntheticViator.filter((r) => eventTokens.has(r.click_token));
const adIdOverlap = exact1234P5.filter(
  (r) => r.gclid || r.gbraid || r.wbraid || r.verified_google_campaign_id,
);

const syntheticTp = tpClicks.filter(isSyntheticTravelpayoutsClickRow);
const cleanTp = tpClicks.filter((r) => !isSyntheticTravelpayoutsClickRow(r));

const digest1234 = hashClickTokenSet(exact1234P5.map((r) => r.click_token));

const report = {
  verifiedAt: new Date().toISOString(),
  viatorClicks: {
    totalRows: allClicks.length,
    exact1234P5Count: exact1234P5.length,
    syntheticPredicateCount: syntheticViator.length,
    cleanAnalyticalCount: cleanViator.length,
    bookingReferencesOnSynthetic: bookingOverlap.length,
    bookingEventReferencesOnSynthetic: eventOverlap.length,
    customerAdClickOverlapOn1234P5: adIdOverlap.length,
    exact1234P5TokenSetSha256: digest1234.sha256,
  },
  travelpayoutsClicks: {
    totalRows: tpClicks.length,
    syntheticQaCount: syntheticTp.length,
    cleanAnalyticalCount: cleanTp.length,
  },
  readyForTransactionalArchiveDelete:
    bookingOverlap.length === 0 &&
    eventOverlap.length === 0 &&
    adIdOverlap.length === 0,
};

console.log(JSON.stringify(report, null, 2));
if (!report.readyForTransactionalArchiveDelete) {
  process.exit(1);
}
