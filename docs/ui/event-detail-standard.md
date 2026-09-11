# Event detail page standard

Both `/florida-events/[slug]` and `/events/[city]/[slug]` use
`app/components/EventDetailShell.js`. Change the shell to change the standard.
Route files supply verified event content and the existing action components.

## Reading order

1. Event title and any cancellation or postponement notice.
2. Event facts, starting with the date and time, then location and admission.
3. Schedule notes and the reason to go. Curated verdicts, age limits and duration
   remain visible when available. Provider stories keep their existing evidence.
4. A separate action section with a border, positive spacing, booking disclosure,
   and the existing Save and Share behavior.
5. Event photos in a horizontal portrait rail. Desktop places this beside the
   overview; mobile retains the same DOM order and puts photos below it.
6. Available creator posts, followed by the shared venue map, nearby places,
   stays and additional planning information.

## Shared layout rules

- `EventExperienceStyles.js` owns the overview, facts, action separation and
  photo geometry. Do not restore route-specific negative action margins.
- Facts and reasons grow with their text. Do not set fixed content heights or
  position actions over text. Long labels must wrap inside their container.
- Photo wrappers are 252 by 448 pixels on desktop and 216 by 384 on mobile.
  Images fill the wrappers; intrinsic image dimensions cannot enlarge the rail.
- Use only the event's existing cleared photos. Owned gallery photos stay
  behind `eventPhotos`, retain credit, and do not repeat the hero in the rail.
- `EventPlacePhoto` preserves the frame when an image fails. Missing photos
  show an honest monogram instead of another venue's image.
- Nearby place recommendations also remain in a horizontal rail on desktop
  and mobile, separate from the event's own photos and venue information.
- Empty optional facts stay absent. Do not invent prices, dates, reasons,
  photography, creator associations or available tickets to fill the shell.

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
