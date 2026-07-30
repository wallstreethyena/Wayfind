"use client";
// The shortlist rows — the money page's core surface.
//
// A user who reaches here has already chosen a cuisine, so intent is at its
// highest on the whole site: ranked places, one monetized CTA each, a deal chip
// where a real deal exists, and the food-tour rail below. Every decision in this
// file is about not spending that intent dishonestly.
//
// THE CTA LADDER LIVES IN lib/rowCta.js, not here — deal > bookable > delivery >
// directions — so the decision that determines whether a row earns can be CALLED
// by a guard instead of grepped.
//
// THE DISCLOSURE FOLLOWS THE MONEY. It renders only when the primary CTA actually
// earns. "Order pickup" works today but NEXT_PUBLIC_UBEREATS_TEMPLATE is unset, so
// it earns nothing — printing "we may earn a commission" under it would be false,
// and would teach users the line is boilerplate rather than information.
//
// IMPRESSIONS ARE VIEWABILITY-GATED, one per row per view — the same standard as
// the food-tour rail. Firing on mount would count rows below the fold as "seen",
// which is the lie that makes a zero click-through unreadable.
//
// lib/track.js stays the tracker for the existing list->detail event: home.js has
// its own logEvent, but that is a local function and not importable.
import { useEffect, useRef } from "react";
import { track } from "../../../../lib/track";
import { emitCommerce, rankBucket } from "../../../../lib/commerce";
import { showsDisclosure } from "../../../../lib/rowCta";

const STARS = (r) => {
  if (r == null) return null;
  const full = Math.max(0, Math.min(5, Math.round(Number(r))));
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
};

export default function CuisineListClient({ places, metro, cuisine }) {
  const rootRef = useRef(null);
  const seen = useRef(new Set());

  useEffect(() => {
    if (!places.length) return;
    // No IntersectionObserver => emit NOTHING rather than fall back to mount. A
    // wrong impression silently corrupts the only funnel this page produces.
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        const id = el.getAttribute("data-offer");
        if (!id || seen.current.has(id)) continue;
        seen.current.add(id);
        emitCommerce("commerce_impression", {
          surface: "cuisine_shortlist", city_id: metro, category: cuisine,
          canonical_place_id: id,
          offer_id: el.getAttribute("data-cta") || undefined,
          rank_bucket: rankBucket(Number(el.getAttribute("data-rank"))),
        });
        io.unobserve(el); // once per row per view
      }
    }, { threshold: 0.5 });
    const root = rootRef.current;
    if (root) for (const el of root.querySelectorAll("[data-offer]")) io.observe(el);
    return () => io.disconnect();
  }, [places.length, metro, cuisine]);

  return (
    <div className="wf-sl-list" ref={rootRef}>
      {places.map((p, i) => {
        const cta = p.cta;
        const stars = STARS(p.rating);
        return (
          <div className={"wf-sl-row" + (i === 0 ? " wf-sl-first" : "")} key={p.id}>
            <div className="wf-sl-rank" aria-hidden="true">{i + 1}</div>

            <div className="wf-sl-info">
              {/* The name still opens the place, and the existing list->detail
                  event is unchanged — the funnel already being measured keeps
                  working across this redesign. */}
              <a
                className="wf-sl-name"
                href={"/p/" + encodeURIComponent(p.id)}
                onClick={() => {
                  try { track("cuisine_place_open", { place_id: p.id, place_name: p.name, cuisine, metro, rank: i + 1 }); } catch (e) {}
                }}
              >
                {p.name}
              </a>

              <div className="wf-sl-badges">
                {stars ? <span className="wf-sl-stars" aria-hidden="true">{stars}</span> : null}
                {p.rating != null ? <span className="wf-sl-rating">{p.rating}</span> : null}
                {p.reviews ? <span className="wf-sl-reviews">{p.reviews.toLocaleString()} reviews</span> : null}
                {/* A separator is drawn only when BOTH sides exist, so a row with
                    no price never renders a stranded "·". */}
                {p.price && (p.rating != null || p.reviews) ? <span className="wf-sl-dot" aria-hidden="true">·</span> : null}
                {p.price ? <span className="wf-sl-price">{p.price}</span> : null}
              </div>

              {/* Rendered ONLY when real editorial exists. No placeholder prose: a
                  missing hook is an honest blank, not an invitation to invent one.
                  Measured coverage is ~22% of rows, and that is the truth. */}
              {p.hook ? (
                <div className="wf-sl-known">Known for <b>{p.hook}</b></div>
              ) : null}

              {/* Deal chip: only where a place matched a LIVE registry deal, with
                  its REAL expiry from couponEndsLabel. Never a hardcoded date. */}
              {p.deal ? (
                <div className="wf-sl-deal">
                  <span aria-hidden="true">✦</span>&nbsp;{p.deal.title}
                  {p.deal.ends ? <span className="wf-sl-exp">&nbsp;· {p.deal.ends}</span> : null}
                </div>
              ) : null}
            </div>

            <div className="wf-sl-actions" data-offer={p.id} data-cta={cta.type} data-rank={i + 1}>
              {cta.href ? (
                <a
                  className="wf-sl-cta wf-sl-primary"
                  href={cta.href}
                  target="_blank"
                  // sponsored/nofollow only where the link actually earns — the
                  // same signal the disclosure follows.
                  rel={cta.monetized ? "noopener sponsored nofollow" : "noopener noreferrer"}
                  onClick={() => {
                    emitCommerce("commerce_cta_clicked", {
                      surface: "cuisine_shortlist", city_id: metro, category: cuisine,
                      canonical_place_id: p.id, offer_id: cta.type,
                      rank_bucket: rankBucket(i + 1),
                    });
                  }}
                >
                  {cta.label}
                </a>
              ) : null}

              {p.secondary && p.secondary.href ? (
                <a className="wf-sl-cta wf-sl-quiet" href={p.secondary.href} target="_blank" rel="noopener noreferrer">
                  {p.secondary.label}
                </a>
              ) : null}

              {showsDisclosure(cta) ? (
                <div className="wf-sl-ftc">We may earn a commission — never affects ranking.</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
