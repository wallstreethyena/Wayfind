# guide-inline-book-v1 — pre-registered success metrics

Written **before** launch. Do not change a metric, threshold or duration after
data arrives; any change bumps the key to `-v2` and restarts the test.

## Hypothesis
On `/guides/things-to-do-orlando-not-theme-parks`, readers who reach pick 1 will
tap a partner offer and a place more often when pick 1 carries a "Best for" cue
and one bookable option for the thing it recommends, without reading less.

## Population (every metric)
- Session contains `guide_experiment_exposed` (pick 1 was on screen), `experiment = guide-inline-book-v1`.
- `$geoip_country_code = 'US'`.
- Not automated under the Command Center rule `tq-2026-09-30`
  (crawler UA, `$virt_is_bot`, no browser identity, repeated empty desktop visit).
- Unit = **session** (`uniq($session_id)`), never raw events. Arm = the `variant`
  on the exposure event (not the `$feature/…` super property, which is also set
  on readers who never reached pick 1).

## Primary metric
**Partner-tap rate** = sessions with ≥1 `commerce_cta_clicked` on this guide
(surface `guide_pick_inline` **or** `intent_partner_rail`, both arms) ÷ exposed sessions.
Carousel taps count in both arms so that cannibalisation cannot read as a win.

Baseline: carousel ≈ 1.5% of guide sessions.

## Secondary metrics
1. **Place-card tap rate**: sessions with an `element_click` carrying `place_id`, or linking to `/places/…` or `/p/…`, ÷ exposed sessions.
2. **Depth**: share of exposed sessions whose `page_exit.max_scroll_pct` ≥ 75.
3. **Outbound conversion**: sessions with any partner tap or a Directions tap ÷ exposed sessions.

## Guardrails (the treatment fails if any holds)
- Median foreground time (`page_exit.active_ms`) falls by more than 20%.
- The rate of the end-of-guide next step (`guide_next_step`) falls by more than 20%.
- The share of exposed treatment sessions with `offer_ready = false` rises above 25%. That would make the test mostly cue-only; investigate before reading the result.

## Decision rule
- Two-proportion z-test on the primary metric, p < 0.05, two-sided.
- Minimum **500 exposed sessions per arm**. At about 60 exposed per arm per week that is **8–9 weeks**. No stopping early on a peek.
- **Win**: the primary metric is significantly up and no guardrail is breached. Then roll out to 100% (key `-v2` at `TREATMENT_PCT = 100`) and extend it to the next guide.
- **Early read** (direction only, never a decision) at 4 weeks, on the place-card tap rate (baseline ≈ 24%).

## Events emitted
| event | when | key properties |
|---|---|---|
| `guide_experiment_exposed` | pick 1 sentinel enters the viewport, both arms, once per page view | experiment, variant, slug, pick, offer_ready |
| `$feature/guide-inline-book-v1` | super property set at mount | variant |
| `commerce_impression` | inline offer ≥50% visible | surface=guide_pick_inline, provider, offer_id, experiment_id, variant |
| `commerce_cta_clicked` | inline offer tapped (emitCommerce only) | the same fields + click_id |
| `guide_pick_book_clicked` | the same tap, product side | pick, offer_id, from_price, variant |
| `element_click` (existing) | any tap, now with `place_id` (PR #1560) | place_id, destination_type |

Known undercount: a long-press or middle-click "open in new tab" skips onClick. The redirect then happens without a click event. This is symmetric across arms.

## Change history

Append-only. Each entry records a production change that touched the page or the
measurement while the test runs. **Nothing here changes a metric, threshold,
population, split or the decision rule above.** Those stay as pre-registered.

| when (UTC) | change | SHA / deploy | effect on this test |
|---|---|---|---|
| 2026-09-30 03:08 (merge) | Launch: #1564 | `12a6e9a` | Test starts. Assignment `wf_exp_id`, 50/50. |
| 2026-10-01 02:33 (prod ready) | #1586 records taps on the body of home-feed place cards (`IconicPlaceCard`), with `place_id` | merge `05f8724`, `dpl_Gnh3FmG6Q3hpNYe1dKWiW3EYwaaN` | There is no change on the guide page. Off-guide card taps now carry `place_id`, so an exposed session that later taps a home-feed card can newly count toward **secondary metric 1**. This affects both arms equally, but the level shifts at this timestamp. **Analysis note (not a criterion change):** the registered definition stays the metric. *In addition*, report secondary 1 restricted to `page_path = /guides/things-to-do-orlando-not-theme-parks`, and split before and after this timestamp, so this shift is visible. |
| 2026-10-01 02:50 (prod ready) | #1596 server-renders the "Bookable highlights" rail so it can't pop in above pick 1 | merge `2dfb20b`, `dpl_HBbgyMjWPUDZhGWGt3NiQ5D49JEs` | **Orlando is unchanged.** Its rail was already painted at first load from the static curated picks (measured: pick 1 held still before and after). The fix matters on the 39 other guides that have an owned cache. No effect on either arm here is expected. |
| 2026-10-01 05:05:09 (prod ready) | #1610: homepage bundle headroom (`IconicPlaceCard` reads the lean creator mirror) | merge `c8ce0e6`, `dpl_DNNHmy4fxH4ezmXsyaNYEyiLVCrt` | None. Homepage bundling only, with output proven identical. Nothing on the guide changes. |
| 2026-10-01 05:16:11 (prod ready) | #1611: external photo-credit and licence links open in a new tab (#1601) | merge `0c6a279`, `dpl_CWFatiEu8zb4YpqtGK87zCMeYCKz` | **Symmetric**: both arms have the same 20 credit links on this guide. A credit tap no longer replaces the guide, so the session continues instead of ending on an exit. Foreground time and depth (guardrail 1, secondary 2) may rise **in both arms** from this timestamp. Read them before and after it, never across it. |
| 2026-10-01 05:30:08 (prod ready) | #1609: the `explore-bridge-v1` treatment is painted before hydration (#1602) | merge `5ab657e`, `dpl_EeTEPDNEGE8NrHfRhfisP7xBUNaS` | **Symmetric**: assignment here is independent of explore-bridge, so both arms hold the same mix of bridge-treatment readers. Those readers are no longer pushed down about 563px mid-read. Pick 1 exposure timing is unaffected (the bridge sits above it in both arms, as before). |
| 2026-10-01 10:28:55 (prod ready) | #1617: first-party `events` writes from like/save/share/dislike now obey the owner/internal/bot gate; server `llm_call` rows no longer carry device `"server"` | merge `848610c`, `dpl_CuqGLe5bBRR7BRuKwcqtxvEaEQQf` | **None on this test's metrics.** Exposure and the registered outcomes are PostHog events, and this change touches only Supabase `events` rows. Command Center first-party device counts drop by the owner's, internal browsers' and bots' card actions, plus one `"server"` device. Do not compare first-party device KPIs across this timestamp. |
| 2026-10-01 11:04:44 (prod ready) | #1619: the Command Center stale-on-error cache keeps arrays as arrays | merge `2c149e1`, `dpl_7EwvArLpZ6xWrL3cqVw7Dg765Hxa` | None. This is the dashboard read path only, and it is not observable by visitors. Before the fix, a provider error could make the dashboard silently drop the owner-account exclusion. Readings taken during a flap before this timestamp may include the owner. |
| 2026-10-01 11:23:20 (prod ready) | #1618: Fraunces is **preloaded on the routes that set it** and has a metric-matched Android fallback (the "Right now" font jump) | merge `29803ad`, `dpl_Ee4RtyzFJXFs7e6poNdnbzq4cciU` | **Symmetric across arms; the CLS guardrail is not comparable across this timestamp.**<br>- The Fraunces swap that moved "Right now" and pick 1 (Android-class: Orlando 42–103px, Sarasota 38px; production measurement) is gone on cold loads, in both arms equally.<br>- Assignment, the inline cue and exposure are unchanged.<br>- Engagement below the fold may rise slightly in both arms, because the page no longer jumps under the reader. That is a shared shift, not a treatment effect.<br>- Read the CLS guardrail separately before and after this deploy. |

Observations logged at the same time (2026-10-01, production, 390×844). These are **not results and not a decision**:

- The treatment's "Best for" cue mounts after hydration. It adds about **0.03 CLS** in the treatment arm only. This is below the 0.1 "good" line. It is part of the approved treatment, so it is left unchanged.
- The **`explore-bridge-v1`** treatment (a separate experiment that assigns independently from the same `wf_exp_id`) inserts about 563px at hydration on this guide. That is up to **0.66 CLS**. Both arms of this test are equally exposed to it, so the comparison stays balanced, but it lowers absolute engagement. The decision belongs to that experiment's owner and is tracked in #1602. It is not a reason to change this test.
- Instrumentation re-checked live after both deploys:
  - treatment: cue on picks 1–3 (not 4), one offer through `/api/commerce/go`, `offer_ready` reported;
  - control: unchanged;
  - automated browsers: get no exposure and no `$feature/…` property.
- Pre-existing, separate from both experiments: when webfonts land after first paint (Fraunces is `preload:false`), text reflows and "Right now" grows by about 24px, a shift of about 0.03–0.04 CLS above pick 1. It reproduces on production with fonts delayed 2.5s, in both arms equally. It is not fixed by any change above; it is recorded so that a CLS reading is not misattributed to this test.
- The "8–9 weeks" in the decision rule is an **estimate** from about 60 exposed sessions per arm per week. The stopping rule is the **500 exposed sessions per arm**, not the calendar.

Production check after #1618 (2026-10-01, `29803ad`), real production site, contained browser:
- **Full spec:** `tests/e2e/font-fallback-swap.spec.js` passed 69/69.
- **Late Fraunces:** "Right now" and pick 1 held still, ≤2px, in all 16 guide-template cases (Android and Apple emulation × 390/1280 × both arms). Before the fix, production failed 6 of them, with moves of 42–103px.
- **Cold modelled-4G load:** in 27/28 cases Fraunces was applied before first paint. In the 28th it landed 60ms after first paint and moved nothing.
- **Sitemap sweep:** all 67 `--wf-display` routes now preload exactly the Fraunces file their CSS uses (before: 0). The 62 other sampled pages no longer load Fraunces at all (before: all 62 did).
