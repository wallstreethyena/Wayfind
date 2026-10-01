// test-coupon-audit-alert — the owner-audit fuses on the Clipp coupon cards announce
// themselves in the Command Center instead of failing the build (2026-10-01).
//
// Background: a short `expires` forces a human to re-verify the cards. check-guide-deal-cards
// used to read the real date, so every lapse (08-11, 08-23, 09-14, 09-29) failed every Vercel
// build — production stuck on an old deploy. The guard is now pinned; this rule is where the
// lapse is reported. Asserted by CALLING computeAlerts and gatherAlerts' wiring, not by regex.
import { computeAlerts } from "../lib/commandCenter/alerts.js";
import { COUPON_AUDIT_FUSES } from "../lib/coupons.js";
import { buildAlertsReport } from "../lib/commandCenter/alertsRun.js";
import { readFileSync } from "node:fs";

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

if (bad) { console.error(`\ntest-coupon-audit-alert: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`test-coupon-audit-alert: OK — ${n} assertions (silent until 2 days out, warns with days left, reports the lapse as warn, malformed input is inert, real fuses covered, wired through buildAlertsReport)`);
