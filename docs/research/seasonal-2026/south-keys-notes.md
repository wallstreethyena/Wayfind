# South Florida and Keys seasonal hospitality research

Checked 2026-10-18. Scope: Miami-Dade, Broward, Palm Beach County, Monroe/Florida Keys. Dataset: `south-keys.json`. No product files were edited and no paid API was used.

## Measured coverage and shortfalls

| Area | Confirmed 2026 or verified permanent | Pending 2026 | Excluded | Strong decor/menu/permanent category within confirmed | Shortfall to 50 broad confirmed venues |
|---|---:|---:|---:|---:|---:|
| Miami-Dade | 38 | 3 | 1 | 26 | 12 |
| Broward | 22 | 1 | 2 | 12 | 28 |
| Palm Beach | 24 | 2 | 0 | 11 | 26 |
| Keys | 41 | 1 | 4 | 2 | 9 |

139 records total. The broad confirmed total is **125**, including costume parties, festival dinners and crawl hubs. It is not 125 Halloween-decorated/themed-menu bars. Exactly 51 records use decorated_bar, themed_food_drink or permanent_theme and confirmed/permanent status; even these need normal address/Place-ID resolution before shipping. No territory reached 50. This was a bounded research sweep, not an exhaustive census or proof that additional venues do not exist.

The Keys count is overwhelmingly official **Fantasy Fest 2026** hospitality events, with distinct venues counted once. This festival runs October 16–25, rather than Halloween weekend. Musical-icon, pirate, disco, tutu, plaid and adult pool parties establish a genuine costume-festival connection, but do not prove spooky decor or special menus. Filter `experience: party` if the product rail is meant exclusively for immersive decorated bars and explicitly themed food/drink. Some events are adults-only or restricted to hotel guests; notes preserve known restrictions.

## Evidence policy

- All records contain an actual retrieved source URL, status, source type, check date, concise evidence paraphrase, and notes.
- `evidence_excerpt` is a short factual paraphrase, not a verbatim quotation.
- `confirmed_2026` includes current dated local reporting and operator-managed booking pages; it is not a claim that every record has primary-source corroboration.
- An explicit annual partner listing confirms the **2026 season**, with start/end null when local dates are unannounced. Casa Tiki, The Shorely, Novecento Delray and Second Rodeo were checked on official 2026 operator location pages.
- A crawl stop counts only as a party. Ordinary live music on Halloween was omitted unless a costume contest, themed party, themed food/drink or actual transformation was documented.
- One brand per area is represented for multi-branch cafe/restaurant groups. No individual dishes, hotel dining outlets, or repeated festival events are counted as separate venues.
- Existing Place IDs were reused only for unambiguous Shorely and Second Rodeo identities. Pura Vida's existing fallPool ID was deliberately left unassigned to the new generic Miami brand record until branch/address identity can be proven. No identifiers were invented.
- Addresses remain null when retrieved evidence did not establish them. These rows are research, not map-ready inventory.
- Mixed seasons require care: Casa Marina has individually evidenced Halloween, Thanksgiving and Christmas programming; JohnMartin's has confirmed Halloween but its Christmas portion remains pending; Standard Spa has Halloween party plus separately reported fall drink. Read notes rather than treating the single status as independent confirmation of every season.

## Strongest current source families

1. Official Fantasy Fest 2026 schedule: https://www.fantasyfest.com/schedule/ . Supplies confirmed Keys dates, venue addresses and food/drink/party specifics. Source heading explicitly says 2026. New Smokin’ Tuna at 313 Duval was upgraded from folklore-only to an actual Oct24 parade dinner party.
2. Greater Fort Lauderdale tourism: https://www.visitlauderdale.com/blog/stories/post/best-halloween-bars-restaurants/ . Dated Oct14 2026. Current menus/transforms at Wicked Bread, No Man's Land, Rosalia's, Whiskey Neat, RM901, Hidden Speakeasy, MAASS, W Living Room, Nubé, Rooftop1WLO, Wilder and Rhythm & Vine. Hogwharf Oct9–11 was excluded as expired.
3. Official downtown West Palm DDA: https://downtownwpb.com/halloween/ . Dated Oct9 2026. Roxy's, Treehouse, Respectable Street, Camelot, Forget Me Not and Locals Only.
4. Official 2026 Christmas partners: https://www.miraclepopup.com/locations-2026 and https://www.sippinsantapopup.com/locations-2026 . Current season confirmed; local dates not fabricated.
5. Miami tourism official calendar: Sylvester Black Lagoon; Sexy Fish Vampire Tide; Kiki in the ’80s; Paws & Pose. Operator Faena page independently confirms Oct31 2026.
6. Current fall menus reported by Premier Guide Miami (Sept28 2026), Modern Luxury's 2026 fall cocktail guide, Miami Living Bored Cuban Calabaza SZN 2026, and Palm Beach Post Sept30 2026 syndicated by AOL. Operator menus/booking pages supplement STK, Bagatelle, TIMBR, Earls and Meat Market.
7. Upper Keys operator evidence: Bungalows Key Largo explicit Oct31 2026 seasonal dining/mixology; Lorelei operator event Oct31; Hog Heaven current Pirates of Islamorada event. Official tourism confirms Pierre's masquerade.
8. Current regional 2026 party roundup https://weekendbroward.com/halloween-events-around-town/ . Only named Halloween/theme/costume events imported; its large ordinary music list was not imported to inflate counts.

## Exclusions and date traps

- Historical ghost lore at Biltmore Bar, House on the River, Bull & Whistle, Shots & Giggles, Old Town Tavern, Fogarty's/Flying Monkeys supplies no decor/menu proof. Folklore-only rows are excluded. Captain Tony's, General Horseplay and First Flight qualify because the **new** official 2026 schedule supplies parties, not because of ghost claims.
- Voodoo Bayou's `vampires-on-bourbon-street` page explicitly contains `(old)` in its heading. Its Witches Brew cocktail must not be presented as a 2026 seasonal release. Las Olas remains only a permanent-theme lead.
- InterContinental/Frosty's advertises 2026 coming soon but mixes undated annual material and older ticket labels. Pending until operating dates/year for the particular offering are clear. Hotel programs are grouped once.
- Christmas Bar JohnMartin's displays Nov14–Dec28 with no year. Do not copy 2025 dates to 2026. Halloween has separate current 2026 reporting.
- Four Seasons Palm Beach search extraction said 2026 events to be confirmed; current page body has no year. Palm House explicitly says 2026 dining announcements are coming soon. Both held pending.
- Latitudes official page search title says Christmas 2026, while body says Dec25 without a year. Held pending under conservative rule.
- 2024/2025 holiday roundups naming Kuba Cabana, Santa Diabla, Unit B, Christmas Island, Sip & Snow, Bodega and others are **not current confirmations** and were not added merely to reach target counts.
- STK 2026 page calls Sept8 a Monday although Sept8 2026 is Tuesday. Imported season only; no exact date.
- Haute Living Seia article contains conflicting prices between prose and FAQ. Prices omitted.

## Search coverage ledger

Routine system2 discovery followed by system1 verification/coverage expansion; approximately 40 discovery query phrases and 40 source opens/finds/clicks across the four territories. Query families included:

- Miami Halloween/Christmas 2026 bars; seasonal menus; autumn cocktails; pumpkin coffee/bakeries; exact Kiki, JohnMartin, Regatta, Rosa and Voodoo names.
- Fort Lauderdale Halloween bars/restaurants; current tourism roundup; Christmas popups; Earls, TIMBR, Sharkey's and Mai-Kai event verification.
- Palm Beach Halloween/Christmas restaurants; fall coffee menus; Jupiter/Delray/Boca parties; current DDA and tourism calendars; Miracle/Sippin' Santa partners.
- Keys Fantasy Fest 2026 official schedule, including all date sections; Christmas 2026 restaurant menus; Key Largo, Islamorada and Marathon Halloween food/drink venues.

Results are incomplete relative to the requested 50-per-area target. Next useful work is targeted operator/social-page verification of the pending rows and additional independently evidenced venues, particularly Broward/Palm Beach autumn cafes and Christmas restaurant programs. The gap must remain visible; do not fill it with expired 2025 posts, folklore, ordinary music listings, dishes or duplicate branches.
