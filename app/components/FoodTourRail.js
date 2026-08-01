"use client";
// FoodTourRail — the money surface on the cuisine sheet.
//
// WHY THIS EXISTS, IN ONE NUMBER
// Fourteen days of PostHog show ZERO non-owner clicks on any monetized link, and
// every click event in this codebase fires on CLICK. A zero therefore tells us
// nothing: "nobody wanted it" and "nobody ever saw it" are indistinguishable. The
// most important event here is commerce_impression, not commerce_cta_clicked.
//
// AN IMPRESSION IS VIEWABILITY, NOT RENDER. Firing on mount would count a rail
// sitting 900px below the fold as "seen", which is precisely the lie that makes a
// zero click-through unreadable. IntersectionObserver at 50% is the gate, and each
// offer fires AT MOST ONCE per view — a rail that re-fires on every scroll past
// would inflate the denominator and make the funnel look worse than it is.
//
// THE UI NEVER BUILDS A PARTNER URL (lib/commerce.js rule 2). Every href here is
// commerceHref() — our own /api/commerce/go — and the server resolves the offer id
// to a Viator destination, mints the opaque click_id, and 302s. A viator.com
// literal must never appear in this file; scripts/check-food-tour-rail.mjs fails
// the build if one does.
//
// RANK IS COARSE AND COMMISSION IS ABSENT. rankBucket() sends top3/4-10/11+, never
// a raw position, and no commission value is passed to this component at all — so
// it cannot rank on one even by accident (lib/commerce.js rule 1, AGENTS.md §8).
import { useEffect, useRef } from "react";
import { emitCommerce, commerceHref, rankBucket, mintClickId } from "../../lib/commerce";
import { rankExperiences } from "../../lib/experiencesData";

// Bumped when the disclosure WORDING changes, so consent evidence is tied to the
// exact text shown rather than to "some disclosure existed".
export const DISCLOSURE_VERSION = "2026-07-30";

const C = { card: "#10141d", border: "#1F2937", text: "#F1F5F9", muted: "#8B93A1", accent: "#F97316", green: "#3ee08a" };

export default function FoodTourRail({ offers, metro, surface = "cuisine_sheet" }) {
  const list = rankExperiences(offers);
  const seen = useRef(new Set());
  const discSeen = useRef(false);
  const rootRef = useRef(null);
  const discRef = useRef(null);

  useEffect(() => {
    if (!list.length) return;
    // No IntersectionObserver (old browser, jsdom) => emit nothing rather than
    // fall back to firing on mount. A wrong impression is worse than none: it
    // silently corrupts the one metric this rail exists to produce.
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        if (el === discRef.current) {
          if (discSeen.current) continue;
          discSeen.current = true;
          emitCommerce("disclosure_viewed", {
            surface, city_id: metro, disclosure_version: DISCLOSURE_VERSION,
          });
          io.unobserve(el);
          continue;
        }
        const id = el.getAttribute("data-offer");
        if (!id || seen.current.has(id)) continue;
        seen.current.add(id);
        emitCommerce("commerce_impression", {
          surface, city_id: metro, provider: "viator", merchant: "Viator",
          category: "tours", offer_id: id,
          rank_bucket: rankBucket(Number(el.getAttribute("data-rank"))),
        });
        io.unobserve(el); // once per offer per view
      }
    }, { threshold: 0.5 });

    const root = rootRef.current;
    if (root) for (const el of root.querySelectorAll("[data-offer]")) io.observe(el);
    if (discRef.current) io.observe(discRef.current);
    return () => io.disconnect();
  }, [list.length, metro, surface]);

  // A rail with nothing real to show renders NOTHING. An empty "tours near you"
  // frame is worse than absence: it costs trust and measures as a viewed surface.
  if (!list.length) return null;

  const onCta = (offer, i, e) => {
    const clickId = mintClickId();
    emitCommerce("commerce_cta_clicked", {
      surface, city_id: metro, provider: "viator", merchant: "Viator",
      category: "tours", offer_id: offer.code, rank_bucket: rankBucket(i + 1),
      click_id: clickId,
    });
    // Stamp the same click_id onto the outbound href so the server redirect
    // reuses it. This makes commerce_cta_clicked and provider_redirect_started
    // joinable by click_id without breaking cmd-click / middle-click.
    try {
      const a = e.currentTarget;
      const sep = a.href.includes("?") ? "&" : "?";
      a.href = a.href + sep + "click_id=" + encodeURIComponent(clickId);
    } catch {}
  };

  return (
    <section
      ref={rootRef}
      aria-labelledby="wf-eat-rail-title"
      style={{ maxWidth: 980, margin: "0 auto", padding: "18px 20px 0" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 id="wf-eat-rail-title" style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: 0, letterSpacing: "-.01em" }}>
          Eat your way around it
        </h2>
        <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: "nowrap" }}>via Viator</span>
      </div>
      <p style={{ fontSize: 12.5, color: C.muted, margin: "5px 0 12px", lineHeight: 1.5 }}>
        Guided food tours near here — someone else picks the stops.
      </p>

      <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, listStyle: "none", margin: 0, padding: 0 }}>
        {list.map((t, i) => (
          <li key={t.code}>
            <a
              data-offer={t.code}
              data-rank={i + 1}
              href={commerceHref({ provider: "viator", offerId: t.code, surface, contentId: metro })}
              onClick={(e) => onCta(t, i, e)}
              // sponsored + nofollow: this resolves to a commissioned link, and
              // saying so is both an FTC and an SEO obligation.
              rel="noopener sponsored nofollow"
              target="_blank"
              style={{ display: "block", background: C.card, border: "1px solid " + C.border, borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "inherit" }}
            >
              {t.image ? (
                <img src={t.image} alt="" loading="lazy" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />
              ) : null}
              <div style={{ padding: "9px 11px 11px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 750, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {t.title}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 5 }}>
                  {/* Reviews are shown beside the rating because a lone 5.0 is not
                      a recommendation — it is often a single review. */}
                  {t.rating > 0 && t.reviews > 0 ? (
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: C.green }}>
                      {t.rating.toFixed(1)}
                      <span style={{ color: C.muted, fontWeight: 600 }}> ({t.reviews})</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>New</span>
                  )}
                  {t.fromPrice != null ? <span style={{ fontSize: 11, color: C.muted }}>from ${t.fromPrice}</span> : null}
                </div>
                <span style={{ marginTop: 8, display: "inline-block", background: C.accent, color: "#0D1117", borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 800 }}>
                  See dates ↗
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>

      {/* ADJACENT, not in a footer: the disclosure sits directly under the offers
          it describes, in the same visual block, so it is seen with them. */}
      <p ref={discRef} style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.45, margin: "9px 0 0" }}>
        Wayfind may earn a commission when you book through these links, at no extra cost to you.
        It never changes our rankings.
      </p>
    </section>
  );
}
