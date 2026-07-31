"use client";
// TrackedOfferLink — the per-item "See related tours & tickets" link on
// /culture/[metro], which has been a monetized click going out UNMEASURED.
//
// The culture page renders one of these per `c.do` item and each is a real
// earning link (Viator, affiliate-attributed). None of them emitted anything, so
// the money funnel had no idea they existed: culture pages measured 0.0
// engagement events per session across 30 days while shipping live partner CTAs.
//
// This is a link, not a button, and it keeps its own href — the anchor's native
// navigation is untouched so cmd-click, middle-click, "open in new tab" and
// keyboard activation all behave exactly as before. The handler only measures.
//
// Payload construction lives in lib/hubConversion so the guard can call the same
// builders the component does; see that file for why the money events rename
// city -> city_id, cta_variant -> variant and coarsen position -> rank_bucket.
import { useEffect, useRef, useState } from "react";
import { track } from "../../lib/track";
import { emitCommerce } from "../../lib/commerce";
import { hubProductProps, hubCommerceProps, mintClickId, withClickId } from "../../lib/hubConversion";

export default function TrackedOfferLink({
  href, label, surface, slugKey, slug, city, category, provider, offerId, variant, position, style,
}) {
  const ref = useRef(null);
  const seen = useRef(false);
  const clicked = useRef(false);
  const clickId = useRef(null);
  if (clickId.current === null) clickId.current = mintClickId();
  // The cid is appended only after hydration: the id is minted per client
  // render, so baking it into the SSR href would be a hydration mismatch.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const finalHref = hydrated ? withClickId(href, clickId.current) : href;

  const args = () => ({
    clickId: clickId.current, slugKey, slug, surface,
    provider, offerId, position, variant, city, category,
  });

  // Viewability-gated, once per link. A render-time impression would count every
  // item on a long page as seen and make the click rate meaningless.
  useEffect(() => {
    if (!href || !ref.current || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        if (seen.current) continue; // once per link per view
        seen.current = true;
        try { track("guide_cta_impression", hubProductProps(args())); } catch (err) {}
        try { emitCommerce("commerce_impression", hubCommerceProps(args())); } catch (err) {}
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);

  if (!href) return null;

  return (
    <a
      ref={ref}
      href={finalHref}
      target="_blank"
      rel="noreferrer sponsored"
      style={style}
      onClick={() => {
        if (clicked.current) return; // one click per link per view
        clicked.current = true;
        try { track("guide_cta_clicked", hubProductProps(args())); } catch (e) {}
        try { emitCommerce("commerce_cta_clicked", hubCommerceProps(args())); } catch (e) {}
        // Deliberately NOT preventDefault: the anchor's own navigation carries
        // the user to the partner. Hijacking it would break cmd-click and put a
        // measurement failure in the path of a revenue click.
      }}
    >
      {label}
    </a>
  );
}
