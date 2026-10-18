# Apple map missing-pin repair

The Tampa map already used Apple MapKit. Its area reader correctly rejected expired Google coordinates, while the list still showed the place identity. The 9.2+ map threshold further reduced the visible set. The old notice incorrectly described every coordinate source as having a 30-day lifetime.

This change checks existing eligible missing identities using the already loaded Apple MapKit Search service. It makes at most 12 attempts per batch, 36 per mounted SDK lifetime, with two actual outstanding requests and an eight-second deadline. Attempts do not repeat within the same scope. There are no Google refresh calls, writes to inventory, or changes to the Google 30-day freshness rule.

Acceptance requires an exact normalized name, a unique match inside the requested bounds, and positive venue locality or numbered-street evidence. Chains and ambiguous same-name branches require the street. Actual `wf_inventory.locality` passes through the existing read and client mapper; the visitor's city and inventory metro are never substituted. Inventory response schema `mapcoord3` prevents old cached rows without locality from masking the repair.

Accepted points remain in memory for Apple 2D display. Distances and scores are recalculated, and the same category, 9.2+ qualification and ordering apply to pins, cards and counts. Origin/evidence changes invalidate results. Switching to 3D hides Apple points and focus immediately. Saves, shares, details and analytics receive the original Wayfind record; generic cards and photo healing cannot receive the temporary coordinates.

Limits: this does not promise every list place gets a pin. Low scores, missing identity evidence, ambiguous matches, out-of-view results, Apple errors and the request budget may leave places unpinned. It does not backfill a persistent independent coordinate database. Apple service usage is bounded but still consumes the existing Apple account's allowance.

Regression coverage includes strict matching and negative controls; real hook cancellation, late results, concurrency and lifetime budget; real Map screen boundaries; and the real inventory server/client mapper. Final CI, build and deployed behavior are recorded on the pull request.

Live follow-up: the first production release passed hosted CI and loaded Apple maps, but the observed Tampa Night out count remained seven. That observation alone does not establish successful recovery. A separate real-hook reproduction proved that changing only a photo field erased an accepted pin while leaving the recovery count at one. Cache validity and effect triggering now share the same material-evidence fingerprint, excluding presentation-only metadata. Browser diagnostics contain counts only, with no place identifiers, queries, returned Apple content or coordinates.
