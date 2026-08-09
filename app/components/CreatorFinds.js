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
import { CREATOR_FINDS_MAX, CREATOR_FINDS_MIN, CREATOR_BRIDGE_MAX_MI, orderFinds, bridgeCity, scoutedSpots } from "../../lib/creatorFinds";
import { C, TYPE } from "./kit";
// v7.02: the row renders the canonical place card (see RailCard.js). The chip
// source is IconicPlaceCard's experienceTags — the portable, evidence-bound
// adaptation of home.js's experienceBadges that check-collection-look.mjs
// already pins — rather than a fourth copy of the same badge logic.
import RailCard, { RailNav } from "./RailCard";
import { experienceTags } from "./IconicPlaceCard";
import { coarseCat } from "../../lib/ranking";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
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

// Resolve ONE scouted spot's venue photo by name near the viewer, through the
// SAME cached /api/places/search the pool uses (which now returns photo_ref),
// then the guarded /api/photo proxy. Returns "" (not null) on any miss so the
// cache records "looked, found none" and never retries in a loop.
// v7.07 (owner, 2026-08-09: "when i change to orlando the wayfind score is not
// showing"). A scouted card is a registry row — a name, a city and a creator —
// and it carried no score because the registry has no rating to give it. But
// this function was ALREADY asking Google for the place in order to resolve a
// photo, and that same response carries the rating and the review count. The
// score was one field away the whole time.
//
// Nothing is invented: a place Google cannot match, or matches with no rating,
// still renders scoreless. That is why the pair is returned as null rather than
// as zeros — kit's badge draws "Score pending" for a null and a red 0.1/10 for
// a coerced one, and the second is a lie about a place nobody has rated.
async function resolveScoutedPlace(name, city, center) {
  const key = `${name}|${city}`;
  if (_scoutedPhotoCache.has(key)) return _scoutedPhotoCache.get(key);
  if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return { photo: "", rating: null, reviews: null };
  try {
    const q = encodeURIComponent(`${name} ${city}`);
    const r = await fetch(`/api/places/search?q=${q}&lat=${center.lat}&lng=${center.lng}&limit=1`);
    const j = await r.json();
    const first = j && Array.isArray(j.places) ? j.places[0] : null;
    const ref = first && (first.photo_ref || (Array.isArray(first.photos) && first.photos[0] && first.photos[0].name)) || null;
    const url = ref && REF_RX.test(ref) ? "/api/photo?ref=" + encodeURIComponent(ref) + "&w=280" : "";
    const rating = first && Number(first.rating) > 0 ? Number(first.rating) : null;
    const reviews = first ? Number(first.userRatingCount != null ? first.userRatingCount : first.reviews) || 0 : 0;
    const out = { photo: url, rating, reviews };
    _scoutedPhotoCache.set(key, out);
    return out;
  } catch (e) {
    return { photo: "", rating: null, reviews: null };
  }
}

// Re-exported so existing importers keep working; the logic itself lives in
// lib/creatorFinds.js so a guard can EXECUTE it instead of grepping for it.
export { CREATOR_FINDS_MAX, CREATOR_FINDS_MIN, CREATOR_BRIDGE_MAX_MI, orderFinds, bridgeCity, scoutedSpots };

export default function CreatorFinds({ items, byCity, center, onOpenPlace, onBrowse, onLog, isSaved, liked, disliked, onSave, onLike, onDislike, onShare, onExperience, bare }) {
  const rows = orderFinds(items).slice(0, CREATOR_FINDS_MAX);
  const bridge = bridgeCity(byCity, rows.length);
  // 2026-08-07 (owner: "I don't see creators on Sarasota"). When the loaded
  // Google pool surfaced NO creator-video place — so `rows` is empty — the row
  // used to show only a single "More finds in {city}" arrow, which reads as
  // absence. But the registry DOES hold that city's scouted spots
  // (spotsByCity → byCity); they were simply not in the pool Google loaded
  // nearby. Render them directly as cards (name + creator + platform) so the
  // differentiator is visible. Photos need a placeId backfill that is blocked
  // on the service key, so these cards are photoless for now — the same honest
  // shape the browse sheet already uses. Tapping opens the browse sheet.
  const scouted = scoutedSpots(byCity, bridge, rows.length, CREATOR_FINDS_MAX);

  // Real venue photos for the scouted cards (owner, 2026-08-07: pin placeholders
  // "not what I wanted"). These places were not in the loaded pool, so we resolve
  // each one's Google photo by name — once, cached — and render it in place of
  // the pin. The pin shows only while a photo is loading or genuinely absent.
  const [scoutedPhotos, setScoutedPhotos] = useState({});
  // Kept as a SECOND map rather than folded into scoutedPhotos so the photo
  // path stays byte-identical to what shipped — the score is additive.
  const [scoutedScores, setScoutedScores] = useState({});
  useEffect(() => {
    let alive = true;
    const need = scouted.filter((s) => s && s.name && !(s.key in scoutedPhotos));
    if (!need.length) return;
    Promise.all(need.map(async (s) => {
      const found = await resolveScoutedPlace(s.name, s.city, center);
      return [s.key, found];
    })).then((pairs) => {
      if (!alive) return;
      setScoutedPhotos((prev) => { const next = { ...prev }; for (const [k, u] of pairs) next[k] = (u && u.photo) || ""; return next; });
      setScoutedScores((prev) => { const next = { ...prev }; for (const [k, u] of pairs) next[k] = u && u.rating != null ? { rating: u.rating, reviews: u.reviews } : null; return next; });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scouted.map((s) => s && s.key).join(","), center && center.lat, center && center.lng]);
  // Nothing local, no registry spots, AND nowhere to point them. Render NOTHING
  // rather than an empty shelf — an empty "your differentiator" row advertises
  // the absence.
  if (!rows.length && !scouted.length && !bridge) return null;
  // "Local" is a claim. With no local find at all, the heading names the place
  // the finds are actually in, rather than calling another city's spots yours.
  const heading = rows.length ? "Finds from local creators" : `Creators in ${bridge.city}`;
  return (
    <section aria-label="Finds from local creators" style={{ marginBottom: bare ? 0 : 12 }}>
      {/* v7.05: inside the menu (`bare`) the accordion row above already reads
          "Finds from local creators", so repeating it here would be a second
          heading for one row. The heading still renders in that mode when it
          is NOT that sentence — a bridged row is showing another city's
          creators, and letting the accordion's label stand alone would call
          them local, which they are not. */}
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
          orderFinds()'s own ordering, which is a genuine ranking (nearest
          band, then the places the creator boost actually moved, then score),
          so a number on this card means something. */}
      <RailNav railId="creator-finds" count={rows.length + scouted.length + (bridge && !scouted.length ? 1 : 0)} unit="creator finds" />
      <div className="wf-rail" data-rail="creator-finds" tabIndex={0} role="region" aria-label="Finds from local creators">
        {rows.map(({ p, videos }, i) => {
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
        })}
        {/* Registry-hydrated cards when the pool surfaced nothing: the city's
            actual scouted spots, name + creator + platform. These rows come
            from the registry, not the ranked pool, so they carry NO score and
            NO review count — and the card simply omits both rather than
            inventing them. Tapping opens the browse sheet where the reel
            plays. */}
        {scouted.map((s, i) => {
          const v = s && s.video;
          const plat = v && PLATFORM[v.platform];
          return (
            <RailCard
              key={s.key || i}
              photo={scoutedPhotos[s.key] || null}
              title={s.name}
              eyebrow={s.city ? "Scouted in " + s.city : "Scouted"}
              score={cardScore(scoutedScores[s.key])}
              facts={[
                scoutedScores[s.key] && scoutedScores[s.key].reviews ? compactCount(scoutedScores[s.key].reviews) + " reviews" : null,
                s.city || null,
              ].filter(Boolean)}
              award={v && v.creator ? { tone: "creator", icon: "🎬", label: "@" + v.creator + (plat ? " on " + plat.label : "") } : null}
              chips={[{ key: "video", icon: "🎬", label: "Creator video", onClick: () => { if (onBrowse) onBrowse(); } }]}
              ariaLabel={"Open " + s.name}
              onOpen={() => { try { onLog && onLog("creator_find_open", { id: s.key, name: s.name }, { pos: i, creator: (v && v.creator) || null, hydrated: "registry" }); } catch (e) {} if (onBrowse) onBrowse(); }}
              onShare={() => { if (onBrowse) onBrowse(); }}
            />
          );
        })}
        {bridge && !scouted.length ? (
          <button className="wf-rail-bridge" onClick={() => { try { onLog && onLog("creator_find_bridge_open", null, { city: bridge.city, spots: bridge.count, local: rows.length }); } catch (e) {} if (onBrowse) onBrowse(); }}>
            <span aria-hidden="true" className="wf-rail-bridge-glyph">→</span>
            <span className="wf-rail-bridge-title">More finds in {bridge.city}</span>
            <span className="wf-rail-bridge-sub">{bridge.count} spots scouted</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
