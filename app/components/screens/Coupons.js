"use client";

// CouponsScreen — a clip-first wallet, not a poster gallery.
//
// Inventory remains fully derived from lib/coupons.js + dashboard offers, and
// dealTiers() still owns geography, expiry and tiering. This component only
// changes how those verified offers are presented: compact cards, an explicit
// Clip action, and a first-class view of the user's clipped deals.
//
// ONE PROVIDER PER CARD, EVER. Each card has one offer id, one provider and one
// redeem anchor. Clip, copy and share are buttons, never alternate destinations.
import { useEffect, useRef } from "react";
import { COUPONS, couponIsLive } from "../../../lib/coupons";
import { siteTodayStr } from "../../../lib/siteTime";
import { emitCommerce, rankBucket, mintClickId } from "../../../lib/commerce";
import { useCommerceImpression } from "../useCommerceImpression";
import {
  dealTiers, dealSeal, dealEndsLabel, dealProofPoint, dealDisclosure,
  dealScope,
} from "../../../lib/dealSheet";

const COUPON_CARD_EXPERIMENT = "coupon_wallet_v2";

const T = {
  bg: "#0c131e", panel: "#111b29", panel2: "#162131", border: "#2d3a4d",
  text: "#f7f9fc", light: "#d7deea", muted: "#9ba7ba", hint: "#7c899d",
  orange: "#ff6b18", orange2: "#e65312", green: "#25c26e", gold: "#f2c94c",
};

const ShareGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
  </svg>
);

function TierHead({ title, count, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "22px 1px 10px", minWidth: 0 }}>
      <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: T.light, fontWeight: 900 }}>{title}</span>
      <span style={{ flexShrink: 0, minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, display: "grid", placeItems: "center", background: "#202b3b", color: T.muted, fontSize: 10.5, fontWeight: 850 }}>{count}</span>
      <span aria-hidden="true" style={{ flex: 1, minWidth: 10, height: 1, background: "linear-gradient(90deg,rgba(148,163,184,.3),transparent)" }} />
      <span style={{ flexShrink: 0, fontSize: 9.5, color: T.hint }}>{hint}</span>
    </div>
  );
}

function CouponCard({ c, position, ctx }) {
  const { savedCoupons, toggleSaveCoupon, copyCouponCode, shareCoupon, logEvent, openExternal } = ctx;
  const isSaved = !!savedCoupons[c.id];
  const seal = dealSeal(c);
  const ends = dealEndsLabel(c);
  const proof = dealProofPoint(c);
  const disc = dealDisclosure(c);
  const scope = dealScope(c);
  const hasArt = false;
  const variant = "clip_no_art";
  const category = disc.affiliate ? "deal_money" : "deal_free";
  const cityId = scope.kind === "metro" ? scope.metro : null;
  const cctx = disc.affiliate ? {
    surface: "coupons",
    provider: (c.commerce && c.commerce.provider) || String(disc.network).toLowerCase(),
    offer_id: (c.commerce && c.commerce.offerId) || c.id,
    content_id: c.id,
    category,
    city_id: cityId,
    variant,
    experiment_id: COUPON_CARD_EXPERIMENT,
    rank_bucket: rankBucket(position),
  } : null;
  const cardCtx = {
    surface: "coupons", content_id: c.id, category, city_id: cityId, variant,
    experiment_id: COUPON_CARD_EXPERIMENT, rank_bucket: rankBucket(position),
    has_art: hasArt, card_type: "clip",
  };
  const impRef = useCommerceImpression(cctx, cardCtx);
  const seenRef = useRef(false);
  useEffect(() => {
    if (!cctx || seenRef.current) return;
    seenRef.current = true;
    try { emitCommerce("disclosure_viewed", cctx); } catch (e) {}
  }, [cctx]);

  return (
    <article ref={impRef} style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", overflow: "hidden", border: `1px solid ${isSaved ? "rgba(255,107,24,.72)" : T.border}`, borderLeft: `4px solid ${isSaved ? T.orange : disc.affiliate ? T.gold : "#3c4b61"}`, borderRadius: 15, padding: "13px 13px 11px", background: "linear-gradient(155deg,#142031,#0f1825)", boxShadow: "0 7px 20px rgba(0,0,0,.22)" }}>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span aria-hidden="true" style={{ flexShrink: 0, color: disc.affiliate ? T.gold : T.orange, fontSize: 13 }}>🏷</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 8.5, letterSpacing: ".13em", textTransform: "uppercase", color: disc.affiliate ? T.gold : T.muted, fontWeight: 900 }}>{c.business}{c.area ? ` · ${c.area}` : ""}</span>
          {disc.affiliate ? <span style={{ flexShrink: 0, padding: "2px 6px", borderRadius: 999, background: "rgba(37,194,110,.12)", color: T.green, fontSize: 7.5, fontWeight: 900, letterSpacing: ".06em" }}>PARTNER</span> : null}
          {seal ? <span style={{ marginLeft: "auto", flexShrink: 0, padding: "4px 7px", borderRadius: 8, border: "1px solid rgba(242,201,76,.58)", color: T.gold, background: "rgba(242,201,76,.08)", fontSize: 10.5, fontWeight: 950, lineHeight: 1 }}>{seal.big} <small style={{ fontSize: 7, letterSpacing: ".06em" }}>{seal.small}</small></span> : null}
        </div>
        <h2 style={{ margin: "5px 0 0", color: T.text, fontSize: 16.5, lineHeight: 1.16, letterSpacing: "-.2px", fontWeight: 850, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.title}</h2>
        {c.details ? <p style={{ margin: "5px 0 0", color: T.muted, fontSize: 11.5, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.details}</p> : null}

        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 8, minWidth: 0 }}>
          {c.code ? (
            <button onClick={() => copyCouponCode(c.code)} aria-label={`Copy coupon code ${c.code}`} style={{ maxWidth: "100%", border: "1px dashed rgba(255,179,92,.62)", borderRadius: 8, background: "#0a111b", color: "#ffbd74", padding: "5px 8px", fontSize: 10, fontWeight: 900, letterSpacing: ".08em", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis" }}>{c.code} · COPY</button>
          ) : null}
          {ends ? <span style={{ fontSize: 10, color: T.light }}>{ends}</span> : null}
          {proof ? <span style={{ fontSize: 10, color: T.gold }}>{proof}</span> : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 34px minmax(86px,1fr)", gap: 7, marginTop: 10, minWidth: 0 }}>
          <button onClick={() => toggleSaveCoupon(c)} aria-label={isSaved ? "Remove clipped deal" : "Clip deal for later"} style={{ minWidth: 72, height: 36, borderRadius: 10, border: isSaved ? "1px solid rgba(255,107,24,.78)" : `1px solid ${T.border}`, background: isSaved ? "rgba(255,107,24,.14)" : "#0b1320", color: isSaved ? "#ff9a5c" : T.light, fontSize: 11.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>{isSaved ? "✓ Clipped" : "+ Clip"}</button>
          <button onClick={() => { try { shareCoupon(c); } catch (e) {} }} aria-label="Share deal" title="Share deal" style={{ width: 34, height: 36, borderRadius: 10, border: `1px solid ${T.border}`, background: "#0b1320", color: T.light, display: "grid", placeItems: "center", cursor: "pointer" }}><ShareGlyph /></button>
          {c.url ? (
            <a
              href={c.url} target="_blank" rel="noreferrer sponsored nofollow"
              onClick={(e) => {
                e.preventDefault();
                const clickId = mintClickId();
                let live = (e.currentTarget && e.currentTarget.href) || c.url;
                if (live && live.startsWith("/api/")) {
                  const sep = live.includes("?") ? "&" : "?";
                  live = live + sep + "click_id=" + encodeURIComponent(clickId);
                }
                try { logEvent("coupon_out", null, { id: c.id }); } catch (er) {}
                if (cctx) { try { emitCommerce("commerce_cta_clicked", { ...cctx, click_id: clickId }); } catch (er) {} }
                try { emitCommerce("card_clicked", cardCtx); } catch (er) {}
                openExternal(live);
              }}
              style={{ minWidth: 0, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 9px", overflow: "hidden", color: "#fff", background: `linear-gradient(180deg,${T.orange},${T.orange2})`, boxShadow: "0 5px 14px rgba(230,83,18,.28)", textDecoration: "none", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 11.5, fontWeight: 900 }}
            >{c.cta || "Use deal"} →</a>
          ) : <span style={{ minWidth: 0, height: 36, display: "grid", placeItems: "center", color: T.muted, fontSize: 10.5 }}>Show at checkout</span>}
        </div>
        <div style={{ marginTop: 7, minHeight: 13, color: T.hint, fontSize: 8.5, lineHeight: 1.35 }}>
          {disc.affiliate ? <>{disc.before}<i>{disc.italic}</i>{disc.after}</> : <>Verified at source · no affiliate relationship.</>}
        </div>
      </div>
    </article>
  );
}

export default function CouponsScreen({ ctx }) {
  const { cpnOffers, center, savedCoupons, walletOpen, setWalletOpen } = ctx;
  const today = siteTodayStr();
  const all = [...new Map([...COUPONS, ...(Array.isArray(cpnOffers) ? cpnOffers : [])].map((c) => [c.id, c])).values()];
  const { featured, ledger } = dealTiers(all, today, center);
  const registered = new Map(all.map((c) => [c.id, c]));
  const clipped = Object.entries(savedCoupons || {})
    .sort((a, b) => Number((b[1] && b[1].ts) || 0) - Number((a[1] && a[1].ts) || 0))
    .map(([id]) => registered.get(id))
    .filter((c) => c && couponIsLive(c, today));
  const visibleCount = featured.length + ledger.length;

  return (
    <main style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "clip", boxSizing: "border-box" }}>
      <header style={{ padding: "12px 4px 3px", textAlign: "left" }}>
        <div style={{ color: T.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".2em", textTransform: "uppercase" }}>Wayfind coupons</div>
        <h1 style={{ margin: "7px 0 0", color: T.text, fontSize: 30, lineHeight: 1.02, letterSpacing: "-.8px", fontWeight: 900 }}>Clip it now.<br />Find it later.</h1>
        <p style={{ margin: "9px 0 0", maxWidth: 390, color: T.muted, fontSize: 13, lineHeight: 1.45 }}>Verified local savings and partner offers, kept together so you can use them when the moment is right.</p>
      </header>

      <nav aria-label="Coupon views" style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "15px 0 2px" }}>
        <button onClick={() => setWalletOpen(false)} aria-pressed={!walletOpen} style={{ minWidth: 0, height: 44, borderRadius: 12, border: `1px solid ${!walletOpen ? "rgba(255,107,24,.75)" : T.border}`, background: !walletOpen ? "rgba(255,107,24,.13)" : T.panel, color: !walletOpen ? "#ff9a5c" : T.light, fontWeight: 900, cursor: "pointer" }}>All deals · {visibleCount}</button>
        <button onClick={() => setWalletOpen(true)} aria-pressed={!!walletOpen} aria-label="Tap to open your wallet" style={{ minWidth: 0, height: 44, borderRadius: 12, border: `1px solid ${walletOpen ? "rgba(255,107,24,.75)" : T.border}`, background: walletOpen ? "rgba(255,107,24,.13)" : T.panel, color: walletOpen ? "#ff9a5c" : T.light, fontWeight: 900, cursor: "pointer" }}>Clipped · {clipped.length}</button>
      </nav>

      {walletOpen ? (
        clipped.length ? (
          <section aria-label="Clipped coupons">
            <TierHead title="Your clipped deals" count={clipped.length} hint="Newest first" />
            <div style={{ display: "grid", gap: 10, width: "100%", minWidth: 0 }}>
              {clipped.map((c, i) => <CouponCard key={c.id} c={c} position={i + 1} ctx={ctx} />)}
            </div>
          </section>
        ) : (
          <div style={{ marginTop: 22, padding: "34px 22px", borderRadius: 16, border: `1px dashed ${T.border}`, background: T.bg, textAlign: "center" }}>
            <div aria-hidden="true" style={{ fontSize: 32 }}>🏷</div>
            <strong style={{ display: "block", marginTop: 9, color: T.text }}>Your clipped deals will live here</strong>
            <span style={{ display: "block", marginTop: 5, color: T.muted, fontSize: 12.5, lineHeight: 1.45 }}>Open All deals and tap Clip. Wayfind keeps the offer handy for later.</span>
            <button onClick={() => setWalletOpen(false)} style={{ marginTop: 14, height: 38, padding: "0 16px", border: 0, borderRadius: 10, background: T.orange, color: "#fff", fontWeight: 900, cursor: "pointer" }}>Browse deals</button>
          </div>
        )
      ) : (
        <>
          {featured.length > 0 ? (
            <section aria-label="Partner savings">
              <TierHead title="Partner savings" count={featured.length} hint="May earn commission" />
              <div style={{ display: "grid", gap: 10, width: "100%", minWidth: 0 }}>
                {featured.map((c, i) => <CouponCard key={c.id} c={c} position={i + 1} ctx={ctx} />)}
              </div>
            </section>
          ) : null}

          {ledger.length > 0 ? (
            <section aria-label="Free and local offers">
              <TierHead title="Free & local" count={ledger.length} hint="No commission" />
              <div style={{ display: "grid", gap: 10, width: "100%", minWidth: 0 }}>
                {ledger.map((c, i) => <CouponCard key={c.id} c={c} position={featured.length + i + 1} ctx={ctx} />)}
              </div>
            </section>
          ) : null}

          {visibleCount === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 24px", color: T.hint }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>🏷</div>
              <strong style={{ display: "block", color: T.light, marginBottom: 5 }}>New local deals land here</strong>
              <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>Wayfind only publishes offers it can verify and redeem.</span>
            </div>
          ) : null}
        </>
      )}

      {visibleCount > 0 ? (
        <p style={{ color: T.hint, fontSize: 10.5, textAlign: "center", margin: "22px 10px 0", lineHeight: 1.55 }}>Every offer is checked at its source and removed when it expires. Partner cards are labeled; commissions never change your price or Wayfind rankings.</p>
      ) : null}
    </main>
  );
}
