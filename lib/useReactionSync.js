"use client";
// lib/useReactionSync.js — GLOBAL LIKE RULE for surfaces that wire their
// own card handlers (docs/proposals/global-like-rule.md).
//
// IntentPageClient and TrendingNowClient keep React state for their cards
// (they also render counts/lists from it), so they cannot read the
// lib/cardActions snapshot directly. What they must NOT keep is their own
// truth: before this hook they loaded localStorage once on mount (a
// signed-in user's database likes never arrived), ignored writes from the
// shared store in the same tab, and swallowed write failures. This hook is
// the convergence: server sync on sign-in (same reconcile as everywhere),
// shared-store deltas folded in live, and rollback + friendly message when
// a signed-in write fails.
import { useEffect } from "react";
import { syncReactionsWithServer, applyReactionChange, STORE_CHANGE_EVENT } from "./likeSignal";
import { reconcileIdsSafe } from "./syncReconcile";
import { setLocal } from "./localStore";
import { showLikeFeedback } from "./cardActions";

const LIKE_SAVE_FAILED = "Couldn't save that — check your connection and try again.";

/**
 * @param {{supabase:object|null, user:object|null,
 *          apply:(maps:{liked:object,disliked:object,likedItems:object,dislikedItems:object})=>void}} opts
 * `apply` replaces all four maps at once (the component's setters).
 */
export function useReactionServerSync({ supabase, user, apply }) {
  const userId = user && user.id;
  useEffect(() => {
    if (!supabase || !userId) return undefined;
    let active = true;
    syncReactionsWithServer({ supabase, user: { id: userId }, reconcileIdsSafe })
      .then((merged) => { if (active && merged) apply(merged); }, () => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onChange = (ev) => {
      const d = ev && ev.detail;
      if (!d || (d.kind !== "like" && d.kind !== "dislike")) return;
      apply((prev) => ({
        liked: applyReactionChange("liked", prev.liked, d),
        disliked: applyReactionChange("disliked", prev.disliked, d),
        likedItems: applyReactionChange("likedItems", prev.likedItems, d),
        dislikedItems: applyReactionChange("dislikedItems", prev.dislikedItems, d),
      }));
    };
    window.addEventListener(STORE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(STORE_CHANGE_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Roll a failed signed-in write back: restore the four maps in state and
 * in storage, and tell the user (GLOBAL LIKE RULE 2c). `apply` may be the
 * plain setter bundle or a functional updater — prior is a plain snapshot.
 */
export function rollbackReactionOnError(write, prior, apply) {
  if (!write || typeof write.then !== "function" || !prior) return;
  Promise.resolve(write).then((res) => {
    if (!res || !res.error) return;
    apply(prior);
    try {
      setLocal("wf_liked", JSON.stringify(prior.liked || {}));
      setLocal("wf_disliked", JSON.stringify(prior.disliked || {}));
      setLocal("wf_liked_items", JSON.stringify(prior.likedItems || {}));
      setLocal("wf_disliked_items", JSON.stringify(prior.dislikedItems || {}));
    } catch (e) {}
    showLikeFeedback(LIKE_SAVE_FAILED);
  }, () => {});
}
