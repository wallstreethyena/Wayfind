"use client";
// Treatment arm of "guide-inline-book-v1" (see lib/guideInlineBook.js for the
// evidence, the exact change and the honesty rules). Renders NOTHING on the
// server and nothing in the control arm except an invisible exposure sentinel,
// so the indexed HTML and the control experience are unchanged.
//
// Events (all go through the sanctioned client paths):
//   guide_experiment_exposed  pick 1 scrolled into view, BOTH arms, once per
//                             page view — the denominator for every metric
//   $feature/guide-inline-book-v1  super property, so page_exit scroll depth,
//                             element_click (place taps) and $pageview split by arm
//   commerce_impression       the inline offer was actually on screen (emitCommerce)
//   commerce_cta_clicked      the inline offer was tapped (emitCommerce ONLY — one
//                             click, one commerce event)
//   guide_pick_book_clicked   product-side twin of the tap, with the pick number
import { useEffect, useRef, useState } from "react";
import { captureOrQueue } from "../../../lib/browserAnalytics";
import { commerceHref, emitCommerce, mintClickId } from "../../../lib/commerce";
import { experimentId, looksAutomated } from "../../../lib/experiment";
import {
  GUIDE_INLINE_BOOK_FEATURE_PROP, GUIDE_INLINE_BOOK_KEY,
  chooseInlineOffer, inlineBookConfig, inlineBookVariant,
} from "../../../lib/guideInlineBook";

const SURFACE = "guide_pick_inline";
const DISCLOSURE_VERSION = "guide-pick-inline-v1";

function registerVariant(variant) {
  if (typeof window === "undefined") return;
  let tries = 0;
  const attempt = () => {
    const ph = window.posthog;
    if (ph && typeof ph.register === "function") {
      try { ph.register({ [GUIDE_INLINE_BOOK_FEATURE_PROP]: variant }); } catch (e) {}
      return;
    }
    if (++tries < 20) setTimeout(attempt, 500); // PostHog boots at idle (<= ~4 s)
  };
  attempt();
}

/** The commerce context for the inline offer (CONTEXT_FIELDS only). */
export function inlineOfferContext(offer, slug, city) {
  return offer ? {
    surface: SURFACE, provider: offer.provider, offer_id: offer.offerId, city_id: city,
    category: "tour", content_id: slug, experiment_id: GUIDE_INLINE_BOOK_KEY, variant: "treatment",
    disclosure_version: DISCLOSURE_VERSION,
  } : null;
}

/**
 * One tap on the inline offer: mint the click id, point the anchor at OUR
 * redirect with it, and record exactly ONE commerce_cta_clicked (emitCommerce)
 * plus the product-side guide_pick_book_clicked. Returns the href it set.
 */
export function onInlineOfferClick({ offer, slug, pickIndex, city, anchor, win }) {
  const clickId = mintClickId();
  const href = commerceHref({ provider: offer.provider, offerId: offer.offerId, surface: SURFACE, contentId: slug, clickId });
  if (href && anchor) anchor.href = href;
  try { emitCommerce("commerce_cta_clicked", { ...inlineOfferContext(offer, slug, city), click_id: clickId }); } catch (e) {}
  captureOrQueue(win || (typeof window !== "undefined" ? window : null), "guide_pick_book_clicked", { experiment: GUIDE_INLINE_BOOK_KEY, variant: "treatment", slug, pick: pickIndex + 1, offer_id: offer.offerId, from_price: offer.fromPrice });
  return href;
}

/** Pure view. SSR and the control arm get the sentinel only. */
export function GuidePickDecisionView({ config, variant, offer, slug, pickIndex, sentinelRef, offerRef }) {
  const marker = <span ref={sentinelRef} aria-hidden="true" data-guide-exp-sentinel={pickIndex + 1} style={{ display: "block", height: 1 }} />;
  if (!config || variant !== "treatment") return marker;
  const facts = offer ? [offer.duration, `★ ${offer.rating.toFixed(1)} (${offer.reviews.toLocaleString("en-US")})`, `from $${offer.fromPrice}`].filter(Boolean).join(" · ") : "";
  return (
    <>
      {marker}
      <div className="wf-guide-decision" data-guide-exp={GUIDE_INLINE_BOOK_KEY} style={{ margin: "4px 0 14px" }}>
        {config.bestFor ? (
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.45, color: "#E2E8F0" }}>
            <strong style={{ color: "#FDBA74" }}>Best for:</strong> {config.bestFor}
          </p>
        ) : null}
        {offer && config.book ? (
          <a
            ref={offerRef}
            href={commerceHref({ provider: offer.provider, offerId: offer.offerId, surface: SURFACE, contentId: slug })}
            data-commerce-owner="GuidePickDecision"
            data-offer-id={offer.offerId}
            target="_blank"
            rel="sponsored noopener nofollow"
            onClick={(event) => onInlineOfferClick({ offer, slug, pickIndex, city: config.city, anchor: event && event.currentTarget })}
            style={{ display: "block", padding: "12px 14px", borderRadius: 14, border: "1px solid #F97316", background: "#141c27", color: "#F4F6F8", textDecoration: "none" }}
          >
            <span style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: "#FDBA74" }}>{config.book.heading} ↗</span>
            <span style={{ display: "block", marginTop: 3, fontSize: 13.5, color: "#CBD5E1" }}>{offer.title}</span>
            <span style={{ display: "block", marginTop: 3, fontSize: 12.5, color: "#94A3B8" }}>{facts} · via {offer.provider === "viator" ? "Viator" : offer.provider} · a separate operator from the pick above · we may earn a commission</span>
          </a>
        ) : null}
      </div>
    </>
  );
}

export default function GuidePickDecision({ slug, pickIndex }) {
  const config = inlineBookConfig(slug, pickIndex);
  const sentinel = useRef(null);
  const offerRef = useRef(null);
  const exposed = useRef(false);
  const offerSeen = useRef(false);
  const offerReady = useRef(false);
  const [variant, setVariant] = useState(null);
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    if (!config || looksAutomated()) return;
    const v = inlineBookVariant(experimentId());
    if (!v) return;
    setVariant(v);
    if (pickIndex === 0) registerVariant(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exposure on VIEW of pick 1, both arms: only readers who reached the pick
  // enter either denominator, so the arms compare like with like.
  useEffect(() => {
    if (!variant || pickIndex !== 0 || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (exposed.current || !entries.some((e) => e.isIntersecting)) return;
      exposed.current = true;
      captureOrQueue(window, "guide_experiment_exposed", { experiment: GUIDE_INLINE_BOOK_KEY, variant, slug, pick: 1, offer_ready: variant === "treatment" ? offerReady.current : null });
      io.disconnect();
    });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [variant, pickIndex, slug]);

  useEffect(() => {
    if (variant !== "treatment" || !config || !config.book) return;
    let cancelled = false;
    fetch(`/api/experiences?city=${encodeURIComponent(config.city)}&limit=48`)
      .then((r) => (r && r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        // NO LAYOUT SHIFT UNDER THE READER: an offer that arrives after pick 1
        // was already on screen is dropped, not inserted. The exposure event
        // records offer_ready, so analysis can see how often that happens.
        if (exposed.current) return;
        const chosen = chooseInlineOffer(j.items || [], config.book.match);
        offerReady.current = !!chosen;
        setOffer(chosen);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const ctx = inlineOfferContext(offer, slug, config && config.city);

  useEffect(() => {
    if (!ctx || !offerRef.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (offerSeen.current || !entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) return;
      offerSeen.current = true;
      try { emitCommerce("commerce_impression", ctx); } catch (e) {}
      io.disconnect();
    }, { threshold: [0.5] });
    io.observe(offerRef.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer]);

  return <GuidePickDecisionView config={config} variant={variant} offer={offer} slug={slug} pickIndex={pickIndex} sentinelRef={sentinel} offerRef={offerRef} />;
}
