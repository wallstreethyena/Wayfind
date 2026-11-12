// Trending social: every eligible social asset, resolved to the Wayfind thing
// it is about, scored by the one Trend Score (lib/trendEngine.js), and
// reconciled so a miss is visible. Server only; the browser receives only the
// page of cards it shows (app/api/trending/social).
//
//   buildTrendingSocial({ origin, deps }) -> {
//     items:   ranked cards (every eligible asset is in exactly one card,
//              as its leader or as an alternate of the leader for the same
//              subject),
//     audit:   { counts, eligible, present, excluded, missing, duplicates, broken }
//   }
//
// MISSING must be 0: an eligible asset that is not in any card is a defect,
// reported by scripts/test-social-trending.mjs (CI) and the production
// monitor scripts/check-social-trending-live.mjs.
import { allSocialAssets, socialAssetEligibility, activeSeasons, isIndependentAsset, igShortcode } from "./socialAssets.js";
import { rankTrendCandidates, trendEligibility, TREND_MODEL_VERSION } from "./trendEngine.js";
import { GUIDES } from "./guides.js";
import { eventPhotos } from "./eventPhotos.js";

const PAGES = Object.freeze({
  "/christmas-in-florida": { name: "Christmas in Florida", city: "Florida" },
  "/halloween-in-florida": { name: "Halloween in Florida", city: "Florida" },
  "/florida-events": { name: "Florida events", city: "Florida" },
});

const ENTITY_PRIORITY = { event: 0, place: 1, guide: 2, page: 3 };

function photoSrc(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.src || x.url || null;
}

/** A resolved subject the engine can score and a card can link to. */
function resolveEntity(ref, deps) {
  if (!ref) return null;
  if (ref.type === "event") {
    const e = deps.eventsById.get(ref.id) || deps.eventsBySlug.get(ref.id);
    if (!e) return null;
    const photos = eventPhotos(e.event_id);
    return {
      type: "event", id: e.event_id, name: e.short_title || e.event_name, city: e.city || null,
      lat: e.lat, lng: e.lng, start_date: e.start_date, end_date: e.end_date, ticket_status: e.ticket_status || null,
      status: e.event_status === "cancelled" ? "cancelled" : "scheduled",
      photo: photoSrc(e.hero_image) || photoSrc(photos && photos.hero) || photoSrc(photos && photos.photos && photos.photos[0]) || null,
      verified: !!e.last_verified_at, lastVerifiedAt: e.last_verified_at || null,
      href: "/florida-events/" + encodeURIComponent(e.slug || e.event_id),
    };
  }
  if (ref.type === "place") {
    const p = deps.placesById.get(ref.id);
    if (!p) return null;
    return {
      type: "place", id: p.place_id, name: p.name, city: p.locality || p.city || null, metro: p.metro || null,
      lat: p.lat, lng: p.lng, photo: "/api/photo?place=" + encodeURIComponent(p.place_id) + "&g=2&w=640",
      verified: p.status === "OPERATIONAL", href: "/p/" + encodeURIComponent(p.place_id),
    };
  }
  if (ref.type === "guide") {
    const g = GUIDES[ref.id];
    if (!g) return null;
    const firstPick = (g.picks || []).find((x) => x && x.placeId);
    const anchor = firstPick ? deps.placesById.get(firstPick.placeId) : null;
    return {
      type: "guide", id: ref.id, name: g.title || ref.id, city: g.city || (anchor && (anchor.locality || anchor.city)) || null,
      lat: anchor ? anchor.lat : null, lng: anchor ? anchor.lng : null,
      photo: firstPick ? "/api/photo?place=" + encodeURIComponent(firstPick.placeId) + "&g=2&w=640" : null,
      verified: true, href: "/guides/" + encodeURIComponent(ref.id),
    };
  }
  if (ref.type === "page") {
    const page = PAGES[ref.id];
    if (!page) return null;
    return { type: "page", id: ref.id, name: page.name, city: page.city, lat: null, lng: null, photo: null, verified: true, href: ref.id };
  }
  return null;
}

/** The subject a post stands on: a live event first, then place, guide, page. */
function primaryEntity(asset, deps, today) {
  const resolved = asset.entities.map((r) => resolveEntity(r, deps)).filter(Boolean);
  resolved.sort((a, b) => (ENTITY_PRIORITY[a.type] ?? 9) - (ENTITY_PRIORITY[b.type] ?? 9)
    || (a.type === "event" && b.type === "event" ? String(a.start_date || "").localeCompare(String(b.start_date || "")) : 0));
  // Prefer an event that has not ended.
  const live = resolved.find((e) => e.type !== "event" || !e.end_date || e.end_date >= today || e.start_date >= today);
  return { primary: live || resolved[0] || null, resolved, unresolved: asset.entities.length - resolved.length };
}

/** The post itself, for a discovery post with no single Wayfind subject. */
function postEntity(asset) {
  return { type: "post", id: asset.id, name: firstLine(asset.caption) || "Wayfind plan", city: asset.city || null, lat: null, lng: null, photo: null, verified: true, href: null };
}

function firstLine(text) {
  const line = String(text || "").split(/(?<=[.!?])\s|\n/)[0].trim();
  return line.length > 90 ? line.slice(0, 87).replace(/\s+\S*$/, "") + "…" : line;
}

function median(xs) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * deps: { today, nowMs, eventsById, eventsBySlug, placesById, velocityByPlace,
 *         extraOwned }. Pure given deps, so the guards can call it offline.
 */
export function buildTrendingSocial({ origin = null, deps }) {
  const { today, nowMs } = deps;
  const seasons = new Set(activeSeasons(today));
  const assets = allSocialAssets({ extraOwned: deps.extraOwned || [] });

  // Distinct independent creators per subject (all time on the registry,
  // counted once per handle): the corroboration signal.
  const creatorsByEntity = new Map();
  for (const a of assets) {
    if (!isIndependentAsset(a)) continue;
    for (const r of a.entities) {
      const k = r.type + ":" + r.id;
      if (!creatorsByEntity.has(k)) creatorsByEntity.set(k, new Set());
      creatorsByEntity.get(k).add(String(a.owner).toLowerCase());
    }
  }
  const ownedViewsPerDay = assets.filter((a) => a.owned && Number.isFinite(a.metrics && a.metrics.views) && a.publishedMs)
    .map((a) => a.metrics.views / Math.max(1, (nowMs - a.publishedMs) / 86400000));
  const ctx = { today, nowMs, origin, accountMedianViewsPerDay: median(ownedViewsPerDay) };

  const audit = { model: TREND_MODEL_VERSION, today, eligible: [], excluded: [], twins: [], unresolved: [], duplicates: [], broken: [] };
  const candidates = [];
  const seenCodes = new Map();
  for (const a of assets) {
    if (a.platform === "instagram") {
      const code = igShortcode(a.permalink);
      if (!code) { audit.broken.push({ id: a.id, reason: "permalink_unreadable", permalink: a.permalink }); continue; }
      if (seenCodes.has(code) && seenCodes.get(code) !== a.id) audit.duplicates.push({ id: a.id, other: seenCodes.get(code) });
      seenCodes.set(code, a.id);
    }
    // Only owned posts and creator posts about something current compete;
    // the rest of the 600+ creator library is not "trending" by default.
    const el = socialAssetEligibility(a);
    if (!el.ok) {
      if (el.reason.startsWith("twin_of:")) audit.twins.push({ id: a.id, of: a.twinOf });
      else audit.excluded.push({ id: a.id, reason: el.reason, owned: a.owned });
      continue;
    }
    const { primary, resolved, unresolved } = primaryEntity(a, deps, today);
    if (unresolved) audit.unresolved.push({ id: a.id, unresolved, entities: a.entities });
    if (!a.owned && !primary) { audit.excluded.push({ id: a.id, reason: "subject_not_on_wayfind", owned: false }); continue; }
    const entity = primary || postEntity(a);
    const entityKey = entity.type + ":" + entity.id;
    const independentCreators = creatorsByEntity.has(entityKey) ? creatorsByEntity.get(entityKey).size : 0;
    const inSeason = (a.seasons || []).some((s) => seasons.has(s))
      || resolved.some((e) => e.type === "page" && ((e.id === "/christmas-in-florida" && seasons.has("christmas")) || (e.id === "/halloween-in-florida" && seasons.has("halloween"))));
    const c = {
      kind: "social", id: a.id, asset: a, entity, others: resolved.filter((e) => e !== primary),
      signals: {
        owned: a.owned, publishedMs: a.publishedMs, inSeason, views: a.metrics && a.metrics.views,
        independentCreators,
        ...(entity.type === "place" && deps.velocityByPlace && deps.velocityByPlace.get(entity.id) ? deps.velocityByPlace.get(entity.id) : {}),
        lastVerifiedMs: entity.lastVerifiedAt ? Date.parse(entity.lastVerifiedAt) : null,
      },
    };
    // Creator library posts enter only while their subject is current
    // (a live event or an in-season tag) or the post itself is fresh; that
    // timing rule is the engine's, applied here once for the audit.
    const timing = trendEligibility(c, ctx);
    if (!timing.ok) { audit.excluded.push({ id: a.id, reason: timing.reason, owned: a.owned }); continue; }
    audit.eligible.push(a.id);
    candidates.push(c);
  }

  const { ranked, excluded, collapsed } = rankTrendCandidates(candidates, ctx);
  for (const x of excluded) audit.excluded.push({ ...x, owned: null, late: true });
  const twinsOf = new Map();
  for (const t of audit.twins) { if (!twinsOf.has(t.of)) twinsOf.set(t.of, []); twinsOf.get(t.of).push(t.id); }

  const assetById = new Map(candidates.map((c) => [c.id, c.asset]));
  const items = ranked.map((c, i) => {
    // A twin rides with its carousel whether the carousel leads this card or
    // is itself an alternate in it.
    const alternates = [...c.alternates, ...[c.id, ...c.alternates].flatMap((id) => twinsOf.get(id) || [])].map((id) => {
      const a = assetById.get(id) || assets.find((x) => x.id === id);
      return a ? { id: a.id, permalink: a.permalink, format: a.format, owner: a.owner, owned: a.owned } : null;
    }).filter(Boolean);
    return {
      rank: i + 1, id: c.id, platform: c.asset.platform, permalink: c.asset.permalink, format: c.asset.format,
      owner: c.asset.owner, owned: c.asset.owned, publishedAt: c.asset.publishedMs ? new Date(c.asset.publishedMs).toISOString() : null,
      title: c.entity.type === "post" ? c.entity.name : c.entity.name, caption: firstLine(c.asset.caption) || null,
      entity: { type: c.entity.type, id: c.entity.id, name: c.entity.name, city: c.entity.city || null, href: c.entity.href || null,
        start_date: c.entity.start_date || null, end_date: c.entity.end_date || null },
      // Our own post's cover, copied to our storage by the ingestion, first;
      // otherwise the subject's first-party photo. Never an Instagram CDN link.
      cover: c.asset.owned && c.asset.coverUrl && !/cdninstagram|fbcdn/.test(c.asset.coverUrl) ? { src: c.asset.coverUrl, kind: "post" }
        : c.entity.photo ? { src: c.entity.photo, kind: c.entity.type } : null,
      trend: { score: c.trend.score, labels: c.trend.labels, receipt: c.trend.receipt, distanceMi: c.trend.distanceMi },
      alternates,
    };
  });

  // Reconcile: every eligible asset sits in exactly one card, and every twin
  // rides with a card whose leader is its carousel (or the carousel's own
  // leader).
  const inCards = new Map();
  for (const it of items) {
    for (const id of [it.id, ...it.alternates.map((x) => x.id)]) inCards.set(id, (inCards.get(id) || 0) + 1);
  }
  audit.present = [...inCards.keys()];
  audit.missing = audit.eligible.filter((id) => !inCards.has(id));
  const eligibleSet = new Set(audit.eligible);
  for (const t of audit.twins) {
    if (eligibleSet.has(t.of)) { if (!inCards.has(t.id)) audit.missing.push(t.id); }
    // A twin rides with its carousel; when the carousel itself is excluded
    // (aged out, brand) the twin is excluded for the same reason.
    else audit.excluded.push({ id: t.id, reason: "twin_of_excluded:" + t.of, owned: true });
  }
  for (const [id, n] of inCards) if (n > 1) audit.duplicates.push({ id, cards: n });
  audit.collapsed = collapsed;
  // Every asset lands in exactly one bucket: in a card, excluded with a
  // reason, or broken. Anything else is UNKNOWN and fails the guard.
  const bucketed = new Set([...inCards.keys(), ...audit.excluded.map((x) => x.id), ...audit.broken.map((x) => x.id)]);
  audit.unknown = assets.filter((a) => !bucketed.has(a.id)).map((a) => a.id);
  audit.excludedWithoutReason = audit.excluded.filter((x) => !x.reason).map((x) => x.id);
  const owned = assets.filter((a) => a.owned);
  audit.counts = {
    published_owned: owned.length,
    owned_reels: owned.filter((a) => a.format === "reel").length,
    owned_carousels: owned.filter((a) => a.format === "carousel").length,
    owned_images: owned.filter((a) => a.format === "image").length,
    creator_assets: assets.length - owned.length,
    eligible: audit.eligible.length,
    in_trending_cards: items.length,
    represented: audit.present.length,
    twins_represented_by_carousel: audit.twins.filter((t) => inCards.has(t.id)).length,
    excluded: audit.excluded.length,
    missing: audit.missing.length,
    unknown: audit.unknown.length,
    duplicates: audit.duplicates.length,
    broken: audit.broken.length,
    unresolved_entities: audit.unresolved.length,
    latest_owned_publish: owned.reduce((m, a) => Math.max(m, a.publishedMs || 0), 0) ? new Date(owned.reduce((m, a) => Math.max(m, a.publishedMs || 0), 0)).toISOString() : null,
  };
  return { items, audit };
}
