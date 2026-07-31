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
// payload with viatorDirectUrl(), so every booking from that surface earned
// nothing. rel="noreferrer sponsored" and the commission disclosure are FTC
// requirements, not styling.
import { C, PlaceScoreChip } from "./kit";
import { eventCategoryArt } from "../../lib/eventCategoryArt";
import { viatorDirectUrl } from "../../lib/affiliates";

export default function ViatorRail({ title, items, theme, onLog, onOpenExternal }) {
  if (!Array.isArray(items) || !items.length) return null;
  const categoryImage = theme === "events-tours" ? eventCategoryArt("tours") : "";
  return (
    <div style={{ margin: "4px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>{title}</span>
        <span style={{ fontSize: 9.5, color: C.muted }}>via Viator</span>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {items.map((t) => (
          /* v6.44: this rail rendered a RAW t.url while its sibling rail (the
             Things-to-do one, ~8389) wrapped the identical payload from the
             identical /api/viator/tours endpoint with viatorDirectUrl(). Two
             rails, same data, one attributed and one not — so every booking
             from the Family browse earned nothing. Same class of hole as the
             Detail sheet's tour list; fixed the same way.
             NOTE: this is a plain block comment, not a braced JSX comment. The
             arrow body here is a parenthesised EXPRESSION, not a JSX children
             list, so a braced comment would be a second top-level expression
             and the file stops parsing (TS2657 "JSX expressions must have one
             parent element"). Caught by npm run check:jsx, 2026-07-28. */
          <a key={t.code || t.url} href={viatorDirectUrl(t.url) || t.url} target="_blank" rel="noreferrer sponsored" onClick={(e) => { e.preventDefault(); const _live = (e.currentTarget && e.currentTarget.href) || t.url; try { onLog && onLog("tickets_out", null, { kind: "vibe_tour", theme, code: t.code }); } catch (er) {} (onOpenExternal ? onOpenExternal(_live) : window.open(_live, "_blank", "noopener,noreferrer")); }} style={{ flex: "0 0 200px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", textDecoration: "none" }}>
            {(t.image || categoryImage) ? <div style={{ position: "relative", height: 86, overflow: "hidden" }}>
              <img src={t.image || categoryImage} data-fallback={t.image ? categoryImage : ""} alt="" loading="lazy" onError={(ev) => { const fallback = ev.currentTarget.dataset.fallback; if (fallback && ev.currentTarget.src !== fallback) { ev.currentTarget.dataset.fallback = ""; ev.currentTarget.src = fallback; } else { ev.currentTarget.style.display = "none"; } }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: t.image ? "none" : "saturate(.82) contrast(.96)" }} />
              {!t.image && categoryImage ? <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(5,9,15,.12),rgba(5,9,15,.56))" }} /> : null}
            </div> : null}
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 750, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
              {/* THE ONE SCORE: same Wayfind treatment as every place card. */}
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, flexWrap: "wrap" }}>
                {t.rating > 0 && t.reviews > 0 ? <PlaceScoreChip p={{ rating: t.rating, reviews: t.reviews }} size={12} /> : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>New</span>}
                <span style={{ fontSize: 11, color: C.muted }}>{t.fromPrice ? `from $${t.fromPrice}` : ""}{t.duration ? ` · ${t.duration}` : ""}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 7, lineHeight: 1.4 }}>Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings.</div>
    </div>
  );
}

