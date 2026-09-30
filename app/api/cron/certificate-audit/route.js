// app/api/cron/certificate-audit/route.js — CLIPP CERTIFICATE AUDIT WATCH.
//
// Route path says "certificate", not the partner name, on purpose: Clipp's terms
// forbid a partner-name URL, and scripts/check-clipp-deals.mjs fails any route
// directory that carries it.
//
// WHY THIS EXISTS (owner, 2026-09-29). Clipp certificates rotate weekly, so
// lib/coupons.js carries hand-set re-verify dates (CLIPP_AUDIT_EXPIRY for the
// four city cards, CLIPP_MERCHANT_AUDIT_EXPIRY for the named merchant
// certificates, CLIPP_INDEX_REVERIFIED.expires for the later re-checked subset).
// Renewing one means a human opens the real pages in a real browser; a script
// cannot do it (Clipp answers 403 to every non-browser fetch).
//
// Those dates used to be enforced in the BUILD: check-guide-deal-cards read the
// real date, so the day a fuse lapsed (2026-09-28) it went red on unchanged code
// and every Vercel deploy failed until someone renewed a date. That mixes two
// unrelated questions — "is the code deployable" and "has a human re-verified
// Clipp this fortnight". The build now answers only the first (the guard pins its
// date, the same fix #1545 made for affiliate-coverage); THIS job answers the
// second, nightly, against the real venue-local date.
//
// TWO HALVES, BOTH KEPT:
//   * FAIL CLOSED at runtime — a lapsed fuse still hides its cards
//     (lib/coupons.js couponIsLive, untouched). Nothing here re-enables a card.
//   * ALERT — the pulse below goes through recordPulse (lib/jobPulse.js) and
//     app/api/cron/job-watch delivers; NOT a new alert path. A run with any
//     stale fuse records succeeded=0, so job-watch emails after
//     DEAD_RUN_THRESHOLD consecutive runs and keeps the incident open until a
//     human renews the constant after a real-browser check.
//
// NEVER RENEWS. Read-only: no database, no fetch, no edit. Extending a date
// without the browser check would put a false verification in the repo.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { clippAuditStatus } from "../../../../lib/coupons.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";

const JOB = "certificate-audit";
const FUSES = [
  ["city", "city cards"],
  ["merchant", "merchant certificates"],
  ["reverified", "re-verified merchant subset"],
];

/**
 * Pure: shape the pulse row from an audit status. Exported so the guard can
 * execute the incident rule instead of reading it.
 */
export function clippAuditPulseRow(status) {
  const stale = FUSES.filter(([k]) => status[k] && status[k].stale);
  const note = stale.length
    ? "stale Clipp audit: " + stale.map(([k, label]) => `${label} lapsed ${status[k].expires} (${status[k].hidden} hidden)`).join("; ") + " — reverify in a real browser, then edit lib/coupons.js"
    : "clean Clipp audit: " + FUSES.map(([k]) => `${k} to ${status[k].expires}`).join(", ");
  return { attempted: 1, succeeded: stale.length ? 0 : 1, failed: stale.length, note: note.slice(0, 200) };
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  // The real venue-local date — siteTodayStr, never a UTC slice. This is the one
  // place a lapse is meant to be felt.
  const status = clippAuditStatus(siteTodayStr());
  const pulseRow = clippAuditPulseRow(status);
  const pulsed = await recordPulse(JOB, pulseRow);

  return Response.json({
    ok: true,
    job: JOB,
    status,
    pulse: { ...pulseRow, recorded: pulsed },
    note: "delivery is via the existing app/api/cron/job-watch pulse alert, not a new alert path; this job never renews a date",
  }, { headers: { "Cache-Control": "no-store" } });
}
