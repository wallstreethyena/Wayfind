"use client";
// The conversion block: ONE primary CTA, one continue card, one save prompt.
// Client-side so the bet is falsifiable — see the events below.
//
// THE BET being measured: we are deliberately removing live monetized surface
// area (per-pick "Check tours & tickets" / "Check rates" on every pick) and
// trading many weak links for one strong CTA. If clicks-per-guide-view drops, we
// revisit rather than defend, so the instrumentation has to make that visible
// within a week:
//   commerce_impression   the CTA was actually seen (IntersectionObserver, once)
//   commerce_cta_clicked  it was clicked
//   guide_next_step       cta | continue | save | none  — what the reader did
//   primary_cta_null      NO MONETIZABLE CTA resolved. Directions is the
//                         acknowledged non-monetized terminal and does NOT
//                         suppress this event.
import { useEffect, useRef, useState } from "react";
import { track } from "../../../lib/track";
import { emitCommerce } from "../../../lib/commerce";
import { mintClickId, withClickId, isEarningGoHref } from "../../../lib/hubConversion";

export default function GuideConversion({ slug, region, cta, next, social, socialStatus }) {
  const ref = useRef(null);
  const seen = useRef(false);
  const [saved, setSaved] = useState(false);
  const acted = useRef(false);
  const clickId = useRef(null);
  if (clickId.current === null) clickId.current = mintClickId();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const earningGo = !!(cta && cta.monetized && isEarningGoHref(cta.href));
  const ctaHref = (hydrated && earningGo) ? withClickId(cta.href, clickId.current) : (cta && cta.href);

  // primary_cta_null fires on mount when nothing MONETIZABLE resolved. Directions
  // counts as null for this event by design — it is a real next step but earns
  // nothing, and conflating the two would hide how many guides have no revenue
  // path at all.
  useEffect(() => {
    try {
      if (!cta || !cta.monetized) {
        track("primary_cta_null", { slug, region, resolved: (cta && cta.kind) || "none", exact: !!(cta && cta.exact) });
      }
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Impression = actually on screen, once. A render-time impression would count
  // readers who never scrolled to it and make the click-through rate meaningless.
  useEffect(() => {
    if (!cta || !cta.href || !ref.current || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !seen.current) {
          seen.current = true;
          try {
            track("commerce_impression", {
              slug, region, cta_kind: cta.kind, monetized: !!cta.monetized,
              // exact=false means the destination is a SEARCH, not a bookable
              // product. Without it cta_kind:"tour" conflated the two and a 0%
              // click rate could not be read as a bad offer or a vague label.
              exact: !!cta.exact,
              place: cta.place || null, has_social: !!social,
              // Carried so a DEGRADED social lookup is countable rather than
              // looking like a place that simply has no reviews.
              social_status: socialStatus || "unknown",
            });
          } catch (err) {}
          io.disconnect();
        }
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One next-step per reader. Without this guard a reader who clicks the CTA and
  // then the continue card counts twice, and the funnel reads above 100%.
  const step = (value, extra) => {
    try {
      if (!acted.current) { acted.current = true; track("guide_next_step", { slug, region, step: value, ...(extra || {}) }); }
    } catch (e) {}
  };

  return (
    <section ref={ref} style={{ margin: "34px 0 8px", padding: "20px 18px", borderRadius: 18, border: "1px solid #1C2530", background: "linear-gradient(180deg,#141c27 0%,#101720 100%)" }}>
      {cta && cta.href ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".9px", textTransform: "uppercase", color: "#8A97A6" }}>
            {cta.monetized ? "Your next step" : "One clear next step"}
          </div>
          <a
            href={ctaHref}
            {...(cta.sponsored
              ? (earningGo
                // Founder P0: earning go-route Book is SAME-TAB so a popup
                // block cannot fire the click with no leave. Reuses
                // HubConversion withClickId + emitCommerce — do not invent a
                // third tracker. target=_blank stays only for non-go sponsored
                // hrefs (coupon clip-to-wallet / maps are not this path).
                ? { rel: "noreferrer sponsored" }
                : { target: "_blank", rel: "noreferrer sponsored" })
              : {})}
            onClick={() => {
              try {
                track("commerce_cta_clicked", { slug, region, cta_kind: cta.kind, monetized: !!cta.monetized, exact: !!cta.exact, place: cta.place || null, click_id: clickId.current });
              } catch (e) {}
              if (cta.monetized) {
                try {
                  emitCommerce("commerce_cta_clicked", {
                    surface: "guide",
                    provider: cta.kind === "hotel" ? "stay22" : (cta.kind === "deal" ? "deal" : "viator"),
                    offer_id: cta.place || slug,
                    content_id: slug,
                    city_id: region || null,
                    category: cta.kind || null,
                    click_id: clickId.current,
                  });
                } catch (e) {}
              }
              step("cta", { cta_kind: cta.kind });
            }}
            style={{ display: "block", marginTop: 10, padding: "14px 18px", borderRadius: 14, background: "#F97316", color: "#0B0F14", fontSize: 16, fontWeight: 800, textAlign: "center", textDecoration: "none" }}
          >
            {cta.label}{cta.sponsored ? " ↗" : ""}
          </a>

          {/* Social proof NEXT TO the CTA, and only when the data exists. No
              placeholders: an absent count renders nothing rather than a zero,
              because a fabricated "0 reviews" is worse than silence. */}
          {social ? (
            <div style={{ marginTop: 9, fontSize: 12.5, color: "#8A97A6", textAlign: "center" }}>
              {social.rating}★ · {social.reviews.toLocaleString()} reviews{social.name ? " · " + social.name : ""}
            </div>
          ) : null}

          {/* Real deadline only. couponEndsLabel reads the actual expiry from the
              deals data; there is no hardcoded urgency anywhere in this file. */}
          {cta.deal && cta.deal.ends ? (
            <div style={{ marginTop: 7, fontSize: 12.5, color: "#FBBF24", textAlign: "center", fontWeight: 700 }}>
              {cta.deal.ends}{cta.deal.code ? " · code " + cta.deal.code : ""}
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ fontSize: 14, color: "#8A97A6", lineHeight: 1.5 }}>
          Nothing to book here — this one is just worth doing. Open it in Wayfind for hours and directions.
        </div>
      )}

      {next ? (
        <a
          href={"/guides/" + next.slug}
          onClick={() => step("continue", { to: next.slug })}
          style={{ display: "block", marginTop: 12, padding: "13px 16px", borderRadius: 14, border: "1px solid #1C2530", background: "transparent", color: "#F4F6F8", fontSize: 14, fontWeight: 700, textDecoration: "none" }}
        >
          Next: {next.title} →
        </a>
      ) : null}

      {/* Exit-on-peak. Feeds the existing save event rather than a new store. */}
      <button
        type="button"
        onClick={() => {
          setSaved(true);
          try { track("guide_saved", { slug, region }); } catch (e) {}
          step("save");
        }}
        style={{ display: "block", width: "100%", marginTop: 10, padding: "11px 16px", borderRadius: 14, border: "1px dashed #243040", background: "transparent", color: saved ? "#FBBF24" : "#8A97A6", fontSize: 13, fontWeight: 700, cursor: saved ? "default" : "pointer" }}
        disabled={saved}
      >
        {saved ? "Saved — it'll be waiting in Wayfind" : "Save this guide for the trip"}
      </button>
    </section>
  );
}
