// test-coupon-audit-alert — the owner-audit fuses on the Clipp coupon cards announce
// themselves in the Command Center instead of failing the build (2026-10-01).
//
// Background: a short `expires` forces a human to re-verify the cards. check-guide-deal-cards
// used to read the real date, so every lapse (08-11, 08-23, 09-14, 09-29) failed every Vercel
// build — production stuck on an old deploy. The guard is now pinned; this rule is where the
// lapse is reported. Asserted by CALLING computeAlerts and gatherAlerts' wiring, not by regex.
import { computeAlerts } from "../lib/commandCenter/alerts.js";
import { COUPON_AUDIT_FUSES } from "../lib/couponAuditFuses.js";
import { buildAlertsReport } from "../lib/commandCenter/alertsRun.js";
import { readFileSync } from "node:fs";
import { COUPONS, couponIsLive } from "../lib/coupons.js";
import { siteTodayStr } from "../lib/siteTime.js";
import { offeringActive } from "../lib/fallEvidence.js";
import { FALL_PLACE_IDS, FALL_OFFERING_SOURCES, FALL_PLACE_RAIL } from "../lib/fallPool.js";
import { FALL_CARD_IDS } from "../lib/fallSkin.js";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const fuse = { id: "t_fuse", label: "Test fuse", expires: "2026-10-12" };
const run = (today, fuses = [fuse]) => computeAlerts({ couponAudit: { today, fuses } }).filter((a) => String(a.id).startsWith("coupon_audit_"));

ok(run("2026-10-01").length === 0, "13 days ahead must be silent");
ok(run("2026-10-09").length === 0, "3 days ahead must be silent");
const soon = run("2026-10-10");
ok(soon.length === 1 && soon[0].severity === "warn" && /2d/.test(soon[0].title), `2 days ahead must warn once with the days left (got ${JSON.stringify(soon.map((a) => a.title))})`);
ok(run("2026-10-12").length === 1 && /0d/.test(run("2026-10-12")[0].title), "the last live day still warns (0d)");
const lapsed = run("2026-10-13");
ok(lapsed.length === 1 && /lapsed/.test(lapsed[0].title) && /1d ago/.test(lapsed[0].current), "the day after must report lapsed 1d ago");
ok(lapsed[0] && lapsed[0].severity === "warn", "a lapse is warn, never critical — it hides cards, it does not break the site");
ok(lapsed[0] && /Builds are NOT affected/.test(lapsed[0].detail || lapsed[0].body || JSON.stringify(lapsed[0])), "the alert says builds are unaffected");
ok(run("2026-10-13", [fuse, { id: "t2", label: "Other", expires: "2027-01-01" }]).length === 1, "only the lapsed fuse alerts");

// Controls: no data / malformed data never throws and never alerts.
ok(computeAlerts({}).filter((a) => String(a.id).startsWith("coupon_audit_")).length === 0, "no couponAudit -> no alert");
ok(run("not-a-date").length === 0, "a malformed today must not alert");
ok(run("2026-10-13", [{ id: "x", label: "x", expires: "soon" }, null]).length === 0, "malformed fuses are skipped, not thrown on");

// The real registry fuses, called at a date past every one of them, must alert for each.
const real = run("2099-01-01", COUPON_AUDIT_FUSES);
ok(real.length === COUPON_AUDIT_FUSES.length && COUPON_AUDIT_FUSES.length >= 2, "every real fuse alerts when lapsed");

// Wiring: the report builder must carry couponAudit through to computeAlerts (a rule nobody feeds is decoration).
const stub = { source: { name: "s", connected: false }, data: null };
const rep = buildAlertsReport({ fractionOfDay: 0.5, todayKey: "2099-01-01", asOf: new Date("2099-01-01T15:00:00Z"),
  dailyHist: stub, todayK: stub, signupHist: stub, signupToday: stub, cwvField: stub, lab: stub, err24: stub, boundary1h: stub,
  sentry: stub, syn: stub, deploys: stub, tpToday: stub, freshness: stub, photos: stub,
  couponAudit: { today: "2099-01-01", fuses: COUPON_AUDIT_FUSES } });
ok(rep.alerts.filter((a) => String(a.id).startsWith("coupon_audit_")).length === COUPON_AUDIT_FUSES.length, "buildAlertsReport forwards couponAudit into the alert rules");
const run_src = readFileSync(new URL("../lib/commandCenter/alertsRun.js", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
ok(/couponAudit:\s*\{\s*today:\s*siteTodayStr\(now\),\s*fuses:\s*COUPON_AUDIT_FUSES\s*\}/.test(run_src), "gatherAlerts passes the venue-local date and the real fuses (weaker, source-level check: gatherAlerts needs live providers)");


// ── Runtime eligibility still follows the REAL (venue-local) day, proven at exact instants ───────────────
// The guards run at a pinned date, so THIS is where the boundary semantics are asserted: the production
// call chain is couponIsLive(c, siteTodayStr(now)). EDT = UTC-4 until 2026-11-01, so 23:59:59 ET on
// 10-12 is 03:59:59Z on 10-13. Inclusive: a coupon is live through its last local day, hidden from 00:00 ET after.
const cityCard = COUPONS.find((c) => c && c.id === "cpn-clipp-fl-sarasota");
ok(!!cityCard && /^\d{4}-\d{2}-\d{2}$/.test(String(cityCard.expires)), "the Sarasota Clipp city card exists and carries an ISO audit expiry");
if (cityCard) {
  const exp = String(cityCard.expires).slice(0, 10);
  const lastInstant = new Date(Date.parse(exp + "T00:00:00Z") + 86400000 + 4 * 3600000 - 1000); // 23:59:59 ET on exp (EDT)
  const nextInstant = new Date(lastInstant.getTime() + 1000);                                    // 00:00:00 ET the day after
  ok(siteTodayStr(lastInstant) === exp, `23:59:59 ET on ${exp} is still ${exp} (got ${siteTodayStr(lastInstant)})`);
  ok(couponIsLive(cityCard, siteTodayStr(lastInstant)) === true, "city card is live at the last second of its last local day");
  ok(siteTodayStr(nextInstant) !== exp && couponIsLive(cityCard, siteTodayStr(nextInstant)) === false, "city card is hidden from 00:00 ET the next day");
  for (const when of ["2026-10-13T15:00:00Z", "2027-03-01T15:00:00Z"]) {
    ok(couponIsLive(cityCard, siteTodayStr(new Date(when))) === (exp >= siteTodayStr(new Date(when))), `eligibility at ${when} follows the audit date`);
  }
}
// Unaudited merchant certificate cards are HIDDEN by real time once their fuse lapses (not renewed here).
const merchantFuse = COUPON_AUDIT_FUSES.find((f) => f.id === "clipp_merchant_cards");
const merchantCards = COUPONS.filter((c) => c && c.expires && String(c.expires).slice(0, 10) === String(merchantFuse && merchantFuse.expires).slice(0, 10));
ok(merchantCards.length > 10, `merchant certificate cards found by their fuse date (${merchantCards.length})`);
// Derived from the fuse itself (not a hard-coded instant), so renewing the fuse after a real audit cannot break this test.
const dayAfterFuse = merchantFuse ? new Date(Date.parse(String(merchantFuse.expires).slice(0, 10) + "T16:00:00Z") + 86400000).toISOString().slice(0, 10) : null;
ok(!!dayAfterFuse && merchantCards.every((c) => couponIsLive(c, dayAfterFuse) === false && couponIsLive(c, String(merchantFuse.expires).slice(0, 10)) === true), "every merchant-fuse card is live on the fuse's last day and hidden the day after (whatever the fuse is renewed to)");
// Malformed / missing audit data is safe: no expiry = no auto-hide rule to fire, bad shapes never throw.
ok(couponIsLive(null, "2026-10-13") === false && couponIsLive({}, "2026-10-13") === false, "null / empty coupon rows are not live and do not throw");

// ── Gideon's: only the expired September offering is retired ────────────────────────────────────────────
const GIDEON = "ChIJC9pvtLN654gR6F0GZH-G-8I";
ok(!(GIDEON in FALL_PLACE_IDS) && !(GIDEON in FALL_OFFERING_SOURCES) && !(GIDEON in FALL_PLACE_RAIL) && !FALL_CARD_IDS.has(GIDEON), "the expired Gideon's September offering is out of all four fall sets");
ok(Object.keys(FALL_PLACE_IDS).length >= 1 && Object.keys(FALL_PLACE_IDS).length === Object.keys(FALL_OFFERING_SOURCES).length, "the fall pool and its offering records stay in step after the retirement (and are not empty)");
// The boundary that made it fail the build, from the real helper: `until` is INCLUSIVE in venue-local time.
const sep30 = (iso) => offeringActive({ ends: "2026-09-30", today: siteTodayStr(new Date(iso)) });
ok(sep30("2026-10-01T03:59:59Z") === true && sep30("2026-10-01T04:00:00Z") === false, "a 2026-09-30 end is active through 23:59:59 ET and expired from 00:00 ET on 10-01");
// Every remaining dated fall offering is active today and has a future end — the NEXT one to expire is a known date, not a surprise.
const dated = Object.values(FALL_OFFERING_SOURCES).filter((v) => v.until).map((v) => v.until).sort();
ok(dated.length >= 1 && dated.every((u) => u >= "2026-10-01"), `remaining dated fall offerings all end on/after 2026-10-01 (next: ${dated[0]})`);

if (bad) { console.error(`\ntest-coupon-audit-alert: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`test-coupon-audit-alert: OK — ${n} assertions (silent until 2 days out, warns with days left, reports the lapse as warn, malformed input is inert, real fuses covered, wired through buildAlertsReport)`);
