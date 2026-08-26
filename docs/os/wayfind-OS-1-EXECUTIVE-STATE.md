# WAYFIND EXECUTIVE STATE — living doc
_Seeded 2026-08-25 from evidence in-session. **Numbers re-verified against live Supabase/Vercel/git 2026-08-25 evening — corrections marked ⟳.** Protocol: every session doing Wayfind work reads this + `wayfind-OS-0-MASTER-PROMPT.md` + `wayfind-OS-2-STRATEGIC-BACKLOG.md`, and updates this doc's changed sections before ending. Date every claim. KNOW = measured; THINK = inferred; TEST = needs an experiment._ Full 305-doc ingestion is PENDING (OS-2 M1).

## LIVE STATE — generated, never typed
_Written by `scripts/os-state.mjs` from live sources. Do not hand-edit._

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

## 1 · Where Wayfind is now (2026-08-25, evening)
KNOW: Live at gowayfind.com under FREE MODE (`WAYFIND_GATE=free`). Inventory size, owned-editorial coverage, CI guard count and the Google free-tier ledger are in the generated LIVE STATE block below — they are read from source on every regeneration, because every one of them had drifted when stated as prose (2026-08-25: doc said 12,664 / 240 / 407; reality was materially different). One PAYING sponsor live (Rio Body Wax). Affiliates wired (Viator live; Clipp via CJ live to 8/31; CityPASS live; Tiqets blocked on Travelpayouts payout). ~30–60 real sessions/day; 92.2% never return; 7 real commerce clicks/30d (leverage audit 8/05). Google cost crisis resolved same-day: $1,878 Aug bill root-caused (editorialSummary SKU + duplicate radii + scheduled re-buys), spend now hard-capped via free-tier ledger. Cash-constrained: adjustment request open with Google (case 74703052); Visa •7014 declined.

**Spend ledger:** see LIVE STATE below. Free mode is holding; photos is the only SKU that reaches its line (it resets on the 1st).

**REPORTED BY THE OPS STANDUP 2026-08-25, NOT INDEPENDENTLY VERIFIED — confirm before depending on it:** verified net **$0** (no payout record) · next gate = one approved Viator commission · **HOLD-SKU 236862P2** · Ads unpublished · Crystal River = search handoff only.

### ⟳ Incident of record — 2026-08-25 evening (v8.48/v8.49)
Free mode's lean Text Search mask omitted `rating`/`userRatingCount`; the v6.40 card law refuses a card with no rating signal, so **every place card on the site vanished** while the feed still counted them ("That's all 21 spots" over nothing). Four tiers had to be fixed, each hiding the next: **#932** (one shared predicate `hasScoreSignal`; server stops serving unrenderable rows; the browse count is gated on the same rule) · **#936** (the SERVER `v1p` cache replayed poisoned rows past that filter) · **#940** (the CLIENT localStorage cache, 8-day TTL, did the same — 875KB of poisoned entries measured on the owner's own browser; **no server fix could reach it**) · **#937** (Cafés: the inventory fallback ranked the whole category before the chip filtered, so zero of the top 50 were cafés). Verified after deploy: all 43 category/sub-chip combinations return full renderable data; Cafés 9 cards, Clubs 12, Outdoors 10. Postmortem: `wayfind-v8.48-ROOT-CAUSE-free-mode-blanked-every-place-card-2026-08-25`.

## 2 · Biggest opportunities (ranked)
1. **Sponsor #2–10 via productized tiers** — the Rio pattern works; friction (code-constant onboarding, no posted price, no self-serve) is the blocker, not demand. Backlog B1–B4.
2. **Affiliate-matched inventory** — scout surfaced jet-ski/kayak/boat-tour/comedy inventory (v8.32); exactly Viator/GYG-payable categories, links not yet wired.
3. **Retention/funnel before any paid traffic** — paid converts worst of all channels (2.61%/1.08% detail rates); pausing paid ≈ funds everything.
4. **Creator graph as moat** — 3 creators, 120+ attributed place cards, corroboration scoring live (v8.44–8.45). Compounds; nobody else has it locally.
5. **Owned editorial corpus** — coverage in LIVE STATE; the remainder generates at ~$0 via atlas; kills the Google rented-prose dependency forever.

## 3 · Biggest weaknesses / risks
1. Payment declined + unpaid $1.9k Google bill → API suspension risk (mitigated: site serves from owned data; photos/new discovery degrade).
2. Retention: product works for engaged users (median 39.5s non-bounce) but 92% one-and-done. North-star problem.
3. Attribution broken: gclid sessions with null UTMs; 43 affiliate redirects vs 7 tracked clicks.
4. Single human bottleneck: every renewal bump, merge, payout setup gated on Gabe.
5. Anthropic credits exhausted since 8/14 → atlas editorial/hook generation dark.
6. ⟳ **A red `prebuild` blocks every deploy, including outage fixes.** Main was red ~10 min today on an unrelated merge (#843, reverted by #939) while a live outage fix was waiting. No branch protection enforces green-before-merge.
7. ⟳ **Caches are deployment surfaces.** A client-side localStorage cache with an 8-day TTL can hold a fix hostage for eight days. Any change to the SHAPE of cached data must bump its key.

## 4 · What Wayfind KNOWS (strongest intellectual capital)
- 305+ project docs of laws, registries, audits, post-mortems (IDENTITY LAW, EARN LAW, NO-MONEY-ON-THE-FLOOR, pairing law, score law, sponsors/deals registries).
- The CI guard suite (count in LIVE STATE) encoding hard-won lessons — the "never relearn" mechanism for code.
- Owned place inventory (⟳12.7k), creator graph (attributed, corroborated), popularity pipeline, trend system, Wayfind Score.
- Cost physics of Google Places (SKU tiers, free lines) — encoded in check-spend-guard + FREE MODE ledger.
- What sells: a paid card + permanent partner page with honest scoring (Rio); what doesn't: generic travel coupons (purged 7/29).

## 5 · What Wayfind DOESN'T know (top open questions)
1. Why 92% never return. 2. True affiliate click volume (bot vs human on /go/ redirects). 3. Which acquisition channel could convert profitably. 4. What Rio actually paid → anchor for tier pricing. 5. Whether partner pages rank (GSC never checked). 6. Real demand outside FL (city_requests/waitlist unmined). 7. Whether inventory depth is enough for "works anywhere" under free mode. 8. Google adjustment outcome. 9. Whether creators will sell (eatsbylaurr bundle result unrecorded). 10. App Store plan status.

## 6 · Current user behavior (PostHog 507756; leverage audit 8/05; refresh monthly)
687 sessions/30d clean; 61% reach results; 10% open a detail; 0.87% commerce CTA. Mobile 80%, US 84%. Best real content: /guides/things-to-do-orlando-not-theme-parks (3 of 7 commerce clicks). Owner's own browsing pollutes dashboards — always exclude.

## 7 · Product priorities
P1 retention loop (saves→return hooks, email capture live). P2 serve-anywhere quality under free mode (inventory depth + fallback photo quality). P3 finish reader-first serving everywhere. P4 intent system (OS-0 §2).

## 8 · Growth priorities
G1 SEO on owned pages (914 prerendered) — verify GSC, fix attribution, then scale content via atlas. G2 creator-distribution. G3 paid stays PAUSED until funnel fixed.

## 9 · Revenue priorities
R1 sponsor tiers (B1–B4). R2 Travelpayouts payout unblock. R3 wire scout's bookable inventory to Viator/GYG. R4 renewal engine (automated monthly sponsor report). R5 Clipp/CityPASS keep-alive discipline.

## 10 · AI infrastructure priorities
EXIST: Discovery (scout), Place Intelligence (promote/details), Verification (deals robots, hero-watch, job-pulse), Trend, Creator Intelligence, Ranking, SEO content (atlas — needs credits), Analytics (manual). TO BUILD: (1) Knowledge Agent = the OS protocol itself, (2) Sponsorship Agent, (3) Revenue Agent (affiliate-match sweep), (4) Analytics anomaly watch, (5) Intent Agent v1.

## 11 · Experiments
E1 /advertise + posted tiers → inbound (KPI: 1 qualified lead/mo). E2 owned-editorial vs none CTR. E3 return-hook email to signups. E4 free-mode budget telemetry. E5 fallback-art vs real-photo CTR (Sep, when photo budget resets).

## 12 · Immediate actions
Owner: Visa fix · Rana reply · Anthropic top-up · Travelpayouts payout · tell Rio the link is live. System: maintain this doc; run backlog by score; ⟳ add branch protection (green CI required to merge); complete corpus ingestion (OS-2 M1).

## Roadmaps
**NOW (7d):** stabilize billing case; Rio live-report #1; sponsor tier sheet decided; editorial batches continue; ledger telemetry watch; ⟳ branch protection.
**NEXT (30d):** sponsors→Supabase table + /advertise + Stripe links; affiliate wiring for bookable categories; attribution fix; GSC verified; atlas resumed → 10k editorials.
**SCALE (90–365d):** intent registry + per-intent ranking; personalization v1; city launch playbook; business graph → outbound sponsor engine; App Store.
