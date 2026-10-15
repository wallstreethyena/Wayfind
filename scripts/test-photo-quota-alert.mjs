// scripts/test-photo-quota-alert.mjs — Google's per-day photo quota ran out at
// 22:02Z (6:02 PM ET) on 2026-10-14 and every Google-only card showed the
// placeholder all evening; the whole-day ratio alert stayed quiet. Calls the
// REAL rule (computeAlerts), the REAL source (photoQuotaBreaker, injected
// breaker reader) and the REAL assembly (buildAlertsReport).
import { computeAlerts } from "../lib/commandCenter/alerts.js";
import { photoQuotaBreaker } from "../lib/commandCenter/sources/photos.js";
import { buildAlertsReport } from "../lib/commandCenter/alertsRun.js";

let pass = 0;
const fail = (m) => { console.error("test-photo-quota-alert: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const find = (alerts, id = "photos_quota_exhausted") => alerts.filter((a) => a.id === id);

const AT = "2026-10-14T22:02:00.000Z";
const NOW = new Date("2026-10-15T00:30:00Z"); // 8:30 PM ET
const counts = { today: { ok: 313, "quota-open": 170, "ledger-denied": 61 }, yesterday: { ok: 900 } };
const openBreaker = await photoQuotaBreaker({ breakerOpenImpl: async () => ({ kind: "quota", reason: "x", at: AT }) });

// (a) breaker open at 22:02Z + today's counts -> fires exactly once, with the facts.
{
  ok(openBreaker.data.open && openBreaker.data.expiresAt === "2026-10-15T07:01:00.000Z", "expiry = Pacific midnight + 60s buffer, got " + openBreaker.data.expiresAt);
  const r = find(computeAlerts({ asOf: NOW, photoServing: counts, photoQuotaBreaker: openBreaker.data }));
  ok(r.length === 1, "fires exactly once");
  ok(r[0].severity === "warn", "severity is warn");
  ok(/until 3:01 AM ET/.test(r[0].title), "title says when it clears, got " + r[0].title);
  ok(/6:02 PM ET/.test(r[0].detail), "detail states when it tripped");
  ok(/313 photos served today, 170 refused/.test(r[0].detail), "detail states served + refused counts");
  ok(/GetPhotoMediaRequest/.test(r[0].detail) && /GOOGLE_PHOTOS_MONTH_CAP/.test(r[0].detail), "detail names the per-day quota vs the monthly cap");
}
// (a2) fires without any outcome counts too (breaker alone is enough).
ok(find(computeAlerts({ asOf: NOW, photoQuotaBreaker: openBreaker.data })).length === 1, "breaker alone fires");
// (a3) not with under 2h left (blackout nearly over).
ok(find(computeAlerts({ asOf: new Date("2026-10-15T05:30:00Z"), photoServing: counts, photoQuotaBreaker: openBreaker.data })).length === 0, "under 2h left stays quiet");

// (b) breaker closed -> none.
{
  const closed = await photoQuotaBreaker({ breakerOpenImpl: async () => null });
  ok(closed.data && closed.data.open === false, "closed breaker reads as open:false");
  ok(find(computeAlerts({ asOf: NOW, photoServing: counts, photoQuotaBreaker: closed.data })).length === 0, "closed breaker: no alert even with quota-open counts");
  const reset = await photoQuotaBreaker({ breakerOpenImpl: async () => ({ kind: null, reason: "manually reset", at: AT }) });
  ok(reset.data.open === false, "a reset row (kind null) is closed");
}
// (c) photos_not_serving critical -> new one suppressed (and the old one still fires).
{
  const dead = { today: { "quota-open": 300 }, yesterday: {} };
  const r = computeAlerts({ asOf: NOW, photoServing: dead, photoQuotaBreaker: openBreaker.data });
  ok(find(r, "photos_not_serving")[0]?.severity === "critical", "control: photos_not_serving is critical here");
  ok(find(r).length === 0, "critical photos_not_serving suppresses the quota alert");
  // a WARN photos_not_serving does not suppress it
  const warnOnly = computeAlerts({ asOf: NOW, photoServing: { today: { ok: 5, "quota-open": 400 } }, photoQuotaBreaker: openBreaker.data });
  ok(find(warnOnly, "photos_not_serving")[0]?.severity === "warn" && find(warnOnly).length === 1, "warn-level photos_not_serving still lets the quota alert through");
}
// (d) breaker read failure -> none, no throw.
{
  const bad = await photoQuotaBreaker({ breakerOpenImpl: async () => { throw new Error("cache down"); } });
  ok(bad.data === null && bad.source.connected === false, "read failure is a source error with null data");
  let threw = false, r = [];
  try { r = computeAlerts({ asOf: NOW, photoServing: counts, photoQuotaBreaker: bad.data }); } catch { threw = true; }
  ok(!threw && find(r).length === 0, "null breaker data: no alert, no throw");
  ok(find(computeAlerts({ asOf: NOW, photoServing: counts })).length === 0, "absent key: no alert");
  const junk = await photoQuotaBreaker({ breakerOpenImpl: async () => ({ kind: "quota", at: "garbage" }) });
  ok(junk.data === null, "unparseable breaker timestamp is unreadable, not an alert");
}
// (e) wired through the mailer path.
{
  const src = { source: { name: "x", connected: true }, data: null };
  const base = { fractionOfDay: 0.85, todayKey: "2026-10-14", asOf: NOW, dailyHist: src, todayK: src, signupHist: src, signupToday: src, cwvField: src, lab: src, err24: src, boundary1h: src, sentry: src, syn: src, deploys: src, tpToday: src, freshness: src };
  const photos = { source: { name: "p", connected: true }, data: counts };
  ok(find(buildAlertsReport({ ...base, photos, quotaBreaker: openBreaker }).alerts).length === 1, "buildAlertsReport carries the breaker into computeAlerts");
  ok(find(buildAlertsReport({ ...base, photos }).alerts).length === 0, "no breaker source -> no alert");
  ok(find(buildAlertsReport({ ...base, photos, quotaBreaker: { source: { name: "q", connected: false }, data: null } }).alerts).length === 0, "failed breaker source -> no alert");
}
// (f) stale copy fixed.
{
  const r = find(computeAlerts({ photoServing: { today: { "ledger-denied": 299 } } }), "photos_not_serving")[0];
  ok(r && /show the photo placeholder/.test(r.detail), "photos_not_serving says cards show the photo placeholder");
  ok(r && !/initials/.test(r.detail), "photos_not_serving no longer mentions initials (positive control: the placeholder phrase is found above)");
}
console.log(`test-photo-quota-alert: OK — ${pass} assertions (breaker open fires once; closed/failed/critical-overlap/near-expiry stay quiet; source + mailer wiring called for real)`);
