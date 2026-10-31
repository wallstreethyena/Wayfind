# Owner-submitted @cindy.selects reels, 2026-10-29

The owner sent 28 Instagram links and asked that each be attached to the correct
place card and to Cindy's creator page (`/creators/cindy.selects`, which is built
from the registry). Four were already live (DfCcRklCSOC Bellabean, De0TPJ-pRSI
Heights Drive-Thru, DevB7D0JXlF Rreal Tacos, Dcwuyx8p6Bo Breakfast Company).
Of the other 24, 23 are assigned here and one is held for exact facility evidence.
Assignment in this PR does not mean merged, deployed or verified live. The initial
intake reviewed public post data (caption, pin line, hashtags, collaborator and
location header). Captions in
the registry are Wayfind's own words. No media is rehosted.

The assigned places already exist in `wf_inventory`; no inventory write was made.
On 2026-10-31 the three disputed brands were checked read-only against current
inventory. Both Project Coffee branches, the Bradenton Cracker Barrel and both
Mote candidates are present as OPERATIONAL and not excluded. Inventory status
proves a record exists; it does not prove where a Reel was filmed.

The machine-readable intake in `cindy-reels-2026-10-29.json` accounts for all 28
original native URLs and credits, including the held source.
The four existing associations remain unchanged. Rreal's existing route uses
name/city matching, so this batch has 26 exact-ID associations, one preserved
name/city association and one held source, not 27 exact-ID associations.

| Reel | Exact place | Place ID | How the place was identified |
| --- | --- | --- | --- |
| DfBTb96CFZQ | SpookEasy Lounge, Tampa | ChIJ7QVjUK_FwogRaTLY8uxOico | Caption pin "SpookEasy Lounge, Tampa" |
| DfA_fXppK6r | Dracula's Legacy, Tampa | ChIJIZt3d7DFwogRQ5Lg2tPMXyk | Post is a collab with @draculaslegacytampa; the St. Pete branch is deliberately not used |
| DfAz7qIpxOC | Nueva Cantina, Brandon | wfadd_nueva_cantina_brandon | Cover text reads "Nueva Cantina, Brandon, FL"; Tampa, Palm Harbor and St. Pete branches not used |
| De4TQPHibq8 | Cracker Barrel, 636 67th Street Circle East, Bradenton | ChIJs8X39n07w4gR0NEp6j5PNdc | Native location tag 39075 gives ZIP 34208 and (941) 746-7886; the official store page and Maps match that exact phone/address. Proximity is not used |
| Dewd4hwiVIE | ofKors Bakery, downtown Sarasota | ChIJG-8UUxJAw4gRR5dxpu_5F7c | Caption names ofKors Bakery in downtown Sarasota |
| DeX0q3ZJmYA, Dc44pPUiNHZ | ATRIA Cafe, Lakewood Ranch | ChIJA-QkamE7w4gRfdzcxEHyPls | Captions name ATRIA Café in Lakewood Ranch |
| DeVNmyypnUU | The Mall at University Town Center, Sarasota | ChIJ9_YnI8k_w4gRRiuNIcvA5y8 | Caption pin "Pumpkin Patch at UTC"; seasonal display at the mall |
| DeR1pO4i1Ef | **HELD: exact aquarium facility unresolved** | None | Native alligator footage and the general Mote location tag do not establish SEA or City Island. Original URL and attribution retained in intake |
| DePUUmXCRYy | Café Soleil, St. Pete Beach | ChIJe5Ox97ECw4gR2fGQC-g97jc | Caption and hashtags name Café Soleil, St. Pete |
| DeN61B-CAJX | Kaizen Japanese Kitchen, Sarasota | ChIJrZufuCg5w4gRXu8owbAhZss | Caption pin "Kaizen Japanese Kitchen, Sarasota, near UTC" |
| DeFxig6p1Oa, DeVj71Miy2c | Fruitville Grove, Sarasota | ChIJhWqZvoVHw4gRehUSFsbZARo | First caption names it and is a collab with @fruitville.grove; second carries the "Fruitville Grove Farm Market" location tag |
| Dd5S1XViNoA | Joy Coffee, Bradenton | ChIJ1U_vFp0Xw4gRGKl6mJGJ9UI | Caption pin "Joy Coffee, Bradenton" |
| DdzvudupUdo | Ananda Farm, Terra Ceia | ChIJScJ5bQAZw4gRjNIj9iS5bus | Caption pin "Ananda Farm, Terra Ceia" |
| DdmEL0_JrDW | Ryan's Coffee House, Parrish | ChIJo_IdHf0lw4gRHDbQNKBRE84 | Caption and hashtag name Ryan's Coffee House |
| DdJuoujCqvS | Orange Blossom Coffee, Bradenton | ChIJPfVM-xIXw4gRiT1_XuUakks | Caption names Orange Blossom Coffee in Bradenton |
| DdHA6GCq4Ym | Bellabean, Bradenton | ChIJ6_hQr4AXw4gRwfUFqlfdRfA | Caption names Bellabean in Bradenton |
| DczhpPGp5-b | Cedar Fox Coffee, Sarasota | ChIJww1nz5VBw4gRl0xv985c9E4 | Caption names Cedar Fox Coffee in downtown Sarasota |
| DcuNn9JpJUx | The Daily Brew Station, Palmetto | ChIJh4stzQ8Xw4gRn6tMomjUjzQ | Caption names The Daily Brew Station; only listing with that name |
| Dcrv8nJpg2Y | Riviera French Café, Sarasota | ChIJ32YG_ao5w4gRpzcR49e5sMo | Caption pin "Riviera French Café, Sarasota" |
| Dcj4cnpJSDx | Project Coffee, Burns Court | ChIJy6vf9_dBw4gRGg1sXR5UTGU | Native low white joists, tan rectangular storefront and immediate parking match the official Burns Court photo; current Maps resolves this inventory ID to 538 S Pineapple Ave. Rosemary has tall arched windows and raw concrete |
| DchZaJ0JIeh | The Bakero, downtown Sarasota | ChIJ7R-BEwBBw4gRPxw9nzLE4l0 | Caption pin "The Bakero, Downtown Sarasota" |
| DccTV0rJaHI | Tuscan Hills Coffee Co., Parrish | ChIJPSkey7Elw4gR5gvfcin8NQc | Caption names Tuscan Hills Coffee Co. and pins Parrish |

Native URLs are `https://www.instagram.com/reel/<shortcode>/` (sharing query
parameters dropped). DeVj71Miy2c was supplied as a `/p/` link; Instagram serves
the same post at the reel path.

## Corrections reviewed 2026-10-31

- Project Coffee: [official labeled locations](https://www.projectcoffee.us/pages/locations)
  distinguish Burns Court (538 S Pineapple Ave) from Rosemary (1419 5th St).
  Native footage matches Burns Court; the caption's reference to the original
  location does not establish Rosemary. The older @makayluhhhhh Rosemary
  TikTok remains on its existing card.
- Cracker Barrel: the Reel's [native location tag](https://www.instagram.com/explore/locations/39075/)
  shows (941) 746-7886 and ZIP 34208. The [official branch page](https://www.crackerbarrel.com/locations/states/fl/bradenton/73)
  matches the phone to 636 67th Street Circle East. The SR64 association stays
  on this stronger evidence; “nearest to Parrish” is not accepted as proof.
- Mote: [native location tag](https://www.instagram.com/explore/locations/205212922/)
  currently says Mote Marine Laboratory & Aquarium, ZIP 34243. That current
  general tag does not date or locate the footage. The [official alligator page](https://mote.org/animal-encyclopedia/american-alligator/)
  labels City Island; the [SEA gallery page](https://mote.org/aquarium/florida-waters/)
  describes Florida Waters separately. These sources do not resolve the
  specific alligator habitat in the Reel. Hold without a place association
  until a labeled habitat match or creator confirmation establishes the
  facility and filming date. No guessed transfer to City Island. The existing
  @manateelittlelocals SEA video stays published.

Evidence strength: native footage/tags plus official branch sources and current
Maps are primary evidence for Project Coffee and Cracker Barrel. Mote facility
identity remains unresolved. This correction does not re-verify the other 25
source identities; it preserves them.

Run `node scripts/test-cindy-reel-identities.mjs` for the 28-source accounting,
exact card routing, sibling exclusion, original credit/captions and actual
Cindy page rendering. Mote must be absent from all published associations and
from the rendered page while its native URL, credit and hold reason survive
in intake. Runtime checks prove routing against reviewed evidence, not filming
identity or production deployment.
