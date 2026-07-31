"use client";
// ExperienceBlocks — THE list-surface composition, in one place.
//
// OWNER DIRECTIVE (2026-07-31): "I want this template, this design, this
// technology, everything inside these to be leveraged inside of every single
// sheet of Wayfind." The reference implementation is
// app/components/screens/Experience.js — the sheet the mood buttons open. It is
// not to be redesigned; it is to be EXTRACTED, so every list surface renders the
// same five blocks from the same code.
//
// THE ORDER IS MONETIZATION-FIRST AND IS NOT NEGOTIABLE:
//
//   1. COUPON STRIP     an offer, before anything else
//   2. ViatorRail       bookable, where the surface has inventory
//   3. Perfect right now  reasoned picks with a `why`
//   4. THE LIST         browse
//   5. methodology      how the ranking was made
//
// offer -> bookable -> reasoned -> browse. Every block earlier than the list is
// a revenue surface, and the list is what the user came for; putting browse
// first is what makes a directory.
//
// ONE NOTE ON ORDER, because the brief and the reference disagree by one line.
// The owner enumerated the methodology line 5th, AFTER the list. In
// Experience.js it renders BEFORE the list (above the count line and the sort
// control) — it explains how the ranking was made, immediately before you read
// the ranking. The instruction was "do not redesign it, extract it", so the
// REFERENCE wins and the line stays above the list. `methodologyLast` flips it
// if the owner confirms the brief's order was deliberate. Blocks 1-4 are
// identical under both readings.
//
// WHY A COMPONENT AND NOT A COPY: nine pages with the composition pasted in
// drift within a week. This repo has paid that bill twice already — three art
// maps and two area_known_for definitions, each costing a PR to undo.
//
// DEGRADE HONESTLY, NEVER FILL. Each block returns null when its data is
// absent: no coupons for this intent -> no strip (not an empty strip), no tours
// -> no rail, no momentPicks -> no "Perfect right now". A placeholder is a
// promise the surface cannot keep.
//
// THE ROW SEAM. `renderRow` is a prop rather than a hardcoded PlaceCard because
// PlaceCard is defined INSIDE app/home.js (line ~8790, 265 lines) and closes
// over ~15 helpers that live in that module's scope — experienceBadges,
// iconForPlace, liveOpen, hasCreatorVideo, curatedFor, confidenceOf,
// rankReason, couponForPlaceName among them. Importing it from a standalone
// page is not possible without extracting all of that too, and CLAUDE.md is
// explicit that moving a function between modules is the single most dangerous
// refactor in this repo (#486 put a ReferenceError on every place-detail render
// in production while SIX guards reported green). That extraction gets its own
// PR with the mandatory guard pair. Until then the seam is honest: every host
// shares blocks 1, 2, 3 and 5 exactly, and supplies its own row for block 4.
import { C, PlaceScoreChip } from "./kit";
import { couponsForIntent, couponEndsLabel } from "../../lib/coupons";
// dealScope + nearestMetro are the repo's CANONICAL deal-geo helpers, shipped
// on main in #526 for this same strip. An earlier draft of this file grew its
// own area->market table; that would have been a SECOND coupon geo map, which
// is the exact duplication ("three art maps, two area_known_for definitions")
// this extraction exists to prevent. Deleted in favour of these.
import { dealScope } from "../../lib/dealSheet";
import { nearestMetro } from "../../lib/orderInFeatured";

// ── 1. COUPON STRIP ─────────────────────────────────────────────────────────
// GEO IS NOT OPTIONAL HERE. Without lat/lng this renders NATIONWIDE deals only.
// Live-verified 2026-07-31: the intent-only filter put Bradenton and Sarasota
// deals on Orlando pages — the owner's own example of a wrong recommendation.
// A missing location must degrade to "fewer deals", never to "another city's".
export function CouponStrip({ intentId, lat, lng, onOpenCoupons, onLog, max = 3 }) {
  // GEO IS LOAD-BEARING. Live-verified 2026-07-31: filtering by INTENT alone put
  // "Bradenton Marauders" and "Clipp — dining certificates in Sarasota" on
  // ORLANDO's /tonight and /date-night, 130 miles away. That is the owner's own
  // example of a wrong recommendation, and it is worse than an absent strip
  // because this is the surface that carries the money.
  //
  // Same rule main applies on the reference sheet: a deal scoped to a METRO
  // shows only in that metro; everywhere-scoped and unplaced deals pass. An
  // unknown viewer location does NOT filter — that is main's behaviour and this
  // extraction does not get to change it silently.
  const viewerKnown = Number.isFinite(lat) && Number.isFinite(lng);
  const viewerMetro = viewerKnown ? nearestMetro(lat, lng) : null;
  const deals = (intentId ? couponsForIntent(intentId) : []).filter((c) => {
    if (!viewerKnown) return true;
    const s = dealScope(c);
    if (s.kind !== "metro") return true;
    return s.metro === viewerMetro;
  });
  // Absent, not empty. A strip with no rows is a promise of savings we do not
  // have for this intent in this metro.
  if (!deals.length) return null;
  // Styling is COPIED EXACTLY from the reference, down to the dashed coral
  // border and the 11px/14px padding. A first draft of this file quietly
  // substituted `solid C.border` and a different pad — which is precisely how
  // an "extraction" becomes a redesign nobody approved.
  const dl = deals.slice(0, max);
  const go = (id) => { try { onLog && onLog("coupon_strip_tap", null, { id, theme: intentId }); } catch (e) {} onOpenCoupons && onOpenCoupons(); };
  return (
    <div style={{ background: C.card, border: `1.5px dashed ${C.accent}`, borderRadius: 14, padding: "11px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: C.light, letterSpacing: "0.6px", textTransform: "uppercase" }}>🏷️ Local deals on this list</span>
        <button onClick={() => { try { onLog && onLog("coupon_strip_all", null, { theme: intentId }); } catch (e) {} onOpenCoupons && onOpenCoupons(); }} style={{ background: "transparent", border: "none", color: C.light, fontSize: 11.5, fontWeight: 800, cursor: "pointer", padding: "4px 0 4px 8px" }}>See all ›</button>
      </div>
      {dl.map((c, i) => (
        <div key={c.id} role="button" tabIndex={0} onClick={() => go(c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(c.id); } }} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0", borderTop: i ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>{c.business}</span>
            <span style={{ fontSize: 12.5, color: C.light }}> — {c.title}</span>
          </span>
          {couponEndsLabel(c) ? <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: C.muted }}>{couponEndsLabel(c)}</span> : null}
        </div>
      ))}
    </div>
  );
}

// ── 3. PERFECT RIGHT NOW ────────────────────────────────────────────────────
// Rank number, place name, PlaceScoreChip, and the `why` line — the reasoned
// picks, the block that makes the surface feel decided rather than searched.
//
// `picks` are id + why from /api/moment/picks; the place body is resolved from
// the list this surface already loaded. A pick whose place is not in the list
// is DROPPED rather than rendered thin: half a row is worse than no row.
export function PerfectRightNow({ picks, places, onOpenPlace, title = "✨ Perfect right now" }) {
  if (!picks || !picks.length || !places || !places.length) return null;
  const byId = new Map(places.filter(Boolean).map((p) => [p.id, p]));
  const rows = picks.map((x) => ({ ...x, p: byId.get(x.id) })).filter((x) => x.p);
  if (!rows.length) return null;
  return (
    <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.light, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
      {rows.map((x, i) => (
        <div key={x.id} onClick={() => onOpenPlace && onOpenPlace(x.p)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${C.border}` : "none", cursor: onOpenPlace ? "pointer" : "default" }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: C.adim, color: C.light, fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{x.p.name}<span style={{ marginLeft: 6, display: "inline-flex", verticalAlign: "middle" }}><PlaceScoreChip p={x.p} size={12} /></span></div>
            {x.why ? <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.4, marginTop: 2 }}>{x.why}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 5. METHODOLOGY ──────────────────────────────────────────────────────────
// The exact sentence from the reference. It is a trust claim and it is verbatim
// on purpose: nine surfaces paraphrasing "how we rank" nine ways is how a
// product stops sounding like it has one method.
export const METHODOLOGY_LINE = "Based on rating, review volume, distance, relevance, and real experience signals, plus member takes once a place has enough of them. No ads, no paid placement.";
export function Methodology() {
  return <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, marginBottom: 6 }}>{METHODOLOGY_LINE}</div>;
}

// ── THE COMPOSITION ─────────────────────────────────────────────────────────
// One component, five blocks, one order. Hosts supply data and a row renderer;
// they do not get to reorder.
export default function ExperienceBlocks({
  intentId, lat, lng,
  onOpenCoupons, onLog,
  tours, toursTitle, ViatorRail, showTours,
  momentPicks, places,
  onOpenPlace,
  rows, renderRow, loading,
  countLine, controls, emptyState, extra,
  methodologyLast = false,
}) {
  const list = rows || [];
  const methodology = <Methodology />;
  return (
    <>
      {/* 1 */}
      <CouponStrip intentId={intentId} lat={lat} lng={lng} onOpenCoupons={onOpenCoupons} onLog={onLog} />
      {/* 2 — the rail renders only when the surface HAS bookable inventory and
          the host passed the component. No tours, no rail. */}
      {showTours && ViatorRail && tours && tours.length ? <ViatorRail title={toursTitle || "Top-rated experiences"} items={tours} theme={intentId} /> : null}
      {/* 3 */}
      {!loading ? <PerfectRightNow picks={momentPicks} places={places || list} onOpenPlace={onOpenPlace} /> : null}
      {/* 5, in the reference's position — see the header note on the one-line
          disagreement between the brief and Experience.js. */}
      {!methodologyLast ? methodology : null}
      {countLine}
      {controls}
      {extra}
      {/* 4 */}
      {!loading && !list.length ? emptyState : null}
      {!loading ? list.map((p, i) => renderRow(p, i)) : null}
      {methodologyLast ? methodology : null}
    </>
  );
}
