// lib/memberSignals.js — the ONE place the community like signal is aggregated
// into a ranking input. Every rank surface routes through /api/signals/likes ->
// this function -> Ranking.memberDelta, so the owner's editorial weight and the
// anonymous-device floor are applied in exactly one choke point (no parallel
// matchers — the standing lesson).
//
// Curator Boost ("god bump"): the OWNER's like (user_id === ownerId) counts as
// `weight` (default 50), so a single owner like maxes the like nudge; every other
// like is weight 1. `owner[id]` is true iff the owner liked that place — it feeds
// the display-only "Curator's pick" chip and has NO extra score effect beyond the
// like weight itself. ownerId + weight are SERVER env only and are NEVER derived
// from any client input.

// likeRows:   [{ place_id, user_id }]  from the likes table (service-role read).
// deviceRows: [{ place_id, device_id }] anonymous like events (deduped by device).
// ids:        optional allow-list of place_ids to emit (else every seen place).
// Returns { counts: { [place_id]: weightedFloor }, owner: { [place_id]: true } }.
export function aggregateLikeSignals(likeRows, deviceRows, ownerId, weight, ids) {
  const w = Math.max(1, Number(weight) || 1);
  const members = {}; // weighted signed-in-like count
  const ownerHit = {}; // did the owner like this place
  const devices = {}; // unique anonymous device sets

  for (const r of likeRows || []) {
    if (!r || !r.place_id) continue;
    const isOwner = !!ownerId && r.user_id === ownerId;
    members[r.place_id] = (members[r.place_id] || 0) + (isOwner ? w : 1);
    if (isOwner) ownerHit[r.place_id] = true;
  }
  for (const r of deviceRows || []) {
    if (!r || !r.place_id) continue;
    (devices[r.place_id] = devices[r.place_id] || new Set()).add(r.device_id || "?");
  }

  const list = Array.isArray(ids) && ids.length ? ids : Object.keys({ ...members, ...devices });
  const counts = {};
  const owner = {};
  for (const id of list) {
    // Signed-in likes ALSO log an anonymous device event, so members and devices
    // overlap; summing double-counts. The weighted member count vs the unique
    // device count, whichever is higher, is the honest floor.
    const n = Math.max(members[id] || 0, devices[id] ? devices[id].size : 0);
    if (n > 0) counts[id] = n;
    if (ownerHit[id]) owner[id] = true;
  }
  return { counts, owner };
}
