# Free-tier inventory refresh (owner decision 2026-10-25)

Goal: keep `wf_inventory` checked against Google at $0 extra, losing nothing.

## What runs
`/api/cron/inventory-refresh` (hourly, `10 * * * *`) now runs in `WAYFIND_GATE=free`. `shut` is still zero calls.
Every Google call takes one grant through `spendAllowRefresh` (lib/spendGate.js): the same ledger row the site and promoter use, plus its own `refresh_<sku>` counter, capped at the FREE line only (never the promotion paid ceiling).

| tier | field mask | Google free line | ledger row cap | refresh sub-cap | starts |
|---|---|---|---|---|---|
| essentials | id, location, movedPlaceId | 10,000 | 9,500 | 8,000 (hotel identity keeps 1,500) | on deploy |
| pro | + businessStatus | 5,000 | 4,800 | 2,400 | Nov 2026 ledger month |
| enterprise | lib/placeDetails FIELDS | 1,000 | 950 | 475 | Nov 2026 ledger month |

Prices past the free line ($5 / $17 / $20 per 1,000) can never be reached: the shared-row ceiling refresh uses is the free line.

## What each tier writes
- enterprise: the existing dated patch (coordinates, status, types, `refreshed_at`). Only real Google values; never blanks.
- pro / essentials: `signals.google_checked_at`, `google_check_tier`, and one `independent_coords` entry (`method: inventory-essentials-check`, source google_places, `observed_at` = the instant Google answered). Never `refreshed_at`, never `lat`/`lng`.
- NOT_FOUND: `signals.google_not_found_at` only. Row stays, nothing excluded.
- locked rows: flags only.

Queue: anchors first, then most-reviewed, never-checked/longest-unchecked first. A row checked inside 25 days leaves the queue.

## Before the first live run
`node scripts/backup-wf-inventory.mjs` (dry run), then `--apply` with `SUPABASE_ACCESS_TOKEN` and `NEXT_PUBLIC_SUPABASE_URL` set. Creates `public.wf_inventory_backup_<date>` (RLS on, no grants), verifies the row count.
