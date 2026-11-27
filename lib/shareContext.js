// Place-specific menu actions must fail closed for collection/content IDs and
// disabled feature configuration. This is a public rollout flag, not a secret.
export function concreteSharePlaceId(value) {
  let id = typeof value === "string" ? value.trim() : "";
  const pref = /^places\/(ChIJ[A-Za-z0-9_-]{8,200})$/.exec(id);
  if (pref) id = pref[1];
  return id && id.length <= 256 && !/[\s/\\?#\u0000-\u001f]/.test(id) ? id : "";
}

// Group Vote subjects are inventory places or Viator tours. A tour is keyed
// "vx_<product code>" so the vote starts on the exact tour that was shared;
// the server re-reads it from wf_experiences, so nothing here is trusted.
// Every wf_experiences code is digits then letters/digits/underscores
// ("89837P9", "5467OHEP", "3088_1D_UO"); the server still re-reads it.
const VIATOR_CODE = /^\d{2,12}[A-Z0-9_]{0,40}$/;
export function experienceGroupId(code) {
  const c = typeof code === "string" ? code.trim() : "";
  return VIATOR_CODE.test(c) ? "vx_" + c : "";
}
export function isExperienceGroupId(id) {
  return typeof id === "string" && id.startsWith("vx_") && VIATOR_CODE.test(id.slice(3));
}
// The Group Vote subject for a non-place content card, or "" when it has none.
export function groupSubjectId(item) {
  if (!item) return "";
  const direct = concreteSharePlaceId(item.placeId || item.place_id || "");
  if (direct) return direct;
  if (item.type === "experience") return experienceGroupId(String(item.id || ""));
  return "";
}

const cleanGroupName = (name) => String(name || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+[—–-]\s+found on Wayfind$/i, "").replace(/\s+/g, " ").trim().slice(0, 60);

// searchName: the card's own name when the card IS one place or event but did
// not hand over an id. The picker then opens already searching that name and,
// when exactly one result is that place, starts the vote on it (owner bug
// 2026-11-27: "it made me pick a new place from scratch"). Lists, guides and
// rails pass no searchName and keep the plain picker.
export function groupPlanHref(placeId, name, enabled = process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED === "1", searchName = "") {
  if (!enabled) return null;
  const id = concreteSharePlaceId(placeId);
  // No concrete subject (list, guide, rail, event): Group Vote still shows.
  // It opens the create flow in pick-first mode, where the organizer chooses
  // a real inventory place before anything is created — no anchor is faked.
  if (!id) {
    const q = cleanGroupName(searchName);
    return q.length >= 2 ? "/group-plans/new?" + new URLSearchParams({ pick: "1", q }).toString() : "/group-plans/new?pick=1";
  }
  const qs = new URLSearchParams({ place: id });
  const cleanName = cleanGroupName(name);
  if (cleanName) qs.set("name", cleanName);
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
