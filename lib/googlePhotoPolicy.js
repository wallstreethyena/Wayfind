// lib/googlePhotoPolicy.js — the one switch for BACKGROUND Google photo pre-fetching.
//
// WHY (owner, 2026-10-08: "resolve the Google photo storage question ... if a
// background process is clearly storing or serving photos in a prohibited way,
// pause that specific behavior using a reversible control").
//
// Google Maps Platform Terms of Service 3.2.3(a)(i): Customer will not
// "pre-fetch, index, store, reshare, or rehost Google Maps Content outside the
// services"; 3.2.3(b): no caching except as the Maps Service Specific Terms allow
// (for Places API: place ID indefinitely, lat/lng up to 30 days, section 14.3).
// Place Photos (New) documentation: "You cannot cache a photo name."
//
// Two crons fetch Google place photos BEFORE any visitor asks for them:
//   app/api/cron/credited-photos  (lib/creditedPhotoWarm.js)  every 4 hours
//   app/api/cron/photo-warm       (lib/photoWarm.js)          every 15 minutes
// That is pre-fetching, so it is OFF unless an operator explicitly turns it back
// on. Reversible: set GOOGLE_PHOTO_PREFETCH=on in Vercel and redeploy. Nothing
// stored is deleted by this switch; visitor-triggered, on-demand photo loading
// (app/api/photo) is unchanged, and free licensed photos (Wikimedia lane) keep
// running. Default (unset / anything but "on") = paused: fail safe.
export const PREFETCH_ENV = "GOOGLE_PHOTO_PREFETCH";
export const PREFETCH_PAUSED = "prefetch-paused";
export function googlePhotoPrefetchAllowed(env = process.env) {
  return String((env && env[PREFETCH_ENV]) || "").trim().toLowerCase() === "on";
}
