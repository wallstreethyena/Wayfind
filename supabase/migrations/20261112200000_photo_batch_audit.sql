-- Photo batch audit (additive only).
-- Bulk photo state changes (a rejected sweep, a re-queue) have wiped photos in
-- one statement before. This records every statement that changes photo state
-- and flags big ones that carry no stated reason. It NEVER blocks a write:
-- the trigger body swallows its own errors and only ever raises a WARNING.
--
-- To change photo state in bulk, first run, in the same transaction:
--   set local wayfind.photo_change_reason = '<why>';
-- See docs/PHOTO_BATCH_CHANGES.md.

create table if not exists public.wf_photo_change_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  table_name text,
  op text,
  rows_changed int,
  state_counts jsonb,
  reason text,
  actor text default current_user,
  app_name text default current_setting('application_name', true),
  flagged boolean
);

alter table public.wf_photo_change_audit enable row level security;
-- No anon or authenticated policies: the service role (which bypasses RLS) is the only reader and writer.
revoke all on table public.wf_photo_change_audit from anon, authenticated;
revoke all on sequence public.wf_photo_change_audit_id_seq from anon, authenticated;

create or replace function public.wf_photo_change_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_changed int := 0;
  v_counts jsonb := '{}'::jsonb;
  v_reason text := nullif(btrim(coalesce(current_setting('wayfind.photo_change_reason', true), '')), '');
  v_flagged boolean;
begin
  begin
    -- wf_google_photo_store carries "state"; wf_place_photo carries "status".
    if tg_op = 'DELETE' then
      -- A deleted row is a changed row; the counts are of the states that were removed.
      if tg_table_name = 'wf_google_photo_store' then
        select count(*), coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
          into v_changed, v_counts
          from (select coalesce(o.state, 'null') s, count(*) n from old_rows o group by 1) t;
      else
        select count(*), coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
          into v_changed, v_counts
          from (select coalesce(o.status, 'null') s, count(*) n from old_rows o group by 1) t;
      end if;
      -- count(*) over the grouped rows counts groups; recompute the true row count.
      select coalesce(sum(value::int), 0) into v_changed from jsonb_each_text(v_counts);
    else
      -- UPDATE: only rows whose state/status actually changed, counted by "old -> new".
      if tg_table_name = 'wf_google_photo_store' then
        select coalesce(sum(n), 0)::int, coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
          into v_changed, v_counts
          from (
            select coalesce(o.state, 'null') || ' -> ' || coalesce(w.state, 'null') s, count(*) n
            from old_rows o join new_rows w on w.place_id = o.place_id
            where w.state is distinct from o.state
            group by 1
          ) t;
      else
        select coalesce(sum(n), 0)::int, coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
          into v_changed, v_counts
          from (
            select coalesce(o.status, 'null') || ' -> ' || coalesce(w.status, 'null') s, count(*) n
            from old_rows o join new_rows w on w.place_id = o.place_id
            where w.status is distinct from o.status
            group by 1
          ) t;
      end if;
    end if;

    if v_changed >= 1 then
      v_flagged := (v_changed >= 20 and v_reason is null);
      insert into public.wf_photo_change_audit (table_name, op, rows_changed, state_counts, reason, flagged)
      values (tg_table_name, tg_op, v_changed, v_counts, v_reason, v_flagged);
      if v_flagged then
        raise warning 'wf_photo_change_audit: % rows changed in % (%) with no wayfind.photo_change_reason set. Use: set local wayfind.photo_change_reason = ''<why>''.',
          v_changed, tg_table_name, tg_op;
      end if;
    end if;
  exception when others then
    raise warning 'wf_photo_change_audit_log failed (write not blocked): %', sqlerrm;
  end;
  return null;
end;
$fn$;

revoke all on function public.wf_photo_change_audit_log() from public, anon, authenticated;

-- Transition tables cannot be used with more than one event, so each table gets
-- one UPDATE trigger and one DELETE trigger.
drop trigger if exists wf_photo_change_audit_upd on public.wf_google_photo_store;
create trigger wf_photo_change_audit_upd
  after update on public.wf_google_photo_store
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.wf_photo_change_audit_log();

drop trigger if exists wf_photo_change_audit_del on public.wf_google_photo_store;
create trigger wf_photo_change_audit_del
  after delete on public.wf_google_photo_store
  referencing old table as old_rows
  for each statement execute function public.wf_photo_change_audit_log();

drop trigger if exists wf_photo_change_audit_upd on public.wf_place_photo;
create trigger wf_photo_change_audit_upd
  after update on public.wf_place_photo
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.wf_photo_change_audit_log();

drop trigger if exists wf_photo_change_audit_del on public.wf_place_photo;
create trigger wf_photo_change_audit_del
  after delete on public.wf_place_photo
  referencing old table as old_rows
  for each statement execute function public.wf_photo_change_audit_log();
