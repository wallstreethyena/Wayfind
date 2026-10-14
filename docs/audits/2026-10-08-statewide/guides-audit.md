# Guide placement audit, prod www.gowayfind.com, 2026-10-09 (read-only)
Rules (CLAUDE.md PR #1696, lib/railGuideSlot.js, check-guide-in-rail.mjs): guide is card 3 (index 2) INSIDE the rail; <2 cards -> last; no rank, not counted (counters/ranks skip it); once per rail collection, never duplicated across rails; nothing rendered between rails.
Checked: ?rail=christmas, ?rail=augtober (Fall+Halloween), ?rail=season, ?rail=today, home, at 390x844 (innerWidth=390) and 1440x900. Screens in guides/.
PASS: Christmas 5/5 rails guide at index 2, ranks 1..N skip guide, 5 distinct guides, counters exclude guide, no guide between rails, both viewports. Fall: 9 rails, ranks 1..7 around guide, guide index 2.
VIOLATION (relevance): Fall "Florida Fall Photo Spots" shows Christmas guide "Florida Holiday Nights Out 2026" (matched via Marie Selby place). lib/guideRailCollections.js matches on any placeIds overlap, no season/topic check. Same guide also in Today rail today-discovery-nature.
GAP: Halloween rails (theme parks, family, date night, haunts) get no guide; one guide per collection by design (only 1 of 9 Fall rails has one). orlando-halloween-food-2026 not matched (Orlando region).
MINOR: RailDots counts items only (guide slide has no dot).
