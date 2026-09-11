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
   nearby place-card rail inside its panel. Nearby places are clearly not the venue.
6. Nearby stays and available planning information.

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
