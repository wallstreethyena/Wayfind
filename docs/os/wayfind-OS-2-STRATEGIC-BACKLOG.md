# WAYFIND STRATEGIC BACKLOG — never lose a good idea
_Seeded 2026-08-25. **Protocol: append, reclassify, never delete — an idea leaves only by becoming ACTIVE→DONE or OBSOLETE (with the reason).** Classes per master prompt §14: ACTIVE · BACKLOG · EXPERIMENTAL · HIGH-LEVERAGE · CRITICAL · DUPLICATE · OBSOLETE. Score = (Impact × P(success) × Moat × LearningSpeed) ÷ Cost. Full-corpus sweep pending (M1)._

## CRITICAL (threatens trust/revenue/survival)
- C1 · Declined Visa •7014 + unpaid $1,878 → API suspension risk. Owner. OPEN.
- C2 · Google billing adjustment (case 74703052) — reply drafted 8/25 (hardship + hold + payment plan). Owner sends. OPEN.
- C3 · Attribution split-brain: 43 affiliate 302s vs 7 tracked clicks; gclid-null-UTM sessions. Until fixed, no revenue decision is trustworthy. OPEN.
- C4 · Anthropic credits exhausted → atlas dark since 8/14 (591 errors). Owner ~$5–10. OPEN.
- C5 · Travelpayouts payout method unset — gates all Tiqets commissions. Owner. OPEN.
- C6 · **No branch protection: a red `prebuild` blocks every deploy, and nothing stops a red merge.** 2026-08-25: main went red on #843 while a live outage fix waited; reverted by #939. Add required-green-CI to merge. NEW 8/25.

## ACTIVE (in flight as of 8/25)
- A1 · FREE MODE spend architecture — SHIPPED 8/25 (#925/#926/#927). Watch: wf_spend_ledger telemetry; photo budget resets Sep 1 (currently 950/950).
- A2 · Rio Body Wax placement — LIVE 8/25 (#920). Next: owner tells Rio; first monthly report; agree endsOn term.
- A3 · Owned-editorial backfill — coverage tracked in the OS-1 LIVE STATE block; remainder via atlas post-credits.
- A4 · Deals keep-alive discipline — Clipp constants live to 8/31; weekly audit robots.
- A5 · **v8.48/v8.49 card-render recovery — SHIPPED 8/25 (#932, #936, #937, #940).** One shared `hasScoreSignal` predicate across server, browse pool and client cache. Watch: the `wfq_v2` client cache TTL is 8 days; any change to cached row SHAPE must bump the key. NEW 8/25.

## HIGH-LEVERAGE
- B1 · **Sponsors as data, not code**: move SPONSORED_PLACES to a Supabase table → sponsor onboarding = a row, minutes not a PR. Score: very high.
- B2 · **/advertise page**: 3 posted tiers (anchor to Rio's real price), live example, form + Stripe payment links, footer link. Sell the PAGE first; card is the upsell.
- B3 · **Automated monthly sponsor report** (impressions/clicks/utm split card-vs-page, email) — the renewal engine.
- B4 · **Tier ladder decision** before sponsor #2 (626px card can't stack ×3).
- B5 · **Affiliate-match sweep**: wire scout's jet-ski/kayak/boat/comedy inventory to Viator/GYG; then pitch those operators the Featured tier.
- B6 · **Warm sponsor pipeline**: businesses already listed free (Gecko's, Pie On Main, Agave, 48 Clipp merchants, creator-featured venues) — "you're already on Wayfind; here's your page."
- B7 · **Intent registry**: formalize qualified intents as data with per-intent performance — OS-0 §2; also BRAND infrastructure (OS-4 L6).
- B8 · **Creator graph expansion**: repeatable creator batch pipeline; creator client bundles as a paid product.
- B9 · **Business graph** (OS-0 §18): derive sponsor-qualification list from inventory × deals × creator mentions × engagement. Feeds B6.
- B10 · **Return hooks**: weekly "what's worth it near you" digest to wf_email_signups — cheapest retention lever available.

## BACKLOG (good, not now)
- D1 · Photo independence: creator media + wf_media_public as first-class card art to shrink Google photo dependency past the 950/mo line.
- D2 · Perf audit remainder: blurbs batching, client Supabase reads behind one server route, backdrop-filter cuts.
- D3 · Score-law lateness component for nightlife ranking.
- D4 · Reverse-geocode map recenter to real city names (metered — needs spend decision).
- D5 · City launch playbook: score demand from wf_city_requests / wf_waitlist_demand / wf_expansion_demand.
- D6 · Atlas upgrade: lift from open-only to ledger-budgeted so editorial runs inside free mode.
- D7 · Sentry/PostHog perf flags (bundle 495KB, session recording tax).
- D8 · App Store packaging (status unknown — needs corpus sweep).
- D9 · `coffee_stand` missing from `SUB_ALLOW["food:cafes"]` — a genuine café ("the jo coffee co.") is rejected by the contract. One token. NEW 8/25.
- D10 · `MEAL_GATE_RE` has a `coffee` key but the sub id is `cafes` — that branch is dead code and Cafés gets no meal gate. Harmless today, misleading. NEW 8/25.
- D11 · DaypartRail tile skeletons persist in the closed rail strip on a cold home load. NEW 8/25.

## EXPERIMENTAL (test first)
- E1 · Tier pricing points — anchor on Rio invoice, test on next 5 pitches.
- E2 · Editorial CTR lift (owned text vs none) — PostHog card-level.
- E3 · Fallback-art vs real photo CTR (natural experiment while photo budget = 0 until Sep 1).
- E4 · Free-mode search budget sufficiency — does the monthly text_pro line bind? Watch the ledger in LIVE STATE.
- E5 · Google service attributes for quick-bite classifier — EXPLICITLY OWNER-GATED SPEND.

## OBSOLETE (kept so nobody re-litigates)
- O1 · "Keep Google's editorialSummary text permanently" — REJECTED 8/25: ToS violation, account + refund risk. Superseded by owned-editorial (A3).
- O2 · Paid acquisition at current funnel — PAUSED per leverage audit 8/05; revisit only after C3 + B10.
- O3 · Generic travel coupon codes — banned by owner directive 7/29, guard-enforced.

## META
- M1 · **Full-corpus ingestion pass** (305 project docs → knowledge map; dedupe/contradiction/stale sweep). PENDING — dedicated session.
- M2 · OS maintenance protocol: every session ends by updating OS-1 changed sections + appending here. The CI guard suite is its code-level twin.
- M3 · **The OS docs must exist ON DISK in `~/Projects/`, not only in the Claude project.** 2026-08-25: an agent described `wayfind-OS-START-HERE.md` as created; it had never been written, and the whole ops standup blocked on a file that did not exist. All six now written to disk. Verify with `ls ~/Projects/wayfind-OS-*` before claiming any of them exists. NEW 8/25.
