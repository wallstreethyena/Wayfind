"use client";
// ViatorRail — the bookable rail, block 2 of the shared list composition.
//
// EXTRACTED from app/home.js (v6.72, owner directive 2026-07-31: "one shared
// component… if you copy the composition into nine pages they drift within a
// week"). It was a 42-line local function in an 8,000-line module, which meant
// the nine standalone intent pages could not render the rail at all — the #2
// revenue block was reachable only from the in-app sheets.
//
// THIS IS AN EXTRACTION PR, so both mandatory guards apply (CLAUDE.md): the
// render smoke test must MOUNT it, and check-lib-call-imports must see every
// name it calls bound. #486 shipped a ReferenceError to production doing
// exactly this move while six checks reported green — the one property all six
// shared was that nothing ever called the component.
//
// TWO CLOSURES BECAME PROPS. `logEvent` and `openExternal` are home.js
// component scope and cannot follow the component out. They are now `onLog`
// and `onOpenExternal`, both OPTIONAL — a host that passes neither still gets a
// working, attributed link (the anchor falls back to a plain window.open with
// noopener,noreferrer), because a rail that silently stops opening is worse
// than one that skips analytics.
//
// THE ATTRIBUTION IS LOAD-BEARING AND MUST NOT BE "SIMPLIFIED". v6.44: this
// rail once rendered a RAW t.url while its sibling wrapped the identical
// payload without the tracked server redirect, so every booking from that
// surface lost the click-to-redirect join. The commerce wrapper below resolves
// the destination server-side; the commission disclosure is load-bearing.
import { C, PlaceScoreChip } from "./kit";
import { eventCategoryArt } from "../../lib/eventCategoryArt";
import { rankExperiences } from "../../lib/experiencesData";
import ViatorCommerceLink from "./ViatorCommerceLink";

export default function ViatorRail({ title, items, theme, onLog, onOpenExternal }) {
  if (!Array.isArray(items) || !items.length) return null;
  const rankedItems = rankExperiences(items);
  const categoryImage = theme === "events-tours" ? eventCategoryArt("tours") : "";
  return (
    <div style={{ margin: "4px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>{title}</span>
        <span style={{ fontSize: 9.5, color: C.muted }}>via Viator</span>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {rankedItems.map((t, i) => (
          /* v6.44: this rail rendered a RAW t.url while its sibling rail used
             an affiliate wrapper. Both now use ViatorCommerceLink so the UI
             points to Wayfind's validated server redirect and carries the
             click_id attribution chain.
             NOTE: this is a plain block comment, not a braced JSX comment. The
             arrow body here is a parenthesised EXPRESSION, not a JSX children
             list, so a braced comment would be a second top-level expression
             and the file stops parsing (TS2657 "JSX expressions must have one
             parent element"). Caught by npm run check:jsx, 2026-07-28. */
          <ViatorCommerceLink key={t.code || t.url} t={t} surface="viator_rail" contentId={theme} rank={i + 1} onClick={(e, clickId) => { try { onLog && onLog("tickets_out", null, { kind: "vibe_tour", theme, code: t.code, click_id: clickId }); } catch (er) {} if (onOpenExternal) { e.preventDefault(); onOpenExternal(e.currentTarget.href); } }} style={{ flex: "0 0 200px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", textDecoration: "none" }}>
            {(t.image || categoryImage) ? <div style={{ position: "relative", height: 86, overflow: "hidden" }}>
              <img src={t.image || categoryImage} data-fallback={t.image ? categoryImage : ""} alt="" loading="lazy" onError={(ev) => { const fallback = ev.currentTarget.dataset.fallback; if (fallback && ev.currentTarget.src !== fallback) { ev.currentTarget.dataset.fallback = ""; ev.currentTarget.src = fallback; } else { ev.currentTarget.style.display = "none"; } }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: t.image ? "none" : "saturate(.82) contrast(.96)" }} />
              {!t.image && categoryImage ? <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(5,9,15,.12),rgba(5,9,15,.56))" }} /> : null}
              {/* Demand badge rides ONLY on Viator's own flag as passed through
                  verbatim by the API route (t.sellingFast) — same convention as
                  the Local-tours grid in Events.js — never a computed guess.
                  t.sellingOut also honored for the wf_experiences-backed source
                  (lib/experiencesServe.js rowToCard) so this rail stays correct
                  no matter which pipeline fed it. It is cosmetic only: per
                  lib/experiencesData.js's Gate-2 isolation, this flag never
                  enters rankExperiences and cannot move a card's position. */}
              {(t.sellingFast || t.sellingOut) ? <span style={{ position: "absolute", top: 6, left: 6, zIndex: 1, background: "#B33A2B", color: "#fff", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", borderRadius: 999, padding: "3px 8px" }}>Selling fast</span> : null}
            </div> : null}
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 750, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
              {/* THE ONE SCORE: same Wayfind treatment as every place card. */}
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, flexWrap: "wrap" }}>
                {t.rating > 0 && t.reviews > 0 ? <PlaceScoreChip p={{ rating: t.rating, reviews: t.reviews }} size={12} /> : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>New</span>}
                <span style={{ fontSize: 11, color: C.muted }}>{t.fromPrice ? `from $${t.fromPrice}` : ""}{t.duration ? ` · ${t.duration}` : ""}</span>
              </div>
            </div>
          </ViatorCommerceLink>
        ))}
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 7, lineHeight: 1.4 }}>Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings.</div>
    </div>
  );
}
