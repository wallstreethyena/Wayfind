# Florida seasonal hospitality research, October 18, 2026

Purpose: make immersive seasonal bars, decorated restaurants, themed menus and seasonal parties discoverable from the existing Fall, Halloween and Christmas posters using Wayfind's shared venue cards.

The research packet contains 530 candidate records. These are leads, not 530 approved venues. The reviewed catalog contains 206 offerings attached to 191 exact owned venue identities. Runtime evidence, schedule, operational-state and stored-photo checks admit 188 distinct venues on October 18. Season totals overlap: Fall 82, Halloween 130, Christmas 21. Existing attractions and other seasonal listings continue through their existing sources; these counts describe the new hospitality overlay only.

**The requested minimum of 50 per covered area is not met.** Area counts and gaps must not be presented as completed coverage. `runtime-coverage.json` records the current counts by research area. Research areas group nearby covered cities; they are not a claim of 50 in every city.

## Files

- `Wayfind-Seasonal-Venues-2026.csv`: reviewable offerings with sources, menu details, seasons, dates and exact place IDs.
- `Wayfind-All-Seasonal-Candidates-2026.csv`: all 530 research records, including pending, historical and excluded candidates; not a publication list.
- `runtime-coverage.json`: observed admission counts against an owned-inventory read.
- Regional JSON and notes: source research, including pending and excluded leads.
- Identity JSON: exact matches and held identities. A hotel record is not a substitute for an unverified hotel lounge.
- `../../../research/seasonal-catalog-audit.json`: selection decisions, holds, cross-season corrections and deduplication.
- `../../../lib/seasonalHospitalityCatalog2026.js`: the reviewed runtime catalog.

## Publication rules

Only confirmed 2026 or verified permanent offerings with exact venue identities enter the overlay. Folklore alone does not qualify as decoration. Previous-season pop-ups, closures, unresolved branches and past events are held out. Unknown prices, opening dates and service calendars stay unknown. A seasonal date range does not mean daily service. Select-date venues without an exact calendar cannot qualify for exact-date or imminent-plan filters.

Immersive environments lead the Halloween collection. Ordinary seasonal menu items use a separate food and drink rail. Parties retain their own category. Christmas hospitality also appears in the statewide Christmas browse with the same evidence and date rules. Scores, photo ownership, location admission, save/share actions and card geometry use the existing Wayfind implementation.

## Verification status

Astra reviewed the catalog joins, source samples, seasonal splits and the corrected date and duplicate logic. Focused runtime tests passed. Full-suite, production-build and rendered checks are recorded separately in the implementation PR; this research file does not claim a deployment or completion of the 50-per-area target.
