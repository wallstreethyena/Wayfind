# Photo inventory audit

Counts, not anecdotes. Read-only and zero spend: no Google calls, no `lib/spendGate.js`, no `/api/photo` requests, no writes.

Two ways to run it (same definitions):

1. `supabase/sql/photo_audit.sql` (below, verbatim): run each query in the Supabase SQL editor or an `execute_sql` tool.
2. `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/photo-inventory-audit.mjs --out=audit.json [--compare=prev.json]`
   prints a markdown table and writes JSON. Without the two env vars it prints instructions and exits 2.
   `--static-only` needs no keys and reports only the guide and code-surface sections.
   Pure logic lives in `scripts/lib/photoInventoryAudit.mjs`, locked by `scripts/test-photo-inventory-audit.mjs`.

## Definitions

- **published**: `wf_inventory` where `not coalesce(excluded,false)` and `status = 'OPERATIONAL'`.
- **has_ref / no_ref**: `photo_ref` has non-whitespace content, or not.
- **malformed_ref**: a ref is present but fails `PHOTO_REF_RX` (`lib/placePhotoServe.js`), so it can never be served.
- **hard gap**: published, with NO `photo_ref` AND no `wf_place_photo` row with `status = 'active'`. Nothing on file can ever render for it.
- **wf_place_photo**: owned (Commons/owner/creator) photo records by status; `storage_path` = file stored.
- **repair queue**: `wf_photo_repair_queue` status x failure_reason.
- **outcomes (14 days)**, `wf_photo_outcome_daily`, bucketed by `classifyOutcome`:
  - `ok`: photo delivered.
  - `genuine-no-photo`: `fresh-nophoto`, `stale-heal-nophoto`, `unowned`, `legacy-miss` (the source has none; not a defect to chase).
  - `operational`: we failed to fetch one we could have: `ledger*`, `denied*`, `quota*` (incl. `quota-open`), `key-denied`, `fresh-failed:*`, `stale-heal-*`, `stale`, `owned-miss`, `network`, `server`, `client`, `badjson`, `redirect`, `refunded`, `place-lookup-*`.
  - `nonprod`: `preview:` / `dev:` namespaced classes (not production traffic).
  - `other`: unknown class, kept visible on purpose.
- **guides**: `guideRegions(GUIDES)` (lib/guideIndex.js), filtered to `published <= today (US Eastern)`; dedicated routes (`lib/guideDedicatedRoutes.js`) are already inside `GUIDES`. Rung = the REAL `guideCardPhoto()` result: `hero`, `pick`, `illustrative-hero`, `place` (asks the no-spend place route; only real if that place has a ref/owned photo), `monogram`. **"No real card image" = guides on the monogram rung.** Valid hero = `guideHero(slug)` has a `src` and is not `unavailable`.
- **blogs**: published `wf_blog_posts` rows; each pick resolved to a venue by `blogTargets` (name + distance), then counted resolvable when that venue has a ref or an active owned photo. Blog heroes are rendered by the separate blog.gowayfind.com repo and cannot be measured from here.
- **events**: `wf_events` by `hero_image_kind` (`event`, `venue`, `(unclassified)` = image but no kind, `(no image)`).
- **surfaces (static)**: every file in `app/` and `lib/` whose code (comments stripped) imports `CardPhoto`, uses `cardPhotoRequest` / `railPhotoSrc` / `FallbackImg`, or contains `<img`, versus the `components` lists in `lib/photoSurfaces.js`. Not in any list = **blind spot** (the guard `check-photo-surface-registry.mjs` only watches a narrower signal set). `fallback` is a heuristic: the file mentions `FallbackImg`, `onError`, `monogram`, `imageState`, `CardPhoto`, `RailCard` or `IconicPlaceCard`.

## SQL (supabase/sql/photo_audit.sql, verbatim)

```sql
-- supabase/sql/photo_audit.sql — Wayfind photo inventory audit. READ-ONLY, zero spend.
-- Only SELECTs. No DDL, no DML, no Google calls. Run each query separately
-- (Supabase SQL editor, or the execute_sql tool). Definitions: docs/PHOTO_AUDIT.md.
-- published = not coalesce(excluded,false) and status = 'OPERATIONAL'.

-- Q1. Published inventory: total, with/without a photo_ref, malformed refs, hard gap.
-- PHOTO_REF_RX (lib/placePhotoServe.js) = ^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$
with pub as (
  select i.place_id, nullif(btrim(i.photo_ref), '') as ref
  from public.wf_inventory i
  where not coalesce(i.excluded, false) and i.status = 'OPERATIONAL'
), act as (
  select place_id from public.wf_place_photo where status = 'active'
)
select
  count(*)                                                                            as published,
  count(*) filter (where ref is not null)                                             as has_ref,
  count(*) filter (where ref is null)                                                 as no_ref,
  count(*) filter (where ref is not null and ref !~ '^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$') as malformed_ref,
  count(*) filter (where p.place_id in (select place_id from act))                    as has_active_owned_photo,
  count(*) filter (where ref is null and p.place_id not in (select place_id from act)) as hard_gap_no_ref_no_owned
from pub p;

-- Q2. wf_place_photo by status (and how many rows have a stored file).
select status, count(*) as n, count(*) filter (where storage_path is not null) as with_storage_path
from public.wf_place_photo
group by status order by n desc;

-- Q3. wf_photo_repair_queue: status x failure_reason histogram.
select status, failure_reason, count(*) as n
from public.wf_photo_repair_queue
group by status, failure_reason order by status, n desc;

-- Q4. wf_photo_outcome_daily, last 14 days, by class (production classes are bare;
-- preview:/dev: prefixes are non-production). Bucketing is done by the script / doc.
select class, sum(n) as n, min(day) as first_day, max(day) as last_day
from public.wf_photo_outcome_daily
where day >= (now() at time zone 'America/New_York')::date - 14
group by class order by n desc;

-- Q5. Events: hero image kind (columns hero_image, hero_image_kind on wf_events).
select coalesce(hero_image_kind, case when nullif(btrim(hero_image), '') is null then '(no image)' else '(unclassified)' end) as image_kind,
       count(*) as n
from public.wf_events
group by 1 order by n desc;

-- Q6. Blog posts (published rows). Resolving each pick to a venue is name + distance
-- logic (lib/creditedPhotoTargets.js blogTargets); scripts/photo-inventory-audit.mjs does it.
select count(*) as published_blog_posts
from public.wf_blog_posts
where published_at <= now();
```
