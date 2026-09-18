# Festival verification agent: one batch

You verify ONE batch of Florida festival leads and write ONE JSON file. You do
not edit any other file, run git, touch the database, or spend money.

## Input and output

* Input: `scripts/festivals/queue/batch-NNN.json` (the batch named in your task).
* Output: `scripts/festivals/verified/batch-NNN.json`, exactly this shape:

```json
{
  "batch": 7,
  "verified_by": "claude-sonnet",
  "verified_at": "2026-09-18T15:00:00Z",
  "publish": [ /* rows, format below */ ],
  "hold": [ { "event_name": "...", "start_date": "...", "reason": "...", "url": "..." } ]
}
```

Every lead ends up in exactly one of `publish` or `hold`. When done, run
`node scripts/festivals/validate.mjs scripts/festivals/verified/batch-NNN.json`
and fix every problem it prints until it says OK.

## The rule that matters most

The lead list comes from an aggregator. It is a TIP, never a source. A lead is
published only when the ORGANIZER's own page (the festival's site, the venue,
the city/county, or the organizing nonprofit) states THIS year's date(s).
Publish only what the organizer actually says. Thin but true beats detailed
but guessed.

Hold (with a one-line reason) when:
* the organizer page shows last year's dates, "TBA", "save the date" without a
  day, or no date at all;
* the organizer's dates differ from the lead and you cannot tell which is right
  (put both in the reason);
* the event is cancelled, postponed, moved out of Florida, or private/members-only;
* the only confirmation is Facebook, Eventbrite search, AllEvents or another
  aggregator (an organizer's own Eventbrite/ticket page IS fine as the ticket link);
* you cannot find a street address or coordinates for where it happens.

If the organizer's real dates differ from the lead but are clearly stated for
this year, publish the organizer's dates.

## How to verify each lead

1. Open `organizer_url_hint` with WebFetch. If it is dead, generic, or not the
   organizer, search the web for `"<event name>" <city> FL 2026` and find the
   organizer's page. Never cite festivalguidesandreviews.com.
2. Confirm: event name, date(s) for this year, city, venue and address, hours
   if stated, price/free if stated, ticket page if one exists.
3. Coordinates, free sources only (never Google):
   `curl -s "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=<urlencoded address>&benchmark=Public_AR_Current&vintage=Current_Current&format=json"`
   Take `result.addressMatches[0].coordinates.y` as lat, `.x` as lng, and
   `geographies.Counties[0].BASENAME` as county. If the Census finds nothing
   (parks often have no street number), try
   `curl -s -A "WayfindFestivalResearch/1.0 (gabrielpereira@me.com)" "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=<urlencoded venue, city, FL>"`
   (one request per second at most). Check the point is in the right city.
   No coordinates, no publish.

## Row format (every key below; `null` where the organizer does not say)

The values below are an illustration of the SHAPE only. They are not verified
facts about this event; never copy them.

```json
{
  "event_id": "oakland-park-latin-fest-2026",
  "event_series_id": "oakland-park-latin-fest",
  "slug": "oakland-park-latin-fest-2026",
  "year": 2026,
  "timezone": "America/New_York",
  "event_status": "scheduled",
  "city": "Oakland Park",
  "county": "Broward",
  "state": "FL",
  "category": "festival",
  "subcategory": "cultural-festival",
  "tags": ["festival", "cultural"],
  "audience": ["families", "adults"],
  "event_name": "Oakland Park Latin Fest",
  "short_title": "Latin Fest",
  "start_date": "2026-09-18",
  "end_date": "2026-09-18",
  "start_time": "18:00",
  "end_time": "22:00",
  "select_nights": false,
  "schedule_note": "Fri Sep 18, 6 to 10 PM",
  "venue": "Jaco Pastorius Park",
  "address": "4000 N Dixie Hwy, Oakland Park, FL 33334",
  "lat": 26.1718,
  "lng": -80.1331,
  "is_free": true,
  "price_min": null,
  "price_max": null,
  "card_hook": "Live Latin bands, dancing and food trucks in Jaco Pastorius Park.",
  "official_event_url": "https://www.oaklandparkfl.gov/601/Latin-Fest",
  "official_ticket_url": null,
  "source_url": "https://www.oaklandparkfl.gov/601/Latin-Fest",
  "source_type": "official-organizer",
  "source_tier": 1,
  "verification_confidence": "high",
  "last_verified_at": "2026-09-18T15:00:00Z",
  "verify_note": "2026-09-18: city events page states Sep 18 2026, 6 to 10 PM, free, Jaco Pastorius Park."
}
```

Field rules:
* `event_name` is the ORGANIZER's name for the event. When it differs from the
  lead's name, add `"lead_name": "<the lead event_name exactly>"` to the row so
  the validator can match it (it is never written to the database).
* `event_id` = `slug` = lowercase name with dashes + `-` + year (never the year
  twice). `event_series_id` = the same without the year.
* `year` = the start_date's year. `timezone` = `America/Chicago` only for the
  Panhandle west of the Apalachicola River (Pensacola, Destin, Panama City,
  Fort Walton Beach, Crestview, etc.), otherwise `America/New_York`.
* `category`: one of `festival`, `food`, `music`, `arts`, `seasonal`, `holiday`,
  `halloween`. Food/drink/BBQ/seafood/beer/wine fests are `food`; music
  festivals `music`; art shows and craft fairs `arts`; fall/pumpkin/harvest/farm
  fests `seasonal`; Christmas/lights/holiday markets `holiday`;
  Halloween/haunted `halloween`; everything else `festival`.
* `tags` always include `"festival"`. Add `"fall"` for Sep to Nov seasonal
  events, `"halloween"` for Halloween events, `"holiday"` for holiday events,
  `"family"` when the organizer says kid or family friendly.
* `card_hook`: one plain sentence, under 140 characters, from facts the
  organizer states. No long dashes, no hype words like "best" or "ultimate", no prices.
* `schedule_note`: short and human, e.g. `Sat Oct 3 to Sun Oct 4, 10 AM to 5 PM`.
  Write "to", never a long dash. Times go in `start_time`/`end_time` as `HH:MM`
  24h only when the organizer states them; otherwise `null`.
* `is_free`/`price_min`/`price_max`: only what the organizer states, else null.
* `official_event_url`: the organizer's page for this event. `source_url`: the
  page where you confirmed the date (usually the same). Both https.
* `verify_note`: `YYYY-MM-DD: <which page> states <what you confirmed>`.
* `last_verified_at` and `verified_at`: the real current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ`
  (run it via Bash). A time in the future is rejected by the database.
* Multi-weekend events (fairs, farm fests open select days) set
  `select_nights: true` and describe the days in `schedule_note`.

Work fast but never guess. When in doubt, hold.
