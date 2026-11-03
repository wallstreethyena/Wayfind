-- PENDING APPLY. Declared in scripts/migration-pending-apply.json.
-- Owner approved applying the canary repair in-session 2026-11-03.
--
-- Canary "production data integrity", red since 2026-10-28T19:58Z:
--   Holmes Beach (2x, 164m); Scream-A-Geddon Horror Park [Pasco County];
--   Sir Henry's Haunted Trail [Hillsborough County].
--
-- REVISED 2026-11-03 (claude.exe) before it was ever applied. The #2034 draft
-- (1) required the name 'Scream A Geddon Horror Park', which the 2026-11-02
-- refresh renamed to 'Scream-A-Geddon Horror Park', so the draft would have
-- raised and applied nothing; (2) called the second Holmes Beach row a
-- duplicate of the beach; (3) copied a county locator map onto the beach card
-- as a photo of the beach. This version keys every write on place_id plus the
-- exact value being corrected, never on a display name.
--
-- HOLMES BEACH: two distinct entities, not one place stored twice.
--   ChIJaWeoBbURw4gRDYfwKuwOVW0  Holmes Beach  primary_type beach, 344 reviews,
--     in wf_place_ids (public /places page), carries the creator video
--     (lib/creatorVideos.js holmes-beach-destination). Unchanged here.
--   ChIJ2VOdeTYQw4gRALlkLfzdBwc  Holmes Beach  primary_type locality,
--     google_types [locality, political]: the CITY of Holmes Beach (Census:
--     Holmes Beach city, Manatee), added 2026-10-28 by creator curation. Not in
--     wf_place_ids, no saved/user references (only 4 analytics rows), its only
--     photo is a Wikimedia county locator map.
--   A municipality is not a venue: rendered as a card it shows a county map
--   under the same name as the beach. It is SUPPRESSED, not merged and not
--   deleted: status EXCLUDED, excluded true, reason names it as the town and
--   points at the beach card; locked so a refresh does not revive it. Its
--   photo rows (wf_place_photo, wf_google_photo_store) are left as they are.
--   No locator map is copied onto the beach.
--
-- COUNTY: the convention is the bare county name (Census BASENAME).
--   Census for each row's own point, 2026-11-03: Pasco; Hillsborough.
--   Only the suffix is removed; name, address, locality unchanged.
--
-- Every write requires the exact before-value and asserts exactly one row.
-- REVERSE: supabase/data-fixes/20261029223000_holmes_beach_one_card_and_county_suffix_REVERSE.sql

do $$
declare n integer;
begin
  update public.wf_inventory
     set status = 'EXCLUDED',
         excluded = true,
         exclusion_reason = 'not_a_venue:municipality (Town of Holmes Beach); beach card is ChIJaWeoBbURw4gRDYfwKuwOVW0',
         locked = true
   where place_id = 'ChIJ2VOdeTYQw4gRALlkLfzdBwc'
     and primary_type = 'locality'
     and status = 'OPERATIONAL'
     and coalesce(excluded, false) = false
     and exclusion_reason is null
     and coalesce(locked, false) = false;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'holmes beach: town row not in its observed state, changed %', n; end if;

  if not exists (select 1 from public.wf_inventory
                  where place_id = 'ChIJaWeoBbURw4gRDYfwKuwOVW0' and primary_type = 'beach'
                    and status = 'OPERATIONAL' and coalesce(excluded, false) = false) then
    raise exception 'holmes beach: the beach card is not serving; refusing to suppress the town row';
  end if;

  update public.wf_inventory set county = 'Pasco'
   where place_id = 'ChIJ7zRUJ9CowogRM70pcoqrdUM' and county = 'Pasco County';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'county suffix: ChIJ7zRUJ9CowogRM70pcoqrdUM was not Pasco County, changed %', n; end if;

  update public.wf_inventory set county = 'Hillsborough'
   where place_id = 'ChIJeZM_F1A23YgRFICuRhA_pIo' and county = 'Hillsborough County';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'county suffix: ChIJeZM_F1A23YgRFICuRhA_pIo was not Hillsborough County, changed %', n; end if;
end
$$;
