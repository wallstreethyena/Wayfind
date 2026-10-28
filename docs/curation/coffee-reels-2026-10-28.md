# Owner-submitted coffee reels, 2026-10-28

The owner requested these three places and their supplied native Instagram videos on Wayfind. Each requested post was inspected in Instagram's public browser UI. Creator credit and original Wayfind captions attach to the exact venue, without rehosting media, inventing reach, or claiming creator affiliation.

| Native reel | Credited creator | Exact place | Google place ID |
| --- | --- | --- | --- |
| De-JcqFISOV | jennabenna_s | Rose's at St. Pete Athletic, St. Petersburg | ChIJ6cPIn0fiwogRklWu_EbSja0 |
| DfCfX3whXW1 | stufftodointampabay | Farmer's Milk Cafe & Bakery, Wesley Chapel | ChIJYQCTNOCxwogR77eUWAEbqwQ |
| DfCcRklCSOC | cindy.selects | Bellabean, Bradenton | ChIJ6_hQr4AXw4gRwfUFqlfdRfA |

Native URLs are `https://www.instagram.com/reel/` followed by the shortcode and a trailing slash. Sharing query parameters are omitted.

- Rose's source tags `rosesatspa`, features the coffee cup bearing Rose's name, and names crispy potatoes and a Biscoff latte. Its [official menu](https://www.stpeteathletic.com/roses-menu) and [visit page](https://www.stpeteathletic.com/visit) identify the public restaurant at 680 28th St S, St. Petersburg, FL 33712. Normal Google Maps search exposed Rose's own `!19sChIJ6cPIn0fiwogRklWu_EbSja0` listing, coordinates 27.7630089, -82.6711636, rating 4.4 with 13 reviews. The separately listed athletic club has a different ID and is deliberately not used. No price or operating hours are copied into the registry.
- Farmer's Milk's native caption names the Wesley Chapel cafe, address 27049 Halter Lp, and pistachio eclair. Its existing inventory row matches the cafe; the Hollywood branch is not used.
- Bellabean's source names Bradenton and matches the owner's supplied caption screenshot. Its existing inventory row is operational and not excluded. The Halloween decorations are described as seasonal, without promising current menus or event dates.

The inventory statement below was applied insert-only for the missing Rose's card. An independent exact-ID database read confirmed all three rows are OPERATIONAL and not excluded, with the expected names and coordinates. Bellabean and Farmer's Milk needed no inventory overwrites. Deployment and live card checks are reported separately from prepared associations. The focused runtime check resolves each native reel exactly once on its intended place ID, preserves creator credit and original captions, produces the official Instagram embed, and rejects both other target venues plus the unrelated Hollywood Farmer's Milk and parent athletic-club identities.

```sql
insert into public.wf_inventory
 (place_id,name,lat,lng,category,tags,google_types,primary_type,metro,signals,status,source,needs_review,locked,excluded,secondary_categories,locality,county,last_verified_at,seen_at,refreshed_at)
values
 ('ChIJ6cPIn0fiwogRklWu_EbSja0','Rose''s at St. Pete Athletic',27.7630089,-82.6711636,'food',array[]::text[],array['restaurant'],'restaurant','st-pete','{"rating":4.4,"reviews":13}'::jsonb,'OPERATIONAL','creator_curation',false,false,false,array[]::text[],'St. Petersburg','Pinellas',now(),now(),now())
on conflict (place_id) do nothing
returning place_id,name,status,excluded;
```

New associations append to the registry so established creators retain their existing first-platform and first-spot ordering. No avatar asset or consent policy changes.
