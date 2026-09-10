// TEMPORARY repair-branch diagnostic for the 2026-09-10 rails timeout.
// Never calls Google: every rankedFor call is inventoryOnly and the nearby
// lane reads owned wf_inventory directly. Remove before merge.
import { rankedFor, LANDING_CITIES } from "../../../lib/landing.js";
import { RAIL_SELECT } from "../../../lib/railSelect.js";
import { buildNearbyPool, NEARBY_CATS } from "../../../lib/nearbyPool.js";
import { makeReadCache } from "../../../lib/inventoryReadCache.js";
import { primeConsolidatedInventoryReads } from "../../../lib/inventoryBoxBatch.js";
import { poolCitiesFor } from "../../../lib/railsData.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYNTHETIC = new Set(["creators", "summer", "birthday", "breakfast", "quickeats", "family", "events", "localpicks"]);

function ms(t) { return Date.now() - t; }

export async function GET(req) {
  if (process.env.VERCEL_ENV === "production") {
    return Response.json({ ok: false, reason: "preview_only" }, { status: 404 });
  }
  const sp = new URL(req.url).searchParams;
  const citySlug = sp.get("city") || "bradenton";
  const city = LANDING_CITIES[citySlug];
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!city || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ ok: false, reason: "bad_input" }, { status: 400 });
  }
  const origin = { lat, lng };
  const cities = poolCitiesFor(citySlug);
  const cats = [...new Set(Object.values(RAIL_SELECT).flatMap((c) => c.pools))].filter((c) => !SYNTHETIC.has(c));
  const jobs = [];
  for (const cat of cats) for (const slug of cities) jobs.push({ cat, city: slug });
  const nearbyCats = cats.filter((c) => NEARBY_CATS[c]);
  const locName = city.name || null;

  const serialCache = makeReadCache();
  let t = Date.now();
  await primeConsolidatedInventoryReads(jobs.map(({ cat, city: slug }) => ({ catSlug: cat, city: LANDING_CITIES[slug] })), serialCache).catch(() => {});
  const primeMs = ms(t);

  t = Date.now();
  const ranked = await Promise.all(jobs.map(({ cat, city: slug }) =>
    rankedFor(cat, slug, { withPhotos: true, skipEditorial: true, readCache: serialCache, inventoryOnly: true }).then((r) => r || []).catch(() => [])));
  const rankedMs = ms(t);

  t = Date.now();
  const nearby = await Promise.all(nearbyCats.map((cat) =>
    buildNearbyPool(origin, cat, { locName, skipEditorial: true, readCache: serialCache }).catch(() => [])));
  const nearbyMs = ms(t);

  // Fresh cache so this is a fair model of the proposed scheduling, not a
  // second pass riding the serial run's memoized promises.
  const overlapCache = makeReadCache();
  t = Date.now();
  await primeConsolidatedInventoryReads(jobs.map(({ cat, city: slug }) => ({ catSlug: cat, city: LANDING_CITIES[slug] })), overlapCache).catch(() => {});
  const overlapPrimeMs = ms(t);

  t = Date.now();
  const [ranked2, nearby2] = await Promise.all([
    Promise.all(jobs.map(({ cat, city: slug }) =>
      rankedFor(cat, slug, { withPhotos: true, skipEditorial: true, readCache: overlapCache, inventoryOnly: true }).then((r) => r || []).catch(() => []))),
    Promise.all(nearbyCats.map((cat) =>
      buildNearbyPool(origin, cat, { locName, skipEditorial: true, readCache: overlapCache }).catch(() => []))),
  ]);
  const overlappedWaveMs = ms(t);

  return Response.json({
    ok: true,
    citySlug,
    cities,
    cats,
    nearbyCats,
    serial: {
      primeMs,
      rankedMs,
      nearbyMs,
      totalMeasuredMs: primeMs + rankedMs + nearbyMs,
      rankedRows: ranked.reduce((n, rows) => n + rows.length, 0),
      nearbyRows: nearby.reduce((n, rows) => n + rows.length, 0),
      readCacheKeys: serialCache.size(),
    },
    proposed: {
      primeMs: overlapPrimeMs,
      rankedAndNearbyMs: overlappedWaveMs,
      totalMeasuredMs: overlapPrimeMs + overlappedWaveMs,
      rankedRows: ranked2.reduce((n, rows) => n + rows.length, 0),
      nearbyRows: nearby2.reduce((n, rows) => n + rows.length, 0),
      readCacheKeys: overlapCache.size(),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
