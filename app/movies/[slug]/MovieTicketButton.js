"use client";
// Buy button on the Wayfind movie page. Same handoff as the rail card: our own /api/commerce/go
// href (never a partner URL), a click id minted at click time, and a commerce_cta_clicked event.
// The purchase itself happens at the partner.
import { commerceHref, emitCommerce, mintClickId } from "../../../lib/commerce.js";

export default function MovieTicketButton({ href, label, movieId, provider, merchant, offerId, surface }) {
  if (!href) return null;
  const onClick = (event) => {
    try {
      const clickId = mintClickId();
      const live = commerceHref({ provider, offerId, surface, contentId: movieId, clickId });
      if (live) event.currentTarget.href = live;
      emitCommerce("commerce_cta_clicked", { surface, content_id: movieId, provider, merchant, offer_id: String(offerId), click_id: clickId, disclosure_version: "fall-intent-v2" });
    } catch {}
  };
  return (
    <a href={href} onClick={onClick} rel="noreferrer sponsored" data-s22-autopilot="false" data-commerce-owner="MovieTicketButton"
      style={{ display: "block", textAlign: "center", background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 16, borderRadius: 12, padding: "14px 0", textDecoration: "none" }}>
      {label}
    </a>
  );
}
