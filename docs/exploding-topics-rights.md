# Exploding Topics / Semrush — rights status

**Status: `unconfirmed`. The integration is built and unreachable.**

`EXPLODING_TOPICS_RIGHTS_MODE` is not set anywhere (checked in the environment
and in every `.env*` file — by variable name only, never by reading values). Per
`lib/trendRights.js` there is no default: every entry point throws and names the
variable until somebody decides.

This is not a bug to be worked around. It is the licence question, unanswered.

---

## Why the plan you already pay for may not cover this

The current plan is Exploding Topics **Investor ($99/mo)** with CSV export. That
purchase clearly buys the export. What it does not obviously buy is everything
this integration would do with it:

| Use | Needed for | Covered by the plan? |
|---|---|---|
| Export the CSV | the whole pipeline | **Yes** — it is the product |
| Read/parse it internally | `internal_research` | Probably — ordinary internal use |
| Private owner-facing report | `internal_research` | Probably |
| Pass rows to an LLM | any AI classification | **Doubtful** — see below |
| Derive a public ranking signal | reordering user-facing lists | **Doubtful** |
| Display topic names/metrics to users | the card label + disclosure | **Doubtful** |
| Cache beyond the subscription term | retention | **Unknown** |
| Redistribute to Wayfind's users | any public surface | **Doubtful** |

The doubt is not invented. Semrush's terms describe ordinary use of the service
as **internal business use**, and separately restrict commercial exploitation of
the output, making output available to third parties, and using output as
**AI/ML input**. Their own documentation points commercial productisation toward
a custom arrangement rather than a self-serve tier. Wayfind is a commercial
consumer product, and its users are third parties.

**The asymmetry that sets the default.** Reading the CSV when we were allowed to
costs nothing. Reading it when we were not is a licence breach that no later code
change undoes. So every gate fails closed, and the mode has no default value.

---

## The exact questions to put to Semrush

Send these as written and keep the reply. Each maps to a capability in
`lib/trendRights.js`, and a "yes" to one is not a "yes" to any other.

> We subscribe to Exploding Topics (Investor plan, $99/mo) and use the CSV
> export. We operate Wayfind, a commercial consumer app that recommends local
> places. Please confirm, in writing, which of the following our current plan
> permits, and which require a different agreement:
>
> 1. **Internal analysis.** May we import the CSV into our own systems and
>    analyse it for internal product research?
> 2. **AI/ML processing.** May we pass exported rows, or values derived from
>    them, to a large language model or other ML system — including for
>    classification or matching?
> 3. **Derived ranking.** May a value derived from the export influence the
>    ORDER in which we show our own content to our users, without displaying any
>    Exploding Topics data itself?
> 4. **Public display.** May we display a topic NAME (e.g. "Korean coffee") to
>    end users as a label on our own content?
> 5. **Public metrics.** May we display a metric (e.g. "search interest up 190%
>    over 12 months, ~12,100 monthly searches") to end users?
> 6. **Attribution.** If display is permitted, what attribution is required, and
>    what exact wording and placement do you require?
> 7. **Retention.** How long may we retain exported data? Must it be deleted at
>    the end of the subscription term?
> 8. **Redistribution.** Does showing derived values to our end users count as
>    making the output available to third parties under your terms?
> 9. **Volume/frequency.** Are there limits on export frequency or on the number
>    of topics we may retain?
> 10. **If any of the above requires a different agreement**, which product or
>     licence covers it, and what does it cost?

**Question 3 is the load-bearing one.** If derived ranking is permitted but public
display is not, the system still delivers most of its value: better ordering
inside Wayfind's own lists, with no Exploding Topics data on screen. That is a
materially cheaper permission to obtain and it is worth asking for separately
rather than bundling it with display.

---

## Recording the answer

When Semrush replies, fill this in **in this file** and set the mode. Do not
paste confidential contract text — record the decisions, not the document.

```
Date confirmed:            <YYYY-MM-DD>
Semrush reference:         <support ticket / contract ref>
Approved uses:             <list>
AI processing allowed:     yes / no
Derived ranking allowed:   yes / no
Public display allowed:    yes / no
Required attribution:      <exact wording and placement, or "none">
Retention limit:           <duration, or "none stated">
Redistribution:            <what is permitted>
Mode set to:               internal_research | commercial_approved
EXPLODING_TOPICS_RIGHTS_REF: <the same reference, set in the environment>
Set by:                    <name>
```

**Raising the mode requires TWO variables, not one.** `lib/trendRights.js`
throws unless `EXPLODING_TOPICS_RIGHTS_REF` is also set to the reference above —
a Semrush ticket number, contract clause, or email id. Placeholder values
(`TODO`, `tbd`, `<contract ref>`) are rejected.

Without this, raising the licence is a one-word edit nobody reviews and nothing
records, and six months later the only evidence Semrush ever approved anything
is that somebody once typed `commercial_approved`. The reference is not a secret;
it is written into every snapshot row, so an audit can trace a piece of data back
to the permission it was ingested under.

---

## What is true today

- The pipeline is complete and runs end-to-end **on synthetic fixtures only**
  (`scripts/fixtures/trends/`, every row invented by this repo).
- `--file` — the path that opens the owner's real export — refuses before
  `stat()`, let alone before reading a header.
- No Google Places call has been made on behalf of this feature. The discovery
  queue produces `proposed` rows only; approval and draining are separate acts.
- No public surface reads any of it. The ordering term returns zero outside
  shadow mode.
- The migration `supabase/migrations/20260809_wf_trend_intel.sql` has **not** been
  applied.
