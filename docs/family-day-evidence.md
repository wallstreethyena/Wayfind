# Family-day evidence overlay

Verified 2026-09-10. Records expire 2026-10-10 and fail closed after that date. The deliberately short window reflects dynamic admission and reservation policies.

`lib/familyDayEvidence.js` contains 15 bounded overlays keyed by the exact `wf_inventory.place_id` returned by Supabase project `gbhtoehdxkzjsmmkisgu`. It does not create or admit venues. The family inventory classifier still controls eligibility and distance; the overlay only supplies facts that broad Google metadata cannot prove.

## Contract

`familyFilterFacts(placeId)` returns `null` for an unknown or expired ID. Otherwise it returns only allowlisted values:

- `ages`: `baby`, `toddler`, `kid`, `tween`, `teen`, `all-ages`
- `weather_fit`: `indoor`, `outdoor`, `heat-friendly`, `shaded`
- `cost`: `free`, `ticketed`
- `duration_recommendation`: `quick`, `half-day`, `full-day`
- `parking` and `reservation_required`: booleans only when the source is explicit
- `stroller`, `stroller_parking`, `changing_facilities`, and `height_restrictions`: booleans only when explicitly documented, with bounded notes where useful
- `rail_types`: the ten family rails (`beach`, `attractions`, `water`, `animals`, `outdoors`, `indoor`, `space`, `active`, `culture`, `food`)
- `style`: `hands-on`, `educational`, `animal-focused`, `nature`, `show`, `active`
- `composition`: `mixed-ages`, `young-children`, `older-kids`
- `verifiedAt`, `expiresAt`, and first-party `sources`

The helper also rejects malformed dates, future verification dates, expiry at or before verification, non-finite clocks, and records with no valid HTTPS source.

Unknown facts are omitted. `ticketed` means general entry is sold; it does not imply a price band. `reservation_required: true` is used only where the official venue flow requires dated or online admission. A recommendation to reserve is not treated as a requirement. The module contains no live prices, hours, ratings, reviews, photos, phone numbers, or addresses.

## Coverage

The set covers all ten rail types across Orlando, Tampa, Miami, Fort Lauderdale, Jacksonville, Sarasota, and Central Florida. It includes children's museums, science centers, zoos, a beach, gardens, animal parks, mini golf, and family dinner theater. Several venues legitimately cover more than one rail.

Every source is the venue's own site or, for Siesta Beach, Sarasota County's official parks site. No Disney page or reservation endpoint was requested. Disney venues are deliberately absent because automated Disney-domain requests are prohibited by `AGENTS.md`.

## Evidence notes by exact inventory identity

These are field-level paraphrases for review; the linked pages remain the source of record.

| Inventory place ID | Venue | Supported assertions |
|---|---|---|
| `ChIJ73yw37J954gRDwQad4ih7Wk` | Crayola Experience Orlando | FAQ says all ages, describes activities inside the attraction, recommends 3–4 hours, lists paid admission, free mall parking, no required reservation, and permits size-limited strollers. |
| `ChIJ-6lKAInEwogRVnf5NBtjZss` | Glazer Children's Museum | Visit page lists general admission, adjacent garage parking, and stroller parking. |
| `ChIJoVWX_Rm02YgRllHsIZGN16c` | Miami Children's Museum | Visit FAQ says designed for all ages, calls it an indoor rainy/hot-day activity, gives a 2–4 hour visit, and lists the adjacent paid lot. |
| `ChIJ2f1pZPkA2YgRw01q-hlXoTQ` | Museum of Discovery and Science | Visitor page lists ticket purchase and multiple nearby parking garages; its early-childhood STEM lab and science mission support educational identity, not an age-fit filter. |
| `ChIJab3yr6C22YgRdh8TY4oVu_w` | Frost Science | Plan page says admission includes museum exhibitions, aquarium, and planetarium, lists paid tickets and onsite parking, and identifies baby-stroller parking. |
| `ChIJo2bql5B654gR_ITN9PGhBbU` | Orlando Science Center | Visit page lists paid admission, four indoor exhibit floors, hands-on science activities, onsite parking, and stroller checkout with size guidance. |
| `ChIJRdxzRk1-54gRJvqlZQbtpE4` | WonderWorks Orlando | FAQ explicitly says indoor and all ages, recommends 3–4 hours, identifies garage parking and stroller access, and lists height limits for several rides. Ticket page establishes paid admission. |
| `ChIJiTHKxDOu4IgRgAU6btoqIsU` | Kennedy Space Center Visitor Complex | Official plan page links paid admission, parking guidance, and authored half-day, one-day, and two-day itineraries; the overlay chooses the one-day/full-day facet. |
| `ChIJFY7wCsjD2YgRn8R_2IMRjtw` | Zoo Miami | Official store lists paid admission and requires selection of a visit date. Age prices are not used as age-fit evidence. |
| `ChIJ5UOOwKux5YgRAmO1YNbhTc0` | Jacksonville Zoo and Botanical Gardens | Plan page says online tickets are required and lists paid general admission. Age prices are not used as age-fit evidence. |
| `ChIJ9RHZGx6H3YgRnWVYIWsHNPM` | Gatorland | Ticket page lists paid day admission, free parking, and says day admission reservations are not required. Age prices are not used as age-fit evidence. |
| `ChIJmToCpQ4J3YgRof6hhxcoTIM` | Bok Tower Gardens | Official admission page establishes ticketed garden entry and an outdoor garden/cultural-landmark identity. |
| `ChIJh8tXh-FBw4gR9kFzfZN_g60` | Siesta Beach | County page identifies the beach, shaded playground, shelters, sports amenities, 950 free parking spaces, and the absence of dedicated changing rooms. |
| `ChIJ1WjNap1n54gRqNPBblOe5Pk` | PopStroke Orlando | Exact Orlando venue page identifies mini golf, food, and family entertainment. It did not expose enough stable planning detail for cost, duration, parking, or reservation facts. |
| `ChIJpQ0d6taD3YgRkthjcpuq-x8` | Medieval Times Orlando | Orlando and FAQ pages say family-friendly/all ages, indoor and climate-controlled, ticketed, about 90 minutes to two hours, with free onsite parking. Reservations are recommended, so no required-reservation boolean is asserted. |

## Known gaps

- This is a 15-place seed, not statewide completeness. Places without an exact evidence row fall back to typed/name classification and cannot match evidence-only filters.
- Official pages often publish admission ages without an explicit recommended age. The overlay does not promote those price brackets into age fit. Age filters appear only where the venue explicitly describes the experience as suitable or designed for those ages.
- `free` is intentionally sparse. Free parking and free admission for babies do not make a venue generally free.
- Shade evidence is intentionally limited to Siesta Beach, whose county page explicitly lists a shaded playground and shelters. Shade is not promoted into a heat-safety claim.
- No duration value is synthesized from opening hours. Duration appears only when the venue supplies an itinerary or visit-time recommendation.
- PopStroke evidence is limited to family entertainment, miniature golf, food, and its exact Orlando venue page; its page did not expose enough stable planning detail to support cost, duration, parking, or reservations.
- Reverification should revisit each source before 2026-10-10. Price-sensitive facts are reduced to `ticketed`, but operating and reservation policies can still change.
