"use client";

import { useEffect, useMemo, useRef } from "react";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce";
import { resolvedIntentPartnerPicks } from "../../lib/intentPartnerPicks";
import { rankExperiences } from "../../lib/experiencesData";
import { C, PlaceScoreChip } from "./kit";

const disclosureVersion = "partner-rail-v2";

export default function IntentPartnerPick({ city, intent, inventory, accent = "#F97316" }) {
  const picks = useMemo(
    // One rail carries both the editor-curated products and the remaining
    // verified local inventory. The selector dedupes offer ids and titles;
    // the shared score ordering puts the strongest evidence first and leaves
    // unrated products after every score-bearing product.
    () => rankExperiences(resolvedIntentPartnerPicks(city, intent, inventory, 12)),
    [city, intent, inventory]
  );
  const rootRef = useRef(null);
  const seenRef = useRef(new Set());

  useEffect(() => {
    const root = rootRef.current;
    if (!picks.length || !root || typeof IntersectionObserver === "undefined") return;
    const byId = new Map(picks.map((pick) => [pick.offerId, pick]));
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const offerId = entry.target?.getAttribute?.("data-offer-id") || "";
        const pick = byId.get(offerId);
        if (!pick || !entry.isIntersecting || entry.intersectionRatio < 0.5 || seenRef.current.has(offerId)) continue;
        seenRef.current.add(offerId);
        const ctx = {
          surface: "intent_partner_rail",
          provider: pick.provider,
          merchant: pick.merchant,
          offer_id: pick.offerId,
          city_id: city,
          category: intent,
          content_id: intent,
          disclosure_version: disclosureVersion,
        };
        try { emitCommerce("commerce_impression", ctx); } catch {}
        try { emitCommerce("disclosure_viewed", ctx); } catch {}
        try { io.unobserve(entry.target); } catch {}
      }
    }, { threshold: [0.5] });
    root.querySelectorAll("[data-offer-id]").forEach((card) => io.observe(card));
    return () => { try { io.disconnect(); } catch {} };
  }, [picks, city, intent]);

  if (!picks.length) return null;

  return (
    <aside ref={rootRef} data-intent-partner-pick data-intent-partner-rail style={{ margin: "4px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <span style={{ color: C.muted, fontSize: 12, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase" }}>Bookable highlights near {city}</span>
        <span style={{ color: C.muted, fontSize: 9.5, whiteSpace: "nowrap" }}>Verified partners</span>
      </div>
      <div aria-label={`Bookable highlights near ${city}`} style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorInline: "contain", scrollSnapType: "x proximity", paddingBottom: 4 }}>
        {picks.map((pick, index) => {
          const href = commerceHref({ provider: pick.provider, offerId: pick.offerId, surface: "intent_partner_rail", contentId: intent });
          if (!href) return null;
          return (
            <a
              key={pick.offerId}
              data-offer-id={pick.offerId}
              data-rank={index + 1}
              href={href}
              target="_blank"
              rel="sponsored noopener nofollow"
              onClick={(event) => {
                const clickId = mintClickId();
                const clickHref = commerceHref({ provider: pick.provider, offerId: pick.offerId, surface: "intent_partner_rail", contentId: intent, clickId });
                if (clickHref && event.currentTarget) event.currentTarget.href = clickHref;
                try {
                  emitCommerce("commerce_cta_clicked", {
                    surface: "intent_partner_rail",
                    provider: pick.provider,
                    merchant: pick.merchant,
                    offer_id: pick.offerId,
                    city_id: city,
                    category: intent,
                    content_id: intent,
                    click_id: clickId,
                    disclosure_version: disclosureVersion,
                  });
                } catch {}
              }}
              style={{ flex: "0 0 200px", scrollSnapAlign: "start", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, background: C.card, color: "inherit", textDecoration: "none" }}
            >
              {/* Do not substitute unrelated stock photography. The branded
                  panel sits beneath verified product art, so a missing or
                  failed image keeps the same compact image-card rhythm. */}
              <div data-bookable-card-media aria-hidden="true" style={{ position: "relative", height: 86, overflow: "hidden", display: "grid", placeItems: "center", background: `radial-gradient(circle at 72% 18%, ${accent}45, transparent 42%), linear-gradient(145deg, ${accent}26, #111A27 62%, #0B111B)`, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.text, fontSize: 10, fontWeight: 850, letterSpacing: "1.2px", textTransform: "uppercase", opacity: .82 }}>Wayfind bookable</span>
                {pick.image ? <img src={pick.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", objectFit: "cover" }} /> : null}
              </div>
              <div style={{ padding: "8px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 3 }}>
                  <span style={{ color: accent, fontSize: 8.5, fontWeight: 850, letterSpacing: ".45px", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pick.eyebrow}</span>
                  <span style={{ color: C.muted, fontSize: 8, whiteSpace: "nowrap" }}>via {pick.merchant}</span>
                </div>
                <div style={{ color: C.text, fontSize: 12.5, lineHeight: 1.35, fontWeight: 750, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{pick.title}</div>
                {(pick.fromPrice || pick.duration || (pick.rating > 0 && pick.reviews > 0)) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
                    {pick.rating > 0 && pick.reviews > 0 ? <PlaceScoreChip p={{ rating: pick.rating, reviews: pick.reviews }} size={12} /> : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>Bookable</span>}
                    {pick.fromPrice || pick.duration ? <span style={{ color: C.muted, fontSize: 11 }}>{pick.fromPrice ? `from $${Math.round(pick.fromPrice)}` : ""}{pick.duration ? ` · ${pick.duration}` : ""}</span> : null}
                  </div>
                ) : null}
              </div>
            </a>
          );
        })}
      </div>
      <div style={{ color: C.muted, fontSize: 10, marginTop: 7, lineHeight: 1.4 }}>Wayfind may earn a commission when you book through these links, at no extra cost to you. It never changes our scores or rankings.</div>
    </aside>
  );
}
