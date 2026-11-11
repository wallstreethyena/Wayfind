-- Link ICE! at Christmas at Gaylord Palms to the existing resort place.
-- The event row had place_id null. lib/christmasPool.js already maps
-- christmas-at-gaylord-palms-2026 to this place_id. The street is the event
-- row's own address plus the ZIP on the Booking.com property page for this
-- hotel (6000 West Osceola Parkway, FL 34746). No second place or event.

update public.wf_events
set place_id = 'ChIJl0CYCGZ_3YgRL05pG5wZSsE',
    updated_at = now()
where event_id = 'christmas-at-gaylord-palms-2026'
  and place_id is null
  and venue = 'Gaylord Palms Resort & Convention Center';

update public.wf_inventory
set signals = jsonb_set(
  coalesce(signals, '{}'::jsonb),
  '{official_address}',
  to_jsonb('6000 W Osceola Pkwy, Kissimmee, FL 34746'::text),
  true
)
where place_id = 'ChIJl0CYCGZ_3YgRL05pG5wZSsE'
  and name = 'Gaylord Palms Resort & Convention Center'
  and coalesce(signals->>'official_address', '') = '';

do $$
begin
  if (select place_id from public.wf_events where event_id = 'christmas-at-gaylord-palms-2026')
     is distinct from 'ChIJl0CYCGZ_3YgRL05pG5wZSsE' then
    raise exception 'gaylord event place_id was not set';
  end if;
  if (select signals->>'official_address' from public.wf_inventory where place_id = 'ChIJl0CYCGZ_3YgRL05pG5wZSsE')
     is distinct from '6000 W Osceola Pkwy, Kissimmee, FL 34746' then
    raise exception 'gaylord official_address was not set';
  end if;
end $$;
