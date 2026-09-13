# Event detail page standard

Both `/florida-events/[slug]` and `/events/[city]/[slug]` use
`app/components/EventDetailShell.js`. Change the shell to change the standard.
Route files supply verified event content and the existing action components.

## Reading order

1. A horizontal section menu links only to sections that actually render, including
   stays that arrive after the initial page response.
2. The event photograph leads one unified overview card, above the title. Other
   cleared photographs remain swipeable, without a repeated photo section below.
3. Event title, status, date-first facts, schedule notes and reasons to go.
4. A separate action section with a border, positive spacing, booking disclosure,
   and Save and Share controls.
5. Exact-event creator videos, then the shared venue map with the standard iconic
   nearby and stays place-card rails inside its panel. The venue remains distinct.
6. Available planning information.

## Shared layout rules

- `EventExperienceStyles.js` owns the overview, facts, action separation and
  photo geometry. Do not restore route-specific negative action margins.
- Facts and reasons grow with their text. Do not set fixed content heights or
  position actions over text. Long labels must wrap inside their container.
- The overview photo fills the top of the card, with height bounded from 240 to
  440 pixels. Additional gallery frames remain horizontal. Iconic place cards
  retain the shared portrait media geometry. Intrinsic photos cannot stretch rails.
- Use only the event's existing cleared photos. Owned gallery photos stay
  behind `eventPhotos`, retain credit, and do not repeat the hero in the rail.
- `EventPlacePhoto` preserves the frame when an image fails. Missing photos
  show an honest monogram instead of another venue's image.
- Nearby places and stays use `EventPlaceRail`, the shared homepage heading,
  arrow controls and paging dots. Each rail has its own target. Both sit inside
  the Where it is card, separate from the event's own photo gallery.
- The stays caption is one short sentence: “Top stays within 12 miles.”
  Streaming stays publish the exact displayed identities to the map context;
  the map does not independently choose a different hotel pool.
- Empty optional facts stay absent. Do not invent prices, dates, reasons,
  photography, creator associations or available tickets to fill the shell.

The map-to-cards transition uses one compact Event/Nearby pin key and one
“Nearby places” heading. Do not repeat the venue name, ranking explanation or
not-the-venue disclaimer in visible paragraphs above the cards. Preserve the
explicit accessible region label and use compact padding on mobile and desktop.

## Verification

`scripts/test-event-experience.mjs` renders both real route functions and the
shared shell with real Save, Share and event-action controls. It checks reading
order, ticket gates, long content, photo fallbacks and the owned photo rail.
`scripts/check-event-photo-rights.mjs` checks photo rights and the shared rail's
bounded geometry. Both are already connected to `scripts/guards.txt`.

Run the event tests and the required project guards before release. Browser
acceptance must inspect 320, 390, 430, 800, 801 and 1440 pixel viewports, including
long verdicts, saved/copied button labels and image failure. Confirm achieved
viewport widths, action/text separation, horizontal rail scrolling and absence
of page overflow. Static render assertions alone do not prove these behaviors.

## Sharing and source identity

Share opens the native share sheet first, or immediate Text/Email/Copy options.
An early place-card tap is retained until hydration. Copy success is shown only
after the clipboard write succeeds. Test the actual card action path.

Only verified exact-event media belongs in the event video rail. General city
roundups and venue-only media cannot be relabeled as event footage. Keep
unresolved reported links in the audit with their missing evidence visible.
