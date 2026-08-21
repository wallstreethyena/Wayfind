"use client";
// "Book it" affiliate link for the place detail sheet — the Travelpayouts
// complement to BookingCTA (which owns Viator). SHIPS DARK: renders nothing
// unless ALL of these hold:
//   (a) NEXT_PUBLIC_BOOK_IT === "on"                (owner master switch, off by default)
//   (b) a Travelpayouts program is live             (its promo_id/campaign_id are set
//                                                     in lib/travelpayouts.js TP_PROGRAMS)
//   (c) the monetize engine finds a bookable match  (bookItTarget → a real provider+url)
//   (d) the match is kind "offer"                   (exact venue offer → /api/commerce/go)
//
// Founder P0 / CoS HIGH (2026-08-19): kind "search" used tpDeepLink (raw
// partner URL) and kind "offer" used preventDefault + window.open with
// click_id only on the event. Offer is now a native same-tab go anchor with
// click_id on the relative href. Search is fail-closed — do not invent a hop.
import { useRef, useEffect, useState } from "react";
import { C } from "./kit";
import { bookItTarget, SPONSOR_LABEL } from "../../lib/monetize";
import { TP_PROGRAMS, isTpProgramLive } from "../../lib/travelpayouts";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce";
import { withClickId, isEarningGoHref } from "../../lib/hubConversion";

// Inlined at build time (NEXT_PUBLIC_*). Unset → dark; owner sets "on" to enable.
const BOOK_IT_ON = process.env.NEXT_PUBLIC_BOOK_IT === "on";

export default function BookItLink({ detail, city, logEvent, addReservation }) {
  // Hooks for impression + click_id. Must be declared before any conditional
  // return so React's hook order stays stable across renders.
  const ref = useRef(null);
  const impressRef = useRef(false);
  const clickId = useRef(null);
  if (clickId.current === null) clickId.current = mintClickId();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  // EVERY GATE RESOLVES BEFORE ANY EXIT. The impression effect below is a hook,
  // and a hook behind a `return` changes React's hook count the moment the gate
  // flips — which unmounts the tree rather than warning (2026-08-21; see
  // scripts/check-hook-order.mjs). `detail` changes every time the sheet opens
  // on another place, so this gate flips constantly.
  const live = BOOK_IT_ON && detail ? Object.keys(TP_PROGRAMS).filter(isTpProgramLive) : [];
  const target = BOOK_IT_ON && detail ? bookItTarget(detail, { available: live, city }) : null;
  // kind "search" was tpDeepLink — a raw partner URL in the DOM. Fail-closed.
  // kind "offer" is the only earning path: /api/commerce/go, same-tab, stamped.
  const offer = target && target.kind === "offer" ? target : null;
  const detailId = detail ? detail.id || null : null;
  const baseHref = offer ? commerceHref({
    provider: offer.provider,
    offerId: offer.offerId,
    surface: "detail_book_it",
    contentId: detailId,
    clickId: hydrated ? clickId.current : undefined,
  }) : null;
  const earning = baseHref && isEarningGoHref(baseHref) ? baseHref : null;
  const provider = offer ? offer.provider : null;
  const href = earning ? (hydrated ? withClickId(earning, clickId.current) : earning) : null;
  const brand = offer ? ((TP_PROGRAMS[offer.provider] || {}).brand || offer.provider) : "";
  useEffect(() => {
    const el = ref.current;
    if (!el || !earning || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || e.intersectionRatio < 0.5 || impressRef.current) continue;
        impressRef.current = true;
        try {
          emitCommerce("commerce_impression", {
            surface: "detail_book_it",
            provider,
            offer_id: detailId || "unknown",
            city_id: city || null,
            canonical_place_id: detailId,
          });
        } catch (er) {}
        obs.disconnect();
      }
    }, { threshold: [0.5] });
    obs.observe(el);
    return () => { try { obs.disconnect(); } catch (er) {} };
  }, [provider, detailId, city, earning]);
  if (!earning) return null;
  return (
    <a
      ref={ref}
      href={href}
      rel="sponsored noreferrer"
      onClick={() => {
        try {
          emitCommerce("commerce_cta_clicked", {
            surface: "detail_book_it",
            provider,
            offer_id: detailId || "unknown",
            city_id: city || null,
            canonical_place_id: detailId,
            click_id: clickId.current,
          });
        } catch (er) {}
        try { if (logEvent) logEvent("book_it_out", detail, { provider, click_id: clickId.current }); } catch (er) {}
        try { if (addReservation) addReservation("book", detail, brand, href); } catch (er) {}
      }}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{SPONSOR_LABEL.text} · {brand} ↗</div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{SPONSOR_LABEL.sub}</div>
      </div>
    </a>
  );
}
