# Surface parity audit -- SEO landing pages (Parrish, before-fix)

Generated: 2026-09-23T18:42:43.381Z

```json
{
  "level": "seo-landing",
  "base": "https://www.gowayfind.com",
  "city": "parrish",
  "radiusM": 27359,
  "specs": {
    "restaurants": {
      "cat": "food",
      "sub": "all"
    },
    "things-to-do": {
      "cat": "attractions",
      "sub": "all"
    },
    "beaches": {
      "cat": "beach",
      "sub": "beaches"
    },
    "nightlife": {
      "cat": "nightlife",
      "sub": "all"
    }
  },
  "note": "Ground truth = top of computeEligibleSet's score-ordered list (the real chipIdentity->rankInventory pipeline). A row exists for every one of the TOP 20 eligible places per category that the production landing page's rendered HTML does not carry. Landing pages are SSG/ISR with no client pagination, so an eligible place absent here is invisible to both readers and crawlers -- the SEO-facing form of the same capped/unordered-read defect."
}
```

## Summary

- Pairs checked: **1996**
- Eligible pairs (source_present): **1996**
- FAIL: **48**
- Distinct places affected: **48**

| root cause | count |
| --- | --- |
| eligibility_passed_api_omitted | 48 |
| api_included_ui_omitted | 0 |
| map_list_mismatch | 0 |
| pagination_invisibility | 0 |
| cache_drift | 0 |
| dedupe_suppression_error | 0 |
| location_origin_mismatch | 0 |
| seasonal_tagging_gap | 0 |

## Failing rows

| place_id | name | city | eligible_for | API_present | rendered | map_present | page/pagination | root_cause |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChIJ69ZcEwQlw4gRpx9RhNkxcYE | C & K Smokehouse BBQ | Parrish | food:all | false | false |  | "{""rank"":1,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJqzsAbq4lw4gR46Lr7T6Fgi4 | P J's Sandwich Shop | Parrish | food:all | false | false |  | "{""rank"":2,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJK-PZyBElw4gR74Z1Z58fLA0 | Aqua Tequila | Parrish | food:all | false | false |  | "{""rank"":3,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJYfzA4SUlw4gRnPt72baj7pU | First Watch | Parrish | food:all | false | false |  | "{""rank"":4,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJ0enaRRklw4gRbih-Q1wLFok | Restaurant iDalia | Parrish | food:all | false | false |  | "{""rank"":6,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJsTne71Alw4gRtIgWq3kXD94 | 3Natives | Parrish | food:all | false | false |  | "{""rank"":7,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJ8UrJfl0jw4gRiQDiFPPWabo | American Honey Creamery and Coffee Co. | Parrish | food:all | false | false |  | "{""rank"":9,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJIRddWIMlw4gRnLfSvvcA76Y | Gulley's | Parrish | food:all | false | false |  | "{""rank"":10,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJZW-6RgAjw4gRDVp3TtAFsaM | Oar & Iron | Parrish | food:all | false | false |  | "{""rank"":11,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJUXMXELw9w4gR4TGRAD8NghQ | Vampire Penguin | Parrish | food:all | false | false |  | "{""rank"":12,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJdwZ5rFYjw4gRE4bKJxlG17A | Butterfields Family Restaurant | Parrish | food:all | false | false |  | "{""rank"":13,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJeynD5C0lw4gRLd7l0-FF988 | OSAKA Sushi & Grill | Parrish | food:all | false | false |  | "{""rank"":14,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJu3mmJlU9w4gRX3KqQYNgeuk | Tookies and Treats Bakery Shop | Parrish | food:all | false | false |  | "{""rank"":16,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJWyTNmKojw4gR_ewI6bzBwno | Publix Super Market at Gateway Commons | Parrish | food:all | false | false |  | "{""rank"":17,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJE_R_oOkkw4gRdAIx8XLGFBQ | Michelangelo 301 Pizza | Parrish | food:all | false | false |  | "{""rank"":18,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJhYw136klw4gRZTEwF75nL_Y | Papa Johns Pizza | Parrish | food:all | false | false |  | "{""rank"":19,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":1098}" | eligibility_passed_api_omitted |
| ChIJnZd7698lw4gRSrCg7Tn6onY | Elite Medical Spa of Parrish | Parrish | attractions:all | false | false |  | "{""rank"":0,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJHaRHOlQlw4gRVVkd3p9kigQ | MassageLuXe Parrish | Parrish | attractions:all | false | false |  | "{""rank"":1,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJNfLLSBklw4gREMLRjzZ7mdE | Bakers Ranch Wedding Venue | Parrish | attractions:all | false | false |  | "{""rank"":2,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJJSK6DAolw4gR2-tcgDhSPVI | Parrish Community Park | Parrish | attractions:all | false | false |  | "{""rank"":4,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJhdITejIjw4gRDjqbf3gPSWQ | Crunch Fitness - Parrish | Parrish | attractions:all | false | false |  | "{""rank"":5,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJu9V8cNY6w4gR14jQbFoNfsE | Fort Hamer Park | Parrish | attractions:all | false | false |  | "{""rank"":7,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJDUMIR-Qjw4gR_Wi3JOkVEJ0 | Sun Tanner: Wellness & Tanning Spa | Parrish | attractions:all | false | false |  | "{""rank"":8,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJx0zhIwo9w4gRzwLiq_RT1Bg | Blue Door Spa Ellenton | Parrish | attractions:all | false | false |  | "{""rank"":9,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJf3I_7J8lw4gR29qaAjl8OKk | Ahh Just Relax! | Parrish | attractions:all | false | false |  | "{""rank"":11,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJldW9k7D0s6kRh1y_dI1KXMw | Double Down Fishing Charters | Parrish | attractions:all | false | false |  | "{""rank"":12,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJ94UF6Jo8w4gRVpCB9EpriwA | Tom Bennett Park | Parrish | attractions:all | false | false |  | "{""rank"":15,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJTQ5vtFMow4gRgXnhbGgK2e0 | Little Manatee River State Park | Parrish | attractions:all | false | false |  | "{""rank"":17,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJfUYeWmAlw4gReflS439GCg0 | Gamble Creek Farms | Parrish | attractions:all | false | false |  | "{""rank"":18,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJWUyEEXojw4gRsFy9QmBgWq4 | Buffalo Creek Park | Parrish | attractions:all | false | false |  | "{""rank"":19,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":729}" | eligibility_passed_api_omitted |
| ChIJhY2ZLlPfwogRInh0mhpVusk | Bahia Beach | Parrish | beach:beaches | false | false |  | "{""rank"":15,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":17}" | eligibility_passed_api_omitted |
| ChIJfT0ICjcQw4gRoI9vij9_77s | "Holmes Beach, Florida" | Parrish | beach:beaches | false | false |  | "{""rank"":16,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":17}" | eligibility_passed_api_omitted |
| ChIJ1ajZI7Ajw4gRquist_-IpXI | Jaxx Wing Co. - Palmetto | Parrish | nightlife:all | false | false |  | "{""rank"":1,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJ989G5wU7w4gRn7UHu-cuzJo | Loaded Cannon Distillery | Parrish | nightlife:all | false | false |  | "{""rank"":2,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJ6dA5zbshw4gRoGDqdyieauE | Waypoint Bar & Grill | Parrish | nightlife:all | false | false |  | "{""rank"":3,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJUUIQJqciw4gR5o8AzOxiMRs | Peggy’s Corral | Parrish | nightlife:all | false | false |  | "{""rank"":4,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJpX2t2-AXw4gRsUxHGrnwBfM | The Clam House Bar & Grill | Parrish | nightlife:all | false | false |  | "{""rank"":7,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJh6rNQdQ7w4gRqqWIL5j9Q9k | 3 Car Garage Brewing | Parrish | nightlife:all | false | false |  | "{""rank"":8,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJLykIX_AXw4gRBijggj7UtYo | Jaxx Wing Co. | Parrish | nightlife:all | false | false |  | "{""rank"":9,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJ_9_PFFk9w4gRlFYnnw20YHA | Jaxx Sportsbar and Grill | Parrish | nightlife:all | false | false |  | "{""rank"":10,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJ5TCV780Xw4gR9tilZdFHw24 | McCabe's Irish Pub | Parrish | nightlife:all | false | false |  | "{""rank"":11,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJ14-Hmc0Xw4gRzZYgIy6qqAA | The Loaded Barrel Tavern | Parrish | nightlife:all | false | false |  | "{""rank"":12,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJd4rV2zvXwogRQr4Dtairzjw | The Local Brew Company | Parrish | nightlife:all | false | false |  | "{""rank"":13,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJbYs4syc8w4gRmXV_dN-rLrw | Paddy Wagon Irish Pub | Parrish | nightlife:all | false | false |  | "{""rank"":14,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJk6Kbjs0Xw4gR13VkF4VZNTM | Jennings downtown | Parrish | nightlife:all | false | false |  | "{""rank"":15,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJf_zGtR07w4gR3i1LY_zZjmM | Inner Compass Brewing Company at LWR | Parrish | nightlife:all | false | false |  | "{""rank"":16,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJl8M4kM0Xw4gR342n1tkVjCs | Cork's Cigar Bar | Parrish | nightlife:all | false | false |  | "{""rank"":17,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
| ChIJqcGZ0vU9w4gRXLMbMNJdlqc | Hi Way Bar | Parrish | nightlife:all | false | false |  | "{""rank"":19,""page"":null,""offset"":null,""n"":null,""hasMore"":null,""pageReachable"":false,""apiTotal"":null,""eligibleTotal"":152}" | eligibility_passed_api_omitted |
