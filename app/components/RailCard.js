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
// The one thing a rail changes is WIDTH: the card is fixed-width and snaps, and
// .wf-rail in css.js owns that. The sideways objection from v6.67 was real but
// it was a width problem, not a shape problem.
//
// WHAT IS OPTIONAL, AND WHY THAT MATTERS. The rails carry genuinely different
// data: a place has a Wayfind Score and a review count, an event has a start
// time and no score at all. Every enrichment below is null-guarded and NOTHING
// is invented to fill a slot — an event does not get a fabricated score, it gets
// the `when` badge in the same box, which is a fact it really carries. That is
// the same never-fabricate rule the rest of this codebase runs on.
import { KB_CLICK, WayfindScoreBadge } from "./kit";

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
 * @param {object}   p.cta         { label, href, external, onClick } the money action
 * @param {func}     p.onOpen      card body activation (opens the sheet / the event)
 * @param {string}   p.href        when the card body is a link rather than a handler
 */
export default function RailCard({
  photo, photoFallback, title, eyebrow, onEyebrow, rank, score, when, facts, award, chips, cta,
  onOpen, href, external, ariaLabel, className,
  saved, liked, disliked, onSave, onLike, onDislike, onShare,
}) {
  if (!title) return null;
  const list = Array.isArray(facts) ? facts.filter(Boolean) : [];
  const pills = Array.isArray(chips) ? chips.filter(Boolean) : [];
  // The card body is the tap target; every control inside it stops propagation
  // (same nested-interactive contract check-collection-look.mjs pins on
  // IconicPlaceCard). role/tabIndex/KB_CLICK give it the keyboard path
  // test-card-a11y.mjs requires of anything that opens a place.
  return (
    <article
      className={`wf-place-card wf-rail-card${liked ? " is-liked" : ""}${disliked ? " is-disliked" : ""}${className ? " " + className : ""}`}
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
      <div className="wf-place-card-layout">
        {photo
          ? <img
              src={photo}
              data-fallback={photoFallback || ""}
              alt=""
              loading="lazy"
              decoding="async"
              onError={(ev) => {
                const fb = ev.currentTarget.dataset.fallback;
                if (fb) { ev.currentTarget.dataset.fallback = ""; ev.currentTarget.src = fb; }
                else { ev.currentTarget.style.visibility = "hidden"; }
              }}
              style={{ objectFit: "cover" }}
            />
          : <div className="wf-place-card-monogram" aria-hidden="true">{initialsOf(title)}</div>}
        <div className="wf-place-card-content" style={{ position: "relative" }}>
          <div className="wf-place-card-title-row" style={{ display: "flex", alignItems: "flex-start" }}>
            {rank ? <span className="wf-place-card-rank" aria-label={"Rank " + rank}>{rank}</span> : null}
            <div className="wf-place-card-heading">
              {eyebrow ? (onEyebrow
                ? <button type="button" className="wf-place-card-category is-tappable" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEyebrow(e); }}>{eyebrow} ›</button>
                : <span className="wf-place-card-category">{eyebrow}</span>) : null}
              <div className="wf-place-card-name">{title}</div>
            </div>
            {score != null
              ? <div className="wf-place-card-score"><WayfindScoreBadge score={score} /></div>
              : when ? <div className="wf-place-card-score"><RailWhenBadge {...when} /></div> : null}
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

          {pills.length ? (
            <div className="wf-place-card-highlights" style={{ display: "flex", flexWrap: "wrap" }}>
              {pills.map((chip) => (chip.onClick
                ? <button key={chip.key} type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); chip.onClick(e); }}>{chip.icon} {chip.label} ›</button>
                : <span key={chip.key}>{chip.icon} {chip.label}</span>
              ))}
            </div>
          ) : null}

          {cta ? (
            <a
              className="wf-place-card-book wf-rail-card-cta"
              href={cta.href || "#"}
              {...(cta.external ? { target: "_blank", rel: "noreferrer" } : {})}
              onClick={(e) => { e.stopPropagation(); if (cta.onClick) cta.onClick(e); }}
            >{cta.label}</a>
          ) : null}

          <div className="wf-place-card-actions wf-sheet-card-actions">
            <button
              type="button"
              className={"wf-place-card-save" + (saved ? " is-active" : "")}
              aria-label={saved ? "Remove from saved: " + title : "Save " + title}
              aria-pressed={!!saved}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (onSave) onSave(e); }}
            >{saved ? "♥ Saved" : "♡ Save"}</button>
            <button
              type="button"
              className={"wf-place-card-like" + (liked ? " is-active" : "")}
              aria-label={liked ? "Remove like: " + title : "Like " + title}
              aria-pressed={!!liked}
              title={liked ? "Remove like" : "Like this"}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (onLike) onLike(e); }}
            ><ThumbIcon /></button>
            <button
              type="button"
              className={"wf-place-card-dislike" + (disliked ? " is-active" : "")}
              aria-label={disliked ? "Remove dislike: " + title : "Not for me: " + title}
              aria-pressed={!!disliked}
              title={disliked ? "Remove dislike" : "Not for me"}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (onDislike) onDislike(e); }}
            ><ThumbIcon down /></button>
            <button
              type="button"
              className="wf-place-card-share"
              aria-label={"Share " + title}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (onShare) onShare(e); }}
            >↗ Share</button>
          </div>
        </div>
      </div>
    </article>
  );
}
