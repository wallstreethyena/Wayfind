# Place card standard

All place recommendation cards use one shared presentation contract. The
existing main-page card is the reference, including its dark frame, orange
accents, score placement, media strip, typography, and action controls.

## Ownership and geometry

`lib/placeCardStandard.js` owns the sizing values. `WF_PLACE_CARD_CSS` in
`app/components/css.js` is the only owner of card geometry and presentation.

| Property | Standard |
| --- | --- |
| Card body height | Horizontal rails: 268px. Stacked lists: height follows content — no empty 268px box |
| Maximum card width | 440px |
| Phone width | Stacked lists fill the column (`min(100%, 440px)`), same 13px gutters as the search box. The 1.08 peek is rail-only and must never inherit into `.wf-place-card-list` |
| Phone photo | Stacked lists: 36% of card width (32–38% band). Rails: 96px (108px desktop) |
| Narrow containers | Clamp to the available width using the shared rule |
| Card gap | 10px |
| Media, title, padding, score and actions | Existing shared IconicPlaceCard styles |
| Loading reservation | Rails: 268px + peek + 96px media. Stacked-list skeletons: fill the column, 36% media, reserve 235px (live list height) — never a 178px squat or a global 268 lock |

Responsive sizing belongs to the shared contract. A route must not choose a
different card height, width formula, image layout, title font, or action size.
Long content uses the shared content slots and overflow treatment. Critical
controls and disclosures must remain visible and usable.

Use the shared card components for ranked place results, including sponsored
places. Containers use the shared rail, list, and slot classes. A booking
control or required disclosure outside the card may need additional space;
that accompanying content must not resize the card body.

Seasonal colors and meaningful badges already supported by the system remain
data-driven treatments of the same card. Campaign posters, videos, social
share images, detail-page heroes, and map pin selectors are different UI
objects. They must not be used as substitutes for a place recommendation card.

## Enforcement

`scripts/check-place-card-standard.mjs` checks source ownership and registered
renderers and measures real rendered components, including wrapper styles.
The guard is connected to the normal build suite. GitHub's required check
installs Chromium and requires browser evidence.

The rendered matrix covers achieved viewport widths of 320, 360, 390, 768, 900,
1440, and 1920px. It checks dimensions, shared presentation, and usable
controls. Fixtures must include ordinary cards and the event/stays wrappers
that previously introduced a 340px override. A mutation must prove that the
historical override is rejected, not merely that the current files pass.

A new raw renderer or wrapper cannot quietly create its own standard. Add
coverage in the same change, keep the shared CSS present, and verify both
healthy cases and the relevant failure case. A skipped browser run must be
reported as not run. It must never be reported as measured or verified.

Only an explicit owner decision can change this standard. Make such a change
centrally and update all affected consumers and measurements together.

The same ownership principle applies to future UI additions: compose existing
navigation, headings, buttons, loading components, and design tokens. Do not
introduce a new look merely because a feature lives on a new page.
