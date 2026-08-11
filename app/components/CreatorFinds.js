"use client";
// app/components/CreatorFinds.js — "Finds from local creators".
//
// v6.97. The owner's note on the approved mockup: "Your differentiator, and the
// one thing no competitor has. It keeps its own row."
//
// It did not have a row. app/home.js has been COMPUTING this list on every
// render — dedupe the nearby pool, keep the places with a curated creator
// video, sort by score, take eight — and passing it into BestNearby as
// `videoPlaces`, where the only thing that reads it is the "Local trends"
// section, which is switched off (`SHOW_TRENDS = false`). So the work was done
// and the result was thrown away on every render. This renders it.
//
// What each card shows is deliberately narrow: the place's OWN photo, the
// creator's handle, and the platform. Never the creator's video thumbnail —
// that is the never-re-host rule from CREATOR_VIDEO_SPEC.md, and it is why the
// detail sheet has always used the place photo too.
//
// v6.98 — COVERAGE. The row was built to render nothing when empty, which is
// right. It was not built for ONE. A reader in Parrish got a single orphan card
// with dead space to the right of it, which reads as a broken feature rather
// than as thin coverage — the owner's own report, and fair.
//
// The limit is not the creator library, it is the PLACE POOL: `videoPlaces` can
// only contain places Google already loaded near the reader (17 mi by default),
// so curated spots 30 miles up the road are invisible even though they exist.
//
// RANKING_AND_FEATURING_SPEC.md §4 already ruled on this: "Below threshold
// (< 3 qualifying places in radius), do not render a thin local list — offer
// the nearest covered metro ('worth the drive')... A thin list teaches someone
// the ranking is bad; an honest empty state teaches them it is careful."
// This is that rule, applied to the one surface that never got it.
import { useEffect, useState } from "react";
import { PLATFORM } from "../../lib/creatorVideos";
import { CREATOR_FINDS_MAX, CREATOR_FINDS_MIN, CREATOR_BRIDGE_MAX_MI, CREATOR_FINDS_RADIUS_MI, orderFinds, bridgeCity, scoutedSpots, mergeCreatorInventory } from "../../lib/creatorFinds";
import { C, TYPE } from "./kit";
// v7.02: the row renders the canonical place card (see RailCard.js). The chip
// source is IconicPlaceCard's experienceTags — the portable, evidence-bound
// adaptation of home.js's experienceBadges that check-collection-look.mjs
// already pins — rather than a fourth copy of the same badge logic.
import RailCard, { RailNav, RailDots } from "./RailCard";
import { experienceTags } from "./IconicPlaceCard";
import { coarseCat } from "../../lib/ranking";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { governedWayfindScore } from "../../lib/wayfindScore";
import { priceLabel } from "../../lib/price";
import { businessStatus } from "../../lib/businessStatus";

const compactCount = (n) => (Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0));

// Same law as IconicPlaceCard: prefer the governed score the row was actually
// ranked by, so the badge can never disagree with the card's position.
function cardScore(p) {
  if (!p) return null;
  return toDisplayScore(Number.isFinite(p.governed_score) ? p.governed_score : p.wfScore != null ? p.wfScore : wayfindScore(p.rating, p.reviews));
}

// NO DISTANCE HERE, deliberately — the /best-of card's facts row prints one and
// this row must not. Two different kinds of card share this row: pool rows carry
// a measured distance, registry-hydrated rows carry a CITY CENTROID that
// lib/creatorVideos.js promises is used for sorting and "never shown to a user."
// One facts row cannot tell them apart at render time, so neither gets one
// rather than one of them claiming a precision the data cannot back up.
// check-home-answer-first.mjs asserts this file assembles no distance string.
function cardFacts(p) {
  if (!p) return [];
  const status = businessStatus({ ...p, oh: p.oh || p.regularOpeningHours || null, utcOffset: p.utcOffset != null ? p.utcOffset : p.utcOffsetMinutes });
  const state = status.open === true ? "Open" : status.open === false ? "Closed" : null;
  return [
    p.reviews ? compactCount(p.reviews) + " reviews" : null,
    priceLabel(p.priceLevel != null ? p.priceLevel : p.price_level != null ? p.price_level : p.priceNum),
    state,
  ].filter(Boolean);
}

// Two chips, because a 318px card fits two. The creator video leads (it is why
// this row exists), then the strongest evidence-bound experience tag.
function creatorChips(p, onExperience) {
  const tags = experienceTags(p, 1);
  return [
    { key: "creatorvideo", icon: "🎬", label: "Creator video", onClick: onExperience ? () => onExperience("creatorvideo", p) : null },
    ...tags.map((t) => ({ key: t.key, icon: t.icon, label: t.label, onClick: onExperience ? () => onExperience(t.key, p) : null })),
  ].slice(0, 2);
}

// Cross-render cache so a scouted spot's resolved photo survives re-renders and
// tab returns without re-hitting the search endpoint. Keyed by name|city.
const _scoutedPhotoCache = new Map();
const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const normalizedName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// /api/places/search can answer from two lawful caches: the normalized owned
// inventory shape or Google's raw Places shape. Both carry the same real data,
// but the old adapter read only the former. That is how a registry card could
// have a photo yet drop its rating and therefore its Wayfind Score.
export function creatorSearchPlace(first, fallbackName = "") {
  if (!first) return null;
  const name = first.name || (first.displayName && first.displayName.text) || fallbackName;
  const ref = first.photo_ref || (Array.isArray(first.photos) && first.photos[0] && first.photos[0].name) || null;
  const signals = first.signals || {};
  const loc = first.location || {};
  return {
    id: first.id || first.place_id || null,
    name,
    photo: ref && REF_RX.test(ref) ? "/api/photo?ref=" + encodeURIComponent(ref) + "&w=280" : "",
    types: Array.isArray(first.types) ? first.types : (Array.isArray(first.google_types) ? first.google_types : []),
    rating: signals.rating != null && Number.isFinite(Number(signals.rating)) ? Number(signals.rating) : (first.rating != null && Number.isFinite(Number(first.rating)) ? Number(first.rating) : null),
    reviews: signals.reviews != null && Number.isFinite(Number(signals.reviews)) ? Number(signals.reviews) : (first.userRatingCount != null && Number.isFinite(Number(first.userRatingCount)) ? Number(first.userRatingCount) : Number(first.reviews) || 0),
    priceLevel: first.price_level != null ? first.price_level : (first.priceLevel != null ? first.priceLevel : null),
    oh: first.oh || first.regularOpeningHours || null,
    utcOffset: first.utcOffset != null ? first.utcOffset : (first.utcOffsetMinutes != null ? first.utcOffsetMinutes : null),
    lat: first.lat != null ? first.lat : loc.latitude,
    lng: first.lng != null ? first.lng : loc.longitude,
  };
}

// Resolve ONE scouted spot's venue photo by name near the viewer, through the
// SAME cached /api/places/search the pool uses (which now returns photo_ref),
// then the guarded /api/photo proxy. Returns "" (not null) on any miss so the
// cache records "looked, found none" and never retries in a loop.
async function resolveScoutedPlace(spot, center) {
  const name = spot && spot.name;
  const city = spot && spot.city;
  const key = `${spot && spot.placeId || ""}|${name}|${city}`;
  if (_scoutedPhotoCache.has(key)) return _scoutedPhotoCache.get(key);
  if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return null;
  try {
    const q = encodeURIComponent(`${name} ${city}`);
    const r = await fetch(`/api/places/search?q=${q}&lat=${center.lat}&lng=${center.lng}&n=5`);
    const j = await r.json();
    const candidates = j && Array.isArray(j.places) ? j.places : [];
    const wantedId = String(spot && spot.placeId || "");
    const wantedName = normalizedName(name);
    // Never attach a creator or score to Google's first fuzzy result. Resolve
    // the declared Place ID when available, otherwise require the exact venue
    // name. A miss stays an honest score-pending card.
    const first = candidates.find((p) => wantedId && String(p.id || p.place_id || "") === wantedId)
      || candidates.find((p) => normalizedName(p.name || (p.displayName && p.displayName.text)) === wantedName)
      || null;
    if (!first) { _scoutedPhotoCache.set(key, null); return null; }
    // THE HYDRATED SHAPE. Everything here was LOOKED UP against the real Google
    // place, so a rating or a type on this row is measured, not invented — the
    // distinction the whole registry/pool split turns on. A spot that does not
    // resolve stays null and renders with no score and no facts.
    const out = creatorSearchPlace(first, name);
    _scoutedPhotoCache.set(key, out);
    return out;
  } catch (e) {
    return null;
  }
}

// Re-exported so existing importers keep working; the logic itself lives in
// lib/creatorFinds.js so a guard can EXECUTE it instead of grepping for it.
export { CREATOR_FINDS_MAX, CREATOR_FINDS_MIN, CREATOR_BRIDGE_MAX_MI, CREATOR_FINDS_RADIUS_MI, orderFinds, bridgeCity, scoutedSpots, mergeCreatorInventory };

export default function CreatorFinds({ items, byCity, center, excludePlaceIds, onVisibleIds, onOpenPlace, onBrowse, onLog, isSaved, liked, disliked, onSave, onLike, onDislike, onShare, onExperience, bare }) {
  // v7.07 — ONE INVENTORY. Registry spots used to be a FALLBACK: scoutedSpots()
  // returned [] unless the pool was completely empty, so a reader with three
  // pool finds saw three cards while the registry held twenty more within the
  // same 25 miles. The shelf was thin because of a branch, not because of
  // coverage — "the limiter is the place pool, not the library" (owner).
  // mergeCreatorInventory promotes the registry to first-class inventory: pool
  // rows first (measured distance, real score), then registry spots by city
  // nearness, deduped by name, capped at CREATOR_FINDS_MAX (20) inside
  // CREATOR_FINDS_RADIUS_MI (25). Pure, and executed by the guards.
  const inventory = mergeCreatorInventory({ pool: items, byCity, radiusMi: CREATOR_FINDS_RADIUS_MI, max: CREATOR_FINDS_MAX });
  const poolCount = inventory.filter((r) => r.kind === "pool").length;
  const registryRows = inventory.filter((r) => r.kind === "registry");
  const bridge = bridgeCity(byCity, poolCount);

  // HYDRATION (owner-approved, 2026-08-09). A registry spot is only
  // { key, name, city, video } — no types, no rating, no coordinates. Resolving
  // it by name+city through the same cached /api/places/search the photo lookup
  // already used turns it into a real place: real types (which is what
  // lib/dining.js needs to name a cuisine), real rating, real photo. That is a
  // LOOKUP of Google's own data, not an invention — the honesty rule bans
  // fabricating a number, not discovering one.
  //
  // A spot that does not resolve stays null and renders with NO score and NO
  // facts, exactly as before. That is the case the "omit, never invent" rule is
  // actually about.
  const [hydrated, setHydrated] = useState({});
  useEffect(() => {
    let alive = true;
    const need = registryRows.filter((r) => r.spot && r.spot.name && !(r.key in hydrated));
    if (!need.length) return;
    Promise.all(need.map(async (r) => [r.key, await resolveScoutedPlace(r.spot, center)]))
      .then((pairs) => {
        if (!alive) return;
        setHydrated((prev) => { const next = { ...prev }; for (const [k, v] of pairs) next[k] = v; return next; });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryRows.map((r) => r.key).join(","), center && center.lat, center && center.lng]);

  const excluded = new Set((excludePlaceIds || []).map(String));
  const creatorEntryId = (entry) => {
    if (!entry) return "";
    if (entry.kind === "pool") return String(entry.row && entry.row.p && entry.row.p.id || "");
    const h = hydrated[entry.key];
    return String(h && h.id || ("creator:" + entry.key));
  };
  const scoreForEntry = (entry) => {
    if (entry.kind === "pool") {
      const p = entry.row && entry.row.p;
      if (!p) return -Infinity;
      if (Number.isFinite(p.governed_score)) return p.governed_score;
      const base = p.wfScore != null ? p.wfScore : wayfindScore(p.rating, p.reviews);
      const governed = governedWayfindScore(base, { hasCreatorVideo: true, distanceMi: p.distMi, trending: !!p.trending });
      // Stamp the exact sort key onto the rendered place so the badge and rank
      // cannot disagree on the creator shelf.
      if (governed != null) p.governed_score = governed;
      return governed ?? -Infinity;
    }
    const h = hydrated[entry.key];
    return h && h.rating
      ? governedWayfindScore(wayfindScore(h.rating, h.reviews), { hasCreatorVideo: true }) ?? -Infinity
      : -Infinity;
  };
  const visibleInventory = inventory.filter((entry) => {
    const id = creatorEntryId(entry);
    return id && !excluded.has(id);
  }).sort((a, b) => {
    const d = scoreForEntry(b) - scoreForEntry(a);
    if (Number.isFinite(d) && d) return d;
    const ar = a.kind === "pool" ? Number(a.row && a.row.p && a.row.p.reviews) || 0 : Number(hydrated[a.key] && hydrated[a.key].reviews) || 0;
    const br = b.kind === "pool" ? Number(b.row && b.row.p && b.row.p.reviews) || 0 : Number(hydrated[b.key] && hydrated[b.key].reviews) || 0;
    return br - ar;
  });
  const visibleIdKey = visibleInventory.map(creatorEntryId).join("|");
  useEffect(() => {
    if (onVisibleIds) onVisibleIds(visibleIdKey ? visibleIdKey.split("|") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdKey]);

  // Nothing local, no registry spots, AND nowhere to point them. Render NOTHING
  // rather than an empty shelf — an empty "your differentiator" row advertises
  // the absence.
  if (!visibleInventory.length && !bridge) return null;
  // "Local" is a claim. With no local find at all, the heading names the place
  // the finds are actually in, rather than calling another city's spots yours.
  const heading = poolCount || registryRows.length ? "Finds from local creators" : `Creators in ${bridge.city}`;
  return (
    <section aria-label="Finds from local creators" style={{ marginBottom: bare ? 0 : 12 }}>
      {/* v7.05, kept through the v7.07 merge: inside the menu (`bare`) the
          accordion row above already reads "Finds from local creators", so
          repeating it here would be a second heading for one row. The heading
          still renders in that mode when it is NOT that sentence — a bridged
          row is showing another city's creators, and letting the accordion's
          label stand alone would call them local, which they are not. */}
      {bare && heading === "Finds from local creators"
        ? null
        : <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 8 }}>{heading}</div>}
      {/* v7.02 (owner, 2026-08-08): "in reality the finds from local creators
          should also match that style" — the 132x96 tile is gone and these are
          the /best-of place card at rail width, rendered through the SAME
          RailCard every other rail uses. What each card is allowed to say is
          unchanged: the place's OWN photo (never the creator's video
          thumbnail — CREATOR_VIDEO_SPEC.md's never-re-host rule), the real
          handle, the real platform, and the real Wayfind Score. The rank is
          governed score ordering, so every rank number agrees with the score. */}
      <RailNav railId="creator-finds" count={visibleInventory.length + (bridge && !registryRows.length ? 1 : 0)} unit="creator finds" />
      <div className="wf-rail" data-rail="creator-finds" tabIndex={0} role="region" aria-label="Finds from local creators">
        {visibleInventory.map((entry, i) => {
          // POOL ROW — a place Google already loaded near the reader. It has a
          // measured distance and a governed score, so the card carries a rank
          // and a score badge that both mean something.
          if (entry.kind === "pool") {
            const { p, videos } = entry.row;
            const v = (videos || [])[0];
            const plat = v && PLATFORM[v.platform];
            const open = () => { try { onLog && onLog("creator_find_open", { id: p.id, name: p.name }, { pos: i, creator: (v && v.creator) || null }); } catch (e) {} if (onOpenPlace) onOpenPlace(p); };
            return (
              <RailCard
                key={p.id}
                photo={p.photo || null}
                title={p.name}
                eyebrow={coarseCat(p) || p.primaryType || "Local find"}
                rank={i + 1}
                score={cardScore(p)}
                facts={cardFacts(p)}
                award={v && v.creator ? { tone: "creator", icon: "🎬", label: "@" + v.creator + (plat ? " on " + plat.label : "") } : null}
                chips={creatorChips(p, onExperience)}
                ariaLabel={"Open " + p.name}
                onOpen={open}
                saved={isSaved ? !!isSaved(p.id) : false}
                liked={liked ? !!liked[p.id] : false}
                disliked={disliked ? !!disliked[p.id] : false}
                onSave={(e) => { if (onSave) onSave(e, p); }}
                onLike={(e) => { if (onLike) onLike(e, p); }}
                onDislike={(e) => { if (onDislike) onDislike(e, p); }}
                onShare={() => { if (onShare) onShare(p); }}
              />
            );
          }
          // REGISTRY ROW — a scouted spot the pool did not contain.
          //
          // `h` is the hydrated Google place, or null if it did not resolve.
          // WHAT THE CARD MAY SAY IS DECIDED BY `h`, AND ONLY BY `h`:
          //   resolved   -> a real photo, a real score computed from the real
          //                 rating/review count, and real facts. Looked up, not
          //                 invented.
          //   unresolved -> NO score, NO facts beyond the city name. The card
          //                 omits what we do not have rather than filling it.
          // Neither branch ever prints a distance: a registry spot's position is
          // a CITY CENTROID, which lib/creatorVideos.js promises is used only for
          // sorting and is "never shown to a user".
          const s0 = entry.spot;
          const h = hydrated[entry.key] || null;
          const v = s0 && s0.video;
          const plat = v && PLATFORM[v.platform];
          const openRegistry = () => { try { onLog && onLog("creator_find_open", { id: h && h.id ? h.id : entry.key, name: s0.name }, { pos: i, creator: (v && v.creator) || null, hydrated: h ? "resolved" : "registry" }); } catch (e) {} if (h && h.id && onOpenPlace) onOpenPlace({ ...h, primaryType: (h.types || [])[0] || null }); else if (onBrowse) onBrowse(); };
          return (
            <RailCard
              key={entry.key || i}
              photo={(h && h.photo) || null}
              title={s0.name}
              eyebrow={s0.city ? "Scouted in " + s0.city : "Scouted"}
              score={h && h.rating ? toDisplayScore(governedWayfindScore(wayfindScore(h.rating, h.reviews), { hasCreatorVideo: true })) : null}
              facts={h ? cardFacts({ reviews: h.reviews, priceLevel: h.priceLevel, oh: h.oh, utcOffset: h.utcOffset }) : [s0.city || null].filter(Boolean)}
              award={v && v.creator ? { tone: "creator", icon: "🎬", label: "@" + v.creator + (plat ? " on " + plat.label : "") } : null}
              chips={[{ key: "video", icon: "🎬", label: "Creator video", onClick: () => { if (onBrowse) onBrowse(); } }]}
              ariaLabel={"Open " + s0.name}
              onOpen={openRegistry}
              onShare={() => { if (onBrowse) onBrowse(); }}
            />
          );
        })}
        {bridge && !registryRows.length ? (
          <button className="wf-rail-bridge" onClick={() => { try { onLog && onLog("creator_find_bridge_open", null, { city: bridge.city, spots: bridge.count, local: poolCount }); } catch (e) {} if (onBrowse) onBrowse(); }}>
            <span aria-hidden="true" className="wf-rail-bridge-glyph">→</span>
            <span className="wf-rail-bridge-title">More finds in {bridge.city}</span>
            <span className="wf-rail-bridge-sub">{bridge.count} spots scouted</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
