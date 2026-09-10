# Apple Maps on event pages

Event pages load MapKit JS only after the venue map approaches the viewport. The map shows the venue and the ranked nearby places. A reader can opt in to share either their location or a typed starting point with Apple to draw a driving route inside the same map. The outbound navigation link on those pages ("Open in Apple Maps") is an Apple Maps directions URL built by `lib/placeWhere.js appleDirectionsUrl`, so the event surface is Apple end to end: look at an Apple map, plan an Apple route, open Apple Maps to drive it. Owner, 2026-09-08: "switch to Apple Maps permanently, not temporarily."

## The token is PERMANENT. It has been since 2026-09-08.

Read this section before reporting that the Apple Maps key is expiring. A stale
version of it produced exactly that false report on 2026-09-10.

`NEXT_PUBLIC_APPLE_MAPS_TOKEN` on Production is a **non-expiring,
domain-restricted** MapKit JS token. Verified 2026-09-10 by decoding the token
out of the JavaScript chunk a reader's browser actually downloads on a real
`/florida-events/<event>` page (`/_next/static/chunks/797.*.js`) — not merely
out of the health endpoint, which reads the same build-time constant and so
could only ever have agreed with itself:

```
scope  "mapkit_js"
iat    2026-09-08T20:15:04Z
exp    (absent — the token does not expire)
origin "www.gowayfind.com"
```

`https://gowayfind.com/...` answers `308` with
`location: https://www.gowayfind.com/...`, so the single `www` origin covers
every reader, and the Capacitor WebView loads that same origin. Nothing needs
adding for the apex.

The token that shipped with #1144 on 2026-09-07 was a testing token — `exp`
2026-09-15, seven days after `iat`, and **no `origin` claim at all**, so it was
both on a clock and liftable out of a public bundle by anyone. It was replaced
the next day. That is history, not a pending task.

### If it ever has to be replaced

Only from https://developer.apple.com/maps/resources/ (WAYFIND LLC, team
`VZGMT57ND7`) → **Create a Token**: choose the web Maps ID, set the allowed
domains to `gowayfind.com` and `www.gowayfind.com`, and **set no expiration**.
Then `vercel env add NEXT_PUBLIC_APPLE_MAPS_TOKEN production` (or the
dashboard) and **redeploy** — it is a build-time public value, so an env change
alone does nothing. Confirm on
https://www.gowayfind.com/api/health/apple-maps: `ok: true`,
`warning: false`, `temporary: false`, `nonExpiring: true`,
`originRestricted: true`. Revoke the old token on the same Resources page once
the new one is live.

Never put a Maps private key (`.p8`), an Apple Developer key, or a server token
in this variable or in the repository. Add a preview origin only after its exact
deployment hostname is known and approved — a domain-restricted token means
preview deployments show the "map preview is unavailable" fallback, which is
correct.

## Permanent is enforced, not merely documented

The 14-day expiry warning cannot keep the token permanent on its own: a
one-year testing token would sit green for 351 days and then page, which is the
same silent-failure-on-a-clock shape #1144 taught, only slower. So since
2026-09-10 the rule is stricter and lives in code:

- **Any expiry at all is a warning.** `lib/appleMapsToken.js` reports
  `temporary: true` for any readable token carrying an `exp`, and
  `appleMapsTokenHealth()` warns on it immediately. `APPLE_MAPS_TOKEN_WARN_DAYS`
  (14) no longer decides *whether* it warns, only whether the reason reads as
  urgent (`urgent: true`).
- **An origin-less token is a defect too.** The token ships in a public bundle,
  so without an `origin` claim any third party can point their own site at
  Wayfind's Apple quota.
- **One contract, two callers.** `appleMapsTokenContract()` is the single list
  of invariants — configured, not-expired, no-warning, permanent,
  domain-locked. `scripts/lib/synthetic/scenarios.mjs` turns it into the
  monitor's assertions every 30 minutes against production, and
  `scripts/check-event-where.mjs` red-proves the same function against fixture
  tokens on every build. There is no hand-copied second opinion to drift.
- **An `opaque` token never trips either rule.** Apple's token format is
  Apple's to change; a value we cannot parse is not evidence of an expiry. The
  real MapKit render assertion is the judge in that case.

Swapping a testing token back in is therefore red within the half hour, instead
of green until its last fortnight.

## How an expiring token becomes an alarm instead of an outage

- `lib/appleMapsToken.js` reads the lifetime straight from the token (it is a public JWT; nothing is verified, nothing secret is needed).
- `app/api/health/apple-maps` reports `configured / expired / temporary / urgent / daysLeft / nonExpiring / originRestricted` from the token the server actually shipped, never cached. `temporary` is the one-word answer to "is the key permanent?"
- `scripts/lib/synthetic/scenarios.mjs` scenario `event-apple-maps` runs every 30 minutes against production: it turns every entry of `appleMapsTokenContract()` into an assertion (configured, not-expired, no-warning, permanent, domain-locked), then opens a real `/florida-events` page with coordinates and waits for MapKit's own `.mk-map-view` to attach. A revoked, expired, temporary, mistyped, origin-less or wrong-domain token turns that run red the same half hour.
- `lib/appleMapsRuntime.js` and `app/components/EventVenueMap.js` refuse a token that is already expired before the MapKit script is fetched, so a reader sees the address + Apple link fallback immediately instead of after a 12-second wait and a 401.
- `scripts/check-event-where.mjs` pins all of the above in the guard suite, executed against fixture tokens (the real 09-07 shape, an expired one, a one-year testing token, an origin-less permanent one, the live non-expiring domain-restricted shape, placeholders, garbage). Every entry of the contract is red-proved by mutation: break the invariant and the guard goes red, or it is decoration.

## Verification

1. Open an event page with venue coordinates and nearby picks.
2. Confirm the orange venue pin and numbered teal nearby pins render in one Apple map.
3. Select **Plan your drive**, then choose **Use my location** or enter a starting point. Confirm the road route, distance, and ETA appear in the event page.
4. Deny location permission and confirm the typed-starting-point route remains available.
5. Check that a route or search failure stays in the route controls and does not replace the venue map.
6. Tap **Open in Apple Maps ↗**: on an iPhone the Maps app opens with driving directions to the venue; elsewhere maps.apple.com opens with the same route.
7. `curl -s https://www.gowayfind.com/api/health/apple-maps` reports `ok: true`, `warning: false`, `temporary: false`, `nonExpiring: true`, `originRestricted: true`.
8. To prove what READERS get rather than what the health route says, decode the token out of the shipped bundle: load a real `/florida-events/<event>` page, fetch its `static/chunks/*.js`, find the `eyJ…` with `scope: "mapkit_js"`, and confirm it carries no `exp`. The health route reads the same build-time constant, so on its own it can only ever agree with itself.

The current Capacitor app loads `https://www.gowayfind.com` in its WebView, so it uses the same web surface and the same domain-restricted token. Test device location and permission behavior on iOS before making an app-readiness claim.
