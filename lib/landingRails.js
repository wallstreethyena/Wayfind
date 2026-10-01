// lib/landingRails.js — SERVER seeds for the three partner rails on the SSR
// landing pages (/things-to-do/<city>, /beaches/<city>, ...).
//
// WHY. TourStrip, IntentPartnerPick and ThemeParkRail are "use client" and fill
// themselves from useEffect fetches, so `curl /things-to-do/sarasota` contained
// none of their go-route links: the most commercially-intended URL shape on the
// site had no crawlable partner CTA at all. These helpers run the SAME reads the
// API routes run and hand the result to the components as first-paint seeds.
//
// WHAT IT DOES NOT CHANGE. Links are still built by the components through
// commerceHref (-> /api/commerce/go); the components still run their mount
// fetch, whose answer wins; a failed/empty/slow server read yields `undefined`
// and the component behaves exactly as it did before this file existed.
//
// COST. Every read here is a Supabase read of OWNED tables (wf_experiences,
// wf_inventory) — no Viator/Places/Anthropic call. They go through the Next data
// cache (`next: { revalidate }`), never `cache: "no-store"`, because a no-store
// fetch flips a statically generated page to dynamic rendering. The paid legs of
// the client rail (/api/viator/tours live search, /api/viator/curated live
// product lookup) are deliberately NOT run at render time.
import { serveExperiences } from "./experiencesServe.js";
import { loadThemeParks } from "./themeParksServer.js";
import { prepareTourStripItems } from "./tourStripItems.js";
import { partnerInventoryFetchPlan, qualifyPartnerInventory, partnerInventoryEligibleForIntent, resolvedIntentPartnerPicks, PARTNER_INVENTORY_CANDIDATE_COUNT, PARTNER_RAIL_RENDER_LIMIT } from "./intentPartnerPicks.js";
import { rankExperiences } from "./experiencesData.js";

/** Same window landing.js uses for its other Supabase reads. */
export const LANDING_RAIL_REVALIDATE_S = 86400;
/** A slow Supabase must never hold a page render open. */
export const LANDING_RAIL_DEADLINE_MS = 4000;

const CACHED_READ = Object.freeze({ next: { revalidate: LANDING_RAIL_REVALIDATE_S } });

function withDeadline(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("landing rail deadline")), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Seed for <TourStrip initialItems>. Mirrors the strip's own client fetch:
 * /api/experiences?lat&lng&mi=60&cat=all&limit=12&page=0, then the same
 * prepareTourStripItems. `undefined` (not []) on any failure or a dark table, so
 * the component falls back to its client-only path.
 */
export async function ssrTourStripItems({ lat, lng, waterOnly = false, serve = serveExperiences, deadlineMs = LANDING_RAIL_DEADLINE_MS } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  try {
    const res = await withDeadline(serve({ lat, lng, mi: 60, cat: "all", limit: 12, page: 0, fetchInit: CACHED_READ }), deadlineMs);
    if (!res || res.dark) return undefined;
    // The WHOLE prepared pool (up to the 12 fetched), NOT pre-excluded against the
    // rail: TourStrip applies the exclusion itself — the server prediction on first
    // paint, then whatever the rail ACTUALLY renders — so a product the rail turns out
    // not to show can come back from this seed even if the client refresh fails.
    const items = prepareTourStripItems(res, { waterOnly, limit: 12 });
    return items.length >= 2 ? items : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Seed for <IntentPartnerPick initialInventory>: the OWNED wf_experiences leg of
 * fetchPartnerInventory() (the /api/experiences?city=&limit= call), qualified and
 * intent-filtered exactly as the client does. Only owned destinations have that
 * leg; every other city returns `undefined` and keeps the client-only path.
 */
export async function ssrPartnerInventory({ city, intent, serve = serveExperiences, deadlineMs = LANDING_RAIL_DEADLINE_MS } = {}) {
  try {
    const plan = partnerInventoryFetchPlan(city, intent);
    if (!plan || !plan.experiencesUrl) return undefined;
    const q = new URLSearchParams(plan.experiencesUrl.split("?")[1] || "");
    const res = await withDeadline(serve({ city: q.get("city") || undefined, cat: "all", limit: Number(q.get("limit")) || undefined, fetchInit: CACHED_READ }), deadlineMs);
    if (!res || res.dark || !Array.isArray(res.items)) return undefined;
    const rows = qualifyPartnerInventory(res.items).filter((row) => partnerInventoryEligibleForIntent(row, intent)).slice(0, plan.candidateCount);
    return rows.length ? rows : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The viator product codes IntentPartnerPick will render from `inventory` — the
 * SERVER prediction the strip excludes on first paint. Mirrors the rail's
 * own selection: same resolver, same qualification, image required, viator only,
 * rank then the same render limit. It is the strip's first-paint exclusion (the
 * rail's server render has no hour bonus, so normally the same set). After mount the
 * rail can reorder
 * by time of day, refresh, crash or vanish; TourStrip then follows the rail's actual
 * DOM, so this is a first-paint prediction, not the authority.
 */
export function railViatorCodes({ city, intent, inventory } = {}) {
  try {
    if (!city || !intent || !Array.isArray(inventory) || !inventory.length) return [];
    const picks = rankExperiences(resolvedIntentPartnerPicks(city, intent, qualifyPartnerInventory(inventory), PARTNER_INVENTORY_CANDIDATE_COUNT))
      .filter((p) => p && p.image && p.offerId && p.provider === "viator" && p.link_ok !== false);
    return picks.slice(0, PARTNER_RAIL_RENDER_LIMIT).map((p) => String(p.offerId).trim());
  } catch {
    return [];
  }
}

/** Seed for <ThemeParkRail initialItems>: the /api/theme-parks read, same loader. */
export async function ssrThemeParks({ mode, load = loadThemeParks, deadlineMs = LANDING_RAIL_DEADLINE_MS } = {}) {
  try {
    const items = await withDeadline(load({ mode, fetchInit: CACHED_READ, deadlineMs }), deadlineMs + 500);
    return Array.isArray(items) && items.length ? items : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Everything a landing render needs, in parallel, never throwing. Each field is
 * `undefined` when its read did not produce a usable seed.
 */
export async function landingRailSeeds({ catSlug, city, metro, railIntent, deps = {} } = {}) {
  const wantsTours = catSlug === "things-to-do" || catSlug === "beaches";
  const wantsParks = catSlug === "things-to-do" && (metro === "orlando" || metro === "tampa");
  const [tourItems, partnerInventory, themeParks] = await Promise.all([
    wantsTours && city ? ssrTourStripItems({ lat: city.lat, lng: city.lng, waterOnly: catSlug === "beaches", ...(deps.tour || {}) }) : undefined,
    railIntent && city ? ssrPartnerInventory({ city: city.name, intent: railIntent, ...(deps.inventory || {}) }) : undefined,
    wantsParks ? ssrThemeParks({ mode: metro === "orlando" ? "orlando" : "flagship", ...(deps.parks || {}) }) : undefined,
  ]);
  // railCodes: the server's PREDICTION of the viator products the rail renders —
  // TourStrip's first-paint exclusion only (one offer, one slot); after mount the strip
  // follows the rail's actual DOM.
  const railCodes = railViatorCodes({ city: city && city.name, intent: railIntent, inventory: partnerInventory });
  return { tourItems, partnerInventory, themeParks, railCodes };
}
