// lib/lazySupabase.js — the client-only async boundary for the homepage.
//
// IMPORTANT: this file must never statically import ./supabase.js. app/home.js,
// lib/savedItems.js and lib/trendSignal.js are all eagerly reachable from "/";
// a static edge here would pull @supabase/supabase-js straight back into the
// first-load graph and undo the extraction this module exists to provide.
export function createLazyClientLoader(loadModule) {
  let clientPromise = null;
  return function getClient() {
    if (!clientPromise) {
      clientPromise = loadModule()
        .then((mod) => (mod && mod.supabase) || null)
        .catch((error) => {
          // A stale deployment can make a browser request an old chunk once.
          // Do not cache that transient rejection for the rest of the tab.
          clientPromise = null;
          throw error;
        });
    }
    return clientPromise;
  };
}

export const getSupabase = createLazyClientLoader(() => import("./supabase.js"));
