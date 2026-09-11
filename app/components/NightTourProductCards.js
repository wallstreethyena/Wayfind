"use client";

import RailCard from "./RailCard";
import ViatorCommerceLink from "./ViatorCommerceLink";
import { experienceWayfindScore } from "../../lib/experiencesData.js";
import { toDisplayScore } from "../../lib/score.js";

const compact = (value) => Number(value) >= 1000
  ? `${Math.round(Number(value) / 100) / 10}k`
  : String(Number(value) || 0);

export default function NightTourProductCards({ items = [], city = "", rankOffset = 0 }) {
  return items.map((item, index) => {
    const rank = rankOffset + index + 1;
    const facts = [
      item.city || null,
      Number(item.reviews) > 0 ? `${compact(item.reviews)} reviews` : null,
      item.duration || null,
      item.fromPrice != null ? `from $${item.fromPrice}` : null,
    ].filter(Boolean);
    return <RailCard key={`viator-night:${item.code}`}
      photo={item.image || null} title={item.title} eyebrow="Guided night activity"
      rank={rank} score={toDisplayScore(experienceWayfindScore(item))} facts={facts}
      chips={(item.chips || []).slice(0, 3)}
      actionItem={{ id: item.code, type: "experience", title: item.title, image: item.image || null, url: item.url || "", provider: "viator" }}
      ariaLabel={`See availability for ${item.title}`}
      onOpen={(event) => event?.currentTarget?.querySelector?.("a[data-offer]")?.click()}
      ctaNode={<ViatorCommerceLink t={item} surface="night_out_night_tours" contentId={city} rank={rank}
        className="wf-place-card-book wf-rail-card-cta"
        title="Affiliate partner link. Wayfind may earn a commission; ranking does not change.">
        See availability ↗
      </ViatorCommerceLink>} />;
  });
}

