# Christmas photo batch 2026 11g: 19 photos for 3 blank Christmas cards

Gabe's screenshot showed Magic of Lights Daytona with a placeholder on /christmas-in-florida. This batch fills it and two more blank cards.

## Photo count
19 site hosted JPEGs, 1280x853, under public/place-photos/batch-2026-11g/. All are licensed Wikimedia Commons photos with the photographer and license in the credit. Every photo was opened and checked by eye. No renderings, logos, flyers or text overlays.

## Cards affected (static rails in lib/christmasPlacePhotos.js)
| Card | Before | After | What the photos show |
|---|---|---|---|
| Magic of Lights Daytona | 0 | 6 | Daytona International Speedway, the host venue. Cover is fireworks over the speedway at night |
| Holiday Village and BeLighted Bike Ride, Key West | 0 | 7 | Key West Christmas lights, plus sunset at Truman Waterfront Park, home of Coffee Butler Amphitheater |
| Festival of Trees, Melbourne | 0 | 6 | Eau Gallie Arts District on Highland Ave, around the Eau Gallie Civic Center |

No official event photos could be downloaded: magicoflights.com only has generic brand shots, and daytonainternationalspeedway.com, wesleyhouse.org and spacecoast.jl.org block downloads.

## Database
No database rows change. There is no apply.sql or undo.sql.

## How to undo
Revert this commit. That removes the three CHRISTMAS_STATIC_GALLERY entries and the batch-2026-11g folder, and the cards go back to their placeholders.
