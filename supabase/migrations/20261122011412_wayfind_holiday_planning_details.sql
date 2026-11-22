-- Editorial update for one existing event and two published holiday guides.
-- ICE! ticket and visit details: christmasatgaylordpalms.com/faqs and
-- tickets.gaylordpalms.com/eventperformances.asp?evt=162.
-- The blog edits append to the existing intro and preserve every existing pick.
do $migration$
declare
  change record;
begin
  update public.wf_events
     set card_hook = 'Step into The Polar Express carved from ice. It is 9°F inside, and Gaylord Palms provides a parka.',
         editorial_summary = 'Walk through scenes from The Polar Express and ride the ice slides at Gaylord Palms. Choose a timed ICE! entry. Snow tubing and other holiday activities can require separate tickets. Check your package inclusions before checkout.',
         official_ticket_url = 'https://tickets.gaylordpalms.com/eventperformances.asp?evt=162',
         parking_tip = 'The resort lists $38 daily for self-parking and $55 daily for valet. Parking and taxes are separate from ICE! admission.',
         insider_tip = 'A parka is provided. Bring gloves and warm layers. Wear long pants and closed-toe shoes if you plan to use the ice slides.',
         what_to_bring = 'Gloves, warm layers, long pants and closed-toe shoes for the ice slides.',
         updated_at = now()
   where event_id = 'christmas-at-gaylord-palms-2026'
     and slug = 'christmas-at-gaylord-palms-2026'
     and card_hook = 'Two million pounds of hand-carved ice, kept at nine degrees. Bring a parka.'
     and editorial_summary = 'ICE! featuring The Polar Express at Gaylord Palms: carved-ice tunnels and two-story ice slides, plus snow tubing and a holiday show. Walk the ice tunnels, zip down the slides, then go snow tubing.'
     and official_ticket_url = 'https://tickets.gaylordpalms.com/'
     and parking_tip is null
     and insider_tip is null
     and what_to_bring is null;

  if not found and not exists (
    select 1 from public.wf_events
     where event_id = 'christmas-at-gaylord-palms-2026'
       and official_ticket_url = 'https://tickets.gaylordpalms.com/eventperformances.asp?evt=162'
       and card_hook = 'Step into The Polar Express carved from ice. It is 9°F inside, and Gaylord Palms provides a parka.'
  ) then
    raise exception 'Gaylord Palms editorial row changed. Review the current copy before applying.';
  end if;

  for change in
    select * from (values
      ('christmas-events-tampa-bay-2026', $tampa$
## Where to see Christmas lights in Tampa Bay

- **Largo Central Park** · Nightly from November 26 to January 3, 5 to 10 PM. Walking through the lights is free and rides cost extra. Parking is free on regular nights. December 5 is the exception for the tree lighting. [See the Largo event card](https://www.gowayfind.com/florida-events/holiday-lights-in-largo-central-park-2026) or [open the city’s parking map and event details](https://www.playlargo.com/special_events_detail_T40_R38.php).
- **Holiday Lights in the Gardens, Largo** · Nightly from November 27 to January 3, 5:30 to 9:30 PM. The foundation suggests a $10 donation for visitors over 12. Start at the gardens’ entrance at 12520 Ulmerton Road and check the foundation page for arrival details. [See the foundation’s schedule](https://flbgfoundation.org/holiday-lights).
- **Tampa Riverwalk Holiday Spectacular** · November 29 to January 2. Walk the public Riverwalk for the floating displays. The tree lighting is Sunday, November 29, from 5 to 8 PM at the Tampa Convention Center and The Sail Plaza. Paid downtown garages are nearby. [See the Riverwalk schedule](https://thetampariverwalk.com/events/holiday-spectacular.html).

For a shorter list, see [this weekend’s Tampa Bay picks](https://www.gowayfind.com/events/tampa/this-weekend).
$tampa$),
      ('christmas-events-sarasota-bradenton-2026', $sarasota$
## Where to see Christmas lights in Sarasota and Bradenton

- **Holidays at UTC, Sarasota** · Nightly light shows from 6:30 to 9:30 PM, with shows every half hour. Head to The Green at UTC for the shows. Skating and other activities have separate schedules and prices. Use the shopping center’s parking areas. [See the UTC event card](https://www.gowayfind.com/florida-events/utc-holidays-2026) or [check the official holiday schedule](https://utcsarasota.com/holidays/).
- **Lights in Bloom at Selby Gardens, Sarasota** · Select nights from December 5 to January 2. General entry starts at 6:30 PM and adult nonmember admission is $34. The garden’s limited on-site parking vouchers are $19. Free off-site parking and trolley service are also available. [See the Selby Gardens event card](https://www.gowayfind.com/florida-events/selby-gardens-lights-in-bloom-2026) or [check your night and parking options with Selby](https://selby.org/events/lights-in-bloom-2026/).
- **Winter Nights Under the Lights, Bradenton** · December 17 to 20 at Palma Sola Botanical Park. Admission is free, with food and market purchases separate. Check the park’s event notice before heading to the 17th Avenue NW entrance. [See the park’s event details](https://palmasolabp.org/winter-nights-under-the-lights-dec-17-20-26/).

For plans on specific days, see [this weekend’s Sarasota and Bradenton picks](https://www.gowayfind.com/events/sarasota/this-weekend).
$sarasota$)
    ) as edits(slug, intro_addition)
  loop
    update public.wf_blog_posts
       set intro_md = rtrim(coalesce(intro_md, '')) || E'\n\n' || btrim(change.intro_addition, E'\n'),
           updated_at = now()
     where slug = change.slug
       and status = 'published'
       and position('## Where to see Christmas lights' in coalesce(intro_md, '')) = 0;

    if not found and not exists (
      select 1 from public.wf_blog_posts
       where slug = change.slug and status = 'published'
         and position(btrim(change.intro_addition, E'\n') in intro_md) > 0
    ) then
      raise exception 'Holiday guide % is missing or its lights section has changed.', change.slug;
    end if;
  end loop;
end;
$migration$;
