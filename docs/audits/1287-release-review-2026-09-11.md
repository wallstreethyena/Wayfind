# PR #1287 release review — 2026-09-11

## Verdict

**Do not release PR #1287 at head `468b2cd284d1d862ab9d977bd243540904d10038`.**

The exact eight-file change merges cleanly onto current `origin/main` `3c67249d5c3015801153c4543b7086ab818ae40c`, but it is not release-ready. The consolidated inventory accelerator can certify a server-truncated response as complete and populate the authoritative per-city cache with that slice. Two required guards are also red. One guard failure exposes an outdated fixture rather than a product regression; its committed equivalence snapshot must not be refreshed.

Reviewed files:

- `app/api/date-night/route.js`
- `app/api/intent-candidates/route.js` (deleted)
- `app/api/today-discovery/route.js`
- `app/components/useIntentCandidates.js` (deleted)
- `lib/inventoryBoxBatch.js`
- `lib/nearbyPool.js`
- `lib/railsData.js`
- `scripts/check-intent-rail-inventory-fed.mjs`

## Blocking findings

### 1. Consolidated reads confuse the requested limit with the server response ceiling

`lib/inventoryBoxBatch.js` requests one union box with `limit = 1000 * cluster.cities.length` and accepts the result as complete whenever `rows.length < limit`. Supabase/PostgREST can enforce its configured maximum rows independently of the requested query limit. With the server returning its maximum 1,000 rows for a two-city request whose URL asks for 2,000, the code sees `1000 < 2000`, declares the union complete, ranks the slice, and primes four `srv:` cache entries (two cities by tight/wide radius). Any eligible place beyond the server's first 1,000 rows never reaches those authoritative reads.

Executed proof against the real `primeConsolidatedInventoryReads` implementation:

```text
requestedLimit=2000
serverRows=1000
cacheEntries=4
cacheKeys=srv:food:<city1>:27359..., srv:food:<city1>:48280...,
          srv:food:<city2>:27359..., srv:food:<city2>:48280...
```

This recreates the original arbitrary-slice failure at the accelerator layer. `order=place_id.asc` makes the slice deterministic, but does not make it complete. SQL collation remains authoritative; no JavaScript lexicographic cross-page comparison should be added.

Remediation options, in release-safe order:

1. Disable/remove union priming and let per-city reads own the answer until the accelerator has a completeness proof.
2. Implement stable `Range` paging for the union query, with an absolute deadline for the whole operation and a loud incomplete result when the cap or deadline binds. Prove completeness from an empty/short terminal page or a trustworthy PostgREST content range, not from the requested URL limit.

Add a runtime negative control where a request asks for 2,000, the transport returns 1,000 because of the server ceiling, and no cache key is populated.

### 2. Generic fallback loses secondary-category candidates and can spend two prime deadlines

The union reader retries a primary-category-only query after **any** non-OK response from the `secondary_categories` OR query. A transient 500 therefore becomes a successful but narrower candidate universe. Each attempt also receives a fresh `PRIME_DEADLINE_MS`, so the declared 1.5-second accelerator ceiling is per attempt rather than total.

Executed proof against the real function:

```text
first OR response=500 after 800ms
primary-only fallback=200 after 800ms
PRIME_DEADLINE_MS=1500
elapsedMs=1604
cacheEntries=4
```

Only the known missing-column migration response may use the primary-only fallback. Generic 5xx/timeout/malformed responses must leave the group unprimed. Both attempts must share one absolute deadline. The current `rail-prime-budget-regression` injects `readUnion`, bypasses `fetchUnionBox`, and therefore cannot detect either defect.

### 3. Incomplete nearby/morning reads can still be presented and cached as healthy

`buildNearbyPool` turns a thrown or truncated paged read into an array fallback. `loadPools` catches failures again and retains the older city anchor pools. `buildMorningIdentityPools` similarly catches its exhaustive food read and returns whatever anchor/creator rows were already available. Neither path carries a degraded fact through `loadRailPlaces` to `railMenuData`, and `/api/rails` treats any `failed !== true` result as cacheable for an hour.

An all-500 mocked inventory run through the real `railMenuData` returned:

```text
calls=215
failed=false
covered=true
thin=15
```

Warnings were logged, but the response still claimed successful coverage. This permits transient database failure or a bound exhaustive read to become a cached scarcity answer. Return structured `{ rows, degraded }` state (or throw when no complete nearby answer exists), aggregate it through `loadPools` and `loadRailPlaces`, and make both FastCache and CDN caching require an explicit complete result.

## Guard failures and bounded repairs

### `check-rail-pool-waves.mjs`: 6 of 44 assertions fail

The six failures are stale source-shape checks, not six runtime ordering defects:

- The new combined `buildMorningIdentityPools` is one awaited wave rather than a `Promise.all` containing two builders.
- `buildCreatorsPool` still runs in the first parallel wave.
- `pools.creators` is assigned before `buildMorningIdentityPools` starts.
- `railMenuData` still returns `failed`; the guard requires it to occupy its own line.

Repair the guard around semantic ordering: locate the first-wave await, the creator assignment, and the combined morning await and assert their source positions, then execute a dependency control if practical. Match or execute the returned `failed` property without depending on whitespace. Do not restore two duplicate food readers merely to satisfy the old shape.

### `rail-compute-budget-regression-core.mjs`: 11 failures

Calls and bytes are within budget (`21 <= 23`; `3,634,009 <= 5,100,000` for the default run). One failure is a stale literal used to remove the drive-pool prime for the mutation test; the production block was compacted and the literal now matches zero times. Replace the comment-sized literal with a narrow marker or syntax-aware mutation, still assert exactly one target, and prove the mutated run exceeds the call budget.

The remaining ten failures report large rail shrinkage, but the shrinkage is entirely a fixture defect. The committed harness generates rows only from a URL `limit=`. New `readOwnedCategory` requests pages with HTTP `Range` headers and no URL limit, so the mock returns zero rows for every nearby page and the code correctly falls back to the smaller anchor pools. Commit `73710579` is where the apparent shrink starts.

A temporary transport-only correction made the fixture honor `init.headers.Range` offsets and lengths. Exact head then returned byte-identical baseline counts:

| Scenario | Date night | Drive | Eat | Today | Tonight | Calls | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Lakewood Ranch | 39 | 33 | 96 | 166 | 95 | 18 | 4,320,719 |
| Parrish | 37 | 28 | 78 | 175 | 90 | 18 | 4,132,785 |

Update the fixture to model Range paging and assert that successive pages advance. **Do not refresh the committed equivalence snapshot:** no real rail shrink remains once the mock implements the transport contract.

## Focused verification

The exact head merged locally without conflict onto current main. These focused checks passed:

- `check-intent-rail-inventory-fed.mjs`: 17 assertions
- `check-nearby-pool.mjs`: 53 assertions
- `check-identity-before-cap.mjs`: 100 assertions
- `test-date-night-intent.mjs`: 166 assertions
- `test-today-discovery-rails.mjs`: 44 assertions
- `test-inventory-batch-concurrency.mjs`
- `rail-prime-budget-regression.mjs`
- `test-rail-compute-budget.mjs` harness execution
- `test-rail-paging.mjs`: 82 assertions
- `git diff --check`

These passing checks validate the intended identities and declared radii: nearby rings `6/10/17mi`, beaches `23mi`, breakfast `10mi`, creator finds `25mi`, Date Night `27mi`, and Today nature `75mi`. `readOwnedCategory` orders by SQL `place_id.asc`, pages by Range, refuses malformed bodies, and marks its 6,000-row runaway ceiling as truncated. The focused suite does not cover the union reader's real transport or degraded propagation described above.

## Release status

No production request or deployed SHA was verified. The review proves a clean textual merge and local behavior at the exact revisions above. PR #1287 needs the union completeness/deadline correction and the two guard repairs before release; degraded-state propagation should be resolved before describing the global candidate-integrity path as complete or safely cacheable.
