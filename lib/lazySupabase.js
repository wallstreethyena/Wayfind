// lib/lazySupabase.js — the client-only async boundary for the homepage.
//
// IMPORTANT: this file must never statically import ./supabase.js. app/home.js,
// lib/savedItems.js and lib/trendSignal.js are all eagerly reachable from "/";
// a static edge here would pull @supabase/supabase-js straight back into the
// first-load graph and undo the extraction this module exists to provide.
let clientPromise = null;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = import("./supabase.js")
      .then((mod) => (mod && mod.supabase) || null)
      .catch(() => null);
  }
  return clientPromise;
}
