# Wayfind appearance release — July 24, 2026

This release changes presentation and navigation surfaces only. Ranking, search,
booking, authentication, and data behavior remain unchanged.

## Homepage

- Moved the discovery experience into the top hero rail.
- Kept the category menu directly beneath the hero rail and renamed “Things to
  do” to “Activities.”
- Added touch swipe and previous/next controls to the rail.
- Rendered the same complete hero rail on desktop and mobile.
- Added permanent Beach Day, Hidden Gems, Date Night, Family, and Trending Near
  You cards so their artwork does not depend on nearby-result availability.
- Reduced discovery-chip height and typography while tightening the space above
  “Happening near you.”

## Artwork

- Default discovery: `wayfind-default-hero-adobestock-289023289.jpeg`
- Beach Day: `beach-adobestock-216195684.jpeg`
- Hidden Gems: `hidden-gems-adobestock-321810820.jpeg`
- Date Night: `date-night-adobestock-190984224.jpeg`
- Family: `family-adobestock-794890098.jpeg`
- Trending Near You: `trending-near-you-adobestock-434128766.jpeg`
- “Your best next plan” popup: `wayfind-next-plan-family-pool.jpeg`

The corresponding landing pages, share artwork, and destination-menu headers
use the same imagery where applicable.

## Brand and polish

- Replaced dark-box logo treatments with the transparent Wayfind wordmark,
  orange “i” dot, and orange location pin.
- Replaced the search field’s large orange focus glow with a restrained
  platinum border and dark shadow.
- Increased the “Your best next plan” popup height by 10%, retained internal
  scrolling for small screens, and made the supplied family-pool photo its
  permanent background.

## Validation

- JSX/type syntax check
- Image delivery policy check
- Brand regression suite
- Intent-page, beach-page, homepage, and buzz regression suites
- Whitespace/error check
