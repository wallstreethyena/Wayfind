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
//
// v6.90 — owner: "show me if these coupons can be enhanced a little bit, it
// looks overwhelming and hard to read." Root cause was a typography scale with
// ~10 distinct font sizes fighting for attention in one dense column, and a
// private palette (T) that drifted from the app's real brand accent. This pass
// keeps every guarded literal (scripts/check-deal-sheet.mjs,
// test-coupon-wallet.mjs, test-coupon-geo.mjs, check-clipp-deals.mjs,
// test-card-analytics.mjs — see comments inline) and changes only what those
// guards leave open: a tightened 5-step type scale, the seal promoted to one
// clear visual anchor per card, the palette pulled back toward kit.js's real
// brand accent (#F97316) instead of a near-duplicate orange, and more
// consistent vertical rhythm so the eye has fewer places to stop.
import { useEffect, useRef, useState } from "react";
import CardPhoto from "../CardPhoto.js";
import { parseCouponValue } from "../../../lib/couponValue";
import { COUPONS, couponIsLive } from "../../../lib/coupons";
import { siteTodayStr } from "../../../lib/siteTime";
import { emitCommerce, rankBucket, mintClickId } from "../../../lib/commerce";
import { useCommerceImpression } from "../useCommerceImpression";
import {
  dealTiers, dealSeal, dealEndsLabel, dealProofPoint, dealDisclosure,
  dealScope, coveredMetros, metroLabel, auditHiddenOffers, areaStateFor, AREA_PATIENCE_MS,
  dealsByArea, STATEWIDE_PER_AREA,
} from "../../../lib/dealSheet";
import { nearestMetro } from "../../../lib/orderInFeatured";

const COUPON_CARD_EXPERIMENT = "coupon_wallet_v2";

// Pulled back toward kit.js's real brand tokens (bg #040810-family, accent
// #F97316, green #22C55E, text/muted/light) instead of a private near-miss
// palette, so this screen reads as the same app as everywhere else.
const T = {
  bg: "#0a0f18", panel: "#121a27", panel2: "#17212f", border: "#28374a",
  text: "#F7F9FC", light: "#CBD5E1", muted: "#94A3B8", hint: "#7C899D",
  orange: "#F97316", orange2: "#DB4C0C", green: "#22C55E", gold: "#E8C97A",
};

const ShareGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
  </svg>
);

// v1.00 (2026-08-08): market-level (non-merchant) cards — CLIPP_COUPONS,
// CITYPASS_COUPONS — carry neither a venuePhotoRef (no single venue) nor an
// icon, so their identity tile renders nothing today. This fetches a real
// city+category-matched Pexels photo for them via the same-origin
// /api/market-photo route (server-side cget/cset-cached ~21 days already —
// see lib/stockPhoto.js — so most calls here resolve from that cache, not a
// live Pexels hit). Fails soft to null on any error, matching the tile's
// existing "no photo, no icon -> no tile" behavior exactly.
//
// Module-scope Map, not localStorage/sessionStorage: an in-memory cache is
// enough to de-dupe the handful of distinct queries (one per market) across
// however many cards render in a tab's lifetime, and clearing on reload is
// fine since the server-side cache is the durable layer.
const _marketPhotoCache = new Map();
function useMarketPhoto(query) {
  const [url, setUrl] = useState(() => (query && _marketPhotoCache.has(query) ? _marketPhotoCache.get(query) : null));
  useEffect(() => {
    if (!query || _marketPhotoCache.has(query)) return;
    let cancelled = false;
    fetch("/api/market-photo?q=" + encodeURIComponent(query))
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((data) => {
        const u = (data && data.url) || null;
        _marketPhotoCache.set(query, u);
        if (!cancelled) setUrl(u);
      })
      .catch(() => { _marketPhotoCache.set(query, null); if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [query]);
  return url;
}

function TierHead({ title, count, hint, tone }) {
  const dot = tone === "green" ? T.green : T.gold;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "26px 1px 12px", minWidth: 0 }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: dot }} />
      <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: T.light, fontWeight: 900 }}>{title}</span>
      <span style={{ flexShrink: 0, minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, display: "grid", placeItems: "center", background: "#202b3b", color: T.muted, fontSize: 10.5, fontWeight: 850 }}>{count}</span>
      <span aria-hidden="true" style={{ flex: 1, minWidth: 10, height: 1, background: "linear-gradient(90deg,rgba(148,163,184,.3),transparent)" }} />
      <span style={{ flexShrink: 0, fontSize: 10, color: T.hint }}>{hint}</span>
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
  // Venue thumb (owner-approved 2026-08-07): a 52px identity tile so the eye
  // can tell WHAT the deal is for without reading. Photo only when the registry
  // row carries the venue's own location-verified Google photoRef (rendered via
  // our cached same-origin /api/photo proxy — never a partner or merchant
  // host); otherwise the row's explicit category icon. Data-driven both ways —
  // nothing here is inferred from intents, same rule as dealArtwork.
  // v8.19 (owner: "the coupons were fetching images — not sure what
  // happened"). A stored photo REF expires (the v8.17 lesson); the venue's
  // placeId doesn't. Ref still first (zero extra lookups while fresh), then
  // the placeId path (/api/photo?place= → current first photo, 24h-cached
  // details) — which also gives the static registry rows (Ringling, LECOM,
  // Mote…) a venue thumb for the first time via their new venuePlaceId.
  const thumbPid = [c.venuePlaceId, c.placeId].find((v) => typeof v === "string" && /^[A-Za-z0-9_-]{10,}$/.test(v)) || null;
  const thumbPhoto = typeof c.venuePhotoRef === "string" && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(c.venuePhotoRef)
    ? // v7.15 (owner: "the images for the coupons look very pixalated") —
      // the tile renders ~250px wide at full card height, object-fit cover,
      // so a 160px source was upscaled ~3x on retina. 560 covers 2x DPR of
      // the rendered box; /api/photo caches per (ref,w) so cost is one
      // upstream fetch per venue, same as before.
      "/api/photo?ref=" + encodeURIComponent(c.venuePhotoRef) + "&g=2&w=560"
    : thumbPid
    ? "/api/photo?place=" + encodeURIComponent(thumbPid) + "&g=2&w=560"
    : null;
  const thumbIcon = !thumbPhoto && typeof c.icon === "string" && c.icon ? c.icon : null;
  // Market-level fallback (v1.00, 2026-08-08): only asked for when this row
  // has neither a venue photo nor an icon — see useMarketPhoto above.
  const marketPhoto = useMarketPhoto(!thumbPhoto && !thumbIcon && typeof c.marketPhotoQuery === "string" ? c.marketPhotoQuery : null);
  const effectiveThumb = thumbPhoto || marketPhoto;
  const hasArt = !!effectiveThumb;
  const variant = thumbPhoto ? "clip_venue_art" : marketPhoto ? "clip_market_art" : "clip_no_art";
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
    <article ref={impRef} style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", overflow: "hidden", border: `1px solid ${isSaved ? "rgba(249,115,22,.65)" : T.border}`, borderLeft: `4px solid ${isSaved ? T.orange : disc.affiliate ? T.gold : "#3c4b61"}`, borderRadius: 17, padding: 0, background: "linear-gradient(145deg,rgba(255,255,255,.035),transparent 36%),#111824", boxShadow: "0 14px 36px rgba(0,0,0,.27), inset 0 1px rgba(255,255,255,.035)" }}>
      <div style={{ display: "grid", gridTemplateColumns: (effectiveThumb || thumbIcon) ? "96px minmax(0,1fr)" : "minmax(0,1fr)", alignItems: "stretch", minWidth: 0 }}>
          {/* Venue identity BAND — the .wf-place-card-layout language (owner,
              2026-08-12: coupon cards read like place cards). Same single
              image slot, same sources, in the same order as the old 52px
              tile: the row's own verified photoRef via /api/photo, else the
              Pexels market photo via /api/market-photo (city+category-matched,
              market-level rows only), else the explicit category emoji on the
              place-card monogram surface. */}
          {(effectiveThumb || thumbIcon) ? (
            <div style={{ position: "relative", minWidth: 0, height: "100%", overflow: "hidden", display: "grid", placeItems: "center", background: "radial-gradient(circle at 35% 24%,rgba(255,121,24,.18),transparent 35%),linear-gradient(155deg,#192230,#0D131E 72%)", boxShadow: "inset -1px 0 rgba(159,177,203,.1)" }}>
              {effectiveThumb
                ? <CardPhoto inLink src={effectiveThumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                : <span aria-hidden="true" style={{ fontSize: 30, lineHeight: 1 }}>{thumbIcon}</span>}
            </div>
          ) : null}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", padding: "13px 14px 12px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                <span aria-hidden="true" style={{ flexShrink: 0, color: disc.affiliate ? T.gold : T.orange, fontSize: 12.5 }}>🏷</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: T.orange, fontWeight: 900 }}>{c.business}{c.area ? ` · ${c.area}` : ""}</span>
                {disc.affiliate ? <span style={{ flexShrink: 0, padding: "2px 6px", borderRadius: 999, background: "rgba(34,197,94,.14)", color: T.green, fontSize: 8, fontWeight: 900, letterSpacing: ".05em" }}>PARTNER</span> : null}
              </div>
              {/* The seal is the one visual anchor per card — everything else in this
                  header stays small and quiet so this is the thing the eye lands on. */}
              {seal ? <span style={{ flexShrink: 0, padding: "5px 9px", borderRadius: 9, border: "1px solid rgba(232,201,122,.55)", color: T.gold, background: "rgba(232,201,122,.1)", fontSize: 12.5, fontWeight: 950, lineHeight: 1.1, whiteSpace: "nowrap" }}>{seal.big} <small style={{ fontSize: 7.5, letterSpacing: ".05em" }}>{seal.small}</small></span> : null}
            </div>
            {(() => {
              // v6.99 (owner): the VALUE leads. "Get $20 of coffee — pay $10,
              // save 50%" reads in one glance; the old raw title ("$10 for
              // $20 of coffee & more") made the reader do the math. Derived
              // from the verified title via the shared parser — the card, the
              // share text and the share-card image all say the same numbers.
              const v = parseCouponValue(c.title);
              if (!v) return <h2 style={{ margin: "8px 0 0", color: T.text, fontSize: 17, lineHeight: 1.22, letterSpacing: "-.2px", fontWeight: 800, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.title}</h2>;
              return (
                <div style={{ margin: "8px 0 0" }}>
                  <h2 style={{ margin: 0, color: T.text, fontSize: 19, lineHeight: 1.18, letterSpacing: "-.3px", fontWeight: 800, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{"Get " + v.getLabel + (v.what ? " of " + v.what : "")}</h2>
                  <div style={{ marginTop: 3, color: "#FFB35C", fontSize: 14, fontWeight: 900, letterSpacing: "-.1px" }}>{"Pay " + v.payLabel + " · save " + v.saveLabel + " (" + v.pct + "% off)"}</div>
                </div>
              );
            })()}
        {c.details ? <p style={{ margin: "5px 0 0", color: T.light, fontSize: 12.5, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.details}</p> : null}

        {(c.code || ends || proof) ? (
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 10, minWidth: 0 }}>
            {c.code ? (
              <button onClick={() => copyCouponCode(c.code)} aria-label={`Copy coupon code ${c.code}`} style={{ maxWidth: "100%", border: "1px dashed rgba(255,179,92,.62)", borderRadius: 8, background: "#0a111b", color: "#ffbd74", padding: "5px 9px", fontSize: 10.5, fontWeight: 900, letterSpacing: ".07em", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis" }}>{c.code} · COPY</button>
            ) : null}
            {ends ? <span style={{ padding: "5px 2px", fontSize: 10.5, color: T.light }}>{ends}</span> : null}
            {proof ? <span style={{ padding: "5px 2px", fontSize: 10.5, color: T.gold, fontWeight: 700 }}>{proof}</span> : null}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "auto 34px minmax(86px,1fr)", gap: 7, marginTop: 12, minWidth: 0 }}>
          <button onClick={() => toggleSaveCoupon(c)} aria-label={isSaved ? "Remove clipped deal" : "Clip deal for later"} style={{ minWidth: 74, height: 38, borderRadius: 10, border: isSaved ? "1px solid rgba(249,115,22,.75)" : `1px solid ${T.border}`, background: isSaved ? "rgba(249,115,22,.14)" : "#0b1320", color: isSaved ? "#ffa25f" : T.light, fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>{isSaved ? "✓ Clipped" : "+ Clip"}</button>
          <button onClick={() => { try { shareCoupon(c); } catch (e) {} }} aria-label="Share deal" title="Share deal" style={{ width: 34, height: 38, borderRadius: 10, border: `1px solid ${T.border}`, background: "#0b1320", color: T.light, display: "grid", placeItems: "center", cursor: "pointer" }}><ShareGlyph /></button>
          {c.url ? (
            <a
              href={c.url} target="_blank" rel="noreferrer sponsored nofollow"
              data-commerce-owner="CouponCard"
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
              style={{ minWidth: 0, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 9px", overflow: "hidden", color: "#fff", background: `linear-gradient(180deg,${T.orange},${T.orange2})`, boxShadow: "0 5px 14px rgba(219,76,12,.3)", textDecoration: "none", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 12, fontWeight: 900 }}
            >{c.cta || "Use deal"} →</a>
          ) : <span style={{ minWidth: 0, height: 38, display: "grid", placeItems: "center", color: T.muted, fontSize: 10.5 }}>Show at checkout</span>}
        </div>
        <div style={{ marginTop: 9, minHeight: 13, color: T.hint, fontSize: 10, lineHeight: 1.4 }}>
          {disc.affiliate ? <>{disc.before}<i>{disc.italic}</i>{disc.after}</> : <>Verified at source · no affiliate relationship.</>}
        </div>
        </div>
      </div>
    </article>
  );
}

// Where the deals are being shown for, and how the visitor can change it. The
// metro list comes from coveredMetros() (the registry nearestMetro resolves
// against), and a pick goes through ctx.pickCouponCenter, the home.js manual-pin
// path, so there is no second source of truth for location.
function AreaBar({ state, metroName, ctx, open, setOpen, asked, setAsked }) {
  const metros = coveredMetros();
  const chip = (m) => (
    <button key={m.key} type="button" onClick={() => { try { ctx.pickCouponCenter({ lat: m.lat, lng: m.lng, label: m.label }); } catch (e) {} setOpen(false); }}
      aria-label={"Show deals in " + m.label}
      style={{ minHeight: 38, padding: "0 13px", borderRadius: 999, border: `1px solid ${metroName === m.label ? "rgba(249,115,22,.75)" : T.border}`, background: metroName === m.label ? "rgba(249,115,22,.14)" : "#0b1320", color: metroName === m.label ? "#ffa25f" : T.light, fontSize: 12.5, fontWeight: 850, cursor: "pointer" }}>{m.label}</button>
  );
  if (state === "loading") return null;
  if (state === "known") {
    return (
      <div data-area-state="known" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ minWidth: 0, color: T.light, fontSize: 12.5, fontWeight: 700 }}>Showing deals for {metroName}</span>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={!!open} aria-label="Change area" style={{ flexShrink: 0, minHeight: 32, padding: "0 11px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.panel, color: "#ffa25f", fontSize: 11.5, fontWeight: 900, cursor: "pointer" }}>Change</button>
        </div>
        {open ? <div data-area-picker="metros" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>{metros.map(chip)}</div> : null}
      </div>
    );
  }
  const outside = state === "outside";
  return (
    <div data-area-state={state} role="group" aria-label="Choose your area" style={{ marginTop: 14, padding: "14px 14px 15px", borderRadius: 14, border: `1px solid ${T.border}`, background: T.panel }}>
      <strong style={{ display: "block", color: T.text, fontSize: 14 }}>{outside ? "Pick an area to see local deals" : "Where should we look for deals?"}</strong>
      <span style={{ display: "block", marginTop: 5, color: T.muted, fontSize: 12.5, lineHeight: 1.5 }}>
        {outside
          ? "Your location is outside the areas where Wayfind has local deals. Below are live deals across Florida, listed by area. Choose one to see only that area."
          : "We do not know your area yet. Below are live deals across Florida, listed by area. Choose yours to see only that area, or share your location."}
      </span>
      <div data-area-picker="metros" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 11 }}>{metros.map(chip)}</div>
      <button type="button" onClick={() => { setAsked(true); try { ctx.recenterToMe && ctx.recenterToMe(); } catch (e) {} }} style={{ marginTop: 11, minHeight: 40, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(249,115,22,.65)", background: "rgba(249,115,22,.14)", color: "#ffa25f", fontSize: 12.5, fontWeight: 900, cursor: "pointer" }}>Use my location</button>
      {asked ? <span role="status" style={{ display: "block", marginTop: 8, color: T.hint, fontSize: 11.5, lineHeight: 1.45 }}>Waiting for your device. If nothing changes, location may be blocked, so pick an area above.</span> : null}
    </div>
  );
}

export default function CouponsScreen({ ctx }) {
  const { cpnOffers, center, savedCoupons, walletOpen, setWalletOpen, couponHandoff, user, setAuthOpen } = ctx;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [askedLoc, setAskedLoc] = useState(false);
  // Patience: once the screen has waited AREA_PATIENCE_MS with no center, an
  // unresolved location is treated as unknown so the picker appears (a visitor
  // who denied location while the IP lookup failed otherwise never leaves
  // "Finding your area"). See areaStateFor in lib/dealSheet.js.
  const [waitedMs, setWaitedMs] = useState(0);
  useEffect(() => {
    if (center || ctx.locResolved) return undefined;
    const t = setTimeout(() => setWaitedMs(AREA_PATIENCE_MS), AREA_PATIENCE_MS);
    return () => clearTimeout(t);
  }, [center, ctx.locResolved]);
  const today = siteTodayStr();
  const all = [...new Map([...COUPONS, ...(Array.isArray(cpnOffers) ? cpnOffers : [])].map((c) => [c.id, c])).values()];
  const { featured, ledger } = dealTiers(all, today, center);
  const registered = new Map(all.map((c) => [c.id, c]));
  const clipped = Object.entries(savedCoupons || {})
    .sort((a, b) => Number((b[1] && b[1].ts) || 0) - Number((a[1] && a[1].ts) || 0))
    .map(([id]) => registered.get(id))
    .filter((c) => c && couponIsLive(c, today));
  const visibleCount = featured.length + ledger.length;

  // What we honestly know about the viewer's area. Four facts, never invented:
  //   loading  : no center yet AND location has not finished resolving
  //   unknown  : location resolved to nothing usable (denied, blocked, failed)
  //   outside  : a real location, but outside every covered metro
  //   known    : inside a covered metro (a manual pick lands here too)
  const centerKnown = !!(center && isFinite(center.lat) && isFinite(center.lng));
  const metroKey = centerKnown ? nearestMetro(center.lat, center.lng) : null;
  const metroName = metroLabel(metroKey);
  const areaState = areaStateFor({ metroKey, centerKnown, locResolved: ctx.locResolved, waitedMs });
  const offersLoading = ctx.cpnOffersStatus === "loading";
  const partnerHidden = ctx.cpnOffersStatus === "failed" || auditHiddenOffers(all, today, metroKey).length > 0;
  const where = metroName ? " in " + metroName : "";
  // STATEWIDE (owner decision 2026-10-29): location unknown or outside every
  // covered metro -> every live, placed Florida deal, grouped under the heading
  // of the area it is good in (plus nationwide offers first). Never framed as
  // nearby; dealTiers() stays the proximity sheet for a known area.
  const statewide = areaState === "unknown" || areaState === "outside";
  const areaGroups = statewide ? dealsByArea(all, today) : [];
  const statewideCount = areaGroups.reduce((n, g) => n + g.deals.length, 0);
  const [expandedAreas, setExpandedAreas] = useState({});
  const shownCount = statewide ? statewideCount : visibleCount;

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "clip", boxSizing: "border-box" }}>
      <header style={{ padding: "12px 4px 3px", textAlign: "left" }}>
        <div style={{ color: T.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".2em", textTransform: "uppercase" }}>Wayfind coupons</div>
        <h1 style={{ margin: "7px 0 0", color: T.text, fontSize: 30, lineHeight: 1.06, letterSpacing: "-.8px", fontWeight: 900 }}>Clip it now.<br />Find it later.</h1>
        <p style={{ margin: "9px 0 0", maxWidth: 390, color: T.muted, fontSize: 13, lineHeight: 1.5 }}>Verified local savings and partner offers, kept together so you can use them when the moment is right.</p>
        {statewide && statewideCount > 0
          ? <p data-coupon-mode="statewide" style={{ margin: "8px 0 0", color: T.hint, fontSize: 11, fontWeight: 700 }}>{statewideCount} verified {statewideCount === 1 ? "offer" : "offers"} across Florida, by area · no ads, ever</p>
          : visibleCount > 0 ? <p style={{ margin: "8px 0 0", color: T.hint, fontSize: 11, fontWeight: 700 }}>{visibleCount} verified {metroName ? "" : "nationwide "}{visibleCount === 1 ? "offer" : "offers"}{where} · no ads, ever</p> : null}
      </header>

      <nav aria-label="Coupon views" style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "16px 0 2px" }}>
        <button onClick={() => setWalletOpen(false)} aria-pressed={!walletOpen} style={{ minWidth: 0, height: 46, borderRadius: 12, border: `1px solid ${!walletOpen ? "rgba(249,115,22,.7)" : T.border}`, background: !walletOpen ? "rgba(249,115,22,.13)" : T.panel, color: !walletOpen ? "#ffa25f" : T.light, fontSize: 13.5, fontWeight: 900, cursor: "pointer" }}>All deals · {shownCount}</button>
        <button onClick={() => setWalletOpen(true)} aria-pressed={!!walletOpen} aria-label="Tap to open your wallet" style={{ minWidth: 0, height: 46, borderRadius: 12, border: `1px solid ${walletOpen ? "rgba(249,115,22,.7)" : T.border}`, background: walletOpen ? "rgba(249,115,22,.13)" : T.panel, color: walletOpen ? "#ffa25f" : T.light, fontSize: 13.5, fontWeight: 900, cursor: "pointer" }}>Clipped · {clipped.length}</button>
      </nav>

      {walletOpen && couponHandoff && couponHandoff.saved ? (
        <div role="status" aria-live="polite" style={{ marginTop: 14, padding: "13px 14px", borderRadius: 13, border: "1px solid rgba(34,197,94,.5)", background: "linear-gradient(135deg,rgba(34,197,94,.14),rgba(17,27,41,.96))", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: "block", color: T.text, fontSize: 13 }}>✓ Saved to Clipped</strong>
            <span style={{ display: "block", marginTop: 3, color: T.muted, fontSize: 11, lineHeight: 1.4 }}>{user ? "Available from your Wayfind account." : "Saved on this device. Sign in to keep it across devices."}</span>
          </span>
          {!user ? <button onClick={() => setAuthOpen(true)} style={{ flexShrink: 0, minHeight: 34, padding: "0 11px", borderRadius: 10, border: "1px solid rgba(249,115,22,.65)", background: "rgba(249,115,22,.14)", color: "#ffa25f", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>Sign in to sync</button> : null}
        </div>
      ) : null}

      {walletOpen ? (
        clipped.length ? (
          <section aria-label="Clipped coupons">
            <TierHead title="Your clipped deals" count={clipped.length} hint="Newest first" tone="green" />
            <div style={{ display: "grid", gap: 10, width: "100%", minWidth: 0 }}>
              {clipped.map((c, i) => <CouponCard key={c.id} c={c} position={i + 1} ctx={ctx} />)}
            </div>
          </section>
        ) : (
          <div style={{ marginTop: 24, padding: "36px 22px", borderRadius: 16, border: `1px dashed ${T.border}`, background: T.bg, textAlign: "center" }}>
            <div aria-hidden="true" style={{ fontSize: 32 }}>🏷</div>
            <strong style={{ display: "block", marginTop: 10, color: T.text, fontSize: 14 }}>Your clipped deals will live here</strong>
            <span style={{ display: "block", marginTop: 6, color: T.muted, fontSize: 12.5, lineHeight: 1.5 }}>Open All deals and tap Clip. Wayfind keeps the offer handy for later.</span>
            <button onClick={() => setWalletOpen(false)} style={{ marginTop: 15, height: 40, padding: "0 18px", border: 0, borderRadius: 10, background: T.orange, color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>Browse deals</button>
          </div>
        )
      ) : (
        <>
          <AreaBar state={areaState} metroName={metroName} ctx={ctx} open={pickerOpen} setOpen={setPickerOpen} asked={askedLoc} setAsked={setAskedLoc} />
          {partnerHidden ? (
            <p data-deals-note="partner-unavailable" role="status" style={{ margin: "12px 0 0", padding: "9px 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.bg, color: T.muted, fontSize: 11.5, lineHeight: 1.45 }}>Some partner offers are temporarily unavailable. They will return when they are checked again.</p>
          ) : null}
          {statewide ? (() => {
            // Position = rank in the FULL grouped list, so expanding one area never
            // shifts another card's rank_bucket (which would re-arm its impression).
            let offset = 0;
            return areaGroups.map((g) => {
              const base = offset;
              offset += g.deals.length;
              const open = !!expandedAreas[g.metro];
              const everywhere = g.metro === "everywhere";
              const shown = everywhere || open ? g.deals : g.deals.slice(0, STATEWIDE_PER_AREA);
              return (
                <section key={g.metro} data-deal-area={g.metro} aria-label={everywhere ? "Deals good anywhere" : "Deals in " + g.label}>
                  <TierHead title={everywhere ? "Good anywhere" : g.label} count={g.deals.length} hint={everywhere ? "Valid nationwide" : "Deals in this area"} tone="gold" />
                  <div style={{ display: "grid", gap: 10, width: "100%", minWidth: 0 }}>
                    {shown.map((c, i) => <CouponCard key={c.id} c={c} position={base + i + 1} ctx={ctx} />)}
                  </div>
                  {!everywhere && g.deals.length > STATEWIDE_PER_AREA ? (
                    <button type="button" data-see-all={g.metro} aria-expanded={open} onClick={() => setExpandedAreas({ ...expandedAreas, [g.metro]: !open })}
                      style={{ marginTop: 10, width: "100%", minHeight: 40, borderRadius: 10, border: `1px solid ${T.border}`, background: T.panel, color: "#ffa25f", fontSize: 12.5, fontWeight: 900, cursor: "pointer" }}>
                      {open ? "Show fewer " + g.label + " deals" : "See all " + g.deals.length + " " + g.label + " deals"}
                    </button>
                  ) : null}
                </section>
              );
            });
          })() : null}

          {!statewide && featured.length > 0 ? (
            <section aria-label="Partner savings">
              <TierHead title={"Partner savings" + where} count={featured.length} hint="May earn commission" tone="gold" />
              <div style={{ display: "grid", gap: 10, width: "100%", minWidth: 0 }}>
                {featured.map((c, i) => <CouponCard key={c.id} c={c} position={i + 1} ctx={ctx} />)}
              </div>
            </section>
          ) : null}

          {!statewide && ledger.length > 0 ? (
            <section aria-label="Free and local offers">
              <TierHead title={"Free & local" + where} count={ledger.length} hint="No commission" tone="green" />
              <div style={{ display: "grid", gap: 10, width: "100%", minWidth: 0 }}>
                {ledger.map((c, i) => <CouponCard key={c.id} c={c} position={featured.length + i + 1} ctx={ctx} />)}
              </div>
            </section>
          ) : null}

          {shownCount === 0 ? (() => {
            // Exactly one reason, chosen from what the code actually knows.
            const reason = areaState === "loading" ? "locating"
              : offersLoading ? "offers-loading"
              : areaState === "known" ? "metro-empty"
              : "needs-area";
            const copy = {
              "locating": ["Finding your area", "Looking for deals near you. This takes a moment."],
              "offers-loading": ["Loading deals", "Checking the latest offers now."],
              "metro-empty": ["No verified deals in " + metroName + " right now", "Offers that are good anywhere show here when they exist. New local deals land here as soon as they are verified."],
              "needs-area": ["Choose an area to see deals", "Local deals are tied to where you are. Pick an area above and they will show up here."],
            }[reason];
            return (
              <div data-deals-state={reason} style={{ textAlign: "center", padding: "44px 24px", color: T.hint }}>
                <div style={{ fontSize: 38, marginBottom: 10 }}>🏷</div>
                <strong style={{ display: "block", color: T.light, marginBottom: 5, fontSize: 14 }}>{copy[0]}</strong>
                <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{copy[1]} Wayfind only publishes offers it can verify and redeem.</span>
              </div>
            );
          })() : null}
        </>
      )}

      {shownCount > 0 ? (
        <p style={{ color: T.hint, fontSize: 10.5, textAlign: "center", margin: "24px 10px 0", lineHeight: 1.6 }}>Every offer is checked at its source and removed when it expires. Partner cards are labeled; commissions never change your price or Wayfind rankings.</p>
      ) : null}
    </div>
  );
}
