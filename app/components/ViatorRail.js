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
import { C } from "./kit";
import { eventCategoryArt } from "../../lib/eventCategoryArt";
import { experienceWayfindScore, rankExperiences } from "../../lib/experiencesData";
import { toDisplayScore } from "../../lib/score";
import ViatorCommerceLink from "./ViatorCommerceLink";
import RailCard, { RailDots, RailNav } from "./RailCard";

export default function ViatorRail({ title, items, theme, onLog, onOpenExternal }) {
  if (!Array.isArray(items) || !items.length) return null;
  const rankedItems = rankExperiences(items);
  const categoryImage = theme === "events-tours" ? eventCategoryArt("tours") : "";
  const railId = `viator-${String(theme || title || "experiences").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <div style={{ margin: "4px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>{title}</span>
        <span style={{ fontSize: 9.5, color: C.muted }}>via Viator</span>
      </div>
      <RailNav railId={railId} count={rankedItems.length} total={rankedItems.length} unit="bookable experiences" />
      <div className="wf-rail" data-rail={railId} role="region" tabIndex={0} aria-label={title}>
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
          <RailCard
            key={t.code || t.url}
            photo={t.image || categoryImage}
            photoFallback={t.image ? categoryImage : ""}
            title={t.title}
            eyebrow="Bookable experience"
            rank={i + 1}
            score={toDisplayScore(experienceWayfindScore(t))}
            facts={[
              t.rating > 0 ? `${Number(t.rating).toFixed(1)}★` : "New",
              t.reviews > 0 ? `${Number(t.reviews).toLocaleString()} reviews` : null,
              t.fromPrice ? `from $${t.fromPrice}` : null,
              t.duration || null,
            ].filter(Boolean)}
            badge={(t.sellingFast || t.sellingOut) ? <span style={{ background: "#B33A2B", color: "#fff", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", borderRadius: 999, padding: "3px 8px" }}>Selling fast</span> : null}
            actionItem={{ id: t.code || t.url, type: "experience", title: t.title, image: t.image || categoryImage, url: t.url, provider: "viator" }}
            href={t.url}
            external
            ariaLabel={`Open ${t.title}`}
            ctaNode={<ViatorCommerceLink t={t} surface="viator_rail" contentId={theme} rank={i + 1} onClick={(e, clickId) => { e.stopPropagation(); try { onLog && onLog("tickets_out", null, { kind: "vibe_tour", theme, code: t.code, click_id: clickId }); } catch (er) {} if (onOpenExternal) { e.preventDefault(); onOpenExternal(e.currentTarget.href); } }} className="wf-place-card-book wf-rail-card-cta">{t.fromPrice ? `Book from $${t.fromPrice}` : "Book now"} ↗</ViatorCommerceLink>}
          />
        ))}
      </div>
      <RailDots railId={railId} count={rankedItems.length} />
      <div style={{ fontSize: 10, color: C.muted, marginTop: 7, lineHeight: 1.4 }}>Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings.</div>
    </div>
  );
}
