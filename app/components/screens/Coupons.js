"use client";
// CouponsScreen — "The Deal Sheet".
//
// Design contract: docs/mocks/coupons-deal-sheet-mock.html (owner-signed, committed
// beside this file). Values below are LIFTED from that mock's CSS, not
// approximated. Deviations are listed in the PR, each with its reason.
//
// TWO TIERS, BOTH DERIVED. lib/dealSheet.js makes every decision — tier, seal,
// schedule, proof point, disclosure, artwork. This file draws. That split is what
// makes the work order's two hard rules checkable: the tiers are derived and never
// hand-sorted, and an unregistered deal cannot render, because dealTiers() only
// ever partitions the array it is given.
//
// THE FOOTER IS PINNED, AND THAT IS THE POINT OF THE FLEX COLUMN. Card bodies are
// flex-column with the footer at margin-top:auto, so every CTA and every
// disclosure lands on ONE baseline across the rail regardless of the content above
// it. The code-chip card is the test case — it carries an extra element and must
// still line up.
//
// ONE PROVIDER PER CARD, EVER (owner rule, 2026-07-30). A card maps to exactly one
// offer id, one provider, one /api/commerce/go resolution. Two monetized hrefs on
// one card is double attribution, and it is also a lie about who you are buying
// from. There is exactly ONE monetized anchor in this file — the CTA — and
// scripts/check-deal-sheet.mjs counts them.
import { useRef, useEffect } from "react";
import { COUPONS } from "../../../lib/coupons";
import { siteTodayStr } from "../../../lib/siteTime";
import { emitCommerce, rankBucket, mintClickId } from "../../../lib/commerce";
import { useCommerceImpression } from "../useCommerceImpression";
import {
  dealTiers, dealSeal, dealEndsLabel, dealProofPoint, dealSchedule, dealDisclosure, dealArtwork,
} from "../../../lib/dealSheet";

/* ── tokens, lifted from the mock's :root and rules ───────────────────────── */
const T = {
  gold: "#b98a2f", goldSoft: "#d8c39a", amber: "#ffb35c",
  coral: "#e8632e", coralDeep: "#c94f1f",
  kick: "#a8935f", muted: "#9aa3b2", hint: "#8a93a4", ends: "#c8b98a",
  serif: "Georgia,'Times New Roman',serif",
  dots: "1px dotted rgba(200,194,178,.3)",
};
const RULE = { height: 3, borderTop: "1px solid rgba(216,195,154,.5)", borderBottom: "1px solid rgba(216,195,154,.16)", flex: 1, alignSelf: "center" };

function TierHead({ title, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 11, margin: "26px 0 12px" }}>
      <span aria-hidden="true" style={{ color: T.amber, fontSize: 13 }}>❧</span>
      <span style={{ fontFamily: T.serif, fontSize: 18, fontStyle: "italic", color: "#f3ecdc" }}>{title}</span>
      <span aria-hidden="true" style={RULE} />
      <span style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: T.hint, fontWeight: 700 }}>{hint}</span>
    </div>
  );
}

const ShareGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
  </svg>
);

/* ── the poster card ──────────────────────────────────────────────────────── */

function PosterCard({ c, position, ctx }) {
  const { savedCoupons, toggleSaveCoupon, copyCouponCode, shareCoupon, logEvent, openExternal } = ctx;
  const isSaved = !!savedCoupons[c.id];
  const seal = dealSeal(c);
  const art = dealArtwork(c);
  const disc = dealDisclosure(c);
  const ends = dealEndsLabel(c);
  const proof = dealProofPoint(c);

  // Commerce events only for cards that actually earn. An impression on a free
  // community offer would pad the denominator of a monetization rate with rows
  // that can never convert.
  const cctx = disc.affiliate
    ? {
        surface: "coupons",
        provider: (c.commerce && c.commerce.provider) || String(disc.network).toLowerCase(),
        offer_id: (c.commerce && c.commerce.offerId) || c.id,
        content_id: c.id,
        category: "deal",
        rank_bucket: rankBucket(position),
      }
    : null;
  const impRef = useCommerceImpression(cctx);

  const seenRef = useRef(false);
  useEffect(() => {
    if (!cctx || seenRef.current) return;
    seenRef.current = true;
    try { emitCommerce("disclosure_viewed", cctx); } catch (e) {}
  }, [cctx]);

  const SaveBtn = ({ onArt }) => (
    <button
      onClick={() => toggleSaveCoupon(c)}
      aria-label={isSaved ? "Remove saved deal" : "Save deal"}
      style={onArt
        ? { position: "absolute", top: 12, right: 12, zIndex: 5, width: 36, height: 36, borderRadius: "50%", background: isSaved ? "rgba(232,99,46,.9)" : "rgba(16,12,8,.55)", backdropFilter: "blur(3px)", border: isSaved ? "1px solid transparent" : "1px solid rgba(255,255,255,.25)", color: "#fff", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }
        : { flexShrink: 0, background: "none", border: "none", color: isSaved ? T.coral : "#6b7484", fontSize: 15, cursor: "pointer", padding: 0, lineHeight: 1 }}
    >{isSaved ? "♥" : "♡"}</button>
  );

  // Share sits beside the ♡, quiet, reusing the existing handler and its event.
  const ShareBtn = ({ onArt }) => (
    <button
      onClick={() => { try { shareCoupon(c); } catch (e) {} }}
      aria-label="Share deal" title="Share this deal"
      style={onArt
        ? { position: "absolute", top: 12, right: 56, zIndex: 5, width: 36, height: 36, borderRadius: "50%", background: "rgba(16,12,8,.55)", backdropFilter: "blur(3px)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }
        : { flexShrink: 0, background: "none", border: "none", color: "#6b7484", cursor: "pointer", padding: 0, lineHeight: 1, display: "inline-flex" }}
    ><ShareGlyph /></button>
  );

  return (
    <div ref={impRef} style={{ flex: "0 0 316px", scrollSnapAlign: "start", position: "relative", background: "linear-gradient(168deg,#232c3c 0%, #1a212e 100%)", border: "1px solid rgba(185,138,47,.42)", borderRadius: 16, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,.4)", display: "flex", flexDirection: "column" }}>
      <span aria-hidden="true" style={{ position: "absolute", inset: 6, border: "1px solid rgba(185,138,47,.16)", borderRadius: 11, pointerEvents: "none", zIndex: 4 }} />

      {/* Artwork band. ABSENT ENTIRELY when no usable image exists — never a
          placeholder, never a stretched thumbnail (work order). The save/share
          pair moves into the body in that case so neither is ever lost. */}
      {art ? (
        <div style={{ position: "relative", width: "100%", boxSizing: "border-box", aspectRatio: "3 / 2", display: "flex", alignItems: "flex-start", justifyContent: "flex-start", padding: "12px 14px", background: `center/cover no-repeat url(${art})` }}>
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(18,15,10,.6), transparent 60%)" }} />
          {seal ? (
            <div style={{ position: "relative", zIndex: 3, width: 64, height: 64, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, #ffd9a0, ${T.gold} 70%)`, color: "#3a2a08", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, lineHeight: 1, boxShadow: "0 4px 12px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.5)" }}>
              {seal.big}<small style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".08em" }}>{seal.small}</small>
            </div>
          ) : null}
          <ShareBtn onArt />
          <SaveBtn onArt />
        </div>
      ) : null}

      <div style={{ padding: "15px 17px 14px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 9.5, letterSpacing: ".22em", fontWeight: 700, textTransform: "uppercase", color: T.kick, marginBottom: 6 }}>
            {c.business}{c.area ? " · " + c.area : ""}
          </div>
          {!art ? <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}><ShareBtn /><SaveBtn /></div> : null}
        </div>
        <div style={{ fontFamily: T.serif, fontSize: 19.5, color: "#fff", lineHeight: 1.2, marginBottom: 6 }}>{c.title}</div>
        {c.details ? (
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: art ? 2 : 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.details}</div>
        ) : null}

        {c.code ? (
          <div
            onClick={() => copyCouponCode(c.code)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") copyCouponCode(c.code); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start", background: "#10151f", border: "1px dashed rgba(255,179,92,.5)", borderRadius: 9, padding: "7px 12px", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 13, color: T.amber, letterSpacing: ".12em", marginBottom: 12, cursor: "pointer" }}
          >
            {c.code}<small style={{ fontFamily: "-apple-system,sans-serif", fontSize: 10, letterSpacing: ".08em", color: T.hint, textTransform: "uppercase" }}>tap to copy</small>
          </div>
        ) : null}

        {/* THE PINNED FOOTER — margin-top:auto is what puts every CTA and every
            disclosure on one baseline across the rail. */}
        <div style={{ marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
            {ends ? <span style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 12.5, color: T.ends }}>{ends}</span> : null}
            <span aria-hidden="true" style={{ flex: 1, borderBottom: T.dots, transform: "translateY(-3px)" }} />
            {proof ? <span style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 12.5, color: T.amber }}>{proof}</span> : null}
          </div>
          {c.url ? (
            <a
              href={c.url} target="_blank" rel="noreferrer sponsored nofollow"
              onClick={(e) => {
                e.preventDefault();
                const clickId = mintClickId();
                let live = (e.currentTarget && e.currentTarget.href) || c.url;
                // Stamp click_id onto our own redirect URLs so the server reuses it.
                // Direct partner URLs keep it in the commerce event even though the
                // partner cannot receive it; it still lets us join the click to the
                // card/session on our side.
                if (live && live.startsWith("/api/")) {
                  const sep = live.includes("?") ? "&" : "?";
                  live = live + sep + "click_id=" + encodeURIComponent(clickId);
                }
                try { logEvent("coupon_out", null, { id: c.id }); } catch (er) {}
                if (cctx) {
                  try { emitCommerce("commerce_cta_clicked", { ...cctx, click_id: clickId }); } catch (er) {}
                }
                openExternal(live);
              }}
              style={{ display: "block", width: "100%", boxSizing: "border-box", background: `linear-gradient(170deg,#f07a42,${T.coral} 40%,${T.coralDeep})`, color: "#fff", border: "none", borderRadius: 11, padding: "12px 16px", fontSize: 14, fontWeight: 800, letterSpacing: ".02em", cursor: "pointer", boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 8px 20px rgba(201,79,31,.38)", textAlign: "center", textDecoration: "none" }}
            >{c.cta || "Claim deal"} →</a>
          ) : (
            <div style={{ fontSize: 12.5, color: T.hint, textAlign: "center", padding: "12px 0" }}>Mention Wayfind when you order</div>
          )}
          {/* minHeight reserves TWO lines. The footer is bottom-pinned, so a one-line
              non-affiliate disclosure ("Not an affiliate offer — just a good one.",
              15px) let its CTA sit 14px LOWER than the two-line affiliate ones
              (29px). Measured on the live rail at 390px: CTAs at 383px vs 369px
              from card top. Reserving the space makes the CTA baseline match
              across the rail, which is what margin-top:auto was already trying
              to do for the disclosure. */}
          <div style={{ marginTop: 9, minHeight: 29, fontSize: 10.5, color: "#7f8896", textAlign: "center", lineHeight: 1.4 }}>
            {disc.before}<i style={{ fontStyle: "italic", color: T.muted }}>{disc.italic}</i>{disc.after}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── the ledger row ───────────────────────────────────────────────────────── */

function LedgerRow({ c, ctx, today, last }) {
  const { savedCoupons, toggleSaveCoupon, logEvent, openExternal } = ctx;
  const isSaved = !!savedCoupons[c.id];
  const when = dealSchedule(c, today);
  const go = () => {
    if (!c.url) return;
    try { logEvent("coupon_out", null, { id: c.id }); } catch (e) {}
    openExternal(c.url);
  };
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "13px 2px", borderBottom: last ? "none" : "1px solid rgba(255,255,255,.06)" }}>
      <span onClick={go} role={c.url ? "button" : undefined} tabIndex={c.url ? 0 : undefined} onKeyDown={(e) => { if (e.key === "Enter") go(); }} style={{ fontFamily: T.serif, fontSize: 15.5, color: "#f3ecdc", flexShrink: 0, cursor: c.url ? "pointer" : "default" }}>{c.business}</span>
      <span style={{ fontSize: 12.5, color: T.muted, flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
      <span aria-hidden="true" style={{ flex: 1, borderBottom: T.dots, transform: "translateY(-3px)", minWidth: 18 }} />
      {when ? <span style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 12.5, color: T.ends, whiteSpace: "nowrap" }}>{when}</span> : null}
      <button onClick={() => toggleSaveCoupon(c)} aria-label={isSaved ? "Remove saved deal" : "Save deal"} style={{ background: "none", border: "none", color: isSaved ? T.coral : "#6b7484", fontSize: 14, cursor: "pointer", marginLeft: 2, padding: 0, lineHeight: 1 }}>{isSaved ? "♥" : "♡"}</button>
    </div>
  );
}

/* ── the sheet ────────────────────────────────────────────────────────────── */

export default function CouponsScreen({ ctx }) {
  const { cpnOffers, center } = ctx;
  const today = siteTodayStr(); // venue-local day, never UTC (lib/siteTime)
  // The Supabase `offers` rows this tab already merged stay merged — they are
  // registered deals too, entered from the dashboard rather than the file.
  const all = [...COUPONS, ...(Array.isArray(cpnOffers) ? cpnOffers : [])];
  // `center` is the app's persisted location (wf_center -> URL -> geolocation).
  // It only ever feeds ORDER: dealTiers still partitions, so a deal cannot be
  // hidden — or minted — by where the user happens to be standing.
  const { featured, ledger } = dealTiers(all, today, center);

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ fontSize: 11, letterSpacing: ".26em", fontWeight: 700, textTransform: "uppercase", color: T.kick, marginBottom: 10 }}>The Wayfind Deal Sheet</div>
        <h1 style={{ fontFamily: T.serif, fontWeight: 600, fontSize: 40, color: "#fff", lineHeight: 1.05, marginBottom: 8 }}>
          Real deals. <em style={{ fontStyle: "italic", color: T.amber }}>No junk offers.</em>
        </h1>
        <p style={{ fontSize: 14, color: T.muted, maxWidth: "52ch", margin: "0 auto", lineHeight: 1.55 }}>
          Hand-picked at great local places — verified at the source, removed the day they expire. Tap ♡ to keep one.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "18px auto 0", maxWidth: 420 }}>
          <span aria-hidden="true" style={RULE} /><span aria-hidden="true" style={{ color: T.goldSoft, fontSize: 14 }}>❧</span><span aria-hidden="true" style={RULE} />
        </div>
      </div>

      {featured.length > 0 && (
        <>
          <TierHead title="Worth money tonight" hint="Verified this week" />
          <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "4px 2px 12px", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
            {featured.map((c, i) => <PosterCard key={c.id} c={c} position={i + 1} ctx={ctx} />)}
          </div>
        </>
      )}

      {ledger.length > 0 && (
        <>
          <TierHead title="Free &amp; local, standing offers" hint="The ledger" />
          <div style={{ background: "linear-gradient(168deg,#202939 0%, #1a212e 100%)", border: "1px solid rgba(185,138,47,.3)", borderRadius: 16, padding: "8px 22px", boxShadow: "0 10px 28px rgba(0,0,0,.35)" }}>
            {ledger.map((c, i) => <LedgerRow key={c.id} c={c} ctx={ctx} today={today} last={i === ledger.length - 1} />)}
          </div>
        </>
      )}

      {featured.length === 0 && ledger.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: T.hint }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>🏷️</div>
          <strong style={{ display: "block", color: T.goldSoft, marginBottom: 6 }}>New local deals land here</strong>
          <span style={{ fontSize: 13, lineHeight: 1.5, display: "block" }}>Wayfind is signing up local spots now. Every deal here will be real — no junk offers, ever. Check back soon.</span>
        </div>
      )}

      {(featured.length > 0 || ledger.length > 0) && (
        <p style={{ color: "#78818f", fontSize: 12.5, textAlign: "center", marginTop: 26, lineHeight: 1.6 }}>
          <span aria-hidden="true" style={{ color: T.gold }}>◆</span>{" "}
          <b style={{ color: "#a7b0bf" }}>Every deal verified at its source, tracked to its expiry, and removed the day it lapses.</b>{" "}
          Some are affiliate offers — marked where they are, never affecting what you pay or how we rank.
        </p>
      )}
    </div>
  );
}
