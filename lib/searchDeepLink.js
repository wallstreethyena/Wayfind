// Landing /?q= and /?intent= searches. Owned search does not need a map
// center. A deep link must run even when GPS is denied and /api/geo refuses
// an out-of-Florida IP. The Christmas poster must not open over that search.
import { DEFAULT_CENTER, isSeedCenter } from "./locationHonesty.js";

export function landingSearchFromSearch(search) {
  const raw = typeof search === "string" ? search.replace(/^\?/, "") : "";
  const sp = search instanceof URLSearchParams ? search : new URLSearchParams(raw);
  const go = String(sp.get("go") || "").trim();
  if (go) return null;
  const q = String(sp.get("q") || "").trim();
  const intent = String(sp.get("intent") || "").trim();
  const near = String(sp.get("near") || "").trim() || null;
  if (q) return { q, placeIntent: intent === "place", near };
  if (intent && intent !== "place") return { q: intent, placeIntent: false, near };
  return null;
}

export function landingSkipsDefaultPoster(search) {
  return landingSearchFromSearch(search) != null;
}

// What ipFallback should write. null means leave the current center alone.
// An out-of-Florida /api/geo answer (ok:false) adopts the Parrish seed so a
// deep link is not stuck with center === null. A real GPS fix or a manual
// pick is never overwritten.
export function centerAfterGeoDecision({ ok, lat, lng, name, gotGPS, manual, current } = {}) {
  if (gotGPS || manual) return null;
  if (!isSeedCenter(current)) return null;
  if (ok && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return { center: { lat: Number(lat), lng: Number(lng) }, name: name ? String(name) : "", device: true };
  }
  if (!ok) {
    return { center: { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng }, name: DEFAULT_CENTER.name, device: false };
  }
  return null;
}
