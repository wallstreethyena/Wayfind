// SERVER-ONLY (imported by lib/commandCenter/alertsRun.js and guards; never by app/ client code).
// The Clipp owner-audit fuses, listed for the Command Center `coupon_audit_*` alert so a lapse is
// announced instead of failing a build. Kept out of lib/coupons.js on purpose: that module is
// reachable from the client bundle, and these labels are dead weight there (check-bundle ratchet).
import { CLIPP_AUDIT_EXPIRY, CLIPP_MERCHANT_AUDIT_EXPIRY } from "./coupons.js";
import { FAMILY_DAY_EVIDENCE } from "./familyDayEvidence.js";
import { FALL_OFFERING_SOURCES } from "./fallPool.js";

// Family-day filter facts are first-party-verified and expire (familyFilterFacts returns null once
// `expiresAt` <= now, evaluated at 00:00Z of that date). When the earliest one lapses the facets fall
// back to "unknown" (safe, but the filters shrink), so it is announced here, not by failing a build.
// The alert's "last live day" is the local day BEFORE expiresAt: the instant is 20:00 ET the evening before.
// Calendar arithmetic on a YYYY-MM-DD string (no clock, no UTC-instant slicing: lib/siteTime owns "today").
const dayBefore = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  const p2 = (n) => String(n).padStart(2, "0");
  return t.getUTCFullYear() + "-" + p2(t.getUTCMonth() + 1) + "-" + p2(t.getUTCDate());
};
// Fall offerings with a dated end: check-fall-registry-integrity (a legitimate content gate, kept) fails the
// build the day AFTER `until` (inclusive end, venue-local). The earliest end is announced here two days ahead
// so the entry is retired or re-verified before it blocks a deploy.
const FALL_FIRST_END = Object.values(FALL_OFFERING_SOURCES).map((v) => String(v.until || v.ends || "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0];
// The fuse follows the LIVE audit batch (entries carrying the most recent
// verifiedAt). An entry deliberately left on an older, lapsed audit (a venue not
// yet open, a claim the operator's page no longer states) is pending, not a
// lapse: it already returns null, and announcing it every 6 hours as "lapsed"
// is noise (2026-10-27: the whole set had expired on 10-09 and the alert had
// emailed about it for 15 days). Pending entries are counted into the label.
const FAMILY_ENTRIES = Object.values(FAMILY_DAY_EVIDENCE);
const FAMILY_LATEST_VERIFIED = FAMILY_ENTRIES.map((e) => String(e.verifiedAt).slice(0, 10)).sort().slice(-1)[0];
const FAMILY_LIVE = FAMILY_ENTRIES.filter((e) => String(e.verifiedAt).slice(0, 10) === FAMILY_LATEST_VERIFIED);
const FAMILY_PENDING = FAMILY_ENTRIES.length - FAMILY_LIVE.length;
const FAMILY_FIRST_EXPIRY = FAMILY_LIVE.map((e) => String(e.expiresAt).slice(0, 10)).sort()[0];

export const COUPON_AUDIT_FUSES = Object.freeze([
  Object.freeze({ id: "clipp_city_pages", label: "Clipp city-page cards (Sarasota, Bradenton, Tampa, Orlando)", expires: CLIPP_AUDIT_EXPIRY }),
  Object.freeze({ id: "clipp_merchant_cards", label: "Clipp merchant certificate cards", expires: CLIPP_MERCHANT_AUDIT_EXPIRY }),
  Object.freeze({ id: "family_day_evidence", alertId: "audit_fuse_family_day_evidence", label: "Family-day verified filter facts" + (FAMILY_PENDING ? ` (${FAMILY_PENDING} ${FAMILY_PENDING === 1 ? "entry" : "entries"} pending re-audit)` : ""), expires: dayBefore(FAMILY_FIRST_EXPIRY), pending: FAMILY_PENDING }),
  ...(FALL_FIRST_END ? [Object.freeze({ id: "fall_offering_end", alertId: "audit_fuse_fall_offering_end", label: "Fall offering with a dated end (earliest)", expires: FALL_FIRST_END })] : []),
]);
