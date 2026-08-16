# Why "Exploding Trends Near You" is empty — and what replaces Foursquare

**Written 2026-08-16. Requested before any further code is written against popularity.**

Owner: *"exploding trends nothing shows up"* and *"I need to know what replaces Foursquare for popularity before anyone writes more code against it."*

Short version: **Foursquare is not the thing that needs replacing.** The rail is empty for a chain of four causes, and the Foursquare v3 sunset is only the third of them. Two of the four are ours and are fixable this week; one is a genuine sourcing decision that needs your call.

---

## 1. The rail is not broken. It is correctly reporting that it has nothing.

`lib/railSelect.js` gates `trending` on `!!p.trending`, set by `attachTrendSignals` at `TREND_THRESHOLD = 0.66`. Both work.

The threshold is **reachable**, contrary to the first hypothesis. On the server path `attachTrendSignals` gets no events, so `nearbyEventScore` returns null — but the scorer **renormalises over present sources only**:

```
wSum = 0.5              (popularity weight)
vSum = 0.5 · v
trendScore = vSum / wSum = v      ← exactly tier2_popularity
```

So `trending ⟺ tier2_popularity >= 0.66`. Measured: **57 of 164 scored rows (34.8%) clear it.** The signal fires.

Live from production `/api/rails?city=sarasota`, the rail serves 50 places. Joining them against the popularity table:

| place | score | pool it came from |
|---|---|---|
| Bayfront Park | 0.929 | things-to-do |
| **Venice Beach** | 0.821 | **beaches** |
| Sarasota Jungle Gardens | 0.750 | things-to-do |
| **Coquina Beach** | 0.714 | **beaches** |

Four qualify. `trending`'s pools are `["things-to-do", "restaurants", "nightlife"]` — **`beaches` is not among them**, so two of the four are invisible to it. Two is below `MIN_CARDS = 3`, so the rail ships empty **exactly as designed**. `thin: ["trending","locals"]` is the honest output of a correct system with insufficient input.

**This is the whole of your item 4, and you are right.** In Sarasota in August, the beaches *are* what is spiking, and they are the only qualifying places we can currently measure. Adding `"beaches"` to that pool list is a one-line change, it lowers no threshold, softens no claim, and the rail's own axis — *"demand — what people are searching"* — has no principled reason to exclude sand. **Recommended, and it should ship with the audit PR.**

But it treats the symptom. The rest of this document is the disease.

---

## 2. 43 of the 50 rail places have no popularity row at all

Not a low score — **no row**. And of the 164 rows that exist:

```
BY SOURCE: { "wikipedia": 164 }
```

**Yelp, Foursquare and TripAdvisor have never written a single row.** All four are wired as `FETCHERS` in `lib/popularity.js:157`. Only one has ever produced data.

## 3. Food and nightlife cannot have popularity data. By construction.

`lib/popularity.js:82`:

```js
export function sourcesFor(category) {
  if (category === "food" || category === "nightlife")   return ["yelp", "foursquare", "tripadvisor"];
  if (category === "attractions" || category === "beach") return ["wikipedia", "foursquare", "tripadvisor"];
  return ["foursquare", "tripadvisor"];
}
```

Food and nightlife are routed to **exactly the three sources that produce nothing**, and are deliberately denied the only source that works. So:

- every restaurant and every bar has **zero** possible popularity coverage
- `trending`'s pools are `things-to-do`, `restaurants`, `nightlife` — **two of the three are structurally incapable of ever contributing**
- the rail is drawing on one pool, covered by one source, that covers parks and landmarks

That is the real reason the rail is empty, and it would still be empty with Foursquare alive unless Yelp or TripAdvisor started returning rows.

## 4. The rebuild cron fails silently, and has no pulse

`app/api/cron/popularity/route.js:32`:

```js
if (!url || !svc) return Response.json({ error: "no service key" }, { status: 200 });
```

**HTTP 200 on a total no-op.** Any monitor watching status codes sees a healthy job.

`SUPABASE_SERVICE_ROLE_KEY` was the literal string `[SENSITIVE]` from **2026-08-13** (`66e653a`) until it was replaced with a working `sb_secret_` key on **2026-08-16**. For those three days this cron could not write anything, and said so with a 200.

Write volume corroborates it — against a stated capacity of ~1,200 places/day:

```
2026-08-13   12      2026-08-15    1
2026-08-14   23      2026-08-16    1
```

And `wf_job_pulse` contains **no `popularity` rows at all**, so the job is not recording runs either way.

**The key is now fixed**, so this specific failure should stop. It does not fix §3.

---

## What I could NOT determine

Stated rather than guessed:

- **Why Yelp and TripAdvisor return nothing.** `fetchYelp` distinguishes `no_key` from `no_match` via `notePop`, but those outcomes go to `POP_DIAG` and I found no persisted log to read. It is either dead credentials or universal match failure, and **the fix is completely different in each case**. This is the first thing to measure.
- **Whether the cron is invoked at all.** No pulse rows; I did not read the Vercel cron invocation log.
- **Commercial terms** for any replacement source. No pricing verified.

---

## What replaces Foursquare — the actual decision

Foursquare v3 sunset removed one of three non-wikipedia sources. Ranked by what the evidence supports:

**A. Find out why Yelp and TripAdvisor are silent. Do this before buying anything.**
Both are already integrated, keyed and rate-limit-aware. If this is `no_key` — plausible, since `vercel env pull` writes `[SENSITIVE]` over **40 of 67 vars including `YELP_API_KEY` and `TRIPADVISOR_API_KEY`**, and any local or misconfigured runtime reading those gets a dead key — then food/nightlife coverage is a credential fix, not a sourcing project. Cost: hours. **Start here.**

**B. Google Places `userRatingCount` as the popularity metric.**
We already pay for Places, already store `place_id`, and already hold rating and review counts for the whole inventory. Review volume is a demand proxy of the same kind Yelp's `review_count` provides — and the scorer is percent-ranked, so it only needs to be *ordinally* meaningful. Covers 100% of inventory including every restaurant and bar. No new vendor, no new key, no new cost.
Caveat, and it is real: it measures *accumulated* popularity, not *recent* spike. "Exploding" implies a delta. Storing a rolling snapshot and ranking on **change over time** would make it genuinely trend-shaped, at the cost of needing history before it can say anything.

**C. Keep wikipedia, extend its routing.**
The only source that works. Currently denied to food/nightlife — correctly, since restaurants rarely have articles. Not a fix for the categories that are empty.

**D. A new vendor.** Only if A and B both fail. Not justified by anything measured here.

**Recommendation: A now, B as the durable answer, and add `beaches` to the trending pools so the rail stops lying about having nothing while it is fixed.**

---

## Why nothing caught this

`scripts/test-rail-select.mjs:120` asserts *"nothing is trending in the fixture, so the rail is empty — not padded"*, and `:130` asserts `thin.includes("trending")`. **It is green on the bug**, because it encodes empty-as-correct on synthetic fixtures. `scripts/test-buzz.mjs:53` goes further and records the live symptom as intended behaviour: *"measured on the preview 2026-08-15 in Sarasota, where it does exactly that."*

Both are correct about the code. Neither can see that the input is absent.

**The guard that would have caught it** — proposed, not yet written: for every rail whose predicate reads a DB-backed flag, assert the backing table intersects that rail's own pools above `MIN_CARDS`. Here that is

```
count(wf_place_popularity_scored ∩ {things-to-do, restaurants, nightlife}
      where tier2_popularity >= TREND_THRESHOLD) >= 3
```

It would have gone red the day restaurant coverage hit zero — months before anyone looked at the homepage. Critically, it separates the two states that are indistinguishable from outside:

> **"nothing is trending"** (honest, ship the empty rail) &nbsp;vs&nbsp; **"nothing is measured"** (broken, fix the source)

That distinction is the entire bug.

A second guard should cover the silent-200 class: a cron that cannot do its work must not answer 200. `AGENTS.md §5` already says absent configuration fails loudly; `route.js:32` violates it.
