-- Friend votes on a shared "My Christmas plan" (/christmas-in-florida?plan=id,id).
-- NOT APPLIED. Prepared only; apply with scripts/apply-migration.mjs after owner approval.
--
-- Schema impact: ONE new table, nothing existing is altered.
-- RLS: enabled, with NO public policy, exactly like wf_group_plans: anon and
--   authenticated have no access at all; only the service role (the same
--   same-origin application server route, /api/christmas/plan-votes) reads and
--   writes. A voter is anonymous (no sign in): voter_token is a random 32 hex
--   string the browser generates and keeps; the server never returns anyone
--   else's token.
-- plan_id: 16 hex chars, sha256 of the sorted item ids (lib/christmasPlan.js),
--   so the same set of items is the same plan. There is no plan table.
-- Rollback:  drop table public.wf_christmas_plan_votes;  (the app fails closed:
--   the vote buttons disappear, sharing a plan keeps working).
-- Ordering: apply this migration BEFORE enabling the vote UI in production; the
--   code deployed first is safe (it hides votes while the table is missing).
-- Retention: Christmas only. Votes older than 120 days can be deleted by hand:
--   delete from public.wf_christmas_plan_votes where created_at < now() - interval '120 days';
begin;

create table public.wf_christmas_plan_votes (
  id bigint generated always as identity primary key,
  plan_id text not null check (plan_id ~ '^[a-f0-9]{16}$'),
  item_id text not null check (char_length(item_id) between 1 and 120),
  voter_token text not null check (voter_token ~ '^[a-f0-9]{32}$'),
  created_at timestamptz not null default clock_timestamp(),
  constraint wf_christmas_plan_votes_unique unique (plan_id, item_id, voter_token)
);
create index wf_christmas_plan_votes_plan on public.wf_christmas_plan_votes(plan_id);

alter table public.wf_christmas_plan_votes enable row level security;
revoke all on public.wf_christmas_plan_votes from public, anon, authenticated;
grant select, insert, delete on public.wf_christmas_plan_votes to service_role;
-- No public/authenticated RLS policy (same as wf_group_plans): all access is
-- through the application server using the service role.

commit;
