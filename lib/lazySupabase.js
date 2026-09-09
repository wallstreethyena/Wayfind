// lib/lazySupabase.js — the client-only async boundary for the homepage.
//
// IMPORTANT: this file must never statically import ./supabase.js. app/home.js,
// lib/savedItems.js and lib/trendSignal.js are all eagerly reachable from "/";
// a static edge here would pull @supabase/supabase-js straight back into the
// first-load graph and undo the extraction this module exists to provide.
export function makeLazyClient(importClient) {
  let clientPromise = null;
  return function getClient() {
    if (!clientPromise) {
      clientPromise = Promise.resolve()
        .then(importClient)
        .then((mod) => (mod && mod.supabase) || null)
        .catch(() => {
          // A transient chunk/network failure must not poison the entire tab.
          // Clear only rejections so the next caller retries; a resolved null
          // (for example an intentionally unconfigured client) stays memoized.
          clientPromise = null;
          return null;
        });
    }
    return clientPromise;
  };
}

export const getSupabase = makeLazyClient(() => import("./supabase.js"));
