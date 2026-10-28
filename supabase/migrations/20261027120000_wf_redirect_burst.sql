-- 20261027120000_wf_redirect_burst.sql — shared state for the affiliate redirect
-- BURST GATE (lib/redirectTrafficClass.js, flag REDIRECT_BURST_GATE=1).
--
-- NOT APPLIED. The lead applies this only with owner approval. Until it is
-- applied (or while the flag is unset) the code never calls the RPC: with the flag
-- on and the RPC missing, the call 404s inside a 350 ms budget and the gate falls
-- back to a per-instance in-memory counter, failing OPEN.
--
-- IMPACT: one new table (RLS on, no policies: service role only), one RPC, one
-- index. Stores sha256-truncated hashes of IP+UA and of the offer key plus a
-- timestamp; no raw IP, UA or offer id. Rows older than 10 minutes are deleted
-- opportunistically by the RPC itself. Write volume = one insert per
-- cookie-less partner redirect request while the flag is on. No existing table
-- or function is touched.
--
-- Rollback: drop function public.wf_redirect_burst_record(text,text,int);
--           drop table public.wf_redirect_burst;

create table if not exists public.wf_redirect_burst (
  id bigserial primary key,
  key_hash text not null,
  offer_hash text not null,
  seen_at timestamptz not null default now()
);
create index if not exists wf_redirect_burst_key_seen_idx on public.wf_redirect_burst (key_hash, seen_at desc);
create index if not exists wf_redirect_burst_seen_idx on public.wf_redirect_burst (seen_at);

alter table public.wf_redirect_burst enable row level security;
-- No policies: anon/authenticated can read or write nothing; service_role bypasses RLS.

create or replace function public.wf_redirect_burst_record(p_key text, p_offer text, p_window_s int default 60)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into public.wf_redirect_burst (key_hash, offer_hash) values (left(p_key, 64), left(p_offer, 64));
  delete from public.wf_redirect_burst where seen_at < now() - interval '10 minutes';
  select count(distinct offer_hash) into n
    from public.wf_redirect_burst
   where key_hash = left(p_key, 64)
     and seen_at > now() - make_interval(secs => greatest(1, least(coalesce(p_window_s, 60), 600)));
  return n;
end;
$$;

revoke all on function public.wf_redirect_burst_record(text, text, int) from public, anon, authenticated;
grant execute on function public.wf_redirect_burst_record(text, text, int) to service_role;
