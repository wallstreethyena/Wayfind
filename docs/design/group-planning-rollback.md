# Group Vote: database recovery procedure

Scope: `supabase/migrations/20261004232233_wf_group_planning.sql` (sha256 `2adb9c859541b728e0ce3155f39f0a788f54e467364eccbbfdecdf308b0552fd`).

## What the migration adds (and only adds)

- Tables: `wf_group_plans`, `wf_group_plan_notices`, `wf_group_plan_limits` (RLS on, no policies, all grants revoked from `public`, `anon`, `authenticated`; only `service_role` may read or write).
- Functions (all `security invoker`, `search_path=''`, execute granted only to `service_role`): `wf_group_plan_rate_limit`, `wf_group_plan_create`, `wf_group_plan_commit`, `wf_group_plan_claim_notice`, `wf_group_plan_finish_notice`, `wf_group_plan_cleanup`.
- Indexes on the new tables only. No existing table, function, policy, grant or row is changed. Foreign keys point at `auth.users(id) on delete cascade`, so deleting a user also deletes that user's own group plans.

## Level 1: switch the feature off (no data change, use first)

Unset `NEXT_PUBLIC_GROUP_PLANS_ENABLED`, `WF_GROUP_PLANS_ENABLED`, `WF_GROUP_PLAN_DEADLINE_WORKER_READY`, `WF_GROUP_PLAN_WORKER_ENABLED`, `WF_GROUP_PLAN_EMAIL_ENABLED`, `WF_GROUP_PLAN_CLEANUP_ENABLED` in Vercel Production and redeploy. Every group route then returns its disabled state; the share sheet hides Group Vote; the cron route returns 503 without touching the tables. The schema can stay in place harmlessly.

## Level 2: remove the schema (only while the tables hold no real user plans)

Owner approval required. First confirm the tables are empty or hold only approved synthetic test rows:

```sql
select (select count(*) from public.wf_group_plans) plans,
       (select count(*) from public.wf_group_plan_notices) notices,
       (select count(*) from public.wf_group_plan_limits) limits;
```

Then, as one reviewed migration file committed under `supabase/migrations/` and applied through the same canonical process:

```sql
begin;
drop function if exists public.wf_group_plan_cleanup();
drop function if exists public.wf_group_plan_finish_notice(uuid,uuid,text,text);
drop function if exists public.wf_group_plan_claim_notice(uuid);
drop function if exists public.wf_group_plan_commit(uuid,integer,jsonb,text);
drop function if exists public.wf_group_plan_create(jsonb,text,uuid,boolean);
drop function if exists public.wf_group_plan_rate_limit(text,integer);
drop table if exists public.wf_group_plan_notices;
drop table if exists public.wf_group_plan_limits;
drop table if exists public.wf_group_plans;
commit;
```

This touches only objects the Group Vote migration created. It never needs a database reset, a point-in-time restore, or any change to existing Wayfind tables. If real user plans exist, prefer Level 1 and keep the data.
