# Creator Finds verified-line packs

Research date: 2026-10-31. Published 2026-10-31 with the canonical guarded
publisher (`scripts/publish-owned-editorial.mjs --commit`), reviewer
"Gabriel (owner) via Muse research session 2026-10-31".

## Why

Creator Finds cards showed no verified editorial line for most registry
places. Of 409 named creator-registry places with Google place ids, 355 had
no verified ("wayfind" tier) line. This batch researched the 249 that the
publisher can accept (inventory row present, OPERATIONAL, unflagged, no
inventory editorial card, no verified row already).

## Method

Each place was researched from its official venue website first, else a
tourism DMO or government page. Every candidate passed the publisher's
offline review (source classes, citation grounding, word caps, hook law)
plus live preflight identity checks before writing. 67 rows replaced
never-verified all-blank `wf_editorial` placeholders through the guarded
update path; the rest are new inserts.

## Result

- 204 verified `wf_editorial` rows written (packs 01–06).
- 38 places skipped in research: no official/DMO/government source could
  verify them (delivery-aggregator or social listings only), one marked
  closed, one (The Happy Hangar Café) whose only source serves no https.
- 7 places refused by the publisher's static dedup because the owner's
  legacy editorial already covers them by name: FloridaRAMA, American
  Victory Ship & Museum, Space 220, Casey's Corner, Summer House on the
  Lake, Rocca, Elliott Aster.
- 100 registry places have no `wf_inventory` row and cannot be published
  through this path; 2 carry non-blank unverified rows (owner review
  needed before replacement) and 1 is flagged needs_review in inventory.

After publish, 252 of 409 registry places hold a verified hook in
`wf_editorial` (the rest of the previously speaking cards resolve through
Atlas cards and inventory editorial-card rungs).
