// scripts/test-credited-photo-warm.mjs — LOCKS the credited-photo warm
// (lib/creditedPhotoWarm.js, lib/creditedPhotoTargets.js,
// app/api/cron/credited-photos/route.js).
//
// The invariants (each is executed, not grepped, unless it is a wiring fact):
//   1. FAIL CLOSED: no CREDITED_PHOTO_WARM_MONTH_CAP (or an unparseable one),
//      a shut gate, a non-production runtime, no Google key => blockedReason()
//      names it and a real run makes ZERO Google requests and takes ZERO grants.
//   2. IDEMPOTENT: a venue with a live cached+credited pair is never fetched.
//      An unreadable pair lookup stops a real run (it must not become a full
//      re-fetch of every venue).
//   3. BOUNDED: max per run (and the absolute HARD_MAX_PER_RUN), the venue
//      budget row, the shared photos ledger, a deadline.
//   4. ONE NAME, BOTH WRITES: the credit stored is the credit of the exact photo
//      name that is cached; credit first, cache second; no credit => no cache;
//      another place's photo name => rejected.
//   5. NO GOOGLE URL in the new code: every request goes through
//      placePhotoServe.defaultFetchOwnedUri (grants, refunds, retry rules).
//   6. WIRING: cron route is CRON_SECRET fail-closed, scheduled once in
//      vercel.json, run=1 so the schedule actually warms.
//   7. TARGETS: blog identity rule (exact name, one spot, in metro) and the
//      guide picks that carry a placeId; the 2026-10-07 guide additions resolve.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const rd = (p) => readFileSync(path.join(ROOT, p), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ENV0 = { ...process.env };
function env(over) {
  for (const k of ["WAYFIND_GATE", "VERCEL_ENV", "CREDITED_PHOTO_WARM_MONTH_CAP", "GOOGLE_MAPS_SERVER_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WAYFIND_ALLOW_NONPROD_PHOTO_SPEND", "GOOGLE_PHOTO_PREFETCH"]) delete process.env[k];
  Object.assign(process.env, { GOOGLE_PHOTO_PREFETCH: "on", WAYFIND_GATE: "free", VERCEL_ENV: "production", CREDITED_PHOTO_WARM_MONTH_CAP: "800", GOOGLE_MAPS_SERVER_KEY: "k", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "s" }, over || {});
  for (const k of Object.keys(over || {})) if (over[k] === undefined) delete process.env[k];
}

const W = await import("../lib/creditedPhotoWarm.js");
const T = await import("../lib/creditedPhotoTargets.js");
const SG = await import("../lib/spendGate.js");

// ── 1. fail closed ─────────────────────────────────────────────────────────
env();
ok(W.blockedReason() === null, "CONTROL: a fully configured production env is not blocked (got " + W.blockedReason() + ")");
// 2026-10-08: background pre-fetch is paused unless GOOGLE_PHOTO_PREFETCH=on (lib/googlePhotoPolicy.js).
env({ GOOGLE_PHOTO_PREFETCH: undefined });
ok(W.blockedReason() === "prefetch-paused", "unset GOOGLE_PHOTO_PREFETCH must pause the warm (Google Terms 3.2.3(a)(i)), got " + W.blockedReason());
env({ GOOGLE_PHOTO_PREFETCH: "1" });
ok(W.blockedReason() === "prefetch-paused", "only the literal 'on' resumes pre-fetch, got " + W.blockedReason());
env({ CREDITED_PHOTO_WARM_MONTH_CAP: undefined });
ok(W.blockedReason() === "cap-unset", "unset CREDITED_PHOTO_WARM_MONTH_CAP must block, got " + W.blockedReason());
for (const bad of ["1,000", "8e2", "0", "-5", "abc", ""]) {
  env({ CREDITED_PHOTO_WARM_MONTH_CAP: bad });
  ok(W.blockedReason() === "cap-unset", `cap value ${JSON.stringify(bad)} must block (never an invented default), got ${W.blockedReason()}`);
}
env({ WAYFIND_GATE: "shut" });
ok(W.blockedReason() === "gate-shut", "WAYFIND_GATE=shut must block, got " + W.blockedReason());
env({ WAYFIND_GATE: undefined });
ok(W.blockedReason() === "gate-shut", "an unset gate means shut, got " + W.blockedReason());
env({ VERCEL_ENV: "preview" });
ok(W.blockedReason() === "non-production", "a preview deployment must block, got " + W.blockedReason());
env({ GOOGLE_MAPS_SERVER_KEY: undefined });
ok(W.blockedReason() === "no-google-key", "no server key must block, got " + W.blockedReason());
env({ SUPABASE_SERVICE_ROLE_KEY: undefined });
ok(W.blockedReason() === "no-supabase", "no Supabase env must block, got " + W.blockedReason());

// A real run under a blocked env: zero requests, zero grants.
{
  env({ CREDITED_PHOTO_WARM_MONTH_CAP: undefined });
  let calls = 0;
  const count = () => { calls++; return true; };
  const r = await W.warmCreditedPhotos({
    placeIds: ["ChIJaaaaaaaaaaaaaaaaaaaaaaa"], serverKey: "k",
    deps: { readPairs: async () => ({ paired: new Set(), error: null }), takeWarm: count, takePhotos: count, takeDetails: count, fetchOwned: async () => { calls++; return {}; }, saveCredits: count, cacheSet: count },
  });
  ok(r.blocked === "cap-unset" && calls === 0 && r.attempted === 0, `unset cap: blocked=${r.blocked} calls=${calls} (must be cap-unset / 0)`);
}

// ── 2-4. behaviour with injected Google/ledger/storage ────────────────────
const PID = (n) => "ChIJ" + String(n).padStart(20, "x");
function mkWorld(over = {}) {
  const log = [];
  const w = {
    log, cache: new Map(), credits: [], warmUsed: 0, photosUsed: 0, detailsUsed: 0, refunds: 0,
    deps: {
      readPairs: async () => ({ paired: new Set(over.paired || []), error: over.readError || null }),
      blockedReason: () => null,
      takeWarm: async () => { if (over.warmCap != null && w.warmUsed >= over.warmCap) return false; w.warmUsed++; log.push("warm"); return true; },
      refundWarm: async () => { w.warmUsed--; w.refunds++; log.push("refund-warm"); },
      takePhotos: async () => { if (over.photosCap != null && w.photosUsed >= over.photosCap) return false; w.photosUsed++; log.push("photos"); return true; },
      takeDetails: async () => { w.detailsUsed++; log.push("details"); return true; },
      breakerOpen: async () => over.breakerOpen || null,
      tripBreaker: async (...a) => { log.push("trip:" + a[0]); },
      now: () => 1_800_000_000_000,
      fetchOwned: async (ref, width, key, authorize, _f, _d, _r, opts) => {
        const pid = ref.split("/")[1];
        log.push("fetch:" + pid);
        if (over.fetchOwned) return over.fetchOwned(pid, authorize, opts);
        await authorize("details_ids_only");
        const photo = { name: `places/${pid}/photos/AAA${pid.slice(-4)}`, authorAttributions: [{ displayName: "Jo Photo", uri: "https://maps.google.com/contrib/1", photoUri: "https://lh3.googleusercontent.com/a" }], googleMapsUri: "https://www.google.com/maps/place/x" };
        opts.keepCredits(pid, [{ name: `places/${pid}/photos/ZZZ`, authorAttributions: [] }, photo]);
        return { uri: "https://lh3.googleusercontent.com/photo-" + pid, name: photo.name, upstream: "ok", refunded: 0 };
      },
      saveCredits: async (places) => { log.push("credit"); if (over.creditFail) return false; w.credits.push(...places); return true; },
      cacheSet: async (k, v, ttl) => { log.push("cache"); if (over.cacheFail) return false; w.cache.set(k, { v, ttl }); return true; },
    },
  };
  return w;
}
env();
{
  const w = mkWorld();
  const r = await W.warmCreditedPhotos({ placeIds: [PID(1), PID(2), PID(1)], serverKey: "k", deps: w.deps });
  ok(r.targets === 2 && r.attempted === 2 && r.warmed === 2, `happy path: targets=${r.targets} attempted=${r.attempted} warmed=${r.warmed} (dupes collapse, both warmed)`);
  const k1 = `photo|places/${PID(1)}/photos/AAA${PID(1).slice(-4)}|640`;
  ok(w.cache.has(k1), "cache row is written under the EXACT photo name that was credited: " + [...w.cache.keys()].join(","));
  ok(w.credits[0].photos[0].name === `places/${PID(1)}/photos/AAA${PID(1).slice(-4)}` && w.credits[0].photos.length === 1, "the credit saved is for the cached photo name only (not the first-in-list photo, not all photos)");
  ok(w.cache.get(k1).ttl <= 29 * 86400000, "cache ttl is at most 29 days (Google's 30-day cache limit with a day of Next data-cache slack)");
  const seq = w.log.join(">");
  ok(/credit>cache/.test(seq), "credit row is written BEFORE the cache row: " + seq);
  ok(/warm>photos>fetch:/.test(seq), "the warm unit and the photos grant are taken BEFORE the Google fetch: " + seq);
  ok(w.detailsUsed === 2, "the Details lookup is metered through authorize('details_ids_only'), once per venue (got " + w.detailsUsed + ")");
  ok(r.costUsdUpperBound === 0.014, "cost upper bound = venues x $0.007, got " + r.costUsdUpperBound);
}
{ // idempotent
  const w = mkWorld({ paired: [PID(1), PID(2)] });
  const r = await W.warmCreditedPhotos({ placeIds: [PID(1), PID(2), PID(3)], serverKey: "k", deps: w.deps });
  ok(r.alreadyPaired === 2 && r.attempted === 1 && !w.log.includes("fetch:" + PID(1)) && !w.log.includes("fetch:" + PID(2)), "paired venues are skipped with no grant and no Google request: " + w.log.join(","));
}
{ // unreadable pairs
  const w = mkWorld({ readError: "read-failed: boom" });
  const r = await W.warmCreditedPhotos({ placeIds: [PID(1)], serverKey: "k", deps: w.deps });
  ok(r.blocked === "pairs-unreadable" && w.log.length === 0, "a failed pair lookup stops a real run with no spend: " + JSON.stringify([r.blocked, w.log]));
}
{ // dry run
  const w = mkWorld();
  const r = await W.warmCreditedPhotos({ placeIds: [PID(1), PID(2)], dryRun: true, serverKey: "k", deps: w.deps });
  ok(r.dryRun && r.toWarm === 2 && r.attempted === 0 && w.log.length === 0, "dry run reports the estimate and takes no grant / makes no request: " + w.log.join(","));
}
{ // bounded
  const w = mkWorld();
  const ids = Array.from({ length: 5 }, (_, i) => PID(i + 1));
  const r = await W.warmCreditedPhotos({ placeIds: ids, max: 2, serverKey: "k", deps: w.deps });
  ok(r.attempted === 2 && r.stopped === "max-per-run", `max=2 attempts exactly 2 (got ${r.attempted}, ${r.stopped})`);
  const w2 = mkWorld();
  const many = Array.from({ length: W.HARD_MAX_PER_RUN + 40 }, (_, i) => PID(i + 1));
  const r2 = await W.warmCreditedPhotos({ placeIds: many, max: 99999, serverKey: "k", deps: w2.deps });
  ok(W.HARD_MAX_PER_RUN <= 150 && r2.attempted === W.HARD_MAX_PER_RUN, `an absurd max is clamped to HARD_MAX_PER_RUN (${W.HARD_MAX_PER_RUN}), got ${r2.attempted}`);
  const w3 = mkWorld({ warmCap: 3 });
  const r3 = await W.warmCreditedPhotos({ placeIds: ids, serverKey: "k", deps: w3.deps });
  ok(r3.attempted === 3 && r3.stopped === "warm-cap", `the warm budget row stops the run (attempted ${r3.attempted}, ${r3.stopped})`);
  const w4 = mkWorld({ photosCap: 1 });
  const r4 = await W.warmCreditedPhotos({ placeIds: ids, serverKey: "k", deps: w4.deps });
  ok(r4.attempted === 1 && r4.stopped === "photos-ledger" && w4.refunds === 1 && w4.warmUsed === 1, `a photos-ledger refusal stops the run and returns the warm unit (attempted ${r4.attempted}, ${r4.stopped}, refunds ${w4.refunds}, warmUsed ${w4.warmUsed})`);
  const w5 = mkWorld();
  const r5 = await W.warmCreditedPhotos({ placeIds: ids, serverKey: "k", deadlineAt: 1, deps: w5.deps });
  ok(r5.attempted === 0 && r5.stopped === "deadline", "a passed deadline starts nothing");
  const w6 = mkWorld({ breakerOpen: true });
  const r6 = await W.warmCreditedPhotos({ placeIds: ids, serverKey: "k", deps: w6.deps });
  ok(r6.blocked === "quota-open" && w6.log.length === 0, "an open quota breaker blocks the run before any grant");
}
{ // failure shapes never write a cache row
  const base = (pid) => `places/${pid}/photos/AAA`;
  const attrib = [{ displayName: "Jo", uri: "https://maps.google.com/c/1" }];
  const shapes = {
    noAuthor: (pid, a, o) => { o.keepCredits(pid, [{ name: base(pid), authorAttributions: [] }]); return { uri: "https://lh3.googleusercontent.com/p", name: base(pid), upstream: "ok" }; },
    otherPlace: (pid, a, o) => { o.keepCredits(pid, [{ name: base(PID(99)), authorAttributions: attrib }]); return { uri: "https://lh3.googleusercontent.com/p", name: base(PID(99)), upstream: "ok" }; },
    nameNotInResponse: (pid, a, o) => { o.keepCredits(pid, [{ name: base(pid) + "X", authorAttributions: attrib }]); return { uri: "https://lh3.googleusercontent.com/p", name: base(pid), upstream: "ok" }; },
    notOwnedUri: (pid, a, o) => { o.keepCredits(pid, [{ name: base(pid), authorAttributions: attrib }]); return { uri: "https://evil.example/p.jpg", name: base(pid), upstream: "ok" }; },
    noPhoto: () => ({ uri: null, upstream: "fresh-nophoto", refunded: 1 }),
  };
  for (const [label, fn] of Object.entries(shapes)) {
    const w = mkWorld({ fetchOwned: fn });
    const r = await W.warmCreditedPhotos({ placeIds: [PID(1)], serverKey: "k", deps: w.deps });
    ok(r.warmed === 0 && w.cache.size === 0, `${label}: nothing is cached (warmed ${r.warmed}, cache ${w.cache.size})`);
    if (label === "noPhoto") ok(w.refunds === 1, "a venue with no photo gives its warm unit back");
  }
  const wc = mkWorld({ creditFail: true });
  const rc = await W.warmCreditedPhotos({ placeIds: [PID(1)], serverKey: "k", deps: wc.deps });
  ok(rc.creditFailed === 1 && wc.cache.size === 0 && wc.log.filter((x) => x === "credit").length === 2, "credit write failing (retried once) means the photo is NOT cached");
  const wk = mkWorld({ cacheFail: true });
  const rk = await W.warmCreditedPhotos({ placeIds: [PID(1)], serverKey: "k", deps: wk.deps });
  ok(rk.cacheFailed === 1 && rk.warmed === 0, "cache write failing is reported, not counted as warmed");
  const wq = mkWorld({ fetchOwned: () => ({ uri: null, upstream: "fresh-failed:quota" }) });
  const rq = await W.warmCreditedPhotos({ placeIds: [PID(1), PID(2)], serverKey: "k", deps: wq.deps });
  ok(rq.stopped === "quota" && wq.log.some((x) => x.startsWith("trip:")) && rq.attempted === 1, "a Google quota answer trips the shared breaker and stops the run");
  const wd = mkWorld({ fetchOwned: () => ({ uri: null, upstream: "place-lookup-denied", refunded: 1 }) });
  const rd2 = await W.warmCreditedPhotos({ placeIds: [PID(1), PID(2), PID(3)], serverKey: "k", deps: wd.deps });
  ok(rd2.stopped === "ledger-denied" && rd2.attempted === 1, "a ledger refusal inside a venue ends the run");
  const wt = mkWorld({ fetchOwned: () => { throw new Error("boom"); } });
  const rt = await W.warmCreditedPhotos({ placeIds: [PID(1)], serverKey: "k", deps: wt.deps });
  ok(rt.warmed === 0, "a throwing fetch never escapes warmCreditedPhotos");
}

// ── readLivePairs: the idempotency source of truth ────────────────────────
{
  const NOW = 1_800_000_000_000;
  const iso = (ms) => new Date(ms).toISOString();
  const mk = ({ cacheRows, creditRows, fail }) => async (url) => {
    if (fail) return { ok: false, status: 500, json: async () => [] };
    const u = String(url);
    if (u.includes("/wf_places_cache")) return { ok: true, json: async () => cacheRows };
    if (u.includes("/wf_photo_credit")) return { ok: true, json: async () => creditRows };
    return { ok: false, status: 404, json: async () => [] };
  };
  const P = PID(7), nm = `places/${P}/photos/AAAA`;
  const env0 = { url: "https://x.supabase.co", key: "s" };
  let r = await W.readLivePairs([P], { now: NOW, env: env0, fetchImpl: mk({ cacheRows: [{ k: `photo|${nm}|640` }], creditRows: [{ photo_name: nm, place_id: P }] }) });
  ok(r.paired.has(P) && !r.error, "cache + credit for the SAME name = paired");
  r = await W.readLivePairs([P], { now: NOW, env: env0, fetchImpl: mk({ cacheRows: [{ k: `photo|${nm}|640` }], creditRows: [{ photo_name: `places/${P}/photos/BBBB`, place_id: P }] }) });
  ok(!r.paired.has(P), "a credit for a DIFFERENT photo name than the cached one is not a pair (the 137-venue case)");
  r = await W.readLivePairs([P], { now: NOW, env: env0, fetchImpl: mk({ cacheRows: [], creditRows: [{ photo_name: nm, place_id: P }] }) });
  ok(!r.paired.has(P), "a credit with no live cache row is not a pair");
  r = await W.readLivePairs([P], { now: NOW, env: env0, fetchImpl: mk({ cacheRows: [{ k: `photo|places/${PID(8)}/photos/AAAA|640` }], creditRows: [{ photo_name: `places/${PID(8)}/photos/AAAA`, place_id: PID(8) }] }) });
  ok(!r.paired.has(P), "another place's pair never pairs this place");
  r = await W.readLivePairs([P], { now: NOW, env: env0, fetchImpl: mk({ fail: true }) });
  ok(!r.paired.size && /read-failed/.test(r.error || ""), "a failing read reports an error (callers must not treat it as 'nothing paired')");
  let seen = "";
  await W.readLivePairs([P], { now: NOW, env: env0, fetchImpl: async (url) => { seen += url; return { ok: true, json: async () => [] }; } });
  ok(seen.includes(encodeURIComponent(iso(NOW + W.MIN_REMAINING_MS))), "the pair lookup requires MIN_REMAINING_MS of life left on the cache row (so renewals happen before expiry)");
  ok(W.MIN_REMAINING_MS >= 7 * 86400000 && W.MIN_REMAINING_MS <= 15 * 86400000, "renewal margin is between 7 and 15 days (daily cron + 30-day expiry)");
}

// ── 5. no Google URL in the new code ──────────────────────────────────────
const newFiles = ["lib/creditedPhotoWarm.js", "lib/creditedPhotoTargets.js", "app/api/cron/credited-photos/route.js", "scripts/credited-photo-targets.mjs"];
for (const f of newFiles) {
  const code = stripComments(rd(f));
  ok(!/googleapis\.com/.test(code), `${f} must not name a Google host; requests go through defaultFetchOwnedUri`);
  ok(!/\bfetch\s*\(\s*["'`]https:\/\/(?!x\.)/.test(code.replace(/PUBLIC_URL/g, "")), `${f} makes no literal-URL fetch`);
}
{
  const code = stripComments(rd("lib/creditedPhotoWarm.js"));
  ok(/defaultFetchOwnedUri/.test(code) && /freshFirst:\s*true/.test(code) && /placeOnly:\s*true/.test(code), "warm uses the shared defaultFetchOwnedUri with freshFirst + placeOnly (IDs-only Details, then ONE media request)");
  ok(/creditedPhotoWarmCap\(\)/.test(code) && /takeFromLedger\(WARM_LEDGER_SKU/.test(code), "warm meters itself on its own ledger row");
  ok(/spendAllowPhotos\(\)/.test(code), "every media request is also gated by the shared photos ledger (spendAllowPhotos)");
  ok(/spendAllow\("details_ids_only"\)/.test(code), "the Details lookup is metered as details_ids_only");
  ok(!/fields=|X-Goog-FieldMask|photos\.name,|authorAttributions\s*[:=]/.test(code.replace(/extractPhotoCredits/g, "")), "warm builds no Places field list of its own");
}
ok(typeof SG.creditedPhotoWarmCap === "function", "spendGate exports creditedPhotoWarmCap");
ok(/explicitCap\("CREDITED_PHOTO_WARM_MONTH_CAP"\)/.test(stripComments(rd("lib/spendGate.js"))), "creditedPhotoWarmCap reads CREDITED_PHOTO_WARM_MONTH_CAP through explicitCap (plain positive integer or null)");
env({ CREDITED_PHOTO_WARM_MONTH_CAP: "800" });
ok(SG.creditedPhotoWarmCap() === 800, "cap 800 parses to 800");

// ── 6. wiring ─────────────────────────────────────────────────────────────
{
  const route = rd("app/api/cron/credited-photos/route.js");
  const code = stripComments(route);
  ok(/if \(!secret \|\| auth !== "Bearer " \+ secret\) return new Response\("unauthorized", \{ status: 401 \}\)/.test(code), "route is CRON_SECRET fail-closed (401)");
  ok(/searchParams\.get\("run"\) === "1"/.test(code) && /dryRun:\s*!wantRun/.test(code), "route is a DRY RUN unless ?run=1");
  ok(/Math\.min\(HARD_MAX_PER_RUN/.test(code), "route clamps ?limit to HARD_MAX_PER_RUN");
  ok(/blockedReason\(/.test(code) && /skipped:\s*\$\{why\}/.test(code), "an unset cap is a clean skip (200 + pulse), not a failure");
  ok(/recordPulse\("credited-photos"/.test(code), "route records a pulse");
  const vj = JSON.parse(rd("vercel.json"));
  const crons = vj.crons.filter((c) => /credited-photos/.test(c.path));
  ok(crons.length === 1 && /\?run=1/.test(crons[0].path) && /^\d+ (?:\d+|\*\/[1-9]\d?) \* \* \*$/.test(crons[0].schedule), "vercel.json schedules the warm exactly once (daily or every N hours; idempotent, so extra runs only cover more venues sooner), with run=1: " + JSON.stringify(crons));
}

// ── 7. targets ────────────────────────────────────────────────────────────
{
  const row = (place_id, name, lat, lng, rv = 10, excluded = false) => ({ place_id, name, lat, lng, rv, excluded });
  const rows = [
    row("ChIJonespotaaaaaaaaaaaa1", "Café Alma & Co", 27.34, -82.53, 5),
    row("ChIJonespotaaaaaaaaaaaa2", "Cafe Alma and Co", 27.3401, -82.5301, 50), // duplicate row, same spot, more reviews
    row("ChIJchainaaaaaaaaaaaaaa1", "Taco Hut", 27.34, -82.53),
    row("ChIJchainaaaaaaaaaaaaaa2", "Taco Hut", 27.40, -82.45),
    row("ChIJfaraway0000000000001", "Far Cafe", 40.7, -74.0),
    row("ChIJexcluded00000000001a", "Gone Bistro", 27.34, -82.53, 5, true),
  ];
  const posts = [{ slug: "p1", metro: "manatee-sarasota", items: [{ name: "Cafe Alma & Co" }, { name: "Taco Hut" }, { name: "Far Cafe" }, { name: "Gone Bistro" }, { name: "Unknown Place" }] }];
  const b = T.blogTargets(posts, rows);
  ok(b.ids.size === 1 && b.ids.has("ChIJonespotaaaaaaaaaaaa2"), "blog: one id per spot, the most-reviewed duplicate row; got " + [...b.ids.keys()]);
  ok(b.stats.ambiguous === 1 && b.stats.resolved === 1 && b.stats.notInInventory === 3, "blog: chain skipped (ambiguous), far/excluded/unknown not resolved: " + JSON.stringify(b.stats));
  const { GUIDES } = await import("../lib/guides.js");
  const { GUIDE_PLACE_RAILS } = await import("../lib/guidePlaceRails.js");
  const { guidePickMayResolvePlaceCard } = await import("../lib/guidePlaceIdentity.js");
  const g = T.guideTargets(GUIDES, GUIDE_PLACE_RAILS, guidePickMayResolvePlaceCard);
  ok(g.ids.size >= 200, "guide targets are the real guide data (>= 200 venues), got " + g.ids.size);
  // 2026-10-07 additions: inventory-verified ids for picks that had none.
  for (const [id, nm] of [["ChIJxarXNwCr2YgRZvrLZ_ZW9dQ", "The FORT Pickleball"], ["ChIJMRKPC1mC3YgRTs5evGTqF4k", "Green Meadows Petting Farm"], ["ChIJ70rJA_w5w4gRrx0l1ukJBDc", "Waterside Park"], ["ChIJi43QGNE5w4gRgxvO7rqqJfE", "Waterside Place"]]) {
    ok(g.ids.has(id), `guide target list includes ${nm} (${id})`);
  }
  for (const slug of ["things-to-do-fort-lauderdale-summer-2026"]) {
    const pk = (GUIDES[slug]?.picks || []).find((p) => /^The Fort/.test(p.name));
    ok(pk && pk.placeId === "ChIJxarXNwCr2YgRZvrLZ_ZW9dQ" && guidePickMayResolvePlaceCard(pk), "The Fort pick carries its placeId and may resolve a place card");
  }
  const gm = (GUIDES["fall-events-orlando-2026"]?.picks || []).find((p) => /^Green Meadows/.test(p.name));
  ok(gm && gm.placeId === "ChIJMRKPC1mC3YgRTs5evGTqF4k" && guidePickMayResolvePlaceCard(gm), "Green Meadows pick carries its placeId and may resolve a place card");
  const merged = T.mergeTargets(b.ids, g.ids);
  ok(merged.every((t, i) => i === 0 || merged[i - 1].placeId < t.placeId), "merged list is sorted and de-duplicated (deterministic)");
  // The guide page renders the credited photo through guidePlaceFigureImage once warmed: it must still read the credit by exact name.
  const fig = stripComments(rd("lib/guidePlaceFigureImage.js"));
  ok(/findCreditedEditorialCache/.test(fig) && /findEditorialPhotoCredit/.test(fig), "guidePlaceFigureImage still resolves a credited cached Google photo (credit by exact name)");
}

Object.assign(process.env, ENV0);
// VIEWED FIRST (2026-10-08). Order decides who gets a photo when the budget
// cannot cover everyone, so places real readers failed to see go first.
{
  const t = [{ placeId: "ChIJaaaaaaaaaaaaaaaa" }, { placeId: "ChIJbbbbbbbbbbbbbbbb" }, { placeId: "ChIJcccccccccccccccc" }, { placeId: "ChIJdddddddddddddddd" }];
  const views = new Map([["ChIJcccccccccccccccc", 9], ["ChIJbbbbbbbbbbbbbbbb", 2]]);
  const order = T.viewedFirst(t, views).map((x) => x.placeId);
  ok(JSON.stringify(order) === JSON.stringify(["ChIJcccccccccccccccc", "ChIJbbbbbbbbbbbbbbbb", "ChIJaaaaaaaaaaaaaaaa", "ChIJdddddddddddddddd"]), `viewedFirst: most-viewed first, unviewed keep placeId order (got ${order.join(",")})`);
  ok(JSON.stringify(T.viewedFirst(t, new Map()).map((x) => x.placeId)) === JSON.stringify(t.map((x) => x.placeId)), "viewedFirst: no view data leaves the deterministic order unchanged");
  ok(t[0].placeId === "ChIJaaaaaaaaaaaaaaaa", "viewedFirst does not mutate its input");
  // loadReaderViews: reads ONLY the reader-miss table, sums detections, last 30 days.
  const seen = [];
  const fake = async (u) => { seen.push(String(u)); return { ok: true, json: async () => [{ place_id: "ChIJcccccccccccccccc", detections: 4 }, { place_id: "ChIJcccccccccccccccc", detections: 5 }] }; };
  const m = await T.loadReaderViews(["ChIJcccccccccccccccc", "bad id"], { url: "https://x.test", key: "k", fetchImpl: fake, now: Date.parse("2026-10-08T00:00:00Z") });
  ok(m.get("ChIJcccccccccccccccc") === 9, `loadReaderViews sums detections (got ${m.get("ChIJcccccccccccccccc")})`);
  ok(seen.length === 1 && /\/rest\/v1\/wf_photo_repair_queue\?select=place_id,detections&place_id=in\.\(ChIJcccccccccccccccc\)&last_seen_at=gte\.2026-09-08/.test(seen[0]), `loadReaderViews reads the reader-miss queue for valid ids only, last 30 days (got ${seen[0]})`);
  // The cron applies it to the merged list before the worker sees it.
  const cron = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app/api/cron/credited-photos/route.js"), "utf8").replace(/\/\/[^\n]*/g, "");
  ok(/targets\s*=\s*viewedFirst\(targets,\s*views\)/.test(cron) && cron.indexOf("viewedFirst(targets") < cron.indexOf("warmCreditedPhotos({"), "the credited-photos cron orders targets viewed-first before the worker runs");
}

// BUDGET-AWARE SCOPE (2026-10-08). Headroom below the everyday reserve -> viewed-only;
// unknown ledger -> viewed-only (fail safe); a month with room -> full list.
{
  const oct8 = Date.parse("2026-10-08T12:37:00Z");
  const tight = T.backfillScope({ used: 2039, cap: 3000, now: oct8 });
  ok(tight.viewedOnly === true && tight.headroom === 961 && tight.reserve === Math.ceil(((Date.UTC(2026, 10, 1) - oct8) / 86400000) * T.EVERYDAY_PHOTOS_PER_DAY), `Oct 8 with 961 left is viewed-only (got ${JSON.stringify(tight)})`);
  ok(T.backfillScope({ used: 0, cap: 3000, now: Date.parse("2026-11-25T00:00:00Z") }).viewedOnly === false, "a month with headroom above the reserve runs the full list");
  ok(T.backfillScope({ used: null, cap: 3000, now: oct8 }).viewedOnly === true, "unknown ledger usage fails safe to viewed-only");
  ok(T.backfillScope({ used: 2039, cap: null, now: oct8 }).viewedOnly === true, "unknown ceiling fails safe to viewed-only");
  const seen = [];
  const used = await T.loadPhotosUsed({ url: "https://x.test", key: "k", now: oct8, fetchImpl: async (u) => { seen.push(String(u)); return { ok: true, json: async () => [{ used: 2039 }] }; } });
  ok(used === 2039 && /wf_spend_ledger\?select=used&month=eq\.2026-10&sku=eq\.photos$/.test(seen[0]), `loadPhotosUsed reads this month's photos row (got ${used} ${seen[0]})`);
  ok((await T.loadPhotosUsed({ url: "https://x.test", key: "k", now: oct8, fetchImpl: async () => ({ ok: false }) })) === null, "an unreadable ledger is null (-> viewed-only), never 0");
  const cron2 = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app/api/cron/credited-photos/route.js"), "utf8").replace(/\/\/[^\n]*/g, "");
  ok(/if \(scope\.viewedOnly\) targets = targets\.filter\(\(t\) => \(views\.get\(t\.placeId\) \|\| 0\) > 0\)/.test(cron2) && cron2.indexOf("scope.viewedOnly") < cron2.indexOf("warmCreditedPhotos({"), "the cron drops unviewed targets in viewed-only mode before the worker runs");
}

if (fails.length) {
  console.error("test-credited-photo-warm: FAIL\n - " + fails.join("\n - "));
  process.exit(1);
}
console.log(`test-credited-photo-warm: OK — ${pass} assertions (fail-closed on cap/gate/env/key, idempotent via exact cache+credit pairing, bounded per run + warm row + photos ledger, credit-before-cache for the same photo name, no Google URL in the new code, cron wiring, blog identity + guide targets)`);
