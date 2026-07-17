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
