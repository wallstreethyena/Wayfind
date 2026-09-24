# Surface parity audit (browser level) — before-fix-browser-parrish-fixture-2026-09-23

Generated: 2026-09-23T19:43:51.166Z

```json
{
  "level": "browser",
  "base": "https://www.gowayfind.com",
  "label": "before-fix-browser-parrish-fixture-2026-09-23",
  "cities": [
    "custom"
  ],
  "keys": [
    "food:cafes"
  ],
  "radiusRequestedM": 27359,
  "radiusSnappedM": 32000,
  "reclassifiedNote": "2026-09-23 offline reclassification (WS2 follow-up): the 69 api_included_ui_omitted rows from the original browser capture were re-evaluated against outside_display_radius:/brand_collapse: via the REAL client gates (scripts/lib/parity/clientGates.mjs) using fresh direct-Supabase ground truth at the SAME captured origin/radius/sliderMi this file recorded. All 69 are now explained (58 outside_display_radius, 11 brand_collapse); 0 remain unexplained api_included_ui_omitted.",
  "cacheDriftPreFixObservation": "This captured run recorded apiResponseCount=152 (see pairSummaries[0]), WITH Ryans Coffee House present. A separate capture of the SAME production URL earlier the same day (2026-09-23, before this fix) returned 134 places WITHOUT it, both responses carrying x-vercel-cache: HIT -- the nondeterministic capped/unordered read cached at the CDN edge for ~24h, not a real change in eligibility. See --checkCacheDrift in scripts/surface-parity-audit.mjs for the automated post-fix regression check this observation motivated."
}
```

## Summary

- Pairs checked: **211**
- Eligible pairs (source_present): **211**
- FAIL pairs: **59**
- Distinct places affected (any class): **59**

| root cause | pairs | distinct places | distinct places (excl. Ryan's) |
| --- | --- | --- | --- |
| eligibility_passed_api_omitted | 59 | 59 | 59 |
| api_included_ui_omitted | 0 | 0 | 0 |
| map_list_mismatch | 0 | 0 | 0 |
| pagination_invisibility | 0 | 0 | 0 |
| cache_drift | 0 | 0 | 0 |
| dedupe_suppression_error | 0 | 0 | 0 |
| location_origin_mismatch | 0 | 0 | 0 |
| seasonal_tagging_gap | 0 | 0 | 0 |

## eligibility_passed_api_omitted — 59 (place, city) entries

| place_id | name | city | keys |
| --- | --- | --- | --- |
| ChIJc7NpREonw4gRqKlmr60I15A | Ella's Sweet Spot | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJAVpBNGElw4gR2Hh2qaL8la4 | Frosted Pink | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJPSkey7Elw4gR5gvfcin8NQc | Tuscan Hills Coffee Company | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJ_6CbWvzhwogRVqaYeaqJi6w | Southside Coffee Brew Bar | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJFSXdlLAlw4gRK8HfbT01-UY | Silverleaf Bread Co | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJzWjwvr_ZwogRgxGJNIKkhLI | The Healthy Spot FL | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJq-nbv7DZwogR40d6CEdYHnc | Armetta's Gelato & Caffè | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJLdTATpvhwogRRfR3upxt17Y | St. Pete Bakery Café | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJY_kA8nfjwogR1AhPPGA2k7o | Tealicious Cafe | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJLVbLmKDHBA8Rod1TXwVnuow | Paradeco Coffee Roasters @ SkyBeach Resort | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJuWIiRTAjw4gRDZ9UMpCXslg | The Blend (9510) Coffee & Cocktails | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJ75_T10bjwogRinmX-NdH7I4 | Cafe Clementine | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJ4WKSLz7ZwogRuNaPhuSnf1M | American Honey Creamery and Coffee Co. | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJCwyD8vHhwogRZvt6Q7M7Xbk | Pete's Bagels Drive Thru | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJeWH0FnfhwogROuk81Bd8_C0 | Black Crow Coffee Shop | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJvdgK6t_hwogRoUREbQ9hnTI | Daycation Coffee | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJgXnW94DhwogRvByd2uvhm6c | 11 Chicks Yummy Creations | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJ-dXwYevhwogR4fnuJd-YeZ0 | Bean Wandering Coffee Downtown | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJH3DNubrRwogRYmh4hiVWUHI | Gretchen's Goodies | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJccYEmQ7hwogRHWrSeUKWSeA | Uptown Eats | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJGUfpXgDjwogRUVleoMzQ1v0 | Crispy Avenue Caffe | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJzQI9X4HhwogRV--GFv9FWUU | City's Bistro | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJ2ckQoZzhwogRecV7YRopNd4 | TeBella Tea St. Pete | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJ5zWe-fzhwogR9SKxxEIiN1Y | Gypsy Souls Coffeehouse St. Pete & Gypsy Beans Coffee Roasters | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJTzoiienhwogRbPa3GpuvBQU | Paradeco Coffee Roasters | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJe5Ox97ECw4gR2fGQC-g97jc | Café Soleil | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJVzO7EWj9wogR97bcEQKnzJ4 | Tiki Bagel | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJLwJA4jfjwogRPZ6UOkUNl10 | 1Chick 1Bro Cafe Bistro | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJ8W_zEkDhwogRzOhHc7D_J1Y | Bad Mother | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJjejusGHhwogRHcHyw0OP1Lc | Neighborhood Joe | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJNVxs_YbhwogR_lrq-yc_YBI | Blush Tea and Coffee St Pete | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJfYXo7GfjwogRjEDK4RnJr8A | Bagel Babe Co. | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJMXRZ34bhwogR18X29qVsnLk | Lucky Cup Coffee Co. | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJB8gjMgAlw4gR93CI-p8no74 | Foxtail Coffee - North River Ranch | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJnXI9iVz9wogRuNTSboD6VtA | SumitrA Espresso Lounge + | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJ48kv0WzjwogRsxVzEuztReQ | Black Crow Coffee Co Grand Central Dist | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJIavfm5nhwogROZnbY0Pw98U | Cafe Gala | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJ_xxoW-3jwogR7jypN1_VMQ0 | Salty Pup Coffeehouse & Winebar | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJvcPn1ovjwogRdn0kBeTj2gU | Say Coffee House | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJRxyh-1DjwogR8PPwjlbgTUo | Valhalla Bakery St Pete | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJvxarZpvhwogRzkV8q1gTJ6k | Kahwa Coffee | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJN9sKYpbjwogRi6sY8V5GVhM | The Under Grounds Coffee Co | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJX66zL4zjwogRvDsuViZt1ng | The Crumb Factory Bakery & Cafe | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJyQ4tlTbhwogRXX9UPdd7jJY | Flatbread & Butter | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJGaYnOZjRwogR_PyYX-yJ6GI | Foxtail Coffee Co. - Riverview South | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJOyU5FsjdwogR24Wo9xaISGU | State Flour Bakery | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJLZ8gf8zjwogRXTIy_pQKG9w | Pete's Bagels | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJV1PLb7zhwogRIMMWNlR0pjw | Seymour’s Bagel Shop | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJgZF6Vu7hwogRpPHCbojSk7w | Forest Vibe | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| ChIJBYve1s3jwogRtpUeAgYSqdM | The Breeze Waterfront Cafe | Parrish (DEFAULT_CENTER/fixture) | food:cafes |
| _...9 more (see the .json)_ | | | |
