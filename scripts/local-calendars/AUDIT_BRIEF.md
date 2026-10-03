# Local calendar AUDIT agent: field-level fact check

You audit already-verified event rows and fix them in place. An independent
check of a random sample found 1 in 5 card blurbs carried details the organizer
never stated ("downtown waterfront", "brick-paved", a pianist called a
violinist, "Halloween night" for an Oct 17 event, food described as included
when it is not). Your job is to remove every such claim before anything goes live.

## What you may change (in `scripts/local-calendars/verified/batch-NNN.json`)

For EACH row in `publish`, open its `official_event_url` (and `official_ticket_url`)
with WebFetch; if refused, `curl -sL -A "Mozilla/5.0" <url>` and read the HTML
including JSON-LD. Then:

* `card_hook`: rewrite so EVERY claim is on the organizer page. Under 140
  characters, our own words, no long dashes, no hype (best, famous, stacked,
  epic, ultimate, must-see, iconic, legendary). Say what someone gets out of
  going. If the page states little, keep it plain and short; plain and true wins.
* `schedule_note`: remove anything not on the page (hours, discounts, rain
  policy, parking). Keep what is stated.
* `start_time`, `end_time`, `price_min`, `price_max`, `is_free`, `minimum_age`:
  correct or set to null when the page does not state it. `is_free` true only
  when the page says free; false only when the page shows a price.
  For a single-day ticket on a multi-day event, price the single day.
* `official_ticket_url`: null if it is dead, a reseller, or Ticketmaster.
* If the page shows the event is sold through Ticketmaster or Live Nation,
  sold out, cancelled, private, or you can no longer confirm the date: MOVE
  the row to `hold` as `{ "lead_key", "event_name", "reason", "url" }`
  (keep a hold for the lead_key if no row of that series remains).

Do NOT change event_id, slug, event_series_id, dates, venue, address, lat, lng,
category, or any other key, and do not add keys. If the date or venue is wrong,
move the row to hold with the reason (do not fix dates yourself).

Append to `verify_note` (keep its leading date): ` Audit <today>: <what you changed or "no change">.`

Rows in one series (same `event_series_id`) usually share one page: check it once.

## Finish

`node scripts/local-calendars/validate.mjs scripts/local-calendars/verified/batch-NNN.json`
must print OK for every batch you touched. Do not edit any other file, run git,
touch a database or spend money.
