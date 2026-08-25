"use client";
// app/components/SponsoredPlaceCard.js — the card a business PAID for.
//
// Wayfind's first direct advertiser (owner, 2026-08-23). Everything about this
// unit is designed around one idea: a paid card has to be MORE useful than an
// editorial one, not less, or the reader learns to skip anything with the word
// "Sponsored" on it and the inventory is worth nothing by the third advertiser.
//
// WHAT MAKES IT READ PREMIUM RATHER THAN LOUD (v8.43.1, owner: "make it
// premium"). None of this is decoration; each line is doing a job:
//
//   • ONE brand hairline across the top edge. The card is otherwise Wayfind's
//     own surface, so the advertiser's colour appears exactly twice — this 3px
//     rule and the CTA — and never as a background wash. Restraint is what
//     separates a premium placement from a banner ad.
//   • THE PHOTO CARRIES THE TOP THIRD, and the two chips that sit on it are the
//     two facts a reader needs before anything else: that this is paid, and
//     what Wayfind actually scores it. Disclosure top-left, our number
//     bottom-right, nothing else competing.
//   • THE NAME IS THE HEADLINE-SIZED ELEMENT, not the ad copy. A premium card
//     leads with who this is; the pitch follows at a size that reads as a
//     quote from the business rather than a shout from us.
//   • A SINGLE DOMINANT ACTION, then a quiet row. Book is the only filled
//     button on the card. Call / Directions / full details are a hairline row
//     beneath it — available, never competing.
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
// ~495KB gz against a 500KB budget and the gate is false for almost every
// reader on earth, so this file must never be statically imported there.
import { useCommerceImpression } from "./useCommerceImpression";
import { emitCommerce } from "../../lib/commerce";
import { C, RADII, SHADOW, TARGET, TYPE, PlaceScoreChip } from "./kit";

/** Distance, in the same voice the rest of the app uses. */
function miles(d) {
  if (!Number.isFinite(d)) return null;
  return d < 10 ? d.toFixed(1) + " mi" : Math.round(d) + " mi";
}

/** "Gastonia" out of "Rio Body Wax · Gastonia" — the branch, for the meta line. */
function branchOf(pick) {
  const parts = String(pick.venueLine || "").split("·");
  return parts.length > 1 ? parts[parts.length - 1].trim() : "";
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
  const branch = branchOf(pick);

  const log = (action, extra) => {
    try { onLog && onLog(action, null, { sponsor: pick.id, merchant: pick.advertiser, ...extra }); } catch (e) {}
  };
  const onBook = () => {
    try { emitCommerce("commerce_cta_clicked", ctx); } catch (e) {}
    log("sponsor_out", { to: "booking" });
  };

  // The quiet row. Each entry is only rendered when the data behind it is real
  // — a dead "Call" on a card someone paid for is worse than no Call at all.
  const quiet = [
    pick.phone ? { key: "call", label: "Call", href: "tel:" + pick.phone, external: false } : null,
    pick.mapsHref ? { key: "map", label: "Directions", href: pick.mapsHref, external: true } : null,
    // Share (owner, 2026-08-25): same non-async navigator.share pattern as
    // sharePlace — the call must run inside the tap's user gesture. Shares the
    // permanent partner page (the half of the placement that works everywhere),
    // falling back to a clipboard copy. Never a dead control: pagePath-gated.
    pick.pagePath ? { key: "share", label: "Share", onTap: () => {
      const u = "https://www.gowayfind.com" + pick.pagePath + "?utm_source=wayfind&utm_medium=sponsored_card_share";
      try { if (navigator.share) { const pr = navigator.share({ title: pick.name, url: u }); if (pr && pr.catch) pr.catch(() => {}); return; } } catch (e) {}
      try { navigator.clipboard && navigator.clipboard.writeText(u); } catch (e) {}
    } } : null,
    pick.pagePath ? { key: "page", label: "Full details", href: pick.pagePath, external: false } : null,
  ].filter(Boolean);

  return (
    <section
      ref={seenRef}
      aria-label={"Sponsored — " + pick.advertiser}
      style={{
        marginBottom: 16,
        background: C.card,
        border: "1px solid " + C.border,
        borderRadius: RADII.card,
        overflow: "hidden",
        boxShadow: SHADOW.card,
      }}
    >
      {/* The advertiser's colour, once, as an edge. Not a background. */}
      <div aria-hidden="true" style={{ height: 3, background: "linear-gradient(90deg, " + accent + " 0%, " + accentLight + " 100%)" }} />

      {/* THE MEDIA BAND. aspect-ratio reserves the box before the bytes land,
          so a paid card can never be the thing that shifts the feed under a
          reader's thumb (test-layout-shift's whole subject). */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#10141d" }}>
        {pick.photo ? (
          <img
            src={pick.photo}
            alt={pick.advertiser + " storefront in " + branch}
            loading="lazy"
            decoding="async"
            // objectPosition is per-sponsor: a cover crop centred by default
            // guillotines the thing that makes a storefront recognisable — its
            // sign. The registry says where the subject actually is.
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: pick.photoPosition || "50% 50%" }}
          />
        ) : null}
        {/* Scrim, so both chips stay legible over any photograph a business
            swaps in later. Weighted to the corners the chips actually sit in. */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,16,.74) 0%, rgba(4,8,16,0) 40%, rgba(4,8,16,.10) 62%, rgba(4,8,16,.72) 100%)" }}
        />
        {/* DISCLOSURE #1 — above the fold of the card, on the image, first
            thing read. Not a footnote, not a tooltip, not behind a tap. */}
        <span
          style={{
            position: "absolute",
            top: 11,
            left: 11,
            ...TYPE.eyebrow,
            fontSize: 9.5,
            letterSpacing: ".7px",
            textTransform: "uppercase",
            color: "#FFFFFF",
            background: "rgba(4,8,16,.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,.24)",
            borderRadius: RADII.chip,
            padding: "4px 10px",
            lineHeight: 1.3,
          }}
        >
          {pick.label}
        </span>
        {/* OUR number, on their picture. The one thing on this card that was
            not for sale gets the opposite corner from the thing that was. */}
        <span style={{ position: "absolute", right: 11, bottom: 11, display: "inline-flex" }}>
          <PlaceScoreChip p={{ rating: pick.rating, reviews: pick.reviews }} size={12.5} />
        </span>
      </div>

      <div style={{ padding: "14px 16px 16px" }}>
        {/* The person. A studio is a person, and the person is why someone
            taps — but she is a credit, never an endorsement of Wayfind. */}
        {person ? (
          <div style={{ ...TYPE.eyebrow, fontSize: 9.5, letterSpacing: ".8px", textTransform: "uppercase", color: accentLight, marginBottom: 6 }}>
            {person.name}
            {person.role ? " · " + person.role : ""}
          </div>
        ) : null}

        {/* The name leads. Everything else on the card is subordinate to it. */}
        <h3 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.2px", lineHeight: 1.2, color: C.text, margin: "0 0 4px" }}>{pick.advertiser}</h3>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>
          {branch}
          {dist ? " · " + dist + " away" : ""}
          {" · "}
          <span style={{ color: C.gold, fontWeight: 700 }}>{Number(pick.rating).toFixed(1)}★</span>{" "}
          <span>{Number(pick.reviews).toLocaleString()} Google reviews</span>
        </div>

        {/* A hairline, then the advertiser's own voice. The rule is what tells
            a reader the next two lines are the business speaking, not us. */}
        <div aria-hidden="true" style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "0 0 12px" }} />

        <div style={{ ...TYPE.display, fontSize: 18.5, fontWeight: 750, lineHeight: 1.28, color: C.text, marginBottom: 8 }}>{pick.headline}</div>
        <div style={{ ...TYPE.meta, fontSize: 13.5, color: C.light, marginBottom: 13 }}>{pick.body}</div>

        {/* The advertiser's own claim, in their own words, marked as theirs. */}
        {pick.claim ? (
          <div style={{ marginBottom: 14 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: 11.5,
                fontWeight: 700,
                color: accentLight,
                background: "rgba(140,198,63,.10)",
                border: "1px solid rgba(140,198,63,.30)",
                borderRadius: RADII.chip,
                padding: "5px 12px",
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
          onClick={onBook}
          aria-label={pick.cta + " at " + pick.advertiser + " " + branch}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            minHeight: 50,
            width: "100%",
            boxSizing: "border-box",
            background: accent,
            color: "#FFFFFF",
            borderRadius: RADII.control,
            padding: "13px 16px",
            fontSize: 14.5,
            fontWeight: 800,
            letterSpacing: "0.1px",
            textDecoration: "none",
            boxShadow: "0 6px 18px -8px " + accent,
          }}
        >
          {pick.cta}
          <span aria-hidden="true">→</span>
        </a>

        {/* The quiet row. Available, never competing with the one filled
            button above it. */}
        {quiet.length ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, marginTop: 4 }}>
            {quiet.map((q, i) => (
              <span key={q.key} style={{ display: "inline-flex", alignItems: "center" }}>
                {i ? <span aria-hidden="true" style={{ color: "rgba(255,255,255,.18)", fontSize: 11 }}>·</span> : null}
                <a
                  href={q.href || "#"}
                  {...(q.external ? { target: "_blank", rel: "noopener" } : {})}
                  onClick={(e) => {
                    // onTap entries (Share) act in-place: run inside the tap's
                    // user gesture, never navigate to "#".
                    if (q.onTap) { e.preventDefault(); q.onTap(); }
                    log("sponsor_secondary", { to: q.key });
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: TARGET,
                    padding: "0 12px",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: C.muted,
                    textDecoration: "none",
                  }}
                >
                  {q.label}
                </a>
              </span>
            ))}
          </div>
        ) : null}

        {/* DISCLOSURE #2 — what was bought, and what was not. This sentence is
            the reason the score above is still worth something. */}
        <div style={{ fontSize: 10.5, color: "#7C8797", lineHeight: 1.5, marginTop: 8 }}>
          Paid placement — {pick.advertiser} paid to appear here, and only readers near this location see it. The
          Wayfind Score and the review count are ours, and were not part of the deal.
        </div>
      </div>
    </section>
  );
}
