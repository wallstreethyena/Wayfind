// scripts/lib/parity/eligibility.mjs — THE GROUND TRUTH FOR THE SURFACE PARITY
// AUDIT. Computes "who is eligible for this chip near this origin" by CALLING
// Wayfind's own shipped pipeline, never by restating it:
//
//   readOwnedCategory (lib/ownedPool.js, via lib/inventoryServe.js's
//   readExhaustiveRows) -- the ordered, paged, exhaustive box read
//     -> chipIdentity / placeAllowed (lib/chipIdentity.js, lib/placeFilter.js)
//     -> rankInventory's own servable/excluded/rated/1.15-radius gates
//        (lib/inventoryServe.js)
//
// This is exactly what scripts/check-identity-before-cap.mjs's header calls
// "the eighth occurrence" risk for a DIAGNOSTIC: a parity tool that carries its
// own copy of "what counts as a café" would happily report a surface healthy
// while the product disagrees. So this file owns zero predicates. It is a thin
// driver over lib/inventoryServe.js's serveFromInventory(), which already runs
// the full read -> filter -> rank pipeline and (since WS1's 2026-09-23 fix)
// exposes {places, meta:{eligible, served, offset, truncated, pages}} through
// its `withMeta` option.
//
// n=Infinity is the trick that turns serveFromInventory into "give me the
// complete eligible set, in score order" rather than "give me a page": its
// internal `take = Math.max(1, Number(n) || 20)` and `fullRanked.slice(offset,
// offset+take)` both pass Infinity straight through, so the slice returns
// everything from `offset`. See inventoryServe.js's serveFromInventoryUncached.
import { serveFromInventory } from "../../../lib/inventoryServe.js";
import { CHIP_IDENTITY } from "../../../lib/chipIdentity.js";
import { SUB_ALLOW } from "../../../lib/placeFilter.js";

const MI = 1609.34;

/** Every "cat:sub" key the shipped chip menu can route to inventory. */
export function chipIdentityKeys() {
  return Object.keys(CHIP_IDENTITY);
}

/**
 * SUB_ALLOW carries chips CHIP_IDENTITY does not name explicitly (food:coffee,
 * food:brunch, food:drinks, beach:marinas, ...). chipIdentity() still resolves
 * them -- it falls back to placeAllowed(cat, sub, p) when CHIP_IDENTITY has no
 * entry -- so they are real, inventory-routed chips too; they are kept in a
 * separate list because the task's default audit surface is "every key in
 * CHIP_IDENTITY" and this is the recorded, explicit remainder.
 */
export function subAllowOnlyKeys() {
  const named = new Set(chipIdentityKeys());
  return Object.keys(SUB_ALLOW).filter((k) => !named.has(k));
}

/** The Google-Places-(New)-shaped place invRowToPlace() produces carries its
 * name at `displayName.text`, not `name` -- this reads either shape. */
export function placeName(p) {
  if (!p) return null;
  if (typeof p.name === "string" && p.name) return p.name;
  if (p.displayName && typeof p.displayName.text === "string") return p.displayName.text;
  return null;
}

function splitKey(key) {
  const i = String(key).indexOf(":");
  if (i < 0) return { cat: String(key), sub: "all" };
  return { cat: key.slice(0, i), sub: key.slice(i + 1) };
}

/**
 * The COMPLETE eligible set for one (cat:sub, origin, radius): every owned row
 * the real pipeline would admit, in the real score order, with no cap.
 *
 * `env` — {url, key} — is the escape hatch serveFromInventory already ships
 * (lib/inventoryServe.js's 2026-09-23 `options.env`, the same one WS1's
 * hermetic guards use); pass it to read a LIVE Supabase directly (anon
 * publishable key is enough -- wf_inventory is anon-readable) without the
 * Next.js server or its service-role credential.
 *
 * `fetchImpl` is the same hermetic-test escape hatch, threaded all the way
 * down to readOwnedCategory -- a fake PostgREST in check-surface-parity-
 * hermetic.mjs passes one so this whole module runs with NO NETWORK.
 *
 * Throws (never returns a lying empty set) on a failed or truncated read,
 * because failLoud is always on here -- a diagnostic that silently reports
 * "0 eligible" on a broken read is worse than no diagnostic.
 */
export async function computeEligibleSet({ cat, sub, lat, lng, radiusM, env, fetchImpl, maxRows }) {
  const result = await serveFromInventory(cat, lat, lng, radiusM, Infinity, sub, {
    offset: 0,
    withMeta: true,
    skipEditorial: true,
    failLoud: true,
    env,
    fetchImpl,
    maxRows,
  });
  const meta = result && result.meta ? result.meta : { eligible: 0, served: 0, offset: 0, truncated: false, pages: 0 };
  const places = result && Array.isArray(result.places) ? result.places : [];
  return { key: `${cat}:${sub}`, cat, sub, lat, lng, radiusM, places, eligible: meta.eligible, truncated: !!meta.truncated, pages: meta.pages };
}

export async function computeEligibleSetForKey(key, { lat, lng, radiusM, env, fetchImpl, maxRows }) {
  const { cat, sub } = splitKey(key);
  return computeEligibleSet({ cat, sub, lat, lng, radiusM, env, fetchImpl, maxRows });
}

/**
 * The exact page a live surface asking for `n` places at `offset` would be
 * served -- same pipeline, capped instead of exhaustive. Used to compute
 * "what the API SHOULD serve" (the API-level audit's expectation) independent
 * of what production (possibly still on the un-paged bug) ACTUALLY returns.
 */
export async function computeServedPage({ cat, sub, lat, lng, radiusM, n, offset = 0, env, fetchImpl }) {
  const result = await serveFromInventory(cat, lat, lng, radiusM, n, sub, {
    offset, withMeta: true, skipEditorial: true, failLoud: true, env, fetchImpl,
  });
  const meta = result && result.meta ? result.meta : { eligible: 0, served: 0, offset, truncated: false, pages: 0 };
  const places = result && Array.isArray(result.places) ? result.places : [];
  return { places, meta };
}

/**
 * Rank/page position each eligible place would occupy under a given per-page
 * size `n` -- id -> { rank, page, indexInPage }. `eligiblePlaces` must already
 * be in the pipeline's own score order (computeEligibleSet's `.places`).
 */
export function expectedPagePositions(eligiblePlaces, n) {
  const size = Math.max(1, Number(n) || 20);
  const out = new Map();
  (eligiblePlaces || []).forEach((p, i) => {
    out.set(p.id, { rank: i, page: Math.floor(i / size), indexInPage: i % size });
  });
  return out;
}

/** PURE. Great-circle miles -- identical formula to lib/ownedPool.js's milesBetween. */
export function milesBetween(aLat, aLng, bLat, bLng) {
  const toRad = (n) => (n * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { MI };
