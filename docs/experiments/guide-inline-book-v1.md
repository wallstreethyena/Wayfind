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
