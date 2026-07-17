"use client";
// Booking-CTA integrity, Phase 3 (BOOKING_INTEGRITY_DIAGNOSIS.md). This is
// the ONLY component in the app allowed to turn a Viator tours/products
// payload into a clickable booking href. Every surface that shows a
// "Tickets & tours"-style CTA (the Detail sheet's primary action button,
// its commission disclosure line, its "Book tours & experiences" card list)
// renders through one of this component's variants — never inline. The
// hard invariant already lives server-side (lib/verifiedOffers.js,
// lib/bookingResolver.js): by the time `items` reaches this component,
// every entry has already cleared the default-deny gate. This component's
// job is just to refuse to render anything if that data is missing or
// empty — it must never construct a booking URL from raw/unverified input.
// scripts/check-booking-cta.mjs enforces both halves of this contract.
import { C } from "./kit";
import * as Aff from "../../lib/affiliates";

function hasVerifiedTours(viaTours, placeId) {
  const vt = viaTours && viaTours[placeId];
  return !!(vt && !vt.loading && Array.isArray(vt.items) && vt.items.length > 0);
}

// The bookable-place kinds that always warrant a booking action. Module-scope
// so the primary CTA and the commission disclosure derive from ONE source and
// can never drift — they did once, and an earning "Search Viator" rendered with
// NO disclosure (an FTC gap). scripts/test-sheet-booking.mjs keeps this list
// byte-identical to the card-chip + sheet tour-fetch gates.
const BOOKABLE_KINDS = ["museum", "wildlife", "entertainment", "scenic", "beach", "nature", "landmark", "waterfront"];

// The single predicate for "this place shows a monetized booking CTA." Returns
// the resolved hrefs; `tu` is truthy exactly when SOME earning link renders (a
// verified Viator product, the honest tracked Viator search for a bookable
// kind, or a Stay22 hotel link). The primary button AND the disclosure line
// both read this, so a commission link can never appear without its disclosure.
function bookingTargets(detail, kind, topItem, locName) {
  const bcity = (() => { try { const parts = String(detail.address || "").split(",").map((x) => x.trim()); return parts.length >= 3 ? parts[1] : (locName ? locName.split(",")[0] : ""); } catch (e) { return ""; } })();
  const verifiedUrl = (topItem && Aff.ticketsUrl(detail)) ? (Aff.viatorDirectUrl(topItem.url) || topItem.url) : null;
  const goFallback = (!verifiedUrl && BOOKABLE_KINDS.includes(kind)) ? Aff.experienceGoUrl(detail.name, bcity, kind, detail.id) : null;
  const tk = verifiedUrl || goFallback;
  const tu = tk || Aff.hotelUrl(detail);
  return { verifiedUrl, goFallback, tk, tu };
}

export default function BookingCTA({ variant, detail, kind, viaTours, logEvent, addReservation, openExternal, locName, suppressFallback }) {
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
    return (
      <a
        href={tu}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          e.preventDefault();
          const live = (e.currentTarget && e.currentTarget.href) || tu; // v4.81: Stay22 LinkSwap rewrites the anchor href in place — open the LIVE href, or hotel attribution is lost
          try { logEvent(tk ? "tickets_out" : "hotel_out", detail); } catch (er) {}
          try { if (verifiedUrl || !tk) addReservation(tk ? "tickets" : "hotel", detail, tk ? "Viator" : "Stay22", live); } catch (er) {} // search-fallback clicks are not reservations
          openExternal(live);
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = "#0D1117"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.accent; }}
        style={{ flex: 1, padding: "13px 0", background: "transparent", border: `1.5px solid ${C.accent}`, borderRadius: 12, color: C.accent, fontSize: 13.5, fontWeight: 800, textDecoration: "none", textAlign: "center", lineHeight: 1.15, transition: "background .15s ease, color .15s ease", cursor: "pointer" }}
      >
        {verifiedUrl ? "Tickets & tours ↗" : (goFallback ? "Search Viator ↗" : "Check rates ↗")}
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
    if (hasTours) {
      const items = viaTours[placeId].items;
      return (
        <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>🎟️ Book tours & experiences</span>
            <span style={{ fontSize: 9.5, color: C.muted }}>via Viator</span>
          </div>
          {items.map((t, i) => (
            <a
              key={t.code || i}
              href={t.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                const live = (e.currentTarget && e.currentTarget.href) || t.url;
                try { logEvent("tour_card_out", detail, { code: t.code || "" }); } catch (er) {}
                try { addReservation("tour", detail, "Viator", live); } catch (er) {}
                openExternal(live);
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
              <span style={{ color: C.accent, fontSize: 15, fontWeight: 800 }}>↗</span>
            </a>
          ))}
        </div>
      );
    }
    if (suppressFallback) return null;
    // No verified product for this place -- the honest fallback is a
    // tracked SEARCH page, never a guessed product. See lib/affiliates.js
    // experienceGoUrl and its server-side resolver (never fabricates a
    // "found a match" when nothing cleared the confidence bar).
    const fallbackHref = Aff.experienceGoUrl(detail.name, locName ? locName.split(",")[0] : "", kind, placeId);
    return (
      <a
        onClick={(e) => { e.preventDefault(); const live = (e.currentTarget && e.currentTarget.href) || fallbackHref; try { logEvent("tour", detail); } catch (er) {} openExternal(live); }}
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
        <span style={{ color: C.accent, fontSize: 16, fontWeight: 800 }}>↗</span>
      </a>
    );
  }

  return null;
}
