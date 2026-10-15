// scripts/test-photo-quota-pacing.mjs — proactive Google daily photo-quota pacing
// (2026-10-15). Yesterday Google's own quota ran out at 6:02 PM ET with no warning.
// CALL-based and hermetic: the REAL source (photoGoogleQuota) runs against a fake
// fetch that speaks PostgREST counts, its output feeds the REAL rule (computeAlerts),
// and buildGoogleQuota (the health JSON block) is called directly. No process.env,
// no network. Also proves nothing can raise a Google quota: every request the code
// makes is a GET to the (fake) Supabase host.
import { readFileSync } from "node:fs";
import { computeAlerts } from "../lib/commandCenter/alerts.js";
import { photoGoogleQuota } from "../lib/commandCenter/sources/photoQuota.js";
import { buildAlertsReport } from "../lib/commandCenter/alertsRun.js";
import {
  GOOGLE_PHOTOS_DAILY_QUOTA, PHOTO_PURCHASE_SPIKE_MIN, googleQuotaDayStart, googleQuotaNextReset, googleQuotaDayKey, buildGoogleQuota,
} from "../lib/googlePhotoQuota.js";

let pass = 0;
const fail = (m) => { console.error("test-photo-quota-pacing: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const SB = { url: "https://x.supabase.co", key: "k" };
const NOW = new Date("2026-10-15T18:00:00Z"); // 2 PM ET / 11 AM PDT
const requests = [];

// Fake PostgREST. opts: used, lastHour, reqLastHour, failDay, failHour, rows (granted last-hour rows), capRows.
function fakeFetch(o) {
  return async (url, init = {}) => {
    const u = String(url);
    requests.push({ url: u, method: (init && init.method) || "GET" });
    const res = (body, count) => ({ ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === "content-range" && count != null ? `0-0/${count}` : null) }, json: async () => body });
    const bad = (status) => ({ ok: false, status, headers: { get: () => null }, json: async () => ({}) });
    if (u.includes("/wf_photo_purchase?")) {
      const isHour = u.includes(encodeURIComponent(new Date(NOW.getTime() - 3600000).toISOString())) || o.hourIso && u.includes(o.hourIso);
      if (u.includes("ledger_reason=eq.visitor-cap")) return res(o.capRows || [], null);
      if (u.includes("ua_class,bucket_hash")) return res(o.rows || [], null);
      if (u.includes("ledger_reason=eq.granted")) {
        if (isHour) return o.failHour ? bad(500) : res([], o.lastHour);
        return o.failDay ? (o.failDay === "throw" ? Promise.reject(new Error("net down")) : bad(500)) : res([], o.used);
      }
      return res([], o.reqLastHour ?? o.lastHour); // all requests, last hour
    }
    if (u.includes("/wf_spend_ledger?")) return res([{ used: 4200, cap: 10000 }], null);
    return bad(404);
  };
}
const gather = async (o, now = NOW) => photoGoogleQuota({ sb: SB, now, fetchImpl: fakeFetch(o) });
const pacing = (alerts) => alerts.filter((a) => a.id === "photos_quota_pacing");
const spike = (alerts) => alerts.filter((a) => a.id === "photos_purchase_spike");
const run = async (o, extra = {}, now = NOW) => {
  const g = await gather(o, now);
  return { g, alerts: computeAlerts({ asOf: now, googlePhotoQuota: g.data, ...extra }) };
};

// (0) the named constant, and it is not env-driven.
ok(GOOGLE_PHOTOS_DAILY_QUOTA === 1000, "daily quota constant is 1000");
ok(PHOTO_PURCHASE_SPIKE_MIN === 150, "spike threshold constant is 150");
{
  const src = readFileSync(new URL("../lib/googlePhotoQuota.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  ok(/export const GOOGLE_PHOTOS_DAILY_QUOTA\s*=\s*1000\s*;/.test(src), "quota declared as a literal export const");
  ok(!/process\.env/.test(src), "quota module never reads env");
}

// (1) band transitions at 69% / 70% / 85% / 95%.
{
  const b69 = await run({ used: 699, lastHour: 40 });
  ok(b69.g.data.used === 699 && b69.g.data.monthUsed === 4200 && b69.g.data.monthCap === 10000, "source reads day count and month ledger");
  ok(pacing(b69.alerts).length === 0, "69.9%: no pacing alert");
  const b70 = pacing((await run({ used: 700, lastHour: 100 })).alerts);
  ok(b70.length === 1 && b70[0].severity === "warn" && /:b1$/.test(b70[0].dedupeKey), "70%: one warn, band 1");
  const b84 = pacing((await run({ used: 849, lastHour: 100 })).alerts);
  ok(b84.length === 1 && /:b1$/.test(b84[0].dedupeKey), "84.9%: still band 1");
  const b85 = pacing((await run({ used: 850, lastHour: 100 })).alerts);
  ok(b85.length === 1 && b85[0].severity === "warn" && /:b2$/.test(b85[0].dedupeKey), "85%: warn, band 2");
  ok(b85[0].title !== b70[0].title && b85[0].dedupeKey !== b70[0].dedupeKey, "band 2 has a distinct message and dedupe key");
  const b95 = pacing((await run({ used: 950, lastHour: 100 })).alerts);
  ok(b95.length === 1 && b95[0].severity === "critical" && /:b3$/.test(b95[0].dedupeKey), "95%: critical, band 3");
  // Same band, same Pacific day => same key (mailer cooldown holds it); next Pacific day => new key.
  const again = pacing((await run({ used: 720, lastHour: 5 })).alerts);
  ok(again[0].dedupeKey === b70[0].dedupeKey, "same band + same day = same dedupe key (no re-send inside cooldown)");
  const nextDay = pacing((await run({ used: 720, lastHour: 5 }, {}, new Date("2026-10-16T18:00:00Z"))).alerts);
  ok(nextDay[0].dedupeKey !== b70[0].dedupeKey, "a new Pacific day gets a fresh key");
  // Message contents (band 2, projection at 100/h: 150 left => 1.5h => 3:30 PM ET).
  const d = b85[0].detail;
  ok(/850 of 1000/.test(d) && /85%/.test(d), "message: used/limit and %");
  ok(/3:30 PM ET/.test(d), "message: projected exhaustion in ET clock time, got: " + d);
  ok(/100 photo calls in the last hour/.test(d), "message: last-hour requests");
  ok(/5800 of 10000 left in the monthly budget/.test(d), "message: monthly budget remaining");
  ok(/only with owner approval/.test(d) && /nothing raises it automatically/.test(d), "message: recovery action, owner approval, no auto-raise");
}

// (2) breaker already open => pacing suppressed (photos_quota_exhausted covers it).
{
  const open = { open: true, at: "2026-10-15T17:00:00.000Z", expiresAt: "2026-10-16T07:01:00.000Z" };
  const r = await run({ used: 990, lastHour: 100 }, { photoQuotaBreaker: open });
  ok(pacing(r.alerts).length === 0, "breaker open: no pacing alert");
  ok(r.alerts.some((a) => a.id === "photos_quota_exhausted"), "control: the exhausted alert still fires");
  ok(pacing(computeAlerts({ asOf: NOW, googlePhotoQuota: r.g.data, photoQuotaBreaker: { open: false } })).length === 1, "breaker closed: pacing fires");
}

// (3) spike alert: 149 quiet, 150 fires, with top ua_class + distinct buckets and no raw identifiers.
{
  const rows = [];
  for (let i = 0; i < 150; i++) rows.push({ ua_class: i < 100 ? "desktop-chrome" : "ios-safari", bucket_hash: "b" + (i % 7).toString().padStart(31, "0") });
  const lo = await run({ used: 300, lastHour: 149, rows });
  ok(spike(lo.alerts).length === 0, "149 in the last hour: no spike");
  const hi = await run({ used: 300, lastHour: 150, rows });
  const s = spike(hi.alerts);
  ok(s.length === 1 && s[0].severity === "warn", "150 in the last hour: spike warn");
  ok(/desktop-chrome \(100 calls\)/.test(s[0].detail) && /7 distinct visitor buckets/.test(s[0].detail), "spike names top ua_class and distinct bucket count");
  ok(!/b0{20}/.test(JSON.stringify(s[0])), "spike carries no raw bucket identifiers");
}

// (4) Pacific day boundary, both DST seasons.
{
  const iso = (d) => googleQuotaDayStart(new Date(d)).toISOString();
  ok(iso("2026-10-15T18:00:00Z") === "2026-10-15T07:00:00.000Z", "PDT: day starts 07:00Z");
  ok(iso("2026-12-15T18:00:00Z") === "2026-12-15T08:00:00.000Z", "PST: day starts 08:00Z");
  ok(iso("2026-10-15T06:59:00Z") === "2026-10-14T07:00:00.000Z", "PDT: 06:59Z is still the previous Pacific day");
  ok(iso("2026-10-15T07:00:00Z") === "2026-10-15T07:00:00.000Z", "PDT: 07:00Z starts the new day");
  ok(iso("2026-12-15T07:59:00Z") === "2026-12-14T08:00:00.000Z", "PST: 07:59Z is still the previous Pacific day");
  ok(iso("2026-11-01T12:00:00Z") === "2026-11-01T07:00:00.000Z", "fall-back day starts at PDT midnight (07:00Z)");
  ok(iso("2026-03-08T20:00:00Z") === "2026-03-08T08:00:00.000Z", "spring-forward day starts at PST midnight (08:00Z)");
  ok(googleQuotaNextReset(new Date("2026-10-15T18:00:00Z")).toISOString() === "2026-10-16T07:00:00.000Z", "PDT next reset 07:00Z");
  ok(googleQuotaNextReset(new Date("2026-12-15T18:00:00Z")).toISOString() === "2026-12-16T08:00:00.000Z", "PST next reset 08:00Z");
  ok(googleQuotaDayKey(new Date("2026-10-15T06:59:00Z")) === "2026-10-14", "day key follows Pacific, not UTC");
  // The source filters on that boundary (not the UTC or ET one).
  requests.length = 0;
  await gather({ used: 10, lastHour: 1 }, new Date("2026-12-15T18:00:00Z"));
  const dayReq = requests.find((r) => r.url.includes("ledger_reason=eq.granted") && r.url.includes(encodeURIComponent("2026-12-15T08:00:00.000Z")));
  ok(!!dayReq, "PST: day count is filtered ts>=2026-12-15T08:00:00.000Z");
  requests.length = 0;
  await gather({ used: 10, lastHour: 1 }, new Date("2026-10-15T18:00:00Z"));
  ok(requests.some((r) => r.url.includes("ledger_reason=eq.granted") && r.url.includes(encodeURIComponent("2026-10-15T07:00:00.000Z"))), "PDT: day count is filtered ts>=2026-10-15T07:00:00.000Z");
  ok(requests.some((r) => r.url.includes("ledger_reason=eq.granted")) && requests.filter((r) => r.url.includes("ledger_reason=eq.granted")).every((r) => !r.url.includes("upstream")), "counts ALL granted rows regardless of upstream");
  ok(requests.filter((r) => r.url.includes("/wf_photo_purchase?select=id")).every((r) => /limit=1/.test(r.url)), "counts use limit=1");
}

// (5) fail-soft: unreadable counts => no alert, no throw.
{
  for (const failDay of [true, "throw"]) {
    let threw = false, r;
    try { r = await run({ used: 990, lastHour: 100, failDay }); } catch { threw = true; }
    ok(!threw, "count failure (" + failDay + ") does not throw");
    ok(r.g.data === null && r.g.source.connected === false, "count failure: null data + source error");
    ok(pacing(r.alerts).length === 0 && spike(r.alerts).length === 0, "count failure: no pacing/spike alert");
  }
  const noSb = await photoGoogleQuota({ sb: null, env: {}, now: NOW, fetchImpl: fakeFetch({}) });
  ok(noSb.data === null, "unconfigured Supabase: null data");
  // Last-hour read failing degrades the message, not the alert.
  const part = await run({ used: 750, failHour: true });
  ok(part.g.data.lastHour === null && pacing(part.alerts).length === 1 && /last-hour rate unknown/.test(pacing(part.alerts)[0].detail), "last-hour failure still alerts, says rate unknown");
  // Assembly: a failed quota read neither pages source_errors nor throws.
  const stub = { source: { connected: true }, data: [] };
  const rep = buildAlertsReport({ fractionOfDay: 0.5, todayKey: "2026-10-15", asOf: NOW, dailyHist: stub, todayK: stub, signupHist: stub, signupToday: stub, cwvField: stub, lab: stub, err24: stub, boundary1h: stub, sentry: stub, syn: stub, deploys: stub, tpToday: stub, freshness: stub, googleQuota: await gather({ failDay: true }) });
  ok(!rep.alerts.some((a) => a.id === "photos_quota_pacing" || a.id === "source_errors"), "buildAlertsReport: failed quota read adds no alert");
  const rep2 = buildAlertsReport({ fractionOfDay: 0.5, todayKey: "2026-10-15", asOf: NOW, dailyHist: stub, todayK: stub, signupHist: stub, signupToday: stub, cwvField: stub, lab: stub, err24: stub, boundary1h: stub, sentry: stub, syn: stub, deploys: stub, tpToday: stub, freshness: stub, googleQuota: await gather({ used: 900, lastHour: 50 }) });
  ok(pacing(rep2.alerts).length === 1, "buildAlertsReport wires the quota source into the rule");
}

// (6) health JSON block.
{
  const g = (await gather({ used: 750, lastHour: 100 })).data;
  const q = buildGoogleQuota(g, NOW);
  ok(q && q.dayStartPT === "2026-10-15T07:00:00.000Z" && q.used === 750 && q.limit === 1000 && q.pct === 75 && q.lastHour === 100, "googleQuota block fields");
  ok(q.projectedExhaustET === "4:30 PM", "googleQuota.projectedExhaustET at the last-hour rate, got " + q.projectedExhaustET);
  ok(buildGoogleQuota({ used: 750, lastHour: 0 }, NOW).projectedExhaustET === null, "no rate => projectedExhaustET null");
  ok(buildGoogleQuota(null, NOW) === null, "no data => null block");
}

// (7) nothing auto-raises any quota: every request across the whole run was a GET to the Supabase host.
{
  ok(requests.length > 0, "control: requests were recorded");
  const all = requests.map((r) => r);
  ok(all.every((r) => r.method === "GET" && r.url.startsWith("https://x.supabase.co/rest/v1/")), "only GETs to the Supabase REST host");
  ok(!all.some((r) => /googleapis|serviceusage|cloudquotas/i.test(r.url)), "no request to googleapis / serviceusage");
  const mailer = readFileSync(new URL("../app/api/cron/cc-alerts/route.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  ok(/sent\[a\.dedupeKey \|\| a\.id\]\s*=/.test(mailer) && /Date\.parse\(sent\[a\.dedupeKey \|\| a\.id\]/.test(mailer), "mailer cools down per dedupeKey (assignment + lookup)");
}

console.log(`test-photo-quota-pacing: OK — ${pass} assertions (bands 69/70/85/95, breaker suppression, spike 149/150, PT boundary PDT+PST+DST days, fail-soft, no googleapis/serviceusage)`);
