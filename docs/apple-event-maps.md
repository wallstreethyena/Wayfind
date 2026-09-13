# Apple Maps on event pages

Event pages load MapKit JS only after the venue map approaches the viewport. The map shows the venue and the ranked nearby places. A reader can opt in to share either their location or a typed starting point with Apple to draw a driving route inside the same map. The outbound navigation link on those pages ("Open in Apple Maps") is an Apple Maps directions URL built by `lib/placeWhere.js appleDirectionsUrl`, so the event surface is Apple end to end: look at an Apple map, plan an Apple route, open Apple Maps to drive it. Owner, 2026-09-08: "switch to Apple Maps permanently, not temporarily."

## Configuration: the PERMANENT token (do this once)

`NEXT_PUBLIC_APPLE_MAPS_TOKEN` must be a **non-expiring, domain-restricted** MapKit JS token. Apple's token tool (developer.apple.com/maps → Resources → **Create a Token**, introduced at WWDC24) mints production tokens that are valid only on the domains you list and that never expire until you revoke them. A token with an expiration date is a testing token, whatever form minted it.

The token that shipped with #1144 on 2026-09-07 was a testing token: `exp` 2026-09-15, no `origin` claim, seven days after `iat`. Production must hold the non-expiring kind from now on:

1. Sign in at https://developer.apple.com/maps/resources/ with the WAYFIND LLC developer account (team `VZGMT57ND7`).
2. Click **Create a Token**. Choose the Maps ID used for the web, set the allowed domains to exactly `gowayfind.com` and `www.gowayfind.com`, and do not set an expiration.
3. Copy the token string and set it in Vercel for **Production**: `vercel env add NEXT_PUBLIC_APPLE_MAPS_TOKEN production` (or the Vercel dashboard). It is a build-time public value: **redeploy** for it to take effect.
4. Check https://www.gowayfind.com/api/health/apple-maps — it must answer `ok: true`, `warning: false`, and either `nonExpiring: true` or a `daysLeft` far beyond 14.
5. Revoke the 7-day token on the same Resources page once the new one is live.

Do not put a Maps private key, an Apple Developer key, or a server token in this variable or in the repository. Add a preview origin only after its exact deployment hostname is known and approved (a domain-restricted token means preview deployments show the "map preview is unavailable" fallback, which is correct).

## How an expiring token becomes an alarm instead of an outage

- `lib/appleMapsToken.js` reads the lifetime straight from the token (it is a public JWT; nothing is verified, nothing secret is needed).
- `app/api/health/apple-maps` reports `configured / expired / daysLeft / nonExpiring / originRestricted` from the token the server actually shipped, never cached.
- `scripts/lib/synthetic/scenarios.mjs` scenario `event-apple-maps` runs every 30 minutes against production: it asserts the health endpoint is `ok` with no `warning` (fewer than 14 days of runway is a warning), then opens a real `/florida-events` page with coordinates and waits for MapKit's own `.mk-map-view` to attach. A revoked, expired, mistyped or wrong-domain token turns that run red the same half hour.
- `lib/appleMapsRuntime.js` and `app/components/EventVenueMap.js` refuse a token that is already expired before the MapKit script is fetched, so a reader sees the address + Apple link fallback immediately instead of after a 12-second wait and a 401.
- `scripts/check-event-where.mjs` pins all of the above in the guard suite, executed against fixture tokens (the real 09-07 shape, an expired one, a non-expiring domain-restricted one, placeholders, garbage).

## Verification

1. Open an event page with venue coordinates and nearby picks.
2. Confirm the orange venue pin and numbered teal nearby pins render in one Apple map.
3. Select **Plan your drive**, then choose **Use my location** or enter a starting point. Confirm the road route, distance, and ETA appear in the event page.
4. Deny location permission and confirm the typed-starting-point route remains available.
5. Check that a route or search failure stays in the route controls and does not replace the venue map.
6. Tap **Open in Apple Maps ↗**: on an iPhone the Maps app opens with driving directions to the venue; elsewhere maps.apple.com opens with the same route.
7. `curl -s https://www.gowayfind.com/api/health/apple-maps` reports `ok: true` and `warning: false`.

The current Capacitor app loads `https://www.gowayfind.com` in its WebView, so it uses the same web surface and the same domain-restricted token. Test device location and permission behavior on iOS before making an app-readiness claim.
