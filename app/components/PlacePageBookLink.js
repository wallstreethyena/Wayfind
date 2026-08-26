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

export default function PlacePageBookLink({ provider, offerId, contentId, merchant, style }) {
  const clickId = useRef(null);
  if (clickId.current === null) clickId.current = mintClickId();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const base = commerceHref({ provider, offerId, surface: "place_page", contentId });
  if (!base) return null;
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
