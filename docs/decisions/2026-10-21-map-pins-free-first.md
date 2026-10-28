# Decision record: map pins are free first (2026-10-21)

Status: decided by the owner. Implementation parked until Apple credentials are configured.

Recorded by the claude.exe (Wayfind lane) from the owner's statements on 2026-10-21 and 2026-10-22.

## Decision

1. Wayfind will not pay for map pin coverage. The Google search options that cost about $80 per month were rejected.
2. Every place should get a pin, and it should be free.
3. Apple Maps is the intended route: a MapKit place match, run by the job `apple-place-match`.
4. Map rule: a map opened from a list, a search, a category or a rail shows every place in that result set that has verified coordinates. There is no hidden 9.2 score cutoff on those maps.
5. The standalone All places map keeps its score threshold (currently `MAP_MIN_SCORE = 9.2` in `lib/mapAreaData.js`) until the owner decides separately.
6. Coordinates are never guessed, and a different business is never matched to a place to raise coverage. A place without a verified match simply has no pin yet.

## Status

The Apple route is parked because Apple credentials are not configured. The job pulse says:

`apple credentials not configured; no Apple calls (map keeps existing pins + Search fallback)`

So today the map keeps the pins it already has and uses the Search fallback for the rest. No Apple calls are made and no money is spent.

## What unblocks it

The owner sets the Apple team id and the MapKit server credentials in Vercel project settings. In code (`lib/appleMatchJob.js`) the variables are named `APPLE_MAPS_TEAM_ID`, `APPLE_MAPS_KEY_ID` and `APPLE_MAPS_PRIVATE_KEY` (the .p8 key), with `APPLE_MAPS_SERVER_TOKEN` as an unverified fallback. They are set by the owner directly in Vercel and are never pasted in chat, in a PR, or in a file. Once they are present, the `apple-place-match` job starts matching on its own schedule and the pulse note changes.

## Free sources already in use

- `wf_inventory` coordinates already stored for each place.
- US Census geocoding.
- photon.
- nominatim, held to one request per second or less, per the event task.

## Guard rails for whoever picks this up

- Do not add a paid geocoder or a paid Google search option to raise coverage.
- Do not loosen matching so that a nearby or similarly named business gets accepted. A wrong pin is worse than no pin.
- Do not apply the All places threshold to maps opened from a list, search, category or rail.

Related code: `app/api/cron/apple-place-match/route.js`, `lib/appleMatchJob.js`, `lib/appleMapRecovery.js`, `lib/mapAreaData.js`, `scripts/test-apple-free-pins.mjs`.
