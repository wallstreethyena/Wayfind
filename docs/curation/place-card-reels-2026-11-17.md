# Place-card reel intake, November 17, 2026

Gabriel supplied five exact reel links and caption screenshots, then asked to add all places to Wayfind with the videos on the place cards. This change uses the existing creator-video registry and official Instagram click-to-load player. It does not create standalone video cards or ingest third-party posts as Wayfind-owned media.

| Native reel | Credited source | Exact place identity | Treatment |
| --- | --- | --- | --- |
| Df2GKFJhmZf | stufftodointampabay | wfadd_santoros_pizzeria_tampa | Existing Santoro's card, preserving the prior foodiejustice reel |
| DfxspoqJhjz | thesailtampa | ChIJM605C43EwogRiqZSZufgi_8 | The Sail Plaza's own tree-lighting preview |
| DflMvxbOUj2 | adventureswithdani13 | ChIJwZ_GK-d-54gRm5Ahg7PZYeY | Seasonal Red Coconut Club footage, no schedule/theme claim |
| Dfu4j3ij0V5 | walruscarpkirk | ChIJwZ_GK-d-54gRm5Ahg7PZYeY | Explicit past-season Santa versus Krampus footage |
| Df07nX-qaUZ | nadiareviews904 | ChIJhWCYaL4n5IgRhwgdf5lIGbc | Coffee House in a hosted three-business holiday roundup |
| Df07nX-qaUZ | nadiareviews904 | wfadd_bens_soft_pretzels_st_augustine | Ben's in the same shared roundup |
| Df07nX-qaUZ | nadiareviews904 | wfadd_mimis_famous_crepes_st_augustine | Mimi's in the same shared roundup |

The native route for each row is https://www.instagram.com/reel/ followed by its exact shortcode and a trailing slash. Five distinct posts form seven associations across six place cards. The supplied screenshots establish the author and named places. The reels were not downloaded, rehosted or scraped.

## Verified identities and seasonal boundaries

- Santoro's Pizzeria: 1329 W Cass St, Tampa, FL 33606, confirmed by https://www.santorospizzeria.com/ and its official Toast ordering menu.
- The Sail Plaza: 333 S Franklin St, Tampa, FL 33602, confirmed by https://www.tampa.gov/tcc/the-sail . Organizer confirms November 29, 2026, 5 PM to 8 PM with December 4 rain date: https://thetampariverwalk.com/events/holiday-harbour-tree-lighting.html . The video caption does not carry a durable current-date claim.
- Red Coconut Club: 6000 Universal Boulevard, Orlando, FL 32819. Existing exact inventory ID and registry entry reused. Official 2026 theme is Haus Noël, per https://media.universalparksusa.com/press-releases/universal-orlando-resort-kicks-off-its-destination-wide-holidaycelebration-trade-111126/ . The Santa versus Krampus sign says Wednesday November 20, which is not November 20, 2026. That post is retained as past-season footage on the base venue, never as current event footage or a Christmas-season recommendation.
- St. Augustine Coffee House: 6 St. George St, Suite 107, St. Augustine, FL 32084, confirmed by https://www.staugcoffee.com/contact .
- Ben's Soft Pretzels and Mimi's Famous Crepes are both at 54 St. George St, St. Augustine, FL 32084, confirmed by https://www.benspretzels.com/locations and https://www.mimisfamouscrepes.com/ . The screenshot's 52 for Ben's is corrected.
- The destination tourism board lists the shared Secret Garden holiday pop-up November 21, 2026 to January 18, 2027: https://www.floridashistoriccoast.com/events/winter-wonderland-in-st-augustines-secret-garden/ . This reel names three businesses; every place caption explicitly says roundup.

The Sail's venue-owned account, UNATION regional discovery publisher stufftodointampabay, and nadiareviews904's explicitly hosted VIP preview are display-only for independent corroboration. Existing creator-score policy remains unchanged.

The intake coordinator inserted and re-read the two new St. Augustine inventory records on November 17, 2026 with the exact Wayfind-owned IDs listed above. Both use the official 54 St. George Street address and an exact Census address-geocoder match at 29.895993071303, -81.313231452442, with address-interpolated provenance. This source change itself does not write production data.

## Verification

The exact-place resolver must return each requested native URL once with the credited handle, retain existing videos, and never transfer the shared St. Augustine post to unrelated place cards. Each of the seven associations has original Wayfind caption copy and an official native embed path. Existing creator registry, rights, independence, playback, taxonomy and lean/full equivalence checks are used.

## Production inventory receipt

The coordinating lane inserted and re-read two missing operational business rows, insert-only, with official identity/address sources and Census address-interpolated coordinates: wfadd_bens_soft_pretzels_st_augustine and wfadd_mimis_famous_crepes_st_augustine. No existing business data was overwritten.

It also inserted the officially dated shared event winter-wonderland-st-augustine-secret-garden-2026 for November 21, 2026 through January 18, 2027, linked to the Ben's place ID at 54 St. George Street. Source: https://www.floridashistoriccoast.com/events/winter-wonderland-in-st-augustines-secret-garden/ . Admission is free; opening hours were left unset because the official listing does not provide them. The three-business reel is attached to the businesses, not misrepresented as a dedicated single-event video.

The existing Frontyard DB twin now points to the current official /frontyard-holiday-festival-n1xf URL and the existing Dr. Phillips venue ID ChIJ-7QCIgJ754gRcfF7EG3N1Xs. Its selected-night flag is true; variable opening/closing clocks remain unset. Current Winter Garden DB twin pins already match City Hall at 300 W. Plant Street and were preserved.

Live inspection of the new Secret Garden event exposed a pre-existing cross-year date-label defect: its true January 18, 2027 end date rendered as January 2026. The shared date-range formatter now names both years for a cross-year span, and the event page does not append the start year again. Existing same-year formatting is preserved; regression cases cover this exact season and a same-month cross-year span.

## Release validation

On the settled source, Node 22.23.5 and the lockfile-installed Next 15.5.28: all 1,171 guards plus the suite's credentialed re-run passed; JSX checks and a production Next build passed. The built-bundle check passed and the built Christmas research check passed 1,392 assertions, including the production client-chunk sweep. Exact resolver probes verified seven requested associations, original credits, existing-video preservation and unrelated-place negative controls. A separate read-only integration review accepted the changes. Production video-player verification follows deployment.
