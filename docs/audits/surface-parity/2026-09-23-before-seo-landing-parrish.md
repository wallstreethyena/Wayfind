# Surface parity audit -- SEO landing pages (Parrish, before-fix)

Generated: 2026-09-23T19:13:59.121Z

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
- FAIL pairs: **48**
- Distinct places affected (any class): **48**

| root cause | pairs | distinct places | distinct places (excl. Ryan's) |
| --- | --- | --- | --- |
| eligibility_passed_api_omitted | 48 | 48 | 48 |
| api_included_ui_omitted | 0 | 0 | 0 |
| map_list_mismatch | 0 | 0 | 0 |
| pagination_invisibility | 0 | 0 | 0 |
| cache_drift | 0 | 0 | 0 |
| dedupe_suppression_error | 0 | 0 | 0 |
| location_origin_mismatch | 0 | 0 | 0 |
| seasonal_tagging_gap | 0 | 0 | 0 |

## eligibility_passed_api_omitted — 48 (place, city) entries

| place_id | name | city | keys |
| --- | --- | --- | --- |
| ChIJ69ZcEwQlw4gRpx9RhNkxcYE | C & K Smokehouse BBQ | Parrish | food:all |
| ChIJqzsAbq4lw4gR46Lr7T6Fgi4 | P J's Sandwich Shop | Parrish | food:all |
| ChIJK-PZyBElw4gR74Z1Z58fLA0 | Aqua Tequila | Parrish | food:all |
| ChIJYfzA4SUlw4gRnPt72baj7pU | First Watch | Parrish | food:all |
| ChIJ0enaRRklw4gRbih-Q1wLFok | Restaurant iDalia | Parrish | food:all |
| ChIJsTne71Alw4gRtIgWq3kXD94 | 3Natives | Parrish | food:all |
| ChIJ8UrJfl0jw4gRiQDiFPPWabo | American Honey Creamery and Coffee Co. | Parrish | food:all |
| ChIJIRddWIMlw4gRnLfSvvcA76Y | Gulley's | Parrish | food:all |
| ChIJZW-6RgAjw4gRDVp3TtAFsaM | Oar & Iron | Parrish | food:all |
| ChIJUXMXELw9w4gR4TGRAD8NghQ | Vampire Penguin | Parrish | food:all |
| ChIJdwZ5rFYjw4gRE4bKJxlG17A | Butterfields Family Restaurant | Parrish | food:all |
| ChIJeynD5C0lw4gRLd7l0-FF988 | OSAKA Sushi & Grill | Parrish | food:all |
| ChIJu3mmJlU9w4gRX3KqQYNgeuk | Tookies and Treats Bakery Shop | Parrish | food:all |
| ChIJWyTNmKojw4gR_ewI6bzBwno | Publix Super Market at Gateway Commons | Parrish | food:all |
| ChIJE_R_oOkkw4gRdAIx8XLGFBQ | Michelangelo 301 Pizza | Parrish | food:all |
| ChIJhYw136klw4gRZTEwF75nL_Y | Papa Johns Pizza | Parrish | food:all |
| ChIJnZd7698lw4gRSrCg7Tn6onY | Elite Medical Spa of Parrish | Parrish | attractions:all |
| ChIJHaRHOlQlw4gRVVkd3p9kigQ | MassageLuXe Parrish | Parrish | attractions:all |
| ChIJNfLLSBklw4gREMLRjzZ7mdE | Bakers Ranch Wedding Venue | Parrish | attractions:all |
| ChIJJSK6DAolw4gR2-tcgDhSPVI | Parrish Community Park | Parrish | attractions:all |
| ChIJhdITejIjw4gRDjqbf3gPSWQ | Crunch Fitness - Parrish | Parrish | attractions:all |
| ChIJu9V8cNY6w4gR14jQbFoNfsE | Fort Hamer Park | Parrish | attractions:all |
| ChIJDUMIR-Qjw4gR_Wi3JOkVEJ0 | Sun Tanner: Wellness & Tanning Spa | Parrish | attractions:all |
| ChIJx0zhIwo9w4gRzwLiq_RT1Bg | Blue Door Spa Ellenton | Parrish | attractions:all |
| ChIJf3I_7J8lw4gR29qaAjl8OKk | Ahh Just Relax! | Parrish | attractions:all |
| ChIJldW9k7D0s6kRh1y_dI1KXMw | Double Down Fishing Charters | Parrish | attractions:all |
| ChIJ94UF6Jo8w4gRVpCB9EpriwA | Tom Bennett Park | Parrish | attractions:all |
| ChIJTQ5vtFMow4gRgXnhbGgK2e0 | Little Manatee River State Park | Parrish | attractions:all |
| ChIJfUYeWmAlw4gReflS439GCg0 | Gamble Creek Farms | Parrish | attractions:all |
| ChIJWUyEEXojw4gRsFy9QmBgWq4 | Buffalo Creek Park | Parrish | attractions:all |
| ChIJhY2ZLlPfwogRInh0mhpVusk | Bahia Beach | Parrish | beach:beaches |
| ChIJfT0ICjcQw4gRoI9vij9_77s | "Holmes Beach, Florida" | Parrish | beach:beaches |
| ChIJ1ajZI7Ajw4gRquist_-IpXI | Jaxx Wing Co. - Palmetto | Parrish | nightlife:all |
| ChIJ989G5wU7w4gRn7UHu-cuzJo | Loaded Cannon Distillery | Parrish | nightlife:all |
| ChIJ6dA5zbshw4gRoGDqdyieauE | Waypoint Bar & Grill | Parrish | nightlife:all |
| ChIJUUIQJqciw4gR5o8AzOxiMRs | Peggy’s Corral | Parrish | nightlife:all |
| ChIJpX2t2-AXw4gRsUxHGrnwBfM | The Clam House Bar & Grill | Parrish | nightlife:all |
| ChIJh6rNQdQ7w4gRqqWIL5j9Q9k | 3 Car Garage Brewing | Parrish | nightlife:all |
| ChIJLykIX_AXw4gRBijggj7UtYo | Jaxx Wing Co. | Parrish | nightlife:all |
| ChIJ_9_PFFk9w4gRlFYnnw20YHA | Jaxx Sportsbar and Grill | Parrish | nightlife:all |
| ChIJ5TCV780Xw4gR9tilZdFHw24 | McCabe's Irish Pub | Parrish | nightlife:all |
| ChIJ14-Hmc0Xw4gRzZYgIy6qqAA | The Loaded Barrel Tavern | Parrish | nightlife:all |
| ChIJd4rV2zvXwogRQr4Dtairzjw | The Local Brew Company | Parrish | nightlife:all |
| ChIJbYs4syc8w4gRmXV_dN-rLrw | Paddy Wagon Irish Pub | Parrish | nightlife:all |
| ChIJk6Kbjs0Xw4gR13VkF4VZNTM | Jennings downtown | Parrish | nightlife:all |
| ChIJf_zGtR07w4gR3i1LY_zZjmM | Inner Compass Brewing Company at LWR | Parrish | nightlife:all |
| ChIJl8M4kM0Xw4gR342n1tkVjCs | Cork's Cigar Bar | Parrish | nightlife:all |
| ChIJqcGZ0vU9w4gRXLMbMNJdlqc | Hi Way Bar | Parrish | nightlife:all |
