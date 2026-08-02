"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce";
import { resolvedIntentPartnerPicks } from "../../lib/intentPartnerPicks";
import { rankExperiences } from "../../lib/experiencesData";
import { couponsForIntent } from "../../lib/coupons";
import { dealScope } from "../../lib/dealSheet";
import { nearestMetro } from "../../lib/orderInFeatured";
import { clipCouponToWallet } from "../../lib/couponWallet";
import { C, PlaceScoreChip } from "./kit";

const disclosureVersion = "partner-rail-v2";

const DEAL_CATEGORIES = Object.freeze({
  "date-night": ["more"],
  family: ["attractions"],
  tonight: ["more"],
  "worth-the-drive": ["attractions"],
  "hidden-gems": [],
  budget: ["more", "attractions"],
  "best-of": ["attractions", "more"],
});

const dealImage = (deal) => deal?.image || (deal?.photoRef ? `/api/photo?ref=${encodeURIComponent(deal.photoRef)}&w=600` : "");
const evidenceScore = (pick) => {
  const explicit = Number(pick?.quality10 || 0);
  if (explicit > 0) return explicit;
  const rating = Number(pick?.rating || 0);
  const reviews = Number(pick?.reviews || 0);
  return rating > 0 && reviews > 0 ? (rating * 2) + Math.min(0.4, Math.log10(reviews + 1) / 10) : -1;
};

export default function IntentPartnerPick({ city, intent, inventory, accent = "#F97316", lat, lng, couponIntent, onOpenCoupons, onLog }) {
  const [networkDeals, setNetworkDeals] = useState([]);

  useEffect(() => {
    const categories = DEAL_CATEGORIES[intent] || [];
    if (!categories.length || !Number.isFinite(lat) || !Number.isFinite(lng)) { setNetworkDeals([]); return; }
    let dead = false;
    const geo = `&lat=${Number(lat).toFixed(3)}&lng=${Number(lng).toFixed(3)}`;
    Promise.all(categories.map((category) => fetch(`/api/deals?category=${encodeURIComponent(category)}${geo}`).then((response) => response.ok ? response.json() : null, () => null)))
      .then((payloads) => {
        if (dead) return;
        const rows = [];
        for (const payload of payloads) {
          for (const rail of (payload && Array.isArray(payload.rails) ? payload.rails : [])) {
            for (const deal of (Array.isArray(rail.items) ? rail.items : [])) {
              const image = dealImage(deal);
              if (!image) continue;
              rows.push({
                offerId: String(deal.id || ""), provider: deal.provider || "undercover_tourist",
                merchant: deal.providerLabel || "Undercover Tourist", eyebrow: deal.discount || deal.badge || rail.label || "Verified offer",
                title: deal.title, image, discount: deal.discount || "", badge: deal.badge || "",
                quality10: Number(deal.quality10 || 0) || 0, kind: "network-deal",
              });
            }
          }
        }
        setNetworkDeals(rows);
      });
    return () => { dead = true; };
  }, [intent, lat, lng]);

  const localCoupons = useMemo(() => {
    if (!couponIntent) return [];
    const known = Number.isFinite(lat) && Number.isFinite(lng);
    const metro = known ? nearestMetro(lat, lng) : null;
    return couponsForIntent(couponIntent).filter((coupon) => {
      if (!known) return true;
      const scope = dealScope(coupon);
      return scope.kind !== "metro" || scope.metro === metro;
    }).map((coupon) => ({
      offerId: coupon.id, provider: coupon.commerce?.provider || "clipp", merchant: coupon.business,
      eyebrow: coupon.badge || "Verified deal", title: coupon.title, image: coupon.image || "",
      discount: coupon.badge || "", coupon, kind: "coupon",
    })).filter((pick) => pick.image);
  }, [couponIntent, lat, lng]);

  const picks = useMemo(
    // One rail carries both the editor-curated products and the remaining
    // verified local inventory. The selector dedupes offer ids and titles;
    // the shared score ordering puts the strongest evidence first and leaves
    // unrated products after every score-bearing product.
    () => {
      const bookable = rankExperiences(resolvedIntentPartnerPicks(city, intent, inventory, 12));
      const seen = new Set();
      return [...bookable, ...networkDeals, ...localCoupons].filter((pick) => {
        const key = `${pick.provider}:${pick.offerId}`;
        if (!pick.image || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => evidenceScore(b) - evidenceScore(a));
    },
    [city, intent, inventory, networkDeals, localCoupons]
  );
  const rootRef = useRef(null);
  const railRef = useRef(null);
  const seenRef = useRef(new Set());

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollLeft = 0;
  }, [city, intent]);

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
      <div ref={railRef} aria-label={`Bookable highlights near ${city}`} style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorInline: "contain", scrollSnapType: "x proximity", paddingBottom: 4 }}>
        {picks.map((pick, index) => {
          const href = pick.kind === "coupon"
            ? `/coupons?view=clipped&focus=${encodeURIComponent(pick.offerId)}`
            : commerceHref({ provider: pick.provider, offerId: pick.offerId, surface: "intent_partner_rail", contentId: intent });
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
                if (pick.kind === "coupon") {
                  event.preventDefault();
                  const saved = typeof window !== "undefined" ? clipCouponToWallet(pick.coupon, window.localStorage) : { clipped: false };
                  try { onLog && onLog("coupon_strip_tap", null, { id: pick.offerId, theme: couponIntent, clipped: saved.clipped }); } catch {}
                  if (onOpenCoupons) onOpenCoupons(pick.coupon, { wallet: true, clipped: saved.clipped });
                  return;
                }
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
              <div data-bookable-card-media aria-hidden="true" style={{ position: "relative", height: 86, overflow: "hidden", borderBottom: `1px solid ${C.border}` }}>
                <img src={pick.image} alt="" loading="lazy" onError={(event) => { const card = event.currentTarget.closest("a"); if (card) card.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", objectFit: "cover" }} />
                <span data-partner-badge style={{ position: "absolute", top: 7, right: 7, zIndex: 1, padding: "3px 6px", borderRadius: 999, border: "1px solid rgba(255,255,255,.24)", background: "rgba(7,12,20,.82)", backdropFilter: "blur(8px)", color: "#fff", fontSize: 8.5, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap" }}>via {pick.merchant}</span>
              </div>
              <div style={{ padding: "8px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ color: accent, fontSize: 8.5, fontWeight: 850, letterSpacing: ".45px", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pick.eyebrow}</span>
                </div>
                <div style={{ color: C.text, fontSize: 12.5, lineHeight: 1.35, fontWeight: 750, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{pick.title}</div>
                {(pick.fromPrice || pick.duration || (pick.rating > 0 && pick.reviews > 0)) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
                    {pick.rating > 0 && pick.reviews > 0 ? <PlaceScoreChip p={{ rating: pick.rating, reviews: pick.reviews }} size={12} /> : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>Bookable</span>}
                    {pick.fromPrice || pick.duration || pick.discount ? <span style={{ color: pick.discount ? "#7DD3A8" : C.muted, fontSize: 11, fontWeight: pick.discount ? 800 : 400 }}>{pick.discount || (pick.fromPrice ? `from $${Math.round(pick.fromPrice)}` : "")}{pick.duration ? ` · ${pick.duration}` : ""}</span> : null}
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
