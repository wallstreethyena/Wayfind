# Family-day evidence overlay

The 2026-10-27 audit recorded in PR #1981 renewed 19 of 20 overlays through an exclusive expiry of **2026-11-27T00:00:00Z** (**2026-11-26 at 19:00 EST**). PopStroke Orlando remains expired pending confirmation that the venue has opened. The monthly window reflects dynamic admission and reservation policies; expired facts fail closed to unknown.

`lib/familyDayEvidence.js` contains 20 bounded overlays keyed by the exact `wf_inventory.place_id` returned by Supabase project `gbhtoehdxkzjsmmkisgu`. It does not create or admit venues. The family inventory classifier still controls eligibility and distance; the overlay only supplies facts that broad Google metadata cannot prove.

## Contract

`familyFilterFacts(placeId)` returns `null` for an unknown or expired ID. Otherwise it returns only allowlisted values:

- `ages`: `baby`, `toddler`, `kid`, `tween`, `teen`, `all-ages`
- `weather_fit`: `indoor`, `outdoor`, `heat-friendly`, `shaded`
- `cost`: `free`, `ticketed`
- `duration_recommendation`: `quick`, `half-day`, `full-day`
- `parking` and `reservation_required`: booleans only when the source is explicit
- `stroller`, `stroller_parking`, `changing_facilities`, and `height_restrictions`: booleans only when explicitly documented, with bounded notes where useful
- `rail_types`: allowlisted rail identities (`beach`, `attractions`, `water`, `animals`, `outdoors`, `indoor`, `space`, `active`, `culture`, `food`); the legacy `space` identity joins the current `indoor` rail
- `style`: `hands-on`, `educational`, `animal-focused`, `nature`, `show`, `active`
- `composition`: `mixed-ages`, `young-children`, `older-kids`
- `verifiedAt`, `expiresAt`, and first-party `sources`

The helper also rejects malformed dates, future verification dates, expiry at or before verification, non-finite clocks, and records with no valid HTTPS source.

Unknown facts are omitted. `ticketed` means general entry is sold; it does not imply a price band. `reservation_required: true` is used only where the official venue flow requires dated or online admission. A recommendation to reserve is not treated as a requirement. The module contains no live prices, hours, ratings, reviews, photos, phone numbers, or addresses.

## Coverage

The registry spans Orlando, Tampa, Miami, Fort Lauderdale, Jacksonville, Sarasota, and Central Florida. Its live overlays include theme parks, children's museums, science centers, zoos, a beach, gardens, animal parks, and family dinner theater. Several venues legitimately cover more than one of the nine current rails. An overlay does not guarantee a visible card: the owned inventory, operational status, location, rating/review floor, and selected filters still govern eligibility.

Every source is the venue's own site or, for Siesta Beach, Sarasota County's official parks site. No Disney page or reservation endpoint was requested. Disney venues are deliberately absent because automated Disney-domain requests are prohibited by `AGENTS.md`.

## Evidence notes by exact inventory identity

These notes summarize the current committed overlay and the corrections recorded by PR #1981. First-party source URLs are stored on each entry in `lib/familyDayEvidence.js`; those pages remain the source of record. This document is not a separate replay of all source checks. The 2026-10-28 follow-up independently spot-checked PopStroke, Frost Science, and WonderWorks; the Siesta Beach source returned HTTP 403, so its correction below is attributed to the recorded 2026-10-27 audit.

| Inventory place ID | Venue | Current overlay and audit notes |
|---|---|---|
| `ChIJvRBCrN9-54gRGZuuaCLGrQE` | Universal Orlando Resort | Ticketed only; operator ticket announcement is the source. No age or indoor claim. |
| `ChIJdd8VlMN-54gRoaU0d_zYhfk` | Universal Studios Florida | Ticketed only; same operator source. |
| `ChIJvRBCrN9-54gR84ltVW4FZBM` | Universal Islands of Adventure | Ticketed only; same operator source. |
| `ChIJa7bjTAB_54gR-M-m-KIOCP0` | Universal Epic Universe | Ticketed only; same operator source. |
| `ChIJCXAq5_DEwogRjTPE2xlsZtE` | The Florida Aquarium | Ticketed, with the animals rail identity; operator ticket page is the source. |
| `ChIJ73yw37J954gRDwQad4ih7Wk` | Crayola Experience Orlando | Ticketed, half-day (FAQ recommends 3–4 hours), free mall parking, walk-up possible, and size-limited strollers. All-ages and indoor weather claims were withdrawn: the audited wording did not prove them. |
| `ChIJ-6lKAInEwogRVnf5NBtjZss` | Glazer Children's Museum | Visit page lists general admission, adjacent garage parking, and stroller parking. |
| `ChIJoVWX_Rm02YgRllHsIZGN16c` | Miami Children's Museum | All ages, indoor, ticketed, half-day, adjacent parking, hands-on/educational, and mixed-age/young-child composition. The heat-friendly claim was withdrawn. |
| `ChIJ2f1pZPkA2YgRw01q-hlXoTQ` | Museum of Discovery and Science | Visitor page lists ticket purchase and multiple nearby parking garages; its early-childhood STEM lab and science mission support educational identity, not an age-fit filter. |
| `ChIJab3yr6C22YgRdh8TY4oVu_w` | Frost Science | Ticketed, limited paid museum-garage parking, animals/indoor/space identities, and educational/animal-focused styles. The stroller-parking claim was withdrawn: the source describes vehicle spaces for stroller-permit holders. |
| `ChIJo2bql5B654gR_ITN9PGhBbU` | Orlando Science Center | Ticketed, first-come paid garage parking, stroller checkout with size guidance, indoor/space rail identities, and hands-on/educational styles. No indoor weather-fit claim remains. |
| `ChIJRdxzRk1-54gRJvqlZQbtpE4` | WonderWorks Orlando | Indoor, all ages, ticketed, half-day, garage parking, and height rules. The broader stroller-policy claim was withdrawn; the FAQ does mention elevators for wheelchairs and strollers, but the overlay leaves that filter unknown. |
| `ChIJiTHKxDOu4IgRgAU6btoqIsU` | Kennedy Space Center Visitor Complex | Ticketed, attractions/space identities, educational style. Parking and full-day duration were withdrawn; neither facet is currently asserted. |
| `ChIJFY7wCsjD2YgRn8R_2IMRjtw` | Zoo Miami | Ticketed, animals/outdoors identities, animal-focused/nature styles. The required-reservation claim was withdrawn. Age prices are not used as age-fit evidence. |
| `ChIJ5UOOwKux5YgRAmO1YNbhTc0` | Jacksonville Zoo and Botanical Gardens | Plan page says online tickets are required and lists paid general admission. Age prices are not used as age-fit evidence. |
| `ChIJ9RHZGx6H3YgRnWVYIWsHNPM` | Gatorland | Ticket page lists paid day admission, free parking, and says day admission reservations are not required. Age prices are not used as age-fit evidence. |
| `ChIJmToCpQ4J3YgRof6hhxcoTIM` | Bok Tower Gardens | Official admission page establishes ticketed garden entry and an outdoor garden/cultural-landmark identity. |
| `ChIJh8tXh-FBw4gR9kFzfZN_g60` | Siesta Beach | Outdoor, beach/outdoors/active identities, nature/active styles, and parking information stating 950 free spaces. The 2026-10-27 audit withdrew shaded and changing_facilities: false, reporting that the county lists changing rooms. |
| `ChIJ1WjNap1n54gRqNPBblOe5Pk` | PopStroke Orlando | Pending, not live: the exact Orlando page says “Opening Q4 2026.” Its default 2026-09-10 verification / 2026-10-10 expiry are deliberately unchanged, so all helper facts return null. |
| `ChIJpQ0d6taD3YgRkthjcpuq-x8` | Medieval Times Orlando | All ages, ticketed, free onsite parking, culture/food identities, show style, mixed-age composition. Indoor and quick-duration claims were withdrawn; no required-reservation boolean is asserted. |

## Known gaps

- This is a 20-entry seed with 19 live overlays and one pending entry, not statewide completeness. Places without an exact evidence row fall back to typed/name classification and cannot match evidence-only filters.
- Official pages often publish admission ages without an explicit recommended age. The overlay does not promote those price brackets into age fit. Age filters appear only where the venue explicitly describes the experience as suitable or designed for those ages.
- `free` is intentionally sparse. Free parking and free admission for babies do not make a venue generally free.
- No live overlay currently asserts shaded or heat-friendly. Shelters, indoor identity, and other nearby amenities do not automatically establish either filter.
- No duration value is synthesized from opening hours. Duration appears only when the venue supplies an itinerary or visit-time recommendation.
- PopStroke remains expired until a first-party source confirms that the exact Orlando venue is open; do not renew it solely to silence a pending-entry label.
- Revisit each live source before 2026-11-26 at 19:00 EST. The Command Center fuse tracks the latest audit batch, warns from 2026-11-24, and reports one pending entry in its label. Renew only entries actually reverified; price-sensitive facts remain reduced to `ticketed`.
