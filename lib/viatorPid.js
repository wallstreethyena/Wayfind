// lib/viatorPid.js — Wayfind's ONE Viator partner ID (2026-10-19, owner decision).
//
// The Viator partner dashboard for the owner's account ("Wayfind",
// gabrielpereira@me.com) shows pid P00320881. Every Viator URL Wayfind emits
// carries exactly this pid: the builders below ALWAYS overwrite whatever pid a
// stored or API-returned URL already has, and an env value can no longer route
// clicks to another account. NEXT_PUBLIC_VIATOR_PID in Vercel is set to the
// same value, but code no longer depends on it being present or correct.
// scripts/check-viator-pid.mjs fails the build if this changes or if the
// retired ID reappears anywhere in the repo.
export const WAYFIND_VIATOR_PID = "P00320881";

// Stored catalog URLs come back from the Partner API carrying the pid of the
// account that owns the API key. Pin Wayfind's pid before the row is written so
// the catalog never re-acquires a foreign pid; everything else in the URL
// (mcid, medium, path, other params) is left exactly as the API returned it.
export function pinViatorPid(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!/(^|\.)viator\.com$/i.test(u.hostname)) return url;
    u.searchParams.set("pid", WAYFIND_VIATOR_PID);
    return u.toString();
  } catch {
    return url;
  }
}
