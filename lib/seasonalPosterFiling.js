// Poster filing for the 2026-10-19 seasonal cards (Gabe, 2026-10-19).
//
// Halloween and Fall are already two posters. This module does not add a
// rail, split a rail, or change a rail's capacity, order, or score. It only
// decides whether one already-served card may leave the poster it is on.
//
// Content rule. A card reads as Halloween when its name says haunted, haunt,
// ghost, trick-or-treat, trunk-or-treat, costume, or Halloween, or when it is
// a scarecrow festival held on October 31. A card reads as Fall when its name
// says harvest, pumpkin, Oktoberfest, fall festival, hayride, corn maze, or
// scarecrow. Anything else seasonal stays unclassified. Both signals at once
// is a borderline call.
//
// Taxonomy rule, applied before any move. The stored category and tags have
// to match the poster the card would land on: a Halloween card is tagged
// halloween (or category halloween) and not fall; a Fall card is tagged fall
// (or category fall/seasonal) and not halloween. Both labels, neither label,
// a label that disagrees with the name, or a borderline name is flagged.
// A flagged card stays where it already is.
//
// A legal Halloween move also has to land on an existing Halloween shelf
// through October 31. If the existing classifier has no shelf, the card stays
// on Fall rather than disappearing.

import { FALL_LIVE_AREA_2026_10_19 } from "./fallLiveArea20261019.js";
import { halloweenCardRail } from "./halloweenIntentRails.js";
import { SEASONAL_LIVE_AREA_PENDING_2026_10_19 } from "./seasonalLiveAreaPending20261019.js";

const HALLOWEEN_WORD = /\b(?:halloween|haunted|haunts?|ghosts?|trick[- ]or[- ]treat|trunk[- ]or[- ]treat|costumes?d?)\b/i;
const FALL_WORD = /\b(?:harvest|pumpkins?|oktoberfest|fall[- ]fest(?:ival)?|hayrides?|corn[- ]mazes?|scarecrows?)\b/i;

export const SEASONAL_POSTER_FILING_SCOPE = new Set([
  ...FALL_LIVE_AREA_2026_10_19.map((row) => row.event_id),
  ...SEASONAL_LIVE_AREA_PENDING_2026_10_19.filter((row) => row.season === "fall" && !row.dropped).map((row) => row.event_id),
]);

function tagsOf(event) {
  return (Array.isArray(event?.tags) ? event.tags : []).map((tag) => String(tag).toLowerCase());
}

function contentCall(event) {
  const text = [event?.event_name, event?.short_title, event?.name, event?.title].filter(Boolean).join(" ");
  const tags = tagsOf(event);
  const scarecrowOnHalloween = /\bscarecrows?\b/i.test(text)
    && String(event?.start_date || "") === "2026-10-31";
  const halloween = HALLOWEEN_WORD.test(text) || tags.includes("scary") || tags.includes("trick-or-treat") || scarecrowOnHalloween;
  const fall = FALL_WORD.test(text) || tags.includes("pumpkin") || tags.includes("pumpkins") || tags.includes("harvest");
  if (halloween && fall) return "borderline";
  if (halloween) return "halloween";
  if (fall) return "fall";
  return "unstated";
}

function inHalloweenWindow(event, today) {
  const year = String(today || "").slice(0, 4);
  const through = `${year}-10-31`;
  const start = String(event?.start_date || "");
  const end = String(event?.end_date || start);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) return false;
  if (start > through) return false;
  if (end && end < today) return false;
  return true;
}

export function posterFilingDecision(event, { today = "2026-10-19", onFall = null } = {}) {
  const tags = tagsOf(event);
  const category = String(event?.category || "").toLowerCase();
  const halloweenLabel = category === "halloween" || tags.includes("halloween");
  const fallLabel = category === "fall" || category === "seasonal" || tags.includes("fall");
  const content = contentCall(event);
  const shelf = halloweenCardRail(event);
  const onHalloween = Boolean(shelf) && inHalloweenWindow(event, today);
  const assignedFall = onFall == null ? Boolean(event?.fall_rail) : Boolean(onFall);
  const label = [
    category || "no category",
    tags.length ? tags.join(", ") : "no tags",
  ].join(" / ");

  let status = "ok";
  let reason = "";
  let target = null;
  if (content === "borderline") {
    status = "flagged";
    reason = "Borderline name: it matches both a Halloween signal and a Fall signal.";
  } else if (halloweenLabel && fallLabel) {
    status = "flagged";
    target = content === "unstated" ? null : content;
    reason = `Stored label is both halloween and fall. Left in place until that label is one poster. Content reads as ${content}.`;
  } else if (!halloweenLabel && !fallLabel) {
    status = "flagged";
    reason = "Missing a halloween or fall category and tag.";
  } else if (content === "halloween" && !halloweenLabel) {
    status = "flagged";
    target = "halloween";
    reason = "Name reads as Halloween, but the stored label is fall only.";
  } else if (content === "fall" && !fallLabel) {
    status = "flagged";
    target = "fall";
    reason = "Name reads as Fall, but the stored label is halloween only.";
  } else if (content === "unstated" && halloweenLabel) {
    status = "flagged";
    target = "halloween";
    reason = "Labeled halloween only, but the name is not haunted, ghost, trick-or-treat, costume, Halloween, or an Oct 31 scarecrow festival.";
  } else if (content === "halloween") {
    target = "halloween";
    reason = "Halloween label matches the Halloween name.";
  } else {
    target = "fall";
    reason = content === "fall"
      ? "Fall label matches the Fall name."
      : "Exclusive fall label. The name is other seasonal content, so it stays Fall.";
  }

  let move = null;
  if (status === "ok" && target === "halloween" && assignedFall) {
    if (onHalloween) {
      move = "to-halloween";
      reason = "Exclusive Halloween label. Leaves the Fall poster for the existing Halloween shelf.";
    } else {
      status = "flagged";
      move = null;
      reason = "Exclusive Halloween label, but no existing Halloween shelf keeps this card through October 31. Left on Fall so it is not dropped.";
    }
  } else if (status === "ok" && target === "fall" && onHalloween) {
    move = "to-fall";
    reason = "Exclusive Fall label. Leaves the Halloween poster for the existing Fall shelf.";
  }

  return {
    event_id: event?.event_id || event?.id || "",
    name: event?.event_name || event?.name || event?.title || "",
    venue: event?.venue || "",
    start_date: event?.start_date || "",
    end_date: event?.end_date || "",
    label,
    content,
    target,
    status,
    reason,
    move,
    onFall: assignedFall,
    onHalloween,
    halloweenShelf: shelf,
  };
}

// Copy the rails. Drop only a scoped card whose decision says to move.
// Every other card stays in its existing order.
export function fileScopedPosters(rails, { today = "2026-10-19", scope = SEASONAL_POSTER_FILING_SCOPE } = {}) {
  const dropFromFall = new Set();
  const dropFromHalloween = new Set();
  for (const rail of Array.isArray(rails) ? rails : []) {
    for (const card of rail?.cards || []) {
      const id = String(card?.event_id || card?.id || "");
      if (!scope.has(id)) continue;
      const decision = posterFilingDecision(card, { today, onFall: true });
      if (decision.move === "to-halloween") dropFromFall.add(id);
      if (decision.move === "to-fall") dropFromHalloween.add(id);
    }
  }
  const copy = (drop) => (Array.isArray(rails) ? rails : []).map((rail) => ({
    ...rail,
    cards: (rail?.cards || []).filter((card) => !drop.has(String(card?.event_id || card?.id || ""))),
  }));
  return {
    fallRails: copy(dropFromFall),
    halloweenSource: copy(dropFromHalloween),
    movedOffFall: [...dropFromFall],
    movedOffHalloween: [...dropFromHalloween],
  };
}
