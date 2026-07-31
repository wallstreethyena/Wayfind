"use client";
// Booking-CTA integrity, Phase 3 (BOOKING_INTEGRITY_DIAGNOSIS.md). This is
// the ONLY component in the app allowed to turn a Viator tours/products
// payload into a clickable booking href. Every surface that shows a
// "Tickets & tours"-style CTA (the Detail sheet's primary action button,
// its commission disclosure line, its "Viator options nearby" card list)
// renders through one of this component's variants — never inline. The
// hard invariant already lives server-side (lib/verifiedOffers.js,
// lib/bookingResolver.js): by the time `items` reaches this component,
// every entry has already cleared the default-deny gate. This component's
// job is just to refuse to render anything if that data is missing or
// empty — it must never construct a booking URL from raw/unverified input.
// scripts/check-booking-cta.mjs enforces both halves of this contract.
import { useRef, useEffect } from "react";
import { C } from "./kit";
import * as Aff from "../../lib/affiliates";
// v6.71 — the resolver moved DOWN to lib/bookingResolve.js so the SERVER-side
// guide pages can use the same predicate instead of calling Aff.* directly per
// pick (a parallel resolution path the booking-integrity contract forbids).
// Logic unchanged and lifted verbatim; this component's rendered output is
// byte-identical, proven in scripts/test-booking-resolve-extraction.mjs.
// hasBookingCTA is re-exported so existing importers (app/components/sheets/
// Detail.js) keep working untouched.
import { bookingTargets, hasBookingCTA, hasVerifiedTours } from "../../lib/bookingResolve";
import { emitCommerce, commerceHref, mintClickId, rankBucket } from "../../lib/commerce";
export { hasBookingCTA };

export default function BookingCTA({ variant, detail, kind, viaTours, logEvent, addReservation, openExternal, locName, suppressFallback, label: labelOverride, placeId: placeIdProp, city: cityProp }) {
  // Hooks for the list-variant impression observer. Must be declared before any
  // conditional return so React's hook order stays stable across renders.
  const listRootRef = useRef(null);
  const listSeenRef = useRef(new Set());

  if (!detail) return null;
  const placeId = detail.id;
  const hasTours = hasVerifiedTours(viaTours, placeId);
  const topItem = hasTours ? viaTours[placeId].items[0] : null;
  // One predicate drives both the primary earning CTA and its disclosure.
  const targets = bookingTargets(detail, kind, topItem, locName);

  if (variant === "primary") {
    // v6.42 (owner): a bookable-kind place ALWAYS offers a prominent booking
    // action. Verified product when one cleared the default-deny gate;
    // otherwise the SAME honest tracked-search href the list fallback uses
    // (the server may still resolve an exact product at click time — never a
    // guessed product link). Kinds identical to the card gate + the sheet's
    // tour-fetch gate; scripts/test-sheet-booking.mjs enforces the match.
    const { verifiedUrl, goFallback, tk, tu } = targets;
    if (!tu) return null;
    const primaryPlaceId = placeIdProp || detail.id || "unknown";
    const primaryCity = cityProp || (locName ? locName.split(",")[0] : "");
    const verifiedOfferId = topItem && (topItem.code || topItem.productCode);
    const primaryHref = (verifiedUrl && verifiedOfferId)
      ? commerceHref({ provider: "viator", offerId: verifiedOfferId, surface: "detail_primary", contentId: primaryCity })
      : tu;
    return (
      <a
        href={primaryHref}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          e.preventDefault();
          const clickId = mintClickId();
          const offerId = verifiedUrl
            ? (verifiedOfferId || primaryPlaceId)
            : primaryPlaceId;
          try {
            emitCommerce("commerce_cta_clicked", {
              surface: "detail_primary",
              provider: tk ? "viator" : "stay22",
              offer_id: offerId,
              city_id: primaryCity || null,
              canonical_place_id: detail.id || null,
              category: kind || null,
              click_id: clickId,
            });
          } catch (er) {}
          const live = (e.currentTarget && e.currentTarget.href) || primaryHref; // v4.81: Stay22 LinkSwap rewrites the anchor href in place — open the LIVE href, or hotel attribution is lost
          // If the href routes through our server redirect, stamp the same click_id
          // so provider_redirect_started echoes it deterministically.
          try {
            if (live && live.startsWith("/api/") && !live.includes("click_id=")) {
              const sep = live.includes("?") ? "&" : "?";
              e.currentTarget.href = live + sep + "click_id=" + encodeURIComponent(clickId);
            }
          } catch (er) {}
          try { logEvent(tk ? "tickets_out" : "hotel_out", detail, { click_id: clickId }); } catch (er) {}
          try { if (verifiedUrl || !tk) addReservation(tk ? "tickets" : "hotel", detail, tk ? "Viator" : "Stay22", live); } catch (er) {} // search-fallback clicks are not reservations
          openExternal(e.currentTarget.href || live);
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = "#0D1117"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.accent; }}
        style={{ flex: 1, minWidth: 0, minHeight: 48, padding: "0 14px", background: "linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.018))", border: `1px solid ${C.border}`, borderRadius: 14, color: C.light, fontSize: 13.5, fontWeight: 800, textDecoration: "none", lineHeight: 1.15, transition: "background .15s ease, color .15s ease", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap", boxSizing: "border-box" }}
      >
        <span>{labelOverride || (verifiedUrl ? "Tickets & tours" : (goFallback ? "Search Viator" : "Check rates"))}</span>
        <span aria-hidden="true" style={{ color: C.accent, fontSize: 16, lineHeight: 1 }}>↗</span>
      </a>
    );
  }

  if (variant === "disclosure") {
    // FTC: the disclosure renders whenever the primary CTA renders an earning
    // link — both gate on the SAME targets.tu, so a commission link can never
    // show undisclosed (previously this used a narrower gate that missed the
    // "Search Viator" tracked-search fallback — the dominant earning case).
    if (!targets.tu) return null;
    return <div style={{ fontSize: 10.5, color: C.muted, margin: "7px 2px 0", textAlign: "center" }}>Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings.</div>;
  }

  if (variant === "list") {
    const listPlaceId = placeIdProp || placeId || detail.id || "unknown";
    const listCity = cityProp || (locName ? locName.split(",")[0] : "");
    useEffect(() => {
      const root = listRootRef.current;
      if (!root || typeof IntersectionObserver === "undefined") return;
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = e.target.getAttribute("data-offer");
          const rank = e.target.getAttribute("data-rank");
          if (!id || listSeenRef.current.has(id)) continue;
          listSeenRef.current.add(id);
          try {
            emitCommerce("commerce_impression", {
              surface: "detail_tour_list",
              provider: "viator",
              offer_id: id,
              city_id: listCity || null,
              canonical_place_id: detail.id || null,
              category: kind || null,
              rank_bucket: rankBucket(Number(rank)),
            });
          } catch (er) {}
          io.unobserve(e.target);
        }
      }, { threshold: [0.5] });
      for (const el of root.querySelectorAll("[data-offer]")) io.observe(el);
      return () => { try { io.disconnect(); } catch (er) {} };
    }, [hasTours, listCity, detail.id, kind]);
    if (hasTours) {
      const items = viaTours[placeId].items;
      return (
        <div ref={listRootRef} style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            {/* v6.44 (owner's own words: "if there is viator activities list them
                as viator options near by"). The old header, "Book tours &
                experiences", named an action instead of naming the inventory —
                a visitor could not tell these were live Viator products for
                THIS place. Say what they are and who they come from. */}
            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.light, letterSpacing: "0.6px", textTransform: "uppercase" }}>🎟️ Viator options nearby</span>
            <span style={{ fontSize: 9.5, color: C.muted }}>via Viator</span>
          </div>
          {items.map((t, i) => {
          // v6.44 (owner: "the person clicks on the viator button, we need to
          // take them to the right place"). Every Viator list item now routes
          // through the server redirect layer (/api/commerce/go) using the
          // verified product code. The destination is resolved server-side from
          // wf_experiences; no partner URL is accepted from the request.
          const offerId = t.code || t.productCode;
          const href = offerId
            ? commerceHref({ provider: "viator", offerId, surface: "detail_tour_list", contentId: listCity })
            : (Aff.viatorDirectUrl(t.url) || t.url);
          return (
            <a
              key={offerId || i}
              data-offer={offerId || "unknown"}
              data-rank={i + 1}
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                const clickId = mintClickId();
                try {
                  emitCommerce("commerce_cta_clicked", {
                    surface: "detail_tour_list",
                    provider: "viator",
                    offer_id: offerId || "unknown",
                    city_id: listCity || null,
                    canonical_place_id: detail.id || null,
                    category: kind || null,
                    rank_bucket: rankBucket(i + 1),
                    click_id: clickId,
                  });
                } catch (er) {}
                const live = (e.currentTarget && e.currentTarget.href) || href;
                try {
                  if (live && live.startsWith("/api/") && !live.includes("click_id=")) {
                    const sep = live.includes("?") ? "&" : "?";
                    e.currentTarget.href = live + sep + "click_id=" + encodeURIComponent(clickId);
                  }
                } catch (er) {}
                try { logEvent("tour_card_out", detail, { code: t.code || "", click_id: clickId }); } catch (er) {}
                try { addReservation("tour", detail, "Viator", live); } catch (er) {}
                openExternal(e.currentTarget.href || live);
              }}
              style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "9px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}
            >
              {t.image ? <img src={t.image} alt="" style={{ width: 58, height: 58, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} /> : <span style={{ width: 58, height: 58, borderRadius: 10, background: C.adim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎟️</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
                  {t.rating != null && <span style={{ color: C.gold, fontWeight: 700 }}>★ {t.rating}</span>}{t.reviews != null && <span> ({t.reviews.toLocaleString()})</span>}{t.duration && <span> · {t.duration}</span>}{t.fromPrice != null && <span style={{ color: C.green, fontWeight: 700 }}> · from ${t.fromPrice}</span>}
                </div>
              </div>
              <span style={{ color: C.light, fontSize: 15, fontWeight: 800 }}>↗</span>
            </a>
          );
          })}
        </div>
      );
    }
    if (suppressFallback) return null;
    // No verified product for this place -- the honest fallback is a tracked
    // SEARCH page, never a guessed product. But ONLY for genuinely bookable
    // inventory: a beach/natural feature is gated out (the Coquina->Mumbai fix).
    if (!Aff.isTicketyPlace(detail)) return null;
    const fallbackHref = Aff.experienceGoUrl(detail.name, listCity, kind, listPlaceId);
    return (
      <div ref={listRootRef}>
      <a
        data-offer={listPlaceId}
        data-rank={1}
        onClick={(e) => {
          e.preventDefault();
          const clickId = mintClickId();
          try {
            emitCommerce("commerce_cta_clicked", {
              surface: "detail_tour_fallback",
              provider: "viator",
              offer_id: listPlaceId,
              city_id: listCity || null,
              canonical_place_id: detail.id || null,
              category: kind || null,
              click_id: clickId,
            });
          } catch (er) {}
          let live = (e.currentTarget && e.currentTarget.href) || fallbackHref;
          try {
            if (live && live.startsWith("/api/") && !live.includes("click_id=")) {
              const sep = live.includes("?") ? "&" : "?";
              live = live + sep + "click_id=" + encodeURIComponent(clickId);
              e.currentTarget.href = live;
            }
          } catch (er) {}
          try { logEvent("tour", detail, { click_id: clickId }); } catch (er) {}
          openExternal(live);
        }}
        href={fallbackHref}
        target="_blank"
        rel="sponsored noopener"
        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}
      >
        <span style={{ fontSize: 18 }}>🔎</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Search Viator ↗</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>No verified product for this place — search Viator for tickets &amp; tours nearby</div>
        </div>
        <span style={{ color: C.light, fontSize: 16, fontWeight: 800 }}>↗</span>
      </a>
      </div>
    );
  }

  return null;
}
