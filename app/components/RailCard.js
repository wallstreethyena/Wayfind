// app/components/RailCard.js — the one card the homepage rails share (v6.67).
//
// WHY THIS EXISTS. The homepage grew three horizontal rails that each invented
// their own card: CompactEventShareCard (156px wide, 108px photo band), the
// CreatorFinds tile (132x96), and the full-width ranked row in BestNearby (a
// 46px thumbnail beside text). Three shapes, three type treatments, three photo
// sizes, stacked one above the other down a single screen. That is most of why
// the page reads as assembled rather than designed.
//
// THE OWNER'S BRIEF (2026-08-08, with screenshots) was precise about the fix:
// take the INFORMATION from the /best-of ranked card — rank medallion, Wayfind
// score, price, review count, a Book action — and put it in the SHAPE of the
// event card — photo on top, text below, compact. The shape is not a downgrade,
// it is the constraint: a full-width row cannot scroll sideways, and every rail
// on this page scrolls sideways. So the vertical card is the only geometry that
// serves all three, and the richer content is what raises it.
//
// GEOMETRY. 156px wide with a 108px photo band, adopted from
// CompactEventShareCard rather than the 132x96 creator tile, because
// scripts/test-event-rail-images.mjs pins those numbers ("height: 108,
// borderRadius: 12") along with photo-above-name ordering, the 2-line title
// clamp at minHeight 31, and a list of layouts that may never return (the
// 94%-opaque scrim, the desaturation filter, the info-panel-inside-photo). Any
// component that replaces that card inherits those assertions. Matching the
// larger of the two sizes also means the creator row grows toward the events
// row rather than the events row shrinking — photography is the asset here.
//
// WHAT IS DELIBERATELY OPTIONAL. Every enrichment below is null-guarded, because
// the three rails carry genuinely different data: an event has a date and no
// score, a tour has a price and a duration, a place has a score and a distance.
// The card renders what it is given and reserves no space for what it is not, so
// one component can serve all three without any rail rendering an empty slot.
import { C, RADII, WayfindScoreBadge } from "./kit";

// The rank medallion. Gold for 1, then a descending champagne wash. Kept small
// (22px) because at 156px wide the photo is the hero and the rank is an accent —
// the /best-of card can afford a 34px medal, a rail card cannot.
//
// NOTE: this is NOT the PICK medallion from home.js / ThingsToDoList.js. That one
// is a champagne seal with a 6.5px engraved wordmark, locked by
// scripts/check-pick-medallion.mjs against exactly this kind of well-meaning
// duplication. Do not merge the two.
function RankDot({ rank }) {
  if (!rank || rank > 5) return null;
  const gold = rank === 1;
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute", top: 7, left: 7, zIndex: 2,
        width: 22, height: 22, borderRadius: "50%",
        display: "grid", placeItems: "center",
        background: gold ? "#E8C97A" : "rgba(8,11,17,.82)",
        color: gold ? "#0D1117" : "#E8C97A",
        border: gold ? "none" : "1px solid rgba(232,201,122,.5)",
        fontSize: 11, fontWeight: 800, lineHeight: 1,
        boxShadow: "0 4px 12px rgba(0,0,0,.45)",
      }}
    >{rank}</span>
  );
}

/**
 * @param {object}   p
 * @param {string}   p.photo      image URL; a flat card colour shows through when absent
 * @param {string}   p.title      place / event / tour name (clamped to 2 lines)
 * @param {number}   p.rank       1-5, renders the medallion; omit for unranked rails
 * @param {number}   p.score      Wayfind score 0-10; omit for events (they have no score)
 * @param {string}   p.meta       the line under the title — "TONIGHT · 6:30 PM", "2,724 reviews"
 * @param {string}   p.metaColor  accent for that line; events use warm for tonight, blue for later
 * @param {number}   p.priceFrom  renders "from $59" in green
 * @param {string}   p.duration   "2h"
 * @param {string}   p.cta        "Book ↗" — omit and the card is a plain tap target
 * @param {string}   p.badge      small overlay label, e.g. the creator's platform
 * @param {func}     p.onClick
 */
export default function RailCard({ photo, title, rank, score, meta, metaColor, priceFrom, duration, cta, badge, onClick, href }) {
  const Tag = href ? "a" : "button";
  return (
    <Tag
      href={href || undefined}
      onClick={onClick}
      className="wf-rail-card"
      style={{
        position: "relative", width: 156, flexShrink: 0, scrollSnapAlign: "start",
        textAlign: "left", background: "transparent", border: "none", padding: 0,
        cursor: "pointer", textDecoration: "none", WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* The photo band. width/height ATTRIBUTES as well as CSS: every image on
          the homepage shipped without intrinsic dimensions, so each one popped
          the layout as it decoded. */}
      <span style={{ display: "block", position: "relative", width: 156, height: 108, borderRadius: 12, overflow: "hidden", background: C.card }}>
        <RankDot rank={rank} />
        {badge ? (
          <span style={{ position: "absolute", top: 7, right: 7, zIndex: 2, padding: "2px 6px", borderRadius: 6, background: "rgba(0,0,0,.62)", fontSize: 10, fontWeight: 800, color: "#E7EDF5" }}>{badge}</span>
        ) : null}
        {photo ? (
          <img
            src={photo} alt="" loading="lazy" decoding="async" width={156} height={108}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "saturate(1.02) contrast(1.03) brightness(.86)" }}
          />
        ) : null}
        {/* The score sits ON the photo, bottom-left, rather than in the text
            block. It is the one number that differentiates Wayfind from a
            listings site, and below the fold of a 108px band it would compete
            with the title. size:.8 keeps the badge's own proportions. */}
        {score != null ? (
          <span style={{ position: "absolute", left: 6, bottom: 6, zIndex: 2, filter: "drop-shadow(0 4px 10px rgba(0,0,0,.55))" }}>
            <WayfindScoreBadge score={score} size={0.8} />
          </span>
        ) : null}
      </span>

      {/* Title BELOW the photo, never over it — test-event-rail-images asserts
          the ordering, and a title laid over photography is the single most
          common way a card stops looking premium. minHeight reserves both lines
          so a 1-line and a 2-line card do not stagger the rail's baseline. */}
      <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 31, marginTop: 8, fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: C.text }}>{title}</span>

      {meta ? (
        <span style={{ display: "block", marginTop: 3, fontSize: 11.5, fontWeight: 700, letterSpacing: ".2px", color: metaColor || C.muted }}>{meta}</span>
      ) : null}

      {priceFrom != null || duration ? (
        <span style={{ display: "block", marginTop: 3, fontSize: 11.5, color: C.muted }}>
          {priceFrom != null ? <b style={{ color: C.green, fontWeight: 700 }}>from ${priceFrom}</b> : null}
          {priceFrom != null && duration ? " · " : ""}
          {duration || ""}
        </span>
      ) : null}

      {cta ? (
        <span style={{ display: "inline-flex", marginTop: 7, background: C.accent, color: "#0D1117", borderRadius: RADII.chip, padding: "6px 12px", fontSize: 11.5, fontWeight: 800 }}>{cta}</span>
      ) : null}
    </Tag>
  );
}
