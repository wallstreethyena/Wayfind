BEGIN;
UPDATE public.wf_events SET
price_min=NULL,
schedule_note='Selected operating dates November 14, 2026 through February 28, 2027. Hours and tubing sessions vary by date; consult the current park calendar.',
insider_tip='Choose a date and tubing session before comparing general admission, unlimited tubing and VIP upgrades. Check the current ticket total and skate-rental charges; past opening-weekend prices do not establish today''s price.',
last_verified_at=now(),updated_at=now(),verify_note=concat_ws(' ',verify_note,'2026-11-17 screenshot coverage check: removed expired opening-weekend minimum and tip; official calendar supports selected dates.')
WHERE event_id='snowcat-ridge-2026';
UPDATE public.wf_events SET
place_id='ChIJ5UOOwKux5YgRAmO1YNbhTc0',
price_min=30,price_band='$$',is_free=false,
editorial_summary='An evening lights event at Jacksonville Zoo and Botanical Gardens on selected nights November 20 to January 3, 6 to 10 PM. Regular nonmember admission is $30 online or $35 at the door; members pay $20 online or $25 at the door. Children 2 and under are free. Animals are not visible during this event. The separately advertised November 19 Community Night is $10.',
insider_tip='Buy for the lights rather than animal viewing. The regular nonmember online ticket is $30 before any checkout additions, so it is not an under-$30 outing. Check the selected night before travel.',
source_tier=1,source_type='official-organizer',verification_confidence='high',last_verified_at=now(),updated_at=now()
WHERE event_id='zoolights-jacksonville-zoo-2026';
UPDATE public.wf_events SET
official_event_url='https://events.jacksonville.gov/special-events/jaxholidayriverfest',
source_url='https://events.jacksonville.gov/special-events/jaxholidayriverfest',
editorial_summary='The Jacksonville Light Boat Parade begins at 6:30 PM on November 28, 2026 along the St. Johns River, within Holiday River Fest. The riverfront event starts at 5 PM; the Riverfront Plaza tree lighting is at 6:25 PM. After-parade fireworks are scheduled for approximately 8:30 PM.',
schedule_note='November 28, 2026: Holiday River Fest 5 PM; tree lighting 6:25 PM; Light Boat Parade 6:30 PM; winners 8:15 PM; fireworks approximately 8:30 PM.',
start_time='18:30',insider_tip='Choose a Northbank or Southbank viewing area and check the city''s road-closure information. The fireworks time is approximate.',
last_verified_at=now(),updated_at=now()
WHERE event_id='jacksonville-light-boat-parade-2026';
COMMIT;
SELECT event_id,price_min,place_id,start_time FROM public.wf_events WHERE event_id IN ('snowcat-ridge-2026','zoolights-jacksonville-zoo-2026','jacksonville-light-boat-parade-2026');
