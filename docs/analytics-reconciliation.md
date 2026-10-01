# Analytics reconciliation: what each number means, and how to check it

**Status, 2026-10-01** (Website user flow analysis).

| item | status |
|---|---|
| Event contract: every writer and every Command Center reader, traced in code | **done**: the map below |
| Stored-data verification (PostHog / Supabase rows) and the dashboard reconciliation | **blocked**: the PostHog and Supabase connectors are not authorized for the agent environment, and the Visitors API needs the owner's sign-in. The queries in §5 are ready to run read-only; nothing in this document was executed against either store. |
| M1 `recordLikeEvent` without suppression | **fixed**, #1617 (`848610c`, `dpl_CuqGLe5bBRR7BRuKwcqtxvEaEQQf`, live 2026-10-01 10:28:55 UTC). Verified on production in a contained browser: a human-mode Like tap attempts one `events` insert; webdriver and internal-marked taps attempt none. |
| M2 `llm_call` rows as device `"server"` | **fixed** forward-only, #1617. Historical `"server"` rows remain; S1 below shows the effect (`active_devices` vs `active_devices_ex_server`). |
| M13 stale cache turns arrays into objects | **fixed**, #1619 (`2c149e1`, `dpl_7EwvArLpZ6xWrL3cqVw7Dg765Hxa`, live 2026-10-01 11:04:44 UTC). Before the fix, a stale owner-exclusion list also silently became `{}` during a provider flap. |
| #1603 test-traffic exclusion | **not applied**. No supported per-`device_id` exclusion exists (§4), and no test `device_id` has been confirmed (the early runs kept none, and rows carry no user agent). Nothing was deleted or rewritten. |
| M3-M12, M14-M16 | open; see "Next" in the release notes. Each is a definition or coverage difference, not lost data. |

**Reading the two stores together.** PostHog and Supabase `events` never share an identifier (below). Their totals measure different populations by design:
- Supabase sessions and devices cover only the home shell.
- PostHog sessions cover every page.
- The Visitors tab applies the `tq-2026-09-30` bot rule. Overview applies only PostHog's own bot flag.

Do not force them to match. Compare each against its own definition with the queries in §5.

Line numbers in the map refer to `961c5e25` (2026-10-01).


Everything below was read with `git show origin/main:<path>`. Nothing was executed against PostHog or Supabase. Where a finding has since been fixed, the row says so.

Stores in play:

| store | how it is written | who reads it |
|---|---|---|
| **PostHog** (the configured project; `us.i.posthog.com`, no first-party `/ingest` proxy; `next.config.js:73` only allows the host in the CSP) | browser `posthog-js` via `lib/browserAnalytics.captureOrQueue` and the page tracker; server `lib/serverEvents.captureServer` | `lib/commandCenter/sources/posthog.js` (overview, traffic, the Visitors/visitor-story tab, health, revenue heartbeat, alerts) |
| **Supabase `public.events`** (`events.sql:8`, a second conflicting DDL in `supabase/schema.sql:16` uses a uuid id) | anon/auth `insert` with RLS `with check (true)` (`events.sql:28-33`) plus service-key REST | `wf_cc_*` RPCs (`supabase/command-center.sql`), plus several non-CC readers (listed in §2d) |
| **GA4 / Google Ads** (gtag) | `lib/analytics.forwardToGoogle`, `GoogleTags.js` auto page_view | not read by the Command Center (listed for completeness only) |

There are three **separate, unjoinable visitor identities**:
- Supabase `device_id` = `wf_device` (localStorage plus a 2-year cookie, `lib/deviceId.js:62-83`). It falls back to a per-tab `sessionStorage` id when DNT or `wf_optout` is set (`:66-71`).
- PostHog `distinct_id`: an anonymous posthog-js id, which becomes the Supabase `user.id` after `identify` (`app/home.js:5283`).
- Experiment id `wf_exp_id` (`lib/experiment.js:61,150-157`).

No PostHog event carries `device_id`, and no Supabase row carries `distinct_id` or `$session_id`. **Reconciliation can only compare aggregates, never individual rows.**

---

## 1. EVENT SOURCES

### 1a. Client choke points

| emitter (file:line) | events | destination | identifiers | suppression |
|---|---|---|---|---|
| `lib/browserAnalytics.js:160-171` `captureOrQueue` (the only sanctioned client capture path; there is no raw `posthog.capture` anywhere else in app/lib) | any | PostHog. If the SDK is not ready yet, the event is held in a bounded in-memory queue (200), which `PostHogProvider.js:103` drains with its original timestamp | posthog distinct_id + `$session_id` (set by the SDK) | `sessionSuppressed()` `:151-157`: `window.__WF_ANALYTICS_SUPPRESSED`, or `analyticsSuppressionReason` `:82-90`, which covers owner user (`isOwnerUser` `:58-68`), the localStorage mark `wf_internal_browser_v1`, bot UA (`BOT_RX` `:19`) and webdriver |
| `lib/browserAnalytics.js:263-443` `createPageVisitTracker` (started in `app/components/PostHogProvider.js:115-124`) | `page_visit` (`:369`), `page_active_time` (`:361,401`), `page_exit` (`:362`), `element_click` (`:394`), `attention_sample` (`:334`) | PostHog. Held in the provider's own `pendingEvents` until init (`:118-122`, drained `:98-101`) | `visit_id` (random UUID per page lifecycle), `page_path`, `page_surface`, `place_id` on clicks | the provider does not start the tracker when `reason(user)` is set (`PostHogProvider.js:107-110`). `suppress()` `:47-58` stops it and opts out. Command Center auth marks the browser (`app/command-center/ui.js:1190-1205`) |
| PostHog SDK autocapture (`PostHogProvider.js:83-93`, `defaults:"2026-05-30"`, `person_profiles:"identified_only"`) | `$pageview`, `$pageleave`, `$autocapture`, `$rageclick`, `$dead_click`, `$exception`, … | PostHog | as above. Super property `$internal_or_test_user:false` (`:94`) is an **event** property, not a person property | init is skipped when suppressed (`:81-82`). `respect_dnt` is not set |
| `app/home.js:6531-6564` `logEvent` (home shell only: routes `/` and `/p/[id]`) | ~60 action names (detail_open, screen_view, session, search, save, like, share, directions, tickets_out, coupon_out, tour_card_out, maps_list, places_none, result_count_shown, intent_chip, curated_open, discovery_tile, event_open, coupon_save, user_comment, primary_cta_clicked, book_it_out, share_open, …) | **both**: PostHog via `captureOrQueue` (`:6538`) **and** the Supabase `events` insert (`:6555-6562`). Also GA4/Ads via `forwardToGoogle` (`:6543`) and `first_intent`/`session_activated` via `noteSessionProgress` (`:6551`, `lib/activation.js:131`) | Supabase: `device_id`, `user_id` (when signed in), `place_id`, `place_name`, `meta`=extra. PostHog: place_id, place_name, extra, experiment props | `skipOwnerOrBotAnalytics(user)` `app/home.js:1141-1149` → `analyticsSuppressionReason` (owner, internal mark, bot, webdriver). Applied before both stores |
| `app/home.js:1150-1162` `logEventAnon` | `venue_photo_lookup` (`:2732`), `tickets_out` place_card (`:12220`), `share` place_card (`:12256`) | Supabase only | `device_id`, `user_id:null` | `skipOwnerOrBotAnalytics()` with no user arg, so it relies on the internal mark, bot UA and webdriver only |
| `app/home.js:1198-1203,2796,5282,6515` | `hero_impression`, `hero_tap`, `share_path`, `app_error`, `auth_event`, `web_vitals` | PostHog only | — | `captureOrQueue` |
| `lib/track.js:16-45` `track()` (for surfaces outside the shell: PaidLanding, ExploreBridge, IntentPageClient, TrendingNowClient, cardActions, Guide*, Hub*, etc.) | caller-named (like, dislike, save, share, intent_chip, detail_open, commerce_cta_clicked, …) | **PostHog only**, plus GA4/Ads and session milestones | PostHog ids + utm/attribution + experiment props | explicit `analyticsSuppressionReason` check `:19-21`, plus `captureOrQueue` |
| `lib/commerce.js:171-180` `emitCommerce` | `commerce_impression`, `commerce_cta_clicked`, `fallback_clicked`, `disclosure_viewed`, `offer_expired`, `card_impression`, `card_clicked` (whitelist `:39-80`) | PostHog only | `click_id`, surface, content_id, provider, … (CONTEXT_FIELDS `:70`) | `captureOrQueue` |
| `app/components/CommerceClickBeacon.js:77-112` (hub pages, e.g. `app/florida-events/page.js:118`, `app/go/florida/page.js`) | `commerce_cta_clicked` (`:97`) + Google `partner_click` (`:103-107`) | PostHog + Google | `click_id` | its own `suppressed()` `:60-74`, which fails closed |
| **`lib/likeSignal.js:230-242` `recordLikeEvent`** (called from `lib/cardActions.js:162,181,245`, `IntentPageClient.js:124,132,139,605`, `TrendingNowClient.js:87,95,102,172`) | `like`, `dislike`, `save`, `share` | **Supabase only** | `device_id`, `user_id` | **NONE.** No owner, internal-mark, bot or webdriver check. The paired `track()` call on the same line *is* suppressed *(fixed by #1617, 2026-10-01; historical rows only)* |
| `lib/experiment.js:275-323` `recordExposure` (explore-bridge-v1) | `$feature_flag_called` (once per PostHog session) + `register` of `$feature/explore-bridge-v1` | PostHog | `wf_exp_id`→variant, posthog session id | `looksAutomated` (`:133-140`, webdriver + its own UA regex), then `captureOrQueue` |
| `app/guides/[slug]/GuidePickDecision.js:61,112-126` (guide-inline-book-v1) | `guide_experiment_exposed`, `guide_pick_book_clicked` + register `$feature/guide-inline-book-v1` | PostHog | `wf_exp_id` | `looksAutomated`, then `captureOrQueue` |
| `lib/shareMetrics.js:55-76` via `app/home.js:7200-7206` | `session` (once per tab, `meta.ref` = `"share"` or `"direct"`) | both (through `logEvent`) | as logEvent | as logEvent |
| `lib/analytics.js:260-306` `forwardToGoogle` / `:309` `trackPageView`; `app/components/GoogleTags.js:40-69` | GA4 events + Ads conversions; GA4 auto `page_view` via `gtag('config', ga4)` | Google | — | relies on its callers. **`GoogleTags`/`trackPageView` apply no owner or bot suppression** |

### 1b. Server emitters

| emitter | events | destination | identifiers | suppression |
|---|---|---|---|---|
| `lib/serverEvents.js:155-190` `captureServer`, called from `app/api/commerce/go/route.js:74` (started `:154`, failed `:78`), `app/api/viator/go/route.js:232` (`:237-352`), `app/api/hotels/go/route.js:45` (`:59,75`), `app/api/ticketmaster/go/route.js:55` (`:60,78`) | `provider_redirect_started`, `provider_redirect_failed` (with `failure_reason`, `resolver_path`) | PostHog (`$lib: wayfind-server`, `$raw_user_agent`, `$ip`) | `distinct_id` = the `ph_<key>_posthog` cookie **or, when there is no cookie, the click_id** (`commerce/go:59`, `viator/go:215`, `hotels/go:22`, `ticketmaster/go:39`). No `$session_id` | `WF_SUPPRESS_ANALYTICS=1` (guards) and the synthetic-monitor UA (`:158-162`). **No owner or internal suppression.** Crawlers *are* recorded as `provider_redirect_failed` `crawler-refused` (`commerce/go:96`, `viator/go:247-249`, `hotels/go:63`, `ticketmaster/go:71`) |
| `lib/insiderServer.js:64-70` `logLlmCall` (from `app/api/insider`, `app/api/list/generate/route.js:65,73`, `app/api/moment/picks/route.js:89`) | `llm_call` | Supabase `events` (service key REST) | **`device_id: "server"`** *(fixed by #1617, 2026-10-01; historical rows only)*: now `null`, `meta.route` | none |

Other analytics-like tables: `wf_events` (`lib/curatedEvents.js:162`, `app/api/cron/affiliate-coverage/route.js:91`) is the **curated-events catalog**, not analytics. No other analytics table and no second device-id implementation exist (`deviceId` was extracted once, `lib/deviceId.js:3-9`). `wf_exp_id` is a separate id, used for experiment bucketing only.

---

## 2. DASHBOARD CONSUMERS

### 2a. Common mechanics
- **Windows:** `lib/commandCenter/time.js:70-121` `rangeFor`, with `[from,to)` as UTC instants built on **America/New_York** day starts. `today` = ET midnight→now; `7d`/`30d` = the last N complete ET days.
- **Cache:** `lib/commandCenter/cache.js:16-44` `memTTL` is per-lambda, deduplicates in-flight calls, and serves **stale-on-error up to 10× TTL** (`:28-33`).
- **PostHog exclusion** (`sources/posthog.js:98-177`):
  - ids = `wf_cc_excluded_users()` RPC (cached 5 min, `:103`) ∪ env `WF_OWNER_USER_ID`.
  - `realEventPredicate` `:119-126` excludes `$virt_is_bot`, `person.properties.$internal_or_test_user`, any `distinct_id`/`$user_id` in ids, and every person merged with them.
  - `{filters}` runs with `filterTestAccounts:true` (`:57`).

### 2b. Overview / Traffic (PostHog when configured, else first-party)

| metric (UI) | definition | file:line | TTL |
|---|---|---|---|
| Unique visitors | `uniq(person_id)` over **all events** (incl. server redirect events) in window, REAL_EVENTS | `posthog.js:180-184`; UI `app/command-center/ui.js:488` (fallback `fpK.active_devices`) | 60 s |
| Sessions | `uniq($session_id)` over all events, REAL_EVENTS | same; UI `ui.js:485` (fallback `fpK.sessions`) | 60 s |
| Page views | `countIf(event='$pageview')` | same; `ui.js:491` | 60 s |
| Live now | first-party `active_devices` over last 5 min (sub-label: PostHog `uniq(person_id)` 5 min) | `firstParty.js:73-82`, `posthog.js:192-195`; `ui.js:481-483` | 25 s |
| Daily visitors/sessions/pageviews | `toStartOfDay(timestamp,'America/New_York')` | `posthog.js:197-201` | 5 min |
| Live by minute | `toStartOfMinute(timestamp)` (UTC minute), last 60 min | `posthog.js:186-190` | 25 s |
| Channels / referrers / UTMs / entry-exit | `sessions` table, `$start_timestamp` in window, `{wayfindRealSessions}` (session must contain ≥1 real event and **no** excluded event) | `posthog.js:146-154,203-226` | 5 min |
| Top pages / devices / viewports / geo (≥3) | `$pageview` events, `uniq(person_id)` | `posthog.js:228-253` | 5–10 min |
| New vs returning (PH) | `person.created_at` vs window start | `posthog.js:255-259` | 10 min |
| First-party referrers (fallback) | `wf_cc_breakdown(...,'referrer')`: host of `meta->>'ref'` on `action='session'` | `command-center.sql:210,225`; route `app/api/command-center/[panel]/route.js:126`; UI `ui.js:608-611` | 5 min |

### 2c. Visitors tab (panel `visitor-story`, `route.js:320`)

`posthog.js:295-349` reads up to **50 001** rows of `page_visit`, `page_active_time`, `page_exit`, `element_click` and `attention_sample` in the window. The filters are `{filters}` + `peopleEventPredicate` (`:133-135`): the same as REAL_EVENTS **except `$virt_is_bot`**, which is read as a column instead. The cache key is `ph:visitor-story:v3`, 5 min.

`lib/commandCenter/visitorReport.js` then processes the rows:
- **Session** = PostHog `$session_id` (`:444-450`). Rows with an empty session_id are never classified, but they stay in `rows` (`:461`).
- **Bot rule** `trafficQuality.js` `tq-2026-09-30`. A session is automated if any of these holds:
  - `crawler_user_agent`: `isKnownBot($raw_user_agent)`
  - `posthog_bot_flag`: any `$virt_is_bot`
  - `no_browser_identity`: no `$browser` and no `$os`, and 0 clicks
  - `repeated_no_engagement`: 0 clicks, ≤1 distinct page|surface, active <10 s, no referrer, `$device_type='Desktop'`, and the same `browser|os|pageKind` fingerprint appears in ≥5 such sessions in the window

  Active ms per visit = the `page_exit.active_ms` when there is one, else the sum of `page_active_time` (`:56-88`).
- **Headline numbers** (`visitorReport.js:611-617`):
  - `sessions_total` = distinct session ids
  - `sessions_people` = not automated ("real visits")
  - `sessions_automated`
  - `traffic.people_quick_bounces` = soft no-engagement
- Outcomes and clicks come from the human sessions only (`:597-602`).
- A finding is emitted when truncated (>50 000 rows).
- Diagnostics query `:314-322` counts `places_none, events_none, app_error, $rageclick, provider_redirect_failed, primary_cta_null, content_disliked, dislike, rail_retry` by page with REAL_EVENTS.
- **There is no unique-visitor count in this tab**, only sessions.

### 2d. First-party RPCs (`supabase/command-center.sql`, through `sources/firstParty.js`)

Exclusion idioms:
- **D** = `device_id not in wf_cc_excluded_devices()`, i.e. any device that ever emitted with an excluded user_id (`:58-62`)
- **U** = `user_id not in wf_cc_excluded_users()` (emails in `wf_cc_settings('exclude_emails')`, `:49-55`)

| RPC | metric definitions | exclusions | day TZ | TTL (firstParty.js) |
|---|---|---|---|---|
| `wf_cc_kpis` `:88-114` | sessions=`count(action='session')`; active_devices=`count(distinct device_id)` all actions; screen_views; detail_opens (`detail_open`,`event_open`); saves; likes; shares; directions; searches; no_result_searches (`places_none`); out_clicks (`wf_cc_out_actions` `:66-68`); engaged_devices; signed_in_devices; browse_devices (`:77-79`); open_devices | D (null device kept) + U | n/a | 60 s (live 25 s) |
| `wf_cc_daily` `:121-147` | same per `(created_at at time zone 'America/New_York')::date` | D + U | ET | 5 min |
| `wf_cc_minutes` `:152-162` | devices, events per UTC minute | **D only** | — | 30 s |
| `wf_cc_top_places` `:168-189` | per place n, devices by bucket | **D only** | — | 5 min |
| `wf_cc_breakdown` `:195-237` | screen/category/search/no_result/referrer/share_kind/curated/out_provider/out_src | **D only** | — | 5 min |
| `wf_cc_funnel` `:242-266` | Visited (`session`,`screen_view`) → browse → open → engage (`wf_cc_engage_actions` `:71-73`) → out | D, **non-null device only, no U** | — | 5 min |
| `wf_cc_signups` `:271-279` | auth.users non-anonymous per ET day | U | ET | 5 min |
| `wf_cc_retention` `:304-330` | first-seen device cohort, D1/D7/D30 | D | ET | 10 min |
| `wf_cc_new_returning` `:361-379` | per ET day: first_at day == day → new | D | ET | 10 min |
| `wf_cc_time_to_action` `:386-406` | per device: first event → first open/engage/out, median/p75 | D | — | 5 min |

Other `events` readers **with no owner exclusion**:
- `app/api/events/demand/route.js:46` (`event_open`,`tickets_out`)
- `app/api/metrics/share/route.js:33-41`
- `app/api/signals/likes/route.js:114`
- `lib/trendSources/nativeEngine.js:110`, which has its own internal-device logic (`nativeCore.js:65-71`)

---

## 3. MISMATCH RISKS (demonstrated in code)

| # | finding | evidence | effect |
|---|---|---|---|
| M1 | **`recordLikeEvent` writes Supabase with no suppression** *(fixed by #1617, 2026-10-01; historical rows only)* | `lib/likeSignal.js:230-242` vs suppressed sibling `track()` on the same lines (`lib/cardActions.js:161-162`, `IntentPageClient.js:124`, `TrendingNowClient.js:87`) | Owner/internal-marked browsers, bots and webdriver test runs write `like/dislike/save/share` rows. These are excluded only if the row carries the owner user_id, or the device ever did (D/U). An internal-marked but not-signed-in device (for example one authorised by Command Center key only, `ui.js:1199-1201`) leaks into `likes`, `saves`, `shares`, `engaged_devices`, `active_devices` and top places |
| M2 | **`llm_call` rows use `device_id = "server"`**, which no RPC excludes *(fixed by #1617, 2026-10-01; historical rows only)* | `lib/insiderServer.js:68`; `wf_cc_kpis` `:99` counts `count(distinct device_id)` over all actions | Adds **+1 active device** (and +1 "Live now" device) in any window that had a model call. It also enters `wf_cc_minutes` events, `new_returning` and `time_to_action` t0 (the latter only if "server" ever performs an action, so mainly devices and minutes) |
| M3 | **First-party referrer breakdown reads `meta.ref` as a URL, but the emitter writes `"share"` or `"direct"`** | reader `command-center.sql:210,225`; emitter `lib/shareMetrics.js:62` | The "Referrers" panel fallback (`ui.js:608-611`, used when PostHog channels are missing) can only ever show `direct` / `share` |
| M4 | Readers filter on actions **no code emits** | `hotel_out`, `eats_out`, `ta_out` in `wf_cc_out_actions` (`:68`) / `eventMap.js:16`; `hero_tap` in `wf_cc_browse_actions` (`:79`) is emitted only to PostHog (`app/home.js:1201`); `vrbo_out` is in `AFFILIATE_EVENTS` (`lib/analytics.js:109-111`) with no emitter | Those terms are always 0. `maps_list` (an *intent* event per `lib/activation.js:47-50`) is counted as a **partner click** in `out_clicks`/funnel step 5 |
| M5 | Emitters the readers ignore | Supabase receives `primary_cta_clicked` (`Detail.js:531,553`), `book_it_out` (`BookItLink.js:97`), `sponsor_out`, `partner_program_out`; none is in `wf_cc_out_actions`. Commerce clicks (`commerce_cta_clicked`, `provider_redirect_*`) are PostHog-only | First-party "out_clicks"/"Clicked a partner link" undercounts real partner clicks |
| M6 | **Surface coverage differs** | Supabase `session`/`screen_view`/`detail_open` come only from the home shell (`app/page.js`, `app/p/[id]/page.js` import `home.js`; `startSessionRecording` only at `home.js:7202`). Guides, intent and landing pages use `track()`, which is PostHog-only (`lib/track.js:34`) | PostHog sessions/visitors ≫ Supabase `sessions`/`active_devices`. The two are not comparable totals |
| M7 | **Session definitions differ** | Supabase `session` = once per tab (sessionStorage `SS_SESSION`, `shareMetrics.js:58-64`), with no idle timeout, and only after the Supabase client is ready. PostHog = `$session_id` (30-min idle rollover). The Visitors tab additionally drops automated sessions | Three different "session" counts on one dashboard |
| M8 | **Overview "Unique visitors"/"Sessions" do not apply the trafficQuality bot rule; the Visitors tab does** | `posthog.js:180-184` (only `$virt_is_bot`) vs `visitorReport.js:451-461`; `trafficQuality.js:6-9` says ~800 desktop sessions/week were *not* flagged by `$virt_is_bot` | Overview counts > Visitors-tab "real visits" by design. Report them as different metrics |
| M9 | **Server redirect events mint a new PostHog person when there is no PH cookie**, and they are not owner-suppressed | `serverEvents.js:155-190` (no owner check); distinct fallback to `click_id` (`commerce/go:59`, etc.) | Each such click adds +1 to `uniq(person_id)` in Overview visitors (`posthog.js:181` counts all events). The owner's partner clicks (owner browsers never boot PostHog, so they have no cookie) reach PostHog as anonymous people that the user-id exclusion cannot match |
| M10 | **DNT / `wf_optout` handling differs** | `deviceId.js:66-71` mints a per-tab id; PostHog init has no `respect_dnt` (`PostHogProvider.js:83-93`) | DNT visitors become one Supabase "device" per tab (this inflates active_devices and new devices and deflates retention), while PostHog keeps one person |
| M11 | Exclusion scope inconsistent across RPCs | U is applied in kpis/daily/signups but **not** in minutes/top_places/breakdown/funnel/retention/new_returning/time_to_action | Rows with an owner user_id on a not-yet-excluded device (impossible after the first such row, because D then catches it) are mostly harmless. It still breaks strict parity between panels |
| M12 | Ad-blocker asymmetry | PostHog goes direct to `us.i.posthog.com` (no proxy, `next.config.js:73,255`); Supabase inserts go to `*.supabase.co` | Blocked browsers appear in Supabase only. This is the documented 09-17..19 gap pattern, `browserAnalytics.js:134-136` |
| M13 | **Stale-cache bug for array results** *(fixed by #1619, 2026-10-01)* | `cache.js:30-32` returns `{ ...stale.value, _stale: true }`. Almost every loader returns an **array** (`firstParty.daily/funnel/breakdown/…`, every `posthog.run` via `shape()`) | On an upstream error inside the 10× window an array becomes a plain object (`{0:…,1:…,_stale:true}`). Panels that `.map()` it break or render empty, instead of showing stale data |
| M14 | PostHog "new vs returning" uses `person.created_at` with `person_profiles: "identified_only"` | `posthog.js:256`, `PostHogProvider.js:86` | Anonymous (personless) visitors have no real person row. Their `created_at` is likely not the first-seen time, so this split is unreliable. This depends on PostHog semantics; verify before trusting it |
| M15 | GA4 is not suppressed | `GoogleTags.js:68-69` auto page_view + `trackPageView` unguarded (`analytics.js:309-320`) | The owner, bots and tests reach GA4. GA4 is not a Command Center source |
| M16 | `wf_cc_excluded_devices` is mostly vestigial | The owner's signed-in client is suppressed before any insert (`home.js:6533`), so new owner devices **never** emit an owner-user_id row unless M1 fires (closed by #1617 for new rows) | The device exclusion only covers devices that wrote owner rows historically (or via M1). A new owner device that is not marked internal is counted as a visitor in both stores |

Double-emission checked and **not** found for PostHog product events: `logEvent`/`track` each call `captureOrQueue` once; `track.js:7-9` forbids pairing them. On hub pages, `CommerceClickBeacon` skips anchors carrying `data-commerce-owner` (`BookingCTA.js` sets it).

---

## 4. EXCLUSION MECHANISM

| layer | mechanism | where read | reversible? | honored by |
|---|---|---|---|---|
| Browser (both stores) | localStorage `wf_internal_browser_v1="1"`. Set automatically on owner sign-in (`browserAnalytics.js:83-85`, `PostHogProvider.js:59-64`) or after a successful Command Center auth (`ui.js:1199-1201`) | `analyticsSuppressionReason` | Yes: remove the key in that browser. There is no UI for it | PostHog client, `logEvent`, `logEventAnon`, `track`, `emitCommerce`, `CommerceClickBeacon`. Honored by `recordLikeEvent` since #1617 (was M1); **not** honored by server `/api/*/go` (M9), or GA4 (M15). Prevents future writes only and never excludes history |
| Supabase reports | `wf_cc_settings` row `exclude_emails` (jsonb array of emails). The seed is applied out-of-repo (`command-center.sql:38-44`) → users → **every device that ever wrote a row as that user** | `wf_cc_excluded_users/devices` in every `wf_cc_*` (with the gaps in M11) | Yes: edit the row, takes effect at read time (TTL ≤10 min) | first-party RPCs only |
| PostHog reports | `wf_cc_excluded_users()` ids ∪ env `WF_OWNER_USER_ID`, matched against `distinct_id` / `$user_id` / merged persons. Also the `$internal_or_test_user` person prop and project test-account filters (`filterTestAccounts`) | `posthog.js:98-154` | Yes (settings row / env / PostHog project settings) | all PostHog readers |
| **Per-device_id exclusion** | **Does not exist** in either store. `docs/analytics-testing.md` previously said "Exclude confirmed test devices from reports **by `device_id`**", but no table, setting, env var or RPC parameter implements it. No `wf_cc_*` function accepts a device list, and the PostHog side has no device concept at all (`device_id` is not sent). `trafficQuality.js` is a heuristic and has no allow/deny list. A synthetic-tag scheme is explicitly "not implemented yet" (same doc, Mode 2 §2) | — | — | — |

So excluding specific `device_id`s needs new code: for example a `wf_cc_settings('exclude_devices')` key unioned into `wf_cc_excluded_devices()` on the Supabase side. On the PostHog side there is no mapping from `device_id` to `distinct_id`, so specific PostHog persons can only be excluded by `distinct_id` or person (in project test-account filters, or by adding ids to the exclusion list).

---

## 5. RECONCILIATION QUERIES (read-only)

Interval convention: `:from` / `:to` are ET wall-clock bounds converted exactly as `time.js` does.

**Supabase**, e.g. 2026-09-30 ET:

```sql
-- params
with p as (select ('2026-09-30 00:00'::timestamp at time zone 'America/New_York') as f,
                  ('2026-10-01 00:00'::timestamp at time zone 'America/New_York') as t)
select f, t from p;
```

**S1 — Overview first-party KPIs** (reproduces `wf_cc_kpis`; fallback Visitors=`active_devices`, Sessions=`sessions`, Live now = same over the last 5 min)
```sql
select * from public.wf_cc_kpis(('2026-09-30 00:00'::timestamp at time zone 'America/New_York'),
                                 ('2026-10-01 00:00'::timestamp at time zone 'America/New_York'));
-- inline equivalent, with diagnostics for M2:
with w as (
  select action, device_id, user_id from public.events
  where created_at >= ('2026-09-30 00:00'::timestamp at time zone 'America/New_York')
    and created_at <  ('2026-10-01 00:00'::timestamp at time zone 'America/New_York')
    and (device_id is null or device_id not in (select public.wf_cc_excluded_devices()))
    and (user_id  is null or user_id  not in (select public.wf_cc_excluded_users())))
select count(*) filter (where action='session')                  as sessions,
       count(distinct device_id)                                  as active_devices,
       count(distinct device_id) filter (where device_id<>'server') as active_devices_ex_server,  -- M2
       count(*) filter (where action='llm_call')                  as llm_call_rows,
       count(*) filter (where action='screen_view')               as screen_views,
       count(*) filter (where action in ('detail_open','event_open')) as detail_opens,
       count(*) filter (where action = any(public.wf_cc_out_actions())) as out_clicks,
       count(distinct device_id) filter (where action = any(public.wf_cc_browse_actions())) as browse_devices,
       count(distinct device_id) filter (where action in ('detail_open','event_open'))     as open_devices
from w;
```

**S2 — Daily series** (Traffic fallback daily: devices, sessions, screen_views)
```sql
select * from public.wf_cc_daily(('2026-09-24 00:00'::timestamp at time zone 'America/New_York'),
                                  ('2026-10-01 00:00'::timestamp at time zone 'America/New_York'),
                                  'America/New_York');
```

**S3 — Funnel** / **S4 — New vs returning** / **S5 — Time to action** / **S6 — Retention**
```sql
select * from public.wf_cc_funnel(:f, :t);
select * from public.wf_cc_new_returning(:f, :t, 'America/New_York');
select * from public.wf_cc_time_to_action(:f, :t);
select * from public.wf_cc_retention(:f - interval '30 days', :t, 'America/New_York');
```

**S7 — Referrer breakdown proof (M3)**
```sql
select meta->>'ref' as raw_ref, count(*) from public.events
where action='session' and created_at >= :f and created_at < :t group by 1 order by 2 desc;
```

**S8 — Leak audit for M1** (like/save/share/dislike rows on devices that never logged a shell `session`/`screen_view` in the window; candidates only)
```sql
select device_id, array_agg(distinct action) actions, count(*) n, bool_or(user_id is not null) signed_in
from public.events
where created_at >= :f and created_at < :t and action in ('like','dislike','save','share')
  and device_id not in (select device_id from public.events where created_at >= :f and created_at < :t
                        and action in ('session','screen_view') and device_id is not null)
group by device_id order by n desc;
```

**S9 — Owner-exclusion coverage**
```sql
select count(*) as excluded_users from public.wf_cc_excluded_users();
select count(*) as excluded_devices from public.wf_cc_excluded_devices();
```

**PostHog HogQL.** Run these via the Query API with `"filters":{"filterTestAccounts":true}` so `{filters}` expands exactly as the dashboard does. Substitute `<IDS>` with the quoted list of `wf_cc_excluded_users()` ids plus `WF_OWNER_USER_ID`, i.e. `('id1','id2')`. Window example: `toDateTime('2026-09-30T04:00:00Z')` to `toDateTime('2026-10-01T04:00:00Z')`, which is the 2026-09-30 ET day (EDT, UTC−4).

```
-- REAL predicate used below (posthog.js:119-126):
--   coalesce(toString(properties.$virt_is_bot),'false') NOT IN ('true','1')
--   AND coalesce(toString(person.properties.$internal_or_test_user),'false') NOT IN ('true','1')
--   AND NOT (distinct_id IN <IDS> OR coalesce(toString(properties.$user_id),'') IN <IDS>)
--   AND person_id NOT IN (SELECT person_id FROM person_distinct_ids WHERE distinct_id IN <IDS>)
```

**P1 — Overview Unique visitors / Sessions / Page views** (`posthog.js:180-184`)
```sql
SELECT uniq(person_id) AS visitors, uniq($session_id) AS sessions, countIf(event = '$pageview') AS pageviews,
       uniqIf(person_id, properties.$lib = 'wayfind-server') AS server_only_people_upper_bound,         -- M9
       uniqIf(person_id, properties.$lib = 'wayfind-server' AND distinct_id = toString(properties.click_id)) AS cookieless_server_people
FROM events
WHERE timestamp >= toDateTime('2026-09-30T04:00:00Z') AND timestamp < toDateTime('2026-10-01T04:00:00Z')
  AND {filters} AND <REAL>
```

**P2 — Daily traffic** (`posthog.js:197-201`)
```sql
SELECT toStartOfDay(timestamp, 'America/New_York') AS day, uniq(person_id) AS visitors,
       uniq($session_id) AS sessions, countIf(event = '$pageview') AS pageviews
FROM events WHERE <window> AND {filters} AND <REAL> GROUP BY day ORDER BY day
```

**P3 — Channels** (`posthog.js:203-207`; `<window>` on `$start_timestamp` for the sessions table, on `timestamp` inside the subqueries)
```sql
SELECT coalesce(nullif($channel_type,''),'Unknown') AS channel, uniq(session_id) AS sessions, uniq(distinct_id) AS visitors
FROM sessions
WHERE $start_timestamp >= toDateTime(:f) AND $start_timestamp < toDateTime(:t)
  AND distinct_id NOT IN <IDS>
  AND distinct_id NOT IN (SELECT distinct_id FROM person_distinct_ids WHERE person_id IN (SELECT person_id FROM person_distinct_ids WHERE distinct_id IN <IDS>))
  AND session_id IN (SELECT DISTINCT properties.$session_id FROM events WHERE <window> AND properties.$session_id IS NOT NULL AND {filters} AND <REAL>)
  AND session_id NOT IN (SELECT DISTINCT properties.$session_id FROM events WHERE <window> AND properties.$session_id IS NOT NULL AND (<EXCLUDED>))
GROUP BY channel ORDER BY sessions DESC
-- <EXCLUDED> = posthog.js:137-144 (the OR-negation of <REAL>)
```

**P4 — Visitors tab: raw / people / automated sessions.** This approximates `trafficQuality.classifySessions`; the authoritative path is the code over the P4a rows.

```sql
-- P4a: the exact rows the tab reads (posthog.js:296-313), then run buildVisitorReport() on them
SELECT event, timestamp, coalesce(toString($session_id),'') AS session_id, coalesce(toString(properties.visit_id),'') AS visit_id,
       coalesce(toString(properties.page_path),'/') AS page_path, coalesce(toString(properties.page_surface),'document') AS page_surface,
       properties.active_ms AS active_ms, properties.referrer_domain AS referrer_domain,
       properties.$raw_user_agent AS user_agent, properties.$browser AS browser, properties.$os AS os,
       properties.$device_type AS device, properties.$virt_is_bot AS ph_bot
FROM events
WHERE event IN ('page_visit','page_active_time','page_exit','element_click','attention_sample')
  AND <window> AND {filters}
  AND coalesce(toString(person.properties.$internal_or_test_user),'false') NOT IN ('true','1')
  AND NOT (distinct_id IN <IDS> OR coalesce(toString(properties.$user_id),'') IN <IDS>)
  AND person_id NOT IN (SELECT person_id FROM person_distinct_ids WHERE distinct_id IN <IDS>)
ORDER BY timestamp, uuid LIMIT 50001

-- P4b: SQL approximation of tq-2026-09-30
WITH s AS (
  SELECT session_id,
    argMinIf(toString(user_agent), timestamp, toString(user_agent) != '') AS ua,
    argMinIf(toString(browser), timestamp, toString(browser) != '') AS br,
    argMinIf(toString(os), timestamp, toString(os) != '') AS os_,
    argMinIf(toString(device), timestamp, toString(device) != '') AS dev,
    argMinIf(toString(referrer_domain), timestamp, event = 'page_visit') AS ref,
    argMinIf(page_path, timestamp, event = 'page_visit') AS landing,
    uniqIf(concat(page_path,'|',page_surface), event = 'page_visit') AS pages,
    countIf(event = 'element_click') AS clicks,
    max(toString(ph_bot) IN ('true','1')) AS phbot
  FROM (<P4a without LIMIT>) WHERE session_id != '' GROUP BY session_id),
 act AS (  -- active ms: per visit, page_exit max if any else sum of page_active_time
  SELECT session_id, sum(if(has_exit, exit_ms, flush_ms)) AS active_ms FROM (
    SELECT session_id, visit_id, countIf(event='page_exit') > 0 AS has_exit,
           maxIf(toFloat(active_ms), event='page_exit') AS exit_ms, sumIf(toFloat(active_ms), event='page_active_time') AS flush_ms
    FROM (<P4a without LIMIT>) WHERE event IN ('page_exit','page_active_time') GROUP BY session_id, visit_id) GROUP BY session_id),
 j AS (
  SELECT s.*, coalesce(act.active_ms,0) AS active_ms,
    multiIf(landing='/','home', match(landing,'^/(p|places)/'),'place', match(landing,'^/guides/[^/]+'),'guide',
            match(landing,'^/events/[^/]+/[^/]+'),'event-detail', match(landing,'^/florida-events/[^/]+'),'event-detail',
            splitByChar('/', landing)[2]) AS kind,
    clicks = 0 AND pages <= 1 AND coalesce(act.active_ms,0) < 10000 AS noeng
  FROM s LEFT JOIN act ON act.session_id = s.session_id),
 rep AS (SELECT concat(br,'|',os_,'|',kind) AS fp, count() AS n FROM j WHERE noeng AND ref = '' AND dev = 'Desktop' GROUP BY fp)
SELECT count() AS raw_sessions,
       countIf(automated) AS automated_sessions,
       count() - countIf(automated) AS people_sessions,
       countIf(NOT automated AND noeng) AS people_quick_bounces
FROM (SELECT j.*, (match(ua, '(?i)(bot\\b|crawler|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptimerobot|facebookexternalhit|whatsapp|google-inspectiontool|googleother|bingpreview|yandex|baidu|wayfindsyntheticmonitor)')
                    OR phbot OR (br = '' AND os_ = '' AND clicks = 0)
                    OR (noeng AND ref = '' AND dev = 'Desktop' AND coalesce(rep.n,0) >= 5)) AS automated
      FROM j LEFT JOIN rep ON rep.fp = concat(j.br,'|',j.os_,'|',j.kind))
```

Caveats for P4b:
- the code's `||` fallbacks (`browser||"?"`) and stable-sort ties may differ at the margin
- the code also counts rows with an empty `session_id` in event totals
- the 50 000-row cap can truncate the code's view (check `count()` of P4a first)

**P5 — Revenue heartbeat** (`posthog.js:409-419`)
```sql
SELECT toStartOfDay(timestamp,'America/New_York') AS day, countIf(event='$pageview') AS traffic,
       countIf(event IN ('commerce_impression','commerce_cta_clicked')) AS affiliate_activity
FROM events WHERE <window> AND {filters} AND <REAL> GROUP BY day ORDER BY day
```

**P6 — Cross-store comparable pairs** (aggregate-only, because the identities do not join):

| PostHog | Supabase | expected relation |
|---|---|---|
| `countIf(event='detail_open')` with REAL | `count(*) filter (where action='detail_open')` S1 | PH ≥ SB: PH also gets `track()` surfaces (M6) and lacks ad-blocked browsers (M12) |
| `countIf(event='session')` with REAL | S1 `sessions` | ≈ equal (same `logEvent` call), modulo ad-blockers and pre-init tab closes |
| `countIf(event IN ('like','save','share','dislike'))` | S1 likes/saves/shares | SB can exceed PH by the M1 leak in windows before #1617 (2026-10-01 10:28:55 UTC) |
| `countIf(event='screen_view')` | S1 `screen_views` | ≈ equal |
