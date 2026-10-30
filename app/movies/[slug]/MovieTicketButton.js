"use client";
// Buy button on the Wayfind movie page. Same handoff as the rail card: our own /api/commerce/go
// href (never a partner URL), a click id minted at click time, and a commerce_cta_clicked event.
// The purchase itself happens at the partner.
import { useRef } from "react";

export default function MovieTicketButton({ href, label, movieId, provider, offerId, surface }) {
  const linkRef = useRef(null);
  if (!href) return null;
  const onClick = () => {
    import("../../../lib/commerce.js").then(({ commerceHref, emitCommerce, mintClickId }) => {
      try {
        const clickId = mintClickId();
        const live = commerceHref({ provider, offerId, surface, contentId: movieId, clickId });
        if (live && linkRef.current) linkRef.current.href = live;
        emitCommerce("commerce_cta_clicked", { surface, content_id: movieId, provider, merchant: "Undercover Tourist", offer_id: String(offerId), click_id: clickId, disclosure_version: "fall-intent-v2" });
      } catch {}
    }).catch(() => {});
  };
  return (
    <a ref={linkRef} href={href} onClick={onClick} rel="noreferrer sponsored" data-s22-autopilot="false" data-commerce-owner="MovieTicketButton"
      style={{ display: "block", textAlign: "center", background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 16, borderRadius: 12, padding: "14px 0", textDecoration: "none" }}>
      {label}
    </a>
  );
}
