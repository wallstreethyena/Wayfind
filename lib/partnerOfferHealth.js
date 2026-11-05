// lib/partnerOfferHealth.js — server-only verdict and transport policy for the weekly probe of
// every hand curated destination in lib/partnerOfferRegistry.js
// (scripts/probe-partner-offer-registry.mjs, .github/workflows/partner-offer-health.yml).
//
// HTTP refusals (403, 429, 503) are UNKNOWN, never dead. A successful
// HTTP status proves reachability, not product availability. Only a 404 or
// 410, or a confirmed missing DNS name, is DEAD. Transient DNS/network/TLS
// errors are UNKNOWN. Dated rows past their ET expiry are
// EXPIRED and are not probed: their resolver already routes to the fallback.
// Nothing here changes ranking or disclosure; it only reports.
import { calendarDayStillLive } from "./wsGame3Offer.js";
import { probeUrl } from "./linkProbe.js";
import { isDeniedHost } from "./nightlifeRail.js";
import { lookup as dnsLookup } from "node:dns/promises";

export const VERDICT = Object.freeze({ OK: "ok", DEAD: "dead", UNKNOWN: "unknown", EXPIRED: "expired" });

export function isExpiredRow(row, today) {
  if (!row || !row.expires) return false;
  return !calendarDayStillLive(row.expires, today);
}

export function classifyProbe({ status, error } = {}) {
  if (error) {
    const code = String(typeof error === "string" ? error : error.code || error.cause?.code || error.message || "");
    if (/\b(?:ENOTFOUND|ENODATA)\b/i.test(code)) return VERDICT.DEAD;
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

// Share linkProbe's per-hop affiliate refusal, public-address validation,
// pinned DNS and bounded manual redirects. Keep the original DNS error so a
// temporary resolution failure cannot become a confirmed missing name.
export async function probePartnerDestination(url, { lookupImpl = dnsLookup, ...options } = {}) {
  let dnsError;
  const result = await probeUrl(url, {
    timeoutMs: 15000,
    ...options,
    lookupImpl: async (hostname, lookupOptions) => {
      try {
        if (isDeniedHost(hostname)) throw new Error("denied-host-no-fetch");
        return await lookupImpl(hostname, lookupOptions);
      } catch (error) { dnsError = error; throw error; }
    },
  });
  return dnsError ? { ...result, error: dnsError } : result;
}
