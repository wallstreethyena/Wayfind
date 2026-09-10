"use client";

import { Fragment } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import ViatorCommerceLink from "./ViatorCommerceLink";
import PosterEventCard from "./PosterEventCard.js";
import { directionsUrl } from "./kit";
import { cardImageSrc } from "../../lib/placePhoto.js";
import { experienceWayfindScore } from "../../lib/experiencesData.js";
import { toDisplayScore } from "../../lib/score.js";
import { railRenderState, RAIL_RENDER_STATE } from "../../lib/railVisibility.js";

const compact = (value) => Number(value) >= 1000 ? `${Math.round(Number(value) / 100) / 10}k` : String(Number(value) || 0);

export default function SummerPicksRails({ rails, city, onOpenPlace = null }) {
  const renderedRails = (Array.isArray(rails) ? rails : []).filter((rail) =>
    rail?.pending || rail?.failed || railRenderState(rail?.cards) === RAIL_RENDER_STATE.CONTENT
  );
  return <>{renderedRails.map((rail) => {
    const railId = `summer-picks-${rail.id}`;
    const total = Number.isFinite(rail.total) ? rail.total : (rail.cards || []).length;
    return <section key={rail.id} aria-labelledby={`${railId}-title`} style={{ marginTop: 28 }}>
      <h2 id={`${railId}-title`} style={{ margin: "0 0 4px", color: "#F8FAFC", fontSize: 20, fontWeight: 850 }}>{rail.title}</h2>
      <p className="wf-rail-deck" style={{ color: "#A8B0BE" }}>{rail.deck}</p>
      {rail.pending && !rail.cards?.length ? (
        <div role="status" aria-busy="true" aria-label={`Loading ${rail.title}`} className="wf-sk" style={{ height: 88, borderRadius: 14, background: "#0B0E15" }} />
      ) : rail.failed && !rail.cards?.length ? (
        <p role="alert" style={{ margin: "8px 0 0", color: "#8B93A1", fontSize: 13 }}>We could not reach this rail&apos;s verified event inventory.</p>
      ) : <>
        <RailNav railId={railId} count={total} total={total} unit={total === 1 ? "ranked option" : "ranked options"} />
        <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
          {rail.cards.map((card, index) => {
            const rank = index + 1;
            if (card.kind === "event") return <PosterEventCard key={`event:${card.id}`} event={card} rank={rank} surface="summer_sports" />;
            if (card.kind === "event-node") return <Fragment key={`event-node:${card.id || index}`}>{card.node}</Fragment>;
            if (card.kind === "tour") {
              const score = toDisplayScore(experienceWayfindScore(card));
              const facts = [card.city || null, card.reviews ? `${compact(card.reviews)} reviews` : null, card.duration || null, card.fromPrice != null ? `from $${card.fromPrice}` : null].filter(Boolean);
              return <RailCard key={`tour:${card.code}`} photo={card.image} title={card.title} eyebrow="Bookable activity"
                rank={rank} score={score} facts={facts} chips={(card.chips || []).slice(0, 3)} eagerMedia={rank <= 3}
                actionItem={{ id: card.code, type: "experience", title: card.title, image: card.image || null, url: card.url || card.bookingUrl || "", provider: "viator" }} ariaLabel={`See availability for ${card.title}`}
                onOpen={(event) => event?.currentTarget?.querySelector?.("a[data-offer]")?.click()}
                ctaNode={<ViatorCommerceLink t={card} surface={`summer_picks_${rail.id}`} contentId={city} rank={rank}
                  className="wf-place-card-book wf-rail-card-cta" title="Affiliate partner link. Wayfind may earn a commission; ranking does not change.">
                  See availability ↗
                </ViatorCommerceLink>} />;
            }
            const photo = card.photoUrl || card.photo_url || cardImageSrc(card, 640);
            const ctaHref = directionsUrl(card);
            const facts = [card.city || null, card.reviews ? `${compact(card.reviews)} reviews` : null, Number.isFinite(card.distMi) ? `${card.distMi} mi` : null].filter(Boolean);
            return <RailCard key={`place:${card.id}`} photo={photo} title={card.name} eyebrow={rail.title}
              rank={rank} score={toDisplayScore(card.wfScore)} facts={facts}
              take={card._summerWhy || card.editorial || card.hook || null} place={card} eagerMedia={rank <= 3}
              onOpen={onOpenPlace ? () => onOpenPlace(card) : undefined}
              ariaLabel={`Open ${card.name}`} href={`/p/${encodeURIComponent(card.id)}`}
              cta={ctaHref ? { label: "Directions ↗", href: ctaHref, external: true } : null} />;
          })}
        </div>
        <RailDots railId={railId} count={rail.cards.length} />
      </>}
    </section>;
  })}</>;
}
