# Place card consistency audit

Audit baseline: `4018eec139173cdecf8a718ea41f8da21a10b55b`.
Owner request: one established place card standard across every page, with
enforcement that applies to future work.

## Reproduced failure

At an achieved 1363px browser width on the public homepage, the Fall poster
rendered ordinary cards at 529.5 × 268px and nearby hotel cards at
531.3 × 340px. The home affiliate rail rendered 440 × 268px cards.

`EventPlaceRail` injected a 340px height over the shared 268px height. Separate
container-based width formulas also allowed cards to grow differently. The
existing width guard read only two shared CSS strings and missed the styles
in the event wrapper. Its browser fixture did not render that wrapper.

## Surface census and repair targets

| Surface | Rendering path | Baseline inconsistency |
| --- | --- | --- |
| Home results, menus, saved places, itineraries, shared lists | `home.js` PlaceCard and app screens | Shared base styles, but independent rail width systems |
| Main poster and intent rails | `RailCard` | Different padding, title and action sizes; separate actionless height |
| Nearby, best-of, budget, hidden gems, quick bite, seasonal and drive pages | `IntentPageClient`, `RankedExperiencePage`, `IconicPlaceCard` | Shared card can expand to its page container |
| Fall hotels and event detail recommendations | `DestinationStays`, `EventNearbyCards`, `EventStayCards`, `EventPlaceRail` | 340px height and repeated width rules |
| Trip suggestions in place details and stays | `TripConnections` | Private 380px wrapper width and 20px gap |
| Family place results | `FamilyDayPage` | Private grid and width rules |
| Guide place recommendations | `GuidePlaceCard` | Shared renderer; verify stylesheet and width reach |
| Map full place previews | Map screen, home PlaceCard, `IconicPlaceCard` | Verify constrained-container behavior uses shared sizing |
| Creator place recommendations | Creator rails and `RailCard` | Inherit RailCard subtype differences |
| Sponsored place recommendations | `SponsoredPlaceCard` | Independent photo, typography, frame and action layout |
| City restaurant, beach, nightlife and activity pages | `lib/landing.js` | Custom full-width editorial place cards |
| Florida town place results | `app/florida/[town]/page.js` | Custom text cards |
| Ranked beaches | `app/best-beaches/[metro]/page.js` | Custom landscape photo cards and typography |
| Metro cuisine results | `app/eat/[metro]/[cuisine]` | Custom place rows |
| Loading placeholders | `PlaceCardSkeleton`, `BestNearby`, `IntentRail`, home event rail | Two reservations used 224px and event loading used 245px for 268px cards |

This audit treats ranked recommendations for real places as place cards.
Marketing posters, video/profile posts, social share images, detail heroes,
and map pin selectors are separate objects. Their existence is not an
exception permitting a place recommendation to use a private card design.

## Enforcement findings

- Width checks covered shared styles without wrapper-injected CSS.
- One layout check covered real cards only at 390px and without wrapper CSS.
- Heading and loading checks did not establish card geometry parity.
- Browser checks could skip locally while their final messages still claimed
  measurements. A skipped measurement cannot establish visual consistency.
- Existing documents did not name a canonical height, width owner, or
  mandatory rendered matrix.

The replacement contract is recorded in `place-card-standard.md` and
AGENTS.md section 14. Release evidence must identify the checked revision,
the actual rendered matrix, the mutation that fails, and public-site checks.

## Verification and release handoff

The prepared change centralizes 268px card bodies and a responsive width capped
at 440px. Phone score placement preserves readable title space. The shared
title clamp is three lines; rail subtypes do not have private desktop fonts,
action tracks, or gaps.

Local production compilation and the homepage bundle check passed (477.1KB
gzip against the unchanged 498KB limit). The structural guard compiled and
server-rendered all nine adapters and rejected actual source mutations for
the historical height override and a private title font.

Chromium is unavailable in this workspace. The seven-width rendered matrix,
screenshots, preview interactions, and production verification are still
required. Do not treat local structural/SSR results as rendered evidence.

Owner approved publication of the code and generated registry update.
Release from `fix/global-place-card-standard` requires the GitHub Chromium
check, preview review, and production verification described above.

Local guard evidence: commands 1–464 passed in the clean run; a duplicate
temporary homepage source then tripped the shell census. The harness now
exports the actual home function from its compiled test module and creates
no duplicate application source. Its focused check passed (13 structural/SSR
assertions). Commands 465–632 and the credentialed rerun then passed.
This is segmented local evidence, not a claim that the GitHub browser gate ran.
