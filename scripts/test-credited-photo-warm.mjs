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

// ── 1-4 (REPLACED 2026-10-08). Pre-fetching Google photos is PROHIBITED outright (Google Maps
// Platform Terms 3.2.3(a)(i); Place Photos: "You cannot cache a photo name"). The credited warm used to
// fail closed on cap/gate/env/key, be idempotent via cache+credit pairs, spend a bounded ledger, and write
// credit-before-cache. None of that may ever run again, so the invariant is now absolute: whatever the env,
// the ledger, the deps or the dry-run flag, the warm is blocked BEFORE any read, grant, Google request,
// cache write or credit write. Every dependency below throws if touched. ─────────────────────────────────
const PROHIBITED = "prefetch-prohibited";
const PID = (n) => "ChIJ" + String(n).padStart(20, "x");
ok(W.PREFETCH_PROHIBITED === PROHIBITED, "creditedPhotoWarm exports PREFETCH_PROHIBITED === 'prefetch-prohibited'");
const ENVS = [
  {}, // fully configured production env with the (legacy) re-enable switch ON and a cap set: STILL blocked
  { GOOGLE_PHOTO_PREFETCH: undefined },
  { GOOGLE_PHOTO_PREFETCH: "1" },
  { CREDITED_PHOTO_WARM_MONTH_CAP: undefined },
  { WAYFIND_GATE: "shut" },
  { WAYFIND_GATE: undefined },
  { VERCEL_ENV: "preview" },
  { GOOGLE_MAPS_SERVER_KEY: undefined },
  { SUPABASE_SERVICE_ROLE_KEY: undefined },
];
for (const over of ENVS) {
  env(over);
  ok(W.blockedReason() === PROHIBITED, `blockedReason() is '${PROHIBITED}' under ${JSON.stringify(over)} too (got ${W.blockedReason()}) — no env switch re-enables pre-fetch`);
}
{
  env(); // the most permissive env there is
  const trap = (what) => async () => { throw new Error("RED-PROOF TRIPPED: warmCreditedPhotos touched " + what + " although pre-fetch is prohibited"); };
  const deps = {
    readPairs: trap("readPairs"), takeWarm: trap("takeWarm"), refundWarm: trap("refundWarm"), takePhotos: trap("takePhotos"), takeDetails: trap("takeDetails"),
    breakerOpen: trap("breakerOpen"), tripBreaker: trap("tripBreaker"), fetchOwned: trap("fetchOwned (Google)"), saveCredits: trap("saveCredits"), cacheSet: trap("cacheSet"),
    blockedReason: () => null, // even an injected 'not blocked' must not matter
  };
  const savedFetch = globalThis.fetch;
  let net = 0;
  globalThis.fetch = async (u) => { net++; throw new Error("RED-PROOF TRIPPED: network call " + u); };
  try {
    for (const opts of [{ placeIds: [PID(1), PID(2), PID(1)] }, { placeIds: [PID(1)], dryRun: true }, { placeIds: [PID(1)], max: 99999 }, { placeIds: [] }]) {
      const r = await W.warmCreditedPhotos({ ...opts, serverKey: "k", deps });
      ok(r.blocked === PROHIBITED && r.attempted === 0 && r.warmed === 0 && r.noCredit === 0 && r.creditFailed === 0 && r.cacheFailed === 0 && r.costUsdUpperBound === 0,
        `warmCreditedPhotos(${JSON.stringify({ ...opts, placeIds: opts.placeIds.length })}) is blocked with zero work: ` + JSON.stringify([r.blocked, r.attempted, r.warmed]));
    }
    ok(net === 0, "zero network calls across every blocked run");
    // readLivePairs: the cache+credit pairing is gone (nothing reads photo| cache rows or wf_photo_credit any more).
    const rp = await W.readLivePairs([PID(7)], { env: { url: "https://x.supabase.co", key: "s" }, fetchImpl: trap("readLivePairs fetch") });
    ok(rp.paired.size === 0 && rp.error === null, "readLivePairs reads nothing and pairs nothing");
  } finally { globalThis.fetch = savedFetch; }
}

// ── 5. no Google URL in the new code ──────────────────────────────────────
// Positive controls: each absence probe below matches a fixture that contains the forbidden pattern.
ok(/googleapis\.com/.test("fetch('https://places.googleapis.com/v1/x')"), "CONTROL: the Google-host probe finds a known Google host");
ok(/\bfetch\s*\(\s*["'`]https:\/\/(?!x\.)/.test('await fetch("https://evil.example/p")'), "CONTROL: the literal-URL-fetch probe finds a known literal fetch");
ok(/wf_photo_credit|photo\||wf_places_cache|findSamePlaceCachedPhoto/.test("select * from wf_photo_credit"), "CONTROL: the stored-Google-lane probe finds a known table name");
const newFiles = ["lib/creditedPhotoWarm.js", "lib/creditedPhotoTargets.js", "app/api/cron/credited-photos/route.js", "scripts/credited-photo-targets.mjs"];
for (const f of newFiles) {
  const code = stripComments(rd(f));
  ok(!/googleapis\.com/.test(code), `${f} must not name a Google host; requests go through defaultFetchOwnedUri`);
  ok(!/\bfetch\s*\(\s*["'`]https:\/\/(?!x\.)/.test(code.replace(/PUBLIC_URL/g, "")), `${f} makes no literal-URL fetch`);
}
{
  // Positional (the behaviour above is executed): in warmCreditedPhotos the prohibition return comes before
  // the first use of any dependency, so no later edit can reach Google ahead of it.
  const code = stripComments(rd("lib/creditedPhotoWarm.js"));
  const fnBody = code.slice(code.indexOf("export async function warmCreditedPhotos"));
  const retAt = fnBody.indexOf("return out;");
  const firstDep = fnBody.search(/deps\.(?!now\b)|readPairs\(|fetchOwned\(|takeFromLedger\(|spendAllowPhotos\(/);
  ok(/out\.blocked = PREFETCH_PROHIBITED;/.test(fnBody) && retAt > 0 && firstDep > retAt, "warmCreditedPhotos sets blocked = PREFETCH_PROHIBITED and returns before the first dependency/ledger/Google use");
  const br = code.slice(code.indexOf("export function blockedReason"));
  ok(/^export function blockedReason\(opts = \{\}\) \{\s*return PREFETCH_PROHIBITED;/.test(br), "blockedReason() returns PREFETCH_PROHIBITED unconditionally as its first statement");
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
  ok(/blockedReason\(/.test(code) && /skipped:\s*\$\{why\}/.test(code), "a blocked run is a clean skip (200 + pulse), not a failure");
  // 2026-10-08: the skip is unconditional and sits before every target read and before warmCreditedPhotos.
  const skipAt = code.search(/(?:^|[;}\n])\s*\{\s*const why = blockedReason\(\{ env: s \}\);\s*await recordPulse\("credited-photos"[^;]*;\s*return Response\.json\(\{ ok: true, skipped: true/);
  ok(skipAt > 0 && skipAt < code.indexOf("loadBlogTargets(") && skipAt < code.indexOf("warmCreditedPhotos({") , "the route's prohibited-skip block is unconditional (not under `if (wantRun)`) and precedes every target read and the worker");
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
  // 2026-10-08: guide figures have NO Google lane any more — the credit/alternative lookups are retired
  // stubs (executed), and the figure module reads neither wf_photo_credit nor the photo| cache.
  const GF = await import("../lib/guidePlaceFigureImage.js");
  ok((await GF.findEditorialPhotoCredit("places/ChIJaaaaaaaaaaaaaaaa/photos/x", "ChIJaaaaaaaaaaaaaaaa")) === null && (await GF.findCreditedEditorialCache("ChIJaaaaaaaaaaaaaaaa")) === null,
    "guidePlaceFigureImage: the credited-Google-photo lookups are retired and return null");
  const fig = stripComments(rd("lib/guidePlaceFigureImage.js"));
  ok(!/wf_photo_credit|photo\||wf_places_cache|findSamePlaceCachedPhoto/.test(fig), "guidePlaceFigureImage no longer reads stored Google credits or cached photo rows");
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
console.log(`test-credited-photo-warm: OK — ${pass} assertions (pre-fetch prohibited under every env/dep/dry-run combination with every dependency trapped; no Google URL in the new code; cron skip precedes target reads; blog identity + guide targets; viewed-first + budget scope)`);
