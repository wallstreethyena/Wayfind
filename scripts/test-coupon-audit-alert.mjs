// test-coupon-audit-alert — the owner-audit fuses on the Clipp coupon cards announce
// themselves in the Command Center instead of failing the build (2026-10-01).
//
// Background: a short `expires` forces a human to re-verify the cards. check-guide-deal-cards
// used to read the real date, so every lapse (08-11, 08-23, 09-14, 09-29) failed every Vercel
// build — production stuck on an old deploy. The guard is now pinned; this rule is where the
// lapse is reported. Asserted by CALLING computeAlerts and gatherAlerts' wiring, not by regex.
import { computeAlerts } from "../lib/commandCenter/alerts.js";
import { couponAuditFuses, fallOfferingEndFuse } from "../lib/couponAuditFuses.js";
import { buildAlertsReport } from "../lib/commandCenter/alertsRun.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { COUPONS, couponIsLive } from "../lib/coupons.js";
import { siteTodayStr } from "../lib/siteTime.js";
import { offeringActive } from "../lib/fallEvidence.js";
import { FALL_PLACE_IDS, FALL_OFFERING_SOURCES, FALL_PLACE_RAIL } from "../lib/fallPool.js";
import { FALL_CARD_IDS } from "../lib/fallSkin.js";

const COUPON_AUDIT_FUSES = couponAuditFuses("2026-11-01");
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const fuse = { id: "t_fuse", label: "Test fuse", expires: "2026-10-12" };
const run = (today, fuses = [fuse]) => computeAlerts({ couponAudit: { today, fuses } }).filter((a) => /^(coupon_audit_|audit_fuse_)/.test(String(a.id)));

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
ok(computeAlerts({}).filter((a) => /^(coupon_audit_|audit_fuse_)/.test(String(a.id))).length === 0, "no couponAudit -> no alert");
ok(run("not-a-date").length === 0, "a malformed today must not alert");
ok(run("2026-10-13", [{ id: "x", label: "x", expires: "soon" }, null]).length === 0, "malformed fuses are skipped, not thrown on");

// The real registry fuses, called at a date past every one of them, must alert for each.
const real = run("2099-01-01", COUPON_AUDIT_FUSES);
ok(real.length === COUPON_AUDIT_FUSES.filter((f) => !f.autoRetires).length && COUPON_AUDIT_FUSES.length >= 2, "every unmanaged fuse alerts when lapsed; managed ends do not");

// Family facts use their own registry and fail to unknown, rather than hiding
// coupons or changing guide attribution. Exercise both notification paths.
const familyFuse = COUPON_AUDIT_FUSES.find((f) => f.id === "family_day_evidence");
ok(!!familyFuse, "the real family-day audit fuse exists");
const familyNotice = (daysAfter) => {
  const day = new Date(Date.parse(familyFuse.expires + "T12:00:00Z") + daysAfter * 86400000).toISOString().slice(0, 10);
  return run(day, [familyFuse])[0];
};
for (const daysAfter of [-2, 1]) {
  const notice = familyNotice(daysAfter);
  ok(notice && notice.id === "audit_fuse_family_day_evidence" && notice.severity === "warn", `family notice keeps its cooldown identity and severity (${daysAfter})`);
  ok(notice && /lib\/familyDayEvidence\.js/.test(notice.detail) && /verifiedAt/.test(notice.detail) && /expiresAt/.test(notice.detail), `family notice names the actual evidence fields to renew (${daysAfter})`);
  ok(notice && /unknown/.test(notice.detail) && /filters/.test(notice.detail), `family notice explains the actual filter degradation (${daysAfter})`);
  ok(notice && !/lib\/coupons\.js|cards.*hid|cards.*hide|untracked|guide CTA/.test(notice.detail), `family notice does not claim coupon or attribution effects (${daysAfter})`);
  ok(notice && notice.baseline === "re-audited monthly", `family notice uses the evidence's monthly cadence (${daysAfter})`);
}
ok(run("2026-10-28", [familyFuse]).length === 0, "renewed family evidence does not produce the screenshot's stale lapse alert");
ok(/lib\/coupons\.js/.test(lapsed[0].detail) && /untracked/.test(lapsed[0].detail), "the Clipp notice retains its coupon and attribution repair instructions");

// A seasonal end is not a Clipp verification fuse. Never tell the owner
// to extend an event date or repair coupon attribution for this alert.
const fallFuse = COUPON_AUDIT_FUSES.find((f) => f.id === "fall_offering_end");
ok(!!fallFuse && /^Fall offering: \S/.test(fallFuse.label), "the earliest fall ending identifies the actual offering, rather than an unnamed offering");
// Dates derive from the live fuse (the earliest dated fall end changes as
// entries are retired — Hashtag Café, ended 2026-10-30, was the first case).
const shiftDay = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const fallEnd = fallFuse?.expires;
for (const today of [shiftDay(fallEnd, -2), fallEnd]) {
  const notice = run(today, [fallFuse])[0];
  ok(notice && notice.id === "audit_fuse_fall_offering_end" && notice.severity === "info", `enforced retirement is routine information, not owner work (${today})`);
  ok(notice && /automatically/.test(notice.detail) && /Keep the verified end date/.test(notice.detail), `notice preserves the date and explains retirement (${today})`);
  ok(notice && !/lib\/coupons\.js|untracked|blocks builds/.test(notice.detail), `automatic retirement does not invent coupon or build failures (${today})`);
}
ok(/ends today/.test(run(fallEnd, [fallFuse])[0]?.title), "the last local day is still live");
ok(run(shiftDay(fallEnd, 1), [fallFuse]).length === 0, "managed ended offering does not demand manual cleanup");
ok(/Pinto/.test(fallOfferingEndFuse("2026-11-02").label), "a warm process advances from Dead Coconut to Pinto the next day");
ok(fallOfferingEndFuse("2026-11-08").expires === "2026-11-08", "Pinto retains its own inclusive final day");
ok(/Crema/.test(fallOfferingEndFuse("2026-11-09").label), "the next dated offering follows Pinto");
ok(fallOfferingEndFuse("2026-11-30") === null, "all managed ends retired leaves no false warning");
ok(fallOfferingEndFuse("2027-10-01") === null, "old dates cannot resurrect or mask a new season");
const unmanaged = fallOfferingEndFuse("2026-11-02", { "unknown-place": { name: "Unmanaged", until: "2026-11-01" } });
ok(unmanaged.autoRetires === false && run("2026-11-02", [unmanaged])[0]?.severity === "warn", "an expiry without a shared enforcement rule still demands repair");
const drifted = fallOfferingEndFuse("2026-11-02", { "ChIJwZ_GK-d-54gRm5Ahg7PZYeY": { name: "Drift", until: "2026-10-31" } });
ok(drifted.autoRetires === false && run("2026-11-02", [drifted])[0]?.severity === "warn", "mismatched published and client dates cannot claim automatic handling");

// Wiring: the report builder must carry couponAudit through to computeAlerts (a rule nobody feeds is decoration).
const stub = { source: { name: "s", connected: false }, data: null };
const rep = buildAlertsReport({ fractionOfDay: 0.5, todayKey: "2099-01-01", asOf: new Date("2099-01-01T15:00:00Z"),
  dailyHist: stub, todayK: stub, signupHist: stub, signupToday: stub, cwvField: stub, lab: stub, err24: stub, boundary1h: stub,
  sentry: stub, syn: stub, deploys: stub, tpToday: stub, freshness: stub, photos: stub,
  couponAudit: { today: "2099-01-01", fuses: COUPON_AUDIT_FUSES } });
ok(rep.alerts.filter((a) => /^(coupon_audit_|audit_fuse_)/.test(String(a.id))).length === COUPON_AUDIT_FUSES.length - 1, "buildAlertsReport forwards couponAudit into the alert rules");
const run_src = readFileSync(new URL("../lib/commandCenter/alertsRun.js", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
ok(/couponAudit:\s*\{\s*today:\s*siteTodayStr\(now\),\s*fuses:\s*couponAuditFuses\(siteTodayStr\(now\)\)\s*\}/.test(run_src), "gatherAlerts passes the venue-local date and the real fuses (weaker, source-level check: gatherAlerts needs live providers)");


// ── Runtime eligibility still follows the REAL (venue-local) day, proven at exact instants ───────────────
// The guards run at a pinned date, so THIS is where the boundary semantics are asserted: the production
// call chain is couponIsLive(c, siteTodayStr(now)). EDT = UTC-4 until 2026-11-01, so 23:59:59 ET on
// 10-12 is 03:59:59Z on 10-13. Inclusive: a coupon is live through its last local day, hidden from 00:00 ET after.
const cityCard = COUPONS.find((c) => c && c.id === "cpn-clipp-fl-sarasota");
ok(!!cityCard && /^\d{4}-\d{2}-\d{2}$/.test(String(cityCard.expires)), "the Sarasota Clipp city card exists and carries an ISO audit expiry");
if (cityCard) {
  const exp = String(cityCard.expires).slice(0, 10);
  // Compute the exact 23:59:59 ET instant on `exp` whether `exp` falls in EDT (UTC-4) or EST (UTC-5 after Nov 1).
  const candidateEdt = new Date(Date.parse(exp + "T00:00:00Z") + 86400000 + 4 * 3600000 - 1000);
  const candidateEst = new Date(Date.parse(exp + "T00:00:00Z") + 86400000 + 5 * 3600000 - 1000);
  const lastInstant = siteTodayStr( new Date(candidateEdt.getTime() + 1000)) !== exp ? candidateEdt : candidateEst;
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


// ── Stable alert identity: the countdown must never enter the id (the cc-alerts cooldown is keyed by id) ──
{
  const f = { id: "x_fuse", label: "X", expires: "2026-10-12" };
  const ids = new Set(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-20"].flatMap((d) => run(d, [f]).map((a) => a.id)));
  ok(ids.size === 1 && [...ids][0] === "coupon_audit_x_fuse", `one stable id across the whole countdown and lapse (got ${JSON.stringify([...ids])})`);
  const g = { id: "fam", alertId: "audit_fuse_fam", label: "F", expires: "2026-10-12" };
  ok(run("2026-10-11", [g])[0] && run("2026-10-11", [g])[0].id === "audit_fuse_fam", "an explicit alertId is honored (family-day evidence)");
  ok(run("2026-10-13", [f, g]).length === 2 && run("2026-10-13", [f, g]).every((a) => a.severity === "warn"), "both families warn, never critical");
  // renewal: moving the date forward clears the warning (no alert is produced for a renewed fuse)
  ok(run("2026-10-13", [{ ...f, expires: "2026-10-26" }]).length === 0, "renewing a lapsed fuse clears its warning");
}

// ── The fuse list stays SERVER-ONLY (2026-10-01: its labels in the client bundle failed the #1600 production build) ──
// Executed as a scan of every source file under app/ and lib/: only the alert gatherer may import it. (The
// 498KB route ratchet can no longer see this — #1607 left ~47KB of headroom — so the boundary is asserted directly.)
{
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files = [];
  const walk = (dir) => { for (const e of readdirSync(dir)) { if (e === "node_modules" || e.startsWith(".")) continue; const p = join(dir, e); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e)) files.push(p); } };
  walk(join(root, "app")); walk(join(root, "lib"));
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const importers = files.filter((f) => /(?:from\s*|import\s*\(?\s*)["'][^"']*couponAuditFuses(?:\.js)?["']/.test(code(readFileSync(f, "utf8")))).map((f) => relative(root, f));
  ok(files.length > 500, `scanned a real tree (${files.length} files under app/ + lib/) — a 0 here would prove nothing`);
  ok(importers.length === 1 && importers[0] === "lib/commandCenter/alertsRun.js", `only lib/commandCenter/alertsRun.js imports lib/couponAuditFuses.js (found ${JSON.stringify(importers)})`);
}
if (bad) { console.error(`\ntest-coupon-audit-alert: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`test-coupon-audit-alert: OK — ${n} assertions (silent until 2 days out, warns with days left, reports the lapse as warn, malformed input is inert, real fuses covered, wired through buildAlertsReport)`);
