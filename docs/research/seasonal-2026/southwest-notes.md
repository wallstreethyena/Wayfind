# Sarasota / Manatee and Southwest seasonal hospitality research

Checked 2026-10-18. Deliverable: `southwest.json`. Repository was read-only. No Disney domain requests, paid APIs, or database writes.

## Counts and limitations

| Area | Distinct researched candidates | Confirmed 2026 or live current seasonal menu | Pending | Excluded | Shortage from 50 confirmed |
|---|---:|---:|---:|---:|---:|
| manatee-sarasota | 60 | 33 | 25 | 2 | 17 |
| southwest | 69 | 53 | 13 | 3 | 0 |

These are venue/concept counts, not dish counts. Distinct bars in an organizer-confirmed crawl are individual venues and explicitly labeled as crawl/party experiences. They are **not** represented as month-long décor takeovers. Multiple resort bars and activities count once per property; Agave Bandido and attached Maya count together; Seed and Bean Cape Coral was omitted because Venice already represents that concept. One local branch per ordinary multi-branch brand. All place_ids remain null for subsequent inventory/Places identity resolution. Some street addresses remain null rather than guessed. Source excerpts are concise paraphrases unless they are short menu/entity names.

Confirmed includes the actual 2026 season, including a few already-held events (Ankrolab Oct17, SweetBerries Sept30, Cooper's Hawk Oct18). Do not recommend those as upcoming. Live menu verification means the current venue/menu platform explicitly carries a seasonal section/item at audit time; it does not imply an unpublished launch/end date or guarantee daily stock.

Sarasota's target remains unmet. This is a substantial bounded research pass, **not a proven exhaustive census or saturation claim**. Do not relabel 60 candidates as 60 verified. Further fresh first-party follow-up is needed for the 25 held candidates and 17-place verified shortage.

## High-value corrections

- The Oasis official page now explicitly says Christmas Club opens November 18, **2026**; earlier repository rows held it pending.
- Official Miracle 2026 list verifies Tamiami Tap and Naples Coastal Kitchen participation, but local exact operating windows are not explicit there.
- Marriott direct calendar now establishes Ritz-Carlton Naples gingerbread house on Dec25 2026 and Tiburon Christmas Grand Buffet on Dec25 2026. Related property activities are combined in the same venue record.
- UTC's tempting Fall Food Guide is dated October4 **2024**. Those ten brand candidates remain pending, despite current copyright/navigation dates.
- Peculiar Pub, Agave/Maya and Good Liquid pages say **Friday October31**, indicating 2025 rather than 2026; all held pending.
- Motorworks Bradenton's later report says temporarily closed and hopes to reopen February1 2027. This supersedes earlier June reports that it would remain open. 3Keys closure is also excluded.
- Nice Guys syndicated Sonic Masquerade address conflicts with the actual Cape Coral venue. Held pending rather than inventing a Fort Myers branch.
- Sidney's rooftop Halloween page has a2026 banner and SaturdayOct31, but contest copy says2025. Held pending.
- VooDoo Hut and Napoli Coffee search collisions are Texas/NewMexico respectively, explicitly excluded rather than added as Florida venues.

## Research coverage and yield

The search axis covered Fall, Halloween and Christmas in Sarasota, Bradenton, Lakewood Ranch, Parrish, Longboat Key, Holmes/Bradenton Beach, Nokomis, Venice, Fort Myers, Fort Myers Beach, Cape Coral, Bonita Springs and Naples. Punta Gorda searches found civic light festivals and generic Christmas-open lists; those did not prove individual hospitality theming and were not padded into the list.

Discovery used system2 batches first, then system1 for official/year/date verification and gaps. Direct official menu, event and hotel pages were opened. Access failures were retained as pending where no fresh independent corroboration was found. System1 verification was also used for supplied Eventbrite leads when direct opens failed.

Auditable search sequence (representative literal query families and what they resolved):

1. Sarasota/Bradenton fall pumpkin coffee, Halloween restaurants, Christmas pop-up bars — found Tamiami Tap, Buddy Brew, current menus and old UTC roundup.
2. Fort Myers/Naples Christmas pop-up, Halloween cocktails, fall cafés — found Oasis2026, Margaritaville, SeedtoTable and Tap42.
3. Sarasota/Bradenton Christmas2026 and fall2026 menus — established UTC2024 and hotel2025 holds, did not falsely promote Christmas-open lists.
4. Sarasota2026 Halloween brewery/99Bottles/Calusa/BigTop and Bradenton Motorworks/3Keys/GoodLiquid — found current BigTop party,99Bottles and closure corrections; Calusa general page alone insufficient.
5. Naples/Bonita2026 Halloween brewery/Ceremony/Chartreuse — Ceremony2026 host verified; ordinary Chartreuse home description did not prove seasonal takeover.
6. Venice pumpkin café, holiday bar and Halloween2026 restaurant — CaféVenice, Seed&Bean and BackPorch; BackPorch year held.
7. Sarasota Hashtag/Joy/CROP/Bakehouse — current CROP and changed Bakehouse Halloween packs; Joy/Hashtag fresh fetch failure retained.
8. FortMyers/Cape pumpkin café/Chocolattes/GourmetLatte — secondary menus preserved pending; GreenCup current updateOct5 verified.
9. Broad 2026 Naples/FortMyers Halloween cocktail queries — restaurant-specific parties and hotel seasonal menus.
10. CapeCoral2026 Halloween food/drinks — discovered SCHEA's13th Spooktacular crawl; official organizer event listing and Oct15 CapeCoralBreeze source name14 venues. Added13 distinct concepts (omitted duplicate Seed&Bean brand), with actual drink samples where supplied. This materially raised Southwest yield.
11. FortMyers Halloween2026 organizer routes — PubCrawls and CrawlWithUS identify additional distinct local bars; overlapping BayStreet/Cowboy/Corral counted once.
12. LakewoodRanch and AMI Halloween2026 — several promising pages proved staleFridayOct31 and were held; TheFeast current six-course Halloween pairing dinner verified via restaurant association.
13. Sarasota/LongboatKey official Christmas2026 hotel menus — Lido and Zota verified; LongboatKeyClub explicitly2025 held.
14. Parrish current fall cafés — TuscanHills September2026 local report verified; Ryan's January2026 retrospective did not prove current fall availability.
15. Official Mademoiselle2026 DJseries — upgraded same venue to Halloween/Christmas party dates; did not count other branches.

## Useful primary/corroborating sources to inspect for downstream citation

- https://theoasisnaples.com/26523-2/
- https://www.miraclepopup.com/locations-2026
- https://baystreetyard.com/bay-street-yard-announces-lineup-of-halloween-festivities-2026/
- https://greencupcafe.com/menu/
- https://www.cropjuice.com/menus/
- https://sarasotabakehouse.com/
- https://www.opalcollection.com/lido-beach/restaurants/holiday-menus/menu/christmas/
- https://www.opalcollection.com/zota/restaurants/holiday-menus/menu/christmas/
- https://www.opalcollection.com/edgewater/restaurants/holiday-menus/menu/christmas/
- https://www.opalcollection.com/olde-naples-hotel/restaurants/holiday-dining/menu/christmas-2026-2/
- https://event.marriott.com/rswrz-the-ritz-carlton-naples/events/naples/christmas-coming-soon
- https://event.marriott.com/amp/rswgr-the-ritz-carlton-naples-tiburon/events/naples/christmas-coming-soon
- https://www.capecoralbreeze.com/news/local-news/2026/10/15/spooktacular-pub-crawl-business-trick-or-treat-return-to-the-south-cape-next-saturday/
- https://pubcrawls.com/tribe_events/fort-myers-halloween-bar-crawl/
- https://crawlwith.us/fortmyers/halloween/
- https://barcrawlusa.com/sarasota-halloween-bar-crawl-2026/
- https://www.mademoiselleparis.com/djnight
- https://eatlikealocal.com/event/the-feast-the-final-feast-6-course-dinner/

Validation: parsed JSON, checked required keys in every row, checked unique area+casefolded name tuples, and counted statuses by area. No product build/tests were necessary because this agent made no implementation changes.
