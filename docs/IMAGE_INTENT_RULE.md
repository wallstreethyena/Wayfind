# Image intent rule (owner, November 4, 2026)

Every picture must match the intent of its content. No picture beats a wrong picture.
All new and replacement photos are chosen by the Picture Scrapper agent.

## What the code does
1. lib/guideContextPhotos.js `guideContextPhoto` runs strict whenever the caller does not pass an explicit topic. Strict returns null (the existing photo-less layout) for:
   generic "florida" fallbacks, related-topic substitutes, city skylines used as stand-ins, subjects with no reviewed photo (concerts, shows, comedy, sports, tickets, red tide, rinks, tacos, night markets, piers, stone crab), search phrase rows, Halloween or pumpkin assets on non fall content, and any repeat of a photo already used on the page.
2. scripts/check-image-intent.mjs (in scripts/guards.txt) fails the build if any guide pick would render one of those.
3. scripts/check-guide-visual-completeness.mjs counts these as "held for Picture Scrapper", not failures.

## What the Picture Scrapper must follow
1. Work from the backlog (held picks in check-guide-visual-completeness, or the image intent audit CSV).
2. Source a photo of the actual subject: the act, show, team, venue or event. Prefer official press kits or venue media with written permission, then Wikimedia Commons or Openverse with a commercial license. Never Google Places photos on guides.
3. Open and look at the photo. Record what it actually shows.
4. Add it as a pick photo in data/guide-pick-photos/<slug>.json (exact subject), or as a reviewed context asset in lib/editorialContextPhotos.js whose `topics` list only what the photo shows. A pumpkin photo is tagged pumpkin, never farm-general. A skyline is tagged city-*, never culture.
5. Seasonal photos only on seasonal content. Never reuse one photo for two items on the same page.
6. Run node scripts/check-image-intent.mjs and node scripts/check-guide-pick-photos.mjs before handing off. Never loosen a rule to pass.
