"use client";

import { useEffect, useMemo, useRef } from "react";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce";
import { resolvedIntentPartnerPicks } from "../../lib/intentPartnerPicks";

const disclosureVersion = "partner-rail-v2";

export default function IntentPartnerPick({ city, intent, inventory, accent = "#F97316" }) {
  const picks = useMemo(
    () => resolvedIntentPartnerPicks(city, intent, inventory, 4),
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
    <aside ref={rootRef} data-intent-partner-pick data-intent-partner-rail style={{ margin: "14px 0 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "0 2px 9px" }}>
        <span style={{ color: "#D6DEEC", fontSize: 12, fontWeight: 900, letterSpacing: ".75px", textTransform: "uppercase" }}>Bookable around {city}</span>
        <span style={{ color: "#788398", fontSize: 9.5, fontWeight: 750, whiteSpace: "nowrap" }}>Local partner picks</span>
      </div>
      <div aria-label={`Bookable experiences around ${city}`} style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorInline: "contain", scrollSnapType: "x proximity", padding: "1px 2px 7px" }}>
        {picks.map((pick) => {
          const href = commerceHref({ provider: pick.provider, offerId: pick.offerId, surface: "intent_partner_rail", contentId: intent });
          if (!href) return null;
          return (
            <article key={pick.offerId} data-offer-id={pick.offerId} style={{ flex: "0 0 min(82vw, 318px)", minHeight: 290, scrollSnapAlign: "start", borderRadius: 18, overflow: "hidden", border: `1px solid ${accent}5C`, background: `linear-gradient(145deg, ${accent}18 0%, rgba(18,27,42,.99) 38%, rgba(10,15,24,.99) 100%)`, boxShadow: "0 14px 30px rgba(0,0,0,.2)", display: "flex", flexDirection: "column" }}>
              {pick.image ? (
                <div style={{ position: "relative", height: 118, overflow: "hidden", background: "#101722" }}>
                  <img src={pick.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.parentElement.style.display = "none"; }} style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(8,12,19,.05),rgba(8,12,19,.62))" }} />
                </div>
              ) : null}
              <div style={{ padding: "14px", display: "flex", flex: 1, flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
                  <span style={{ color: accent, fontSize: 10, fontWeight: 900, letterSpacing: "1px", textTransform: "uppercase" }}>🎟️ {pick.eyebrow}</span>
                  <span style={{ color: "#8490A4", fontSize: 9.5, fontWeight: 750, whiteSpace: "nowrap" }}>via {pick.merchant}</span>
                </div>
                <div style={{ color: "#F8F5EE", fontSize: 18, lineHeight: 1.16, fontWeight: 900, letterSpacing: "-.2px" }}>{pick.title}</div>
                {(pick.fromPrice || pick.duration || (pick.rating > 0 && pick.reviews > 0)) ? (
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 7, color: "#9FAABE", fontSize: 11.5, fontWeight: 750 }}>
                    {pick.rating > 0 && pick.reviews > 0 ? <span style={{ color: "#31D98B" }}>★ {pick.rating.toFixed(1)} · {pick.reviews.toLocaleString()} reviews</span> : null}
                    {pick.fromPrice ? <span>from ${Math.round(pick.fromPrice)}</span> : null}
                    {pick.duration ? <span>{pick.duration}</span> : null}
                  </div>
                ) : null}
                <p style={{ margin: "8px 0 13px", color: "#B7C1D3", fontSize: 12.5, lineHeight: 1.43, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{pick.reason}</p>
                <a
                  href={href}
                  target="_blank"
                  rel="sponsored noopener"
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
                  style={{ marginTop: "auto", minHeight: 42, padding: "0 14px", borderRadius: 12, background: accent, color: "#101722", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 900 }}
                >
                  {pick.cta} <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
          );
        })}
      </div>
      <div style={{ margin: "2px 3px 0", color: "#7F8A9D", fontSize: 9.5, lineHeight: 1.4 }}>Partner links. Wayfind may earn a commission at no extra cost to you. It never changes our scores or rankings.</div>
    </aside>
  );
}
