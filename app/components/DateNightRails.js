"use client";

// app/components/DateNightRails.js — THE DATE NIGHT INTENT RAILS, ONE DEFINITION.
//
// v8.92 (owner, 2026-08-30, on the live homepage): "the date night card should
// just open, but now it's opening on a different page. I don't know why it did
// that. I want it to go back and do the same as before … when the user clicks
// on it, it should look exactly like the Exploding Trends and have individual
// rails."
//
// WHAT HAPPENED, and why this is an EXTRACTION rather than a revert.
//
// #1033 built a genuinely good thing: Date Night stopped being a category list
// and became a qualified INTENT — Dinner, Dessert, Speakeasies, Live Music,
// Clubs, Things To Do Together, and Beach XOR Museums, all inside
// DATE_NIGHT_WIDEN_MI, with empty rails hidden, beach failing closed to museums
// when the weather is unknown, dinner refusing counter service (the Shake
// Station bug) and Together refusing kayak tours. That engine is exactly what
// the owner is describing to me now, and it fixed two live complaints of his:
// the "nothing nearby has the room" empty bar and Shake Station ranked #1.
//
// What #1033 got wrong is WHERE it rendered. It wrapped those rails in
// RankedExperiencePage — a full page — and then made the homepage tile a native
// link with `onClick={undefined}` so the in-rail drop could not bind. The tap
// stopped behaving like every other tile on the rail.
//
// Reverting would throw away the engine to fix the destination. So the rails
// move OUT of the page shell into this component, and both surfaces render it:
//
//   the DROP  DaypartRail mounts <DateNightRails> where it mounts
//             <ExplodingNearby> for trending — the precedent the owner named
//             himself, and the one surface in this product that already proves
//             a rich multi-rail answer can live inside a drop.
//   the PAGE  DateNightIntentPage keeps its shell, its share button and its
//             hero, and renders this in the middle.
//
// ONE definition, because two copies of "what is a date night" is how that
// claim came to have three different rules in v8.82. scripts/check-date-night-
// intent-one-surface.mjs fails the build on a second copy.
//
// THE HREF SURVIVES. The tile is still <a href="/date-night?…">, so cmd-click,
// middle-click, a crawler and a shared card all still reach a real page. Only
// the plain left-click changed back to opening the drop — which is what a link
// with an onClick that calls preventDefault has always done on this rail.
import { useEffect, useMemo, useRef, useState } from "react";
import RailCard, { RailNav, RailDots } from "./RailCard";
import { directionsUrl } from "./kit";
import { toHookLine } from "../../lib/editorialHook";
import { toDisplayScore } from "../../lib/score.js";
import { wayfindScore } from "../../lib/wayfindScore.js";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { topPickAward } from "../../lib/topPickAward.js";
import { coarseCat } from "../../lib/ranking.js";
import { priceLabel } from "../../lib/price.js";
import { cardImageSrc } from "../../lib/placePhoto.js";
import { RAIL_PAGE_SIZE } from "../../lib/railPage.js";
import { usePagedRail } from "./usePagedRail.js";

const C = { text: "#F1F5F9", muted: "#8b93a1" };

const compact = (n) => (Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0));
const prettyType = (t) => {
  const s = String(t || "").replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
};

// WO11 (2026-09-02) — one rail, paged. Seeded from the bulk /api/date-night
// fetch <DateNightRails> below already makes (no extra round trip for page
// 0); scrolling past the 8th card fetches page 1 of THIS rail over the same
// contract lib/railPage.js defines for every other poster/rail endpoint. This
// replaces the old "Load every ranked option" button.
function DateNightRailSection({ rail, lat, lng, city, hour, isFirstNightOut, onOpenPlace, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
  const seedItems = useMemo(() => (rail.places || []).slice(0, RAIL_PAGE_SIZE), [rail]);
  const seedTotal = Number.isFinite(rail.total) ? rail.total : (rail.places || []).length;
  const params = useMemo(() => ({ lat, lng, city, hour: hour == null ? "" : hour, rail: rail.id }), [lat, lng, city, hour, rail.id]);
  const { items, total, sentinelIndex, sentinelRef, loadingMore } = usePagedRail(
    "/api/date-night", params, { seedItems, seedTotal, itemsKey: "places" },
  );
  const count = Number.isFinite(total) ? total : items.length;
  const railId = "datenight-" + rail.id;
  return (
    <section aria-label={rail.title} style={{ marginTop: 22 }}>
      {isFirstNightOut ? (
        <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>Night Out</p>
      ) : null}
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: C.text }}>{rail.title}</h2>
      {rail.deck ? (
        <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.45, color: "#AEB8C6" }}>{rail.deck}</p>
      ) : null}
      <RailNav railId={railId} count={count} total={count}
        unit={count === 1 ? "place for " + rail.title.toLowerCase() : "places for " + rail.title.toLowerCase()} />
      <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
        {items.map((p, i) => {
          const rank = i + 1;
          const type = prettyType(p.primaryType || p.primary_type || p.category);
          const facts = [
            p.reviews ? compact(p.reviews) + " reviews" : null,
            priceLabel(p.priceLevel != null ? p.priceLevel : p.priceNum) || null,
            Number.isFinite(p.distMi) ? p.distMi + " mi" : null,
          ].filter(Boolean);
          const chips = [type ? { key: "type", icon: "📍", label: type, title: type } : null].filter(Boolean);
          const href = directionsUrl(p);
          return (
            <RailCard
              key={p.id}
              className="wf-exploding-primary"
              domRef={i === sentinelIndex ? sentinelRef : undefined}
              photo={cardImageSrc(p, 640) || null}
              place={p}
              title={p.name}
              eyebrow={type}
              rank={rank}
              score={toDisplayScore(wayfindScore(p.rating, p.reviews))}
              facts={facts}
              award={topPickAward({ category: coarseCat(p) || type || "date night", rank })}
              chips={chips}
              take={toHookLine(p.editorial, p.name) || null}
              cta={href ? { label: "Directions ↗", href, external: true } : null}
              ariaLabel={"Open " + p.name}
              onOpen={onOpenPlace ? () => onOpenPlace(p) : undefined}
              saved={isSaved ? !!isSaved(p.id) : undefined}
              liked={isLiked ? !!isLiked(p.id) : liked ? !!liked[p.id] : undefined}
              disliked={isDisliked ? !!isDisliked(p.id) : disliked ? !!disliked[p.id] : undefined}
              onSave={onSave ? (e) => onSave(e, p) : undefined}
              onLike={onLike ? (e) => onLike(e, p) : undefined}
              onDislike={onDislike ? (e) => onDislike(e, p) : undefined}
              onShare={onShare ? () => onShare(p, { city }) : undefined}
            />
          );
        })}
        {loadingMore ? <div className="wf-rail-card wf-exploding-primary" aria-busy="true" aria-label={`Loading more ${rail.title}`}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 88, color: C.muted, fontSize: 12.5 }}>Loading more…</div> : null}
      </div>
      {items.length > 1 ? <RailDots railId={railId} count={items.length} /> : null}
    </section>
  );
}

/**
 * Fetch and render the Date Night intent rails.
 *
 * @param {boolean} active   mount-gate. The drop passes `selRail.id ===
 *                           "datenight"`, so nothing is fetched until the tile
 *                           is actually opened — the same contract
 *                           ExplodingNearby has, and the reason a closed drop
 *                           costs nothing.
 * @param {{lat:number,lng:number}} center
 * @param {string} city
 * @param {number} hour      optional float hour, for a caller that already
 *                           resolved the venue-local clock (lib/nowContext).
 * @param {Function} onOpenPlace  open the detail sheet in place. Absent on the
 *                           page, where a card's own /p/ href is the answer.
 * Card state/handlers are passed straight through, in whichever shape the
 * parent supplies — the v8.29.2 lesson from the trending drop, where a block
 * that forwarded only isSaved/onSave shipped four live-looking dead thumbs.
 */
export default function DateNightRails({
  active = true,
  center = null,
  city = "",
  hour = null,
  onOpenPlace = null,
  onTrack = null,
  isSaved = undefined,
  isOnTrip = undefined,
  liked = undefined,
  disliked = undefined,
  isLiked = undefined,
  isDisliked = undefined,
  onSave = undefined,
  onItinerary = undefined,
  onLike = undefined,
  onDislike = undefined,
  onShare = undefined,
}) {
  const [payload, setPayload] = useState(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef("");

  const lat = center && Number.isFinite(center.lat) ? center.lat : null;
  const lng = center && Number.isFinite(center.lng) ? center.lng : null;

  // The request key is the request. Re-fetching on every render of a parent
  // that re-renders on scroll is the defect the rail drop has paid for twice
  // (v8.27 beach conditions, v8.79 the memo key), so the effect is keyed on
  // what actually changes the answer and nothing else. The bulk request
  // still runs exactly once per (lat,lng,city,hour) — it hydrates every
  // rail's page-0 SEED (DateNightRailSection above); paging beyond that goes
  // through the shared per-rail contract instead of a second "load
  // everything" request.
  const key = useMemo(
    () => (active && lat != null && lng != null
      ? [lat.toFixed(3), lng.toFixed(3), city || "", hour == null ? "" : String(hour)].join("|")
      : ""),
    [active, lat, lng, city, hour],
  );

  useEffect(() => {
    if (!key || asked.current === key) return;
    asked.current = key;
    let dead = false;
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (city) q.set("city", city);
    if (hour != null && Number.isFinite(hour)) q.set("hour", String(hour));
    (async () => {
      try {
        const j = await fetchJsonWithDeadline("/api/date-night?" + q.toString());
        if (dead) return;
        if (!j || !Array.isArray(j.rails)) { setFailed(true); return; }
        setPayload(j);
        if (onTrack) {
          try {
            onTrack("date_night_intent_open", {
              city, rails: j.rails.map((x) => x.id).join(","),
              hidden: (j.hidden || []).join(","), beach_ok: !!j.beachOk,
            });
          } catch (e) {}
        }
      } catch (e) {
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!active) return null;

  const rails = (payload && payload.rails) || [];
  // The first nightlife rail carries the "Night Out" divider — the journey has
  // two halves (the meal, then the night), and the divider is what says so.
  const firstNightOutId = (rails.find((r) => r.group === "nightlife") || {}).id;

  if (payload == null && !failed) {
    return (
      <div style={{ marginTop: 4 }} role="status" aria-busy="true" aria-label="Building tonight's date">
        {[0, 1, 2].map((i) => (
          <div key={i} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />
        ))}
      </div>
    );
  }
  if (failed) {
    return (
      <p style={{ marginTop: 4, fontSize: 13, color: C.muted }}>
        We could not build tonight&apos;s date from owned inventory. That is a miss on our side, not an empty town.
      </p>
    );
  }
  if (!rails.length) {
    return (
      <p style={{ marginTop: 4, fontSize: 13, color: C.muted }}>
        Nothing near you clears the bar for a date-night journey right now — that honesty is the product.
      </p>
    );
  }

  // v8.93 (owner, 2026-08-30): the rail is <RailNav> + `.wf-rail` +
  // <RailCard> + <RailDots> — the exact structure ExplodingNearby's
  // TrendBlock builds — and each one now pages independently through
  // DateNightRailSection above (WO11), seeded from this same bulk fetch so
  // first paint is unchanged.
  return (
    <>
      {rails.map((rail) => (
        <DateNightRailSection key={rail.id} rail={rail} lat={lat} lng={lng} city={city} hour={hour}
          isFirstNightOut={rail.id === firstNightOutId} onOpenPlace={onOpenPlace}
          isSaved={isSaved} liked={liked} disliked={disliked} isLiked={isLiked} isDisliked={isDisliked}
          onSave={onSave} onLike={onLike} onDislike={onDislike} onShare={onShare} />
      ))}
    </>
  );
}
