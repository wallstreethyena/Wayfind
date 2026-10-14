// lib/partnerPathHealth.js — PURE, DETERMINISTIC partner-path validity.
//
// THE INCIDENT (2026-10-13). Week of 10-06 partner redirects fell off a cliff:
// Clipp's two audit fuses lapsed (every Clipp coupon went non-live, 51 -> 0),
// Undercover Tourist cards were dropped from /guides by the Google-photo credit
// policy, Stay22 hotel cards sit behind a fail-closed gate that leaves 40 of 394
// hotels, and Klook/Tiqets/Go City were thin. The deaths were silent because the
// only monitor (revenue-heartbeat) watches a site-wide ratio that Viator keeps
// healthy, and "zero clicks" cannot tell a dead placement from a quiet week.
//
// WHAT THIS ANSWERS, with no network and no clock of its own: for each provider
// we expect to earn from, how many LIVE, eligible offers exist as of `today`, and
// which ones expire soon enough that a human must renew them. It never renews
// anything (AGENTS.md §5/§11: a lapse is a decision for the owner, not a default).
//
// THREE LAYERS, kept apart on purpose:
//   evaluatePartnerPaths(offers, today)  -> path validity (this file, pure)
//   collectPartnerOffers({ today, ... }) -> reads the real registries (lib/partnerPathInventory.js)
//   partnerPathVerdict(report, traffic)  -> pages only when path validity AND traffic say so
//
// ZERO CLICKS ALONE NEVER PAGES. A provider is an incident only when its path is
// deterministically invalid (no live offer, or the last one is inside the
// renewal deadline) while real traffic is present. A valid path with no
// impressions is a WARN (placement may be hidden); a valid path with
// impressions and no clicks is fine.

export const EXPECTED_PROVIDERS = Object.freeze([
  "clipp", "tiqets", "klook", "gocity", "undercover_tourist", "stay22",
]);
export const RENEWAL_WINDOW_DAYS = 14;   // WARN: last live offer expires within this many days
export const RENEWAL_LEAD_DAYS = 7;      // deadline = expires - 7d; at/after it the renewal is overdue
export const DEFAULT_OWNER = "Gabe";
export const MIN_TRAFFIC_PAGEVIEWS = 200; // below this a quiet window cannot be judged

const DAY = 86400000;
const iso = (v) => String(v || "").slice(0, 10);
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Whole days from `a` to `b` (YYYY-MM-DD, calendar arithmetic, no local clock). */
export function daysBetween(a, b) {
  const pa = iso(a).split("-").map(Number);
  const pb = iso(b).split("-").map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / DAY);
}
export function addDays(a, n) {
  const p = iso(a).split("-").map(Number);
  const t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  const z = (x) => String(x).padStart(2, "0");
  return t.getUTCFullYear() + "-" + z(t.getUTCMonth() + 1) + "-" + z(t.getUTCDate());
}

/** Live rule shared with lib/coupons.js couponIsLive: no expiry, or expiry today-or-later. */
export function offerIsLive(offer, today) {
  if (!offer || !offer.provider || !offer.offerId) return false;
  if (offer.eligible === false) return false;
  if (!offer.expires) return true;
  return iso(offer.expires) >= iso(today);
}

/**
 * offers: [{ provider, offerId, city?, expires?: 'YYYY-MM-DD'|null, eligible?: boolean }]
 * requiredCities: { provider: [city, ...] } — a provider/city pair with zero live offers fails.
 * measured: providers whose inventory could not be read at all (unmeasured, never "ok").
 */
export function evaluatePartnerPaths(offers, today, { requiredCities = {}, expected = EXPECTED_PROVIDERS, unmeasured = [] } = {}) {
  if (!isIso(iso(today))) throw new Error("evaluatePartnerPaths: today must be YYYY-MM-DD (no implicit clock)");
  const list = Array.isArray(offers) ? offers : [];
  const providers = {};
  const queue = [];
  for (const id of expected) {
    const mine = list.filter((o) => o && o.provider === id);
    if (unmeasured.includes(id)) {
      providers[id] = { provider: id, status: "unmeasured", total: mine.length, live: 0, expired: 0, lastLiveExpiry: null, daysToLastExpiry: null, cities: {}, reasons: ["inventory source unavailable"] };
      continue;
    }
    const live = mine.filter((o) => offerIsLive(o, today));
    const expired = mine.filter((o) => o && o.expires && iso(o.expires) < iso(today) && o.eligible !== false);
    const evergreen = live.some((o) => !o.expires);
    const expiries = live.filter((o) => o.expires).map((o) => iso(o.expires)).sort();
    const lastLiveExpiry = evergreen || !expiries.length ? null : expiries[expiries.length - 1];
    const daysToLastExpiry = lastLiveExpiry ? daysBetween(today, lastLiveExpiry) : null;
    const cities = {};
    const reasons = [];
    for (const city of requiredCities[id] || []) {
      const c = mine.filter((o) => o.city && String(o.city).toLowerCase() === String(city).toLowerCase());
      const cl = c.filter((o) => offerIsLive(o, today));
      cities[city] = { total: c.length, live: cl.length };
      if (!cl.length) reasons.push(`no live offers in ${city}`);
    }
    let status = "ok";
    if (!live.length) { status = "fail"; reasons.unshift(mine.length ? `0 live of ${mine.length} (all expired or ineligible)` : "no offers registered"); }
    else if (reasons.length) status = "fail";
    else if (daysToLastExpiry !== null && daysToLastExpiry <= RENEWAL_WINDOW_DAYS) {
      status = "renew";
      reasons.push(`last live offer expires in ${daysToLastExpiry}d (${lastLiveExpiry})`);
    }
    providers[id] = { provider: id, status, total: mine.length, live: live.length, expired: expired.length, lastLiveExpiry, daysToLastExpiry, cities, reasons };
    // Renewal queue: every dated offer that is expired or inside the window. Never auto-renewed.
    for (const o of mine) {
      if (!o.expires || o.eligible === false) continue;
      const left = daysBetween(today, o.expires);
      if (left > RENEWAL_WINDOW_DAYS) continue;
      queue.push({
        provider: id, offerId: o.offerId, city: o.city || null, expires: iso(o.expires),
        daysLeft: left, expired: left < 0, owner: o.owner || DEFAULT_OWNER, deadline: addDays(iso(o.expires), -RENEWAL_LEAD_DAYS),
        overdue: daysBetween(today, addDays(iso(o.expires), -RENEWAL_LEAD_DAYS)) <= 0,
      });
    }
  }
  queue.sort((a, b) => a.expires.localeCompare(b.expires) || a.provider.localeCompare(b.provider) || String(a.offerId).localeCompare(String(b.offerId)));
  const statuses = Object.values(providers).map((p) => p.status);
  return { today: iso(today), providers, queue, ok: statuses.every((s) => s === "ok"), failing: Object.values(providers).filter((p) => p.status === "fail" || p.status === "unmeasured").map((p) => p.provider), renewing: Object.values(providers).filter((p) => p.status === "renew").map((p) => p.provider) };
}

/**
 * traffic: { pageviews, impressions: {provider: n}, clicks: {provider: n} }
 * Returns { incidents: [{provider, kind, detail}], warnings: [...] }.
 * Clicks are read but are NEVER a reason to page.
 */
export function partnerPathVerdict(report, traffic = {}) {
  const pageviews = Number(traffic.pageviews) || 0;
  const healthyTraffic = pageviews >= MIN_TRAFFIC_PAGEVIEWS;
  const imp = traffic.impressions || {};
  const incidents = [];
  const warnings = [];
  for (const p of Object.values(report.providers)) {
    if (p.status === "unmeasured") { incidents.push({ provider: p.provider, kind: "unmeasured", detail: p.reasons.join("; ") }); continue; }
    if (p.status === "fail") {
      (healthyTraffic ? incidents : warnings).push({ provider: p.provider, kind: "path-invalid", detail: p.reasons.join("; ") + (healthyTraffic ? "" : " (traffic too low to page)") });
    } else if (p.status === "renew") {
      const overdue = report.queue.some((q) => q.provider === p.provider && q.overdue && !q.expired);
      (overdue && healthyTraffic ? incidents : warnings).push({ provider: p.provider, kind: overdue ? "renewal-overdue" : "renewal-due", detail: p.reasons.join("; ") });
    } else if (healthyTraffic && !(Number(imp[p.provider]) > 0)) {
      warnings.push({ provider: p.provider, kind: "no-exposure", detail: `path valid (${p.live} live) but 0 impressions in window with ${pageviews} pageviews — placement may be hidden` });
    }
  }
  return { healthyTraffic, pageviews, incidents, warnings };
}

/** recordPulse row: attempted=1; succeeded only when nothing is an incident. */
export function partnerPathPulseRow(verdict) {
  const n = verdict.incidents.length;
  const note = n
    ? ("partner path: " + verdict.incidents.map((i) => `${i.provider} ${i.kind} (${i.detail})`).join(" | ")).slice(0, 200)
    : `clean: ${verdict.warnings.length} warning(s)`;
  return { attempted: 1, succeeded: n ? 0 : 1, failed: n, note };
}
