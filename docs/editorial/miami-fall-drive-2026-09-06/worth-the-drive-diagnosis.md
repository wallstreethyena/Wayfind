# Worth the Drive — Miami emptiness is a registry gap

**Not editorial. Architect owns the unblock.**

Poster audit 2026-09-06: Worth the Drive showed twelve first-window candidates in Parrish/Tampa and **zero** in Miami. `pools.drive = 0`.

## Why the pool is empty

`lib/railsData.js` `buildDrivePool` only adds inventory from **other** `LANDING_CITIES` whose centres are within `DRIVE_REACH_MI` (27 miles) of the reader. Rows already in the reader's metro pools are skipped.

`LANDING_CITIES` has one South Florida city: `miami` (25.7617, −80.1918). Tampa, Orlando, and the Gulf landings are hundreds of miles away. A Miami reader therefore has **no other landing centre inside 27 miles**, so `extra` is empty and the function returns `[]`.

That is the same mechanism that fills Parrish: Tampa sits inside 27 miles of a Parrish reader, so Busch Gardens-class inventory can enter the drive pool. Miami has no equivalent neighbour landing.

## What this pack does not do

This pack does **not** edit `LANDING_CITIES`, `METRO_COORD_KEY`, `BEACH_METROS`, or any coords registry.

Fall discoveries in `lib/fallDiscoveries2026.js` do not fill Worth the Drive. They fill `/api/events/fall` rails.

## Architect unblock

1. Add **Fort Lauderdale** and **Homestead** landings. Both town centres sit near the 27-mile ring from downtown Miami and would give `buildDrivePool` cities to read.
2. Add **Keys coordinates** (and a landing if the product wants Key Largo / Bahia Honda as drive targets). Pennekamp and Bahia Honda two-beats are ready in `drive-park-editorial.json`; they cannot attach until place inventory and coords exist.

Until those landings exist, Miami Worth the Drive staying empty is correct behaviour, not a missing editorial card.
