-- RLS for the booking agent. Everything in this file is rolled back.
-- Run after 20261117143000_wf_booking_agent.sql, as a role that bypasses RLS (the table owner
-- or service_role). The node guard creates anon, authenticated and service_role first.
begin;

create function pg_temp.ba_check(cond boolean, msg text) returns void language plpgsql as $f$
begin
  if cond is not true then raise exception 'booking_agent_test FAILED: %', msg; end if;
end $f$;

create temp table ba_ids (k text primary key, v uuid);
insert into ba_ids values ('owner', gen_random_uuid()), ('other', gen_random_uuid());
grant select on ba_ids to authenticated, anon, service_role;

insert into public.wf_booking_agent_runs (
  id, user_id, place_id, site, external_id, date, time, party, idempotency_key, status,
  consent_version, consent_at, selector_map_version
) values (
  gen_random_uuid(), (select v from ba_ids where k = 'owner'), 'tst-booking-agent', 'opentable', '100001',
  current_date, '19:00', 2, 'idem-owner-1', 'queued', 'agent-consent-v1', now(), 'opentable.v1'
);

insert into public.wf_booking_agent_events (run_id, seq, step, outcome, url_path)
select id, 1, 'detect', 'form', '/restref/client/' from public.wf_booking_agent_runs where idempotency_key = 'idem-owner-1';

set local role service_role;
insert into public.wf_booking_agent_runs (
  user_id, place_id, site, external_id, date, time, party, idempotency_key, status,
  consent_version, consent_at, selector_map_version
) values (
  (select v from ba_ids where k = 'owner'), 'tst-booking-agent', 'opentable', '100001',
  current_date, '19:30', 4, 'idem-service-1', 'queued', 'agent-consent-v1', now(), 'opentable.v1'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select v::text from ba_ids where k = 'other'), true);
do $t$
declare n int;
begin
  select count(*) into n from public.wf_booking_agent_runs;
  perform pg_temp.ba_check(n = 0, 'another guest sees no runs, got ' || n);
  begin
    insert into public.wf_booking_agent_runs (
      user_id, place_id, site, external_id, date, time, party, idempotency_key, status,
      consent_version, consent_at, selector_map_version
    ) values (
      (select v from ba_ids where k = 'other'), 'tst-booking-agent', 'opentable', '100001',
      current_date, '19:00', 2, 'idem-other', 'queued', 'agent-consent-v1', now(), 'opentable.v1'
    );
    raise exception 'booking_agent_test FAILED: authenticated insert should not succeed';
  exception when insufficient_privilege then
    null;
  end;
end $t$;

select set_config('request.jwt.claim.sub', (select v::text from ba_ids where k = 'owner'), true);
do $t$
declare n int; ev int;
begin
  select count(*) into n from public.wf_booking_agent_runs;
  perform pg_temp.ba_check(n = 2, 'the owner sees both of their runs, got ' || n);
  select count(*) into ev from public.wf_booking_agent_events;
  perform pg_temp.ba_check(ev = 1, 'the owner sees their event, got ' || ev);
  begin
    select count(*) into n from public.wf_booking_agent_sites;
    raise exception 'booking_agent_test FAILED: sites should not be readable, got %', n;
  exception when insufficient_privilege then
    null;
  end;
end $t$;

set local role anon;
do $t$
begin
  perform 1 from public.wf_booking_agent_runs;
  raise exception 'booking_agent_test FAILED: anon read should not succeed';
exception when insufficient_privilege then
  null;
end $t$;

rollback;
