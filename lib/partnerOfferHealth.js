// lib/partnerOfferHealth.js — pure verdict logic for the weekly probe of
// every hand curated destination in lib/partnerOfferRegistry.js
// (scripts/probe-partner-offer-registry.mjs, .github/workflows/partner-offer-health.yml).
//
// Rule kept from lib/linkProbe.js and docs/audits: a bot wall (403, 429,
// 503, DataDome, Cloudflare) is UNKNOWN, never dead. Only an explicit 404 or
// 410, or a DNS / TLS failure, is DEAD. Dated rows past their ET expiry are
// EXPIRED and are not probed: their resolver already routes to the fallback.
// Nothing here changes ranking or disclosure; it only reports.
import { calendarDayStillLive } from "./wsGame3Offer.js";

export const VERDICT = Object.freeze({ OK: "ok", DEAD: "dead", UNKNOWN: "unknown", EXPIRED: "expired" });

export function isExpiredRow(row, today) {
  if (!row || !row.expires) return false;
  return !calendarDayStillLive(row.expires, today);
}

export function classifyProbe({ status, error } = {}) {
  if (error) {
    const code = String(error.code || error.cause?.code || error.message || "");
    if (/ENOTFOUND|EAI_AGAIN|CERT|SSL|ERR_TLS/i.test(code)) return VERDICT.DEAD;
    return VERDICT.UNKNOWN;
  }
  const s = Number(status) || 0;
  if (s >= 200 && s < 400) return VERDICT.OK;
  if (s === 404 || s === 410) return VERDICT.DEAD;
  return VERDICT.UNKNOWN;
}

// Exit code policy: only a DEAD row fails the run. UNKNOWN is reported but
// never pages, so a partner's bot wall cannot cry wolf.
export function summarize(results) {
  const counts = { ok: 0, dead: 0, unknown: 0, expired: 0 };
  for (const r of results || []) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  return { counts, failed: counts.dead > 0, dead: (results || []).filter((r) => r.verdict === VERDICT.DEAD) };
}
