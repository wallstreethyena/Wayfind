# Disney snack posts on place cards, November 17, 2026

Owner mission: add the supplied discoveries and their original Instagram posts to the correct Wayfind place cards. The owner added the DFB croissant carousel during this intake. This is seven source posts across six destination identities, not seven new businesses.

## Reviewed mapping

| Source | Credit | Destination | Identity |
| --- | --- | --- | --- |
| https://www.instagram.com/reel/Df0RuViBhqM/ | @disneyforfoodies | Epic Eats, Hollywood Studios | ChIJf_IRFQF_3YgRUPFD9siNgNQ |
| https://www.instagram.com/reel/DfxDaQCy_ml/ | @disneyforfoodies | Terra Treats, Animal Kingdom | ChIJ-xEZigN_3YgR2hvSuNZAtMo |
| https://www.instagram.com/reel/DfsDityRb5p/ | @disneyforfoodies | Santa's Holiday Grove, on the Animal Kingdom host card | ChIJ_eH9PaOB3YgRuz8jIkYEODQ |
| https://www.instagram.com/reel/Dfpk_VShWel/ | @disneyforfoodies | The Cookie Bar at Summer House on the Lake | ChIJ75oRQgB_3YgREd2CFWk3pgI |
| https://www.instagram.com/reel/DfnRYDbBOxM/ | @disneyforfoodies | San Angel Inn Restaurante, EPCOT | ChIJhUcstKV_3YgRbdpKlF8OIa8 |
| https://www.instagram.com/reel/DfSXkAZyMLY/ | @disneyforfoodies | Main Street Confectionery, Magic Kingdom | ChIJBVIDXZ-A54gRbNhylAVgWYo |
| https://www.instagram.com/p/DfutR5Fmrxt/ | @disneyfoodblog | Santa's Holiday Grove, on the Animal Kingdom host card | ChIJ_eH9PaOB3YgRuz8jIkYEODQ |

The Cookie Bar is an existing separate identity, not Summer House restaurant ChIJb6B8uZx_3YgRjEUVK2NK1wE. The Animal Kingdom coordinates are the host park's existing pin, not a surveyed pop-up counter location. Both host-card captions explicitly name Santa's Holiday Grove near Theater in the Wild. No permanent pop-up listing or current event occurrence is invented.

## Location evidence

Four permanent venues were absent from production inventory on November 17. Their exact Google Maps listing, street address, parent park, and venue point were inspected in the browser. The observed Google feature identifiers were encoded into the standard Place ID form, then independently reopened with `query_place_id` and an unrelated fallback `query=0,0`. All four opened the intended named establishment, rather than the fallback point.

| Venue | Point | Address | Observed Google feature |
| --- | --- | --- | --- |
| Epic Eats | 28.3565864, -81.5589124 | 351 S Studio Dr, Lake Buena Vista, FL 32830 | 0x88dd7f011511f27f:0xd4808dc8f643f150 |
| Terra Treats | 28.3580125, -81.5915609 | 2901 Osceola Pkwy, Lake Buena Vista, FL 32830 | 0x88dd7f038a1911fb:0xcab440d6b8d21bda |
| San Angel Inn Restaurante | 28.3717712, -81.5468074 | 200 Epcot Center Dr, Lake Buena Vista, FL 32830 | 0x88dd7fa5b42c4785:0xaf210e5f944ada6d |
| Main Street Confectionery | 28.4171015, -81.581072 | 1180 Seven Seas Drive, Lake Buena Vista, FL 32830 | 0x88e7809f5d035205:0x8a5960059472d86c |

Canonical validation URLs:

- https://www.google.com/maps/search/?api=1&query=0%2C0&query_place_id=ChIJf_IRFQF_3YgRUPFD9siNgNQ
- https://www.google.com/maps/search/?api=1&query=0%2C0&query_place_id=ChIJ-xEZigN_3YgR2hvSuNZAtMo
- https://www.google.com/maps/search/?api=1&query=0%2C0&query_place_id=ChIJhUcstKV_3YgRbdpKlF8OIa8
- https://www.google.com/maps/search/?api=1&query=0%2C0&query_place_id=ChIJBVIDXZ-A54gRbNhylAVgWYo

Google-derived coordinates and address fields retain their Google provenance and existing refresh clock. They are not added to `independent_coords`. No ratings, review counts, hours, admission prices, or licensed photos are seeded. The inventory addition is insert-only and does not update or unexclude existing records.

## Content evidence and limits

The six DisneyForFoodies screenshots identify the source, dish, and venue. The new DFB carousel's native caption was read publicly and identifies Animal Kingdom's Treat Stand plus the Chocolate Tree and Santa Hat Croissants. Its canonical `/p/` URL is preserved; it is not represented as a reel.

Official menu evidence was checked through Disney Parks Blog, without requests to the Disney World website, My Disney Experience, or reservation endpoints:

- https://disneyparksblog.com/wdw/foodie-guide-to-disney-jollywood-nights/ confirms Epic Eats' cookie butter beignets and the separately ticketed event context.
- https://disneyparksblog.com/wdw/disney-eats-foodie-guide-to-holidays-at-walt-disney-world-resort/ confirms the Reindeer Sundae, the Grove sandwich and croissant pair, and both Confectionery popcorn mixes. The Grove is near Theater in the Wild.
- https://www.summerhouserestaurants.com/disney-springs/menus/ confirms the Disney Springs business, but the inspected menu did not independently confirm this particular sundae. Its description remains attributed to the creator.

Prices and daily hours in the screenshots were not independently confirmed and are not published as current menu promises. The margarita's recipe, price, end date, and later availability at La Hacienda remain creator-reported; its caption asks readers to check the current menu. The official croissant filling description differs from DFB's tree-croissant description, so no filling is asserted. Seasonal footage is not a promise of current stock. Every in-park caption states the admission requirement; Epic Eats also states that regular park admission does not include Jollywood Nights.

## Execution and acceptance

Source verification, card integration, and independent Astra acceptance review are separate lanes. Jev tools are not exposed in this session; no Jev judgment is claimed.

- Existing card components, embed player, creator classifications, scoring rules, refresh policy, and photo-consent rules are preserved.
- Only native Instagram links are added; creator media and thumbnails are not downloaded or rehosted.
- Focused resolver checks passed for all seven source/creator/caption associations, the full and lean registries, wrong-park controls, and Cookie Bar versus restaurant separation.
- The existing freshness, equivalence, corroboration, taxonomy, independence, score, boost, and in-app-player checks passed.
- Production data, release, and visible card verification remain pending until their actual receipts are recorded below.
