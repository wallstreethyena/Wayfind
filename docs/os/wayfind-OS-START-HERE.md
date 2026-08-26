# WAYFIND OS — START HERE (the pick-up-and-run map)
_If you are a new operator — human or AI — this one page hands you the entire company._
_Written 2026-08-25. **Numbers re-verified against live Supabase/Vercel/git on 2026-08-25 evening.** Keep it current: it is the front door._

> **PROVENANCE, so nobody has to trust a claim again.** This file was DESCRIBED by an
> agent earlier today but never written to disk — the standup was blocked on a file that
> did not exist. The content below is the real OS doc set (authored 2026-08-25, held in
> the Claude project), now written to disk verbatim with a live-verification pass on every
> number. Where a fact is reported but NOT independently verified, it says so inline.
> Companion files now beside this one: `wayfind-OS-0-MASTER-PROMPT.md`,
> `wayfind-OS-1-EXECUTIVE-STATE.md`, `wayfind-OS-2-STRATEGIC-BACKLOG.md`,
> `wayfind-OS-3-FIVE-PILLARS-PLAYBOOK.md`, `wayfind-OS-4-BRAND-SYSTEM-LAW.md`.

## What Wayfind is
A real-world decision engine: gowayfind.com tells a person what's actually worth doing, here, now. The moat is owned local intelligence: a large owned place inventory with proprietary scores (exact counts in LIVE STATE below), a creator graph with attribution, owned editorial, and behavioral data — NOT the biggest database (that's Google's game; we don't play it). North star: **successful discovery rate** (sessions where someone actually decided — directions/save/share/booking/return).

## Read in this order
1. `wayfind-OS-0-MASTER-PROMPT.md` — the charter (owner's verbatim five-pillar operating philosophy; non-negotiables like TRUST > commercial value).
2. `wayfind-OS-1-EXECUTIVE-STATE.md` — where the company is (update before you finish any session).
3. `wayfind-OS-2-STRATEGIC-BACKLOG.md` — every idea, classified; nothing gets lost (append, never delete).
4. `wayfind-OS-3-FIVE-PILLARS-PLAYBOOK.md` — the operating doctrine wired to evidence; WHAT'S WORKING + STOP lists.
5. `wayfind-OS-4-BRAND-SYSTEM-LAW.md` — distinctive assets + the L1–L9 rules binding every surface.
6. Registries (sources of truth, in the Claude project): `wayfind-sponsors-registry` (paid placements) · `wayfind-deals-registry` (coupons/affiliates) · `wayfind-partner-CGNA-grove33` (partnerships).
7. Recent operations: `wayfind-BILL-AUTOPSY-1878` and `wayfind-FREE-MODE-and-owned-editorial` (the cost architecture — why the site runs at $0 Google spend).

## LIVE STATE — generated, never typed
_This block is written by `scripts/os-state.mjs` straight from Supabase, `guards.txt` and git. Do not hand-edit it; `check-os-state.mjs` fails the build if it is missing, malformed, or if any of these metrics is restated as prose elsewhere. Regenerate: `node scripts/os-state.mjs --write --mirror`._

<!-- WF-LIVE-STATE:BEGIN generated=2026-08-26T03:33:07Z by=scripts/os-state.mjs -->

<!-- DO NOT HAND-EDIT. Regenerate: `node scripts/os-state.mjs --write --mirror` -->

| fact | value | source |
|---|---|---|
| CI guards | **420** | `scripts/guards.txt`, counted as run-guards counts |
| package version | **6.56.0** | `package.json` |
| repo HEAD | **`ebac112` on `fix/os-state-generated`** | git |
| Owned inventory | **12,717 rows · 12,673 OPERATIONAL** | `wf_inventory` live count |
| Owned editorial | **2,469 rows carry `editorial` (19.4%)** | `wf_inventory` live count |
| Google free tier · details_enterprise | **394/950 (41%)** | `wf_spend_ledger` 2026-08 |
| Google free tier · details_pro | **16/4,800 (0%)** | `wf_spend_ledger` 2026-08 |
| Google free tier · diag_test | **1/10 (10%)** | `wf_spend_ledger` 2026-08 |
| Google free tier · nearby_pro | **79/4,800 (2%)** | `wf_spend_ledger` 2026-08 |
| Google free tier · photos | **950/950 (100%)** | `wf_spend_ledger` 2026-08 — EXHAUSTED |
| Google free tier · text_pro | **603/4,800 (13%)** | `wf_spend_ledger` 2026-08 |

_Read from live sources at 2026-08-26T03:33:07Z. Any live number outside this block is unverified prose._

<!-- WF-LIVE-STATE:END -->

**Reported by the ops standup 2026-08-25, NOT independently verified here — treat as claims to confirm, not facts to build on:** verified net **$0** revenue (no payout record) · next gate is **one approved Viator commission** · **HOLD-SKU 236862P2** · **Ads unpublished** · **Crystal River = search handoff only**. Confirm each against its source before any plan depends on it.

## Today's incident (2026-08-25) — read before touching serving code
Free mode's lean Text Search field mask omitted `rating`/`userRatingCount` (Enterprise-billed). The v6.40 card law refuses a card with no rating signal, so **every place card on the site vanished** while the feed still counted them. Fixed across four tiers — PRs **#932** (one shared predicate, server + count), **#936** (server cache replayed poisoned rows), **#940** (the CLIENT localStorage cache did the same, 8-day TTL — no server fix could reach it), **#937** (Cafés: inventory fallback ranked before the chip filtered). Full postmortem: `wayfind-v8.48-ROOT-CAUSE-free-mode-blanked-every-place-card-2026-08-25` in the project.
**The lesson, now law:** a cost optimisation that changes a FIELD MASK is a product change; a count and its list must come from one array; bad data outlives the fix in every cache it touched.

## The infrastructure (what runs where)
- **Code:** github.com/wallstreethyena/Wayfind (private). `main` auto-deploys to production via Vercel (team `wayfind2`, project `wayfind` = `prj_Mwt0CfPmiqW7gBedVlvznVpgW8sp`). NEVER commit to main directly: branch → PR → **the full CI guard suite must pass** (count in LIVE STATE) → squash-merge. Guards are the company's memory-as-code: read `scripts/guards.txt`; every incident becomes a guard. **A red `prebuild` blocks EVERY deploy, including an outage fix** — main was red for ~10 min today on an unrelated merge (#843, reverted by #939).
- **Data:** Supabase project `gbhtoehdxkzjsmmkisgu`. Key tables: `wf_inventory` (the owned library — places, signals, editorial; PERMANENT), `wf_places_cache` (30-day ToS cache; disposable), `wf_spend_ledger` (monthly free-tier budgets — the spend law), `wf_job_pulse` (cron heartbeats), `wf_events`, `offers`, `wf_email_signups`, creator/trend/deal tables.
- **Spend law:** `WAYFIND_GATE` env in Vercel = `free` (current): every metered Google call needs an atomic `wf_spend_take` grant inside Google's monthly free tiers; fail-closed. `shut` = zero calls. unset = open (owner decision only). Console backstops: daily quota caps + $150 budget (billing acct 01CCB8-68C44D-DED054). Guard `check-spend-guard.mjs` pins all of it. **August 2026 lesson: one field (`editorialSummary`) cost $1,198. Field masks are law.**
- **Client cache (new, 2026-08-25):** `lib/google.js` caches search results in the reader's **localStorage** under `wfq_v2` with an **8-day TTL**. It is a deployment surface: if the SHAPE of what it holds changes, bump the key or readers are stuck for eight days. It now sanitises on read and write through `lib/score.js hasScoreSignal`.
- **Analytics:** PostHog project 507756 (exclude the owner's own traffic!), Vercel logs/analytics, `wf_spend_ledger`, Google Search Console (owner has access; under-used).
- **Automation:** Vercel crons (scout :12, promote-index, atlas — atlas needs Anthropic credits) + cloud scheduled tasks: Weekly Deals Audit (Mon 11:30Z), expiry robots, **Wayfind OS Weekly Executive Loop (Mon 13:00Z — updates OS-1/OS-2 from live data and issues verdicts)**, monthly Rio flight review.
- **Money in:** Rio Body Wax (paid sponsor, LIVE, `/partners/rio-body-wax-gastonia`) · affiliates: Viator, Clipp via CJ, CityPASS via CJ, Tiqets (blocked on Travelpayouts payout) · CGNA/Grove 33 tracked referrals (`partner_program_out`). Next revenue build: sponsor tiers + `/advertise` (OS-2 B1–B4).
- **Money out:** target $0/mo Google (ledger-enforced) · Vercel Pro · Supabase · ~$5–10/mo Anthropic once topped up. Open dispute: ~$1,878 Aug Google bill, adjustment case 74703052.

## The laws that bind every change (violate = build fails or trust dies)
Score law (never fabricate/hide-behind-paid scores) · disclosure on everything paid ("pays to be featured") · creator rights (no "<brand> partner" phrasing, consent on record) · facts re-verified at entry, no invented claims · dated content needs expiry + robot · field masks lean · every metered call gated · main is never pushed to directly · monetization never corrupts recommendation trust · brand register L1–L9 (OS-4).

## How to operate (the loop)
1. Read OS-1 + OS-2. 2. Pick by score (Impact × P(success) × Moat × LearningSpeed ÷ Cost). 3. Verify against reality (live data, never memory). 4. Build on a branch, guard the lesson, PR, green, merge. 5. **Verify in production, not in the diff** — today's #936 and #940 exist only because #932 was checked against live and found still broken. 6. Update OS-1/OS-2/registries. 7. Anything owner-only (money, outward sends, deletions) → list it clearly and stop there.

## Owner-only queue (nobody else can clear these)
Visa •7014 fix · reply to Rana (hardship + adjustment + hold) · Anthropic credits top-up (~$5–10, unblocks atlas editorial) · Travelpayouts payout method · tell Rio the link is live.
