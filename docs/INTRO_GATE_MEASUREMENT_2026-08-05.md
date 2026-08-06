# Intro gate — measurement plan (PR #590)

- **Change:** the welcome/mood overlay's auto-show now waits **2 minutes of visible time** and
  fires **at most once per device, ever** (PR #590). Paid and deep-link traffic already skipped
  it (`6cb95ec`).
- **Author:** codex (Wayfind lane), 2026-08-05.
- **Status:** baselines below are **measured**, not estimated. Evaluation dates are set. Until
  the D+7 read happens, this change is a **hypothesis**, per the repo's measurement rule.

All figures pulled from PostHog project 507756 on 2026-08-05 via `execute-sql`. Queries are
inline so every number here is falsifiable — re-run them, don't trust the table.

---

## 1. Why this matters more than the brief suggested

The change was justified on the gate's own exit rate. That was the weaker signal. The stronger
one is that **the core activation metric collapsed when the gate shipped on 2026-08-01**, and
it did so **among organic traffic, which has no paid-mix confound**:

| day | organic sessions | **organic activation** | paid sessions | paid activation |
|---|---|---|---|---|
| 2026-07-28 | 74 | **0.122** | 1 | 0.0 |
| 2026-07-29 | 91 | **0.154** | 3 | 0.0 |
| 2026-07-30 | 60 | **0.183** | 1 | 1.0 |
| 2026-07-31 | 64 | **0.188** | 1 | 0.0 |
| 2026-08-01 *(gate ships)* | 77 | **0.130** | 9 | 0.333 |
| 2026-08-02 | 80 | **0.062** | 0 | — |
| 2026-08-03 | 44 | **0.023** | 18 | 0.0 |
| 2026-08-04 | 61 | **0.033** | 56 | 0.0 |
| 2026-08-05 *(partial)* | 66 | **0.045** | 44 | 0.091 |

**Pre-gate organic mean ≈ 0.16. Post-gate organic mean ≈ 0.04 — a ~75% drop.**

The paid-ramp explanation does not account for it. Attributed sessions were 1–3/day through
July and only ramped on **08-03** (18 → 56/day), but organic activation had already fallen to
**0.062 on 08-02, a day with zero attributed sessions**. The break tracks the gate's ship date,
not the ad spend.

```sql
-- the split above
WITH sess AS (
    SELECT properties.$session_id AS sid,
           min(toDate(timestamp)) AS day,
           max(coalesce(properties.utm_source,'') != '' OR coalesce(properties.utm_medium,'') != ''
               OR coalesce(properties.fbclid,'') != '') AS is_attributed,
           max(event = 'session_activated') AS activated
    FROM events
    WHERE timestamp >= now() - INTERVAL 10 DAY AND coalesce(properties.$session_id,'') != ''
    GROUP BY sid
)
SELECT day,
       countIf(NOT is_attributed) AS organic_sessions,
       round(countIf(activated AND NOT is_attributed) / nullIf(countIf(NOT is_attributed),0), 3) AS organic_activation,
       countIf(is_attributed) AS paid_sessions,
       round(countIf(activated AND is_attributed) / nullIf(countIf(is_attributed),0), 3) AS paid_activation
FROM sess GROUP BY day ORDER BY day DESC
```

**A trap worth recording:** the first version of this split classified **100% of sessions as
paid**, because `properties.utm_medium != ''` is not false when the property is null. It
returned a clean-looking table that was entirely wrong. It was caught only by running a control
first — "how many sessions carry *any* attribution?" — which returned 1–3/day for July and
exposed the classifier. Any split of this data needs `coalesce(...) != ''` and a control count.

## 2. The gate's own exit rate (the brief's metric)

| day | intro_shown | intro_dismissed | intentional-exit rate |
|---|---|---|---|
| 2026-08-01 | 50 | 39 | **0.78** |
| 2026-08-02 | 33 | 24 | **0.727** |
| 2026-08-03 | 16 | 6 | **0.375** |
| 2026-08-04 | 46 | 8 | **0.174** |
| 2026-08-05 *(partial)* | 59 | 27 | 0.458 |

Confirms the brief (78 → 73 → 37 → 17%). Treat **08-05 as contaminated**: local verification for
PR #590 ran against `localhost` with a live PostHog key and may have added a small number of
`intro_shown` / `intro_dismissed` rows. Exclude 08-05 from any before/after comparison.

## 3. What should happen, and what would falsify it

**Primary metric — organic activation rate.** Baseline **0.16** pre-gate, **0.04** now.

| outcome at D+7 | reading |
|---|---|
| organic activation ≥ **0.12** | Working. The gate was the cause; most of the loss is recovered. |
| **0.06 – 0.12** | Partial. Real but incomplete — look at `intro_stand_down` and the giveaway interaction (§5) before doing more. |
| ≤ **0.06** | **The gate was not the (only) cause.** Do not iterate on the gate further. Something else shipped in the 08-01/08-02 window; go find it. |

**Secondary — `detail_open` rate per session.** Baseline 0.16–0.23 pre-gate, 0.017–0.111 now.
Should move with the primary. If activation recovers and `detail_open` does not, the activation
metric is being satisfied by something other than genuine engagement — investigate rather than
celebrate.

**Guardrail — the gate is not supposed to die entirely.** Expect `intro_shown` to fall sharply
(most sessions end under 15s), but **not to zero**. `trigger` now distinguishes the three doors:

```sql
SELECT toDate(timestamp) AS day, properties.trigger AS trigger, count() AS shown,
       round(avg(toFloat(properties.visible_ms)), 0) AS avg_visible_ms
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY AND event = 'intro_shown'
GROUP BY day, trigger ORDER BY day DESC, shown DESC
```

- `trigger = 'timer'` at **zero for 3+ consecutive days** with non-trivial traffic ⇒ the gate is
  effectively dead. That is over-correction, not success — escalate.
- `avg_visible_ms` should sit just above 120000. Materially higher means retries are routinely
  waiting out an open dialog (see §5).

**Guardrail — the exit rate on sessions that DO see it** should return toward the 0.73–0.78 of
01/02 Aug. These are now engaged visitors; if they still dismiss without choosing, the sheet's
*content* is the problem and no amount of timing will fix it.

## 4. `intro_stand_down` — the new absence-side signal

Shipped with #590; the mount-phase half was added the next day (see below). Without this event,
"nobody saw the intro" and "the intro is broken" are the same shape — an absence of
`intro_shown`.

Two phases, and the distinction matters for every query below:

| `phase` | meaning | `visible_ms` |
|---|---|---|
| `mount` | skipped at load — the effect returned before arming a timer | always `0` |
| `gate` | the 2-minute mark was reached, then the overlay was suppressed | real |

```sql
SELECT properties.phase AS phase, properties.why AS why, count() AS n,
       round(avg(toFloat(properties.visible_ms)), 0) AS avg_visible_ms,
       round(avg(toFloat(properties.attempt)), 2) AS avg_attempt
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY AND event = 'intro_stand_down'
GROUP BY phase, why ORDER BY phase, n DESC
```

**Always group by `phase`.** `mount` rows carry `visible_ms: 0` by definition, so averaging
across both phases produces a meaningless number.

### `phase = "gate"` — reached 2 minutes, then suppressed

- **`value_seen`** — had already opened a place. Working as designed.
- **`interrupt_claimed`** — another prompt took the session's one interruption. Almost always the
  giveaway; see §5.
- **`dialog_open`** — deferred at least once behind an open dialog. Logged once per session.
- **`retries_exhausted`** — gave up after 8 × 20s still blocked. If this is more than a rounding
  error, the coordination between prompts needs work, not the timer.

### `phase = "mount"` — skipped at load, before any timer was armed

Added 2026-08-06 (D+1). The original design left these three branches emitting **nothing**, which
reproduced the exact ambiguity this event exists to remove, one step earlier: a session correctly
skipped at mount and a session whose timer was broken both produced silence.

Found by the D+1 smoke check itself — two sessions ran past two minutes with zero intro events
and there was no way to tell which case it was. That is the guardrail catching a hole in its own
instrument, which is the point of running a D+1 read at all.

- **`deep_link`** — arrived on `?q`/`?go`/`?place`/`?list`/`?exp`.
- **`paid`** — arrived on a campaign/click-ID landing (`6cb95ec`). Watch this one: it is the
  traffic the paid skip was bought to protect, and a sudden fall to zero means the attribution
  parse broke, not that spend stopped.
- **`already_seen`** — the durable once-per-device flag was set. Expect this to become the
  **dominant** row over time as the installed base accumulates the cookie. That is the design
  working, not a fault.

**The denominator this gives you:** `intro_shown(trigger="timer")` + all `gate` rows = sessions
that reached two minutes. Adding the `mount` rows accounts for every other session the effect
saw. An unexplained gap between that total and session count means the effect is not running at
all — which nothing else in this plan would have surfaced.

## 5. The known confound: the giveaway prompt

The giveaway is **live 2026-07-03 → 2026-10-31**, fires at ~30s, and claims `wf_interrupted`. In
any session where it shows, the intro stands down at 120s with `interrupt_claimed` — by design
(`claimInterrupt` is what stops two overlays racing), but it means real intro reach will sit
below what session-length math alone predicts.

**Read `intro_stand_down` by `why` before concluding anything about the timer.** If
`interrupt_claimed` dominates, the 2-minute gate is not what is suppressing the overlay, and
tuning it further would be tuning the wrong thing. `giveaway_pop` volume is the cross-check.

## 6. Schedule and ownership

| when | what |
|---|---|
| **D+1** (2026-08-06) | Smoke only: `intro_shown` with `trigger='timer'` is non-zero, `intro_stand_down` is arriving with all four reasons reachable. Confirms instrumentation, not impact. |
| **D+7** (2026-08-12) | **Primary read.** Organic activation vs the 0.16 baseline, against the table in §3. |
| **D+14** (2026-08-19) | Confirm the D+7 direction held. Only then treat the result as real. |

**Decision owner: Gabriel.** This lane reports numbers; it does not decide whether to keep,
tune, or revert.

## 7. Honest limits

- **Small n.** 44–91 organic sessions/day, single-digit activations. Day-to-day swings are wide
  and no single day means anything. Compare 4-day windows, never day-over-day.
- **Correlational.** One time-series break with no holdout. The organic split rules out the paid
  ramp specifically; it does not rule out anything else that shipped on 2026-08-01/02. Confirming
  what else landed in that window would materially strengthen — or kill — the causal story, and
  has not been done.
- **`session_activated` reads 0.0 on 2026-07-27** and the event is absent before then, so the
  pre-window is only **4 days** (07-28 → 07-31).
- **2026-08-05 is contaminated** by local verification traffic (§2) and is a partial day.
- A **holdout** would settle this properly. Not proposed for this change — the current state is
  costing activation now — but it is the right instrument for the follow-up (intent-based
  triggers) referenced in PR #590.
