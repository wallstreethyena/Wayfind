"use client";
// Client island for the static /places/[id] Book CTA.
//
// PlacePage is a server renderer (ISR, revalidate 86400). Baking a click_id
// into that HTML would share one id across every visitor. The island paints
// the same go URL on SSR, then stamps a client-minted click_id after
// hydration so a human same-tab hop joins provider_redirect_started.

import { useEffect, useRef, useState } from "react";
import { emitCommerce, mintClickId, placePageBookHref, commerceHref } from "../../lib/commerce";
import { withClickId } from "../../lib/hubConversion";
import { usePinQuarantine } from "../../lib/pinQuarantine";

export default function PlacePageBookLink({ provider, offerId, contentId, merchant, style }) {
  const clickId = useRef(null);
  if (clickId.current === null) clickId.current = mintClickId();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  // LIVE QUARANTINE (2026-09-10). PlacePage is an ISR server render with
  // revalidate 86400, so its own copy of the pin verdict can be a day old — a
  // product that died this morning would keep its Book button here until
  // tomorrow. This island is the part that runs in the reader's browser, so the
  // live check belongs here rather than in the server renderer, where it would
  // also mean a Supabase read inside every static place page build.
  const pinQ = usePinQuarantine();

  const base = commerceHref({ provider, offerId, surface: "place_page", contentId });
  if (!base) return null;
  // Named dead by the live feed -> no CTA at all. Never a disabled-looking link:
  // a Book button that cannot book is the defect, not the fix.
  if (provider === "viator" && pinQ.quarantined(offerId)) return null;
  const href = hydrated
    ? (placePageBookHref({ provider, offerId, contentId, clickId: clickId.current }) || withClickId(base, clickId.current))
    : base;

  return (
    <a
      href={href}
      rel="sponsored noreferrer"
      onClick={() => {
        try {
          emitCommerce("commerce_cta_clicked", {
            surface: "place_page",
            provider,
            offer_id: offerId,
            content_id: contentId,
            click_id: clickId.current,
            disclosure_version: "partner-place-v1",
          });
        } catch (e) {}
      }}
      style={style}
    >
      Tickets · {merchant} ↗
    </a>
  );
}
