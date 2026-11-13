// lib/centerIdentity.js: keep the home page's `center` the SAME object when a setter
// hands back the same place.
//
// WHY (2026-11-12, measured on production with a phone profile). Several paths call
// setCenter({ lat, lng }) with a fresh object even when the coordinates did not move:
// the IP-location fallback re-adopts the Parrish seed when the browser's GPS request
// times out 8 seconds after load (any visitor outside Florida, or one who ignores the
// permission prompt, gets this), a saved pin is restored, and so on. React compares
// state by identity, so every one of those counted as a change: the nearby feed,
// weather, events and affiliate effects keyed on `center` all re-ran, and the page
// committed about six more times, each re-rendering ~800 components (1 to 1.6 s each on
// a throttled phone) for a location that had not changed.
//
// A real move (different lat, lng or name) still hands back the NEW object, so the
// feed refreshes exactly when it should.
export function nextCenter(prev, next) {
  if (prev && next && typeof prev === "object" && typeof next === "object"
    && prev.lat === next.lat && prev.lng === next.lng && prev.name === next.name) return prev;
  return next;
}
