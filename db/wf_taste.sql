-- db/wf_taste.sql — the Wayfind taste model schema (applied 2026-07-22).
-- Tracked here for the record; the live copy was applied via migration
-- wf_taste_model_phase1. PER-USER ONLY: RLS binds every row to auth.uid(),
-- so a user can only ever read or write their OWN taste — never pooled,
-- never another user's. 60-day decay constant (5184000 s) is kept in
-- lockstep with TASTE_TAU_MS in lib/taste.js.
create table if not exists public.wf_taste (
  user_id uuid not null,
  dimension text not null,
  value text not null,
  weight double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, dimension, value)
);
alter table public.wf_taste enable row level security;
create policy wf_taste_own_select on public.wf_taste for select to authenticated using (auth.uid() = user_id);
create policy wf_taste_own_insert on public.wf_taste for insert to authenticated with check (auth.uid() = user_id);
create policy wf_taste_own_update on public.wf_taste for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_taste_own_delete on public.wf_taste for delete to authenticated using (auth.uid() = user_id);

-- Atomic decayed accumulate; security invoker so RLS forces writes to the
-- caller's OWN rows; anon (no auth.uid()) no-ops.
create or replace function public.wf_taste_bump(p_signals jsonb) returns void
 language plpgsql security invoker set search_path to 'public' as $$
declare s jsonb;
begin
  if auth.uid() is null then return; end if;
  for s in select * from jsonb_array_elements(coalesce(p_signals,'[]'::jsonb)) loop
    insert into public.wf_taste (user_id, dimension, value, weight, updated_at)
    values (auth.uid(), s->>'dimension', s->>'value', (s->>'delta')::double precision, now())
    on conflict (user_id, dimension, value) do update
      set weight = wf_taste.weight * exp(- extract(epoch from (now() - wf_taste.updated_at)) / 5184000.0) + excluded.weight,
          updated_at = now();
  end loop;
end; $$;
grant execute on function public.wf_taste_bump(jsonb) to authenticated;

-- Delete-my-taste (legal by design; Phase 3 UI calls it). Own rows only.
create or replace function public.wf_taste_wipe() returns void
 language sql security invoker set search_path to 'public' as $$
  delete from public.wf_taste where user_id = auth.uid();
$$;
grant execute on function public.wf_taste_wipe() to authenticated;
