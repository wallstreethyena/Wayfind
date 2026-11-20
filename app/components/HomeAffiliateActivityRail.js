"use client";

import { memo, useRef } from "react";
import ViatorCommerceLink from "./ViatorCommerceLink";
import RailHeading from "./RailHeading";
import RailCard, { RailDots, RailNav } from "./RailCard";
import { experienceWayfindScore } from "../../lib/experiencesData";
import { toDisplayScore } from "../../lib/score";
import { AFFILIATE_DISCLOSURE_SHORT } from "../../lib/affiliateDisclosure.js";
import { useStagedCards } from "../../lib/stagedMount.js";

const RAIL_ID = "home-affiliate-activities";

const AffiliateCard = memo(function AffiliateCard({ item, rank, contentId, onLogRef }) {
  const score = toDisplayScore(experienceWayfindScore(item));
  const facts = [
    item.city || null,
    Number(item.reviews) > 0 ? Number(item.reviews).toLocaleString() + " reviews" : null,
    item.duration || null,
    item.fromPrice != null ? "from $" + item.fromPrice : null,
  ].filter(Boolean);
  return (
    <RailCard
      photo={item.image}
      title={item.title}
      eyebrow="Bookable activity"
      rank={rank}
      score={score}
      facts={facts}
      chips={[
        item.sellingOut ? { key: "selling-out", icon: "🔥", label: "Selling out" } : null,
        ...(item.chips || []),
      ].filter(Boolean)}
      eagerMedia={rank <= 4}
      actionItem={{ id: item.code, type: "experience", title: item.title, image: item.image || null, url: item.url || item.bookingUrl || "", provider: "viator" }}
      ariaLabel={`Book ${item.title} with Viator`}
      onOpen={(event) => {
        const link = event?.currentTarget?.querySelector?.("a[data-offer]");
        if (link) link.click();
      }}
      ctaNode={(
        <ViatorCommerceLink
          t={item}
          surface="home_affiliate_activity_rail"
          contentId={contentId}
          rank={rank}
          onClick={(event, clickId) => {
            try { onLogRef.current?.("tickets_out", null, { kind: "home_affiliate_activity", code: item.code, rank, click_id: clickId }); } catch {}
          }}
          className="wf-place-card-book wf-rail-card-cta"
          title="Partner link. Wayfind may earn a commission; rankings never change."
        >
          Book with Viator ↗
        </ViatorCommerceLink>
      )}
    />
  );
});

// stagedCards: the client-only home feed draws its first cards at once and the rest in slices (lib/stagedMount.js).
export default function HomeAffiliateActivityRail({ items, contentId, onLog, stagedCards = false }) {
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;
  const rows = Array.isArray(items) ? items : [];
  const shown = useStagedCards(rows.length, true, { enabled: stagedCards });
  if (!rows.length) return null;
  return (
    <section aria-labelledby="home-affiliate-activities-title" style={{ marginBottom: 18 }}>
      <RailHeading id="home-affiliate-activities-title" title="Top tours nearby">
        <RailNav railId={RAIL_ID} count={rows.length} unit="options" total={rows.length} />
      </RailHeading>
      <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.45, color: "#E6EDF3" }}>{AFFILIATE_DISCLOSURE_SHORT}</p>
      <div className="wf-rail" data-rail={RAIL_ID} aria-label="Top tours nearby">
        {rows.slice(0, shown).map((item, index) => (
          <AffiliateCard key={item.code} item={item} rank={index + 1} contentId={contentId} onLogRef={onLogRef} />
        ))}
      </div>
      <RailDots railId={RAIL_ID} count={rows.length} layoutKey={shown >= rows.length ? 1 : 0} />
    </section>
  );
}
export { AffiliateCard };
