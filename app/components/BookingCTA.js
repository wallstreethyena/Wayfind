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
export { hasBookingCTA };

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
        style={{ flex: 1, minWidth: 0, minHeight: 48, padding: "0 14px", background: "linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.018))", border: `1px solid ${C.border}`, borderRadius: 14, color: C.light, fontSize: 13.5, fontWeight: 800, textDecoration: "none", lineHeight: 1.15, transition: "background .15s ease, color .15s ease", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap", boxSizing: "border-box" }}
      >
        <span>{verifiedUrl ? "Tickets & tours" : (goFallback ? "Search Viator" : "Check rates")}</span>
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
    if (hasTours) {
      const items = viaTours[placeId].items;
      return (
        <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
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
          // take them to the right place"). This was the ONLY Viator surface in
          // the app rendering a RAW `t.url` — the primary variant above (:36),
          // home.js (3 sites) and ThingsToDoList.js all wrap with
          // viatorDirectUrl(). So the highest-intent click in the product, on a
          // named product card, was the one click that carried no partner
          // attribution: it still reached Viator, but as an anonymous visit, so
          // the booking earned nothing. viatorDirectUrl returns null for any
          // non-www.viator.com host (hence the `|| t.url` fallback — behavior
          // never regresses) and withViatorTracking dedupes `pid`, so this is
          // safe and idempotent even if the server already attributed the URL.
          const href = Aff.viatorDirectUrl(t.url) || t.url;
          return (
            <a
              key={t.code || i}
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                const live = (e.currentTarget && e.currentTarget.href) || href;
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
        <span style={{ color: C.light, fontSize: 16, fontWeight: 800 }}>↗</span>
      </a>
    );
  }

  return null;
}
