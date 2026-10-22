# Map release, October 2026 (runbook)

Project: Supabase `gbhtoehdxkzjsmmkisgu`. Everything here costs nothing: no Google
call, no paid Apple tier. Prepared with read-only database access on 2026-10-22;
nothing in this runbook has been applied yet.

What ships in this release:

1. **List to map.** A map opened from a list, search, category or rail draws every
   place of that result set that has a permitted, verified coordinate. No hidden
   9.2 floor. The standalone "All places" map keeps its 9.2 floor (see section 6).
2. **Apple Place ID backfill as a nightly job.** `/api/cron/apple-place-match`
   matches inventory to Apple Place IDs in bounded, resumable batches inside the
   shared free Apple allowance.
3. **Fresh Apple Place IDs on the map.** The map reads stored Place IDs from
   `/api/places/map/list` (never cached), so tonight's matches show tomorrow
   morning instead of waiting out the list's day long edge cache.

Code: `lib/mapListScope.js`, `lib/mapAreaData.js` (`readMapPlacesByIds`),
`app/api/places/map/list/route.js`, `app/components/screens/Map.js`,
`lib/appleMapRecovery.js` (`minScore`), `lib/appleMatchJob.js`,
`app/api/cron/apple-place-match/route.js`, `scripts/apple-place-match.mjs` (manual
run of the same job). Guard: `scripts/test-map-release-2026-10.mjs --red-prove`.

---

## 1. Migrations

| File | Purpose | Needed for | Status (2026-10-22) |
|---|---|---|---|
| `supabase/migrations/20261021180000_wf_apple_place_ids.sql` (4,464 bytes, sha256 `e48800727ae58370478ded154224fce8fbd394aa3ab30b19715a65e47aef908d`, md5 `6bc754aaf0253a520ffedfd1fd1dd2b4`) | Table `wf_apple_place_ids` (Place IDs and refusal reasons only, RLS on, no anon/authenticated grants) and the `apple_maps` row in `wf_source_registry` (daily ceiling 15,000) | Everything Apple: the backfill, Place ID lookups on the map, the browser budget ledger | Pending (declared in `scripts/migration-pending-apply.json`). Table absent, registry row absent, no ledger row |
| `supabase/migrations/20261022120000_wf_heartbeat_expected_apple_place_match.sql` (1,245 bytes, sha256 `a5ee7b9a3d7533e7a144fbd99f05f1e47d525f69886d7b0d459a579875aee451`, md5 `21c0338ea58d45766b308ba6ed3b22e4`) | One `wf_heartbeat_expected` row (`apple-place-match`, 1800 min) so the nightly cron pages if it stops firing | Monitoring only | Pending. Apply after this PR merges and the first pulse lands |

The list to map change needs no migration.

Order: apply `20261021180000` first, then `20261022120000` after the first pulse.
Re-verify each file right before applying: `git show origin/main:<file> | sha256sum`.

### Apply commands

From a fresh isolated worktree of `origin/main` (CLAUDE.md: never the shared clone):

    git fetch origin main
    git worktree add -b db-apply-map-release <path-outside-clone> origin/main
    cd <that path>
    git config --worktree user.name "claude.exe (Wayfind lane)"
    export SUPABASE_ACCESS_TOKEN=...      # Management API token
    export SUPABASE_URL=https://gbhtoehdxkzjsmmkisgu.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=...
    node scripts/apply-migration.mjs supabase/migrations/20261021180000_wf_apple_place_ids.sql
    # later, after the first apple-place-match pulse:
    node scripts/apply-migration.mjs supabase/migrations/20261022120000_wf_heartbeat_expected_apple_place_match.sql

Names only above; never paste values anywhere. The script writes receipts to
`scripts/migration-apply-log.jsonl`. In the same follow-up commit, add those
receipt lines and remove the applied file's entry from
`scripts/migration-pending-apply.json` (the canary reports "stale pending entry"
until that commit merges). Tip: remove the pending entry in the worktree before
running the script, so its reconcile step exits 0; restore it if the apply fails.

Connector alternative (no Management token): MCP `apply_migration` with the whole
file text byte for byte and `name` = `wf_apple_place_ids` /
`wf_heartbeat_expected_apple_place_match`; then write the receipt line by hand.
Never the plain SQL editor (no ledger row).

### Validation SQL (expected results)

Before `20261021180000`:

    select count(*) from supabase_migrations.schema_migrations where name = 'wf_apple_place_ids';   -- 0
    select to_regclass('public.wf_apple_place_ids');                                                -- null
    select count(*) from public.wf_source_registry where provider = 'apple_maps';                   -- 0

After `20261021180000`:

    select version, name, array_length(statements, 1) n, md5(statements[1])
      from supabase_migrations.schema_migrations where name = 'wf_apple_place_ids';
    -- 1 row, n = 1, md5 = 6bc754aaf0253a520ffedfd1fd1dd2b4
    select relrowsecurity from pg_class where oid = 'public.wf_apple_place_ids'::regclass;          -- true
    select has_table_privilege('anon', 'public.wf_apple_place_ids', 'select'),
           has_table_privilege('authenticated', 'public.wf_apple_place_ids', 'select');             -- false, false
    select provider, status, metered, hard_call_ceiling_daily, cost_after_free_micros, internal_use
      from public.wf_source_registry where provider = 'apple_maps';
    -- apple_maps | healthy | true | 15000 | 0 | true
    select count(*) from public.wf_apple_place_ids;                                                 -- 0 (until the first run)
    -- Ledger smoke test (spends ONE unit of today's free allowance; optional):
    select * from public.wf_reserve_free_provider_call('apple_maps', 'server_search', current_date, 1);
    -- allowed true, reason reserved

After `20261022120000`:

    select job, max_staleness_minutes from public.wf_heartbeat_expected where job = 'apple-place-match';  -- 1 row, 1800
    select version, name, array_length(statements, 1) n, md5(statements[1])
      from supabase_migrations.schema_migrations where name = 'wf_heartbeat_expected_apple_place_match';
    -- 1 row, n = 1, md5 = 21c0338ea58d45766b308ba6ed3b22e4

### Rollback

`20261021180000` (removes stored Place IDs; the map falls back to existing pins and
the session Search fallback; the cron goes back to "ledger not provisioned"):

    delete from public.wf_provider_usage_daily where provider = 'apple_maps';
    delete from public.wf_provider_call_budget_daily where provider = 'apple_maps';
    delete from public.wf_source_registry where provider = 'apple_maps';
    drop table if exists public.wf_apple_place_ids;

`20261022120000`:

    delete from public.wf_heartbeat_expected where job = 'apple-place-match';

Ledger rows stay after a rollback (the canary still reads the file as applied). To
make the repo say "not applied" again, delete the ledger row and restore the
pending entry; usually write a new migration instead.

---

## 2. Apple account setup

The code reads server only variables, never `NEXT_PUBLIC_`.

### The documented path: a Maps ID and a private key (.p8)

This is the path Apple documents for the Maps Server API ("Creating and using
tokens with Maps Server API"). The job signs a short ES256 JWT with the key on
every run (`{alg: ES256, kid, typ: JWT}` / `{iss: team id, iat, exp <= 1 h,
scope: "server_api"}`, no origin) and exchanges it at
`GET https://maps-api.apple.com/v1/token` for a 30 minute access token.

Owner steps in Apple (developer.apple.com/account):

1. Certificates, Identifiers & Profiles → Identifiers → (+) → **Maps IDs** → Continue.
2. Description: "Wayfind server". Identifier: `maps.com.wayfind.server` (any reverse
   domain name you own works) → Continue → Register.
3. Keys → (+) → Key name: "Wayfind Maps Server" → tick **MapKit JS** → Configure →
   choose the Maps ID from step 2 → Save → Continue → Register.
4. **Download** the `.p8` file. Apple lets you download it only once; keep it
   somewhere safe. Note the **Key ID** shown on that page.
5. Membership details (Account → Membership) → note the **Team ID**.

Owner steps in Vercel (team wayfind2 → the Wayfind project → Settings →
Environment Variables):

1. `APPLE_MAPS_PRIVATE_KEY`: Type **Secret**, environment **Production** only. Paste
   the full `.p8` text, including the `-----BEGIN PRIVATE KEY-----` and
   `-----END PRIVATE KEY-----` lines. Real line breaks or literal `\n` both work.
2. `APPLE_MAPS_KEY_ID`: the Key ID (Config, Production).
3. `APPLE_MAPS_TEAM_ID`: the Team ID (Config, Production).
4. Save → Deployments → the latest Production deployment → **Redeploy**.

The next scheduled run (03:13 UTC) picks the key up. To test right away:
`curl -H "Authorization: Bearer $CRON_SECRET" https://www.gowayfind.com/api/cron/apple-place-match`
and check the newest `wf_job_pulse` row (section 3).

### Fallback, not documented by Apple for this API: a static token

`APPLE_MAPS_SERVER_TOKEN`, a static Maps token made in the portal. Apple documents
static tokens for frameworks **other than** the Maps Server API, so this is
unverified. The code only uses it when the three variables above are not all
set. If `/v1/token` refuses it, the run stops before reserving or searching and
pulses `apple credentials invalid or expired` (once per day). Prefer the
documented path.

Neither set: the job makes no Apple call and pulses `apple credentials not
configured; ...`.

### Cost

The Apple Developer Program membership is $99 a year
(https://developer.apple.com/support/enrollment/). That is a membership fee,
not a per-call charge. Included usage is 25,000 service calls a day per team,
shared between the Maps Server API and MapKit JS. Above that Apple answers HTTP
429; Apple publishes no paid tier for more calls. This job keeps itself to
6,000 a day and leaves at least 3,000 of Wayfind's 15,000 ledger ceiling for
the live map.

---

## 3. Backfill job operations

Schedule: `vercel.json` runs `/api/cron/apple-place-match` at `13 3-8 * * *` (six
runs, 03:13 to 08:13 UTC = 11:13 pm to 4:13 am Eastern). Each run makes at most
1,000 Apple searches and stops starting new ones after 240 s.

Limits (all enforced per reserved unit through the atomic
`wf_reserve_free_provider_call`, so overlapping runs or retries cannot pass them):

- backfill: 6,000 `server_search` units per day;
- provider: the backfill stops when today's total `apple_maps` use passes 12,000,
  keeping at least 3,000 of the 15,000 ceiling for live map traffic;
- Apple's own free allowance is 25,000 per day per team; over it Apple answers 429.

Backlog: about 21,010 operational inventory rows today, so roughly 4 nights to
finish. After that only new, renamed, stale (90 days) or retryable rows are
checked: `no-results` after 7 days, `apple-error-<status>` (a 4xx other than
401/403/429, stored at once) after 7 days, `apple-error-pending` (a 5xx, timeout
or bad body, first time) on the next run, and `apple-error-transient` (the same
row failing again in a later run) after 7 days. So a row Apple keeps failing on
never blocks the front of the queue. An error never overwrites a stored match.

### Watching it

    select ran_at, attempted, succeeded, note
      from public.wf_job_pulse where job = 'apple-place-match' order by ran_at desc limit 12;

A normal progress note reads like
`done 980 (matched 640, refused 340); remaining 14020; ETA ~3d; stop run-batch-done; today 1000/6000; refused: ambiguous 180, ...`.

| Note | Meaning | Action |
|---|---|---|
| `apple credentials not configured; ...` | No Apple env set | Section 2 |
| `apple credentials invalid or expired; ...` | `/v1/token` refused the credential. Reported once per day; later runs that day skip quietly | Replace the token or key; to retry the same day call the route with `?recheck=1` |
| `apple budget ledger not provisioned; ...` | Migration `20261021180000` not applied | Section 1 |
| `backlog exhausted; no Apple calls` | Everything is matched or refused and fresh | None. The job stays idle until rows change |
| `stop cap:backfill_daily_max` / `cap:live_headroom` / `cap:daily_ceiling_reached` | Today's limit reached | None; it resumes tomorrow |
| `stop apple-429` | Apple says the team is over its allowance | Check other Apple usage; it resumes tomorrow |
| `stop apple-errors:...` | 3 Apple errors or timeouts in a row | Usually transient. The rows are stored as retryable `apple-error-*` refusals, so the next run starts past them |

None of these notes starts with `billing:`, `quota:` or `unavailable:`, so no note
pages by itself, and the four no-op notes (not configured, invalid, not
provisioned, exhausted) are pulsed with `attempted = 0` and never page.

**But a stopped run can page.** `wf_job_health` counts a run as dead when
`attempted > 0` and `succeeded = 0`. The pulse records `attempted` = Apple searches
made and `succeeded` = places checked. If a night's run stops on `apple-429` or on
3 errors in a row before checking any place (for example its first call gets a
429, or its first three get a 5xx), that run is dead. Two dead runs in a row
reach the dead-run threshold (2) and job-watch pages. With six runs a night,
an Apple outage or an exhausted Apple allowance will page that night. That is
intended: it is a real failure to finish work. A missing Supabase key answers 503
(`jobCannotRun`).

Progress in the table:

    select status, count(*) from public.wf_apple_place_ids group by status;
    select reason, count(*) from public.wf_apple_place_ids where status = 'refused' group by reason order by 2 desc;
    select usage_date, capability, calls from public.wf_provider_usage_daily
     where provider = 'apple_maps' order by usage_date desc, capability limit 12;

### Stop and resume

- **Stop now:** remove the Apple env vars (the next run pulses "not configured" and
  makes no call), or remove the cron entry from `vercel.json`. Emergency: pause the
  registry row. The backfill and browser Place ID lookups stop at once; browser
  Search falls back to its legacy per-map caps (12 per batch, 36 per map):
  `update public.wf_source_registry set status = 'paused' where provider = 'apple_maps';`
- **Resume:** restore the env vars or set `status = 'healthy'`. No cursor to reset:
  each run derives the backlog from the tables and continues where the last one
  stopped.
- **Manual run** (same job, same limits): `node scripts/apple-place-match.mjs --max 500 --write`.
- **Run once by hand in production:** `curl -H "Authorization: Bearer $CRON_SECRET" https://www.gowayfind.com/api/cron/apple-place-match`.

---

## 4. List to map: how it behaves

- Opened from a rail/theme/badge list (`mapListOverride`), or with a category, chip
  or search chosen this session: **list scope**. Pins are the list's ids that
  `/api/places/map/list` returns with a coordinate allowed by
  `lib/coordProvenance.js` (unchanged rules), plus session-only Apple pins for list
  ids (`apple_live`, lookups and searches inside the existing per-batch, per-map
  and daily budgets, no score floor). The map fits to the pins.
- A list place with no permitted coordinate stays in the list. The map says
  "N of M list places still need a confirmed map location, so they stay in the
  list without a pin." `window.__wfMapList.scope` is `"list"`.
- "All places · 9.2+", an in-map category or sub choice, or a first open with
  nothing chosen: **area scope**, unchanged (viewport read, 9.2 floor).
- One annotation per place, so a native cluster's count is the number of places.
- A list row's own `lat`/`lng` is never drawn.

## 5. Edge cache and fresh Place IDs

The inv=1 list is edge cached up to a day. Instead of bumping `INV_LIST_SCHEMA`
after each night (which only helps once), the map asks `/api/places/map/list`
(no-store, DB only) for the stored Place IDs of every list place it cannot draw,
in both scopes. The list's own `applePlaceId` still works; the fresh value wins.
No purge or schema bump is needed when the backfill runs.

## 6. The All places threshold (measured read-only, 2026-10-22)

Production `/api/places/search?inv=1` lists versus the `/api/places/map` candidate
pool (both DB-only), with the repo's own map functions. "Hidden by 9.2" = places
with a drawable coordinate in the pool that only the floor removes.

| List | Radius | Cards | Pinned at 9.2 | Hidden only by 9.2 | Drawn without the floor | No permitted coordinate |
|---|---|---|---|---|---|---|
| Parrish Food > Cafés | 16 km | 20 | 2 | 10 | 12 | 8 |
| Parrish Food > Cafés | 32 km | 103 | 7 | 41 | 48 | 55 |
| Sarasota Food | 16 km | 764 | 84 | 201 | 285 | 476 |
| Sarasota Food | 32 km | 1,104 | 105 | 331 | 436 | 662 |
| Tampa Food | 16 km | 782 | 74 | 147 | 221 | 557 |
| Tampa Food | 32 km | 1,536 | 113 | 305 | 418 | 1,111 |

Hidden scores, 32 km: Parrish 6 at 9.0 to 9.1, 21 at 8.5 to 8.9, 14 below 8.5;
Sarasota 90 / 154 / 87; Tampa 82 / 144 / 79.

So the list-scoped map draws about 3 to 7 times as many of the list's places as
the 9.2 map did. The "All places" map still hides them by design this release.
The remaining gap is coordinates, which the Apple backfill addresses.

## 7. Every other pending migration (checked 2026-10-22)

Re-hashed from `origin/main` today; each equals its pin in
`scripts/migration-pending-apply.json`.

| File | Purpose | This release? | State | Owner action |
|---|---|---|---|---|
| `20261021180000_wf_apple_place_ids.sql` | Apple Place ID table and budget row | Yes, Apple matching | Not applied | Apply (section 1) |
| `20261022120000_wf_heartbeat_expected_apple_place_match.sql` | Pager for the nightly Apple job | Monitoring | Not applied | Apply after the first pulse (section 1) |
| `20261021030000_wf_inventory_coords_independent_verified.sql` (38,318 bytes, sha256 `0596e477828eeb465cc845fb16c58fbfbf533ddf51b15cc69534e9302344d0ed`, md5 `f6cbf6768b1d19c6ba98b4e9b68ce6e7`) | 35 Google-free coordinates (19 Wikidata P625 + 16 Census geocodes of official addresses) on 27 places | Yes, more pins, independent of Apple | Not applied | Apply (7a) |
| `20261015200000_wf_heartbeat_expected_sighting_renewal.sql` (sha256 `48352a3238539dd79035e848c70d380cd69504b2ffba4eb6017fadac0e3f7b27`) | Pager for the daily sighting-renewal job | Monitoring | Not applied | Apply (7b) |
| `20261014120000_winter_haven_downtown_twin.sql` (md5 `8ca0d83d4def6e61a1931253ac5c7307`) | Retire the duplicate Downtown Winter Haven pin | No | Applied 2026-10-21 (ledger version `20261021031109`, statement md5 equals the file md5). Verified present: twin `ChIJr9OaGuES3YgRCkHnqB00tbo` EXCLUDED, `duplicate_of:ChIJ_wzoOQAT3YgR5o8e69WR3UU`, locked; keeper OPERATIONAL with 1 active photo | Do NOT re-apply (a replay raises). Only record the receipt and remove the pending entry (7c) |
| `20261015180000_wf_inventory_wikidata_coords.sql` (192), `20261015180100_..._corroborated.sql` (55), `20261015180200_..._uncorroborated.sql` (97) | #1809 coordinate passes | Held | Not applied | Keep on hold (counsel / insufficient evidence) |
| `20261015210000_wf_heartbeat_guide_visual_monitor.sql`, `20261020110650_wf_group_plan_optional_end.sql`, `20261020120000_wf_itineraries.sql` | Other lanes | No | Not applied | Not part of this release |

Apply each with `node scripts/apply-migration.mjs supabase/migrations/<file>`
from a fresh worktree, exactly as in section 1. One file per run.

### 7a. The 35 independently verified coordinates

Revalidated 2026-10-22: 35 of 35 ELIGIBLE. Each row was rechecked for the same
business identity (a Wayfind-owned link, never a Google name), the official page
still stating the address (HTTP 200), a second non-Google source agreeing, no
conflicting non-Google entry, and no duplicate entry. Audit:
`docs/audits/coords-independent-revalidation-2026-10-22.csv`. The migration
appends to `independent_coords` only; `lat`, `lng` and `refreshed_at` are
never touched, and the whole pass rolls back unless every row carries exactly one
entry.

    -- IDS: the 27 place_ids
    -- array['ChIJ-6lKAInEwogRVnf5NBtjZss','ChIJ0UaxcHon5IgRtIDfdNZ5UsQ','ChIJ5UOOwKux5YgRAmO1YNbhTc0','ChIJ6_YRRRJAw4gRE5XF42pZOxo','ChIJ6y2dx9g_w4gRWoZIRhLk-JI','ChIJ7aIAgJd654gRjUN8WsPaaI4','ChIJ9RHZGx6H3YgRnWVYIWsHNPM','ChIJCXAq5_DEwogRjTPE2xlsZtE','ChIJKVDd7v_bkIgRv0FaG2bnP9g','ChIJM5duwu3h2ogRw33TpV_VYtI','ChIJM6cv59Pn2YgRdXaKYZKWWms','ChIJNwQxUnFDw4gRlEruVgcCmu0','ChIJQZRp15bDwogReY6sMTk-YWg','ChIJT8lyCbL07IgR7bBS2PG4XQI','ChIJVVUNg8JB24gRo5VjblNO_c8','ChIJX0UJnszx3ogRKqv856yKO_s','ChIJ_37IauQ_w4gRz03lc0QInIE','ChIJd9nFxyC02YgRVdtnh8Obwp8','ChIJheIoirLAkIgRPxCpsjJZlYs','ChIJlR-NjATIwogRoSE1MsVTpmA','ChIJlRUlG4nEwogRJOgu0Hf2n54','ChIJlcQil-Pj2ogRZXbB55ldZcQ','ChIJo2bql5B654gR_ITN9PGhBbU','ChIJu_e4BnTI2YgREAOg3GxMK8g','ChIJy6ESWITDwogReu72OLauRMM','ChIJy76z4HY9w4gROaX_C6lQu8g','ChIJz8e7TVLEwogRBeybvscHnD4']::text[]

    -- A. before and after: lat/lng snapshot of the 27 (must be identical)
    select count(*) n, md5(string_agg(place_id||'|'||coalesce(lat::text,'')||'|'||coalesce(lng::text,''), ';' order by place_id)) snap
      from public.wf_inventory where place_id = any(<IDS>);
    -- B. entries written (before: 0 / 0; after: 35 / 27)
    select count(*) entries, count(distinct place_id) places
      from public.wf_inventory, jsonb_array_elements(case when jsonb_typeof(independent_coords)='array' then independent_coords else '[]'::jsonb end) e
     where e->>'method' in ('wikidata-p625-official-address-verified','census-geocoder-official-address-reverified');
    -- C. ledger (expect 1 row after)
    select version, name, array_length(statements,1) from supabase_migrations.schema_migrations where name='wf_inventory_coords_independent_verified';

Live check after apply: rerun `node scripts/verify-map-list-parity-live.mjs --schema mapcoord4`;
`mapBySource` should now include `wikidata` / `official_venue` where these places
fall in a probed box. Rollback:
`supabase/data-fixes/20261021030000_wf_inventory_coords_independent_verified_REVERSE.sql`
(removes only these two methods from these rows), then query B returns 0 / 0.

### 7b. Sighting-renewal heartbeat

    -- after: 1 row, 1800
    select job, max_staleness_minutes from public.wf_heartbeat_expected where job='sighting-renewal';

Apply only on a day the job has pulsed (`select max(ran_at) from public.wf_job_pulse where job='sighting-renewal';`).
Rollback: `delete from public.wf_heartbeat_expected where job='sighting-renewal';`

### 7c. Winter Haven: record only, no apply

Confirm again right before recording (nothing is re-run):

    select place_id, status, excluded, exclusion_reason, locked from public.wf_inventory
     where place_id in ('ChIJ_wzoOQAT3YgR5o8e69WR3UU','ChIJr9OaGuES3YgRCkHnqB00tbo') order by place_id;
    -- keeper OPERATIONAL/false/null/false; twin EXCLUDED/true/duplicate_of:ChIJ_wzoOQAT3YgR5o8e69WR3UU/true
    select version, name, md5(statements[1]) from supabase_migrations.schema_migrations where name='winter_haven_downtown_twin';
    -- 20261021031109 / winter_haven_downtown_twin / 8ca0d83d4def6e61a1931253ac5c7307

If both match, add one receipt line to `scripts/migration-apply-log.jsonl`
(`status "applied"`, `version "20261021031109"`, the file's sha256 and bytes, a
`reason` saying it was applied through the Supabase connector on 2026-10-21 and
verified present on 2026-10-22) and remove its entry from
`scripts/migration-pending-apply.json` in the same commit. If either does not
match, leave it pending and investigate. Never record it just to clear the canary.

## 8. Live results after deploy (2026-10-22, production `15ecfb61`)

Read-only reconciliation (`scripts/reconcile-list-map-live.mjs`, same origins as
the baseline in #1884, geolocation granted at the origin):

| List | Viewport | In list | Verified coordinate | On map before | On map after | Apple live (session only) | Left off, reason |
|---|---|---|---|---|---|---|---|
| Parrish Food > Cafés | 390x844 | 37 | 19 | 5 | 25 | 6 | 12, no confirmed coordinate |
| Parrish Food > Cafés | 1280x900 | 37 | 19 | 5 | 25 | 6 | 12, no confirmed coordinate |
| Sarasota Food | 390x844 | 375 | 195 | 84 | 201 | 6 | 174, no confirmed coordinate |
| Sarasota Food | 1280x900 | 375 | 195 | 84 | 202 | 7 | 173, no confirmed coordinate |
| Tampa Food | 390x844 | 388 | 132 | 71 | 139 | 7 | 249, no confirmed coordinate |
| Tampa Food | 1280x900 | 388 | 132 | 71 | 139 | 7 | 249, no confirmed coordinate |

"On map" counts places, including those folded into clusters. No place is left
off for the 9.2 floor any more. Ten-city parity (`verify-map-list-parity-live.mjs
--schema mapcoord4`): 0 drawable places missing from the map and 0 undrawable
places drawn, in all 10 metros. Synthetic monitor `--all`: 16 of 16 pass.
Interaction checks (both viewports): pin tap selects that pin and opens its own
place sheet, list distances equal the haversine distance from the device point
(12 of 12, 0.0 mi difference), cluster tap zooms in, dragging the map keeps the
pins, and with location denied (Florida IP fallback simulated) the list, map,
clusters and pin taps still work, with distances hidden because the location is
only approximate.

The Parrish café that "disappeared" earlier is The Fox Mercantile
(`ChIJfzpM43oRw4gR6ifHWRbjp9E`). Its coordinate is valid (Google sighting, until
2026-11-11). It sits 17.76 mi from 27.5875,-82.4275, just outside the list's
radius, but 16.55 mi from the monitor's origin, so the two runs disagreed only
because they used different origins. With the same origin it is consistently
outside the list, and `/api/places/map/list` returns it with its coordinate.
