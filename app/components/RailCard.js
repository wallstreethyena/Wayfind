"use client";
// app/components/RailCard.js — the ONE card every homepage rail renders.
//
// WHY THIS EXISTS. The homepage grew three horizontal rails that each invented
// their own card: CompactEventShareCard (156px wide, 108px photo band), the
// CreatorFinds tile (132x96), and the full-width ranked row in BestNearby. Three
// shapes, three type treatments, three photo sizes, stacked one above the other
// down a single screen. That is most of why the page reads as assembled rather
// than designed.
//
// v6.67 answered that with a NEW vertical card (photo on top, text below) on the
// reasoning that "a full-width row cannot scroll sideways". That component
// shipped and was never mounted anywhere.
//
// v7.02 REVERSES THAT CALL, on the owner's direction (2026-08-08, with a
// screenshot of the /best-of card): "this image is where the money is at... find
// where the design for these place cards is and apply everything else towards
// that style. That is the money style and that is what Wayfind should be known
// for. I want that image leveraged as the style for every card we offer — the
// finds from local creators should also match that style."
//
// So the rail card is no longer a second shape that merely borrows information
// from the place card. It IS the place card: this component renders the exact
// .wf-place-card DOM contract that app/home.js's PlaceCard and
// components/IconicPlaceCard.js render, so every rule in WF_PLACE_CARD_CSS —
// the orange hairline, the rank chip over the photo, the eyebrow with its
// orange tick, the 98x46 badge box, the award band, the orange chip pills, the
// action grid — applies to it with no second stylesheet to drift.
//
// The one thing a rail changes is that the card SNAPS, and .wf-rail in css.js
// owns that. The sideways objection from v6.67 was real but it was a width
// problem, not a shape problem. (v7.03: the card is full-width, not the
// fixed 318px this comment used to describe — the peek was traded for the
// explicit .wf-rail-nav row above the rail. See RailNav below.)
//
// WHAT IS OPTIONAL, AND WHY THAT MATTERS. The rails carry genuinely different
// data: a place has a Wayfind Score and a review count, an event has a start
// time and no score at all. Every enrichment below is null-guarded and NOTHING
// is invented to fill a slot — an event does not get a fabricated score, it gets
// the `when` badge in the same box, which is a fact it really carries. That is
// the same never-fabricate rule the rest of this codebase runs on.
import { useEffect, useState } from "react";
import { useMarketPhotoFallback } from "./marketPhoto.js";
// v8.29.2 — the same fallback hands IconicPlaceCard grew in v8.29. RailCard's
// thumbs were WORSE than a navigation: `onClick={... if (onLike) onLike(e)}`
// renders an enabled, pressable button that silently does nothing when the
// caller passed no handler — and several callers wrap their own optional prop
// the same way (`onLike={(e) => { if (onLike) onLike(e, place); }}`), so the
// prop is always a function and the card cannot even tell it is dead. Owner,
// 2026-08-20: "this button for the likes still not working under the exploding
// trends near you" — DaypartRail renders <ExplodingNearby> with isSaved and
// onSave and nothing else.
import { useCardActions, toggleLike as fallbackLike, toggleDislike as fallbackDislike, toggleSave as fallbackSave } from "../../lib/cardActions";
import { railDotWindow, railDotIsEdge } from "../../lib/railDots.js";
import { KB_CLICK, WayfindScoreBadge } from "./kit";
import { fallCardClass } from "../../lib/fallSkin.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { stayOnRailReaction } from "../../lib/railReaction.js";
// v8.33 — the creator's face on the media column, resolved from the optional
// `place` row. A rail card without a place row (the Viator tour rail, an
// event) simply has nothing to resolve and renders no mark.
import { creatorVideosFor } from "../../lib/creatorVideos";
import CreatorCardMark from "./CreatorCardMark";

// Same glyphs as IconicPlaceCard's action row, so a thumb is one drawing in
// this app rather than two that almost match.
const ThumbIcon = ({ down = false }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {down
      ? <><path d="M8 4v10H4V4h4Z" /><path d="M8 6h8.5a2 2 0 0 1 1.9 1.4l1.3 4a2 2 0 0 1-1.9 2.6H14l.6 3.1a2.4 2.4 0 0 1-2.4 2.9L8 14V6Z" /></>
      : <><path d="M8 10v10H4V10h4Z" /><path d="M8 18h8.5a2 2 0 0 0 1.9-1.4l1.3-4a2 2 0 0 0-1.9-2.6H14l.6-3.1A2.4 2.4 0 0 0 12.2 4L8 10v8Z" /></>}
  </svg>
);

// The WHEN badge — the events counterpart to WayfindScoreBadge, and the reason
// an event card can wear the money card's layout honestly.
//
// The score box is the strongest element on the place card and the eye goes to
// it first. An event has no score and must never be given one, so the same box
// carries the one number an event really has and the one a reader actually acts
// on: when it starts. Geometry (98x46, 24px colour rail, 6.5px kicker over a
// large value) is copied from .wf-place-card-score's own rules in css.js rather
// than re-invented, so the two badges are interchangeable in the layout.
//
// `tone` is derived from the event's real date, never chosen for effect:
//   now   — starts today       soon — tomorrow        later — further out
export function RailWhenBadge({ label, value, tone = "later" }) {
  if (!label && !value) return null;
  return (
    <span className="wf-rail-when" data-when-tone={tone} aria-label={`Starts ${label}${value ? " at " + value : ""}`}>
      <span className="wf-rail-when-rail" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 11h18" />
        </svg>
      </span>
      <span className="wf-rail-when-body">
        <span className="wf-rail-when-label">{label}</span>
        {value ? <span className="wf-rail-when-value">{value}</span> : null}
      </span>
    </span>
  );
}

const initialsOf = (name) => String(name || "WF").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// THE "THERE IS MORE" ROW (owner, 2026-08-08: "use a sign above the card to let
// the user know there is more, i want the card size to be full").
//
// The first pass leaned on a peek — a sliver of the next card past the right
// edge — to say the rail scrolls. That is the conventional signal and it costs
// ~50px of every card's width, which on a phone is the difference between the
// creator handle fitting and being clipped mid-word. The card now takes the
// full column and this row carries the signal explicitly instead: a real count
// of what is in the rail, and two controls that page it.
//
// It resolves its rail from the DOM by data-rail rather than taking a ref,
// because both call sites render the rail inside JSX that cannot hold a hook
// (app/home.js's rail lives in an IIFE inside the render tree). The query is
// scoped to a data attribute this component owns, so it cannot collide with
// anything else on the page.
export function RailNav({ railId, count, unit, total }) {
  // v8.39 — `total` is how many CARDS the rail holds; `count` is the number the
  // hint is allowed to claim, which is not always the same thing (the trending
  // rails now carry categorical venues behind their proven ones and say so in
  // `unit`). The arrows exist when there is something to scroll to — that is a
  // fact about the rail, never about the claim — so they key off `total`, and
  // fall back to `count` for every caller that passes only the one number.
  const cards = Number.isFinite(total) ? total : count;
  if (!cards || cards < 2) return null;
  const move = (dir) => {
    if (typeof document === "undefined") return;
    const rail = document.querySelector(`[data-rail="${railId}"]`);
    if (!rail) return;
    // One viewport width. Before v8.35 that was exactly one card; now it is
    // however many cards the column fits, which is the right page either way.
    rail.scrollBy({ left: dir * rail.clientWidth, behavior: "smooth" });
  };
  return (
    <div className="wf-rail-nav">
      <span className="wf-rail-nav-hint"><b>{count}</b> {unit} · swipe or tap ›</span>
      <span className="wf-rail-nav-btns">
        <button type="button" className="wf-rail-nav-btn" aria-label={"Previous " + unit} onClick={() => move(-1)}>‹</button>
        <button type="button" className="wf-rail-nav-btn" aria-label={"Next " + unit} onClick={() => move(1)}>›</button>
      </span>
    </div>
  );
}

// RailDots — the "there is more" bubble under a horizontal rail (owner,
// 2026-08-11: "a little bubble on the bottom to let them know there is more").
// Same hook-free, data-attribute-scoped pattern as RailNav above so any rail
// call site can adopt it. Full-width cards mean one card per page, so the
// active page is scrollLeft / clientWidth, read on scroll.
//
// v7.19 (owner, 2026-08-12): "on every rail I want the style from image 1 not
// image 2 — fix that globally." Image 1 is the DOTS; image 2 was the
// "9 of 10 · swipe for more" text pill this used to swap to above 8 pages.
// ONE indicator now, on every rail, at every length.
//
// THE PILL EXISTED FOR A REAL REASON and that reason still stands — 40 literal
// dots is noise, and at 6px + 5px gap they would overflow 390px past ~35 of
// them and wrap into a second row. So this does not just delete the branch: it
// renders a WINDOW of at most RAIL_DOTS_WINDOW dots that slides to keep the
// active one centred, which is the iOS/Instagram page-control behaviour people
// already know. When there is more beyond an edge, that edge dot shrinks —
// that taper IS the "there's more this way" signal the text pill used to spell
// out, carried by the same vocabulary as the rest of the strip.
export function RailDots({ railId, count }) {
  const [page, setPage] = useState(0);
  // v8.39 — THE DOTS COUNT PAGES, AND A PAGE STOPPED BEING ONE CARD.
  //
  // This component was written when `.wf-rail>.wf-rail-card` was `flex:0 0
  // 100%`, so "one card" and "one viewport" were the same distance and `count`
  // (cards) could stand in for pages. v8.35 sized the trending cards off the
  // drop's own column — about 3.4 across a desktop — and the identity broke:
  // `scrollLeft / clientWidth` now tops out around (12 - 3.4) / 3.4 ≈ 2.5, so a
  // twelve-dot strip could only ever light its first three. The strip said
  // there were nine pages left that no amount of scrolling could reach.
  //
  // Pages are therefore MEASURED off the rail's own geometry, and re-measured
  // on resize because the card width is a media-query variable — a phone
  // rotating to landscape changes how many pages exist. `count` stays the
  // honest fallback for the first paint (before layout, scrollWidth is 0) and
  // the ceiling: there is never more than one page per card.
  const [pages, setPages] = useState(count);
  useEffect(() => {
    if (typeof document === "undefined" || !count || count < 2) return;
    const rail = document.querySelector(`[data-rail="${railId}"]`);
    if (!rail) return;
    const read = () => {
      const w = rail.clientWidth || 1;
      const n = Math.max(1, Math.min(count, Math.ceil((rail.scrollWidth || w) / w)));
      setPages(n);
      setPage(Math.max(0, Math.min(n - 1, Math.round(rail.scrollLeft / w))));
    };
    rail.addEventListener("scroll", read, { passive: true });
    // ResizeObserver over a window listener: the rail's width changes with the
    // drop opening and closing too, not only with the viewport.
    let ro = null;
    if (typeof ResizeObserver === "function") { ro = new ResizeObserver(read); ro.observe(rail); }
    else if (typeof window !== "undefined") window.addEventListener("resize", read);
    read();
    return () => {
      rail.removeEventListener("scroll", read);
      if (ro) ro.disconnect();
      else if (typeof window !== "undefined") window.removeEventListener("resize", read);
    };
  }, [railId, count]);
  if (!count || count < 2 || pages < 2) return null;
  // The sliding window. Clamped at both ends so the strip never shows blanks:
  // near the start it pins to 0, near the end it pins to pages - W, and only in
  // the middle does it actually follow the active page.
  const { start, end } = railDotWindow(pages, page);
  const dots = [];
  for (let i = start; i < end; i++) dots.push(i);
  return (
    <div
      aria-hidden="true"
      data-rail-dots={railId}
      data-page={page + 1}
      data-count={pages}
      data-cards={count}
      style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 5, padding: "7px 0 1px" }}
    >
      {dots.map((i) => {
        const active = i === page;
        // An edge dot is only "tapered" when content actually continues past
        // it — at the true first/last card nothing is hidden, so nothing shrinks
        // and the strip reads as a plain, complete page control.
        const edge = railDotIsEdge(i, start, end, pages);
        return (
          <span
            key={i}
            style={{
              width: active ? 16 : (edge ? 4 : 6),
              height: active ? 6 : (edge ? 4 : 6),
              borderRadius: 999,
              background: active ? "#F97316" : (edge ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.22)"),
              transition: "width .2s ease, height .2s ease, background .2s ease",
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * @param {object}   p
 * @param {string}   p.photo       image URL; a monogram tile stands in when absent
 * @param {string}   p.photoFallback second src tried once if `photo` fails to load
 * @param {string}   p.title       place / event name (clamped to 2 lines by CSS)
 * @param {string}   p.eyebrow     the small category line ("Sports", "Fine dining")
 * @param {func}     p.onEyebrow   makes the eyebrow a real control; omit for a plain label
 * @param {number}   p.rank        renders the rank chip over the photo
 * @param {number}   p.score       Wayfind Score 0-10 — places only, never events
 * @param {object}   p.when        { label, value, tone } — events only, never places
 * @param {string[]} p.facts       meta row, middot-separated by CSS
 * @param {object}   p.award       { icon, label, tone } tone: 1|2|3|creator
 * @param {object[]} p.chips       [{ key, icon, label, onClick }] — onClick makes it a pill button
 * @param {node}     p.badge       caller-owned node in the chip row (a flame, a "Selling fast")
 * @param {object}   p.cta         { label, href, external, onClick } the money action
 * @param {func}     p.onOpen      card body activation (opens the sheet / the event)
 * @param {string}   p.href        when the card body is a link rather than a handler
 */
export default function RailCard({
  photo, photoFallback, title, eyebrow, onEyebrow, rank, score, when, facts, award, chips, badge, cta, take,
  onOpen, href, external, ariaLabel, className,
  // v8.70 — see the IconicPlaceCard note: inside .wf8-pcrail (the rail's
  // tap-expanded horizontal scroller) `loading="lazy"` never resolves, so a
  // lazy image there is a permanently blank one. Opt-out, default unchanged.
  eagerMedia = false, mediaPriority = null,
  saved, liked, disliked, onSave, onLike, onDislike, onShare,
  // v8.29.2 — the row this card is ABOUT. Without it the card has nothing to
  // like; with it, a caller that wires no handler still gets a working thumb
  // instead of a button that lies. Optional: a caller with no place row (the
  // events rail) keeps the old prop-only behaviour, and its thumbs now render
  // disabled rather than dead.
  place,
  // v8.29.6 — the WRITTEN opt-out, for a card that is not a place: the Viator
  // tour rail in BestNearby has no place row, no handlers and nothing to like.
  // It used to draw Save / Like / Dislike / Share anyway, all four wired to
  // `if (onX) onX(e)` — four live buttons over four no-ops. Hiding the row
  // whenever nothing was wired was the first fix and it was too clever: it
  // also hid the control on a card that simply had not hydrated yet, which is
  // the state scripts/test-rail-like-stays.mjs probes. So the card says so in
  // writing instead, and everything else renders its thumbs — disabled while
  // they have no hands, which is honest and still unpressable.
  actionsReadOnly = false,
}) {
  // v8.13.3 (owner: "I don't want any of the place cards not to have an
  // image"). Rung 3 of the photo ladder — a category/eyebrow-matched stock
  // scene, fetched only when the caller resolved no photo. Runs before the
  // early return (rules of hooks). See ./marketPhoto.js for the ladder.
  const railMarketFallback = useMarketPhotoFallback(photo ? null : (eyebrow || null));
  // Hooks before the early return, always called (rules of hooks). Subscribes
  // only when this card actually needs the shared store.
  const canFallback = !!(place && place.id);
  // v8.33 — the creator face. Guarded the same way IconicPlaceCard guards it:
  // a rail is the one surface where a single throw takes out a whole row.
  let railCreatorVideos = [];
  try { railCreatorVideos = place ? (creatorVideosFor(place) || []) : []; } catch (e) { railCreatorVideos = []; }
  const fb = useCardActions(canFallback && !(onSave && onLike && onDislike));
  if (!title) return null;
  // A wired handler always wins; the store is what an unwired card falls back
  // to, so no surface can ship a thumb that does nothing.
  const useFb = canFallback && fb.hydrated;
  const doSave = onSave || (useFb ? () => fallbackSave(place, { surface: "rail_card" }) : null);
  const doLike = onLike || (useFb ? () => fallbackLike(place, { surface: "rail_card" }) : null);
  const doDislike = onDislike || (useFb ? () => fallbackDislike(place, { surface: "rail_card" }) : null);
  const isSavedNow = onSave ? !!saved : useFb ? !!fb.saved[place.id] : !!saved;
  const isLikedNow = onLike ? !!liked : useFb ? !!fb.liked[place.id] : !!liked;
  const isDislikedNow = onDislike ? !!disliked : useFb ? !!fb.disliked[place.id] : !!disliked;
  const list = Array.isArray(facts) ? facts.filter(Boolean) : [];
  const pills = Array.isArray(chips) ? chips.filter(Boolean) : [];
  // The card body is the tap target; every control inside it stops propagation
  // (same nested-interactive contract check-collection-look.mjs pins on
  // IconicPlaceCard). role/tabIndex/KB_CLICK give it the keyboard path
  // test-card-a11y.mjs requires of anything that opens a place.
  return (
    <article
      className={`wf-place-card wf-rail-card${fallCardClass(place && place.id, siteTodayStr())}${isLikedNow ? " is-liked" : ""}${isDislikedNow ? " is-disliked" : ""}${className ? " " + className : ""}`}
      role="button"
      tabIndex={0}
      onKeyDown={KB_CLICK}
      onClick={(e) => {
        const t = e && e.target;
        // Same nested-interactive contract as IconicPlaceCard: a tap that
        // landed on one of this card's own controls must not ALSO open the
        // card. Deliberately not "[role='button']" — the card root carries
        // that role itself, so closest() would match here and swallow every
        // tap on the body.
        if (t && typeof t.closest === "function" && t.closest("a,button,input,select,textarea")) return;
        if (onOpen) onOpen(e);
        else if (href && typeof window !== "undefined") { if (external) window.open(href, "_blank", "noopener"); else window.location.assign(href); }
      }}
      aria-label={ariaLabel || title}
    >
      {/* v8.62: score (or the when-badge that borrows its slot) in the top
          right corner of the CARD, never on the photo (owner, 2026-08-26).
          Direct child of .wf-place-card — the shared css.js rule anchors it. */}
      {score != null
        ? <div className="wf-place-card-score"><WayfindScoreBadge score={score} /></div>
        : when ? <div className="wf-place-card-score"><RailWhenBadge {...when} /></div> : null}
      <div className="wf-place-card-layout">
        <div className="wf-place-card-media">
          {(photo || railMarketFallback)
            ? <img
                src={photo || railMarketFallback}
                data-fallback={photoFallback || ""}
                alt=""
                loading={eagerMedia ? "eager" : "lazy"}
                decoding="async"
                {...(mediaPriority ? { fetchpriority: mediaPriority } : null)}
                onError={(ev) => {
                  const fb = ev.currentTarget.dataset.fallback;
                  if (fb) { ev.currentTarget.dataset.fallback = ""; ev.currentTarget.src = fb; }
                  else { ev.currentTarget.style.visibility = "hidden"; }
                }}
                style={{ objectFit: "cover" }}
              />
            : <div className="wf-place-card-monogram" aria-hidden="true">{initialsOf(title)}</div>}
          {rank ? <span className="wf-place-card-rank" aria-label={"Rank " + rank}>{rank}</span> : null}
        </div>
        <div className="wf-place-card-content" style={{ position: "relative" }}>
          <div className="wf-place-card-title-row" style={{ display: "flex", alignItems: "flex-start" }}>
            <div className="wf-place-card-heading">
              {eyebrow ? (onEyebrow
                ? <button type="button" className="wf-place-card-category is-tappable" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEyebrow(e); }}>{eyebrow} ›</button>
                : <span className="wf-place-card-category">{eyebrow}</span>) : null}
              <div className="wf-place-card-name">{title}</div>
            </div>
          </div>

          {list.length ? (
            <div className="wf-place-card-meta" style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              {list.map((f) => <span key={f}>{f}</span>)}
            </div>
          ) : null}

          {award ? (
            <div className={`wf-place-card-award is-${award.tone === "creator" ? "creator" : "rank-" + (award.tone || 1)}`}>
              <span className="wf-place-card-award-icon" aria-hidden="true">{award.icon}</span>
              <span>{award.label}</span>
            </div>
          ) : null}

          {pills.length || badge ? (
            <div className="wf-place-card-highlights" style={{ display: "flex", flexWrap: "wrap" }}>
              {pills.map((chip) => (chip.onClick
                /* v8.22: chips may carry a `title` — the long form of a
                   deliberately short label (e.g. "Trending" whose full trend
                   text lives in the section header). Hover/AT keep the detail
                   without the pill ever needing to be long enough to cut. */
                ? <button key={chip.key} type="button" title={chip.title || undefined} onClick={(e) => { e.stopPropagation(); e.preventDefault(); chip.onClick(e); }}>{chip.icon} {chip.label} ›</button>
                : <span key={chip.key} title={chip.title || undefined}>{chip.icon} {chip.label}</span>
              ))}
              {/* Caller-owned node, exactly like IconicPlaceCard's `badge`: the
                  trending flame and the "Selling fast" scarcity tag are built by
                  the surface that has the evidence for them, never here. */}
              {badge || null}
            </div>
          ) : null}

          {/* THE EDITORIAL LINE. One sentence answering "why should I choose
              this place" — the app-wide law (2026-08-09). Rendered only when a
              VERIFIED line exists: no fallback, no template, no generated
              filler. An empty slot is honest; a generic line is not. */}
          {take ? <div className="wf-place-card-take">{take}</div> : null}

          {cta ? (
            <a
              className="wf-place-card-book wf-rail-card-cta"
              href={cta.href || "#"}
              {...(cta.external ? { target: "_blank", rel: "noreferrer" } : {})}
              onClick={(e) => { e.stopPropagation(); if (cta.onClick) cta.onClick(e); }}
            >{cta.label}</a>
          ) : null}

          {/* v8.29.2 / v8.29.6 — A CONTROL THIS CARD CANNOT SERVICE DOES NOT
              RENDER, and the card says so in writing. A tour card (BestNearby's
              Viator rail) has no place row and no handlers: it used to draw
              Save / Like / Dislike / Share anyway, all four wired to
              `if (onX) onX(e)` — four live buttons over four no-ops. Inferring
              it from "nothing is wired" was the first attempt and it also hid
              the control on a card that had simply not hydrated yet, so the
              opt-out is explicit. */}
          {/* v8.34 — the creator credit sits in the bottom band, directly above
              the actions (see css.js .wf-place-card-credit). It renders even on
              a read-only card: the credit is a fact about the place, not a
              control, and a tour card simply resolves no videos. */}
          <CreatorCardMark videos={railCreatorVideos} />
          {actionsReadOnly ? null : (
          <div className="wf-place-card-actions wf-sheet-card-actions">
            <button
              type="button"
              className={"wf-place-card-save" + (isSavedNow ? " is-active" : "")}
              aria-label={isSavedNow ? "Remove from saved: " + title : "Save " + title}
              aria-pressed={isSavedNow}
              disabled={!doSave}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (doSave) doSave(e); }}
            >{isSavedNow ? "♥ Saved" : "♡ Save"}</button>
            <button
              type="button"
              className={"wf-place-card-like" + (isLikedNow ? " is-active" : "")}
              aria-label={isLikedNow ? "Remove like: " + title : "Like " + title}
              aria-pressed={isLikedNow}
              title={isLikedNow ? "Remove like" : "Like this"}
              // v8.29.6 — main PR #888 routes this through stayOnRailReaction so
              // the tap can never navigate; v8.29.2 makes sure there is a hand on
              // the other end of it. `disabled` is what remains honest for a card
              // that has neither a handler nor a place row (a Viator tour card):
              // stayOnRailReaction would return silently there, and a pressable
              // button that returns silently is the thing being fixed.
              disabled={!doLike}
              onClick={(e) => stayOnRailReaction(e, doLike)}
            ><ThumbIcon /></button>
            <button
              type="button"
              className={"wf-place-card-dislike" + (isDislikedNow ? " is-active" : "")}
              aria-label={isDislikedNow ? "Remove dislike: " + title : "Not for me: " + title}
              aria-pressed={isDislikedNow}
              title={isDislikedNow ? "Remove dislike" : "Not for me"}
              disabled={!doDislike}
              onClick={(e) => stayOnRailReaction(e, doDislike)}
            ><ThumbIcon down /></button>
            {onShare ? (
              <button
                type="button"
                className="wf-place-card-share"
                aria-label={"Share " + title}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onShare(e); }}
              >↗ Share</button>
            ) : null}
          </div>
          )}
        </div>
      </div>
    </article>
  );
}
