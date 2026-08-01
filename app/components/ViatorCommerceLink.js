"use client";
// ViatorCommerceLink — a tracked Viator card/book link that routes through the
// server redirect layer so every click produces:
//   commerce_impression (viewability-gated, once per offer)
//   commerce_cta_clicked  (with click_id)
//   provider_redirect_started (server-side, echoing click_id)
//
// WHY THIS COMPONENT EXISTS
// Home.js and ThingsToDoList.js were rendering direct Viator URLs built by
// Aff.viatorDirectUrl(). The clicks emitted legacy `tickets_out` but never
// touched a server redirect, so `provider_redirect_started` was silent and the
// click could not be tied back to a card. This wrapper replaces those direct
// anchors without changing their visual shape.
//
// TWO REDIRECT PATHS, ONE COMPONENT
//   • /api/commerce/go?provider=viator&offer=<product_code>  — preferred, when
//     the caller already knows the exact Viator product code (wf_experiences).
//   • /api/viator/go?placeId=...&q=...                       — search fallback
//     for surfaces that only have a title/booking_url and need server-side
//     resolution. The destination is still resolved server-side; no partner URL
//     is accepted from the request.
//
// SECURITY: the UI never constructs a partner URL. Offer codes are looked up in
// our own table; search fallbacks are resolved by the server-side booking
// resolver. The redirect layer applies the host allowlist and tracking before
// the browser ever leaves our origin.
import { useRef, useEffect } from "react";
import { emitCommerce, commerceHref, mintClickId, rankBucket } from "../../lib/commerce";
import { experienceGoUrl } from "../../lib/affiliates";

function viatorSearchHref({ placeId, q, city, kind, surface, contentId }) {
  if (!placeId || !q) return null;
  return experienceGoUrl(q, city, kind, placeId, { surface, contentId });
}

export default function ViatorCommerceLink({
  t,
  placeId,
  q,
  city,
  kind,
  surface,
  contentId,
  rank,
  children,
  className,
  style,
  onClick,
  ...props
}) {
  const offerId = t && (t.code || t.productCode || t.product_code);
  const resolvedPlaceId = placeId || (t && (t.placeId || t.id));
  const resolvedQ = q || (t && (t.title || t.name));
  const resolvedCity = city || contentId;
  const resolvedKind = kind;

  const mode = offerId ? "commerce" : (resolvedPlaceId && resolvedQ) ? "search" : null;
  const offerLabel = offerId || resolvedPlaceId || "unknown";

  const ref = useRef(null);
  const seenRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || seenRef.current) continue;
        seenRef.current = true;
        try {
          emitCommerce("commerce_impression", {
            surface,
            content_id: contentId || null,
            provider: "viator",
            merchant: "Viator",
            category: "tours",
            offer_id: offerLabel,
            rank_bucket: rankBucket(rank),
          });
        } catch (er) {}
        io.disconnect();
      }
    }, { threshold: [0.5] });
    io.observe(el);
    return () => { try { io.disconnect(); } catch (er) {} };
  }, [surface, contentId, offerLabel, rank]);

  const href = mode === "commerce"
    ? commerceHref({ provider: "viator", offerId, surface, contentId })
    : mode === "search"
    ? viatorSearchHref({ placeId: resolvedPlaceId, q: resolvedQ, city: resolvedCity, kind: resolvedKind, surface, contentId })
    : null;
  if (!href) return children;

  return (
    <a
      ref={ref}
      href={href}
      data-offer={offerLabel}
      data-rank={rank}
      target="_blank"
      rel="noopener sponsored nofollow"
      onClick={(e) => {
        const clickId = mintClickId();
        try {
          emitCommerce("commerce_cta_clicked", {
            surface,
            content_id: contentId || null,
            provider: "viator",
            merchant: "Viator",
            category: "tours",
            offer_id: offerLabel,
            rank_bucket: rankBucket(rank),
            click_id: clickId,
          });
        } catch (er) {}
        try {
          const a = e.currentTarget;
          const sep = a.href.includes("?") ? "&" : "?";
          a.href = a.href + sep + "click_id=" + encodeURIComponent(clickId);
        } catch (er) {}
        if (onClick) onClick(e, clickId);
      }}
      className={className}
      style={style}
      {...props}
    >
      {children}
    </a>
  );
}
