"use client";
// "Make it a full day": two or three bookable options (an activity, a show, a
// dinner deal) high on a guide, so one visit can lead to several partner
// clicks. Options, not orders. The rows come from lib/guideBundle.js, which
// uses only data the picks loop already shows.
//
// Links are real server rendered anchors (they work with JavaScript off). The
// client only adds the click id and the events:
//   commerce_impression    a row was at least half on screen, once per view
//   commerce_cta_clicked   an activity row was tapped (emitCommerce; that
//                          anchor is data-commerce-owner'd so CommerceClickBeacon
//                          does not record a second one). Show and deal rows are
//                          already tracked redirects: the beacon records those.
import { useEffect, useRef } from "react";
import { commerceHref, emitCommerce, mintClickId } from "../../../lib/commerce";
import { GuideCommissionLine } from "../../components/GuideCommissionLine";
import { consumeBeaconClickId } from "./GuidePickOffer";

const DISCLOSURE_VERSION = "guide-bundle-v1";

const box = { margin: "4px 0 14px", padding: "14px 16px", borderRadius: 14, border: "1px solid #2A3646", background: "#141c27", color: "#F4F6F8" };
const row = { listStyle: "none", margin: 0, padding: "12px 0", borderTop: "1px solid #2A3646" };
const btn = { display: "block", marginTop: 10, padding: "13px 16px", minHeight: 44, boxSizing: "border-box", borderRadius: 12, background: "#F97316", color: "#0B0F14", fontSize: 16, fontWeight: 800, textAlign: "center", textDecoration: "none" };

function BundleRow({ item, slug }) {
  const ref = useRef(null);
  const seen = useRef(false);
  const ctx = { ...item.ctx, disclosure_version: DISCLOSURE_VERSION };
  const key = JSON.stringify(ctx);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (seen.current || !entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) return;
      seen.current = true;
      try { emitCommerce("commerce_impression", JSON.parse(key)); } catch (e) {}
      io.disconnect();
    }, { threshold: [0.5] });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [key]);

  function onClick(event) {
    if (!item.owned) return;
    const anchor = event && event.currentTarget;
    const clickId = consumeBeaconClickId(anchor) || mintClickId();
    const href = commerceHref({ provider: item.ctx.provider, offerId: item.ctx.offer_id, surface: item.ctx.surface, contentId: item.ctx.content_id, clickId, page: "g-" + slug });
    if (href && anchor) {
      anchor.href = href;
      try { anchor.setAttribute("href", href); } catch (e) {}
    }
    try { emitCommerce("commerce_cta_clicked", { ...JSON.parse(key), click_id: clickId }); } catch (e) {}
  }

  return (
    <li ref={ref} className="wf-guide-bundle-row" data-bundle-kind={item.kind} style={row}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: ".9px", textTransform: "uppercase", color: "#FDBA74" }}>{item.kindLabel}</p>
      <p style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 800, color: "#F4F6F8", lineHeight: 1.3 }}>{item.name}</p>
      {item.detail ? <p style={{ margin: "4px 0 0", fontSize: 14, color: "#CBD5E1", lineHeight: 1.45 }}>{item.detail}</p> : null}
      <a
        href={item.href}
        data-commerce-owner={item.owned ? "GuideBundle" : undefined}
        target="_blank"
        rel="sponsored noopener nofollow"
        onClick={onClick}
        style={btn}
      >
        {item.ctaLabel} ↗
      </a>
    </li>
  );
}

export default function GuideBundle({ items, slug }) {
  if (!Array.isArray(items) || items.length < 2) return null;
  return (
    <section className="wf-guide-bundle" aria-label="Make it a full day" style={box}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#F4F6F8", lineHeight: 1.25 }}>Make it a full day</h2>
      <p style={{ margin: "6px 0 8px", fontSize: 14, color: "#CBD5E1", lineHeight: 1.5 }}>Pick any that fit your plans. They pair well with this guide.</p>
      <ul style={{ margin: 0, padding: 0 }}>
        {items.map((item) => <BundleRow key={item.kind + ":" + item.name} item={item} slug={slug} />)}
      </ul>
      <GuideCommissionLine />
    </section>
  );
}
