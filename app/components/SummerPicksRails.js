"use client";

import RailCard, { RailDots, RailNav } from "./RailCard";
import ViatorCommerceLink from "./ViatorCommerceLink";
import { directionsUrl } from "./kit";
import { cardImageSrc } from "../../lib/placePhoto.js";
import { experienceWayfindScore } from "../../lib/experiencesData.js";
import { toDisplayScore } from "../../lib/score.js";

const compact = (value) => Number(value) >= 1000 ? `${Math.round(Number(value) / 100) / 10}k` : String(Number(value) || 0);

export default function SummerPicksRails({ rails, city, onOpenPlace = null }) {
  return <>{(rails || []).map((rail) => {
    const railId = `summer-picks-${rail.id}`;
    return <section key={rail.id} aria-labelledby={`${railId}-title`} style={{ marginTop: 28 }}>
      <h2 id={`${railId}-title`} style={{ margin: "0 0 4px", color: "#F8FAFC", fontSize: 20, fontWeight: 850 }}>{rail.title}</h2>
      <p style={{ margin: "0 0 8px", color: "#A8B0BE", fontSize: 12.5, lineHeight: 1.5 }}>{rail.deck}</p>
      {!rail.cards.length ? (
        <p style={{ color: "#8B93A1", fontSize: 13 }}>No photo-verified option clears this rail yet. Wayfind will not pad it with an unrelated card.</p>
      ) : <>
        <RailNav railId={railId} count={rail.total} total={rail.cards.length} unit={rail.total === 1 ? "ranked option" : "ranked options"} />
        <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
          {rail.cards.map((card, index) => {
            const rank = index + 1;
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
