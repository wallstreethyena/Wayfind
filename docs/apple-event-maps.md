# Apple Maps on event pages

Event pages load MapKit JS only after the venue map approaches the viewport. The map shows the venue and the ranked nearby places. A reader can opt in to share either their location or a typed starting point with Apple to draw a driving route inside the same map.

## Configuration

Set `NEXT_PUBLIC_APPLE_MAPS_TOKEN` to a public MapKit JS token. Restrict the token to the production web origins:

- `gowayfind.com`
- `www.gowayfind.com`

Do not put a Maps private key, an Apple Developer key, or a server token in this variable or in the repository. Add a preview origin only after its exact deployment hostname is known and approved.

## Verification

1. Open an event page with venue coordinates and nearby picks.
2. Confirm the orange venue pin and numbered teal nearby pins render in one Apple map.
3. Select **Plan your drive**, then choose **Use my location** or enter a starting point. Confirm the road route, distance, and ETA appear in the event page.
4. Deny location permission and confirm the typed-starting-point route remains available.
5. Check that a route or search failure stays in the route controls and does not replace the venue map.

The current Capacitor app loads `https://www.gowayfind.com` in its WebView, so it uses the same web surface. Test device location and permission behavior on iOS before making an app-readiness claim.
