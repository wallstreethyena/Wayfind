# Florida photography audit — September 19, 2026

Reviewed 179 downloaded JPG/JPEG/PNG/WebP files whose names contained iStock, AdobeStock or Unsplash, using eight local contact sheets. This is the matching stock-photo subset, not every file in Downloads. Originals remain untouched.

## Implemented sources

| File | Native resolution | Credit/source | Context |
|---|---|---|---|
| springs-istock-2253526833.jpg | 8064 × 5803 | iStock 2253526833, Standard license verified in owner's signed-in download history | Florida springs hero; generic daytime kayaking illustration on the night-tour search card, explicitly labeled as not showing bioluminescence |
| sarasota-nathan-mullet.jpg | 4000 × 5501 | Nathan Mullet, https://unsplash.com/photos/v0ipCnvovM0 | Sarasota shoreline, not the cruise vessel |
| airboat-richard-sagredo.jpg | 4703 × 3762 | Richard Sagredo, https://unsplash.com/photos/HcVpfx-G2VA | Everglades airboat illustration, not an Orlando operator photograph |
| dolphin-dawn-casey.jpg | 5151 × 3349 | Dawn Casey, https://unsplash.com/photos/suhXCY8v7Ic | Dolphin illustration; source location California, visibly labeled |
| axe-annie-v.jpg | 4000 × 6000 | Annie V, https://unsplash.com/photos/5u1D47Wm4zI | Axe-throwing illustration, not Bananas' Axe Cabana |
| poke-you-le.jpg | 6000 × 4000 | You Le, https://unsplash.com/photos/dGUGwnkyDYk | Poke-bowl illustration, not Pokemoto's menu |
| tacos-quin-engle.jpg | 4058 × 2741 | Quin Engle, https://unsplash.com/photos/hAFCfzaeVJg | Taco illustration, not QDOBA's menu |

All five newly fetched Unsplash images are identified as free under the Unsplash License on their source pages. The Sarasota download has an existing reviewed source record in lib/guideHero.js. Existing Crystal River manatee photography is reused with its David Hinkel / USFWS attribution and CC BY 2.0 credit, rather than replacing a verified local photograph with a different location.

Full-size inputs feed Next Image at quality 85 with responsive sizes. The source originals are preserved; browsers request optimized derivatives. Named tour operators retain their own existing provider imagery. No new paid licenses were purchased.

## Other downloaded selections and exclusions

- iStock-2221864642 (1).jpg, 8192 × 5464: strong Miami Ocean Drive supporting editorial image. Already saved in the output photo collection; not substituted for another city.
- florida-guidebook-com-HkAbnEf0Jwc-unsplash.jpg: attractive beach access scene; hold for exact location confirmation.
- matt-bowden-GZc4fnQsaWQ-unsplash.jpg: strong rollercoaster composition; hold until exact park/source verification.
- alfonso-scarpa-GSS0pHHDkAk-unsplash.jpg, austin-neill-hgO1wFPXl3I-unsplash.jpg and danny-howe-bn-D2bCvpik-unsplash.jpg: possible generic concert editorial imagery; not replacements for named venues.
- iStock-1688959548.jpg: source identifies Krabi, excluded from Florida destination depictions.
- iStock-2169651337.jpg: mountain-lake paddleboarding, excluded from Florida destination depictions.
- iStock-2203417910.jpg: Lisbon travel image, excluded from Florida destination depictions.
- Disneyland/California Adventure imagery, mountain landscapes and obvious nonlocal streets excluded from Florida location claims.

## Remaining editorial limitation

No verified, free Unsplash photograph of actual Titusville bioluminescence was found. The tour card uses an explicitly labeled daytime kayaking illustration. Replace it with licensed documentary night-tour photography when available; do not manufacture glowing water.

## Owner sourcing preference: Viator first

For bookable Viator experiences, first request the matching product's official imagery through the existing affiliate integration (`/api/viator/curated`, backed by the verified product cache and Viator's official product endpoint). Prefer an appropriate high-resolution supplier variant and retain product identity and source records. Do not scrape arbitrary listing photos or reuse one operator's photo for a different operator.

Use verified destination photography or licensed stock/Unsplash as a clearly labeled fallback when matching affiliate imagery is unavailable. Editorial destination heroes can continue to use the owner's licensed stock. A general tour-search card does not identify one operator: use a clearly labeled example only if its source/product is identified, or retain the current illustration until the card is matched to a verified product. Do not silently imply that a photographed boat or tour is what every search result offers.

The current five general Florida tour-search cards still use the documented fallback images above. This sourcing preference does not claim that those images have been replaced by Viator photos. Existing Viator product cards already fetch provider images via the affiliate integration; the landing search cards do not yet identify exact Viator product codes.

## Local preview event connection

The isolated preview uses placeholder database credentials by repository policy. Set `WAYFIND_PREVIEW_PUBLIC_EVENTS=1` when starting the local preview to read the site's public `/api/events/fall` feed. This mode is disabled on Vercel. Rows are deduplicated and still pass the existing Florida, verified-date and affiliate-ticket gates. Production retains its direct database reader. No event records or credentials are copied or changed. An unavailable public feed retains the honest unavailable state.
