# Surface parity audit — reports in this directory

`scripts/surface-parity-audit.mjs` (plus `scripts/lib/parity/*`) is a reusable,
LIVE diagnostic that compares what Wayfind's own eligibility pipeline says
*should* appear on a surface against what that surface actually serves/renders
in production. It never re-implements the pipeline it is checking — every
level below calls the real repo code (`lib/inventoryServe.js` via
`scripts/lib/parity/eligibility.mjs`, `lib/landing.js`, `lib/creatorVideos.js`,
`lib/railSelect.js`) and reports where a real, currently-eligible place is
invisible on a real surface, classified into one of the 8 root-cause classes
in `scripts/lib/parity/report.mjs` (`ROOT_CAUSE_CLASSES`).

`scripts/check-surface-parity-hermetic.mjs` is the NO-NETWORK regression lock
for the classifier itself (wired into `scripts/run-guards.mjs` via
`scripts/guards.txt`) — it never calls production and must stay green on
every commit.

## The five levels

| `--level=` | what it checks | needs `--cities` | needs a browser |
| --- | --- | --- | --- |
| `api` (default) | every `(city, chip)` pair's exhaustively-paged `inv=1` API response vs. the real eligible set | yes | no |
| `browser` | the same, but through a REAL headless Playwright session — clicks the actual category/sub-chip UI path (derived from `lib/categories.js`/`lib/google.js`, never hand-listed) and the "Wayfind 5 more spots" continuation to exhaustion | yes | yes (Playwright/Chromium) |
| `seo` | every `lib/landingInventory.js` SEO/local landing route (`/things-to-do`, `/restaurants`, `/beaches`, `/nightlife`) × city — the rendered HTML's crawlable `/p/<id>?action=save` links vs. the page's own live `rankedFor()` ranking, grouped through `lib/venueContainment.js` | yes | no |
| `creator` | every `(creator, place id)` pair from `lib/creatorVideos.js`'s `allCreators()` that is OPERATIONAL in inventory — the real `creatorVideosFor()` resolver, plus (for page-eligible creators) their live `/creators/<handle>` page | no | no |
| `rails` | every `lib/railSelect.js` `RAIL_SELECT` rail that has a real, callable `identity` predicate — its live `/api/rails` served set vs. that predicate applied to a live inventory box read; curated rails with no category contract are recorded out of scope with their own `waiver`, never forced | yes | no |

Every level requires `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and
`SUPABASE_KEY` in the **calling shell's environment only** — an anon/
publishable key is enough (`wf_inventory` is anon-readable). **Never** write
either into a repo file; the script itself refuses to run without them being
present as real environment variables (`envFromProcess()`), which also means
they can never be hardcoded here by mistake.

Full flag reference is the header doc comment of
`scripts/surface-parity-audit.mjs`.

## Post-deploy AFTER run — one command per level

Once the production fix (honest reachability, the client render-time gates,
etc.) is deployed, re-run every level with a fresh `--out`/`--label` so the
new reports sit next to the `*-before*` ones in this directory for a direct
diff. Each level is exactly one command:

```bash
# api — statewide, every FL LANDING_CITIES city x every chip, with the
# cache-drift regression re-check (should find zero drift post-fix).
SUPABASE_URL=... SUPABASE_KEY=... node scripts/surface-parity-audit.mjs \
  --level=api --checkCacheDrift \
  --out=docs/audits/surface-parity/$(date +%F)-after-api \
  --label=after-fix-$(date +%F)

# browser — every FL city x every UI-reachable chip (derived from
# CATEGORY_TILES/SUBFILTERS, so it automatically includes an eligible>400
# pair such as Tampa food:all / Parrish attractions:all), clicking the
# continuation to genuine exhaustion.
SUPABASE_URL=... SUPABASE_KEY=... node scripts/surface-parity-audit.mjs \
  --level=browser \
  --out=docs/audits/surface-parity/$(date +%F)-after-browser \
  --label=after-fix-$(date +%F)

# seo — every landingInventory.js route x every FL city, rendered HTML vs.
# the page's own live ranking.
SUPABASE_URL=... SUPABASE_KEY=... node scripts/surface-parity-audit.mjs \
  --level=seo \
  --out=docs/audits/surface-parity/$(date +%F)-after-seo \
  --label=after-fix-$(date +%F)

# creator — every (creator, place id) pair from allCreators(), no --cities
# needed (each pair carries its own city internally).
SUPABASE_URL=... SUPABASE_KEY=... node scripts/surface-parity-audit.mjs \
  --level=creator \
  --out=docs/audits/surface-parity/$(date +%F)-after-creator \
  --label=after-fix-$(date +%F)

# rails — every identity-bearing RAIL_SELECT rail x every FL city.
SUPABASE_URL=... SUPABASE_KEY=... node scripts/surface-parity-audit.mjs \
  --level=rails \
  --out=docs/audits/surface-parity/$(date +%F)-after-rails \
  --label=after-fix-$(date +%F)
```

(The `api` command above is also printed, filled in with the actual `--out`
used, at the end of every run of the script.)

## Files in this directory

- `2026-09-23-before.json` / `.md` — the pre-fix, statewide `--level=api`
  sweep (14 FL cities × every chip) that found the original defect.
- `2026-09-23-before-browser-parrish-fixture.json` / `.md` — the pre-fix
  `--level=browser` capture at the real Parrish `DEFAULT_CENTER` origin
  (Food › Cafés), the live counterpart of `scripts/lib/synthetic/
  scenarios.mjs`'s `surface-parity-parrish-cafes` scenario.

**`2026-09-23-before-seo-landing-parrish.*` was removed (PR #1495 fix round,
item 3).** It was produced by an ad-hoc, one-off `"level": "seo-landing"`
script that was never committed to the repo — its numbers cannot be
reproduced or audited by anyone else. `--level=seo` above is that check's
real, repo-committed replacement (same idea: rendered landing HTML vs. the
page's own true top-N ranking, but calling `lib/landing.js`'s actual
`rankedFor()` and `lib/venueContainment.js`'s actual `groupByContainment()`
rather than a hand-rolled approximation). This environment has no production
Supabase credentials to run it honestly, so rather than recommit an
unreproducible ad-hoc result, the file was deleted; whoever runs the
`--level=seo` command above (production is still pre-fix, so the result
should match the original 48-pair/48-place finding) should commit its
`docs/audits/surface-parity/2026-09-23-before-seo-landing-parrish` output — or
any equivalent `*-before-seo*` name — in its place.
