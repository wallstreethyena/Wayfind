// scripts/test-photo-serving-alert.mjs — the blank-photo outage (Sep 24–28,
// 2026: ledger-denied 299–1,472/day, ZERO ok) must page the owner. Calls the
// REAL rule (computeAlerts) and the REAL source (photoServing, fake fetch),
// with the production numbers from that week as the fixture.
import { computeAlerts, PHOTO_MIN_ATTEMPTS } from "../lib/commandCenter/alerts.js";
import { photoServing } from "../lib/commandCenter/sources/photos.js";
import { buildAlertsReport } from "../lib/commandCenter/alertsRun.js";

let pass = 0;
const fail = (m) => { console.error("test-photo-serving-alert: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const find = (alerts) => alerts.find((a) => a.id === "photos_not_serving");

// 1. The real incident: Sep 27 (815 denied, 0 ok) as yesterday, Sep 28 partial as today.
{
  const a = find(computeAlerts({ photoServing: { yesterday: { "ledger-denied": 815 }, today: { "ledger-denied": 299 } } }));
  ok(a && a.severity === "critical", "zero served with real demand is CRITICAL");
  ok(/GOOGLE_PHOTOS_MONTH_CAP/.test(a.detail), "the page names the setting to check");
}
// 2. Healthy control (Sep 22: 94 ok, 513 denied is the pre-outage norm → 84% refused, below the warn line).
ok(!find(computeAlerts({ photoServing: { yesterday: { ok: 94, "ledger-denied": 513 }, today: { ok: 40, "ledger-denied": 60 } } })), "a normal day (photos served) does not page");
// 3. Early warning: served, but >=90% refused at volume → warn, not critical.
{
  const a = find(computeAlerts({ photoServing: { today: { ok: 5, "ledger-denied": 400 } } }));
  ok(a && a.severity === "warn", "95%+ refused at volume is a WARN");
}
// 4. Too little demand never fires; missing data never fires.
ok(!find(computeAlerts({ photoServing: { today: { "ledger-denied": PHOTO_MIN_ATTEMPTS - 1 } } })), "below the demand floor stays quiet");
ok(!find(computeAlerts({ photoServing: null })), "no data is not an outage");
ok(!find(computeAlerts({})), "absent bundle key is not an outage");
// 5. Google quota answers count as refusals too.
ok(find(computeAlerts({ photoServing: { today: { quota: 80 } } })), "Google quota refusals count");

// 6. The source: reads ET today+yesterday and folds rows per day.
{
  let url = "";
  const fetchImpl = async (u) => { url = u; return { ok: true, json: async () => [
    { day: "2026-09-28", class: "ledger-denied", n: 299 }, { day: "2026-09-27", class: "ledger-denied", n: 815 }, { day: "2026-09-27", class: "ok", n: 0 },
  ] }; };
  const r = await photoServing({ sb: { url: "https://x.supabase.co", key: "k" }, fetchImpl, now: new Date("2026-09-29T02:30:00Z") });
  ok(r.source && r.source.connected !== false, "source reports connected");
  ok(/day=in\.\(2026-09-28,2026-09-27\)/.test(url), "queries the ET today and yesterday (10:30 PM ET is still Sep 28) — got " + url);
  ok(r.data.today["ledger-denied"] === 299 && r.data.yesterday["ledger-denied"] === 815, "rows fold into per-day class counts");
  const bad = await photoServing({ sb: { url: "https://x.supabase.co", key: "k" }, fetchImpl: async () => ({ ok: false, status: 500 }), now: new Date("2026-10-02T12:00:00Z") });
  ok(bad.data === null && bad.source.connected === false, "an HTTP failure is a source error, never a fabricated zero");
  const none = await photoServing({ env: {} });
  ok(none.data === null && none.source.connected === false, "unconfigured Supabase is reported as missing");
}

// 7. Wired end to end: buildAlertsReport passes the source through to the rule.
{
  const src = { source: { name: "x", connected: true }, data: null };
  const base = { fractionOfDay: 0.5, todayKey: "2026-09-28", asOf: new Date("2026-09-28T17:00:00Z"), dailyHist: src, todayK: src, signupHist: src, signupToday: src, cwvField: src, lab: src, err24: src, boundary1h: src, sentry: src, syn: src, deploys: src, tpToday: src, freshness: src };
  const r = buildAlertsReport({ ...base, photos: { source: { name: "p", connected: true }, data: { today: { "ledger-denied": 299 }, yesterday: { "ledger-denied": 815 } } } });
  ok(find(r.alerts), "buildAlertsReport carries photoServing into computeAlerts (the mailer path)");
  ok(!find(buildAlertsReport(base).alerts), "no photos source → no photo alert (older callers unaffected)");
}

console.log(`test-photo-serving-alert: OK — ${pass} assertions (Sep 24–28 outage pages critical; healthy/low-demand/missing data stay quiet; source + mailer wiring called for real)`);
