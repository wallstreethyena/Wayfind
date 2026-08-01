"use client";

// Portable renderer for the canonical home PlaceCard visual contract. The
// classes and geometry come from WF_PLACE_CARD_CSS; keeping those names here
// means collection cards cannot quietly become a second, taller card system.
import { WayfindScoreBadge } from "./kit";
import { businessStatus } from "../../lib/businessStatus";
import { coarseCat } from "../../lib/ranking";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { priceLabel } from "../../lib/price";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce";
import { placePartnerPick } from "../../lib/placePartnerPicks";

const compactCount = (n) => Number(n) >= 1000
  ? (Math.round(Number(n) / 100) / 10) + "k"
  : String(Number(n) || 0);

const photoUrl = (p) => {
  if (p && p.photoRef) return "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640";
  if (p && typeof p.photo === "string") return p.photo;
  return null;
};

const ThumbIcon = ({ down = false }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {down
      ? <><path d="M8 4v10H4V4h4Z" /><path d="M8 6h8.5a2 2 0 0 1 1.9 1.4l1.3 4a2 2 0 0 1-1.9 2.6H14l.6 3.1a2.4 2.4 0 0 1-2.4 2.9L8 14V6Z" /></>
      : <><path d="M8 10v10H4V10h4Z" /><path d="M8 18h8.5a2 2 0 0 0 1.9-1.4l1.3-4a2 2 0 0 0-1.9-2.6H14l.6-3.1A2.4 2.4 0 0 0 12.2 4L8 10v8Z" /></>}
  </svg>
);

export default function IconicPlaceCard({ place, rank, href, editorial, aiSummary, badge, intentLabel, rankingNote, onShare }) {
  if (!place) return null;
  const score = toDisplayScore(place.wfScore != null ? place.wfScore : wayfindScore(place.rating, place.reviews));
  const category = coarseCat(place) || place.primaryType || place.type || "Local pick";
  const status = businessStatus({
    ...place,
    oh: place.oh || place.regularOpeningHours || null,
    utcOffset: place.utcOffset != null ? place.utcOffset : place.utcOffsetMinutes,
  });
  const state = status.open === true ? "Open" : status.open === false ? "Closed" : null;
  const distance = Number.isFinite(Number(place.distMi))
    ? (Number(place.distMi) < 10 ? Number(place.distMi).toFixed(1) : Math.round(Number(place.distMi))) + " mi"
    : null;
  const facts = [
    place.reviews ? compactCount(place.reviews) + " reviews" : null,
    priceLabel(place.priceLevel ?? place.price_level ?? place.priceNum),
    state,
    distance,
  ].filter(Boolean);
  const award = rank <= 3 ? (rank === 1 ? "Best " : "Top ") + String(category).toLowerCase() + " pick" : null;
  // v6.87 (owner): the rank-summary fallback ("Our #1 pick — 4.9★ with 921
  // reviews, and it holds up.") is GONE — rating, reviews, rank, price,
  // status and distance already render above in `facts`/`award`, and
  // restating them here was the generic filler this rule exists to kill.
  // `editorial` (a verified wf_editorial hook) still wins when present;
  // `aiSummary` is a validated { card_line_1, card_line_2 } CARD_SUMMARY
  // (lib/editorialValidator.js already rejected anything generic, a
  // fragment, or card-data-repeating before this ever reached the client).
  // If NEITHER exists, nothing renders in this slot — no template fallback.
  const validAiSummary = !editorial && aiSummary && typeof aiSummary === "object" && aiSummary.card_line_1 && aiSummary.card_line_2 ? aiSummary : null;
  const initials = String(place.name || "WF").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  const actionHref = (action) => "/p/" + encodeURIComponent(place.id) + "?action=" + action;
  const isCuratorPick = !!(place._members && place._members.ownerPick);
  const partner = placePartnerPick(place);
  const partnerHref = partner ? commerceHref({
    provider: partner.provider,
    offerId: partner.offerId,
    surface: "iconic_place_card",
    contentId: place.id,
  }) : null;

  return (
    <li data-iconic-place-card className={`wf-place-card${isCuratorPick ? " is-curator-pick" : ""}`} style={{ listStyle: "none" }}>
      <div className="wf-place-card-layout">
        {photoUrl(place)
          ? <img src={photoUrl(place)} alt="" loading="lazy" style={{ objectFit: "cover" }} />
          : <div className="wf-place-card-monogram" aria-hidden="true">{initials}</div>}
        <div className="wf-place-card-content" style={{ position: "relative" }}>
          <div className="wf-place-card-title-row" style={{ display: "flex", alignItems: "flex-start" }}>
            <span className="wf-place-card-rank" aria-label={"Rank " + rank}>{rank}</span>
            <div className="wf-place-card-heading">
              <span className="wf-place-card-category">{category}</span>
              <a className="wf-place-card-name" href={href} style={{ display: "block", color: "#F8F5EE", textDecoration: "none" }}>{place.name}</a>
            </div>
            {score != null ? <div className="wf-place-card-score"><WayfindScoreBadge score={score} /></div> : null}
          </div>

          <div className="wf-place-card-meta" style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            {facts.map((fact) => <span key={fact} style={{ color: fact === "Open" ? "#22C55E" : fact === "Closed" ? "#EF4444" : undefined }}>{fact}</span>)}
          </div>

          {award ? (
            <div className={`wf-place-card-award is-rank-${rank}`}>
              <span className="wf-place-card-award-icon" aria-hidden="true">{rank === 1 ? "🏆" : rank}</span>
              <span>{award}</span>
            </div>
          ) : null}

          <div className="wf-place-card-highlights" style={{ display: "flex", flexWrap: "wrap" }}>
            {intentLabel ? <span>{intentLabel}</span> : null}
            {badge || null}
            {partnerHref ? (
              <a
                href={partnerHref}
                target="_blank"
                rel="sponsored noopener"
                aria-label={`Partner tickets for ${place.name} via ${partner.merchant}`}
                title="Partner link. Wayfind may earn a commission; rankings never change."
                onClick={(event) => {
                  const clickId = mintClickId();
                  const live = commerceHref({ provider: partner.provider, offerId: partner.offerId, surface: "iconic_place_card", contentId: place.id, clickId });
                  if (live && event.currentTarget) event.currentTarget.href = live;
                  try { emitCommerce("commerce_cta_clicked", { surface: "iconic_place_card", provider: partner.provider, merchant: partner.merchant, offer_id: partner.offerId, content_id: place.id, click_id: clickId, disclosure_version: "partner-place-v1" }); } catch {}
                }}
                style={{ color: "#FDBA74", textDecoration: "none" }}
              >🎟️ Partner tickets via {partner.merchant} ↗</a>
            ) : null}
          </div>
          {editorial ? (
            <div className="wf-place-card-take">{editorial}</div>
          ) : validAiSummary ? (
            <div className="wf-place-card-take">
              <div>{validAiSummary.card_line_1}</div>
              <div style={{ marginTop: 2 }}>{validAiSummary.card_line_2}</div>
            </div>
          ) : null}
          {rankingNote ? <div style={{ color: "#8791A4", fontSize: 9.5, marginTop: 4 }}>{rankingNote}</div> : null}

          <div className="wf-place-card-actions" style={{ display: "flex" }}>
            <a className="wf-place-card-save" href={actionHref("save")} aria-label={"Save " + place.name}>♡ Save</a>
            <a className="wf-place-card-like" href={actionHref("like")} aria-label={"Like " + place.name} title="Like this place"><ThumbIcon /></a>
            <a className="wf-place-card-dislike" href={actionHref("dislike")} aria-label={"Not for me: " + place.name} title="Not for me"><ThumbIcon down /></a>
            <button className="wf-place-card-share" type="button" aria-label={"Share " + place.name} onClick={() => onShare && onShare(place)}>↗ Share</button>
          </div>
        </div>
      </div>
    </li>
  );
}
