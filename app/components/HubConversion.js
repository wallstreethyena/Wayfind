"use client";
// HubConversion — one primary CTA for the hub pages that had none.
//
// WHY THIS EXISTS (2026-07-31). /guides and /culture/[metro] acquire real organic
// traffic and then dead-end. Measured in PostHog over 30 days, owner excluded:
//
//   /guides              12 sessions   100.0% dead   0.0 engagement events
//   /culture/tampa       10 sessions   100.0% dead   0.0 engagement events
//   /culture/orlando      9 sessions   100.0% dead   0.0 engagement events
//   /culture/keys        11 sessions    81.8% dead   0.2 engagement events
//
// Zero engagement events across ~40 sessions is not a preference; those pages
// ship no instrumented affordance at all. /guides/[slug] got GuideConversion in
// #486 — these two never did.
//
// This is deliberately the SAME SHAPE as GuideConversion: one primary CTA, one
// continue card, viewability-gated impression, one next-step per reader. What it
// adds is the dual event family the hub pages need.
//
// THE TWO EVENT FAMILIES, AND WHY THE FIELD NAMES DIFFER
// -----------------------------------------------------
// commerce_impression / commerce_cta_clicked go through lib/commerce, whose
// payload builder WHITELISTS field names and silently DROPS anything else. So on
// those two events the schema's own names are the only ones that survive:
//
//   guide_slug / culture_slug -> content_id
//   city                      -> city_id
//   cta_variant               -> variant
//   position                  -> rank_bucket   (coarse, deliberately)
//
// `position` is not passed through raw on purpose. lib/commerce.rankBucket exists
// because a precise rank sitting next to a commission figure is the evidence
// trail for pay-for-placement — the exact accusation Wayfind's ranking method
// has to be able to refute. Raw position survives on the product events, where
// no payout field is present.
//
// guide_cta_impression / guide_cta_clicked are product events (lib/track), which
// have no whitelist, so those carry the literal field set verbatim including
// `position`, `guide_slug`/`culture_slug`, `city` and `cta_variant`.
//
// click_id: minted CLIENT-side here, stable for the life of one rendered CTA, and
// identical across all four events so impression -> click joins exactly. It is
// NOT the server-side click_id — /api/commerce/go and /api/viator/go mint their own
// at redirect time, which is the authority for the partner leg. The two join on
// (surface, content_id, offer_id, session).
import { useEffect, useRef } from "react";
import { track } from "../../lib/track";
import { emitCommerce } from "../../lib/commerce";
import { hubProductProps, hubCommerceProps, mintClickId } from "../../lib/hubConversion";

/**
 * @param {object}  p
 * @param {string}  p.surface      "guides_hub" | "culture"
 * @param {string}  p.slugKey      "guide_slug" | "culture_slug" — which name the product events use
 * @param {string}  p.slug         the page's own slug (content_id on commerce events)
 * @param {string}  p.city         human city label
 * @param {string}  p.category     "tours" | "guides" | ...
 * @param {object}  p.cta          { label, href, provider, offerId, monetized, variant, position }
 * @param {object} [p.next]        { label, href } — the continue card, so the page is never terminal
 */
export default function HubConversion({ surface, slugKey, slug, city, category, cta, next }) {
  const ref = useRef(null);
  const seen = useRef(false);
  const acted = useRef(false);
  const clickId = useRef(null);
  if (clickId.current === null) clickId.current = mintClickId();

  // Both event families are built by lib/hubConversion, which the guard calls
  // too — so a field rename cannot pass unnoticed the way it did when this
  // component built its own payloads inline.
  const args = (extra) => ({
    clickId: clickId.current, slugKey, slug, surface,
    provider: (cta && cta.provider) || null,
    offerId: (cta && cta.offerId) || null,
    position: (cta && cta.position) || 1,
    variant: (cta && cta.variant) || null,
    city, category, ...(extra || {}),
  });

  // Impression = actually on screen, once. A render-time impression counts
  // readers who never scrolled to it and makes the click-through rate meaningless.
  useEffect(() => {
    if (!cta || !cta.href || !ref.current || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || seen.current) continue;
        seen.current = true;
        try { track("guide_cta_impression", hubProductProps(args())); } catch (err) {}
        if (cta.monetized) { try { emitCommerce("commerce_impression", hubCommerceProps(args())); } catch (err) {} }
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One click per reader. Without the guard a reader who takes the CTA and then
  // the continue card counts twice and the funnel reads above 100%.
  const onCta = () => {
    if (acted.current) return;
    acted.current = true;
    try { track("guide_cta_clicked", hubProductProps(args())); } catch (e) {}
    if (cta.monetized) { try { emitCommerce("commerce_cta_clicked", hubCommerceProps(args())); } catch (e) {} }
    // Deliberately NOT preventDefault: the anchor's own navigation carries the
    // user onward. Hijacking it breaks cmd-click and middle-click, and puts a
    // measurement failure in the path of a revenue click.
  };

  if (!cta || !cta.href) return null;

  return (
    <section
      ref={ref}
      aria-label="Your next step"
      style={{ margin: "34px 0 8px", padding: "20px 18px", borderRadius: 18, border: "1px solid #21262D", background: "linear-gradient(180deg,#161B22 0%,#12181F 100%)" }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".9px", textTransform: "uppercase", color: "#8B949E" }}>
        {cta.monetized ? "Your next step" : "One clear next step"}
      </div>
      <a
        href={cta.href}
        onClick={onCta}
        {...(cta.monetized ? { target: "_blank", rel: "noreferrer sponsored" } : {})}
        style={{ display: "block", marginTop: 10, padding: "14px 18px", borderRadius: 14, background: "#FF8A3D", color: "#0B0F14", fontSize: 16, fontWeight: 800, textAlign: "center", textDecoration: "none" }}
      >
        {cta.label}{cta.monetized ? " ↗" : ""}
      </a>

      {/* FTC disclosure adjacent to the earning CTA, never at the page foot. */}
      {cta.monetized ? (
        <div style={{ marginTop: 9, fontSize: 12, color: "#8B949E", textAlign: "center", lineHeight: 1.5 }}>
          Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings.
        </div>
      ) : null}

      {next && next.href ? (
        <a
          href={next.href}
          onClick={() => {
            if (acted.current) return;
            acted.current = true;
            try { track("guide_cta_clicked", hubProductProps(args({ variant: "continue", provider: null, offerId: null, position: 2 }))); } catch (e) {}
          }}
          style={{ display: "block", marginTop: 12, padding: "13px 16px", borderRadius: 14, border: "1px solid #21262D", background: "transparent", color: "#E6EDF3", fontSize: 14, fontWeight: 700, textDecoration: "none", textAlign: "center" }}
        >
          {next.label} →
        </a>
      ) : null}
    </section>
  );
}
