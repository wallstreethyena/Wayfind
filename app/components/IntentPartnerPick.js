"use client";

import { useEffect, useRef } from "react";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce";
import { resolvedIntentPartnerPick } from "../../lib/intentPartnerPicks";

export default function IntentPartnerPick({ city, intent, inventory, accent = "#F97316" }) {
  const pick = resolvedIntentPartnerPick(city, intent, inventory);
  const rootRef = useRef(null);
  const seenRef = useRef(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!pick || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5 || seenRef.current) continue;
        seenRef.current = true;
        const ctx = {
          surface: "intent_partner_pick",
          provider: pick.provider,
          merchant: pick.merchant,
          offer_id: pick.offerId,
          city_id: city,
          category: intent,
          content_id: intent,
          disclosure_version: "partner-pick-v1",
        };
        try { emitCommerce("commerce_impression", ctx); } catch {}
        try { emitCommerce("disclosure_viewed", ctx); } catch {}
        io.disconnect();
      }
    }, { threshold: [0.5] });
    io.observe(el);
    return () => { try { io.disconnect(); } catch {} };
  }, [pick, city, intent]);

  if (!pick) return null;
  const href = commerceHref({
    provider: pick.provider,
    offerId: pick.offerId,
    surface: "intent_partner_pick",
    contentId: intent,
  });
  if (!href) return null;

  return (
    <aside ref={rootRef} data-intent-partner-pick style={{
      margin: "14px 0 18px",
      padding: "16px",
      borderRadius: 18,
      border: `1px solid ${accent}66`,
      background: `linear-gradient(135deg, ${accent}20 0%, rgba(17,24,36,.98) 42%, rgba(10,15,24,.99) 100%)`,
      boxShadow: "0 16px 34px rgba(0,0,0,.22)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 9 }}>
        <span style={{ color: accent, fontSize: 10.5, fontWeight: 900, letterSpacing: "1.1px", textTransform: "uppercase" }}>🎟️ {pick.eyebrow}</span>
        <span style={{ color: "#8B949E", fontSize: 9.5, fontWeight: 750, whiteSpace: "nowrap" }}>via {pick.merchant}</span>
      </div>
      <div style={{ color: "#F8F5EE", fontSize: 20, lineHeight: 1.12, fontWeight: 900, letterSpacing: "-.25px" }}>{pick.title}</div>
      <p style={{ margin: "8px 0 13px", color: "#B6C0D2", fontSize: 13.5, lineHeight: 1.46 }}>{pick.reason}</p>
      <a
        href={href}
        target="_blank"
        rel="sponsored noopener"
        onClick={(e) => {
          const clickId = mintClickId();
          const clickHref = commerceHref({ provider: pick.provider, offerId: pick.offerId, surface: "intent_partner_pick", contentId: intent, clickId });
          if (clickHref && e.currentTarget) e.currentTarget.href = clickHref;
          try {
            emitCommerce("commerce_cta_clicked", {
              surface: "intent_partner_pick",
              provider: pick.provider,
              merchant: pick.merchant,
              offer_id: pick.offerId,
              city_id: city,
              category: intent,
              content_id: intent,
              click_id: clickId,
              disclosure_version: "partner-pick-v1",
            });
          } catch {}
        }}
        style={{ minHeight: 44, padding: "0 15px", borderRadius: 13, background: accent, color: "#101722", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13.5, fontWeight: 900 }}
      >
        {pick.cta} <span aria-hidden="true">↗</span>
      </a>
      <div style={{ marginTop: 9, color: "#7F8A9D", fontSize: 9.5, lineHeight: 1.35 }}>Partner link. Wayfind may earn a commission at no extra cost to you. It never changes our scores or rankings.</div>
    </aside>
  );
}
