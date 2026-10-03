# Local calendar verification agent: one batch

You verify ONE batch of Tampa Bay event leads and write ONE JSON file. You do
not edit any other file, run git, touch the database, or spend money.

## Input and output

* Input: `scripts/local-calendars/queue/batch-NNN.json` (the batch named in your task).
* Output: `scripts/local-calendars/verified/batch-NNN.json`, exactly this shape:

```json
{
  "batch": 7,
  "verified_by": "claude-sonnet",
  "verified_at": "<real UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ`>",
  "publish": [ /* rows, format below; every row carries "lead_key" */ ],
  "hold": [ { "lead_key": "...", "event_name": "...", "reason": "...", "url": "..." } ]
}
```

Every series in the batch ends up answered: at least one publish row OR one
hold entry carrying its `lead_key` (the lead's `key`, copied exactly). When
done run `node scripts/local-calendars/validate.mjs scripts/local-calendars/verified/batch-NNN.json`
from the repo root and fix every problem until it prints OK.

## The rule that matters most

The leads come from a local media calendar (I Love the Burg / That's So
Tampa). It is a TIP, never a source. Never cite ilovetheburg.com,
thatssotampa.com or eventschaser.com anywhere in a row. Never copy their
wording. A date is published only when the ORGANIZER's own page (the venue,
the organizer's site, their own ticket page, the city or the nonprofit) states
it. Publish only what the organizer says. Thin but true beats detailed but
guessed.

Hold (one-line reason) when:
* the organizer page shows no date, last year's date, or "TBA";
* the organizer's date differs from the lead and you cannot tell which is right;
* cancelled, postponed, private, members-only, a class series needing
  registration for a closed group, a fundraiser golf tournament or gala that
  is really a donor event, or a recruiting/business-networking meeting;
* the only confirmation is Facebook search, Eventbrite search, AllEvents or
  another aggregator (an organizer's own Eventbrite or Facebook EVENT page that
  shows the date IS fine);
* no street address or coordinates for where it happens;
* **Ticketmaster rule:** the official ticket link is ticketmaster.com or
  livenation.com. Those shows already reach Wayfind through the live
  Ticketmaster feed with our affiliate link; a curated copy would compete with
  it. Hold with reason `ticketmaster-feed`. Leads with `ticketmaster_venue: true`
  are the likely ones, but check the real ticket destination (AXS, Etix,
  SeeTickets, the venue's own box office are NOT Ticketmaster: those publish).
* the official ticket link goes to a reseller (StubHub, Vivid Seats, eventschaser):
  find the primary seller or hold.

## Recurring series

`dates` lists every date the lead knows within the horizon. Confirm the
pattern on the organizer page (for example "every Saturday 9am to 2pm"). Publish
one row per date the organizer's pattern or calendar confirms, up to 10 rows
per series. A date the organizer contradicts is dropped (say so in a hold entry
with the same lead_key if NO date survives).

## How to verify each series

1. Open each `organizer_url_hints` URL with WebFetch. If none works or none is
   the organizer, search the web for `"<event name>" <city> FL 2026` and find
   the organizer's page.
2. Confirm: name, date(s), start/end time if stated, venue and street address,
   price or free if stated, age limit if stated (21+), ticket page if one exists.
3. Coordinates, free sources only (never Google):
   `curl -s "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=<urlencoded address>&benchmark=Public_AR_Current&vintage=Current_Current&format=json"`
   lat = `result.addressMatches[0].coordinates.y`, lng = `.x`, county =
   `geographies.Counties[0].BASENAME`. If Census finds nothing, try
   `curl -s -A "WayfindEventResearch/1.0 (gabrielpereira@me.com)" "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=<urlencoded venue, city, FL>"`
   (at most one request per second). The point must be in the right city.
   No coordinates, no publish. Reuse coordinates across rows of one series.

## Row format (every key; `null` where the organizer does not say)

Values below show the SHAPE only. They are not facts; never copy them.

```json
{
  "lead_key": "ilovetheburg:example-market",
  "event_id": "example-market-st-pete-2026-10-10",
  "event_series_id": "example-market-st-pete",
  "slug": "example-market-st-pete-2026-10-10",
  "year": 2026,
  "timezone": "America/New_York",
  "event_status": "scheduled",
  "city": "St. Petersburg",
  "county": "Pinellas",
  "state": "FL",
  "category": "community",
  "subcategory": "farmers-market",
  "tags": ["market", "local", "free", "outdoor"],
  "audience": ["families", "locals"],
  "event_name": "Example Market",
  "short_title": "Example Market",
  "start_date": "2026-10-10",
  "end_date": "2026-10-10",
  "start_time": "09:00",
  "end_time": "14:00",
  "select_nights": false,
  "schedule_note": "Every Saturday, 9am to 2pm.",
  "venue": "Example Park",
  "address": "100 Example St N, St. Petersburg, FL 33701",
  "lat": 27.77,
  "lng": -82.64,
  "is_free": true,
  "price_min": null,
  "price_max": null,
  "minimum_age": null,
  "card_hook": "Local farmers, hot breakfast and live music under the oaks every Saturday morning.",
  "official_event_url": "https://example.org/market",
  "official_ticket_url": null,
  "source_url": "https://example.org/market",
  "source_type": "official-organizer",
  "source_tier": 1,
  "verification_confidence": "high",
  "last_verified_at": "<real UTC time>",
  "verify_note": "2026-10-02: organizer page states every Saturday 9am to 2pm at Example Park."
}
```

Rules for the fields:
* `event_series_id` = slug of the event name, plus the city slug when the name
  is generic ("trivia-night-green-bench-st-pete"). Lowercase, a to z, 0 to 9, hyphens.
* ONE-OFF event (one date): `event_id` = `slug` = slugified name + `-2026`
  (the year of start_date; do not double a year already in the name). Run
  validate.mjs: it prints the exact id it expects.
* RECURRING series: `event_id` = `slug` = `<event_series_id>-<start_date>`.
* `category`: one of community, festival, music, food, arts, seasonal,
  halloween, holiday, sports, nightlife. Concerts are music; theater, comedy,
  galleries and film are arts; markets and walks are community; bar crawls and
  DJ nights are nightlife; anything Halloween-themed is halloween.
* `start_time`/`end_time`: "HH:MM" 24h, only when the organizer states them.
* `is_free`: true only when the organizer says free. When true, prices are null.
* `minimum_age`: 21 or 18 only when the organizer says so.
* `card_hook`: OUR words, under 140 characters, no long dashes (use "to" or a
  comma), no hype words (best, ultimate, epic, must-see). Say what you get out
  of going, based only on what the organizer states. Never copy the organizer's
  or the lead calendar's sentences.
* `schedule_note`: plain, e.g. "Sat Oct 10, doors 7pm, show 8pm." No long dashes.
* `verify_note`: starts with today's date then a colon, says what the organizer page states.
* `official_event_url` and `source_url`: the organizer page you confirmed on (https).
* `official_ticket_url`: the primary ticket page, https, or null.

Do not add any other key. Never invent a time, price, address or age.

## Lessons from the pilot batch (apply them)

* WebFetch is often refused by robots.txt (Facebook, some venues). Fall back to
  `curl -sL -A "Mozilla/5.0" <url>` in Bash and read the HTML. If the dates load
  by script, look for JSON-LD (`<script type="application/ld+json">`) in the HTML;
  VBO Tickets pages expose it at `https://plugin.vbotickets.com/googleeventschema/<event id>`.
* If the organizer lists MORE dates than the lead (still within the batch's
  `horizon_end`), publish them too, as a recurring series (up to 10 rows).
* Multi-day event with different hours each day: `start_time`/`end_time` null,
  hours in `schedule_note`.
* A public event that only asks for an RSVP is publishable; say "RSVP" in schedule_note.
* `is_free` true only on the organizer's own word. The lead's cost text is not evidence.
* The one-off `event_id` comes from YOUR `event_name` (the organizer's name for
  it). "&" becomes "and". Run validate.mjs early; it prints the exact id expected.
* Two leads that are the same event (same venue, same date): publish once, hold
  the other with reason `duplicate of <lead_key>`.
* `verification_confidence` is always "high" because only high gets published.
  If you are NOT sure (organizer time differs from the lead and you cannot
  settle it, the only page is a third-party listing, the page is login-walled),
  HOLD the series with the reason. Never mark a doubtful row high.
* A game or concert sold on Ticketmaster is held as `ticketmaster-feed`;
  MLB.com / team box office / AXS / Etix sales publish normally. If the
  organizer says SOLD OUT, hold it with reason `sold out` (a card nobody can
  act on wastes the slot).
