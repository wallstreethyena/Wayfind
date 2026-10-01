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

Observations logged at the same time (2026-10-01, production, 390×844). These are **not results and not a decision**:

- The treatment's "Best for" cue mounts after hydration. It adds about **0.03 CLS** in the treatment arm only. This is below the 0.1 "good" line. It is part of the approved treatment, so it is left unchanged.
- The **`explore-bridge-v1`** treatment (a separate experiment that assigns independently from the same `wf_exp_id`) inserts about 563px at hydration on this guide. That is up to **0.66 CLS**. Both arms of this test are equally exposed to it, so the comparison stays balanced, but it lowers absolute engagement. The decision belongs to that experiment's owner and is tracked in #1602. It is not a reason to change this test.
- Instrumentation re-checked live after both deploys:
  - treatment: cue on picks 1–3 (not 4), one offer through `/api/commerce/go`, `offer_ready` reported;
  - control: unchanged;
  - automated browsers: get no exposure and no `$feature/…` property.
- The "8–9 weeks" in the decision rule is an **estimate** from about 60 exposed sessions per arm per week. The stopping rule is the **500 exposed sessions per arm**, not the calendar.
