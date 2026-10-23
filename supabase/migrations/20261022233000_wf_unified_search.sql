-- DRAFT. Not applied to production by this change.
-- Do not run this file against the production project from a feature branch.
--
-- Unified search index for places, events, and operator-loaded guide, page,
-- and coupon rows. Retrieval uses tsvector plus pg_trgm. The application
-- re-ranks every candidate in code. This function's ORDER BY is only a
-- candidate cutoff. No affiliate, sponsor, offer, or commission column exists,
-- so none can affect order.
--
-- Events stay current: wf_search_refresh() backfills, and a row trigger
-- upserts or deletes the event document on every wf_events write.
-- Place rows are identity only (name, category, coords) and are dropped when
-- inventory is older than 30 days. Guide, page, and coupon rows are loaded
-- with wf_search_replace_documents(); the app also serves those from the repo
-- catalog when this table is absent.

begin;

create extension if not exists pg_trgm with schema extensions;

create table public.wf_search_documents (
  doc_key text primary key check (char_length(doc_key) between 3 and 220),
  kind text not null check (kind in ('place', 'event', 'guide', 'page', 'coupon')),
  title text not null check (char_length(title) between 1 and 300),
  body text not null default '',
  city_slug text,
  city_name text,
  href text not null check (href like '/%' and href not like '//%'),
  category text,
  price_band text,
  kid_friendly boolean,
  when_hint text,
  keywords text[] not null default '{}',
  lat double precision,
  lng double precision,
  source_table text,
  source_id text,
  updated_at timestamptz not null default pg_catalog.now(),
  search_vector tsvector generated always as (
    pg_catalog.setweight(pg_catalog.to_tsvector('english', coalesce(title, '')), 'A')
    || pg_catalog.setweight(pg_catalog.to_tsvector('english', coalesce(body, '')), 'B')
    || pg_catalog.setweight(pg_catalog.to_tsvector('english', coalesce(pg_catalog.array_to_string(keywords, ' '), '')), 'A')
  ) stored,
  check (lat is null or (lat >= -90 and lat <= 90)),
  check (lng is null or (lng >= -180 and lng <= 180))
);

create index wf_search_documents_fts on public.wf_search_documents using gin (search_vector);
create index wf_search_documents_title_trgm on public.wf_search_documents using gin (title extensions.gin_trgm_ops);
create index wf_search_documents_kind on public.wf_search_documents (kind);

alter table public.wf_search_documents enable row level security;
revoke all on table public.wf_search_documents from public, anon, authenticated;
grant select, insert, update, delete on table public.wf_search_documents to service_role;

comment on table public.wf_search_documents is
  'Server-only unified search documents. Candidate retrieval is tsvector + trigram. Display order is applied in application code. No commercial ranking column.';

create table public.wf_search_understand_cache (
  cache_key text primary key check (char_length(cache_key) between 1 and 220),
  filters jsonb not null check (jsonb_typeof(filters) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null
);

alter table public.wf_search_understand_cache enable row level security;
revoke all on table public.wf_search_understand_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.wf_search_understand_cache to service_role;

comment on table public.wf_search_understand_cache is
  'Validated search filters only, keyed by normalized query and city, kept 7 days. Never stores model prose or place names.';

create or replace function public.wf_search_upsert_event(p_event_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  row public.wf_events%rowtype;
  kid boolean;
  band text;
  hint text;
  today date := (pg_catalog.now() at time zone 'America/New_York')::date;
begin
  select * into row from public.wf_events where event_id::text = p_event_id;
  if not found
     or row.slug is null
     or row.event_name is null
     or row.event_status not in ('scheduled', 'sold_out')
     or (row.end_date is not null and row.end_date < today)
  then
    delete from public.wf_search_documents where doc_key = 'event:' || p_event_id;
    return;
  end if;
  kid := exists (
    select 1 from pg_catalog.unnest(coalesce(row.audience, array[]::text[])) as audience(tag)
    where audience.tag in ('families', 'kids', 'family', 'children')
  );
  band := case when row.is_free is true then 'free' else row.price_band end;
  hint := case
    when row.start_date = today then 'today'
    when row.start_date is not null and row.start_date <= today + 2 and (row.end_date is null or row.end_date >= today) then 'weekend'
    else 'anytime'
  end;
  insert into public.wf_search_documents (
    doc_key, kind, title, body, city_slug, city_name, href, category, price_band,
    kid_friendly, when_hint, keywords, lat, lng, source_table, source_id, updated_at
  ) values (
    'event:' || row.event_id::text,
    'event',
    left(row.event_name, 300),
    left(coalesce(row.card_hook, row.short_title, row.venue, ''), 600),
    nullif(lower(regexp_replace(coalesce(row.city, ''), '[^a-zA-Z0-9]+', '-', 'g')), ''),
    row.city,
    '/florida-events/' || row.slug,
    'events',
    band,
    kid,
    hint,
    coalesce(row.tags, array[]::text[]),
    row.lat,
    row.lng,
    'wf_events',
    row.event_id::text,
    pg_catalog.now()
  )
  on conflict (doc_key) do update set
    title = excluded.title,
    body = excluded.body,
    city_slug = excluded.city_slug,
    city_name = excluded.city_name,
    href = excluded.href,
    category = excluded.category,
    price_band = excluded.price_band,
    kid_friendly = excluded.kid_friendly,
    when_hint = excluded.when_hint,
    keywords = excluded.keywords,
    lat = excluded.lat,
    lng = excluded.lng,
    updated_at = pg_catalog.now();
end
$$;

create or replace function public.wf_search_events_sync()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.wf_search_documents where doc_key = 'event:' || old.event_id::text;
    return old;
  end if;
  perform public.wf_search_upsert_event(new.event_id::text);
  return new;
end
$$;

drop trigger if exists wf_search_events_sync on public.wf_events;
create trigger wf_search_events_sync
  after insert or update or delete on public.wf_events
  for each row execute function public.wf_search_events_sync();

create or replace function public.wf_search_refresh()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  places integer;
  events integer;
  event_id text;
begin
  delete from public.wf_search_understand_cache where expires_at < pg_catalog.now();

  insert into public.wf_search_documents (
    doc_key, kind, title, body, href, category, keywords, lat, lng, source_table, source_id, updated_at
  )
  select
    'place:' || i.place_id,
    'place',
    left(i.name, 300),
    left(replace(coalesce(i.primary_type, ''), '_', ' '), 200),
    '/places/' || i.place_id,
    i.category,
    coalesce(i.tags, array[]::text[]),
    i.lat,
    i.lng,
    'wf_inventory',
    i.place_id,
    pg_catalog.now()
  from public.wf_inventory i
  where i.place_id is not null
    and i.name is not null
    and i.excluded is not true
    and i.status = 'OPERATIONAL'
    and i.refreshed_at >= pg_catalog.now() - interval '30 days'
    and i.lat is not null
    and i.lng is not null
  on conflict (doc_key) do update set
    title = excluded.title,
    body = excluded.body,
    href = excluded.href,
    category = excluded.category,
    keywords = excluded.keywords,
    lat = excluded.lat,
    lng = excluded.lng,
    updated_at = pg_catalog.now();
  get diagnostics places = row_count;

  delete from public.wf_search_documents d
  where d.kind = 'place'
    and not exists (
      select 1 from public.wf_inventory i
      where i.place_id = d.source_id
        and i.excluded is not true
        and i.status = 'OPERATIONAL'
        and i.refreshed_at >= pg_catalog.now() - interval '30 days'
    );

  events := 0;
  for event_id in select e.event_id::text from public.wf_events e loop
    perform public.wf_search_upsert_event(event_id);
    events := events + 1;
  end loop;

  delete from public.wf_search_documents d
  where d.kind = 'event'
    and not exists (
      select 1 from public.wf_events e
      where 'event:' || e.event_id::text = d.doc_key
    );

  return jsonb_build_object('places', places, 'events_seen', events);
end
$$;

create or replace function public.wf_search_replace_documents(p_kind text, p_docs jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  inserted integer;
begin
  if p_kind not in ('guide', 'page', 'coupon') then
    raise exception 'wf_search_replace_documents kind must be guide, page, or coupon';
  end if;
  if p_docs is null or jsonb_typeof(p_docs) <> 'array' then
    raise exception 'wf_search_replace_documents expects a json array';
  end if;
  delete from public.wf_search_documents where kind = p_kind and source_table = 'catalog';
  insert into public.wf_search_documents (
    doc_key, kind, title, body, city_slug, city_name, href, category, price_band,
    kid_friendly, keywords, lat, lng, source_table, source_id, updated_at
  )
  select
    p_kind || ':' || left(doc->>'id', 160),
    p_kind,
    left(doc->>'title', 300),
    left(coalesce(doc->>'body', ''), 600),
    nullif(doc->>'city_slug', ''),
    nullif(doc->>'city_name', ''),
    doc->>'href',
    nullif(doc->>'category', ''),
    nullif(doc->>'price_band', ''),
    case when doc ? 'kid_friendly' and jsonb_typeof(doc->'kid_friendly') = 'boolean' then (doc->>'kid_friendly')::boolean else null end,
    coalesce((select pg_catalog.array_agg(value) from jsonb_array_elements_text(coalesce(doc->'keywords', '[]'::jsonb)) as value), array[]::text[]),
    nullif(doc->>'lat', '')::double precision,
    nullif(doc->>'lng', '')::double precision,
    'catalog',
    left(doc->>'id', 160),
    pg_catalog.now()
  from jsonb_array_elements(p_docs) as doc
  where coalesce(doc->>'id', '') <> ''
    and coalesce(doc->>'title', '') <> ''
    and coalesce(doc->>'href', '') like '/%'
    and doc->>'href' not like '//%';
  get diagnostics inserted = row_count;
  return inserted;
end
$$;

-- Candidate cutoff only. Application code re-ranks and never reads a commercial column.
create or replace function public.wf_search_documents_query(p_query text, p_limit integer default 40)
returns table (
  doc_key text,
  kind text,
  title text,
  href text,
  city_slug text,
  city_name text,
  category text,
  price_band text,
  kid_friendly boolean,
  when_hint text,
  keywords text[],
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select
    d.doc_key, d.kind, d.title, d.href, d.city_slug, d.city_name, d.category,
    d.price_band, d.kid_friendly, d.when_hint, d.keywords, d.lat, d.lng
  from public.wf_search_documents d
  where p_query is not null
    and pg_catalog.char_length(pg_catalog.btrim(p_query)) >= 2
    and (
      d.search_vector @@ pg_catalog.plainto_tsquery('english', left(p_query, 160))
      or extensions.similarity(d.title, left(p_query, 160)) > 0.3
    )
  order by
    extensions.similarity(d.title, left(p_query, 160)) desc,
    pg_catalog.ts_rank(d.search_vector, pg_catalog.plainto_tsquery('english', left(p_query, 160))) desc,
    d.doc_key asc
  limit least(greatest(coalesce(p_limit, 40), 1), 40);
$$;

revoke all on function public.wf_search_upsert_event(text) from public, anon, authenticated;
revoke all on function public.wf_search_events_sync() from public, anon, authenticated;
revoke all on function public.wf_search_refresh() from public, anon, authenticated;
revoke all on function public.wf_search_replace_documents(text, jsonb) from public, anon, authenticated;
revoke all on function public.wf_search_documents_query(text, integer) from public, anon, authenticated;
grant execute on function public.wf_search_upsert_event(text) to service_role;
grant execute on function public.wf_search_refresh() to service_role;
grant execute on function public.wf_search_replace_documents(text, jsonb) to service_role;
grant execute on function public.wf_search_documents_query(text, integer) to service_role;

-- Backfill places and the events already on file. Later event writes go through the trigger.
select public.wf_search_refresh();

commit;
