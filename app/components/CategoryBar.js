"use client";
// app/components/CategoryBar.js — the K3 category bar.
//
// Owner-approved 2026-08-06 after seven rounds of mockups
// (wayfind-k3-category-bar-work-order-2026-08-06.md). Phase 1: the bar itself.
//
// WHAT MAKES THIS A CONTROL RATHER THAN A BANNER. The selected circle is
// LARGER (62px against 48px) and the size MOVES on tap. Every other treatment
// tried in the mockups — a ring, a tint, a caption weight — read as decoration,
// because nothing about the row changed shape when you touched it.
//
// THREE RULES THAT ARE ABOUT HONESTY, NOT LAYOUT:
//
//   1. A category with zero places DOES NOT RENDER. Do not advertise an empty
//      room. Someone who taps "Stays" and finds nothing has learned the app
//      guesses.
//   2. THE COUNT DISAPPEARS RATHER THAN GUESSING. If the number cannot be
//      computed from the rows actually in hand, no count renders. It is never
//      0, never approximate, never a placeholder.
//   3. The row DELIBERATELY does not fit. The sixth circle is half-visible
//      behind a fade, because an even row is what makes people believe there is
//      nothing further along.
//
// This component is PRESENTATIONAL. It fetches nothing and ranks nothing — it
// is handed `cats` and renders them. The two decisions worth guarding
// (visibleCats, countLabel) are exported as pure functions so
// scripts/check-category-bar.mjs can assert on returned values.
// visibleCats / countLabel / the geometry live in lib/categoryTiles.js, not
// here: scripts/check-category-bar.mjs runs under plain node and cannot import
// a file containing JSX, so every decision that can be asserted on a returned
// value is kept out of this component on purpose. What is left here is render.
import { SUBFILTERS } from "../../lib/google";
import { visibleCats, countLabel, CIRCLE_BASE, CIRCLE_SELECTED, CIRCLE_SCALE } from "../../lib/categoryTiles";
import { C } from "./kit";

export default function CategoryBar({ cats, activeCat, onCat, sub, onSub }) {
  const list = visibleCats(cats);
  if (!list.length) return null;
  const subs = activeCat ? (SUBFILTERS[activeCat] || []) : [];
  const open = !!(activeCat && subs.length > 1);

  return (
    <div className="wf-k3">
      <style dangerouslySetInnerHTML={{ __html: `
        /* One spring, defined once. linear() needs Safari 17.4+ / Chrome 113+;
           anything older falls back to the cubic-bezier declared first, so the
           motion degrades rather than breaking. */
        .wf-k3{--k3-ease:cubic-bezier(.34,1.4,.5,1);--k3-ease:linear(0,.38 8%,.82 18%,1.06 27%,1.03 40%,.995 62%,1);margin:0 0 6px}
        .wf-k3-head{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${C.muted};padding:0 16px 9px}
        .wf-k3-row{position:relative}
        .wf-k3-scroll{display:flex;gap:14px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:2px 16px 4px;scroll-snap-type:x proximity}
        .wf-k3-scroll::-webkit-scrollbar{display:none}
        /* pointer-events:none so the fade can never swallow a tap on the circle
           underneath it. */
        .wf-k3-fade{position:absolute;top:0;right:0;bottom:0;width:52px;pointer-events:none;background:linear-gradient(to right,rgba(11,15,20,0),${C.bg})}
        .wf-k3-tap{flex:none;scroll-snap-align:start;background:none;border:0;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:7px;width:${CIRCLE_SELECTED}px}
        /* The slot is fixed at the SELECTED size. Scaling inside a fixed slot is
           why the row never reflows mid-animation. */
        .wf-k3-slot{width:${CIRCLE_SELECTED}px;height:${CIRCLE_SELECTED}px;display:flex;align-items:center;justify-content:center}
        /* TRANSFORM ONLY, NEVER WIDTH. Animating width relayouts the whole row
           every frame on a mid-range phone; transform is composited on the GPU. */
        .wf-k3-circle{width:${CIRCLE_BASE}px;height:${CIRCLE_BASE}px;border-radius:50%;overflow:hidden;position:relative;background:${C.panel};border:1px solid rgba(255,255,255,.10);transform:scale(1);transition:transform 380ms var(--k3-ease),filter 240ms ease,box-shadow 240ms ease;filter:saturate(.35) blur(1.1px)}
        .wf-k3-circle img{width:100%;height:100%;object-fit:cover;display:block}
        /* GLYPH FALLBACK, not a broken image. A category with no ranked photo
           (today: Family, which the home browse serves from a live search
           rather than wf_inventory) shows its own mark instead of borrowing a
           neighbouring category's photograph. */
        .wf-k3-glyph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;background:rgba(255,255,255,.05)}
        .wf-k3-tap[aria-selected="true"] .wf-k3-circle{transform:scale(${CIRCLE_SCALE.toFixed(4)});filter:none;border-color:${C.accent};box-shadow:0 0 0 2px ${C.accent},0 6px 18px rgba(249,115,22,.34)}
        .wf-k3-tap:focus-visible .wf-k3-circle{outline:2px solid ${C.accent};outline-offset:3px}
        .wf-k3-label{font-size:12px;font-weight:700;color:${C.muted};line-height:1.15;text-align:center;transition:color 200ms ease}
        .wf-k3-tap[aria-selected="true"] .wf-k3-label{color:${C.text};font-weight:800}
        .wf-k3-count{font-size:11px;font-weight:700;color:${C.muted};opacity:.72;line-height:1;margin-top:2px}
        .wf-k3-tap[aria-selected="true"] .wf-k3-count{color:${C.accent};opacity:1}
        /* grid-template-rows, NOT max-height. A magic max-height clips the fifth
           chip the day somebody adds one; 0fr->1fr animates to a height nobody
           has to know in advance. */
        .wf-k3-subs{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows 240ms ease,opacity 160ms ease}
        .wf-k3-subs.is-open{grid-template-rows:1fr;opacity:1}
        .wf-k3-subs-clip{overflow:hidden;min-height:0}
        .wf-k3-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:10px 16px 2px}
        .wf-k3-chips::-webkit-scrollbar{display:none}
        .wf-k3-chip{flex:none;height:30px;padding:0 13px;border-radius:15px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);font-size:12.5px;font-weight:600;color:#FFFFFF;white-space:nowrap;cursor:pointer;opacity:0;transform:translateY(4px);transition:opacity 200ms ease,transform 200ms var(--k3-ease),background 160ms ease,border-color 160ms ease,color 160ms ease}
        .wf-k3-subs.is-open .wf-k3-chip{opacity:1;transform:translateY(0);transition-delay:calc(var(--i) * 28ms)}
        .wf-k3-chip[aria-selected="true"]{background:rgba(249,115,22,.16);border-color:rgba(249,115,22,.42);color:${C.accent};font-weight:800}
        .wf-k3-chip:focus-visible{outline:2px solid ${C.accent};outline-offset:2px}
        /* app/layout.js already collapses every animation to 0ms under
           prefers-reduced-motion. This is belt and braces for the delays, which
           a blanket duration override does not reach. */
        @media (prefers-reduced-motion: reduce){
          .wf-k3-circle,.wf-k3-subs,.wf-k3-chip{transition:none}
          .wf-k3-subs.is-open .wf-k3-chip{transition-delay:0ms}
        }
      ` }} />

      <div className="wf-k3-head">Browse by category</div>

      <div className="wf-k3-row">
        <div className="wf-k3-scroll" role="tablist" aria-label="Browse by category">
          {list.map((m) => {
            const on = activeCat === m.id;
            const n = countLabel(m.count, m.truncated);
            return (
              <button
                key={m.id}
                role="tab"
                aria-selected={on ? "true" : "false"}
                aria-label={n ? `${m.label}, ${n} places` : m.label}
                className="wf-k3-tap"
                onClick={() => onCat && onCat(m.id, m.label)}
              >
                <span className="wf-k3-slot">
                  <span className="wf-k3-circle">
                    {m.photoUrl
                      ? <img src={m.photoUrl} alt="" loading="lazy" decoding="async" />
                      : <span className="wf-k3-glyph" aria-hidden="true">{m.glyph || ""}</span>}
                  </span>
                </span>
                <span className="wf-k3-label">{m.label}</span>
                {n ? <span className="wf-k3-count">{n}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="wf-k3-fade" aria-hidden="true" />
      </div>

      {/* The submenu is the EXISTING SUBFILTERS row — same chips, same queries,
          same SUB_ALLOW contract in lib/placeFilter.js. It only gained a height
          transition. It stays mounted so the grid-rows animation has something
          to animate; the clip hides it when closed. */}
      <div className={"wf-k3-subs" + (open ? " is-open" : "")}>
        <div className="wf-k3-subs-clip">
          <div className="wf-k3-chips" role="tablist" aria-label="Sub-filters">
            {subs.map((sf, i) => (
              <button
                key={sf.id}
                role="tab"
                aria-selected={sub === sf.id ? "true" : "false"}
                className="wf-k3-chip"
                style={{ ["--i"]: i }}
                tabIndex={open ? 0 : -1}
                onClick={() => onSub && onSub(sf.id)}
              >
                {sf.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
