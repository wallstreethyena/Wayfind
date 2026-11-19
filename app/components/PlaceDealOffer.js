"use client";
// The verified deal for the business a page is talking about (lib/placeDeal.js).
// Used where Wayfind NAMES a business outside a place card: the /places/<id>
// page, a guide pick, a guide's place photo list.
//
// Server-rendered as a real link (works with JavaScript off, paints with the
// page); the client only adds the click id, the events, and a same-day expiry
// check, because /places pages are cached for a day and a deal whose window
// closed this morning must not keep its button until tomorrow.
//
// Events, each at most once:
//   commerce_impression   the offer was at least half on screen (affiliate only)
//   commerce_cta_clicked  the button was tapped (affiliate only; the anchor is
//                         data-commerce-owner'd so the page beacon does not
//                         record a second click)
//   place_deal_clicked    product event for a free, non-affiliate venue offer
import { useEffect, useRef, useState } from "react";
import { emitCommerce, mintClickId } from "../../lib/commerce";
import { withClickId } from "../../lib/hubConversion";
import { siteTodayStr } from "../../lib/siteTime";
import { track } from "../../lib/track";
import { useCommerceImpression } from "./useCommerceImpression";

const box = { margin: "4px 0 16px", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #F9731666", background: "linear-gradient(150deg, #2a1a0e 0%, #141c27 70%)", color: "#F4F6F8" };
const pill = { display: "inline-block", fontSize: 11, fontWeight: 800, color: "#0D1117", background: "#F97316", borderRadius: 999, padding: "2px 9px" };
const ends = { fontSize: 11.5, fontWeight: 700, color: "#94A3B8", marginLeft: 8 };
const title = { margin: "8px 0 0", fontSize: 16, fontWeight: 800, lineHeight: 1.3, color: "#F4F6F8" };
const sub = { margin: "5px 0 0", fontSize: 13.5, color: "#CBD5E1", lineHeight: 1.5 };
const btn = { display: "block", marginTop: 12, padding: "13px 16px", minHeight: 44, boxSizing: "border-box", borderRadius: 12, background: "#F97316", color: "#0B0F14", fontSize: 16, fontWeight: 800, textAlign: "center", textDecoration: "none" };
const codeLine = { textAlign: "center", fontSize: 13, fontWeight: 800, color: "#CBD5E1", marginTop: 8, letterSpacing: "0.5px" };

export default function PlaceDealOffer({ deal, showBusiness = false }) {
  const clickId = useRef(null);
  const clicked = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const impRef = useCommerceImpression(deal && deal.commerce ? deal.commerce : null);

  if (!deal || !deal.href || !deal.title) return null;
  // Expired since the cached page was built: no box at all (never a dead button).
  if (hydrated && deal.expires && deal.expires < siteTodayStr()) return null;

  if (deal.commerce && clickId.current === null) clickId.current = mintClickId();
  const href = deal.commerce && hydrated ? withClickId(deal.href, clickId.current) : deal.href;

  const onClick = () => {
    if (clicked.current) return;
    clicked.current = true;
    try {
      if (deal.commerce) emitCommerce("commerce_cta_clicked", { ...deal.commerce, click_id: clickId.current });
      else track("place_deal_clicked", { deal_id: deal.id, place_id: deal.placeId, surface: "free_offer" });
    } catch (e) {}
  };

  return (
    <div style={box} data-place-deal={deal.id} ref={impRef}>
      <div>
        <span style={pill}>🏷️ Deal</span>
        {deal.ends ? <span style={ends}>{deal.ends}</span> : null}
      </div>
      <p style={title}>{deal.title}{showBusiness && deal.business ? <span style={{ color: "#94A3B8", fontWeight: 700 }}> at {deal.business}</span> : null}</p>
      {deal.details ? <p style={sub}>{deal.details}</p> : null}
      <a
        href={href}
        style={btn}
        onClick={onClick}
        {...(deal.commerce
          ? { rel: "sponsored noreferrer", "data-commerce-owner": "PlaceDealOffer" }
          : { target: deal.external ? "_blank" : undefined, rel: deal.external ? "noopener noreferrer" : undefined })}
      >
        {deal.cta}{deal.external ? " ↗" : ""}
      </a>
      {deal.code ? <div style={codeLine}>Code: {deal.code}</div> : null}
    </div>
  );
}
