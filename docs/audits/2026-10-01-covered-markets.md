# Covered markets — verification record (2026-10-01)

PR #1616. **Covered** (search, Location box, homepage feed) is separate from **published** (landing pages, sitemap). A covered market mints no page; `railHref` links only published slugs. #1584's evergreen pairs remain the only non-`LANDING_CITIES` pages.

## How this was measured

- **Feed:** `/api/rails?v=2&band=morning&city=<slug>` at the city centre, on the PR preview `wayfind-re1n2egeu` (head `2d77afc`). The preview reads production data. "Before" is production `961c5e2`.
- **Places:** distinct places across all rails, from `placeIndex`.
- **≤15 mi:** share of places within 15 mi of the centre.
- **Nearest is this city:** share of places whose nearest covered centre is this city. Dense neighbours (Miami Beach / Miami, St. Pete / Clearwater / Tampa) are expected to be lower; the controls show the same pattern.
- **Photo ref:** share of places that have a photo reference. It does not show whether the image decodes; the photo census measures that separately.
- **Rail columns** (Breakfast, Eat, Today, Tonight, Beach, Family): cards in the first page (max 12).
- **Overlap with the neighbouring metro's feed**, across the breakfast, eat, today and tonight rails:
  - St. Pete shares 6 of 43 places with Tampa.
  - Fort Lauderdale shares 0 of 37 with Miami.
  - Clearwater shares 4 of 40 with Tampa.

| Market | Aliases | Centre | TZ | Feed before (prod) | Feed after | Places | ≤15 mi | Nearest is this city | Photo ref | Breakfast | Eat | Today | Tonight | Beach | Family | Gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| St. Petersburg | st pete, saint pete, saint petersburg | 27.7676, -82.6403 | New_York | tampa | st-petersburg | 108 | 64% | 58% | 100% | 12 | 12 | 12 | 12 | 12 | 12 | — |
| Clearwater | — | 27.9659, -82.8001 | New_York | tampa | clearwater | 109 | 57% | 50% | 100% | 12 | 12 | 12 | 12 | 11 | 12 | — |
| Lakeland | — | 28.0395, -81.9498 | New_York | tampa | lakeland | 63 | 78% | 94% | 97% | 4 | 12 | 12 | 12 | 0 | 12 | breakfast 4; no beach rail |
| Kissimmee | — | 28.2920, -81.4076 | New_York | orlando | kissimmee | 94 | 86% | 57% | 100% | 12 | 12 | 12 | 12 | 0 | 12 | no beach rail |
| Fort Myers | ft myers | 26.6406, -81.8723 | New_York | venice | fort-myers | 57 | 88% | 53% | 100% | 12 | 12 | 12 | 6 | 5 | 12 | tonight 6 |
| Cape Coral | — | 26.5629, -81.9495 | New_York | venice | cape-coral | 58 | 95% | 50% | 100% | 12 | 12 | 12 | 7 | 5 | 12 | tonight 7 |
| Naples | — | 26.1420, -81.7948 | New_York | venice | naples | 69 | 87% | 97% | 100% | 12 | 12 | 12 | 12 | 0 | 12 | no beach rail |
| Miami Beach | south beach | 25.7907, -80.1300 | New_York | miami | miami-beach | 104 | 86% | 30% | 100% | 12 | 12 | 12 | 12 | 10 | 12 | — |
| Hollywood | — | 26.0112, -80.1495 | New_York | miami | hollywood | 109 | 79% | 48% | 100% | 12 | 12 | 12 | 12 | 10 | 12 | — |
| Fort Lauderdale | ft lauderdale | 26.1224, -80.1373 | New_York | miami | fort-lauderdale | 103 | 77% | 47% | 100% | 12 | 12 | 12 | 12 | 6 | 12 | — |
| Boca Raton | — | 26.3683, -80.1289 | New_York | miami | boca-raton | 85 | 80% | 66% | 100% | 12 | 12 | 12 | 12 | 0 | 12 | no beach rail |
| West Palm Beach | west palm, wpb | 26.7153, -80.0534 | New_York | miami | west-palm-beach | 68 | 93% | 88% | 100% | 12 | 12 | 12 | 12 | 0 | 12 | no beach rail |
| Melbourne | — | 28.0836, -80.6081 | New_York | orlando | melbourne | 49 | 78% | 100% | 100% | 12 | 12 | 12 | 3 | 9 | 4 | tonight 3 |
| Daytona Beach | daytona | 29.2108, -81.0228 | New_York | orlando | daytona-beach | 63 | 100% | 100% | 100% | 12 | 12 | 12 | 12 | 0 | 12 | no beach rail |
| St. Augustine | saint augustine | 29.8948, -81.3145 | New_York | not covered | st-augustine | 53 | 96% | 100% | 100% | 12 | 12 | 12 | 12 | 0 | 12 | no beach rail |
| Jacksonville | jax | 30.3322, -81.6557 | New_York | not covered | jacksonville | 72 | 85% | 99% | 100% | 12 | 12 | 12 | 12 | 0 | 12 | no beach rail |
| Ocala | — | 29.1872, -82.1401 | New_York | orlando | ocala | 59 | 97% | 100% | 100% | 12 | 12 | 12 | 12 | 0 | 12 | no beach rail |
| Tallahassee | — | 30.4383, -84.2807 | New_York | not covered | tallahassee | 53 | 100% | 100% | 100% | 11 | 12 | 12 | 12 | 0 | 6 | no beach rail |
| Panama City Beach | pcb | 30.1766, -85.8055 | Chicago | not covered | panama-city-beach | 75 | 96% | 100% | 100% | 12 | 12 | 12 | 12 | 0 | 12 | no beach rail |
| Destin | — | 30.3935, -86.4958 | Chicago | not covered | destin | 49 | 98% | 100% | 100% | 12 | 12 | 12 | 4 | 0 | 9 | tonight 4; no beach rail |
| Pensacola | — | 30.4213, -87.2169 | Chicago | not covered | pensacola | 55 | 98% | 100% | 100% | 12 | 12 | 12 | 4 | 0 | 12 | tonight 4; no beach rail |
| tampa (control) | — | — | — | tampa | tampa | 91 | 77% | 75% | 100% | 12 | 12 | 12 | 12 | 4 | 12 | — |
| miami (control) | — | — | — | miami | miami | 105 | 88% | 60% | 100% | 12 | 12 | 12 | 12 | 10 | 12 | — |
| sarasota (control) | — | — | — | sarasota | sarasota | 100 | 89% | 41% | 100% | 12 | 12 | 5 | 12 | 12 | 12 | — |

## Held (not enabled empty)

| Market | Measured | Reader today |
|---|---|---|
| Gainesville | 6 places, 0 breakfast, 3 eat | Nearest covered city's feed (Ocala), labelled Ocala |
| Port St. Lucie | 11 places, 0 breakfast, 3 eat | Nearest covered city's feed, labelled with that city |
| Key West | 3 owned places (search probe) | Out of coverage (honest empty) |

`scripts/test-covered-markets.mjs` locks these as held. Promote one only with a fresh feed measurement.

## Known gaps (honest-empty, not broken)

- **Beach rail is empty** for several coastal markets: Naples, Jacksonville, St. Augustine, Daytona Beach, Panama City Beach, Destin, Pensacola, Boca Raton and West Palm Beach. Empty rails are hidden. The beach pool needs beach inventory for these towns.
- **Thin rails:**
  - Lakeland breakfast: 4.
  - Destin and Pensacola tonight: 4 each.
  - Melbourne tonight: 3.

## Browser verification (Chromium, preview `2d77afc`, analytics requests blocked)

21 of 22 checks passed:
- "St. Petersburg", "St Petersburg", "Saint Petersburg", "St Pete", "Saint Pete", "saint pete" and "ST. PETE" all offer **St. Petersburg, FL**.
- Near St. Pete, "saint pete" also offers Saint Pete Salt Room.
- Selecting the city sends `/api/rails?city=st-petersburg`, shows St. Petersburg in the location chip, and persists `wf_center`. A reload keeps it.
- "pizza st pete" is searched at St. Pete's centre and ranks Tony's Pizza (0.3 mi) above Tampa's Pizza Kitchen (16.9 mi).
- Switching quickly from Jacksonville to St. Pete ends on St. Pete, with no stale label.
- Clearing the query closes the suggestions.
- Mobile 390×844: Jacksonville selects with `city=jacksonville` and no horizontal overflow.

The one failure, "Saint Pete Salt" typed from the default Orlando centre, is pre-existing. Production gives the same empty result, because the venue is outside the 80 km search radius.

## Time zone

Pensacola, Destin and Panama City Beach are `America/Chicago`, matching IANA's Central zone for Escambia, Okaloosa and Bay counties. Tallahassee and Port St. Joe stay Eastern.

At 11:00 local, Pensacola and Destin read morning and Tampa (12:00) reads lunch. This holds both before and after the 2026-11-01 DST change. `test-covered-markets` covers it.
