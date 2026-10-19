"use client";
// Verified bookable offer(s) under the guide pick they match
// (lib/guidePickOffers.js, keyed by the pick's stable id). Server-rendered as
// real links, so they work with JavaScript off and paint with the pick on a
// phone; the client only adds the click id and the events.
//
// Events (sanctioned paths only, one each):
//   commerce_impression        an offer was at least half on screen, once per view
//   commerce_cta_clicked       an offer was tapped (emitCommerce; the anchor is
//                              data-commerce-owner'd so CommerceClickBeacon does
//                              not record a second one)
//   guide_official_link_clicked  the official, non-affiliate link was tapped
//                              (product event via track(); never a commerce event)
import { useEffect, useRef } from "react";
import { commerceHref, emitCommerce, mintClickId } from "../../../lib/commerce";
import { track } from "../../../lib/track";
import { PICK_OFFER_CTA } from "../../../lib/guidePickOffers";
import { GuideCommissionLine } from "../../components/GuideCommissionLine";

export const SURFACE = "guide_pick";
const DISCLOSURE_VERSION = "guide-pick-offer-v2";

export function pickOfferContext(offer, slug, pickId) {
  return {
    surface: SURFACE, provider: offer.provider, offer_id: offer.offerId, city_id: offer.city,
    category: offer.role === "alternative" ? "tour_alternative" : "tour",
    content_id: slug + ":" + pickId, disclosure_version: DISCLOSURE_VERSION,
  };
}

export function pickOfferHref(offer, slug, pickId, clickId) {
  return commerceHref({ provider: offer.provider, offerId: offer.offerId, surface: SURFACE, contentId: slug + ":" + pickId, clickId, page: "g-" + slug });
}

/** One tap: mint the click id, point the anchor at it, record ONE click. */
export function onPickOfferClick({ offer, slug, pickId, anchor }) {
  const clickId = mintClickId();
  const href = pickOfferHref(offer, slug, pickId, clickId);
  if (href && anchor) anchor.href = href;
  try { emitCommerce("commerce_cta_clicked", { ...pickOfferContext(offer, slug, pickId), click_id: clickId }); } catch (e) {}
  return href;
}

const box = { margin: "4px 0 14px", padding: "14px 16px", borderRadius: 14, border: "1px solid #2A3646", background: "#141c27", color: "#F4F6F8" };
const line = { margin: "6px 0 0", fontSize: 14, color: "#CBD5E1", lineHeight: 1.5 };
const small = { margin: "6px 0 0", fontSize: 12.5, color: "#94A3B8", lineHeight: 1.45 };
const btn = { display: "block", marginTop: 12, padding: "13px 16px", minHeight: 44, borderRadius: 12, background: "#F97316", color: "#0B0F14", fontSize: 16, fontWeight: 800, textAlign: "center", textDecoration: "none" };

function OfferCard({ offer, slug, pickId }) {
  const ref = useRef(null);
  const seen = useRef(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (seen.current || !entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) return;
      seen.current = true;
      try { emitCommerce("commerce_impression", pickOfferContext(offer, slug, pickId)); } catch (e) {}
      io.disconnect();
    }, { threshold: [0.5] });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [offer, slug, pickId]);
  const alt = offer.role === "alternative";
  return (
    <div ref={ref} className={"wf-guide-pick-offer" + (alt ? " wf-guide-pick-offer-alt" : "")} data-offer-id={offer.offerId} data-pick-id={pickId} data-offer-role={offer.role} style={{ ...box, ...(alt ? { borderStyle: "dashed" } : { borderColor: "#F97316" }) }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: ".9px", textTransform: "uppercase", color: alt ? "#94A3B8" : "#FDBA74" }}>
        {alt ? "A different venue" : "Book the guided version"}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 800, color: "#F4F6F8", lineHeight: 1.3 }}>{offer.title}</p>
      <p style={line}><strong>Best for:</strong> {offer.whoFor}</p>
      <p style={line}>{offer.detail}</p>
      {offer.meet ? <p style={line}><strong>Where:</strong> {offer.meet}</p> : null}
      {offer.objection ? <p style={line}>{offer.objection}</p> : null}
      <p style={{ ...line, color: "#FBBF24", fontWeight: 700 }}>{offer.restriction}</p>
      <a
        href={pickOfferHref(offer, slug, pickId)}
        data-commerce-owner="GuidePickOffer"
        data-offer-id={offer.offerId}
        target="_blank"
        rel="sponsored noopener nofollow"
        onClick={(event) => onPickOfferClick({ offer, slug, pickId, anchor: event && event.currentTarget })}
        style={alt ? { ...btn, background: "transparent", color: "#FDBA74", border: "1px solid #F97316" } : btn}
      >
        {PICK_OFFER_CTA} ↗
      </a>
      <GuideCommissionLine lead={"Opens the product page on Viator" + (offer.operator ? `; operated by ${offer.operator}` : "") + "."} />
    </div>
  );
}

export default function GuidePickOffer({ entry, slug }) {
  if (!entry) return null;
  const { pickId, offers, official } = entry;
  return (
    <div className="wf-guide-pick-offers" data-pick-id={pickId}>
      {offers.map((offer) => <OfferCard key={offer.offerId} offer={offer} slug={slug} pickId={pickId} />)}
      {official ? (
        <div className="wf-guide-pick-official" style={{ ...box, background: "transparent" }}>
          <a
            href={official.href}
            target="_blank"
            rel="noopener"
            onClick={() => { try { track("guide_official_link_clicked", { slug, pick_id: pickId, host: new URL(official.href).host }); } catch (e) {} }}
            style={{ color: "#F4F6F8", fontSize: 15, fontWeight: 800, textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            {official.label} ↗
          </a>
          <p style={small}>{official.note}</p>
        </div>
      ) : null}
    </div>
  );
}
