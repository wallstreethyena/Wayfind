# Florida festivals import (project runbook)

Owner request 2026-09-18: put every upcoming Florida festival from
festivalguidesandreviews.com/florida-festivals on Wayfind. This file is the
complete handoff: any agent can pick up from whatever state the queue is in.

## Status board (update when you finish a step)

| Step | State |
|---|---|
| 1. Scraper fixed, leads CSV (1,395 rows, 1,391 upcoming) | done 2026-09-18 |
| 2. Queue built (70 batches of 20, soonest first) | done 2026-09-18 |
| 3. Agents verify batches | done 2026-09-22: all 70 batches verified (582 publish, 809 hold, every one of the 1,391 leads accounted for) |
| 4. Publish verified rows to wf_events | done 2026-09-22: 429 new rows inserted (311 already live, 57 duplicates skipped) |
| 5. Render check on gowayfind.com | done 2026-09-22: `publish.mjs --verify` says 430 of 430 render |
| 6. Refresh monthly (new dates get announced) | recurring -- next: re-scrape, `make-batches.mjs` (it never rewrites an existing batch), then step 3 |

## Non-negotiables (owner rules, do not relax)

* The aggregator is a lead list, never a source. A row goes live only when the
  ORGANIZER's own page states this year's date. Publish only what the organizer
  says. Thin but true beats detailed but guessed. Dates the organizer has not
  announced yet stay on HOLD and get rechecked later.
* Free-first: coordinates come from the US Census geocoder or OpenStreetMap
  Nominatim. No Google Places calls, no paid APIs.
* Insert only. Never update or overwrite an existing wf_events row; the
  publisher skips any lead whose event_id, slug, or name + start date already
  exists.
* No schema change is needed or allowed here. If one ever seems necessary it
  follows the migration approval rule (git file, PR, owner approval first).
* Public copy (card_hook, schedule_note) uses no long dashes and no hype.
* "Done" means the card renders on gowayfind.com, not that a row was inserted.
  Keep three states separate: published and render-verified, published, HOLD.

## What the first full run cost (2026-09-22)

Three ways this pipeline lost real festivals without failing loudly. All three
are now guarded in `scripts/check-florida-festivals-import.mjs`; read them
before relaxing anything.

* `wf_events.audience` is NOT NULL and the row contract never checked it. THREE
  rows left it unstated and Postgres refused the ENTIRE 429-row insert (23502).
  "Not stated" is now an empty list at write time.
* The duplicate test matched on ANY shared name word. The 10 km radius has
  already forced both rows into the same town, so the town's own name proved
  nothing and killed real events ("Orlando Latino Fest" was refused as a
  duplicate of "Haunted 5K & 10K at Orlando"). It is a subset test now.
* A months-long season swallowed a weekend festival inside it, because
  everything overlaps a season. One shared word can no longer carry that match.

Agents run on the Mac's Claude subscription, which has a session limit. Hitting
it fails every in-flight batch instantly and harmlessly; wait for the reset and
re-run `run-agents.sh`, which skips whatever already validated.

## Files

* `scripts/festivals/scrape_florida_festivals.py` scraper (needs `beautifulsoup4`, `requests`).
* `scripts/festivals/florida_festivals.csv` lead snapshot.
* `scripts/festivals/make-batches.mjs` builds `queue/batch-NNN.json` (never rewrites an existing batch).
* `scripts/festivals/AGENT_BRIEF.md` the exact instructions each verification agent follows.
* `scripts/festivals/verified/batch-NNN.json` agent output: `publish[]` rows and `hold[]` reasons.
* `scripts/festivals/festivalRows.mjs` the one definition of a publishable row.
* `scripts/festivals/validate.mjs` checks batch files, and that every lead was published or held.
* `scripts/festivals/publish.mjs` `--dry`, `--sql`, `--apply`, `--verify`.
* `scripts/festivals/run-agents.sh` runs Sonnet agents over the queue in parallel.
* `scripts/check-florida-festivals-import.mjs` CI guard over the committed files.

## How to continue (copy these steps)

```bash
cd ~/Projects/wf-festivals            # worktree on branch festivals-import (or a fresh one from main)
unset NODE_ENV                        # this Mac's shell sets NODE_ENV=production, which skips dev tools
scripts/festivals/run-agents.sh 4     # verify every unfinished batch, 4 Sonnet agents at a time
node scripts/festivals/validate.mjs   # every file must say OK
set -a; source ../wayfind/.env.local; set +a
node scripts/festivals/publish.mjs --dry     # counts: live, duplicates, new
node scripts/festivals/publish.mjs --apply   # insert only, reads back every row, updates published.json
node scripts/festivals/publish.mjs --verify  # each slug must render on gowayfind.com/florida-events/<slug>
```

Commit `verified/`, `published.json` and logs-free changes through a normal PR
(guards green, preview, merge). The data write does not depend on a deploy:
curated events are read live from wf_events.

A FAILED batch: open `scripts/festivals/logs/batch-NNN.log`, fix the cause, delete
the bad `verified/batch-NNN.json`, rerun. Do not hand-edit facts into a batch
without opening the organizer page yourself.

## Lessons already paid for

* A festival can be live under a different name (Raprager). publish.mjs now skips a lead when a live row within 10 km has overlapping dates and shares a distinctive name word.
* wf_events refuses a `last_verified_at` in the future; use the real `date -u` time.
* The aggregator still listed Oakland Park Latin Fest after the city canceled it. Always open the organizer page.

## Monthly refresh

1. Rerun the scraper into a new dated CSV and `make-batches.mjs --csv <new>` into a
   new queue folder (or clear the old queue after everything in it is published or held).
2. Re-verify every HOLD whose start date is within 90 days: organizers usually
   announce dates 1 to 3 months ahead.
3. Publish and verify as above.

## Where the festivals show up

Curated wf_events rows feed /florida-events, each event page at
/florida-events/<slug>, and the event rails ("Happening This Weekend", "Coming Up",
tag rails such as "Spooky Season"). A row with no hero_image gets a same-category
stock scene from the existing ladder (app/api/events/route.js curatedSceneImage),
never an invented photo of the event.
