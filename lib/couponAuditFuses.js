// SERVER-ONLY (imported by lib/commandCenter/alertsRun.js and guards; never by app/ client code).
// The Clipp owner-audit fuses, listed for the Command Center `coupon_audit_*` alert so a lapse is
// announced instead of failing a build. Kept out of lib/coupons.js on purpose: that module is
// reachable from the client bundle, and these labels are dead weight there (check-bundle ratchet).
import { CLIPP_AUDIT_EXPIRY, CLIPP_MERCHANT_AUDIT_EXPIRY, UT_AUDIT_EXPIRY } from "./coupons.js";
import { CLIPP_LAST_MANUAL_AUDIT_AT } from "./clippOffers.js";
import { FAMILY_DAY_EVIDENCE } from "./familyDayEvidence.js";
import { FALL_OFFERING_SOURCES, FALL_PLACE_IDS } from "./fallPool.js";
import { FALL_OFFERING_ENDS, fallOfferingRetired } from "./fallOfferingDates.js";

// Family-day filter facts are first-party-verified and expire (familyFilterFacts returns null once
// `expiresAt` <= now, evaluated at 00:00Z of that date). When the earliest one lapses the facets fall
// back to "unknown" (safe, but the filters shrink), so it is announced here, not by failing a build.
// The alert's "last live day" is the local day BEFORE expiresAt: 20:00 EDT or 19:00 EST the evening before.
// Calendar arithmetic on a YYYY-MM-DD string (no clock, no UTC-instant slicing: lib/siteTime owns "today").
const addDaysIso = (iso, delta) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  const p2 = (n) => String(n).padStart(2, "0");
  return t.getUTCFullYear() + "-" + p2(t.getUTCMonth() + 1) + "-" + p2(t.getUTCDate());
};
const dayBefore = (iso) => addDaysIso(iso, -1);

export const CLIPP_HUMAN_SPOT_CHECK_EXPIRY = addDaysIso(CLIPP_LAST_MANUAL_AUDIT_AT, 30);

// Evidence stays in the registry after its date, but dated presentation retires
// automatically. Select the next ending at request time, not module-load time:
// a warm process must not keep reporting Dead Coconut after Pinto becomes next.
export function fallOfferingEndFuse(today, sources = FALL_OFFERING_SOURCES) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today))) throw new Error("fallOfferingEndFuse requires a venue-local ISO day");
  const dated = Object.entries(sources).map(([id, v]) => ({ id, name: v.name,
    expires: String(v.until || v.ends || ""),
    autoRetires: FALL_OFFERING_ENDS[id] === (v.until || v.ends) }))
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.expires))
    .filter((v) => !v.autoRetires || !fallOfferingRetired(v.id, today))
    .sort((a, b) => a.expires.localeCompare(b.expires));
  if (!dated.length) return null;
  const first = dated.filter((v) => v.expires === dated[0].expires);
  return Object.freeze({ id: "fall_offering_end", alertId: "audit_fuse_fall_offering_end",
    label: `Fall offering: ${first.map((v) => v.name || FALL_PLACE_IDS[v.id] || v.id).join("; ")}`,
    expires: dated[0].expires, autoRetires: first.every((v) => autoRetiresOf(v)) });
}
function autoRetiresOf(v) { return Boolean(v && v.autoRetires); }

const FAMILY_ENTRIES = Object.values(FAMILY_DAY_EVIDENCE);
const FAMILY_LATEST_VERIFIED = FAMILY_ENTRIES.map((e) => String(e.verifiedAt).slice(0, 10)).sort().slice(-1)[0];
const FAMILY_LIVE = FAMILY_ENTRIES.filter((e) => String(e.verifiedAt).slice(0, 10) === FAMILY_LATEST_VERIFIED);
const FAMILY_PENDING = FAMILY_ENTRIES.length - FAMILY_LIVE.length;
const FAMILY_FIRST_EXPIRY = FAMILY_LIVE.map((e) => String(e.expiresAt).slice(0, 10)).sort()[0];

const BASE_AUDIT_FUSES = Object.freeze([
  Object.freeze({ id: "clipp_city_pages", label: "Clipp city-page cards (Sarasota, Bradenton, Tampa, Orlando)", expires: CLIPP_AUDIT_EXPIRY }),
  Object.freeze({ id: "clipp_merchant_cards", label: "Clipp merchant certificate cards", expires: CLIPP_MERCHANT_AUDIT_EXPIRY }),
  Object.freeze({ id: "clipp_human_spot_check", label: "Clipp 30-day human spot-check ceiling", expires: CLIPP_HUMAN_SPOT_CHECK_EXPIRY }),
  Object.freeze({ id: "ut_national_coupons", label: "Undercover Tourist nationwide cards (car rentals, movie tickets)", expires: UT_AUDIT_EXPIRY }),
  Object.freeze({ id: "family_day_evidence", alertId: "audit_fuse_family_day_evidence", label: "Family-day verified filter facts" + (FAMILY_PENDING ? ` (${FAMILY_PENDING} ${FAMILY_PENDING === 1 ? "entry" : "entries"} pending re-audit)` : ""), expires: dayBefore(FAMILY_FIRST_EXPIRY), pending: FAMILY_PENDING }),
]);

export function couponAuditFuses(today) {
  const fall = fallOfferingEndFuse(today);
  return fall ? [...BASE_AUDIT_FUSES, fall] : [...BASE_AUDIT_FUSES];
}
