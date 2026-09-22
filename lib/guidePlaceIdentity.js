// One rule for guide place-card identity.
//
// Editorial headings and app search queries are not place identities. A guide
// may render a place card only when it pins a Place ID or supplies reviewed
// whole-name aliases that include its appQuery. A location/activity search can
// still be useful as an "Open in Wayfind" handoff, but it must never be turned
// into an arbitrary venue card.
export function normalizeGuidePlaceName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function guidePickIdentityIssues(pick) {
  const issues = [];
  if (!pick || typeof pick.appQuery !== "string" || !pick.appQuery.trim()) {
    issues.push("missing appQuery");
    return issues;
  }
  if (!Array.isArray(pick.exactNames) || !pick.exactNames.length) {
    issues.push("missing exactNames");
    return issues;
  }
  const aliases = pick.exactNames.map(normalizeGuidePlaceName);
  if (!aliases.includes(normalizeGuidePlaceName(pick.appQuery))) issues.push("appQuery is not an exact alias");
  if (new Set(aliases).size !== aliases.length) issues.push("duplicate exact alias");
  return issues;
}

export function guidePickMayResolvePlaceCard(pick) {
  if (!pick || pick.appQuery === null || pick.placeCard === false) return false;
  if (typeof pick.placeId === "string" && pick.placeId.trim()) return true;
  return guidePickIdentityIssues(pick).length === 0;
}

export function guidePickHasReviewedIdentityDecision(pick) {
  if (!pick) return false;
  if (pick.appQuery === null || pick.placeCard === false) return true;
  return guidePickMayResolvePlaceCard(pick);
}
