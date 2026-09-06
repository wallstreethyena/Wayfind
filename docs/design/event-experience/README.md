# Premium event experience prototype

An isolated, interactive design review at `/design/event-experience/index.html`.
Phone-width review: `/design/event-experience/mobile.html` (390 × 844 iframe).
This does not replace production event pages or change booking links.

## Design

Wayfind black, restrained orange, official logos, large existing photography,
a clear booking panel, calm map, and coordinated numbered nearby cards.
Mobile uses stacked content, a horizontal discovery rail and fixed booking action.
Keyboard focus, native dialogs and reduced-motion preferences are supported.

## Try it

Change dates and guest counts, preview the subtotal, dismiss with Escape,
filter nearby picks, select a card or map pin, expand the collection, switch
map style and change the example starting point. Saves last only for this page session.
Locally: `python -m http.server 8080 --directory public`.

All outing details, prices, dates and location fixtures are illustrative.
Photography illustrates categories; it is not proof of a venue or offer.
No card fields, personal data, GPS requests, booking requests, analytics,
database changes, Google calls or paid data acquisition are introduced.
The map loads MapLibre 6.0.0 from unpkg and OpenFreeMap tiles; those external
requests follow the visitor's browser/network policy. It has a failure state.
No road route or travel time is invented.

## Production work after design review

1. Extract shared event presentation components, connect verified event content,
   and introduce behind a rollout flag on both existing event routes. Preserve
   existing pairing eligibility, ranking, score display, attribution and fallbacks.
2. Add provider capability checks. Only enable on-site checkout for contracted,
   approved booking APIs. Viator Full + Booking needs partner approval and
   certification. Use sandbox availability, pricing, cancellation, duplicate-submit,
   failed-payment, refund and confirmation checks before live payments. Preserve
   attributed external booking where on-site booking is unsupported.
3. Connect real road routing through a commercially permitted provider with
   explicit cost limits. Request location only after a user action; offer typed
   origin and handle denied permission. Never label straight-line geometry as a
   road route. Share the approved map design with the main map tab separately.

Success remains a hypothesis: compare event-to-booking starts, confirmed bookings,
nearby-place engagement, load performance and error rates against an actual
baseline during a limited rollout. No conversion or revenue increase is claimed.
