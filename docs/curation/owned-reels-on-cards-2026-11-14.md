# Wayfind's own posts on the business cards, 2026-11-14

Owner, 2026-11-14: "I asked you to add my videos to place card on gowayfind but not as its own card. I want the business place card and our video there as an influencer ourselves."

The 2026-11-12 "Seen on Wayfind" shelf showed each @gowayfind.app post as a card of its own under Trending. It is removed. Each post that features one business now plays on that business's place card (lib/creatorVideos.js) and, where it has one, its event card (lib/eventSocial.js), credited @gowayfind.app exactly like a creator Reel. Our own posts never raise the Wayfind Score and never count as independent corroboration (lib/creatorIndependence.js).

Rows come from `wf_owned_social` (read 2026-11-14). Place IDs are live `wf_inventory` rows; event IDs are the `wf_events.event_id` behind each `/florida-events/<slug>` link. Nothing was guessed.

| Post | What it features | Place card | Event card |
|---|---|---|---|
| reel/DfpQw4pB6Bq | Spirit Christmas, Clearwater | wfadd_spirit_christmas_clearwater | none |
| reel/DfiitL9p2Uc | Robert's Christmas Wonderland | ChIJYybWKcrvwogRT8I06QALhdI | roberts-christmas-wonderland-2026 |
| p/DfOGiw9jFdZ | Snowcat Ridge snow day map | ChIJF05ORfWpwogRI74PwJotNf4 (existing entry) | snowcat-ridge-2026 |
| reel/DfdbJ10Jzgy | Sarasota Medieval Fair survival guide | ChIJS2qQ6sw1w4gRUJfWmSdAvXE | sarasota-medieval-fair-2026 |
| reel/DfbH0CYMCLl | Sarasota Medieval Fair ultimate guide | ChIJS2qQ6sw1w4gRUJfWmSdAvXE | sarasota-medieval-fair-2026 |
| p/DflkQYilr5t | Siesta Key Crystal Classic (the Reel twin blocks embedding) | none | crystal-classic-2026 |
| reel/DdxDxKeD-UN | Ryan's Coffee House, Parrish | ChIJo_IdHf0lw4gRHDbQNKBRE84 | none |
| reel/DdUinjYJEYr | Tampa Golf Cart Tour | ChIJmTBndrPFwogRQgwCuMP3myY | none |
| reel/DdEkeo9Bkhk | Clear kayak, Shell Key Preserve | ChIJk04qcKEdw4gRHykY4WhCYBI (Get Up and Go Kayaking, Shell Key) | none |
| reel/DfsjmNMycZd | Rreal Tacos Christmas decor, Downtown Tampa (ingested 2026-11-14) | rreal-tacos-downtown-tampa (existing entry, name + city) | none |
| reel/DfuuG8_hPy5 | Christmas Town at Busch Gardens after dark (ingested 2026-11-14; added 2026-11-16 after owned-social-reconcile missing=1) | ChIJhRo4DU_GwogRUgjhMAj-pag (Busch Gardens Tampa Bay) | christmas-town-2026 |

Live posts that feature one business but sit on no card, with the reason (lib/ownedSocialCards.js):

- reel/DdxKo_3FZT3 Selah Sweets: no Wayfind place yet.
- reel/DdFIXRQp0XZ Skyway sunset cruise: the post does not name the operator.
- reel/DfXzL5-JU1U Disney World Christmas free vs paid: several parks.
- reel/Dfi0zeMMDwD Orlando Christmas itinerary: a multi stop plan.

Roundups of several places (weekend plans, city lists) have no single business card and are accounted for as such. `/api/cron/owned-social` goes red when a live post that features one business is on no card and has no recorded reason.
