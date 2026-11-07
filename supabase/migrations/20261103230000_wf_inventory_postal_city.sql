-- PENDING APPLY. Declared in scripts/migration-pending-apply.json.
-- Lane claude.exe, owner-approved city model (2026-11-03): keep wf_inventory.locality
-- as the documented geographic contract (lib/placeIdentity.js: the US Census place
-- containing the row's point) and hold the verified MAILING / public city beside it.
--
-- SCHEMA (additive, nullable, no default, no index):
--   postal_city         the verified mailing or public city a listing, a provider
--                       or Apple names for the venue ("Orlando" for Gatorland,
--                       whose point is in Southchase CDP). Display and matching only;
--                       never a coverage key (that is metro) and never geography
--                       (that is locality/county).
--   postal_city_source  the evidence for that value, with its scope and date.
-- RLS: unchanged (wf_inventory keeps its existing policies; no grant changes).
--
-- DATA: postal_city for the 11 rows where Census geography and the mailing city differ
-- (the 10 #2128 conflicts + Scream-A-Geddon). Evidence per row: the city slot of the
-- venue's own wf_events listing address AND the US Census address geocoder's
-- standardized city/ZIP for that address agree (docs/audits/20261103230000_wf_inventory_postal_city.census.json).
-- Each update requires postal_city still NULL; the assertion re-reads all 11.
-- locality is NOT changed here: that follows once the matchers read postal_city.
-- Reverse: supabase/data-fixes/20261103230000_wf_inventory_postal_city_REVERSE.sql

begin;

alter table public.wf_inventory add column if not exists postal_city text;
alter table public.wf_inventory add column if not exists postal_city_source text;
comment on column public.wf_inventory.postal_city is 'Verified mailing/public city (display + identity matching). Not geography (locality/county) and not coverage (metro). Evidence in postal_city_source.';
comment on column public.wf_inventory.postal_city_source is 'Evidence and scope for postal_city: source records and date.';


update public.wf_inventory set postal_city = 'Gulf Breeze', postal_city_source = 'wf_events:fl26-boo-at-the-zoo-2026 listing address city; US Census address match GULF BREEZE 32563 (2026-11-03)'
 where place_id = 'ChIJKVDd7v_bkIgRv0FaG2bnP9g' and postal_city is null;  -- Gulf Breeze Zoo
update public.wf_inventory set postal_city = 'Naples', postal_city_source = 'wf_events:fl26-hallowine-at-mercato-2026 listing address city; US Census address match NAPLES 34108 (2026-11-03)'
 where place_id = 'ChIJhzWIGZUe24gRZ0qRx2ErnPI' and postal_city is null;  -- Mercato
update public.wf_inventory set postal_city = 'Orlando', postal_city_source = 'wf_events:hw26-haunted-hollywood-halloween-at-keg-social-orlando-2026 listing address city; US Census address match ORLANDO 32828 (2026-11-03)'
 where place_id = 'ChIJ7_PseA9n54gRpWhEjEiG3uo' and postal_city is null;  -- KEG SOCIAL ORLANDO
update public.wf_inventory set postal_city = 'Orlando', postal_city_source = 'wf_events:gatorland-ghosts-goblins-2026 listing address city; US Census address match ORLANDO 32837 (2026-11-03)'
 where place_id = 'ChIJ9RHZGx6H3YgRnWVYIWsHNPM' and postal_city is null;  -- Gatorland
update public.wf_inventory set postal_city = 'Orlando', postal_city_source = 'wf_events:hw26-little-pumpkins-fall-festival-at-childrens-orlando-2026 listing address city; US Census address match ORLANDO 32806 (2026-11-03)'
 where place_id = 'ChIJN9FTnbF754gRwLFDBN_ahJ4' and postal_city is null;  -- Children's Planet
update public.wf_inventory set postal_city = 'Orlando', postal_city_source = 'wf_events:hw26-halloween-bar-crawl-10-31-orlando-orlando-2026 listing address city; US Census address match ORLANDO 32819 (2026-11-03)'
 where place_id = 'ChIJOWyInLF_54gRgRgjDQy9zhw' and postal_city is null;  -- American Social Orlando
update public.wf_inventory set postal_city = 'Ponte Vedra Beach', postal_city_source = 'wf_events:fl26-boos-brews-and-ocean-views-2026 listing address city; US Census address match PONTE VEDRA BEACH 32082 (2026-11-03)'
 where place_id = 'ChIJRQw4SiI35IgRSAIrKfRvWEg' and postal_city is null;  -- 1912 Ocean Bar & Rooftop
update public.wf_inventory set postal_city = 'Sarasota', postal_city_source = 'wf_events:hocus-pocus-pops-ii-2026 listing address city; US Census address match SARASOTA 34231 (2026-11-03)'
 where place_id = 'ChIJTRfRfgpBw4gR-u488ol_SOw' and postal_city is null;  -- Riverview Performing Arts Center
update public.wf_inventory set postal_city = 'St. Augustine', postal_city_source = 'wf_events:fl26-headless-bangers-costume-ball-2026 listing address city; US Census address match ST AUGUSTINE 32092 (2026-11-03)'
 where place_id = 'ChIJWfHLuGMs5IgRZHXJPtNZCr0' and postal_city is null;  -- World Golf Village Renaissance
update public.wf_inventory set postal_city = 'Venice', postal_city_source = 'wf_events:wellen-park-spooktacular-2026 listing address city; US Census address match VENICE 34293 (2026-11-03)'
 where place_id = 'ChIJJQVMQuJXw4gRhD0CpEOETGo' and postal_city is null;  -- Downtown Wellen Park
update public.wf_inventory set postal_city = 'Dade City', postal_city_source = 'wf_events:screamageddon-2026 listing address city; US Census address match DADE CITY 33525 (2026-11-03)'
 where place_id = 'ChIJ7zRUJ9CowogRM70pcoqrdUM' and postal_city is null;  -- Scream-A-Geddon Horror Park

do $$
declare wrong integer;
begin
  select count(*) into wrong
  from (values
    ('ChIJKVDd7v_bkIgRv0FaG2bnP9g', 'Gulf Breeze'),
    ('ChIJhzWIGZUe24gRZ0qRx2ErnPI', 'Naples'),
    ('ChIJ7_PseA9n54gRpWhEjEiG3uo', 'Orlando'),
    ('ChIJ9RHZGx6H3YgRnWVYIWsHNPM', 'Orlando'),
    ('ChIJN9FTnbF754gRwLFDBN_ahJ4', 'Orlando'),
    ('ChIJOWyInLF_54gRgRgjDQy9zhw', 'Orlando'),
    ('ChIJRQw4SiI35IgRSAIrKfRvWEg', 'Ponte Vedra Beach'),
    ('ChIJTRfRfgpBw4gR-u488ol_SOw', 'Sarasota'),
    ('ChIJWfHLuGMs5IgRZHXJPtNZCr0', 'St. Augustine'),
    ('ChIJJQVMQuJXw4gRhD0CpEOETGo', 'Venice'),
    ('ChIJ7zRUJ9CowogRM70pcoqrdUM', 'Dade City')
  ) as v(place_id, pc)
  left join public.wf_inventory i using (place_id)
  where i.postal_city is distinct from v.pc or i.postal_city_source is null;
  if wrong > 0 then raise exception 'postal_city: % row(s) do not hold the verified value; rolled back', wrong; end if;
end $$;

commit;
