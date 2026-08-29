# Category tightness — Parrish identity audit

**Date:** 2026-08-29  
**Repo:** `wallstreethyena/Wayfind` @ `origin/main` `973eaa5a` (includes #951 / #955)  
**Live:** https://www.gowayfind.com  
**Owner city:** Parrish, FL (`27.5689, -82.4393` home seed; landing `27.5859, -82.4254`)  
**Constraint:** docs only. No app / CSS / ranking / predicate edits. No Book. No `/go`. No merge.

Home tiles (`lib/categories.js` `CATEGORY_TILES`): **Food · Night out · Activities · Family · Stays · Shopping**.  
Beach day is **not** a home tile (replaced by Family in v6.28). It remains a deep-link category.

---

## Recommendation

Do **not** ship a visual or ranking change from this audit.

#951 (Cafés / Lunch library-first) and #955 (Family toddlers/kids/rainy + sit-on-sand beaches) still hold on the **executed** predicates. The remaining holes are the chips #955 was told not to assume it covered:

1. **Food → Dinner / Quick bites / Delivery are decorative.** Named `CHIP_IDENTITY` wrappers call `placeAllowed("food", <sub>)` with **no** `SUB_ALLOW`. Membership equals Food → All. That is the Family 222-list bug in a food costume.
2. **Stays → Luxury / Budget / Beach / Boutique are not on the library wire.** `browseChipUsesInventory` is false. Home `_fetchAt` fires Google Text Search. Server-side name predicates exist and are unused on that path. The luxury rule is also a `\bresort\b` substring (Golden Host Resort would count as luxury if the rule ever ran).
3. **Name-tail leaks still exist on chips that *do* have contracts:** Fleming’s (primary `steak_house`) is Night out → Bars because the name contains “Wine Bar”; Palmetto Riverside Bed & Breakfast is Activities → Outdoors because the name contains “riverside”; a frozen-yogurt counter is Shopping → All because `dessert_shop` contains `shop`.
4. **Live Night out → All (Parrish home feed):** Oscura showed with an ACTIVITIES label at #4 of 58. That is a cross-category card on the nightlife chip, not a thin-list honesty problem.

Leave predicates frozen until the owner picks one chip family to lock. Prefer a follow-up that only adds a **guard** (executed membership ≠ All) for Dinner / Quick bites / Delivery and Stays subs — no CSS, no card markup.

---

## Evidence

Method, in order. Ranking was not for sale; no `/go`; no production writes.

| Source | What it answers | What it is not |
|---|---|---|
| `lib/google.js` `SUBFILTERS` + `lib/categories.js` `CATEGORY_TILES` | Every home chip and subchip | — |
| `lib/chipIdentity.js` `CHIP_IDENTITY` + `lib/browseInventory.js` `browseChipUsesInventory` + `lib/placeFilter.js` `SUB_ALLOW` | Named predicate, library-before-rank, contract | Live card order |
| `node` import of `chipIdentity()` against typed rows | Whether identity admits a known place | Home-feed rank |
| `GET https://www.gowayfind.com/api/hotels?lat=27.5689&lng=-82.4393&limit=40` | Live Stays inventory (owned, no Google). This **is** the home Stays → All `_invAll` path | Stays **subs** (those skip inventory) |
| Live SEO landings `/restaurants/parrish`, `/nightlife/parrish`, `/things-to-do/parrish`, `/beaches/parrish`, `/florida/parrish` | Supporting city lists | **Not** the home chip feed. Different cache and query. |
| Home `_fetchAt` in `app/home.js` | Wire: `SUB_ALLOW` → `_invAll` (`inv=1&sub=`); else `searchPlaces` (Google, max 20) | — |
| Live home chips on gowayfind.com, location Parrish, FL (browser, no Book / no `/go`) | Food → All and Night out → All first 5 + Night out count | Every other chip. Pass stopped after those two All lists. |

`CHIP_IDENTITY` is server + guards only. `home.js` must not import it (496KB ratchet; #955 CI). Client membership is `placeAllowed`. Inventory chips get `chipIdentity` inside `serveFromInventory` **before** `rankInventory`.

#951 / #955 locks, re-executed (not assumed):

- Keke’s `breakfast_restaurant` → Lunch **false**, Cafés **true** (still has `cafe` in types), Breakfast **true**.
- Ca’ d’Zan `museum` → Beaches **false**, Rainy day **false**, Museums **true**.
- Apollo Beach Preserve `nature_preserve` → Beaches **false**.
- E.G. Simmons Beach Pavilion 12 (no beach type) → Beaches **false**.
- Intense Escape / Escape Reality → Kids **false** (adult escape-room name veto).
- Bishop (science museum) → Rainy **true**, Toddlers **false**, Beaches **false**.

---

## Impact

- **Trust:** Dinner / Quick bites / Delivery teaching the user they are three lists when they are one Food All. Same disease as Night out → Clubs = All (v8.29.10) and Family 222-list (2026-08-26).
- **Trust:** a steakhouse on Bars, a B&B on Outdoors, yogurt on Shopping.
- **Revenue:** none of these holes sell rank. They *do* waste a tap that should have been a meal / a club / a beach. Wrong-chip lists train “Wayfind does not know what this is.”
- **#951 / #955:** not regressed on the executed locks above. Cafés still admits breakfast rooms that also carry `cafe` (Keke’s, First Watch). That is softness, not the Lunch-led-by-Keke’s bug.

---

## Risks / unknowns

- **Home-feed first-5 for most chips was not captured.** A live browser pass on gowayfind.com (Parrish, no Book / no `/go`) recorded Food → All and Night out → All only, then stopped. Same-origin `/api/places/search` is guarded; spoofing Origin to pull `inv=1` was refused (that is the $735 Places leak door). `/api/sources/compare` was not used (401, and it bills Google + Foursquare).
- **SEO landings are a different machine.** `/things-to-do/parrish` still leads Escape Reality, Ca’ d’Zan, Sunshine Skyway. That is not proof Activities → All on the home chip shows the same five, and it is not a Beaches leak (Ca’ d’Zan fails `isSitOnSandPlace`).
- **Stays → All live list is owned hotels, then unioned with Google** on the home “All” path. First 5 below are the owned half only.
- **`isLuxuryStayChip` / `isBudgetStayChip` / `isBeachStayChip` / `isBoutiqueStayChip` are unused on the home subchip wire.** Evaluating them locally is what the predicate *would* do, not what the live Luxury chip returns.
- **Thin Night out chips (Clubs, Karaoke, Speakeasy)** may honestly return 0–2 rooms near Parrish. A thin honest list is not a 1-card lie. A 1-card lie is identity ∩ top-N while the library has more matches. Not measured live this pass for those chips.
- **Discover intents** (`lib/categories.js` `DISCOVER`) still name `food:brunch`, `food:coffee`, `food:drinks` — **not** in `SUBFILTERS`. If that menu is reachable, those ids fall through to Food All. Not walked as home chips.

---

## Next three actions

1. **Owner decision (required before any code):** lock Food → Dinner / Quick bites / Delivery as *time/speed/attribute* (keep decorative, document) **or** give each a real membership that is not Food All. Same question for Stays subs (price/class vs name tokens).
2. **Guard-only follow-up (no CSS, no cards):** extend `scripts/test-browse-library.mjs` so Dinner, Quick bites, and Delivery **fail the build** if `chipIdentity` membership equals Food All on a mixed fixture; Stays Luxury/Budget/Beach/Boutique fail if first-10 names equal Stays All. Red-prove by breaking membership, not the assertion.
3. **Name-tail sweep (predicate PR, later):** Bars must not admit on `Wine Bar` in a `steak_house` name; Outdoors must not admit lodging on `riverside`; Shopping All must not admit `dessert_shop` via the `shop` substring. Each needs an executed row, not a regex guess.

---

## Decision required

Gabe: which hole is the next lock?

- **A.** Food Dinner / Quick bites / Delivery — decorative vs real meal/speed identity.  
- **B.** Stays Luxury / Budget / Beach / Boutique — put named predicates on the inventory wire, or stop showing the chips.  
- **C.** Name-tail leaks (Fleming’s → Bars, B&B → Outdoors, froyo → Shopping).  
- **D.** None. Docs only; leave code frozen.

This PR is **draft markdown**. Do not merge a visual change. Do not change predicates in this PR.

---

## Table — every home chip

**PASS/FAIL is identity before rank.**  
A sibling pair that would dump the same membership as All is FAIL unless the chip *is* All, or the overlap is the identity (Breakfast ∩ Cafés for coffee-forward breakfast rooms).  
`LIB-FIRST` = `browseChipUsesInventory` true (`SUB_ALLOW` exists → home `_invAll` then `chipIdentity` before rank).  
`NO-LIB` = Google `searchPlaces` (or the All union). Named `CHIP_IDENTITY` may still exist and still be a `placeAllowed` no-op.

First-5 sources:

- `home` — live home chip on gowayfind.com, Parrish, FL.  
- `hotels-api` — live owned Stays list (home All inventory path).  
- `exec` — `chipIdentity(cat,sub,place)` on typed rows / owned stay names. Not a screenshot of the home feed.  
- `landing` — SEO page, **not** the home chip. Supporting only.

| Chip | Predicate (`file` · `fn`) | Library before rank | First 5 Parrish names (source) | PASS/FAIL | Why |
|---|---|---|---|---|---|
| Food → All | `lib/chipIdentity.js` `isFoodPlace` → `placeAllowed("food","all")` | NO-LIB (union: Google All + meal-slot + inventory) | **Live `home`:** 1. Empanadas Valrico, Sarasota 2. Mister 01 Extraordinary Pizza UTC 3. The Barnyard 4. Keke’s Breakfast Cafe 5. S.O.B. Burgers | PASS (All), geo-soft | Identity is food. #1 Valrico and #2 UTC are not Parrish-near; score won over distance. SEO `/restaurants/parrish` is a different five (Shake Station…). |
| Food → Breakfast | `isBreakfastChip` → `placeAllowed("food","breakfast")` | LIB-FIRST | First Watch; Keke’s Breakfast Cafe; Ryan’s Coffee House; It’s In The DNA Coffee (`exec` keepers). Fleming’s steakhouse **refused** (`exec`, #960 lock) | PASS | Primary-identity veto holds: Fleming’s `steak_house` + secondary `brunch_restaurant` is out. National QS veto stays. |
| Food → Cafés | `isCafePlace` → `placeAllowed("food","cafes")` | LIB-FIRST | Ryan’s Coffee House; It’s In The DNA Coffee; Keke’s; First Watch (`exec`). No steakhouse (`exec`) | PASS with softness | #951 library-first still on. Coffee-forward contract admits any row with `cafe`/`coffee` — Keke’s and First Watch are breakfast rooms, not roasters. Not the “1 café / That’s all 1” bug. |
| Food → Lunch | `isLunchChip` → `isLunchPlace` ∧ `placeAllowed("food","lunch")` | LIB-FIRST | C & K Smokehouse BBQ; Shake Station; Fleming’s; Outback (`exec` keepers). Keke’s **out**. Froyo **out**. Coffee **out** | PASS | #951 lock: lunch is a midday meal, not breakfast-only primary, not dessert, not coffee. |
| Food → Dinner | `isDinnerChip` → `placeAllowed("food","dinner")` | NO-LIB | **Same membership as Food All** on a mixed food fixture (`exec`): Keke’s, Fleming’s, First Watch, BBQ, froyo, Ryan’s, Peggy’s, Good Liquid, Outback, Shake Station, DNA Coffee | **FAIL** | Named function adds nothing. No `SUB_ALLOW`. `_fetchAt` will not widen from inventory. Decorative chip = All. check-sub-contracts calls this “CHIP_IDENTITY names it server-side”; the name is a wrapper around Food All. |
| Food → Quick bites | `isQuickBitePlace` → `placeAllowed("food","quickbites")` | NO-LIB | **Same membership as Food All** (`exec`) | **FAIL** | Same hole. Acknowledged debt in `CATEGORY_WIDE` (“no Google type”). Still a lie on the chip. |
| Food → Delivery | `isDeliveryPlace` → `placeAllowed("food","delivery")` | NO-LIB | **Same membership as Food All** (`exec`) | **FAIL** | Same hole. Delivery is an attribute, not a type. Chip = All. |
| Food → Desserts | `isDessertChip` → `placeAllowed("food","dessert")` | LIB-FIRST | Pomegranate Frozen Yogurt (`exec` keeper). BBQ / sandwich / Keke’s **refused** (`exec`, v8.63) | PASS | Contract exists; library-first on. Not a second Food All. |
| Night out → All | `isNightlifePlace` → `placeAllowed("nightlife","all")` | NO-LIB (union) | **Live `home`:** 1. O’bricks Irish Pub & Martini Bar 2. Corporate Ladder Brewing Company 3. Apollo Beach Society Wine Bar 4. Oscura 5. Jaxx Wing Co. — “That’s all 58 night out spots near Parrish.” | **FAIL** (identity on All) | Oscura rendered with an **ACTIVITIES** label (coffee shop / punk venue) on Night out. Jaxx is wings. `CAT_ALLOW.nightlife` ends in `\|restaurant\|`. All is allowed to be wide; an Activities card on this chip is not. SEO `/nightlife/parrish` is a different five. |
| Night out → Bars | `isBarPlace` → `placeAllowed("nightlife","bars")` (NARROW primary, then **name tail**) | LIB-FIRST | Peggy’s Corral; Good Liquid Brewing (`exec` keepers). Outback (primary `steak_house`, name has no `bar`) **out**. Fleming’s **in** (`exec`) | **FAIL** | Fleming’s Prime Steakhouse & Wine Bar is a steakhouse. NARROW primary is `steak_house` (correct miss); the **name tail** matches `\bbar\b`. Identity after rank’s opposite: the name rescued a wrong room. |
| Night out → Clubs | `isClubPlace` → `placeAllowed("nightlife","clubs")` NARROW | LIB-FIRST | No keeper in the typed Parrish fixture (`exec`). Keke’s **out** | PASS (contract) | The v8.29.10 lock holds on execution: breakfast cafe is not a club. Live card count unverified (thin market is allowed to be thin). |
| Night out → Speakeasy | `isSpeakeasyPlace` → `cocktail_bar\|speakeasy` NARROW | LIB-FIRST | No keeper in fixture (`exec`) | PASS (contract) / live unread | Predicate is not All. Supply may be zero near Parrish. |
| Night out → Karaoke | `isKaraokePlace` → `karaoke` NARROW | LIB-FIRST | No keeper in fixture (`exec`) | PASS (contract) / live unread | Same. Woody’s *has* karaoke nights; if Google does not type `karaoke`, the chip stays empty. That is honest, not a 1-card lie. |
| Night out → Sports Bars | `isSportsBarPlace` → `sports_bar` NARROW | LIB-FIRST | No keeper in fixture (`exec`) | PASS (contract) / live unread | Primary `sports_bar` only. CoolToday Park (stadium + secondary bar) is the documented non-narrow failure mode; NARROW keeps it out of Bars. |
| Night out → Live Music | `isLiveMusicPlace` → venue types (not NARROW) | LIB-FIRST | No typed keeper in fixture (`exec`) | PASS (contract) / live unread | Secondary live-music tag is intentional (a restaurant that hosts bands). |
| Activities → All | `isAttractionPlace` → `placeAllowed("attractions","all")` | NO-LIB (union) | Escape Reality; Ca’ d’Zan; Sunshine Skyway; Emerson Point; Riverwalk (`landing` `/things-to-do/parrish` — **not home**) | PASS (All) | Ca’ d’Zan on All is correct (museum). Must not appear on Beaches / Rainy. |
| Activities → Outdoors | `isOutdoorsPlace` → `placeAllowed("attractions","outdoors")` | LIB-FIRST | Siesta Key Beach; Fort De Soto; Riverwalk; Parrish Community Park; Apollo Beach Preserve (`exec` keepers). **Also Palmetto Riverside Bed & Breakfast** (`exec`) | **FAIL** | Lodging named “Riverside” matches `river` in the outdoors regex via the **name tail**. A B&B is not an outdoor attraction. Sit-on-sand beaches *do* belong here (overlap with Beaches is genuine). |
| Activities → Beaches | `isSitOnSandPlace` (`lib/chipIdentity.js`; uses `isBeachPlace` + type-only beach) | LIB-FIRST (library cat `beach`) | Siesta Key Beach; Fort De Soto (`exec` keepers). Ca’ d’Zan **out**. Apollo Beach Preserve **out**. E.G. Simmons Pavilion 12 **out**. Tennis club **out** | PASS | #955 / #958 / #961 lock. A mansion is not sit-on-sand. Name-only “Beach” / “Shore” does not rescue a non-beach type. SEO `/beaches/parrish` still lists Fort Hamer Park / Parrish Community Park / Rye Preserve — **that landing is not this chip.** |
| Activities → Museums | `isMuseumPlace` → `placeAllowed("attractions","museums")` | LIB-FIRST | Ca’ d’Zan; Tibbals / Ringling circus museum; Bishop; Florida Railroad Museum (`exec`) | PASS | Museums are museums. Ca’ d’Zan belongs here, not on Beaches or Rainy. |
| Activities → Family | `isAttractionFamilyPlace` → `placeAllowed("attractions","family")` | LIB-FIRST | Kids Empire; Intense Escape; Escape Reality; parks; Ca’ d’Zan (`exec`) | PASS with softness | This is Activities’ family *attraction* chip, not Family → Kids. Adult escape rooms pass this allow (park/museum/arcade/escape). Family → Kids is the tighter chip. |
| Activities → Tours | `isTourPlace` → `placeAllowed("attractions","tours")` | LIB-FIRST | Tampa Fishing Charters (`exec` keeper from Arts fix). Museums **out** | PASS (contract) / live unread | `\btours?\b` no longer matches `tourist_attraction` (v6.37). |
| Activities → Spa & wellness | `isSpaPlace` → `placeAllowed("attractions","spa")` | LIB-FIRST | Elite Medical Spa of Parrish / MassageLuXe would pass this chip (`exec` type `spa`). They are correctly **not** an outing rail | PASS (chip) | Spa *is* this chip’s promise. Rail identity (`isOuting`) is a different question (already locked). |
| Activities → Landmarks | `isLandmarkPlace` → `placeAllowed("attractions","landmarks")` | LIB-FIRST | Sunshine Skyway Bridge (`exec`) | PASS (contract) / live unread | A bridge is a landmark. Date-night rail must not use this chip’s membership (already locked in `check-date-night-identity`). |
| Activities → Arts | `isArtsPlace` → `placeAllowed("attractions","arts")` | LIB-FIRST | Manatee Performing Arts Center (`exec`). Crunch Fitness **out**. Fishing charter **out**. Dragon Martial Arts **out** | PASS | v8.63 substring lock holds (`chARTer`, `studio`, `martial_arts_school`). |
| Activities → On the water | `isOnTheWaterPlace` → `placeAllowed("attractions","marinas")` | LIB-FIRST | Fort Hamer Park (`exec`, types include `marina`) | PASS with softness / live unread | A river park with a ramp is on the water. A boat dealership must stay out (v6.16 history). Not re-measured live. |
| Family → All | `isFamilyTabPlace` → `placeAllowed("family","all")` + virtual inventory from attractions | NO-LIB (union) | Parks, museums, Kids Empire (`exec`). Nightlife **out**. Toy shops **out** (CAT_EXCLUDE) | PASS (All) | Wide on purpose. Subs must not equal this list. |
| Family → Toddlers | `isToddlerChip` → `isToddlerPlace` ∧ `placeAllowed("family","toddlers")` | LIB-FIRST | Parrish Community Park (`exec`, park + playground). Bishop **out**. Kids Empire **out** (high-intensity veto). Ca’ d’Zan **out**. **Detwiler’s Farm Market in** (`exec`, `\bfarm\b`) | PASS with softness | #955: not the 222-list. Distinct from Kids / Rainy on executed fixtures. Farm-market-as-toddler is a name/type stretch. |
| Family → Kids | `isKidsChip` → `isKidsPlace` ∧ `placeAllowed("family","kids")` | LIB-FIRST | Kids Empire; Pomegranate Frozen Yogurt (`exec`). Intense Escape **out**. Premier-class adult escape **out**. Ca’ d’Zan **out** | PASS | #955 lock. First-10 must not equal Toddlers or Rainy (guarded in `test-browse-library.mjs` on a fixture; live home first-10 not captured). |
| Family → Grown-ups too | `isGrownupsChip` → `isFamilyDiningPlace` ∧ `placeAllowed("family","adults")` | LIB-FIRST | Keke’s; Fleming’s; First Watch; BBQ; Ryan’s; Peggy’s; Good Liquid; Shake Station (`exec`) | PASS (chip is dining) | This chip *is* kid-welcome food. Overlap with Food is genuine. Must not equal Toddlers / Kids / Rainy. |
| Family → Rainy day | `isRainyChip` → `isRainyDayPlace` ∧ `placeAllowed("family","rainy")` | LIB-FIRST | Bishop (`exec`). Ca’ d’Zan **out**. Tibbals / Ringling circus **out**. Riverwalk **out**. Siesta Key Beach **out** | PASS | #955 lock. Indoor family rooms only. Mansion / campus / outdoor park / beach fail. |
| Stays → All | `isStayPlace` → `placeAllowed("hotels","all")` | NO-LIB for the helper; home All **does** `_invAll` via `/api/hotels` (owned) | **Live `hotels-api`:** 1. Palmetto Riverside Bed & Breakfast 2. Kompose Hotel 3. Homewood Suites by Hilton 4. Home2 Suites by Hilton Lakewood Ranch 5. Hampton Inn & Suites | PASS | First 5 are lodging. Owned list is distance-then-rating, not Google. Tail of the same 40 includes **Stoneybrook** (likely residential) and generic “Guesthouse” / “Wyndham Hotels & Resorts” with no rating — not in the first 5, still a list-hygiene risk. |
| Stays → Luxury | `isLuxuryStayChip` → hotels All ∧ `/luxury\|ritz\|…\|\bresort\b/` | **NO-LIB** (Google “luxury hotels”) | If the unused predicate ran on the owned 40: Palmetto Marriott Resort & Spa; Golden Host Resort; Longboat Key Club & Resort (`exec`) | **FAIL** | (1) Predicate is **not on the home wire** — chip is Google top-20, same class as pre-#951 Cafés. (2) `\bresort\b` makes Golden Host Resort “luxury.” (3) First-10 can collapse toward All if Google returns the same coastal hotels. |
| Stays → Budget | `isBudgetStayChip` → hotels All ∧ motel/inn/suites/super 8/… | **NO-LIB** | If the unused predicate ran: Homewood Suites; Home2 Suites; Hampton Inn & Suites; Super 8; Red Roof Inn Ellenton; Days Inn; Motel 6 (`exec`) | **FAIL** | Same wire hole. `\bsuites\b` / `\binn\b` swallows Hilton Homewood and Country Inn — not a budget identity. |
| Stays → Beach | `isBeachStayChip` → hotels All ∧ `/beach\|gulf\|ocean\|\bisland\b\|\bkey\b/` | **NO-LIB** | Compass Hotel Anna Maria Sound **misses** (`exec`, no token). Longboat Key Club & Resort **hits** (`key` + `resort`) | **FAIL** | Unused on the wire. Name tokens miss “Anna Maria Sound” and hit any “Key” lodging. |
| Stays → Boutique | `isBoutiqueStayChip` → hotels All ∧ `/boutique\|historic/` | **NO-LIB** | 0 of the live owned first-12 (`exec`). Palmetto Riverside B&B does **not** match | **FAIL** | Unused on the wire. Near-empty predicate. Live chip is Google “boutique hotels,” not this function. |
| Shopping → All | `isShoppingPlace` → `placeAllowed("shopping","all")` | NO-LIB (union; markets re-gated out of All) | Ellenton Premium Outlets (`exec` mall). **Pomegranate Frozen Yogurt also passes** (`exec`) | **FAIL** | `dessert_shop` / `ice_cream_shop` match CAT_ALLOW.shopping via `shop`. A yogurt counter is not shopping. Markets (Detwiler’s) are supposed to stay **out** of All (home re-gate); dessert shops were not in that rule. |
| Shopping → Malls | `isMallPlace` → `shopping_mall\|department_store\|outlet_mall` NARROW | LIB-FIRST | Ellenton Premium Outlets (`exec`) | PASS (contract) / live unread | Not All. |
| Shopping → Boutiques | `isBoutiqueShopPlace` → clothing/jewelry NARROW | LIB-FIRST | (no typed independent boutique in fixture) | PASS with known honesty limit | Contract admits Ross / Old Navy / Burlington (`clothing_store`). Documented in `placeFilter.js`. Chip no longer equals All; “boutique” still overclaims. |
| Shopping → Markets | `isMarketPlace` → `market\|farmers_market\|flea_market` NARROW | LIB-FIRST | Detwiler’s Farm Market (`exec`) | PASS | Name+type market. Grocery-as-Food stays out of Food; this is the owned home for it. |
| Shopping → Outlets | `isOutletPlace` → `outlet` (name fallback; no `outlet_mall` type in inventory) | LIB-FIRST | Ellenton Premium Outlets (`exec`) | PASS | Name is the identity. Overlap with Malls is genuine (it is both). |
| Shopping → Gift Shops | `isGiftShopPlace` → types `gift_shop` only | LIB-FIRST | (no `gift_shop` in the typed fixture) | PASS (contract) / live unread | Types only. Name “gift” must not admit a random store (v6.64). |

### Sibling tightness (executed membership, not live first-10 screenshots)

| Pair | Same first-class membership? | Verdict |
|---|---|---|
| Food All vs Dinner vs Quick bites vs Delivery | **Yes — identical on a mixed food fixture** | **FAIL** (222-list class) |
| Food Breakfast vs Cafés | High overlap (Keke’s, First Watch, Ryan’s, DNA) | PASS as genuine coffee/breakfast overlap; Cafés is still soft |
| Food Lunch vs Breakfast / Cafés / Desserts | Distinct | PASS (#951) |
| Food Desserts vs All | Distinct | PASS |
| Night out All vs Bars / Clubs / … | Distinct contracts | PASS (Bars name-tail is a separate FAIL) |
| Activities Beaches vs Outdoors | Shared real beaches; Beaches is stricter | PASS (genuine). Outdoors B&B leak is a separate FAIL |
| Activities Beaches vs Museums / Rainy | No Ca’ d’Zan on Beaches or Rainy | PASS (#955) |
| Family Toddlers vs Kids vs Rainy | Distinct on the #955 fixture (guarded) | PASS. Live home first-10 not re-photographed this pass |
| Family All vs a sub | All is the union | PASS (All vs sub is allowed) |
| Stays All vs Luxury / Budget / Beach / Boutique | Predicates unused on the wire → live lists can collapse to Google “hotels” | **FAIL** (wire). If predicates ran, they would differ, but Luxury/Budget tokens are too loose |
| Shopping Malls vs Outlets | Ellenton is both | PASS (genuine dual identity) |
| Shopping All vs Markets | Markets re-gated out of All in `_fetchAt` | PASS (by home re-gate, not by CAT_ALLOW alone) |

### Locked already — still green on execution

| Lock | Status |
|---|---|
| #951 Food → Cafés / Lunch read owned library; Lunch #1 is not a breakfast-only primary | PASS |
| #955 Family Toddlers / Kids / Rainy are three identities; Ca’ d’Zan off Rainy and off Activities → Beaches | PASS |
| Trust 2026-08-26 Family split / beach mansion | PASS on `chipIdentity` |

### Not covered by #955 (as instructed)

Night out (except the older Clubs contract), Stays subs, Food beyond Cafés/Lunch/Breakfast/Desserts, Shopping All `shop` substring, Activities Outdoors name-tail on lodging.

---

*End of table. Stop.*
