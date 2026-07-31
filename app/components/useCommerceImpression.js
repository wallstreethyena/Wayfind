"use client";
// useCommerceImpression — fires commerce_impression when a monetized CTA is
// actually SEEN, and exactly once per offer per view.
//
// WHY THIS IS THE IMPORTANT EVENT, NOT THE CLICK
// Every monetized click event in this codebase fires on click. So a zero-click
// dashboard is unreadable: "nobody wanted it" and "nobody ever saw it" produce
// the identical number, and fourteen days of PostHog currently show a zero we
// cannot interpret. commerce_impression is the denominator that makes the zero
// mean something. lib/commerce.js says the same thing at more length.
//
// "RENDERED" IS NOT "VIEWABLE", AND THE DIFFERENCE IS THE WHOLE POINT
// A coupon card 4000px down a list is rendered on mount. Counting that as an
// impression inflates the denominator with cards nobody scrolled to, which makes
// a real conversion rate look like a broken one — the same failure as the click
// event, in the opposite direction. So the impression waits for intersection.
//
// IntersectionObserver has been in every target browser for years, but if it is
// genuinely absent the honest choice is to emit NOTHING rather than fall back to
// a mount-time emit: a fabricated impression is worse than a missing one,
// because it silently corrupts the ratio instead of just lowering the count.
import { useEffect, useRef } from "react";
import { emitCommerce } from "../../lib/commerce";

const VISIBLE_RATIO = 0.5; // half the CTA on screen counts as seen

/**
 * @param {object|null} ctx  commerce context (surface, provider, offer_id, …).
 *                           Falsy ctx = not a monetized card = no observer.
 * @returns {import("react").RefObject} attach to the element wrapping the CTA.
 */
/**
 * @param ctx      commerce context, or null for a card that does not earn
 * @param cardCtx  optional NON-COMMERCE card context. When present a
 *                 `card_impression` fires on the SAME viewability trigger.
 *
 * ONE OBSERVER, TWO EVENTS — deliberately. Attaching a second hook would mean a
 * second ref on the same element and a second IntersectionObserver with its own
 * threshold, which is how the two events drift apart and the CTR denominator
 * stops matching the numerator. Sharing the observer makes "viewable" mean
 * exactly one thing, and makes double-firing structurally impossible: both
 * events sit behind the same one-shot firedRef.
 *
 * A free card passes ctx=null and cardCtx set — it still gets an impression, it
 * just never enters the commerce funnel.
 */
export function useCommerceImpression(ctx, cardCtx) {
  const ref = useRef(null);
  const firedRef = useRef(false);
  // Serialize so the effect re-arms when the offer genuinely changes, without
  // re-arming on every render because a fresh object literal was passed in.
  const key = ctx ? JSON.stringify(ctx) : "";
  const cardKey = cardCtx ? JSON.stringify(cardCtx) : "";

  useEffect(() => {
    firedRef.current = false;
    const el = ref.current;
    if ((!key && !cardKey) || !el) return;
    if (typeof IntersectionObserver === "undefined") return;

    let obs = null;
    try {
      obs = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < VISIBLE_RATIO) continue;
          if (firedRef.current) return;
          firedRef.current = true;
          if (key) { try { emitCommerce("commerce_impression", JSON.parse(key)); } catch (err) {} }
          if (cardKey) { try { emitCommerce("card_impression", JSON.parse(cardKey)); } catch (err) {} }
          // One per offer per view: stop observing the moment it counts.
          if (obs) obs.disconnect();
          return;
        }
      }, { threshold: [VISIBLE_RATIO] });
      obs.observe(el);
    } catch (err) { /* measurement must never take a revenue surface down */ }

    return () => { try { if (obs) obs.disconnect(); } catch (err) {} };
  }, [key, cardKey]);

  return ref;
}
