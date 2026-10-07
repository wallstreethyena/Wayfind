// app/components/AwardCardParts.js — the two pieces of the Wayfind annual award
// that a PLACE CARD wears (owner, 2026-10-06): the badge sticker on the photo
// and the compact "YEAR WINNER / name / detail" band in the content column.
// Shared so RailCard, IconicPlaceCard and home.js PlaceCard cannot drift.
// Only a Wayfind award (award.wayfindAward) renders either; rank / curator /
// creator chips stay with their own renderers.
import AwardBadge from "./AwardBadge";

// Top-left of the photo, at the size of the owner's approved mock (2026-10-06).
// On a winner card the live rank leaves the photo and sits beside the category
// as "List #N" (AwardListRank), so the badge owns the corner. The CC photo
// credit keeps bottom-right; the score badge stays on the CARD's top-right.
export function AwardSticker({ award }) {
  if (!award || !award.wayfindAward) return null;
  return (
    <span className="wf-award-sticker">
      <AwardBadge variant="sticker" year={award.year} label={award.ariaLabel} />
    </span>
  );
}

// Fixed-height cards: two compact lines instead of the 3-line block.
export function AwardBand({ award, icon }) {
  if (!award || !award.wayfindAward) return null;
  return (
    <div className="wf-place-card-award is-wayfind-award" aria-label={award.ariaLabel}>
      {icon ? <span className="wf-place-card-award-icon" aria-hidden="true">{icon}</span> : null}
      <span className="wf-award-text">
        <span className="wf-award-eyebrow">{award.year} WINNER</span>
        <span className="wf-award-name">{award.name}</span>
        <span className="wf-award-detail">{award.detail}</span>
      </span>
    </div>
  );
}

// The live list position on a winner card. The award is permanent; this rank
// can move week to week, so it stays a separate, quieter chip.
export function AwardListRank({ award, rank }) {
  if (!award || !award.wayfindAward || !rank) return null;
  return <span className="wf-award-listrank" aria-label={"List rank " + rank}>List #{rank}</span>;
}

export const AWARD_WINNER_CLASS = " is-award-winner";
export const awardWinnerClass = (award) => (award && award.wayfindAward ? AWARD_WINNER_CLASS : "");
