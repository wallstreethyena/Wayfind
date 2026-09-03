"use client";

import ViatorCommerceLink from "./ViatorCommerceLink";
import { RailDots, RailNav } from "./RailCard";
import { WayfindScoreBadge } from "./kit";
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
            <ViatorCommerceLink
              key={item.code}
              t={item}
              surface="home_affiliate_activity_rail"
              contentId={contentId}
              rank={rank}
              onClick={(event, clickId) => {
                try { onLog?.("tickets_out", null, { kind: "home_affiliate_activity", code: item.code, rank, click_id: clickId }); } catch {}
              }}
              className="wf-place-card wf-rail-card is-no-take"
              aria-label={`Book ${item.title} with Viator`}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              <div className="wf-place-card-score"><WayfindScoreBadge score={score} staticRoot /></div>
              <div className="wf-place-card-layout">
                <div className="wf-place-card-media">
                  <img src={item.image} alt="" loading={rank <= 4 ? "eager" : "lazy"} decoding="async" style={{ objectFit: "cover" }} />
                  <span className="wf-place-card-rank" aria-label={`Rank ${rank}`}>{rank}</span>
                </div>
                <div className="wf-place-card-content" style={{ position: "relative" }}>
                  <div className="wf-place-card-title-row" style={{ display: "flex", alignItems: "flex-start" }}>
                    <div className="wf-place-card-heading">
                      <span className="wf-place-card-category">Bookable activity</span>
                      <span className="wf-place-card-name" style={{ display: "block" }}>{item.title}</span>
                    </div>
                  </div>
                  <div className="wf-place-card-meta" style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                    {facts.map((fact) => <span key={fact}>{fact}</span>)}
                  </div>
                  <div className="wf-place-card-highlights-wrap">
                    <div className="wf-place-card-highlights">
                      {item.sellingOut ? <span>🔥 Selling out</span> : null}
                      {(item.chips || []).map((chip) => <span key={chip.key}>{chip.icon} {chip.label}</span>)}
                    </div>
                  </div>
                  <div className="wf-place-card-actions wf-sheet-card-actions">
                    <span className="wf-place-card-book" title="Partner link. Wayfind may earn a commission; rankings never change.">
                      Book with Viator ↗
                    </span>
                  </div>
                </div>
              </div>
            </ViatorCommerceLink>
          );
        })}
      </div>
      <RailDots railId={RAIL_ID} count={rows.length} />
    </section>
  );
}
