# Proposal: 2026 Florida Christmas Event Occurrence & Schedule Corrections (`wf_events`)

> **STATUS: PARKED — PENDING EXPLICIT OWNER APPROVAL (NOT APPLIED)**
> Generated: `2026-11-18` | Updated: `2026-11-19` (Wave 3 official calendar re-verification) | Branch: `fix/carbon-w3-events` | Author: `@events` (Wayfind Map Intelligence Reliability Wave)

---

## 1. Root-Cause Summary

1. **Schema Gap in `public.wf_events`**:
   `wf_events` stores only `start_date`, `end_date`, `start_time`, `end_time`, `timezone`, `select_nights`, and free-text `schedule_note` — it has **no structured `occurrence_dates` or `visit_schedule` columns**. As a result, multi-week events must either be enumerated in checked-in code (`lib/eventOccurrencesVerified202611.js`) or parsed conservatively by `lib/scheduleNoteDays.js`.
2. **Code-Path Gaps Fixed in Waves 2–3**:
   - `lib/eventOccurrencesVerified202611.js` now carries verified 2026–2027 holiday/Christmas T1 occurrence lists (`mvmcp-2026`, `jollywood-nights-2026`, `legoland-fl-holidays-2026`, `frrm-north-pole-express-2026`, `frontyard-holiday-festival-at-dr-phillips-center-2026`, `symphony-in-lights-gulfstream-park-2026`, `stetson-mansion-christmas-2026`, plus Wave 3 additions `christmas-town-2026` and `seaworld-orlando-christmas-2026`).
   - `lib/mapDecisionEngine.js` (`evaluateEventEligibility`) handles venue-local timezones (`America/New_York` and Panhandle `America/Chicago`), `eventLocalClock` overnight carryover, `tomorrow` / `closed_day` / `canceled`, `select_nights: true` honesty (`unconfirmed_select_nights`), and weekday schedules.
   - `lib/searchCards.js` (`eventDoc` / `toCard`) preserves `event_id`, `event_status`, `start_time`, `end_time`, `timezone`, `closed_dates`, `canceled_dates`, and `recurring_schedule` when building search cards.
3. **Production `wf_events` Copy / Time Gaps Identified (`6` Rows Proposed Below — Strictly Separated)**:
   - **5 Verified T1 Schedule Additions**: Rows with authoritative T1 schedules where `schedule_note` omits `"Daily"` (`stetson-mansion-christmas-2026`), omits T1 select dates (`frrm-north-pole-express-2026`), omits individual `"18..31"` tokens (`legoland-fl-holidays-2026`), causes `scheduleExplicitDays` to override `"Nightly"` (`symphony-in-lights-gulfstream-park-2026`), or leaves `end_time` `NULL` for an explicit overnight party (`jollywood-nights-2026`).
   - **1 Unsupported-Schedule Disclaimer Cleanup (`santa-workshop-icon-park-2026`)**: Removes a misleading `"daily"` token from a disclaimer (`"Detailed daily timetable on event page is labeled 2024 and is not used for 2026..."`) so `scheduleWeekdays` does not misparse the disclaimer as a 7-day cadence. **This cleanup does NOT assert or verify a 2026 operating schedule.**

---

## 2. Key Investigations & Honesty Decisions

### A. Busch Gardens Christmas Town (`christmas-town-2026` / `busch-gardens-christmas-town-2026`, Tampa)
- **Current `wf_events` row**: `start_date = 2026-11-13`, `end_date = 2027-01-04`, `select_nights = true`, `schedule_note = "Select nights November 13 - January 4, included with park admission."`
- **Wave 3 Live T1 Verification (`2026-11-19`)**:
  - Rendered Playwright inspection of `https://buschgardens.com/tampa/events/christmas-town/` and the official interactive park-hours calendar widget at `https://buschgardens.com/tampa/park-info/theme-park-hours/` (backed by official Sitecore endpoint `https://buschgardens.com/api/sitecore/CalendarEvents/LoadCalendarData?...&sc_site=busch-gardens-tampa-bay` across Nov 2026, Dec 2026, and Jan 2027).
  - The official widget explicitly tags `"Christmas Town"` on **44 exact dates**:
    - **Nov 2026 (14)**: `2026-11-13`, `2026-11-14`, `2026-11-15`, `2026-11-19` through `2026-11-29`
    - **Dec 2026 (26)**: `2026-12-03` through `2026-12-06`, `2026-12-10` through `2026-12-31`
    - **Jan 2027 (4)**: `2027-01-01` through `2027-01-04`
  - Explicitly **omitted** on open park days `2026-11-16`, `2026-11-17`, `2026-11-18`, `2026-11-30`, `2026-12-01`, `2026-12-02`, `2026-12-07`, `2026-12-08`, `2026-12-09` (note: third-party Ride Ready had only 41 dates and missed Nov 19, Dec 3, Dec 10; only the official `buschgardens.com` calendar is used).
- **Decision**:
  Added all 44 T1-verified dates for `christmas-town-2026` (`slug: "busch-gardens-christmas-town-2026"`) to `lib/eventOccurrencesVerified202611.js`. No `wf_events` mutation required (`occurrenceDatesFor` supplies the 44 dates).

### B. SeaWorld Orlando Christmas Celebration (`seaworld-orlando-christmas-2026` / `seaworld-orlando-christmas-celebration-2026`, Orlando)
- **Wave 3 Live T1 Verification (`2026-11-19`)**:
  - Rendered Playwright inspection of `https://seaworld.com/orlando/events/christmas-celebration/` and the official interactive park-hours calendar widget at `https://seaworld.com/orlando/park-info/theme-park-hours/` (backed by official Sitecore endpoint `https://seaworld.com/api/sitecore/CalendarEvents/LoadCalendarData?...&sc_site=seaworld-orlando` across Nov 2026, Dec 2026, and Jan 2027).
  - The official widget explicitly tags `"Christmas Celebration"` on **44 exact dates**:
    - **Nov 2026 (16)**: `2026-11-06`..`2026-11-08`, `2026-11-13`..`2026-11-15`, `2026-11-20`..`2026-11-29`
    - **Dec 2026 (24)**: `2026-12-04`..`2026-12-06`, `2026-12-11`..`2026-12-31`
    - **Jan 2027 (4)**: `2027-01-01`..`2027-01-04`
  - Explicitly **omitted** on open park days `2026-11-09`..`2026-11-12`, `2026-11-16`..`2026-11-19` (including `2026-11-19` when the park closes at `4:00 PM`), `2026-11-30`, `2026-12-01`..`2026-12-03`, `2026-12-07`..`2026-12-10`.
- **Decision**:
  Added all 44 T1-verified dates for `seaworld-orlando-christmas-2026` (`slug: "seaworld-orlando-christmas-celebration-2026"`) to `lib/eventOccurrencesVerified202611.js`. No `wf_events` mutation required.

### C. The Santa Workshop Experience at ICON Park (`santa-workshop-icon-park-2026`, Orlando)
- **Live `wf_events` Row (`2026-11-19` read-only check)**:
  - `start_date = "2026-11-13"`, `end_date = "2026-12-24"`, `select_nights = true`
  - `schedule_note = "Reserve a current Santa session. Detailed daily timetable on event page is labeled 2024 and is not used for 2026; midnight-to-midnight calendar metadata is not an operating schedule."`
- **Wave 3 Live T1 Check (`2026-11-19`)**:
  - Approach 1 (`https://iconparkorlando.com/events/the-santa-workshop-experience/`): Page still publishes `Nov 13, 2026 - Dec 24, 2026` and `12:00 AM - 11:59 PM` event metadata, while the timetable section below is still explicitly labeled **`"Santa's Schedule for 2024"` / `"2024 ICON Park Santa Schedule"`** (`Fri 11/08`..`Tue 12/24`, `Thu 11/28: Closed for Thanksgiving`).
  - Approach 2 (`iconparkorlando.com` search + linked official Square booking site `https://santaworkshopexperience.square.site/`): No authoritative 2026 daily or select-dates operating schedule is published; the Square site exposes Square Appointments booking (`locationId: LK9HWBZQBX26J`) and hidden placeholder San Francisco hours.
- **Decision**:
  **Keep `santa-workshop-icon-park-2026` OUT of `VERIFIED_OCCURRENCES_2026_11` (`unknown` preserved -> `unconfirmed_select_nights`, `activeToday: false`).** Only propose removing the stale word `"daily"` from the disclaimer in `wf_events.schedule_note` (Section 3, Part B below) so `scheduleWeekdays` does not interpret the disclaimer as 7-day daily operation.

### D. Mickey's Very Merry Christmas Party (`mvmcp-2026`, Bay Lake / Lake Buena Vista)
- **Constraint Compliance (`AGENTS.md §8`)**: Zero automated HTTP requests were sent to `disneyworld.disney.go.com`. Verified strictly from the T1 Disney Parks Blog citation already stored in `data/christmas-2026-research.json` (line 1).
- **Authoritative T1 Source**:
  - URL: `https://disneyparksblog.com/wdw/mickeys-very-merry-christmas-party-dates-and-festive-details/` (Tier `T1`, checked `2026-10-13` in research packet)
  - Quote: `"25 select nights: Nov 8, 9, 12, 13, 15, 17, 19, 20, 24, 25, 27, 29; Dec 1, 3, 4, 6, 8, 10, 11, 13, 15, 17, 18, 20, 22"`
- **Behavior**:
  In `lib/eventOccurrencesVerified202611.js`. On `2026-11-18` ET -> `state: "tomorrow"`, `nextDate: "2026-11-19"`; on `2026-11-19` ET -> `activeToday: true`.

### E. Other Multi-Week Florida Holiday Events Audited
- **Verified Active / Scheduled via T1 Registry or Cadence**:
  - `symphony-in-lights-wiregrass-2026` (Wesley Chapel) — nightly through Dec 31
  - `symphony-in-lights-gulfstream-park-2026` (Hallandale Beach) — T1 verified nightly Nov 14–Dec 31 (`6–11 PM`)
  - `christmas-wonderland-at-tropical-park-2026` (Miami) — Mon–Thu 5–11 PM, Fri–Sat 5 PM–midnight, Sun 4–10 PM; closed Nov 16, Nov 30, Dec 7
  - `ripleys-christmas-park-hialeah-2026` (Hialeah) — Daily Nov 12–Jan 3 (`5–10 PM`)
  - `miracle-on-orange-2026` (Winter Park) — Mon 4 PM–12 AM, Tue–Thu 4 PM–12 AM, Fri–Sat 4 PM–2 AM, Sun 2 PM–12 AM
  - `misfit-bar-wink-wink-holiday-2026` (Sarasota) — Daily after 5 PM Nov 13–Dec 31
  - `utc-holidays-2026` (Sarasota) — Nightly light shows 6:30–9:30 PM Nov 14–Jan 3
  - `universal-orlando-holidays-2026` (Orlando) — Nightly Nov 14–Jan 3
  - `stetson-mansion-christmas-2026` (DeLand) — T1 verified daily tours Nov 1–Jan 17 except Thanksgiving, Dec 24, Dec 25, Dec 31, Jan 1
  - `mvmcp-2026` (Lake Buena Vista) — 25 T1 select nights
  - `jollywood-nights-2026` (Lake Buena Vista) — 15 T1 select nights
  - `christmas-town-2026` (Tampa) — 44 T1 select dates verified `2026-11-19` on `buschgardens.com`
  - `seaworld-orlando-christmas-2026` (Orlando) — 44 T1 select dates verified `2026-11-19` on `seaworld.com`
  - `legoland-fl-holidays-2026` (Winter Haven) — 26 T1 dates verified `2026-11-18` on `legoland.com`
  - `frrm-north-pole-express-2026` (Parrish) — 20 T1 dates verified `2026-11-18` on `frrm.org`
  - `frontyard-holiday-festival-at-dr-phillips-center-2026` (Orlando) — 27 T1 dates verified `2026-11-17`
- **Held Honestly as Unconfirmed (`activeToday: false`, NEVER `"Christmas event tonight"`)**:
  - `santa-workshop-icon-park-2026` (Orlando) — `unconfirmed_select_nights` (2024 timetable explicitly unused for 2026; re-checked `2026-11-19`)
  - `nightgarden-fairchild-2026` (Coral Gables) — `unconfirmed_select_nights`
  - `asian-lantern-festival-central-florida-zoo-2026` (Sanford) — `unconfirmed_select_nights`
  - `snowcat-ridge-2026` (Dade City) — `unconfirmed_select_nights`
  - `christmas-at-hobe-sound-farms-2026` (Hobe Sound) — `unconfirmed_select_nights`
  - `christmas-at-gaylord-palms-2026` (Kissimmee) — `unconfirmed_season_span`
  - `a-dickens-christmas-appleton-museum-2026` (Ocala) — `unconfirmed_season_span`
  - `fishermens-village-holiday-festival-of-lights-2026` (Punta Gorda) — `unconfirmed_season_span`

---

## 3. Proposed `wf_events` SQL Corrections (`6` Rows Total, Strictly Separated)

> **PARKED — PENDING EXPLICIT OWNER APPROVAL (`STOP FOR GABE`) — ZERO PRODUCTION ROWS MODIFIED**

### Part A — Verified T1 Schedule Additions (`5` Rows)

These 5 rows update `schedule_note` or `end_time` strictly from verified T1 organizer sources:

| `event_id` | Tier | Source URL | Checked | Before (Current Live Value) | After (Proposed Value) | Exact T1 Quote / Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `frrm-north-pole-express-2026` | `T1` | `https://www.frrm.org/north-pole-express/` | `2026-11-18` | `schedule_note`: `'Select evenings Nov 27 through Dec 22 2026. Departures 5:15 PM and 7:15 PM. About 3 hours 45 minutes.'` | `schedule_note`: `'Select evenings: Nov 27, 28, 29; Dec 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22 2026. Departures 5:15 PM and 7:15 PM. About 3 hours 45 minutes.'` | `"2026 Dates of Operation: The North Pole Express operates on select evenings from November 27 through December 22, 2026: November 27, 28, 29; December 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22"` |
| `legoland-fl-holidays-2026` | `T1` | `https://www.legoland.com/florida/things-to-do/seasonal-events/holidays-at-legoland/` | `2026-11-18` | `schedule_note`: `'Select days: November 21, 22, 27, 28, 29; December 5, 6, 12, 13, 18 through 31; January 1, 2, 3. Included with general park admission.'` | `schedule_note`: `'Select days: November 21, 22, 27, 28, 29; December 5, 6, 12, 13, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31; January 1, 2, 3. Included with general park admission.'` | `"Join the Jolliest Event of the Year on Select Dates: November - 21, 22, 27, 28, 29; December - 5, 6, 12, 13, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31; January - 1, 2, 3"` |
| `stetson-mansion-christmas-2026` | `T1` | `https://www.stetsonmansion.com/christmas-tours` | `2026-10-13` | `schedule_note`: `'Guided (about 60-70 min) and self-guided timed tours, Nov 1, 2026 to Jan 17, 2027; reservations required. Closed Thanksgiving, Dec 24, Dec 25, Dec 31 and Jan 1. Tour times vary by date.'` | `schedule_note`: `'Daily guided (about 60-70 min) and self-guided timed tours, Nov 1, 2026 to Jan 17, 2027; reservations required. Closed Thanksgiving, Dec 24, Dec 25, Dec 31 and Jan 1. Tour times vary by date.'` | `"Daily tours Nov 1 2026 to Jan 17 2027; closed Thanksgiving, Dec 24, Dec 25, Dec 31 and Jan 1"` (`data/christmas-2026-research.json`) |
| `symphony-in-lights-gulfstream-park-2026` | `T1` | `https://www.gulfstreampark.com/event/entertainment%2Fsymphony-in-lights-holiday-celebration-dec-6-dec-31/` | `2026-11-18` | `schedule_note`: `'Nightly 6–11 PM; light show at the top of each hour. Selfies with Santa + snow shows Sat Nov 28, Dec 5, Dec 12, Dec 19 and Thu Dec 24. Free.'` | `schedule_note`: `'Nightly 6–11 PM; light show at the top of each hour (Selfies with Santa + snow shows Sat Nov 28, Dec 5, Dec 12, Dec 19 and Thu Dec 24). Free.'` | `"Running nightly from Nov 14 – Dec 31, 2026 ... Nightly from 6 –11 PM ... Selfies with Santa + Snow Shows: Sat Nov 28, Dec 5, Dec 12, Dec 19, Thu Dec 24"` |
| `jollywood-nights-2026` | `T1` | `https://disneyparksblog.com/wdw/disney-jollywood-nights-dates-tickets-and-more/` | `2026-10-13` | `end_time`: `NULL` | `end_time`: `'00:30:00'` | `"Select nights: Nov 7, 14, 16, 21, 23, 28; Dec 5, 7, 12, 14, 19, 21, 23; Jan 3, 5 ... festivities 7:30 PM to 12:30 AM ET"` (`data/christmas-2026-research.json`) |

### Part B — Unsupported-Schedule Disclaimer Cleanup (`1` Row: `santa-workshop-icon-park-2026`)

> **IMPORTANT**: This row **does NOT assert or add a verified 2026 schedule**. Official `iconparkorlando.com/events/the-santa-workshop-experience/` (re-checked `2026-11-19`) still displays `"Santa's Schedule for 2024"` and `"12:00 AM - 11:59 PM"`, and `santaworkshopexperience.square.site` does not publish a 2026 daily/select-dates calendar. Accordingly, `santa-workshop-icon-park-2026` remains **OUT** of `VERIFIED_OCCURRENCES_2026_11` (`unknown`, `select_nights = true`, `unconfirmed_select_nights`). This SQL change **ONLY removes the unsupported, misleading `"daily"` token from the existing disclaimer** so `lib/scheduleNoteDays.js` (`scheduleWeekdays`) stops parsing `"Detailed daily timetable..."` as a 7-day weekly cadence.

| `event_id` | Tier | Source URL | Checked | Before (Current Live Value) | After (Proposed Disclaimer Cleanup Only) | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| `santa-workshop-icon-park-2026` | `T1` (no 2026 schedule published) | `https://iconparkorlando.com/events/the-santa-workshop-experience/` | `2026-11-19` | `schedule_note`: `'Reserve a current Santa session. Detailed daily timetable on event page is labeled 2024 and is not used for 2026; midnight-to-midnight calendar metadata is not an operating schedule.'` | `schedule_note`: `'Reserve a current Santa session. The 2024 timetable on the event page is not used for 2026; midnight-to-midnight calendar metadata is not an operating schedule.'` | Removes misleading `"daily"` token from disclaimer without claiming any 2026 operating schedule (`select_nights` remains `true`; `start_time`/`end_time` remain `NULL`). |

---

### Forward SQL (`BEGIN` ... `COMMIT`) — Separated Part A + Part B

```sql
BEGIN;

-- ============================================================================
-- PART A: VERIFIED T1 SCHEDULE ADDITIONS (5 rows)
-- ============================================================================

-- 1. frrm-north-pole-express-2026: include all 20 T1 dates in schedule_note
UPDATE public.wf_events
SET schedule_note = 'Select evenings: Nov 27, 28, 29; Dec 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22 2026. Departures 5:15 PM and 7:15 PM. About 3 hours 45 minutes.'
WHERE event_id = 'frrm-north-pole-express-2026';

-- 2. legoland-fl-holidays-2026: enumerate Dec 18..31 explicitly so all parsers read all 26 dates
UPDATE public.wf_events
SET schedule_note = 'Select days: November 21, 22, 27, 28, 29; December 5, 6, 12, 13, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31; January 1, 2, 3. Included with general park admission.'
WHERE event_id = 'legoland-fl-holidays-2026';

-- 3. stetson-mansion-christmas-2026: preserve "Daily" cadence alongside closed holidays
UPDATE public.wf_events
SET schedule_note = 'Daily guided (about 60-70 min) and self-guided timed tours, Nov 1, 2026 to Jan 17, 2027; reservations required. Closed Thanksgiving, Dec 24, Dec 25, Dec 31 and Jan 1. Tour times vary by date.'
WHERE event_id = 'stetson-mansion-christmas-2026';

-- 4. symphony-in-lights-gulfstream-park-2026: parenthesize Santa/snow dates so Nightly 6-11 PM governs
UPDATE public.wf_events
SET schedule_note = 'Nightly 6–11 PM; light show at the top of each hour (Selfies with Santa + snow shows Sat Nov 28, Dec 5, Dec 12, Dec 19 and Thu Dec 24). Free.'
WHERE event_id = 'symphony-in-lights-gulfstream-park-2026';

-- 5. jollywood-nights-2026: populate verified overnight end_time (00:30:00 ET)
UPDATE public.wf_events
SET end_time = '00:30:00'
WHERE event_id = 'jollywood-nights-2026' AND end_time IS NULL;

-- ============================================================================
-- PART B: UNSUPPORTED-SCHEDULE DISCLAIMER CLEANUP (1 row — NO 2026 schedule asserted)
-- ============================================================================

-- 6. santa-workshop-icon-park-2026: remove stale "daily" token from 2024 disclaimer only
UPDATE public.wf_events
SET schedule_note = 'Reserve a current Santa session. The 2024 timetable on the event page is not used for 2026; midnight-to-midnight calendar metadata is not an operating schedule.'
WHERE event_id = 'santa-workshop-icon-park-2026';

COMMIT;
```

### Exact Rollback SQL (`BEGIN` ... `COMMIT`) — Separated Part A + Part B

```sql
BEGIN;

-- ============================================================================
-- PART A ROLLBACK: VERIFIED T1 SCHEDULE ADDITIONS (5 rows)
-- ============================================================================

UPDATE public.wf_events
SET schedule_note = 'Select evenings Nov 27 through Dec 22 2026. Departures 5:15 PM and 7:15 PM. About 3 hours 45 minutes.'
WHERE event_id = 'frrm-north-pole-express-2026';

UPDATE public.wf_events
SET schedule_note = 'Select days: November 21, 22, 27, 28, 29; December 5, 6, 12, 13, 18 through 31; January 1, 2, 3. Included with general park admission.'
WHERE event_id = 'legoland-fl-holidays-2026';

UPDATE public.wf_events
SET schedule_note = 'Guided (about 60-70 min) and self-guided timed tours, Nov 1, 2026 to Jan 17, 2027; reservations required. Closed Thanksgiving, Dec 24, Dec 25, Dec 31 and Jan 1. Tour times vary by date.'
WHERE event_id = 'stetson-mansion-christmas-2026';

UPDATE public.wf_events
SET schedule_note = 'Nightly 6–11 PM; light show at the top of each hour. Selfies with Santa + snow shows Sat Nov 28, Dec 5, Dec 12, Dec 19 and Thu Dec 24. Free.'
WHERE event_id = 'symphony-in-lights-gulfstream-park-2026';

UPDATE public.wf_events
SET end_time = NULL
WHERE event_id = 'jollywood-nights-2026' AND end_time = '00:30:00';

-- ============================================================================
-- PART B ROLLBACK: UNSUPPORTED-SCHEDULE DISCLAIMER CLEANUP (1 row)
-- ============================================================================

UPDATE public.wf_events
SET schedule_note = 'Reserve a current Santa session. Detailed daily timetable on event page is labeled 2024 and is not used for 2026; midnight-to-midnight calendar metadata is not an operating schedule.'
WHERE event_id = 'santa-workshop-icon-park-2026';

COMMIT;
```
