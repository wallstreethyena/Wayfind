"use client";
// app/components/SponsoredPlaceCard.js — the card a business PAID for.
//
// Wayfind's first direct advertiser (owner, 2026-08-23). Everything about this
// unit is designed around one idea: a paid card has to be MORE useful than an
// editorial one, not less, or the reader learns to skip anything with the word
// "Sponsored" on it and the inventory is worth nothing by the third advertiser.
//
// So it carries what a reader actually needs to decide — the person they will
// sit with, the live Wayfind Score, the real star rating and review count, how
// far away it is — and it says plainly, twice, that the placement was paid for.
//
// WHAT IS FOR SALE AND WHAT IS NOT
//   For sale: the slot. A business can buy its way into this position.
//   Not for sale: the number. PlaceScoreChip recomputes the Wayfind Score from
//   the venue's real rating and review count, exactly as it does on every other
//   card in the app. The footnote says so in words, because a promise a reader
//   cannot read is not a promise.
//
// GEO: this component never decides who sees it. lib/sponsoredPlaces.js owns the
// gate and home.js only renders what the gate returned, so there is exactly one
// place to audit whether a paid placement is reaching the market it bought.
//
// BUNDLE: reached through next/dynamic from home.js. The home route runs at
// ~498KB gz against a 500KB budget and the gate is false for almost every
// reader on earth, so this file must never be statically imported there.
import { useCommerceImpression } from "./useCommerceImpression";
import { emitCommerce } from "../../lib/commerce";
import { C, RADII, SHADOW, TARGET, TYPE, PlaceScoreChip } from "./kit";

/** Distance, in the same voice the rest of the app uses. */
function miles(d) {
  if (!Number.isFinite(d)) return null;
  return d < 10 ? d.toFixed(1) + " mi" : Math.round(d) + " mi";
}

export default function SponsoredPlaceCard({ pick, onLog }) {
  // The gate already ran in home.js; a falsy pick means "this reader is not in
  // any sponsor's market", which is the overwhelmingly common case.
  const ctx = pick
    ? {
        surface: "home_sponsored_card",
        provider: "direct",
        merchant: pick.advertiser,
        offer_id: pick.id,
        canonical_place_id: pick.placeId,
        disclosure_version: "sponsored-v1",
      }
    : null;
  const seenRef = useCommerceImpression(ctx);
  if (!pick) return null;

  const accent = pick.accent || C.purple;
  const accentLight = pick.accentLight || C.light;
  const person = pick.person || null;
  const dist = miles(pick.distMi);

  const onClick = () => {
    try { emitCommerce("commerce_cta_clicked", ctx); } catch (e) {}
    try { onLog && onLog("sponsor_out", null, { sponsor: pick.id, merchant: pick.advertiser }); } catch (e) {}
  };

  return (
    <section
      ref={seenRef}
      aria-label={"Sponsored — " + pick.advertiser}
      style={{
        marginBottom: 14,
        background: C.card,
        border: "1px solid " + C.border,
        borderRadius: RADII.card,
        overflow: "hidden",
        boxShadow: SHADOW.card,
      }}
    >
      {/* THE MEDIA BAND. aspect-ratio reserves the box before the bytes land,
          so a paid card can never be the thing that shifts the feed under a
          reader's thumb (test-layout-shift's whole subject). */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#10141d" }}>
        {pick.photo ? (
          <img
            src={pick.photo}
            alt={pick.advertiser + " storefront in " + (pick.venueLine || "").split("·").pop().trim()}
            loading="lazy"
            decoding="async"
            // objectPosition is per-sponsor: a cover crop centred by default
            // guillotines the thing that makes a storefront recognisable — its
            // sign. The registry says where the subject actually is.
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: pick.photoPosition || "50% 50%" }}
          />
        ) : null}
        {/* Scrim, so the disclosure stays legible over any photograph a
            business swaps in later. */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,16,.72) 0%, rgba(4,8,16,0) 42%, rgba(4,8,16,.55) 100%)" }}
        />
        {/* DISCLOSURE #1 — above the fold of the card, on the image, first
            thing read. Not a footnote, not a tooltip, not behind a tap. */}
        <span
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            ...TYPE.eyebrow,
            fontSize: 10,
            letterSpacing: ".6px",
            textTransform: "uppercase",
            color: "#FFFFFF",
            background: "rgba(4,8,16,.78)",
            border: "1px solid rgba(255,255,255,.22)",
            borderRadius: RADII.chip,
            padding: "4px 10px",
            lineHeight: 1.3,
          }}
        >
          {pick.label}
        </span>
      </div>

      <div style={{ padding: "12px 14px 14px" }}>
        {/* The person. A studio is a person, and the person is why someone
            taps — but she is a credit, never an endorsement of Wayfind. */}
        {person ? (
          <div style={{ ...TYPE.eyebrow, fontSize: 10, letterSpacing: ".7px", textTransform: "uppercase", color: accentLight, marginBottom: 4 }}>
            {person.name}
            {person.role ? " · " + person.role : ""}
          </div>
        ) : null}

        <div style={{ ...TYPE.title, fontSize: 15.5, color: C.text, marginBottom: 8 }}>{pick.venueLine}</div>

        <div style={{ ...TYPE.display, fontSize: 19, fontWeight: 750, color: C.text, marginBottom: 7 }}>{pick.headline}</div>

        <div style={{ ...TYPE.meta, fontSize: 13.5, color: C.light, marginBottom: 10 }}>{pick.body}</div>

        {/* THE HONEST NUMBERS. The score chip recomputes from rating/reviews —
            the same component, the same formula, as every unpaid card. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <PlaceScoreChip p={{ rating: pick.rating, reviews: pick.reviews }} size={12} />
          <span style={{ fontSize: 12.5, color: C.gold, fontWeight: 700 }}>
            {Number(pick.rating).toFixed(1)}★
          </span>
          <span style={{ fontSize: 12.5, color: C.muted }}>{Number(pick.reviews).toLocaleString()} reviews</span>
          {dist ? <span style={{ fontSize: 12.5, color: C.muted }}>· {dist} away</span> : null}
        </div>

        {/* The advertiser's own claim, in their own words, marked as theirs. */}
        {pick.claim ? (
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: 11.5,
                fontWeight: 700,
                color: accentLight,
                background: "rgba(140,198,63,.12)",
                border: "1px solid rgba(140,198,63,.34)",
                borderRadius: RADII.chip,
                padding: "4px 11px",
                lineHeight: 1.35,
              }}
            >
              {pick.claim}
            </span>
          </div>
        ) : null}

        <a
          href={pick.outboundHref}
          target="_blank"
          // "sponsored" because it was paid for (Google's own requirement),
          // "nofollow" so we pass no ranking signal, "noopener" for the tab.
          // Deliberately NOT noreferrer: the advertiser should see gowayfind.com
          // in their own referrer report. That report, plus the utm stamp, is
          // the evidence that makes the renewal conversation a short one.
          rel="sponsored nofollow noopener"
          onClick={onClick}
          aria-label={pick.cta + " at " + pick.advertiser + " " + (pick.venueLine || "").split("·").pop().trim()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minHeight: TARGET,
            width: "100%",
            boxSizing: "border-box",
            background: accent,
            color: "#FFFFFF",
            borderRadius: RADII.control,
            padding: "11px 16px",
            fontSize: 14,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          {pick.cta}
          <span aria-hidden="true">→</span>
        </a>

        {/* DISCLOSURE #2 — what was bought, and what was not. This sentence is
            the reason the score above is still worth something. */}
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.45, marginTop: 9 }}>
          Paid placement — {pick.advertiser} paid to appear here, and only readers near this location see it. The
          Wayfind Score and the review count are ours, and were not part of the deal.
        </div>
      </div>
    </section>
  );
}
