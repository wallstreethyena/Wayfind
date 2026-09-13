begin;

create or replace function pg_temp.wf_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

insert into public.wf_tp_links (
  provider, offer_id, campaign_id, destination_url, short_url, marker, trs, verified_at
) values
  ('tiqets', 'fixture-one', 89, 'https://www.tiqets.com/en/test/', 'https://tp.st/FixtureOne', 750791, 550160, '2026-09-09T00:00:00Z');

insert into public.wf_tp_clicks (
  click_token, provider, campaign_id, offer_id, clicked_at, expires_at
) values
  ('wf_11111111111111111111111111111111', 'tiqets', 89, 'fixture-one', '2026-09-01T10:00:00Z', '2026-10-01T10:00:00Z'),
  ('wf_22222222222222222222222222222222', 'tiqets', 89, 'fixture-one', '2026-09-02T10:00:00Z', '2026-10-02T10:00:00Z');

-- First sighting inserts and preserves unknown money as NULL.
select pg_temp.wf_assert(
  public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"sale-1","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-03T10:00:00Z","provider_updated_at":"2026-09-03T10:01:00Z","state":"pending","profit_usd":null,"paid_profit_usd":null,"price_usd":null}]'::jsonb)
    = '{"received":1,"inserted":1,"updated":0,"stale":0,"unmatched":0,"invalid":0}'::jsonb,
  'first booking inserts exactly once'
);
select pg_temp.wf_assert(
  (select profit_usd is null and paid_profit_usd is null and price_usd is null
     from public.wf_tp_conversions where action_id = 'sale-1'),
  'unknown money remains NULL'
);

-- Equal and older snapshots are stale, never duplicate or revert state.
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"sale-1","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-03T10:00:00Z","provider_updated_at":"2026-09-03T10:01:00Z","state":"pending"}]'::jsonb)->>'stale')::int = 1,
  'equal replay is stale'
);

-- A later provider update can arrive after the click expiry because the booking
-- itself was created inside the click window.
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"sale-1","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-03T10:00:00Z","provider_updated_at":"2026-10-10T00:00:00Z","state":"paid","profit_usd":"12.50","paid_profit_usd":"12.50","price_usd":"125.00"}]'::jsonb)->>'updated')::int = 1,
  'late paid update is accepted'
);
select public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"sale-1","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-03T10:00:00Z","provider_updated_at":"2026-09-09T00:00:00Z","state":"pending"}]'::jsonb);
select pg_temp.wf_assert(
  (select state = 'paid' and paid_profit_usd = 12.50 from public.wf_tp_conversions where action_id = 'sale-1'),
  'older snapshot cannot revert a paid booking'
);

select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"sale-1","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-03T10:00:00Z","provider_updated_at":"2026-10-11T00:00:00Z","state":"canceled","profit_usd":"0","paid_profit_usd":"0","price_usd":"125.00"}]'::jsonb)->>'updated')::int = 1,
  'later cancellation updates the same conversion'
);
select pg_temp.wf_assert(
  (select state = 'canceled' and paid_profit_usd = 0 from public.wf_tp_conversions where action_id = 'sale-1'),
  'cancellation money is stored exactly'
);

-- Wrong campaign and booking creation outside the 30-day click window do not match.
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":137,"action_id":"wrong-campaign","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-03T10:00:00Z","provider_updated_at":"2026-09-03T10:01:00Z","state":"pending"}]'::jsonb)->>'unmatched')::int = 1,
  'campaign identity must match the click'
);
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"outside-window","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-10-02T10:00:01Z","provider_updated_at":"2026-10-02T10:01:00Z","state":"pending"}]'::jsonb)->>'unmatched')::int = 1,
  'booking created outside click TTL is unmatched'
);

-- A provider may prefix a valid sub_id with one dot. It may not reassign an
-- existing action to a different stored click.
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"sale-2","sub_id":".wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-04T10:00:00Z","provider_updated_at":"2026-09-04T10:01:00Z","state":"pending"}]'::jsonb)->>'inserted')::int = 1,
  'one provider-leading dot is normalized'
);
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"sale-1","sub_id":"wf_22222222222222222222222222222222","action_type":"booking","action_created_at":"2026-09-03T10:00:00Z","provider_updated_at":"2026-10-12T00:00:00Z","state":"paid"}]'::jsonb)->>'invalid')::int = 1,
  'an existing action cannot change click identity'
);

-- Invalid state, money, action type and time order are counted explicitly.
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"bad-state","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-04T10:00:00Z","provider_updated_at":"2026-09-04T10:01:00Z","state":"mystery"}]'::jsonb)->>'invalid')::int = 1,
  'unknown state is invalid'
);
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"bad-money","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-04T10:00:00Z","provider_updated_at":"2026-09-04T10:01:00Z","state":"paid","profit_usd":"NaN"}]'::jsonb)->>'invalid')::int = 1,
  'non-finite money is invalid'
);
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"bad-type","sub_id":"wf_11111111111111111111111111111111","action_type":"paid_click","action_created_at":"2026-09-04T10:00:00Z","provider_updated_at":"2026-09-04T10:01:00Z","state":"paid"}]'::jsonb)->>'invalid')::int = 1,
  'non-booking action is invalid'
);
select pg_temp.wf_assert(
  (public.wf_tp_reconcile('[{"network":"travelpayouts","campaign_id":89,"action_id":"bad-time","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-04T10:00:00Z","provider_updated_at":"2026-09-04T09:59:00Z","state":"pending"}]'::jsonb)->>'invalid')::int = 1,
  'provider time cannot move backward before creation'
);

-- The table trigger independently blocks direct identity reassignment.
do $$
begin
  begin
    update public.wf_tp_conversions
       set click_token = 'wf_22222222222222222222222222222222'
     where action_id = 'sale-2';
    raise exception 'identity trigger did not reject reassignment';
  exception when others then
    if sqlerrm = 'identity trigger did not reject reassignment' then raise; end if;
    if position('identity is immutable' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

select pg_temp.wf_assert((select count(*) = 2 from public.wf_tp_conversions), 'only two valid conversions exist');
select pg_temp.wf_assert((select relrowsecurity from pg_class where oid = 'public.wf_tp_links'::regclass), 'links RLS enabled');
select pg_temp.wf_assert((select relrowsecurity from pg_class where oid = 'public.wf_tp_clicks'::regclass), 'clicks RLS enabled');
select pg_temp.wf_assert((select relrowsecurity from pg_class where oid = 'public.wf_tp_conversions'::regclass), 'conversions RLS enabled');
select pg_temp.wf_assert(not has_table_privilege('anon', 'public.wf_tp_clicks', 'select'), 'anon cannot read clicks');
select pg_temp.wf_assert(not has_table_privilege('authenticated', 'public.wf_tp_conversions', 'select'), 'authenticated cannot read conversions');
select pg_temp.wf_assert(not has_function_privilege('anon', 'public.wf_tp_reconcile(jsonb)', 'execute'), 'anon cannot execute reconcile');
select pg_temp.wf_assert(not has_function_privilege('authenticated', 'public.wf_tp_reconcile(jsonb)', 'execute'), 'authenticated cannot execute reconcile');
select pg_temp.wf_assert(has_function_privilege('service_role', 'public.wf_tp_reconcile(jsonb)', 'execute'), 'service role can execute reconcile');

-- Reproduce SQL three-valued-logic failures: missing required fields must not
-- become a booking merely because IF NULL is not true.
do $$
declare
  base jsonb := '{"network":"travelpayouts","campaign_id":89,"action_id":"null-field","sub_id":"wf_11111111111111111111111111111111","action_type":"booking","action_created_at":"2026-09-04T10:00:00Z","provider_updated_at":"2026-09-04T10:01:00Z","state":"paid"}'::jsonb;
  field text;
  result jsonb;
begin
  foreach field in array array['network','action_type','state'] loop
    result := public.wf_tp_reconcile(jsonb_build_array(base - field));
    perform pg_temp.wf_assert((result->>'invalid')::int = 1 and (result->>'inserted')::int = 0, 'missing ' || field || ' rejected');
    result := public.wf_tp_reconcile(jsonb_build_array(jsonb_set(base,array[field],'null'::jsonb)));
    perform pg_temp.wf_assert((result->>'invalid')::int = 1, 'null ' || field || ' rejected');
  end loop;
  result := public.wf_tp_reconcile(jsonb_build_array(base || '{"action_id":"sale-1","action_created_at":"2026-09-04T11:00:00Z","provider_updated_at":"2026-10-12T00:00:00Z"}'::jsonb));
  perform pg_temp.wf_assert((result->>'invalid')::int = 1 and (result->>'updated')::int = 0, 'changed action creation identity rejected');
  result := public.wf_tp_reconcile(jsonb_build_array(base || '{"provider_updated_at":"infinity"}'::jsonb));
  perform pg_temp.wf_assert((result->>'invalid')::int = 1, 'infinite provider timestamp rejected');
end;
$$;

-- Test privileges across every table and client role, then drive the actual
-- service-role caller and a real denied anonymous RPC attempt.
do $$
declare t text; r text;
begin
  foreach t in array array['wf_tp_links','wf_tp_clicks','wf_tp_conversions'] loop
    foreach r in array array['anon','authenticated'] loop
      perform pg_temp.wf_assert(not has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE'), r||' has no access to '||t);
    end loop;
  end loop;
end;
$$;
set local role service_role;
select public.wf_tp_reconcile('[]'::jsonb);
reset role;
set local role anon;
do $$
begin
  begin
    perform public.wf_tp_reconcile('[]'::jsonb);
    raise exception 'anon RPC unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.wf_tp_clicks;
    raise exception 'authenticated table read unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
