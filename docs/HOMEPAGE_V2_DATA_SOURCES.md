# Wayfind Homepage V2 — Data Sources (have / need)

Ground rule for the whole V2 vision: **every signal must come from a real source or be
hidden.** No invented scores, no fake metrics. This maps each section's inputs to what's
already wired vs. what still needs a source.

---

## Beach Intelligence — BUILT & VERIFIED (this slice)

**It is location-general by design.** The engine takes the user's *current location* OR
*searched location* — whatever `center` the app already resolves — and decides per that
point. Proven live against Miami Beach (great), Santa Monica (blocked by active alert),
Ocean City NJ (blocked by rain), and inland Orlando (too far). Nothing is hardcoded.

**The built-in rule:**

```
center = current location OR searched location   // app already resolves this (wf_center → URL → geolocation)
beach  = nearest beach to center                 // from the EXISTING outdoors OSM layer (natural=beach), already cached in Supabase
dist   = haversine(center, beach) in miles       // existing helpers (lib/google.js, lib/orderInFeatured.js:nearestMetro)
cond   = getBeachConditions(beach.lat, beach.lng, dist)   // lib/marine.js
if cond.show → render "Today's Beach Pick" (that beach + live conditions)
else         → hide the section entirely (too far / unsafe / poor weather)
```

**Live, keyless sources (all verified returning real data):**

| Signal | Source | Keyless |
|--------|--------|---------|
| Water temperature, waves | Open-Meteo **Marine** API | ✅ |
| UV index, air temp, precip %, sunset | Open-Meteo Forecast (same provider `app/api/weather` uses) | ✅ |
| Rip-current / high-surf / beach-hazard / storm gate | **NWS active alerts** (`api.weather.gov/alerts/active?point=`) | ✅ |
| Today's high/low tides | **NOAA CO-OPS** Tides & Currents (nearest station) | ✅ |

**Files (this slice):** `lib/marine.js` (fetchers + `scoreBeachDay` scorer + `getBeachConditions`),
`app/api/beach/conditions/route.js` (fail-soft server route), `scripts/test-marine.mjs` (6 deterministic gate assertions).

**Thresholds are configurable** (`BEACH_DEFAULTS`: radius, min/max air temp, min water temp,
max UV, max rain %) — tune per market or move into `wf_cc_settings` later.

**Still needed to fully match the vision's "Display" list:** parking, amenities, crowd
prediction. Parking/amenities can come from Google Places details you already fetch. **Crowd
prediction has no free real source** — either drop it or derive a rough proxy from Places
"popular times" (unofficial) and label it as an estimate. Do not invent a number.

---

## The rest of V2 — source status

| Section | Signal(s) the vision asks for | Status | Source / note |
|---|---|---|---|
| **Live Picks** (hottest event) | ticket demand, trends, social, artist/venue popularity, distance, availability | ⚠️ partial | Ticketmaster (have) gives event + some popularity/availability. **Google Trends has no official API**; **social engagement needs a source** (none wired). Build the ranker on the signals you *have* (TM popularity + distance + availability) and add others only when sourced. |
| **Sports** (compact, by popularity) | league, popularity, distance | ✅ mostly | Ticketmaster classifications cover leagues + events; rank by TM popularity + distance. |
| **Morning Picks** (coffee, pre-11am) | cafés, photography, open-now | ✅ | Google Places (have) + `siteTime` for the 11am gate. Story copy is content, not data. |
| **Beach Intelligence** | weather, water, waves, UV, tides, alerts, distance | ✅ **built** | this slice. |
| **Things To Do / Food / Shopping** (curated collections) | curated sets, imagery, "locals recommend" | ✅ data / ⚠️ curation | Places + your editorial/inventory layers have the places. "Locals actually recommend" needs a defined signal (reviews count? your likes/events?) — pick one real definition. |
| **Personalization engine** (dynamic section order) | weather, time, location, popularity, season, holidays, saved places, crowds, traffic, trends | ⚠️ mixed | Weather/time/location/saved-places/your-own-events = have. Trends/social/crowds/traffic = need sources. Order sections on what's real; degrade gracefully. |

---

## Honest gaps to decide on (owner call)

1. **Google Trends** — no official API. Options: drop it, or use an unofficial/paid trends provider.
2. **Social engagement** — needs a real source (a social API or a paid signal provider) or drop it.
3. **Crowd prediction / live crowd levels** — no free authoritative source; Places "popular times" is unofficial. Label as estimate or omit.
4. **Traffic** — needs a maps/traffic API (Google/Mapbox) if it's to drive ranking.

Everything else in the vision is buildable on sources you already have.
