// lib/syncReconcile.js — 3-way set reconciliation for cross-device sync (F1).
//
// The bug: the sign-in sync push-up was UNCONDITIONAL, so an item a user removed
// on device A was re-uploaded by device B (which still had it locally) and
// resurrected. A union pull can't distinguish "new local addition" from "deleted
// on another device."
//
// Fix: use a BASE snapshot (the id-set persisted at the last successful sync) as
// the merge base, git-style:
//   pushUp       = local - base    -> genuinely new local additions, upload them
//   deleteRemote = base - local    -> deleted on THIS device, delete from remote
//   keep         = (remote ∪ pushUp) - deleteRemote
//                  -> next local set: authoritative remote, plus new local adds,
//                     minus this device's deletions. An item deleted on another
//                     device (in base, absent from remote, not re-added locally)
//                     is NOT in remote and NOT in pushUp, so it drops out. No
//                     resurrection; offline additions survive.
//
// base defaults to empty on the first-ever sync -> pushUp = all local (migrate
// up), deleteRemote = none, keep = remote ∪ local (union). Callers persist `keep`
// as the next base. Order-preserving on `keep` (remote order, then new local).
export function reconcileIds(base, local, remote) {
  const B = new Set(base || []);
  const L = new Set(local || []);
  const R = new Set(remote || []);
  const pushUp = [...L].filter((id) => !B.has(id));
  const deleteRemote = [...B].filter((id) => !L.has(id));
  const del = new Set(deleteRemote);
  const seen = new Set();
  const keep = [];
  for (const id of [...(remote || []), ...pushUp]) {
    if (id == null || del.has(id) || seen.has(id)) continue;
    seen.add(id);
    keep.push(id);
  }
  return { pushUp, deleteRemote, keep };
}

// A corrupt/cleared local store must never be read as "user deleted everything".
// Empty local + non-empty base is indistinguishable from a wiped/corrupt
// localStorage, so take the remote as-is: nothing pushed, nothing deleted.
export function reconcileIdsSafe(base, local, remote) {
  if ((!local || local.length === 0) && base && base.length > 0) {
    const seen = new Set();
    const keep = [];
    for (const id of remote || []) {
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      keep.push(id);
    }
    return { pushUp: [], deleteRemote: [], keep };
  }
  return reconcileIds(base, local, remote);
}

// mergeSinceSnapshot — apply a reconcile result WITHOUT dropping toggles made
// while the sign-in sync was in flight.
//
// The sync reads a local snapshot, awaits the network (fetch + delete + upsert),
// then applies `keep`. Replacing local with `keep` silently discards anything the
// user saved/liked/disliked/shared during those awaits (and resurrects anything
// they removed). So the apply step merges against the CURRENT local set:
//   result = keep
//          + (current - snapshot)   -> added locally during flight (kept; its
//                                      own toggle issued the server write)
//          - (snapshot - current)   -> removed locally during flight (dropped;
//                                      its own toggle issued the server delete)
// Order: keep's order, then in-flight additions in current's order. Pure.
export function mergeSinceSnapshot(snapshotIds, keepIds, currentIds) {
  const S = new Set(snapshotIds || []);
  const C = new Set(currentIds || []);
  const removed = new Set([...S].filter((id) => !C.has(id)));
  const added = [...(currentIds || [])].filter((id) => !S.has(id));
  const seen = new Set();
  const out = [];
  for (const id of [...(keepIds || []), ...added]) {
    if (id == null || removed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
