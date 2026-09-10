-- Durable Travelpayouts click to booking attribution.
-- Tables have deny-all RLS for browser roles. The service role is the only
-- writer and the reconciliation function remains SECURITY INVOKER.

create table public.wf_tp_links (
  provider text not null,
  offer_id text not null,
  campaign_id bigint not null,
  destination_url text not null,
  short_url text not null,
  marker bigint not null,
  trs bigint not null,
  verified_at timestamptz not null,
  enabled boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (provider, offer_id),
  constraint wf_tp_links_provider_check check (provider in ('tiqets', 'klook', 'gocity')),
  constraint wf_tp_links_campaign_check check (campaign_id > 0),
  constraint wf_tp_links_marker_check check (marker > 0),
  constraint wf_tp_links_trs_check check (trs > 0),
  constraint wf_tp_links_destination_check check (destination_url ~ '^https://'),
  constraint wf_tp_links_short_check check (short_url ~ '^https://([A-Za-z0-9-]+\.)?tp\.st/[A-Za-z0-9_-]+$')
);

create table public.wf_tp_clicks (
  click_token text primary key,
  network text not null default 'travelpayouts',
  provider text not null,
  campaign_id bigint not null,
  offer_id text not null,
  content_id text,
  surface text,
  client_click_id text,
  clicked_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint wf_tp_clicks_link_fk foreign key (provider, offer_id)
    references public.wf_tp_links(provider, offer_id),
  constraint wf_tp_clicks_token_check check (click_token ~ '^wf_[0-9a-f]{32}$'),
  constraint wf_tp_clicks_network_check check (network = 'travelpayouts'),
  constraint wf_tp_clicks_provider_check check (provider in ('tiqets', 'klook', 'gocity')),
  constraint wf_tp_clicks_campaign_check check (campaign_id > 0),
  constraint wf_tp_clicks_content_check check (content_id is null or (char_length(content_id) between 1 and 160 and content_id ~ '^[A-Za-z0-9_.:-]+$')),
  constraint wf_tp_clicks_surface_check check (surface is null or (char_length(surface) between 1 and 60 and surface ~ '^[A-Za-z0-9_.:-]+$')),
  constraint wf_tp_clicks_client_check check (client_click_id is null or (char_length(client_click_id) between 1 and 64 and client_click_id ~ '^[A-Za-z0-9_.:-]+$')),
  constraint wf_tp_clicks_ttl_check check (
    expires_at > clicked_at and expires_at <= clicked_at + interval '30 days'
  )
);

create index wf_tp_clicks_campaign_token_idx
  on public.wf_tp_clicks (campaign_id, click_token);
create index wf_tp_clicks_earliest_idx
  on public.wf_tp_clicks (clicked_at asc) where network = 'travelpayouts';

create table public.wf_tp_conversions (
  network text not null,
  campaign_id bigint not null,
  action_id text not null,
  click_token text not null references public.wf_tp_clicks(click_token),
  provider text not null,
  offer_id text not null,
  action_created_at timestamptz not null,
  provider_updated_at timestamptz not null,
  state text not null,
  profit_usd numeric,
  paid_profit_usd numeric,
  price_usd numeric,
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  primary key (network, campaign_id, action_id),
  constraint wf_tp_conversions_network_check check (network = 'travelpayouts'),
  constraint wf_tp_conversions_campaign_check check (campaign_id > 0),
  constraint wf_tp_conversions_action_check check (char_length(action_id) between 1 and 160 and action_id ~ '^[A-Za-z0-9_.:-]+$'),
  constraint wf_tp_conversions_state_check check (state in ('pending', 'paid', 'canceled')),
  constraint wf_tp_conversions_time_check check (provider_updated_at >= action_created_at),
  constraint wf_tp_conversions_provider_check check (provider in ('tiqets', 'klook', 'gocity'))
);

create index wf_tp_conversions_click_idx on public.wf_tp_conversions (click_token);
create index wf_tp_clicks_offer_idx on public.wf_tp_clicks (provider, offer_id);

create function public.wf_tp_conversion_identity_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.network is distinct from old.network
     or new.campaign_id is distinct from old.campaign_id
     or new.action_id is distinct from old.action_id
     or new.click_token is distinct from old.click_token
     or new.provider is distinct from old.provider
     or new.offer_id is distinct from old.offer_id
     or new.action_created_at is distinct from old.action_created_at then
    raise exception 'wf_tp_conversion identity is immutable';
  end if;
  return new;
end;
$$;

create trigger wf_tp_conversion_identity_immutable
before update on public.wf_tp_conversions
for each row execute function public.wf_tp_conversion_identity_immutable();

create function public.wf_tp_reconcile(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_network text;
  v_campaign_id bigint;
  v_action_id text;
  v_click_token text;
  v_action_type text;
  v_action_created_at timestamptz;
  v_provider_updated_at timestamptz;
  v_state text;
  v_profit numeric;
  v_paid_profit numeric;
  v_price numeric;
  v_click public.wf_tp_clicks%rowtype;
  v_existing public.wf_tp_conversions%rowtype;
  v_received integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_stale integer := 0;
  v_unmatched integer := 0;
  v_invalid integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'p_rows exceeds 1000 rows';
  end if;

  -- One writer decides insert versus update at a time. This keeps retries and
  -- overlapping cron invocations from racing the conversion primary key.
  perform pg_advisory_xact_lock(89137509183204::bigint);

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_received := v_received + 1;
    if jsonb_typeof(v_row) <> 'object' then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    begin
      v_network := trim(v_row->>'network');
      v_campaign_id := (v_row->>'campaign_id')::bigint;
      v_action_id := trim(v_row->>'action_id');
      v_click_token := trim(v_row->>'sub_id');
      if v_click_token ~ '^\.wf_' then v_click_token := substr(v_click_token, 2); end if;
      v_action_type := lower(trim(v_row->>'action_type'));
      v_action_created_at := (v_row->>'action_created_at')::timestamptz;
      v_provider_updated_at := (v_row->>'provider_updated_at')::timestamptz;
      v_state := lower(trim(v_row->>'state'));
      if v_state = 'cancelled' then v_state := 'canceled'; end if;
      if v_state = 'processing' then v_state := 'pending'; end if;
      v_profit := case when v_row->>'profit_usd' is null or v_row->>'profit_usd' = '' then null else (v_row->>'profit_usd')::numeric end;
      v_paid_profit := case when v_row->>'paid_profit_usd' is null or v_row->>'paid_profit_usd' = '' then null else (v_row->>'paid_profit_usd')::numeric end;
      v_price := case when v_row->>'price_usd' is null or v_row->>'price_usd' = '' then null else (v_row->>'price_usd')::numeric end;
    exception
      when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
        v_invalid := v_invalid + 1;
        continue;
    end;

    if v_network is distinct from 'travelpayouts'
       or v_campaign_id is null or v_campaign_id <= 0
       or v_action_id is null or char_length(v_action_id) not between 1 and 160 or v_action_id !~ '^[A-Za-z0-9_.:-]+$'
       or v_click_token is null or v_click_token !~ '^wf_[0-9a-f]{32}$'
       or v_action_type is distinct from 'booking'
       or v_action_created_at is null or v_provider_updated_at is null
       or not isfinite(v_action_created_at) or not isfinite(v_provider_updated_at)
       or v_provider_updated_at < v_action_created_at
       or v_state is null or v_state not in ('pending', 'paid', 'canceled')
       or coalesce(v_profit::text in ('NaN', 'Infinity', '-Infinity'), false)
       or coalesce(v_paid_profit::text in ('NaN', 'Infinity', '-Infinity'), false)
       or coalesce(v_price::text in ('NaN', 'Infinity', '-Infinity'), false) then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    select * into v_existing
      from public.wf_tp_conversions
      where network = v_network and campaign_id = v_campaign_id and action_id = v_action_id;

    if found then
      if v_existing.click_token is distinct from v_click_token
         or v_existing.action_created_at is distinct from v_action_created_at then
        v_invalid := v_invalid + 1;
      elsif v_provider_updated_at <= v_existing.provider_updated_at then
        v_stale := v_stale + 1;
      else
        update public.wf_tp_conversions
           set provider_updated_at = v_provider_updated_at,
               state = v_state,
               profit_usd = v_profit,
               paid_profit_usd = v_paid_profit,
               price_usd = v_price,
               last_seen_at = clock_timestamp()
         where network = v_network and campaign_id = v_campaign_id and action_id = v_action_id;
        v_updated := v_updated + 1;
      end if;
      continue;
    end if;

    select * into v_click
      from public.wf_tp_clicks
      where click_token = v_click_token
        and network = v_network
        and campaign_id = v_campaign_id
        and v_action_created_at between clicked_at and expires_at;

    if not found then
      v_unmatched := v_unmatched + 1;
      continue;
    end if;

    insert into public.wf_tp_conversions (
      network, campaign_id, action_id, click_token, provider, offer_id,
      action_created_at, provider_updated_at, state,
      profit_usd, paid_profit_usd, price_usd
    ) values (
      v_network, v_campaign_id, v_action_id, v_click_token, v_click.provider, v_click.offer_id,
      v_action_created_at, v_provider_updated_at, v_state,
      v_profit, v_paid_profit, v_price
    );
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'received', v_received,
    'inserted', v_inserted,
    'updated', v_updated,
    'stale', v_stale,
    'unmatched', v_unmatched,
    'invalid', v_invalid
  );
end;
$$;

alter table public.wf_tp_links enable row level security;
alter table public.wf_tp_clicks enable row level security;
alter table public.wf_tp_conversions enable row level security;

revoke all on table public.wf_tp_links from public, anon, authenticated;
revoke all on table public.wf_tp_clicks from public, anon, authenticated;
revoke all on table public.wf_tp_conversions from public, anon, authenticated;
revoke all on function public.wf_tp_reconcile(jsonb) from public, anon, authenticated;
revoke all on function public.wf_tp_conversion_identity_immutable() from public, anon, authenticated;

grant select, insert, update on table public.wf_tp_links to service_role;
grant select, insert on table public.wf_tp_clicks to service_role;
grant select, insert, update on table public.wf_tp_conversions to service_role;
grant execute on function public.wf_tp_reconcile(jsonb) to service_role;
