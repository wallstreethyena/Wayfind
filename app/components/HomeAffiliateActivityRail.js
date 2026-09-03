"use client";

import ViatorCommerceLink from "./ViatorCommerceLink";
import RailCard, { RailDots, RailNav } from "./RailCard";
import { experienceWayfindScore } from "../../lib/experiencesData";
import { toDisplayScore } from "../../lib/score";

const RAIL_ID = "home-affiliate-activities";

export default function HomeAffiliateActivityRail({ items, contentId, onLog }) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return null;
  return (
    <section aria-labelledby="home-affiliate-activities-title" style={{ marginBottom: 18 }}>
      <div style={{ marginBottom: 7 }}>
        <h2 id="home-affiliate-activities-title" style={{ margin: 0, color: "#F8FAFC", fontSize: 18, fontWeight: 850, lineHeight: 1.2 }}>
          Best bookable activities
        </h2>
        <p style={{ margin: "4px 0 0", color: "#94A3B8", fontSize: 11.5, lineHeight: 1.4 }}>
          Wayfind&apos;s highest-ranked tours and experiences within 120 miles.
        </p>
      </div>
      <RailNav railId={RAIL_ID} count={rows.length} unit="ranked options" total={rows.length} />
      <div className="wf-rail" data-rail={RAIL_ID} aria-label="Best bookable activities">
        {rows.map((item, index) => {
          const rank = index + 1;
          const score = toDisplayScore(experienceWayfindScore(item));
          const facts = [
            item.city || null,
            Number(item.reviews) > 0 ? Number(item.reviews).toLocaleString() + " reviews" : null,
            item.duration || null,
            item.fromPrice != null ? "from $" + item.fromPrice : null,
          ].filter(Boolean);
          return (
            <RailCard
              key={item.code}
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
              actionsReadOnly
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
                    try { onLog?.("tickets_out", null, { kind: "home_affiliate_activity", code: item.code, rank, click_id: clickId }); } catch {}
                  }}
                  className="wf-place-card-book wf-rail-card-cta"
                  title="Partner link. Wayfind may earn a commission; rankings never change."
                >
                  Book with Viator ↗
                </ViatorCommerceLink>
              )}
            />
          );
        })}
      </div>
      <RailDots railId={RAIL_ID} count={rows.length} />
    </section>
  );
}
