"use client";
// The live deal cards on a deal guide. Every card is a REGISTRY row — this file
// renders lib/coupons rows and cannot mint one, which is the same rule the deal
// sheet runs on: an unregistered offer has no way to appear here.
//
// WHY THIS EXISTS AS A CLIENT COMPONENT. The guide's single primary CTA is
// already instrumented in GuideConversion, but a guide ABOUT deals shows several
// offers above it, and until now nothing counted whether any of them were seen or
// tapped. Impression-per-card is the difference between "this guide converts
// badly" and "nobody ever scrolled to the cards" — two different problems with
// two different fixes, and the funnel could not tell them apart.
//
// FOUR EVENTS, EACH FIRED AT MOST ONCE PER CARD PER PAGEVIEW:
//   guide_impression      the guide's card block entered view (once, not per card)
//   deal_card_impression  this card was actually seen (IntersectionObserver)
//   deal_card_clicked     this card's CTA was tapped
//   deal_card_outbound    the outbound href we are about to hand the browser
// The click and outbound pair are deliberately separate: a click that never
// produces an outbound is a broken href, and one event cannot show that.
//
// NO CARD BYPASSES TRACKING. Every card fires deal_card_clicked before
// navigation, and a row carrying `commerce` keeps the /api/commerce/go redirect
// that the registry already declares — this file never rewrites a href.
import { useEffect, useRef } from "react";
import { track } from "../../../lib/track";
// Image resolution lives in lib so a guard can import it and check every branch
// against the real filesystem — see lib/dealCardImage.js.
import { cardImage } from "../../../lib/dealCardImage";

export default function GuideDealCards({ slug, region, deals }) {
  const blockRef = useRef(null);
  const seenBlock = useRef(false);
  const seenCards = useRef({});
  const clicked = useRef({});

  // Guide-level impression: the deal block was reached at all.
  useEffect(() => {
    if (!blockRef.current || typeof IntersectionObserver === "undefined") return;
    const el = blockRef.current;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !seenBlock.current) {
          seenBlock.current = true;
          try { track("guide_impression", { slug, region, cards: (deals || []).length }); } catch (err) {}
          io.disconnect();
        }
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [slug, region, deals]);

  // Per-card impression. Keyed by id so a re-observe cannot double-count.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const nodes = Array.from(document.querySelectorAll("[data-deal-card]"));
    if (!nodes.length) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = e.target.getAttribute("data-deal-card");
        if (!e.isIntersecting || !id || seenCards.current[id]) continue;
        seenCards.current[id] = true;
        try { track("deal_card_impression", { slug, region, deal_id: id, merchant: e.target.getAttribute("data-merchant") || null }); } catch (err) {}
        io.unobserve(e.target);
      }
    }, { threshold: 0.5 });
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [slug, region, deals]);

  if (!deals || !deals.length) return null;

  return (
    <section className="wf-gd-wrap" ref={blockRef} aria-label={`Live deals in ${region}`}>
      <h2 className="wf-gd-h">Live right now in {region}</h2>
      <ul className="wf-gd-list">
        {deals.map((d) => (
          <li key={d.id}>
            <a
              className="wf-gd-card"
              href={d.url}
              data-deal-card={d.id}
              data-merchant={d.business}
              rel={d.external ? "nofollow sponsored noopener" : undefined}
              target={d.external ? "_blank" : undefined}
              onClick={() => {
                if (clicked.current[d.id]) return;
                clicked.current[d.id] = true;
                try {
                  track("deal_card_clicked", { slug, region, deal_id: d.id, merchant: d.business, category: d.category || null, external: !!d.external });
                  track("deal_card_outbound", { slug, deal_id: d.id, href: d.url });
                } catch (err) {}
              }}
            >
              <img className="wf-gd-img" src={cardImage(d)} alt="" loading="lazy" width="96" height="96" />
              <div className="wf-gd-body">
                <div className="wf-gd-top">
                  <span className="wf-gd-title">{d.title}</span>
                  {d.badge ? <span className="wf-gd-badge">{d.badge}</span> : null}
                </div>
                <div className="wf-gd-merchant">{d.business}</div>
                <p className="wf-gd-details">{d.details}</p>
                <div className="wf-gd-foot">
                  <span className="wf-gd-loc">{d.area}</span>
                  <span className="wf-gd-cta">{d.cta || "See the deal"}</span>
                </div>
                {d.ends ? <div className="wf-gd-ends">{d.ends}</div> : null}
              </div>
            </a>
          </li>
        ))}
      </ul>
      <p className="wf-gd-disc">
        Offers come from our own deal registry and are checked against their expiry before they render. Some links earn Wayfind a commission; it never changes what we list or the order.
      </p>
    </section>
  );
}
