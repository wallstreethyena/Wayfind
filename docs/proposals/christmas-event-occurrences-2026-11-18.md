# Proposal: 2026 Florida Christmas Event Occurrence & Schedule Corrections (`wf_events`)

> **STATUS: PENDING EXPLICIT OWNER APPROVAL (`STOP FOR GABE`) — NOT APPLIED TO PRODUCTION**
> Generated: `2026-11-18` | Branch: `fix/carbon-wave2-events` | Author: `@events` (Wayfind Map Intelligence Reliability Wave)

---

## 1. Root-Cause Summary

1. **Schema Gap in `public.wf_events`**:
   `wf_events` stores only `start_date`, `end_date`, `start_time`, `end_time`, `timezone`, `select_nights`, and free-text `schedule_note` — it has **no structured `occurrence_dates` or `visit_schedule` columns**. As a result, multi-week events must either be enumerated in checked-in code (`lib/eventOccurrencesVerified202611.js`) or parsed conservatively by `lib/scheduleNoteDays.js`.
2. **Code-Path Gaps Fixed in This Wave**:
   - `lib/eventOccurrencesVerified202611.js` held only Fall 2026 rows and zero 2026 holiday/Christmas rows (`mvmcp-2026`, `jollywood-nights-2026`, `legoland-fl-holidays-2026`, `frrm-north-pole-express-2026`, `frontyard-holiday-festival-at-dr-phillips-center-2026`, `symphony-in-lights-gulfstream-park-2026`, `stetson-mansion-christmas-2026`).
   - `lib/mapDecisionEngine.js` (`evaluateEventEligibility`) previously hardcoded `siteTodayStr(now)` (Eastern only, ignoring `America/Chicago` Panhandle coordinates and ignoring `eventLocalClock` overnight carryover), did not surface `state: "tomorrow"` or `state: "closed_day"` or `state: "canceled"`, allowed `select_nights: true` + `rule.kind === "open"` (falsely flagging `santa-workshop-icon-park-2026` as tonight), and missed weekday schedules like `Mon / Tue-Thu / Fri-Sat / Sun` (`miracle-on-orange-2026`).
   - `lib/searchCards.js` (`eventDoc` / `toCard`) dropped `event_id`, `event_status`, `start_time`, `end_time`, `timezone`, `closed_dates`, `canceled_dates`, and `recurring_schedule` when building search cards.
3. **Production `wf_events` Copy / Time Gaps Identified (6 Rows Proposed Below)**:
   Several `wf_events` rows have valid T1 evidence whose `schedule_note` phrasing either omits `"Daily"` (`stetson-mansion-christmas-2026`), omits the T1-published select dates (`frrm-north-pole-express-2026`), triggers a false `"daily"` keyword (`santa-workshop-icon-park-2026`), omits `"18 through 31"` individual tokens (`legoland-fl-holidays-2026`), causes `scheduleExplicitDays` to override `"Nightly"` (`symphony-in-lights-gulfstream-park-2026`), or leaves `end_time` `NULL` for an explicit overnight party (`jollywood-nights-2026`).

---

## 2. Key Investigations & Honesty Decisions

### A. Busch Gardens Christmas Town (`christmas-town-2026` / `busch-gardens-christmas-town-2026`, Tampa)
- **Current `wf_events` row**: `start_date = 2026-11-13`, `end_date = 2027-01-04`, `select_nights = true`, `schedule_note = "Select nights November 13 - January 4, included with park admission."`
- **Live T1 Check (`2026-11-18`)**:
  - Fetched `https://buschgardens.com/tampa/events/christmas-town/` and `https://buschgardens.com/tampa/park-info/theme-park-hours/`.
  - Official event page states: `11/13/2026` to `1/4/2027`, **`"Select Dates"`**, `"View Park Schedule"`, `"Included with Park Admission"`. The park hours page is an interactive JS calendar without server-rendered per-day Christmas Town flags in HTML.
  - `data/christmas-2026-research.json` explicitly notes: `"Date list is from a third party; the official page says select dates."` (Third-party Ride Ready lists 41 dates: Nov 13–15, Nov 20–29, Dec 4–6, Dec 11–Jan 4 — which also excludes Wed `2026-11-18`.)
- **Decision (NO `wf_events` mutation, NO fabricated T1 dates)**:
  Keep `christmas-town-2026` strictly honest as **`unconfirmed_select_nights`** (`"Select nights · check dates"`, `activeToday: false`). Never emit `"Christmas event tonight"` without T1 per-day confirmation.

### B. Mickey's Very Merry Christmas Party (`mvmcp-2026`, Bay Lake / Lake Buena Vista)
- **Constraint Compliance (`AGENTS.md §8`)**: Zero automated HTTP requests were sent to `disneyworld.disney.go.com`. Verified strictly from the T1 Disney Parks Blog citation already stored in `data/christmas-2026-research.json` (line 1).
- **Authoritative T1 Source**:
  - URL: `https://disneyparksblog.com/wdw/mickeys-very-merry-christmas-party-dates-and-festive-details/` (Tier `T1`, checked `2026-10-13` in research packet)
  - Quote: `"25 select nights: Nov 8, 9, 12, 13, 15, 17, 19, 20, 24, 25, 27, 29; Dec 1, 3, 4, 6, 8, 10, 11, 13, 15, 17, 18, 20, 22"`
- **Behavior on `2026-11-18` (Wed)**:
  Added to `lib/eventOccurrencesVerified202611.js`. On `2026-11-18` ET, `evaluateEventEligibility` deterministically evaluates `activeToday: false`, **`state: "tomorrow"`**, `nextDate: "2026-11-19"`, reason `"Next event night tomorrow"`.

### C. Other Multi-Week Florida Holiday Events Audited (`2026-11-18`)
- **Verified Active Tonight (`2026-11-18`)**:
  - `symphony-in-lights-wiregrass-2026` (Wesley Chapel) — nightly through Dec 31
  - `symphony-in-lights-gulfstream-park-2026` (Hallandale Beach) — T1 verified nightly Nov 14–Dec 31 (`6–11 PM`)
  - `christmas-wonderland-at-tropical-park-2026` (Miami) — Mon–Thu 5–11 PM, Fri–Sat 5 PM–midnight, Sun 4–10 PM; closed Nov 16, Nov 30, Dec 7
  - `ripleys-christmas-park-hialeah-2026` (Hialeah) — Daily Nov 12–Jan 3 (`5–10 PM` on Nov 18)
  - `miracle-on-orange-2026` (Winter Park) — Tue–Thu 4 PM–12 AM (open tonight until 12 AM)
  - `misfit-bar-wink-wink-holiday-2026` (Sarasota) — Daily after 5 PM Nov 13–Dec 31
  - `utc-holidays-2026` (Sarasota) — Nightly light shows 6:30–9:30 PM Nov 14–Jan 3
  - `universal-orlando-holidays-2026` (Orlando) — Nightly Nov 14–Jan 3
  - `stetson-mansion-christmas-2026` (DeLand) — T1 verified daily tours Nov 1–Jan 17 except Thanksgiving, Dec 24, Dec 25, Dec 31, Jan 1
  - `festival-of-trees-omart-2026` (Orlando) — Daily 10 AM–5 PM Nov 14–22 (at 9 PM EST -> closed for the evening, next open tomorrow `2026-11-19`)
  - `roberts-christmas-wonderland-2026` (Clearwater) — Daily 10 AM–5:30 PM (at 9 PM EST -> closed for the evening, next open tomorrow `2026-11-19`)
- **Verified Off-Night / Closed Today (`2026-11-18`)**:
  - `mvmcp-2026` (Lake Buena Vista) — `state: "tomorrow"`, `nextDate: "2026-11-19"`
  - `jollywood-nights-2026` (Lake Buena Vista) — `state: "off_night"`, `nextDate: "2026-11-21"` (T1 Disney Parks Blog, 15 select nights)
  - `season-of-glow-cityplace-2026` (West Palm Beach) — `state: "closed_day"`, `nextDate: "2026-11-20"` (Fri–Sat workshop rule)
- **Held Honestly as Unconfirmed (`activeToday: false`, NEVER `"Christmas event tonight"`)**:
  - `christmas-town-2026` (Tampa) — `unconfirmed_select_nights`
  - `seaworld-orlando-christmas-2026` (Orlando) — `unconfirmed_select_nights` (official `seaworld.com` page says `"select dates"` without per-day enumeration; third-party list not promoted to T1)
  - `nightgarden-fairchild-2026` (Coral Gables) — `unconfirmed_select_nights`
  - `asian-lantern-festival-central-florida-zoo-2026` (Sanford) — `unconfirmed_select_nights`
  - `snowcat-ridge-2026` (Dade City) — `unconfirmed_select_nights`
  - `santa-workshop-icon-park-2026` (Orlando) — `unconfirmed_select_nights` (2024 timetable explicitly unused for 2026)
  - `christmas-at-hobe-sound-farms-2026` (Hobe Sound) — `unconfirmed_select_nights`
  - `christmas-at-gaylord-palms-2026` (Kissimmee) — `unconfirmed_season_span`
  - `a-dickens-christmas-appleton-museum-2026` (Ocala) — `unconfirmed_season_span`
  - `fishermens-village-holiday-festival-of-lights-2026` (Punta Gorda) — `unconfirmed_season_span`
- **Verified Future T1 Select-Dates Added to Registry (Start `>= 2026-11-21`)**:
  - `legoland-fl-holidays-2026` (Winter Haven) — 26 T1 dates verified `2026-11-18` on `legoland.com`
  - `frrm-north-pole-express-2026` (Parrish) — 20 T1 dates verified `2026-11-18` on `frrm.org`
  - `frontyard-holiday-festival-at-dr-phillips-center-2026` (Orlando) — 27 T1 dates verified `2026-11-17` (`lib/christmasResearchUpdates2026.js`)

---

## 3. Proposed `wf_events` SQL Corrections (6 Rows)

- **Proposed Row Count**: `6` rows in `public.wf_events`
- **No Production Rows Modified Yet**: Provided strictly for owner review (`STOP FOR GABE`).

### Authoritative Citations for Proposed `wf_events` Updates

| `event_id` | Tier | Source URL | Checked | Exact Quote / Evidence |
| --- | --- | --- | --- | --- |
| `frrm-north-pole-express-2026` | `T1` | `https://www.frrm.org/north-pole-express/` | `2026-11-18` | `"2026 Dates of Operation: The North Pole Express operates on select evenings from November 27 through December 22, 2026: November 27, 28, 29; December 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22"` |
| `legoland-fl-holidays-2026` | `T1` | `https://www.legoland.com/florida/things-to-do/seasonal-events/holidays-at-legoland/` | `2026-11-18` | `"Join the Jolliest Event of the Year on Select Dates: November - 21, 22, 27, 28, 29; December - 5, 6, 12, 13, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31; January - 1, 2, 3"` |
| `stetson-mansion-christmas-2026` | `T1` | `https://www.stetsonmansion.com/christmas-tours` | `2026-10-13` | `"Daily tours Nov 1 2026 to Jan 17 2027; closed Thanksgiving, Dec 24, Dec 25, Dec 31 and Jan 1"` (`data/christmas-2026-research.json`) |
| `symphony-in-lights-gulfstream-park-2026` | `T1` | `https://www.gulfstreampark.com/event/entertainment%2Fsymphony-in-lights-holiday-celebration-dec-6-dec-31/` | `2026-11-18` | `"Running nightly from Nov 14 – Dec 31, 2026 ... Nightly from 6 –11 PM ... Selfies with Santa + Snow Shows: Sat Nov 28, Dec 5, Dec 12, Dec 19, Thu Dec 24"` |
| `jollywood-nights-2026` | `T1` | `https://disneyparksblog.com/wdw/disney-jollywood-nights-dates-tickets-and-more/` | `2026-10-13` | `"Select nights: Nov 7, 14, 16, 21, 23, 28; Dec 5, 7, 12, 14, 19, 21, 23; Jan 3, 5 ... festivities 7:30 PM to 12:30 AM ET"` (`data/christmas-2026-research.json`) |
| `santa-workshop-icon-park-2026` | `T1` | `https://iconparkorlando.com/events/the-santa-workshop-experience/` | `2026-11-18` | Remove misleading `"daily"` token from `"Detailed daily timetable on event page is labeled 2024 and is not used for 2026"` so `scheduleNoteDays` does not misclassify it as open daily. |

### Forward SQL (`BEGIN` ... `COMMIT`)

```sql
BEGIN;

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
SET schedule_note = 'Nightly 6–11 PM; light show at the top of each hour (Selfies with Santa + snow shows Sat Nov 28, Dec 5, 12, 19 and Thu Dec 24). Free.'
WHERE event_id = 'symphony-in-lights-gulfstream-park-2026';

-- 5. jollywood-nights-2026: populate verified overnight end_time (00:30:00 ET)
UPDATE public.wf_events
SET end_time = '00:30:00'
WHERE event_id = 'jollywood-nights-2026' AND end_time IS NULL;

-- 6. santa-workshop-icon-park-2026: remove stale "daily" word that caused false daily parsing
UPDATE public.wf_events
SET schedule_note = 'Reserve a current Santa session. The 2024 timetable on the event page is not used for 2026; midnight-to-midnight calendar metadata is not an operating schedule.'
WHERE event_id = 'santa-workshop-icon-park-2026';

COMMIT;
```

### Exact Rollback SQL (`BEGIN` ... `COMMIT`)

```sql
BEGIN;

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
SET schedule_note = 'Nightly 6–11 PM; light show at the top of each hour. Selfies with Santa + snow shows Sat Nov 28, Dec 5, 12, 19 and Thu Dec 24. Free.'
WHERE event_id = 'symphony-in-lights-gulfstream-park-2026';

UPDATE public.wf_events
SET end_time = NULL
WHERE event_id = 'jollywood-nights-2026' AND end_time = '00:30:00';

UPDATE public.wf_events
SET schedule_note = 'Reserve a current Santa session. Detailed daily timetable on event page is labeled 2024 and is not used for 2026; midnight-to-midnight calendar metadata is not an operating schedule.'
WHERE event_id = 'santa-workshop-icon-park-2026';

COMMIT;
```
