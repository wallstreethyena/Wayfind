// lib/placeDetailSpine.js — Missions 9 & 22 Layered Place Detail Spine.
//
// Eliminates HTTP 503 as a user-facing Place Detail failure mode and persists
// self-healing structured hours + cached detail snapshots whenever a justified
// live Google lookup succeeds.
//
// Resolution layers (in order):
//   1. Cached rich detail (`pdd1|<placeId>`, < 30d ToS ceiling)
//   2. Owned inventory snapshot (`wf_inventory.signals.owned_hours` + editorial/website/phone)
//   3. Cached standard Place Details (`pd1|<placeId>`, < 30d) + curated guide truth (`lib/guidePlaceIndex.js`)
//   4. Live Google lookup when justified & within spend gate (self-heals Layer 1 + Layer 2!)
//   5. Graceful partial HTTP 200 response whenever Wayfind knows the venue (`?allowPartial=1` / `body.allowPartial`)

import { cget, cset, DAY } from "./serverCache.js";
import { placeDiscoveryRef } from "./discoveryRef.js";
import { guidePlaceFor } from "./guidePlaceIndex.js";
import { loadPlaceDetailPhotos } from "./placeDetailGallery.js";
import {
  buildOwnedHoursRecord,
  isUsableOwnedHours,
  evaluateOwnedHoursStatus,
  persistOwnedHoursSnapshot,
} from "./ownedHours.js";
import { recordDetailMetric } from "./detailTelemetry.js";

const RICH_DETAIL_CACHE_TTL_MS = 30 * DAY; // Strict 30-day ToS ceiling

function richCacheKey(placeId) {
  return `pdd1|${placeId}`;
}

function sanitizeCachedDetailPlace(placeId, rawPlace) {
  if (!rawPlace || typeof rawPlace !== "object") return null;
  const out = {};
  if (rawPlace.id || placeId) out.id = rawPlace.id || placeId;
  if (rawPlace.displayName) out.displayName = rawPlace.displayName;
  if (rawPlace.editorialSummary) out.editorialSummary = rawPlace.editorialSummary;
  if (Array.isArray(rawPlace.reviews) && rawPlace.reviews.length) {
    out.reviews = rawPlace.reviews.slice(0, 5);
  }
  if (rawPlace.regularOpeningHours && typeof rawPlace.regularOpeningHours === "object") {
    out.regularOpeningHours = {
      ...(Array.isArray(rawPlace.regularOpeningHours.periods)
        ? { periods: rawPlace.regularOpeningHours.periods }
        : {}),
      ...(Array.isArray(rawPlace.regularOpeningHours.weekdayDescriptions)
        ? { weekdayDescriptions: rawPlace.regularOpeningHours.weekdayDescriptions }
        : {}),
    };
  }
  if (Number.isFinite(rawPlace.utcOffsetMinutes)) out.utcOffsetMinutes = rawPlace.utcOffsetMinutes;
  if (typeof rawPlace.nationalPhoneNumber === "string" && rawPlace.nationalPhoneNumber) {
    out.nationalPhoneNumber = rawPlace.nationalPhoneNumber;
  }
  if (typeof rawPlace.websiteUri === "string" && rawPlace.websiteUri) {
    out.websiteUri = rawPlace.websiteUri;
  }
  // Compliance: never store raw Google photo resource names
  if (Array.isArray(rawPlace.photos) && rawPlace.photos.length) {
    const directOnly = rawPlace.photos.filter((p) => p && typeof p._directUri === "string");
    out.photos = directOnly.length
      ? directOnly
      : [{ name: placeDiscoveryRef(placeId) }];
  }
  return out;
}

async function readInventoryRowRaw(placeId) {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!raw || !key) return null;
  try {
    const r = await fetch(
      `${raw}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(placeId)}&select=place_id,name,lat,lng,locality,postal_city,category,primary_type,google_types,editorial,signals,status&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

async function readEditorialSummary(placeId) {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!raw || !key) return null;
  try {
    const r = await fetch(
      `${raw}/rest/v1/wf_editorial_servable?place_id=eq.${encodeURIComponent(placeId)}&select=summary,why_go,insider_tip&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return row.summary || row.why_go || row.insider_tip || null;
  } catch {
    return null;
  }
}

async function assembleOwnedDetailSnapshot(placeId, { nowMs = Date.now() } = {}) {
  const [invRow, pdHit, pddHit, guideEntry, editorialText] = await Promise.all([
    readInventoryRowRaw(placeId),
    cget(`pd1|${placeId}`).catch(() => null),
    cget(richCacheKey(placeId)).catch(() => null),
    Promise.resolve().then(() => guidePlaceFor(placeId)).catch(() => null),
    readEditorialSummary(placeId),
  ]);

  // 1. Fresh rich detail cache (`pdd1|<placeId>`, < 30d) has full hours/editorial/reviews
  if (pddHit && pddHit.v && pddHit.wroteKnown && Number.isFinite(pddHit.ageMs) && pddHit.ageMs < RICH_DETAIL_CACHE_TTL_MS) {
    return {
      hasIdentity: true,
      hasRichComplete: true,
      hasSubstantiveEnrichment: true,
      stale: Boolean(pddHit.ageMs > 21 * DAY),
      source: "cached_detail",
      place: sanitizeCachedDetailPlace(placeId, pddHit.v),
      hoursStatus: pddHit.v.regularOpeningHours?.periods
        ? evaluateOwnedHoursStatus(
            buildOwnedHoursRecord({
              periods: pddHit.v.regularOpeningHours.periods,
              weekdayDescriptions: pddHit.v.regularOpeningHours.weekdayDescriptions,
              utcOffsetMinutes: pddHit.v.utcOffsetMinutes,
              source: "google_places",
              verifiedAt: new Date(nowMs - pddHit.ageMs).toISOString(),
            }),
            nowMs,
          )
        : null,
    };
  }

  const sig = invRow?.signals && typeof invRow.signals === "object" ? invRow.signals : {};
  let ownedHours = isUsableOwnedHours(sig.owned_hours, nowMs) ? sig.owned_hours : null;

  // Hydrate hours from fresh (<30d) `pd1|` weekdayDescriptions if not yet in `owned_hours`
  if (
    !ownedHours &&
    pdHit?.v &&
    Array.isArray(pdHit.v.hours) &&
    pdHit.v.hours.length > 0 &&
    pdHit.wroteKnown === true &&
    Number.isFinite(pdHit.ageMs) &&
    pdHit.ageMs >= 0 &&
    pdHit.ageMs < 29 * DAY
  ) {
    ownedHours = buildOwnedHoursRecord({
      weekdayDescriptions: pdHit.v.hours,
      lat: invRow?.lat ?? pdHit.v.lat,
      lng: invRow?.lng ?? pdHit.v.lng,
      source: "google_places",
      verifiedAt: new Date(nowMs - pdHit.ageMs).toISOString(),
    });
  }

  // Hydrate hours from curated guide entry if present
  if (!ownedHours && guideEntry && Array.isArray(guideEntry.hours) && guideEntry.hours.length > 0) {
    ownedHours = buildOwnedHoursRecord({
      weekdayDescriptions: guideEntry.hours,
      lat: invRow?.lat ?? guideEntry.lat,
      lng: invRow?.lng ?? guideEntry.lng,
      source: "editorial_curated",
      verifiedAt: new Date(nowMs).toISOString(),
    });
  }

  const summaryText =
    editorialText ||
    invRow?.editorial ||
    sig.editorial ||
    guideEntry?.description ||
    guideEntry?.whyGo ||
    guideEntry?.blurb ||
    guideEntry?.summary ||
    pdHit?.v?.description ||
    null;

  const phone = sig.phone || guideEntry?.phone || null;
  const website = sig.website || sig.official_url || guideEntry?.website || null;

  let galleryPhotos = [];
  if (invRow) {
    const coverSrc =
      typeof sig.photo_url === "string"
        ? sig.photo_url
        : typeof sig.photoUrl === "string"
          ? sig.photoUrl
          : "";
    try {
      const gal = await loadPlaceDetailPhotos(placeId, { name: invRow.name, signals: sig, coverSrc });
      if (Array.isArray(gal) && gal.length) {
        galleryPhotos = gal.map((ph) => ({ _directUri: ph.src }));
      }
    } catch {}
  }

  const hasSubstantiveEnrichment = Boolean(ownedHours || summaryText || phone || website);
  const hasIdentity = Boolean(invRow || pdHit?.v || guideEntry);

  if (!hasIdentity && !hasSubstantiveEnrichment) {
    return {
      hasIdentity: false,
      hasRichComplete: false,
      hasSubstantiveEnrichment: false,
      stale: false,
      source: null,
      place: null,
      hoursStatus: null,
    };
  }

  const place = {
    id: placeId,
    ...(invRow?.name || guideEntry?.name || pdHit?.v?.name
      ? { displayName: { text: invRow?.name || guideEntry?.name || pdHit?.v?.name } }
      : {}),
    ...(summaryText ? { editorialSummary: { text: String(summaryText) } } : {}),
    ...(ownedHours
      ? {
          regularOpeningHours: {
            periods: ownedHours.periods,
            weekdayDescriptions: ownedHours.weekdayDescriptions || [],
          },
          utcOffsetMinutes: ownedHours.utcOffsetMinutes,
        }
      : {}),
    ...(phone ? { nationalPhoneNumber: String(phone) } : {}),
    ...(website ? { websiteUri: String(website) } : {}),
    photos: galleryPhotos.length
      ? galleryPhotos
      : [{ name: placeDiscoveryRef(placeId) }],
  };

  const hoursStatus = ownedHours ? evaluateOwnedHoursStatus(ownedHours, nowMs) : null;
  const isCompleteWithoutLive = Boolean(ownedHours && (summaryText || website || phone));

  return {
    hasIdentity,
    hasRichComplete: isCompleteWithoutLive,
    hasSubstantiveEnrichment,
    stale: Boolean(hoursStatus && hoursStatus.freshness === "stale"),
    source: ownedHours
      ? "owned_snapshot"
      : summaryText
        ? "editorial_truth"
        : "inventory_partial",
    place,
    hoursStatus,
  };
}

/**
 * Layer 1-3 Pre-Spend Resolver:
 * If Wayfind already holds complete rich detail (`pdd1|` cache or owned hours + editorial/contact),
 * serve immediately in HTTP 200 without consuming Google Atmosphere quota!
 */
export async function resolveOwnedDetailBeforeSpend(placeId, { forceLive = false, nowMs = Date.now() } = {}) {
  if (!placeId || forceLive) return null;
  const snap = await assembleOwnedDetailSnapshot(placeId, { nowMs });
  if (!snap || !snap.hasRichComplete || !snap.place) return null;

  recordDetailMetric("paid_lookup_skipped", snap.source);
  recordDetailMetric("snapshot_served", snap.source);
  if (snap.stale) recordDetailMetric("snapshot_stale", snap.source);

  return {
    place: snap.place,
    source: snap.source,
    hoursMeta: snap.hoursStatus,
  };
}

/**
 * Layer 4 Self-Healing Writeback (Mission 22):
 * Persist structured hours (`signals.owned_hours`, capped at 30d for Google) +
 * sanitized rich detail cache (`pdd1|<placeId>`) when a live lookup succeeds.
 */
export async function persistLiveDetailEnrichment(placeId, rawGooglePlace, { kind = "detail", nowMs = Date.now() } = {}) {
  recordDetailMetric("live_refresh_success", `google_${kind}`);
  if (!placeId || !rawGooglePlace || typeof rawGooglePlace !== "object") return;

  const verifiedAt = new Date(nowMs).toISOString();
  const rawOh = rawGooglePlace.regularOpeningHours;
  if (rawOh && (Array.isArray(rawOh.periods) || Array.isArray(rawOh.weekdayDescriptions))) {
    const loc = rawGooglePlace.location || {};
    const record = buildOwnedHoursRecord({
      periods: rawOh.periods,
      weekdayDescriptions: rawOh.weekdayDescriptions,
      utcOffsetMinutes: rawGooglePlace.utcOffsetMinutes,
      lat: loc.latitude,
      lng: loc.longitude,
      source: "google_places",
      verifiedAt,
    });
    if (record) {
      await persistOwnedHoursSnapshot(placeId, record, { nowMs }).catch(() => {});
    }
  }

  if (kind === "detail") {
    const sanitized = sanitizeCachedDetailPlace(placeId, rawGooglePlace);
    if (sanitized) {
      await cset(richCacheKey(placeId), sanitized, RICH_DETAIL_CACHE_TTL_MS).catch(() => {});
    }
  }
}

/**
 * Layer 5 Zero-503 Graceful Fallback (Mission 9 & Mission 20):
 * When quota is exhausted, gate is shut, or upstream Google errors/times out,
 * return owned/cached/editorial detail in HTTP 200 instead of failing with 503!
 */
export async function resolveGracefulDetailFallback(
  placeId,
  { reason = "budget", allowPartial = false, isUpstreamError = false, nowMs = Date.now() } = {},
) {
  if (isUpstreamError) recordDetailMetric("live_refresh_failure", reason);
  else recordDetailMetric("paid_lookup_skipped", reason);

  const snap = await assembleOwnedDetailSnapshot(placeId, { nowMs });
  if (!snap) return null;

  if (snap.hasSubstantiveEnrichment && snap.place) {
    recordDetailMetric("snapshot_served", snap.source);
    if (snap.stale) recordDetailMetric("snapshot_stale", snap.source);
    return {
      place: snap.place,
      source: snap.source,
      partial: !snap.hasRichComplete,
      degraded: reason,
      hoursMeta: snap.hoursStatus,
    };
  }

  if (allowPartial && snap.hasIdentity && snap.place) {
    recordDetailMetric("degraded_partial_served", "inventory_partial");
    return {
      place: snap.place,
      source: "inventory_partial",
      partial: true,
      degraded: reason,
      hoursMeta: null,
    };
  }

  return null;
}
