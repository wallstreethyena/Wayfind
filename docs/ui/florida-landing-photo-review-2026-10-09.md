# Florida landing photography review, October 9, 2026

Scope: every static image path on `/go/florida`, plus the dynamic catalog photo mapping. The owner explicitly authorized merge and deployment.

## Changes

The hero separates the photograph from the headline, shortens the introduction and removes the secondary scenic-route promotion. Mobile visitors reach the content sooner.

Event photos now resolve by exact event ID, including `wfc:` IDs. Reviewed event artwork remains with its event; Zoo Miami, Gatorland and Busch Gardens use their own venue photos with explicit context captions. Unknown events have no borrowed photograph. The fall list applies the shared fall-theme filter and retains EPCOT Food and Wine.

Guide cards use their own reviewed photography without springs or beach fallbacks. Captions sit below the image. Search cards use Crystal River manatees, a Boggy Creek airboat and the actual Clearwater cruise vessel. The unreviewed nighttime-kayaking and Siesta Key cruise illustrations are removed. The California dolphin, generic Everglades photo and repeated springs photo cannot appear as search-card substitutes. The inaccessible SamBoat stock image is removed; all city booking choices remain.

## Static image census

45 unique guide and offer image URLs were decoded and visually reviewed as contact sheets. 44 decoded successfully. SamBoat returned HTTP 403 and was removed from the page. The six current event artwork files and other owner-selected park artwork were also visually checked. Zoo Miami and Gatorland retain their previously verified partner files.

| Card | Decision |
| --- | --- |
| things-to-do-orlando-not-theme-parks | Keep reviewed guide photo and its location/context caption |
| swim-with-manatees-crystal-river | Keep reviewed guide photo and its location/context caption |
| siesta-key-drum-circle | Keep reviewed guide photo and its location/context caption |
| things-to-do-sarasota | Keep reviewed guide photo and its location/context caption |
| winter-park-scenic-boat-tour | Keep reviewed guide photo and its location/context caption |
| bioluminescence-kayak-tour-space-coast | Keep reviewed guide photo and its location/context caption |
| weeki-wachee-kayak-mermaids-guide | Keep reviewed guide photo and its location/context caption |
| gatorland-vs-wild-florida | Keep reviewed guide photo and its location/context caption |
| st-armands-circle-restaurants | Keep reviewed guide photo and its location/context caption |
| siesta-key-vs-lido-key | Keep reviewed guide photo and its location/context caption |
| anna-maria-island-day-trip | Keep reviewed guide photo and its location/context caption |
| tampa-hook-busch-gardens | Keep matched venue/photo identity |
| orlando-hook-seaworld | Keep matched venue/photo identity |
| winterhaven-hook-legoland | Keep matched venue/photo identity |
| winterhaven-hook-peppa-pig | Keep matched venue/photo identity |
| orlando-hook-aquatica | Keep matched venue/photo identity |
| tampa-deal-adventure-island | Keep matched venue/photo identity |
| kissimmee-hook-island-h2o | Keep matched venue/photo identity |
| orlando-klook-universal-admission | Keep logo, visibly labeled Venue identity |
| merritt-island-klook-kennedy-admission | Keep logo, visibly labeled Venue identity |
| orlando-drive-kennedy-explore | Keep matched venue/photo identity |
| orlando-hook-gatorland | Keep matched venue/photo identity |
| orlando-hook-discovery-cove | Keep matched venue/photo identity |
| orlando-hook-boggy-creek | Keep matched venue/photo identity |
| kenansville-hook-wild-florida | Keep matched venue/photo identity |
| miami-hook-everglades-safari-park | Keep matched venue/photo identity |
| ftl-hook-everglades-holiday-park | Keep matched venue/photo identity |
| weston-hook-sawgrass-park | Keep matched venue/photo identity |
| clearwater-hook-dolphin-cruise | Keep matched venue/photo identity |
| tampa-tonight-sunset-cruise | Keep matched venue/photo identity |
| tampa-boat-samboat | Remove inaccessible stock photo; preserve city choices |
| clearwater-boat-samboat | Remove inaccessible stock photo; preserve city choices |
| keywest-boat-samboat | Remove inaccessible stock photo; preserve city choices |
| miami-boat-samboat | Remove inaccessible stock photo; preserve city choices |
| tampa-venue-ritz-ybor | Keep matched venue/photo identity |
| stpete-venue-jannus-live | Keep matched venue/photo identity |
| tampa-venue-tampa-theatre | Keep matched venue/photo identity |
| tampa-venue-raymond-james-stadium | Keep matched venue/photo identity |
| tampa-venue-amalie-arena | Keep matched venue/photo identity |
| tampa-venue-steinbrenner-field | Keep matched venue/photo identity |
| clearwater-venue-baycare-ballpark | Keep matched venue/photo identity |
| stpete-venue-al-lang-stadium | Keep matched venue/photo identity |
| stpete-venue-tropicana-field | Keep matched venue/photo identity |
| bradenton-venue-lecom-park | Keep logo, visibly labeled Venue identity |
| sarasota-venue-ed-smith-stadium | Keep matched venue/photo identity |
| lakeland-venue-publix-field | Keep matched venue/photo identity |
| orlando-venue-kia-center | Keep matched venue/photo identity |
| orlando-venue-camping-world-stadium | Keep matched venue/photo identity |

No new stock source, paid image purchase or Google photo request was introduced. Existing source/license records remain in `guideHero.js`, `floridaPhotography.js` and the partner-offer registry.

## Dynamic catalog

`productToRow` reads each product’s own image variants; `rowToCard` passes the same row’s image or null; `ExperienceCatalog` uses `GuidePhoto` and deduplicates product codes. There is no shared stock-image fallback in this path. Runtime inventory can change independently of this release.

## Verification

The landing guard passes 301 assertions. A mutated resolver that returns a Disney image for Zoo Miami makes the actual guard exit 1 with the photo-identity failure. JSX validation passed. Full guard suite, production build, responsive browser checks and hosted release checks are recorded in the pull request as they finish.

The real Zoo card was rendered through the actual `EventCard`, `GuidePhoto`, curated event record and route CSS. Recorded partner bytes were fetched with normal TLS validation. This fixture proves layout and identity, not production browser delivery.

Local full builds use public placeholders and do not establish live inventory health. Release verification must match the merged SHA and actual production deployment.
