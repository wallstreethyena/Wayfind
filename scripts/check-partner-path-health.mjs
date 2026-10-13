#!/usr/bin/env node
// scripts/check-partner-path-health.mjs — A PARTNER PATH THAT HAS GONE DARK IS
// DETECTED BY A DETERMINISTIC CHECK, NOT BY SOMEONE NOTICING A WEEKLY DROP.
//
// THE INCIDENT (2026-10-13). Week of 10-06: Viator 71 redirects, Undercover
// Tourist 13, Tiqets 3, Clipp 3, Stay22 0, Klook 0 (prior week 21/13/8/12/7). Clipp's
// two audit fuses had lapsed (51 live coupons -> 0), UT cards were dropped from
// /guides by the Google-photo credit policy, Stay22 sits behind a fail-closed gate.
// revenue-heartbeat stayed green because Viator carries the site-wide ratio.
//
// This guard runs on a FIXED CLOCK, so a real-world lapse never breaks a build
// (the fuse lapses are announced by the cron + Command Center, per #1600). What it
// locks is the LOGIC and the WIRING:
//   1. positive control   a healthy fixture passes
//   2. negative control   every offer expired -> FAIL, and the expired offers are queued
//   3. boundary           last offer expiring in 13 / 14 days warns, in 15 does not;
//                         queue carries owner "Gabe" and deadline = expires - 7d
//   4. per-city           a required city with zero live offers fails the provider
//   5. verdict            zero clicks alone NEVER pages; invalid path + healthy traffic pages;
//                         invalid path on a quiet window only warns; overdue renewal pages
//   6. fail loud          an unreadable inventory source is UNMEASURED and pages, never "ok"
//   7. the REAL registries, on fixed clocks: at 2026-09-20 every expected provider has live
//      offers (collectors really read coupons/registry/hotel allow-list); at 2026-10-13 Clipp
//      is the FAIL the incident was (so reintroducing "expired counted as live" turns this red)
//   8. wired: guards.txt, vercel.json cron, route uses recordPulse + the pure verdict,
//      the PostHog exposure query exists, nothing in the path writes/renews offers.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  EXPECTED_PROVIDERS, RENEWAL_WINDOW_DAYS, MIN_TRAFFIC_PAGEVIEWS, DEFAULT_OWNER,
  evaluatePartnerPaths, partnerPathVerdict, partnerPathPulseRow, offerIsLive, addDays,
} from "../lib/partnerPathHealth.js";
import { collectPartnerOffers, REQUIRED_CITIES } from "../lib/partnerPathInventory.js";
import { exposureFromRows } from "../app/api/cron/partner-path/route.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error("  FAIL: " + msg); } };

const T = "2026-10-01";
const healthyOffers = EXPECTED_PROVIDERS.map((p) => ({ provider: p, offerId: p + "-1", expires: null }));

// 1. positive control
const good = evaluatePartnerPaths(healthyOffers, T);
ok(good.ok && good.failing.length === 0 && good.queue.length === 0, "healthy fixture passes with an empty queue");

// 2. negative control
const dead = evaluatePartnerPaths(healthyOffers.map((o) => o.provider === "clipp" ? { ...o, expires: "2026-09-28" } : o), T);
ok(!dead.ok && dead.failing.includes("clipp") && dead.providers.clipp.live === 0, "all-expired provider FAILS with live=0");
ok(dead.queue.length === 1 && dead.queue[0].expired === true && dead.queue[0].offerId === "clipp-1", "expired offer is in the renewal queue");
ok(!offerIsLive({ provider: "clipp", offerId: "x", expires: "2026-09-30" }, T) && offerIsLive({ provider: "clipp", offerId: "x", expires: T }, T), "expiry is inclusive of its last day (same rule as couponIsLive)");
ok(!evaluatePartnerPaths([], T).ok, "no offers at all fails (absent registry is not a pass)");

// 3. boundary: 13 / 14 / 15 days
const withExpiry = (days) => evaluatePartnerPaths(healthyOffers.map((o) => o.provider === "tiqets" ? { ...o, expires: addDays(T, days) } : o), T);
ok(withExpiry(13).providers.tiqets.status === "renew", "expires in 13 days -> renewal WARN");
ok(withExpiry(14).providers.tiqets.status === "renew", "expires in 14 days -> renewal WARN (window is inclusive)");
ok(withExpiry(15).providers.tiqets.status === "ok" && withExpiry(15).queue.length === 0, "expires in 15 days -> ok, nothing queued");
const q = withExpiry(13).queue[0];
ok(q && q.owner === DEFAULT_OWNER && q.deadline === addDays(addDays(T, 13), -7) && q.expires === addDays(T, 13), "queue row: owner Gabe, deadline = expires - 7d");
ok(RENEWAL_WINDOW_DAYS === 14, "renewal window is 14 days");
const mixed = evaluatePartnerPaths([...healthyOffers.filter((o) => o.provider !== "tiqets"), { provider: "tiqets", offerId: "a", expires: addDays(T, 5) }, { provider: "tiqets", offerId: "b", expires: null }], T);
ok(mixed.providers.tiqets.status === "ok", "an evergreen live offer keeps the provider healthy while the dated one is queued");
ok(mixed.queue.length === 1 && mixed.queue[0].offerId === "a", "the dated offer is still queued for renewal");

// 4. per-city
const cityOffers = [...healthyOffers.filter((o) => o.provider !== "clipp"),
  { provider: "clipp", offerId: "c1", city: "Sarasota", expires: "2026-12-01" }, { provider: "clipp", offerId: "c2", city: "Tampa", expires: "2026-09-01" }];
const cityRep = evaluatePartnerPaths(cityOffers, T, { requiredCities: { clipp: ["Sarasota", "Tampa"] } });
ok(cityRep.providers.clipp.status === "fail" && cityRep.providers.clipp.reasons.some((r) => /Tampa/.test(r)), "a required city with 0 live offers fails the provider and names the city");

// 5. verdict
const quiet = { pageviews: 10, impressions: {}, clicks: {} };
const busy = { pageviews: MIN_TRAFFIC_PAGEVIEWS * 10, impressions: Object.fromEntries(EXPECTED_PROVIDERS.map((p) => [p, 50])), clicks: {} };
ok(partnerPathVerdict(good, { ...busy, clicks: {} }).incidents.length === 0, "ZERO CLICKS ALONE does not page (valid path, healthy traffic, impressions, no clicks)");
ok(partnerPathVerdict(good, quiet).incidents.length === 0, "a quiet window with a valid path does not page");
const vDead = partnerPathVerdict(dead, busy);
ok(vDead.incidents.length === 1 && vDead.incidents[0].provider === "clipp" && vDead.incidents[0].kind === "path-invalid", "invalid path + healthy traffic PAGES (and only that provider)");
ok(partnerPathVerdict(dead, quiet).incidents.length === 0 && partnerPathVerdict(dead, quiet).warnings.length === 1, "invalid path on a quiet window only warns");
ok(partnerPathVerdict(good, { ...busy, impressions: { ...busy.impressions, klook: 0 } }).warnings.some((w) => w.provider === "klook" && w.kind === "no-exposure") && partnerPathVerdict(good, { ...busy, impressions: { ...busy.impressions, klook: 0 } }).incidents.length === 0, "valid path with 0 impressions on healthy traffic is a WARN, never a page");
ok(partnerPathVerdict(withExpiry(13), busy).incidents.length === 0 && partnerPathVerdict(withExpiry(13), busy).warnings.some((w) => w.kind === "renewal-due"), "renewal 13d out warns, does not page");
ok(partnerPathVerdict(withExpiry(6), busy).incidents.some((i) => i.kind === "renewal-overdue"), "renewal past its deadline (<=7d) with traffic pages");
ok(partnerPathPulseRow(vDead).succeeded === 0 && partnerPathPulseRow(vDead).attempted === 1 && partnerPathPulseRow(partnerPathVerdict(good, busy)).succeeded === 1, "pulse row: succeeded=0 on incident, 1 when clean");

// 6. fail loud
const noDb = collectPartnerOffers({});
ok(noDb.unmeasured.includes("undercover_tourist"), "missing wf_deals read marks UT UNMEASURED (not 0, not ok)");
const unm = evaluatePartnerPaths(noDb.offers, "2026-09-20", { requiredCities: REQUIRED_CITIES, unmeasured: noDb.unmeasured });
ok(unm.providers.undercover_tourist.status === "unmeasured" && partnerPathVerdict(unm, quiet).incidents.some((i) => i.kind === "unmeasured"), "an unmeasured provider pages even on a quiet window");
let threw = false;
try { evaluatePartnerPaths([], undefined); } catch { threw = true; }
ok(threw, "no implicit clock: evaluate without a date throws");

// 7. real registries on fixed clocks
const utRows = [{ id: 1, provider: "undercover_tourist", active: true, link_ok: null, ends_at: "2026-11-01T03:59:00+00:00" }];
const real = collectPartnerOffers({ dbDeals: utRows });
const before = evaluatePartnerPaths(real.offers, "2026-09-20", { requiredCities: REQUIRED_CITIES, unmeasured: real.unmeasured });
for (const p of EXPECTED_PROVIDERS) ok(before.providers[p].live > 0 && before.providers[p].status !== "fail", `real code @2026-09-20: ${p} has live offers (${before.providers[p].live})`);
for (const city of REQUIRED_CITIES.clipp) ok(before.providers.clipp.cities[city].live > 0, `real code @2026-09-20: Clipp has live offers in ${city}`);
ok(before.providers.stay22.live >= 30, "real code: Stay22 verified-hotel allow-list is read (>=30)");
const after = evaluatePartnerPaths(real.offers, "2026-10-13", { requiredCities: REQUIRED_CITIES, unmeasured: real.unmeasured });
ok(after.providers.clipp.status === "fail" && after.providers.clipp.live === 0, "real code @2026-10-13: Clipp is the FAIL the incident was (both audit fuses lapsed)");
ok(after.queue.some((x) => x.provider === "clipp" && x.expired && x.owner === "Gabe"), "real code @2026-10-13: lapsed Clipp offers are in the renewal queue");

// 8. wired + read-only
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const manifest = read("scripts/guards.txt").split(/\r?\n/).map((l) => l.trim());
ok(manifest.includes("node scripts/check-partner-path-health.mjs"), "guard is listed in scripts/guards.txt (run-guards executes it)");
const vercel = JSON.parse(read("vercel.json"));
ok((vercel.crons || []).some((c) => c.path === "/api/cron/partner-path" && /^\d+ \d+ \* \* \*$/.test(c.schedule)), "vercel.json schedules /api/cron/partner-path daily");
const routePath = "app/api/cron/partner-path/route.js";
ok(existsSync(path.join(ROOT, routePath)), "cron route exists");
const route = read(routePath);
ok(/CRON_SECRET/.test(route) && /recordPulse\(JOB/.test(route) && /partnerPathVerdict\(/.test(route) && /partnerPathPulseRow\(/.test(route), "route is CRON_SECRET-gated and pulses the pure verdict via recordPulse (delivery = job-watch)");
ok(/jobCannotRun\(JOB/.test(route) && /SUPABASE_SERVICE_ROLE_KEY/.test(route) && /POSTHOG_PERSONAL_API_KEY/.test(route), "route fails loudly when its config is absent (AGENTS.md section 5)");
ok(/partnerPathExposure/.test(read("lib/commandCenter/sources/posthog.js")), "PostHog exposure query exists");
const noWrites = [routePath, "lib/partnerPathHealth.js", "lib/partnerPathInventory.js"].every((f) => !/\.(insert|update|upsert|delete)\(/.test(read(f)));
ok(noWrites, "path never writes or renews offers (read-only; only the pulse)");
const ex = exposureFromRows([{ provider: "$pageview", pageviews: 500 }, { provider: "klook", impressions: 4, clicks: 0 }, { provider: "(none)", impressions: 9, clicks: 1 }]);
ok(ex.pageviews === 500 && ex.impressions.klook === 4 && !("(none)" in ex.impressions), "exposureFromRows splits pageviews from per-provider impressions");

console.log(fail
  ? `check-partner-path-health: FAIL — ${fail} failed, ${pass} passed`
  : `check-partner-path-health: OK — ${pass} assertions; ${EXPECTED_PROVIDERS.length} providers, 13/14/15-day boundary, zero-clicks-never-pages, real registries on fixed clocks, cron wired`);
process.exit(fail ? 1 : 0);
