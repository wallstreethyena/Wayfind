# October 21, 2026 event verification

Published data operation: 15 reviewed event rows inserted; 1 existing Fruitville Grove admission record corrected to paid ($5 minimum). Reviewed publication rows and their primary-source evidence are recorded in `2026-10-21-trend-event-publication.json`. No credentials are included.

The provider corrections are exact ID + date rules in `lib/eventStartRefresh.js`. Organizer pages read October 21 establish:

- CAKE, October 23, 8:30 PM, is at The BayCare Sound, not Ruth Eckerd Hall. The BayCare venue coordinates accompany the venue correction so directions agree. Source: https://www.rutheckerdhall.com/events/detail/cake
- Both Ticketmaster variants of Jake Owen, October 22, start at 6:30 PM and use the exact BayCare venue coordinates. Source: https://www.rutheckerdhall.com/events/detail/jake-owen
- Tampa Halloween Indie Night, October 23, has doors at 5:30 PM and show at 6:30 PM. Source: https://www.theritzybor.com/event/halloweenindienight2026/
- Mangrove Murders, October 24: family paddle 6:00–7:30 PM (check-in 5:40 PM); adult 18+ paddle 8:30–10:00 PM (check-in 8:10 PM). Separate IDs and series identities preserve both sessions through the existing deduplication rules. Source: https://annamariaislandchamber.org/event/something-is-beneath-the-water-legend-of-the-mangrove-murders-ami-paddleboard-and-kayak-adventures/
- Nightmare on Franklin Street: October 24 includes KPop Demon Hunters at 3:00 PM and The Rocky Horror Picture Show at 7:00 PM and 11:00 PM. The old Burnt Offerings claim was removed from the umbrella listing. Source: https://tampatheatre.org/movie-categories/nightmare/

Provider facts previously passed through unchanged; refreshing the same provider could repeat the wrong fact. Corrections now run before provider validation/deduplication/geographic filtering and after cached-start refresh, with the event detail page sharing the same correction function. No ranking rules, photo identities, or unrelated venue coordinates change. Registry edits and the dated database seed version retire the old merged feed cache keys.

Regression guard: `scripts/test-event-source-corrections-20261021.mjs`, registered in `scripts/guards.txt`. It executes the actual Ticketmaster adapter with frozen provider input, exercises post-refresh correction, tests exact-date/ID controls, and proves two paddle sessions survive static/database merging with event photos retained. The existing seasonal rail guard also covers the new adult session.
