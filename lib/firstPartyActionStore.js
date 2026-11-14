// lib/firstPartyActionStore.js — Server-only serving gate for verified
// first-party venue actions (officialWebsite, ticket_url, admission_url,
// reservation_url, menu_url).
//
// Bundled behind /api/editorial so client bundles gain 0 bytes from the data
// ledger. Enforces:
//   - Only EXACT / HIGH_CONFIDENCE with verification_status in (manual_verified, verified)
//   - Manual overrides always outrank automated entries
//   - AMBIGUOUS / held_ambiguous / REJECTED entries NEVER leave this module
//   - Expired event tickets (valid_until < todayIso) fail closed automatically
//   - Quarantined hosts, denied (Disney) hosts, and search/maps URLs fail closed

import { createRequire } from "node:module";
import { safeUrl } from "./links.js";
import { hostOfUrl, isQuarantinedHost, isQuarantinedUrl } from "./linkQuarantine.js";
import { isDeniedHost } from "./nightlifeRail.js";
import { siteTodayStr } from "./siteTime.js";
import { isGenericSearchOrMapsUrl, isNonOfficialHost, mergePlaceActionRecord } from "./firstPartyActionResolver.js";

const ALLOWED_CONFIDENCE = new Set(["EXACT", "HIGH_CONFIDENCE"]);
const ALLOWED_STATUS = new Set(["manual_verified", "verified"]);
const SLOTS = ["officialWebsite", "ticket_url", "admission_url", "reservation_url", "menu_url"];

let _nodeDefaultStores = null;
function getNodeDefaultStores() {
  if (_nodeDefaultStores) return _nodeDefaultStores;
  try {
    const req = createRequire(import.meta.url);
    const ledger = req("../data/first-party-actions.json");
    const overrides = req("../data/first-party-action-overrides.json");
    _nodeDefaultStores = {
      places: (ledger && ledger.places) || {},
      overrides: (overrides && overrides.places) || {},
    };
  } catch {
    _nodeDefaultStores = { places: {}, overrides: {} };
  }
  return _nodeDefaultStores;
}

export function sanitizeServableSlot(slot, slotType, todayIso = siteTodayStr()) {
  if (!slot || typeof slot !== "object") return null;
  if (!ALLOWED_CONFIDENCE.has(slot.confidence)) return null;
  if (!ALLOWED_STATUS.has(slot.verification_status)) return null;
  if (slot.valid_until && String(slot.valid_until).slice(0, 10) < String(todayIso).slice(0, 10)) {
    return null;
  }
  const clean = safeUrl(slot.url);
  if (!clean || clean.startsWith("/")) return null;
  const host = hostOfUrl(clean);
  if (!host || isQuarantinedHost(host) || isQuarantinedUrl(clean) || isDeniedHost(host)) return null;
  if (isGenericSearchOrMapsUrl(clean) || isNonOfficialHost(host)) return null;
  return {
    url: clean,
    source: slot.source || "wayfind_verified_data",
    retrieved_at: slot.retrieved_at || null,
    confidence: slot.confidence,
    verification_status: slot.verification_status,
    ...(slot.valid_until ? { valid_until: String(slot.valid_until).slice(0, 10) } : {}),
  };
}

export function firstPartyActionsForPlace(placeId, todayIso = siteTodayStr(), customStores = null) {
  const id = String(placeId || "").trim();
  if (!id) return null;
  const stores = customStores || getNodeDefaultStores();
  const autoPlaces = stores.places || {};
  const manualPlaces = stores.overrides || {};

  const autoRec = autoPlaces[id] || null;
  const manualRec = manualPlaces[id] || null;
  if (!autoRec && !manualRec) return null;

  const combined = manualRec && autoRec
    ? mergePlaceActionRecord(manualRec, autoRec)
    : (manualRec || autoRec);

  if (!combined || !combined.actions) return null;
  const out = {};
  let count = 0;
  for (const s of SLOTS) {
    const cleanSlot = sanitizeServableSlot(combined.actions[s], s, todayIso);
    if (cleanSlot) {
      out[s] = cleanSlot;
      count++;
    }
  }
  return count > 0 ? out : null;
}
