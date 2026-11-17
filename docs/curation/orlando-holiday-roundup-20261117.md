# Holiday roundup verification, November 17, 2026

Owner mission: publish the supplied discoveries on Wayfind and attach the supplied matching creator reels. This receipt covers the existing Orlando holiday identities and the corrected Sail kickoff. The original six-item Orlando roundup has no supplied reel URL, so no video attachment is invented.

## Identity and publication decisions

| Screenshot item | Existing identity | Decision |
| --- | --- | --- |
| Frontyard Holiday Festival | frontyard-holiday-festival-2026 | Preserve existing season; enumerate open nights and add current visit details |
| Now Snowing, Celebration | celebration-now-snowing-2026 | Correct final night to December 31, free conditions and snow times |
| Oh, What Fun!, Lake Nona | lake-nona-oh-what-fun-2026 | Publish nine selected nights, free general admission and the municipal event pin |
| Eola Wonderland tree show | lights-at-lake-eola-2026 | Promote the existing watchlist identity after city confirmation; keep the separate single-night kickoff |
| Tis the Season, Winter Garden | winter-garden-light-up-2026 and winter-garden-light-show-2026 | Preserve distinct kickoff and selected-night light show; use the address-matched City Hall anchor |
| Disney Springs Tree Stroll | disney-springs-christmas-tree-stroll-2026 | Preserve already-corrected dates; add address and parking |
| Riverwalk Tree Lighting | tampa-riverwalk-holiday-harbour-tree-lighting-2026 | Correct organizer hours to 5 to 8 PM and preserve the contingency rain date |

## Primary evidence

- Frontyard: https://www.drphillipscenter.org/frontyard-holiday-festival-n1xf
  Current festival page confirms November 27 to December 31, weekday/weekend hours and closed nights. General admission is free; food, drinks, gifts, private fire pits and indoor shows are separate purchases. Its FAQ names the paid South Street garage. Open dates are enumerated so Monday/Tuesday closures do not become daily availability.
- Celebration: https://celebrationtowncenter.com/events/now-snowing-nightly-2026
  Season prose ends December 31, despite a bottom calendar field saying January 1. Use the final advertised night. Free admission and public parking do not include rides, skating or Santa photo packages.
  Address and opening-night meeting point: https://celebrationtowncenter.com/events/tree-lighting-ceremony-2026
  Event sponsor confirms the four nightly snow times: https://www.experiencekissimmee.com/event/now-snowing-nightly/32042
- Lake Nona: https://www.ohwhatfunlakenona.com/ and https://www.ohwhatfunlakenona.com/calendar
  Main festival runs Fridays through Sundays, December 4 to 20. General attendance is non-ticketed; Santa's Cottage is a separate paid reservation.
  Admission and garage details: https://www.ohwhatfunlakenona.com/faqs
  City location map: https://www.orlando.gov/Events/Oh-What-Fun-Holiday-Festival
  The municipal event point is 28.37226315749207, -81.27906985580312 at 6955 Lake Nona Boulevard. The old research point was materially northeast of the event. Calendar and city list 5 to 10 PM while the FAQ also says Sunday closes at 9 PM; publish only the consistent 5 PM start as a fixed time. Snowfall wording also varies, so no exact frequency is promised.
- Eola: https://www.orlando.gov/Events/Eola-Wonderland-Christmas-Tree-Show-2026
  The city lists nightly shows December 4 through January 6 at 5:45, 6:45, 7:45, 8:45 and 9:45 PM. Event window ends at 10 PM. Free. Tree location is the Washington/Rosalind intersection, municipal map point 28.545021, -81.372856. The old broad watchlist copy mentioned an unsupported fountain and Eola House schedule; the promoted row describes only the verified tree show.
- Winter Garden: https://www.wgfl.gov/925/Tis-the-Season-2026-Event-Schedule
  Kickoff December 4, 6 to 9 PM, lighting at 6:15 PM at City Hall, 300 W. Plant Street. The broader program includes separate ticketed activities and is not one daily staffed event.
  Selected light show: https://www.wgfl.gov/915/A-Merry-Winter-Garden-Light-Show-2026
  Both records use the current, address-matched wf_events City Hall anchor 28.56503784, -81.58908354 rather than the old generic downtown pin. This reuses existing owned coordinates; it is not a newly purchased geocode.
  Public parking: https://wgfl.gov/322/Winter-Garden-Farmers-Market confirms free downtown parking and the 160 S. Boyd Street garage.
- Disney Springs: https://www.disneysprings.com/?direct=true confirms the holiday season November 11 to January 3 and the venue address through indexed current official content. Existing exact Tree Stroll dates were already corrected in the research override and are retained.
  Parking: https://www.disneysprings.com/visit/ confirms complimentary self-parking and arrival guidance. No Disney reservation endpoint or disneyworld.disney.go.com page was requested for these edits.
- Sail: https://thetampariverwalk.com/events/holiday-harbour-tree-lighting.html
  Current organizer page confirms November 29, 5 to 8 PM at Tampa Convention Center and The Sail Plaza; December 4 is the rain contingency. Existing Sail identity and coordinates were verified by the coordinating lane. The update does not infer new admission terms from an absent organizer price.

## Data-model limits

Updates live in lib/christmasResearchUpdates2026.js and overlay the existing research packet. No duplicate source IDs were added. The ordinary research merge preserves a nonempty database address, official URL or coordinate; the coordinating lane handles required DB-twin corrections through the reviewed migration path. Root coordinates cache invalidation, integration tests, production rollout and browser verification.


## Focused verification

- Syntax check of lib/christmasResearchUpdates2026.js: passed.
- Existing check-christmas-research.mjs: passed 1,391 assertions, executing the merge, 579 cards, browse, event-page loader and composer for 17 cities against 850 research rows. No production build was present for the optional production chunk sweep at this stage.
- Real exported-corpus assertions passed: exactly one promoted Eola nightly identity; distinct kickoff preserved; nine Lake Nona nights; 27 Frontyard nights excluding closures; 11 Winter Garden light-show nights; corrected snow season; Sail 5 to 8 PM and rain contingency; existing Disney dates preserved; all eight rows have addresses.
- The Christmas API cache identity advances from v15 to v16 so prior schedule, pin and watchlist payloads cannot survive the deploy. Exact cache-version expectations in the two relevant existing guards advance with it, retaining exclusion of previous versions.
- Full integrated suite and production verification remain the coordinating lane's responsibility.
