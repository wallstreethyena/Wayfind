# WAYFIND OS-3 — THE FIVE-PILLARS PLAYBOOK (operational, evidence-wired)
_Source: the owner's five-pillars transcript, delivered 2026-08-25 with the order: "extract every single thing we can leverage… AI runs the show… decisions on facts, analytics and data… anybody can pick up the documents and take the business further… identify what's working, highlight it, replicate it." Sibling to OS-0 (charter), OS-1 (state), OS-2 (backlog), OS-4 (brand). This doc is the TRANSLATION of the framework into Wayfind-specific machinery — each principle carries its status and its evidence. Maintained like OS-1._

## The one-line thesis
**Quem constrói acumula. Quem aluga depende.** (Who builds, accumulates; who rents, depends.) Wayfind's entire August crisis was a renting problem — $1,878 renting Google's prose, photos and rankings. The recovery was a building solution — owned inventory, owned editorial, owned images, owned budgets. Every future decision passes through this test.

---

## PILLAR 1 — MENTALIDADE DE CONSTRUTOR (build, don't rent)
**Principle:** Every rented dependency is a competitor's opening. The practical question: *"Which process that you outsource today would become a permanent asset if you built it?"*

**Wayfind status — largely LIVED, same day the transcript arrived:**
- ✅ BUILT: owned place inventory replacing per-render Google rentals · owned editorial program replacing rented prose · free-image ladder (owned + licensed stock) replacing rented photos · spend ledger replacing blind billing · the CI guard suite replacing "consultoria" memory · creator graph (attributed, corroborated) · Wayfind Score (proprietary ranking). Current sizes: OS-1 LIVE STATE.
- ⚠️ STILL RENTED (deliberately, cheap, non-strategic): Vercel hosting, Supabase, Pexels library, affiliate networks' checkout. Correct — don't rebuild commodity.
- 🔴 **THE ANSWER TO THE PILLAR-1 QUESTION (chosen):** *sponsor onboarding.* Today each sponsor is a code-constant + PR + guard cycle — engineering labor rented against every sale. Building it (OS-2 B1–B4) turns sales capacity into a permanent asset. Single highest-leverage build next.

## PILLAR 2 — CAPITAL INTELECTUAL (knowledge as an asset, never relearn)
**Principle:** Tacit knowledge walks out the door. Bus factor of 1–2 = fragile. Document how people DECIDE, not what they do. Dead folders are "knowledge cemeteries" — build LIVING systems consulted daily.

**Wayfind status — strongest pillar, with one hole found 8/25:**
- ✅ The living system EXISTS: 310+ project docs (laws, registries, autopsies), the OS docs (0/1/2/3/4 + START-HERE), and an executable guard suite that is decisions-as-code: every hard-won lesson FAILS THE BUILD if violated. Knowledge that cannot rot in a folder.
- 🔴 **Bus factor = 1, and it's the owner.** Merges, payments, renewals, partner calls bottleneck on Gabe. Mitigations: auto-merge on green CI, robots for renewals, the weekly loop for analysis.
- 🔴 **THE HOLE (found 2026-08-25):** the knowledge existed only in the Claude project — **not on disk where the agent standup reads.** An agent described `wayfind-OS-START-HERE.md` as created; it never existed. A living system that one class of operator cannot read is, for them, a cemetery. **Fix applied: all six OS docs written to `~/Projects/`. New law — a doc is not created until it is verified on disk (`ls`), and "an agent said so" is not verification.**
- **Standing law: no meaningful lesson stays in a chat.** Every session ends by updating OS-1/OS-2 and the relevant registry.

## PILLAR 3 — DECISÃO POR DADOS, NÃO POR FEELING
**Principle:** In structured decisions, simple algorithms beat experienced experts (Kahneman). Automating an inefficient process multiplies inefficiency. Beware gross-revenue dashboards — margin and retention tell the truth.

**Wayfind's five most expensive recurring decisions, each now data-bound:**
1. **Paid traffic spend** → VERDICT: PAUSED. 254 paid sessions → 4 detail opens; paid converts worse than every free channel. Feeling said "buy growth"; data said "you're buying the worst traffic you have."
2. **Google API spend** → wf_spend_ledger + quota caps + SKU-pinned guards. Was feeling ("cache handles it"), now hard math (free-tier lines, fail-closed).
3. **Sponsor pricing** → currently feeling. Datum to create: Rio's invoice as anchor + tier-sheet test on next 5 pitches (OS-2 E1). Until then, no price changes.
4. **What content/places to promote** → Wayfind Score + popularity signals + (pending) per-guide commerce data. The vanity-metric trap lives here: "sessions up 393%" masked detail-opens FALLING.
5. **Which partners/renewals to chase** → registries + expiry robots + utm-tracked outcomes.
- **The Pareto instrument:** one guide (`things-to-do-orlando-not-theme-parks`) produced 3 of 7 commerce clicks in 30 days.
- **The humility rule:** when a number contradicts the feeling, the number wins. ⟳ Recorded precedent, 2026-08-25: the owner said the site "used to work"; the API measured healthy while the browser measured empty — **both were true**, and only measuring BOTH ends found it. Measure the tier you are actually being told about.

## PILLAR 4 — ALFABETIZAÇÃO EM IA (AI as infrastructure, not a chat window)
**Principle:** Tool-use is typing prompts; infrastructure is AI embedded in the operation, analyzing its own data, acting without a human typing.

**Wayfind status — genuinely ahead of the curve; the moat story:**
- ✅ RUNNING: scout (discovery + adjudication) · promote pipeline · atlas (content — needs credits) · expiry/verification robots · corroboration scoring · the guards (algorithmic judgment enforcing every law) · the free-tier ledger (algorithm deciding spend) · this OS (AI operator maintaining institutional memory).
- The clinic example — "the system analyzes history before the visit, suggests based on patterns no human could see" — is EXACTLY the Wayfind product thesis (OS-0 §27).
- 🔴 Gaps: anomaly-watch on analytics (the ledger/funnel should page the operator, not wait to be read) · sponsor-qualification agent · intent agent v1.
- 🔴 ⟳ **Agent honesty gap (8/25):** agents reported work as done that was never done. Any agent claim of a created artifact must carry its verification (path + `ls`/count/commit). Assertion is not evidence.

## PILLAR 5 — ALAVANCAGEM TECNOLÓGICA (execution: build the systems)
**Principle:** List the five processes that eat the most time; ask if AI can do 90% of the repetitive part; build ONE first — highest cost, lowest variation.

**Wayfind's five most time-consuming processes → their AI layer:**
1. **Analytics reading & decision prep** → ✅ AUTOMATED: the Weekly Executive Loop (Mon 13:00Z) reads PostHog + ledger + registries, updates OS-1, issues verdicts.
2. **Sponsor onboarding** → 🔴 the chosen Pillar-1 build (B1–B4). Highest cost, lowest variation. NEXT BUILD.
3. **Deals verification/renewal** → ✅ mostly automated; residual browser-only checks stay human by necessity.
4. **Editorial/content production** → ✅ automated (atlas + in-session batches); blocked only on ~$5 credits.
5. **Partner/business outreach prep** → 🔴 business-graph qualification from owned data (B9).

---

## WHAT'S WORKING — highlight and replicate (the owner's explicit order)
1. **The Orlando anti-theme-park guide** (3 of 7 commerce clicks/30d). → REPLICATE: same contrarian local format for Tampa, St. Pete, Sarasota, Miami. KPI: commerce clicks per guide.
2. **The homepage** (29% bounce vs 55% site avg). → Protect it; every new module must beat, not dilute.
3. **The Rio pattern** (card + permanent page + honest score + utm-split reporting — it SOLD). → REPLICATE as product: tiers + table + /advertise. KPI: sponsor #2 signed.
4. **Viator affiliate rail** (live, earning, renders even when place cards broke — visible in every outage screenshot). → REPLICATE: wire scout's bookable inventory (B5).
5. **Guards + auto-merge on green** (6 PRs in one day with zero regressions surviving CI). → Keep as the delivery standard; every incident becomes a guard the same day. ⟳ 8/25: the card-gate guard went 25 → 51 assertions across four fixes.
6. **Non-bounce engagement** (median 39.5s, mean 203s). → The retention problem is ACQUISITION-INTO-HABIT, not product quality; B10 attacks exactly this.

## STOP DOING
1. ~~Paying Google for prose/photos/rankings we can own~~ — STOPPED (gate live).
2. **Paid ads at the current funnel** — stay PAUSED until attribution (C3) + return hooks (B10) land.
3. **Bespoke engineering per sponsor** — stops at sponsor #2 (B1).
4. **Reading dashboards manually** — the weekly loop reads them now.
5. **Letting lessons live only in chat** — OS protocol.
6. ⟳ **Trusting "it's done" without a path and a count.** Verify on disk / in prod / in the ledger. NEW 8/25.
7. ⟳ **Typing a live number into a doc.** It rots the moment it is written. Generate it (`scripts/os-state.mjs`) or point at the block. NEW 8/25.

## THE AUTONOMOUS DECISION LOOP (installed 2026-08-25)
Scheduled task **"Wayfind OS Weekly Executive Loop"** — Mondays 13:00 UTC. Fresh cloud session, standing orders: read OS docs → pull PostHog funnel + wf_spend_ledger + Vercel/Sentry basics + registries → verdict each open decision (STRONG / TEST FIRST / LOW PRIORITY / DON'T) with the datum cited → update OS-1 + OS-2 + WHAT'S WORKING → surface the top 3 actions (and the ONE thing to stop). Zero-spend rules inherited; it never opens the gate, never pays, never sends outward communications.

## The compounding test (applied henceforth)
Before any initiative: *if Wayfind does this 1,000×, does it get smarter/stronger/more defensible?* Recent grades: owned editorial ×10,000 → YES. Sponsor-as-PR ×1,000 → NO (linear labor) → hence B1. Guide format ×50 markets → YES. Manual analytics ×52 weeks → NO → hence the loop.
