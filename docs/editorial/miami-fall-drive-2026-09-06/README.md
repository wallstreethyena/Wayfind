# Miami Fall 2026 + Worth the Drive park pack

**Date:** 2026-09-06  
**Owner:** Editorial Writer  
**Do not merge registry work from this pack.** Product Architect owns `LANDING_CITIES`, `METRO_COORD_KEY`, `BEACH_METROS`, and any other landing / metro-coord registry.

Poster audit 2026-09-06 found all ten Miami Fall rails empty (inventory) and Worth the Drive `pools.drive = 0` from Miami (registry). This pack ships the Fall discoveries into `lib/fallDiscoveries2026.js` and leaves Drive park copy here until Architect attaches place inventory.

## What shipped

Seventeen Fall 2026 discoveries, each `place_id: null`, pinned in `FALL_DISCOVERY_RAIL`. Official pages were fetched 2026-09-06. Dates, awards, hours, and place ids were not invented. American German Club of Lake Worth is skipped (different venue from Oktoberfest Miami). Disney is skipped.

See `miami-fall-discoveries.json` for the full objects.

## Event ids and rails

| Rail | event_id |
| --- | --- |
| farms | `the-berry-farm-harvest-festival-2026` |
| farms | `bedners-fall-festival-2026` |
| haunts | `the-horrorland-jungle-island-2026` |
| haunts | `house-of-horror-carnival-2026` |
| haunts | `nightmare-village-xtreme-action-park-2026` |
| oktoberfest | `oktoberfest-miami-german-american-social-club-2026` |
| oktoberfest | `weekend-at-berryhaus-2026` |
| family | `not-so-scary-halloween-bash-miami-childrens-museum-2026` |
| family | `zoo-boo-zoo-miami-2026` |
| family | `boo-bash-pompano-beach-2026` |
| family | `bonnet-house-halloween-fest-2026` |
| family | `boo-in-bloom-fruit-spice-park-2026` |
| family | `roars-smores-snores-spooktacular-campout-zoo-miami-2026` |
| festivals | `deerfield-beach-fall-festival-2026` |
| theme-parks | `zoo-miami-monster-masquerade-2026` |
| date-night | `halloween-at-faena-miami-beach-2026` |
| food | `palace-miami-beach-fall-harvest-menu-2026` |

## Fuller hooks (card_hook is the ≤70-character cut)

Cards keep the short hook. These are the longer editorial lines.

- **The Berry Farm Harvest Festival** — South Florida's only 5-acre corn maze with pumpkin patch and sunflower fields in Redland.
- **Bedner's Fall Festival** — Boynton Beach farm Fall Festival with pumpkin patch and hayrides Oct 3–Nov 1.
- **The Horrorland** — Season 7 Jungle Island scream park — houses, scare zones, Circus of Terror.
- **House of Horror Carnival** — Tropical Park haunt-carnival with Blind Terror dark coaster and midway rides.
- **Oktoberfest Miami** — German beer, bratwurst, and European bands — two weekends at the Social Club.
- **Deerfield Beach Fall Festival** — Free Pioneer Park night with pumpkin patch, Biergarten, and Trunk-or-Treat.
- **Halloween at Faena** — Faena Living Room Halloween soirée with prelude dinners and Everafter theater.

## Honesty notes

- **Palace Fall Harvest** uses press (WSVN Deco Drive). Palace's own homepage at fetch listed Miami Spice and standing menus only — no Fall Harvest block. `end_date` is null. `source_type` is `press`, so this is **not** a seasonal-place card until an owned `place_id` exists.
- **House of Horror** `end_date` is null on purpose. The official homepage published the September 24 open and nightly hours, not a close.
- **Bedner's** official `/fall-festival/` page confirmed the 2026 season but did not publish hours in the fetched HTML. Dates follow the coverage pack.
- **Boo in Bloom** is sourced from the Miami & Beaches listing, not a Fruit & Spice Park first-party page.
- One-day events (`Not So Scary`, `Boo Bash`, `Bonnet House`, `Boo in Bloom`, `Deerfield`, `Monster Masquerade`) set `end_date` to the same day so they cannot sit "open" after they end.
- Coordinates are coverage-pack approximations (Fruit & Spice reuses the in-repo summerUniverse pair). They are for distance gating, not Places identity.

## Architect handoff — registry only

Worth the Drive Miami emptiness is **not** an editorial gap. `buildDrivePool` only reads **other** `LANDING_CITIES` whose centres sit within `DRIVE_REACH_MI` (27) of the reader. South Florida currently has one landing: `miami`. A Miami reader therefore contributes zero extra cities, so `pools.drive` is `[]`.

Needed from Architect (do not do it in this pack):

1. **Fort Lauderdale and Homestead landings** — both centres sit near the 27-mile ring from downtown Miami and would give the drive pool somewhere to read.
2. **Keys coords / landings** — Pennekamp and Bahia Honda cannot attach as drive or day-trip inventory until the Keys have governed coordinates and, if required, a landing. Editorial two-beats are in `drive-park-editorial.json`.

Do **not** edit `LANDING_CITIES`, `METRO_COORD_KEY`, or `BEACH_METROS` here.

## Files

- `miami-fall-discoveries.json` — the 17 objects + rail map
- `drive-park-editorial.json` — seven park two-beats for Architect to attach
- `worth-the-drive-diagnosis.md` — registry diagnosis, short
