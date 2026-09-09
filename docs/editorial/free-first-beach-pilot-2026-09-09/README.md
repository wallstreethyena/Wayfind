# Free-first beach editorial pilot

Research and inventory snapshot: 2026-09-09.

## What this proves

Wayfind can publish a small, auditable set of researched descriptions without a model or a new Google Places request. Each candidate carries concise paraphrased evidence, exact source URLs, citations for every prose field, and facts that must match a source's `supports` list exactly. The validator then runs the existing Atlas honesty and publishability gates.

This is a five-row pilot, not a claim that the wider backlog is complete. The current missing-`wf_editorial` population is 17,017 operational, unflagged inventory rows. Of those, 1,367 have some inventory editorial/card content, but only 21 have a card with source URLs; 1,346 are summary-only and cannot be promoted as researched copy. Another 15,650 have neither inventory editorial nor an editorial card.

The paid Atlas job is intentionally parked by `FREE_MODE`, and September's `details_enterprise` ledger is already 950/950. The existing `atlas-batch` path also calls Anthropic. Turning either path on would violate the free-first constraint and would not make unsourced summaries publishable.

## Blank-slot rule

The pilot only accepts a candidate when all of these are absent:

- `wf_editorial`
- `wf_inventory.editorial`
- `wf_inventory.editorial_card`
- Atlas editorial reached by direct place ID or `resolveAtlasId`
- Atlas editorial reached by exact `atlasCardForName`
- legacy editorial reached by `editorialFor(name)`

The live preflight also requires an exact name, category, metro, and primary-type match plus `status='OPERATIONAL'` and `needs_review=false`. The insert uses `resolution=ignore-duplicates`, returns inserted rows, and only reports success when the returned IDs are unique, exact, verified, and issue-free.

## Pilot sources

| Place | Checked sources |
|---|---|
| Cortez Beach | [City of Bradenton Beach](https://www.cityofbradentonbeach.com/189/Beaches), [Florida DEP coastal access guide](https://floridadep.gov/rcp/coastal-access-guide/content/manatee-county) |
| South Lido Key Beach Park on the Gulf | [Sarasota County Parks](https://www.sarasotacountyparks.com/Home/Components/FacilityDirectory/FacilityDirectory/853/6738), [Visit Sarasota](https://www.visitsarasota.com/beaches-parks/south-lido-beach) |
| Henderson Beach State Park | [Destin-Fort Walton Beach](https://www.destinfwb.com/listing/henderson-beach-state-park/82/) |
| Lighthouse Beach Park | [City of Sanibel](https://www.mysanibel.com/543/Lighthouse-Beach-Park-Information) |
| Bowman's Beach | [City of Sanibel](https://www.mysanibel.com/546/Bowmans-Beach-Park-Information) |

The full claims, prose, field citations, identity snapshot, and checked dates are in `beach-editorial-pilot.json`. Advice such as checking posted flags or conditions is kept out of the source `supports` arrays so it cannot be confused with a fact stated by a source.

## Operator flow

```bash
# Offline validation only; no credentials, database call, or provider call.
node scripts/publish-owned-editorial.mjs

# Read-only production identity and blank-slot preflight.
node scripts/publish-owned-editorial.mjs --live

# Guarded insert after a named reviewer has checked the pack.
node scripts/publish-owned-editorial.mjs --commit --reviewed-by "<actual reviewer>"
```

The five rows passed offline validation and the production read-only preflight on 2026-09-09. Codex independently reviewed the cited source pages and corrected unsupported route, canopy and water-condition claims. The final write was rejected by automatic approval review, which required fresh confirmation for the specific five-row production insert. **No production rows were written.** The reviewed pack remains ready for that approval; do not work around the rejection through a different write path.
