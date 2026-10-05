// Place-specific menu actions must fail closed for collection/content IDs and
// disabled feature configuration. This is a public rollout flag, not a secret.
export function concreteSharePlaceId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return id && id.length <= 256 && !/[\s/\\?#\u0000-\u001f]/.test(id) ? id : "";
}

export function groupPlanHref(placeId, name, enabled = process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED === "1") {
  const id = concreteSharePlaceId(placeId);
  if (!enabled || !id) return null;
  const qs = new URLSearchParams({ place: id });
  if (name) qs.set("name", String(name).slice(0, 60));
  return "/group-plans/new?" + qs.toString();
}

export function placeSharePreview(placeId, name, city) {
  const id = concreteSharePlaceId(placeId);
  if (!id) return null;
  const qs = new URLSearchParams({ kind: "place", id, t: String(name || "Wayfind place").slice(0, 60) });
  if (city) qs.set("loc", String(city).slice(0, 80));
  // No src/photoRef/claims: heroSource resolves identity-keyed licensed photos
  // and heroCard provides the existing typographic fallback when none exists.
  return "/api/og/hero?" + qs.toString();
}

// Synchronous context prevents nested intent menus when the shell's existing
// callback API is reused from an intent-choice button. No DOM sniffing or await.
let choiceDepth = 0;
export function inShareChoice() { return choiceDepth > 0; }
export function runShareChoice(fn) {
  choiceDepth++;
  try { return fn?.(); } finally { choiceDepth--; }
}

// @capacitor/share 8 iOS rejects cancellation with this exact message;
// Web Share uses AbortError. Both represent a user declining to share.
export function isShareCancellation(error) {
  return error?.name === "AbortError" || error?.message === "Share canceled";
}
