# WAYFIND OS-4 — BRAND SYSTEM LAW (mental availability, distinctive assets, and the rules that bind every future surface)
_Source: the owner's branding transcript (2026-08-25) — attention→retention→mental availability, symbols, show-don't-tell, the top-7 set, superfans. This doc extracts the REAL science under it, maps it to Wayfind's existing surfaces (audited same day), and sets the binding rules. Enforced in CI by `scripts/check-brand-assets.mjs` (PR #934). Sibling to OS-0..3._

## The science, held to Wayfind's evidence standard (keep what's real, flag what's pop)
- **Attention → memory → mental availability: SOLID.** Matches the published attention-economy research line (Karen Nelson-Field et al.); "mental availability" is Ehrenberg-Bass (Byron Sharp, *How Brands Grow*; Jenni Romaniuk on distinctive assets). The operative law: brands are bought (and shared, and returned to) in proportion to how easily they come to mind in a buying situation.
- **Misattribution: SOLID and the sharpest edge for a small brand.** Well-liked but weakly-branded advertising gets credited to the category leader. For Wayfind this is existential: an unbranded beautiful share card is a TripAdvisor ad. → Rule L1.
- **Distinctive assets: SOLID (Romaniuk).** Non-logo sensory assets (color, shape, sound, character) recognized WITHOUT the name build availability. → Rules L2/L3.
- **Expectation shapes perception: SOLID.** (Plassmann 2008 — the same wine tastes better at a higher stated price, measured in the brain.) Presentation IS product. → Rule L5.
- **Confirmation bias / minds reject misfitting messages: SOLID.** You can't sell a belief people don't hold; you attach to one they do. → Rule L7.
- **Category entry points: SOLID and a PERFECT fit.** Romaniuk's CEPs — the situations from which a brand gets retrieved ("breakfast before work", "kids for two hours") — are literally Wayfind's INTENT system (OS-0 §2). → Rule L6.
- **Miller's 7±2: pop-simplified** (it's about working-memory chunks, not brand sets) — but the underlying truth (consideration sets are tiny; be in the top few of a NICHE) stands. → Rule L8.
- **Superfans/niche-first: right for our stage.** (Honest nuance: at scale, reach beats loyalty — but a pre-scale brand must first OWN a lagoon to afford reach.)
- **The transcript's own warning stands as our ethical boundary:** symbols are a weapon. Wayfind's standing laws cap it — trust > commercial value, no fabricated experiences, scores never for sale, disclosure always. Branding here means making REAL quality unforgettable, never manufacturing belief.

## The distinctive-asset REGISTER (law; changing any item = owner decision)
1. **The pin + lowercase wordmark** — outlined orange pin, dot, `wayfind` in lowercase. DRAWN (not an image) in the share renderer. GUARDED: exact SVG path + wordmark pinned.
2. **Brand orange `#F97316`** — one hue across app kit (`C.accent`) and share cards. GUARDED: both files pinned to the hex.
3. **The Wayfind Score pill** — the green pin-glyph score chip. This is our tomato: ONE component (`PlaceScoreChip`), every surface, never recomputed differently, never redesigned casually. GUARDED.
4. **The dark ground** — near-black UI with orange accent; share-card tone plates in card.jsx.
5. **The compass motif** — fallback art, loading states. Secondary asset; keep consistent.
6. **Archivo** (share-card face) — the typographic voice of shared surfaces.
Backlog candidates (build deliberately, don't improvise): a signature score-reveal micro-animation; a sonic mark is premature — park it.

## THE RULES (binding on every future surface; L1–L4 are CI-enforced today)
- **L1 · One-renderer law (misattribution defense).** Every share/OG surface renders through `shareCardResponse` (or its audited list-family delegate) carrying the drawn mark. No route builds its own ImageResponse. ENFORCED: `check-brand-assets.mjs`. One audited exception: the invite card leads with hearts, not the wordmark (a texted question, not an ad).
- **L2 · Asset-consistency law.** Register items change only by explicit owner decision, never as a side effect of a redesign. Repetition compounds; churn resets the meter to zero.
- **L3 · The score pill is the product's signature.** It appears wherever a place is judged — cards, sheets, share images, partner pages — always the same component, always earned (score law). Long-term goal: the green pill alone, seen anywhere, means "Wayfind checked."
- **L4 · Show, don't tell.** Surfaces lead with the experience (photo, score, distance, "open now"), copy stays benefit-only. Never explain the algorithm on a user surface. Marketing corollary (owner's lane): show the found-the-spot moment, not the app UI.
- **L5 · Presentation is product.** Premium framing raises perceived quality of the SAME data (Plassmann): photos > fallback art > empty; polish on cards is not vanity, it is measurable perceived-quality. ⟳ **2026-08-25 proves the inverse at full strength: when the card gate silently dropped every place card, the product still "worked" by every API measure and was worthless on screen. Empty-card incidents are revenue incidents, not cosmetic ones.**
- **L6 · Intents are category entry points.** New discovery surfaces are named and framed by MOMENT ("Date night tonight", "Kids · next 2 hours", "Before work") over category nouns wherever a moment exists. The intent registry (OS-2 B7) is therefore BRAND infrastructure, not just ranking infrastructure.
- **L7 · Meet existing beliefs.** Copy attaches to what people already believe ("I don't want a tourist trap", "I want what locals know") — never educates first. No jargon, no "our algorithm".
- **L8 · Lagoon before ocean.** Brand investment concentrates where density already wins (Sarasota-Bradenton-Parrish home market) until top-of-mind there is plausible; city expansion follows the launch playbook, not vibes.
- **L9 · Ethics cap.** No manufactured social proof, no dark-pattern urgency, no symbol pointed at a claim the data doesn't back. The moat is trust; branding amplifies it, never substitutes for it.

## Audit findings (2026-08-25, verified by read against origin/main)
- ✅ One branded renderer EXISTS and all 7 OG routes use it — the architecture predated the law; the law now makes it permanent (PR #934).
- ✅ One orange, drawn mark, single score component — all true and now pinned.
- 🔎 Opportunities queued (OS-2): (a) confirm the score pill renders on place-share cards; (b) app icon/favicon/PWA set consistency sweep vs the register; (c) score-reveal micro-animation as a deliberate distinctive asset; (d) marketing asset kit for the owner so his campaigns compound the same symbols.

## For the owner's marketing (your lane, per your split)
The register above is your ammunition: same pin, same orange, same pill, same dark ground, in every post, every time — repetition is the whole game. Show the moment (found-the-spot), never the feature list. Fish the lagoon: Sarasota-Bradenton content until Wayfind is a reflex there. And every asset you publish should be visually attributable to Wayfind at a glance — because the science says an unbranded banger is a donation to the category leader.
