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
