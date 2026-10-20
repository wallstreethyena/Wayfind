# Nearby parking on detail maps

The shared Apple map offers **Parking** beside **All places**. It is available on
both event detail routes, the place sheet (including `/p/[id]`), and durable
`/places/[id]` pages. Approximate or invalid venue locations cannot search parking.
Place maps load near the viewport; parking search starts only when selected.

The search uses MapKit JS 6 `PointsOfInterestSearch` with Apple's Parking filter,
centered on the venue. It starts at half a mile and expands once to one mile when
fewer than three usable results are returned. Results are validated, deduplicated,
sorted by straight-line distance, and capped at five. They are nearby listings,
not a guarantee of every parking facility or of public access, prices, hours,
live vacancies, or a walkable route. No Google lookup or paid fallback is added.

Parking has separate blue P pins and an accessible list. It does not enter the
recommendation pool or affect Wayfind Scores. **Drive here** targets the selected
parking location. **Walk to venue** starts there and ends at the venue in Apple
Maps. Neither action guesses walking time.

Parking mode focuses on the venue and parking pins, hiding the saved driving
overlay and ordinary nearby pins. Returning to another category restores the
saved drive without requesting it again. Late hotel or driving responses cannot
take over the parking view. Search results live only in the mounted view's memory;
switching categories reuses them. No Apple results are persisted to a database or
browser storage. Errors and empty responses have separate visible states.

Parking commits a padded coordinate-based local region after attaching the
custom image pins and cancels the previous category's camera animation. It does
not rely on asynchronous image sizing to frame the lots. The live canary checks
the achieved Apple map span as well as parking rows and navigation targets.

## Provider failure and venue-local discovery

If Apple's POI service rejects, is malformed, or stalls for four seconds, the
same attempt switches to Apple's general Search service with the Parking-only
filter and a required venue-centered region. The exact circular distance gate
still applies. This makes at most three calls (one failed POI call and two
radius searches) under the existing total deadline. A failed fallback remains
an error, never an empty parking result. Abort and venue-change ownership apply
to both services. Enumerated provider diagnostics reach console and configured
Sentry without raw messages, credentials, queries, or coordinates.

Place sheets and durable place maps share `useVenueNearby`. It pages the owned
map inventory around the selected venue, within eight miles, instead of using
the visitor's browsing city as the candidate source. The map reuses that read
and applies its existing score standard. Loading and failure are explicit;
neither is presented as an authoritative zero. No paid search is added.

## Verification

- `node scripts/test-apple-parking.mjs`: provider contract, radii, bounds, sorting,
  directions, cancellation, timeout, stale results, and error/empty distinction.
- `node scripts/test-event-apple-maps.mjs`: real controller with deterministic SDK;
  parking pins, late updates, saved-route restoration and teardown.
- `node scripts/test-venue-nearby.mjs`: real hook, inventory paging and map
  wrapper, including a visitor in another city, late responses and retry.
- The existing 30-minute production route canary runs
  the live venue-map case in `tests/e2e/shell-route-contract.spec.js` against the real deployed Apple SDK. It
  requires nearby pins and at least one real parking result at its known park
  control, checks drive/walk targets and category return, blocks unrelated
  enrichment/Google requests, and fails the existing route job and canary
  heartbeat on regression. Screenshots/traces are written to the test output.
- `node scripts/test-venue-parking-ui.mjs --require-browser`: real React controls
  at 390/768/1400px with a deterministic Apple fixture. Optional
  `--browser-executable=/absolute/path/to/chrome` selects a local test browser.
  This test does not verify real Apple coverage, token authorization, or tiles.
- After deployment, check real parking results on an event, a place sheet, and a
  `/places` page; verify venue-relative distance, drive/walk targets, category
  toggling with an existing route, and a narrow phone viewport.

Apple API references:
https://developer.apple.com/documentation/mapkitjs/pointsofinterestsearch/search
https://developer.apple.com/documentation/mapkitjs/pointsofinterestsearchoptions
https://developer.apple.com/documentation/mapkitjs/pointofinterestfilter/including
