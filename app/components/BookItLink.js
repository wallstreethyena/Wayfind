"use client";
// "Book it" affiliate link for the place detail sheet — the Travelpayouts
// complement to BookingCTA (which owns Viator). SHIPS DARK: renders nothing
// unless ALL of these hold:
//   (a) NEXT_PUBLIC_BOOK_IT === "on"                (owner master switch, off by default)
//   (b) a Travelpayouts program is live             (its promo_id/campaign_id are set
//                                                     in lib/travelpayouts.js TP_PROGRAMS)
//   (c) the monetize engine finds a bookable match  (bookItTarget → a real provider+url)
//   (d) tpDeepLink builds a tracked, valid link     (null unless the program is live and
//                                                     the destination is a real absolute URL)
// So in production today it renders NOTHING — there are no live program ids yet.
// The decision logic is the pure bookItTarget() in lib/monetize.js, unit-tested by
// scripts/test-book-it.mjs; this component is a thin view over it (the same
// lib-decides / component-draws split as lib/score.js → the Wayfind Score badge).
// Every rendered link carries the required FTC disclosure (SPONSOR_LABEL) and
// rel="sponsored" so a monetized placement is always labeled, per lib/monetize.js §2.
import { useRef, useEffect } from "react";
import { C } from "./kit";
import { bookItTarget, SPONSOR_LABEL } from "../../lib/monetize";
import { TP_PROGRAMS, isTpProgramLive, tpDeepLink } from "../../lib/travelpayouts";
import { emitCommerce, mintClickId } from "../../lib/commerce";

// Inlined at build time (NEXT_PUBLIC_*). Unset → dark; owner sets "on" to enable.
const BOOK_IT_ON = process.env.NEXT_PUBLIC_BOOK_IT === "on";

export default function BookItLink({ detail, city, logEvent, openExternal, addReservation }) {
  // Hooks for impression measurement. Must be declared before any conditional
  // return so React's hook order stays stable across renders.
  const ref = useRef(null);
  const impressRef = useRef(false);

  if (!BOOK_IT_ON || !detail) return null;
  const live = Object.keys(TP_PROGRAMS).filter(isTpProgramLive);
  const target = bookItTarget(detail, { available: live, city });
  if (!target) return null;
  const href = tpDeepLink(target.provider, target.url, detail.id);
  if (!href) return null; // provider isn't a live TP program → nothing renders
  const brand = (TP_PROGRAMS[target.provider] || {}).brand || target.provider;
  const open = (u) => { try { (openExternal || ((x) => window.open(x, "_blank", "noopener")))(u); } catch (e) {} };
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || e.intersectionRatio < 0.5 || impressRef.current) continue;
        impressRef.current = true;
        try {
          emitCommerce("commerce_impression", {
            surface: "detail_book_it",
            provider: target.provider,
            offer_id: detail.id || "unknown",
            city_id: city || null,
            canonical_place_id: detail.id || null,
          });
        } catch (er) {}
        obs.disconnect();
      }
    }, { threshold: [0.5] });
    obs.observe(el);
    return () => { try { obs.disconnect(); } catch (er) {} };
  }, [target.provider, detail.id, city]);
  return (
    <a
      ref={ref}
      href={href}
      target="_blank"
      rel="sponsored noopener"
      onClick={(e) => {
        e.preventDefault();
        const liveHref = (e.currentTarget && e.currentTarget.href) || href;
        const clickId = mintClickId();
        try {
          emitCommerce("commerce_cta_clicked", {
            surface: "detail_book_it",
            provider: target.provider,
            offer_id: detail.id || "unknown",
            city_id: city || null,
            canonical_place_id: detail.id || null,
            click_id: clickId,
          });
        } catch (er) {}
        try { if (logEvent) logEvent("book_it_out", detail, { provider: target.provider, click_id: clickId }); } catch (er) {}
        // Capture the outbound booking tap in reservation history, like BookingCTA does.
        try { if (addReservation) addReservation("book", detail, brand, liveHref); } catch (er) {}
        open(liveHref);
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
