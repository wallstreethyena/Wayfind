> **PROPOSAL — not yet the standard.**
>
> The owner asked for `docs/share-card-standard.md` to be rewritten to this
> merged standard (2026-08-01 rulings). A guard that landed on `main` while this
> branch was open — `check-doc-ownership` — makes that file **owner-only**, and a
> lane may not modify it. Rather than bypass the guard by changing commit
> identity, the rewrite is staged here.
>
> **Owner action:** copy this file over `docs/share-card-standard.md` and delete
> this proposal. Until then there are two documents, which is the one thing the
> merge instruction said to avoid — so this should be applied or rejected, not
> left sitting.
>
> `scripts/check-share-assets.mjs` currently asserts the merged rules against
> THIS path. When the canonical doc is updated, repoint those three assertions
> and drop the proposal.

# The Wayfind Share-Card Standard — v2 (merged)

Global marketing rule. Owner, 2026-07-22; merged with the v2 system and ruled on
2026-08-01. **This is the only share-card standard.** v1 is superseded in place —
do not add a third file.

Every share card this site emits is a marketing asset. A card earns the share:
the user has to WANT to send it. These rules are build-enforced by
`scripts/test-share-card-v2.mjs` and `scripts/check-share-assets.mjs`.

---

## What changed from v1, and why each was a defect

| v1 | v2 | why |
|---|---|---|
| hero art in a 1200×352 band | **full-bleed 1200×630 photo** | 3.4:1 decapitated every subject |
| logo redrawn in SVG | **composite `public/brand/wayfind-official-white.png`** | the drawn mark was wrong — the real one is a white lowercase wordmark with an orange dot on the "i" and an **outlined** orange pin with a ring, not a filled teardrop |
| translucent-white context pill | **dark pill, ink @66% + white @25% hairline** | the white pill disappeared over the fireworks; a card cannot assume the art behind it is dark |
| rank disc + green pill + orange pill in a row | **quiet rank, outlined score pill, deal as a rule** | chip soup; the rank disc shouted louder than the place |
| gradient into `#040810` | **`#05070E` scrim / `#070A12` panel** | cosmetic, v2 wins |

### The three rulings (2026-08-01)

- **Rule 3 — gold CTA: THE DOC WINS.** v2 dropped it; that was wrong. *"A share
  card with no CTA is a picture; with one it is an invitation."* Reinstated,
  bottom-right, `#E8C97A`, imperative, uppercase.
- **Rule 4 — brand row: v2 SUPERSEDES.** Logo top-left at (56,40), no baked
  `#040810` band. The band existed because v1 had no scrim; v2's scrim does that job.
- **Rule 5 — "nothing else": v2 SUPERSEDES.** The three pick cards and the footer
  deal count are the entire point: the recipient sees a real ranked list before
  deciding to tap. Rule 5 is what made the old card convert on a tagline.

---

## One route

`app/api/og/route.js`, `ImageResponse`, edge, 1200×630, opted in with `?v=2`.

**Pages supply DATA, never layout.** No page defines its own OG design. Adding a
new intent page must never require new OG design work — if it does, it was built
wrong. All geometry, colour and copy rules live in `lib/shareCardV2.js`; the
route contains only JSX that reads from it.

Inputs: `art`, `t` (headline), `sub`, `city`, `hour`/`wx`/`feels` (context pill),
`p1`..`p3` as `name|meta|score|deal`, `deals` (count), `cta`, `rv` (revalidate).

---

## Anatomy, top to bottom

1. **Photo** — cover-fit, full-bleed. Horizontal focus `0.5`.
   **Vertical focus is a REQUIRED per-image field with no default.** An
   unregistered image renders **photo-less**; it is never centred at 0.5.
   A hardcoded 0.5 is what produced the cut-off look. Registry:
   `VERTICAL_FOCUS` in `lib/shareCardV2.js`; every path is asserted to exist on disk.
2. **Global scrim** over `#05070E`, multi-stop:
   `0%→34% · 28%→24% · 52%→55% · 62%→90% · 100%→96%`.
   The dip at 28% keeps the photo alive; the 52–62% ramp is what makes text
   legible over *any* image. Painted **before** the panel.
3. **Glass panel**, y=384..630 — the photo region behind it, Gaussian blur
   radius 22, blended 80% toward `#070A12`, 1px white @18% hairline on top.
   **Blur-behind, not a flat rectangle.** That is where the premium read comes from.
4. **Logo** — composite `wayfind-official-white.png` at 34px tall, (56,40).
   **Never redraw the mark.** Both `width` and `height` are mandatory (see Traps).
5. **Context pill**, top-right — ink @66% fill, white @25% hairline, 18px Medium.
   Sourced from `nowContext`: `TODAY · ORLANDO · 100° · INDOORS`.
6. **Headline** 62px Bold at y=232, shrinking 2px at a time until it fits 1088px
   on one line; floor 40px, then ellipsis.
7. **Subline** 24px Regular `#CBD3E6` at y=318.
8. **Three pick cards** 352×150, gap 20, radius 22, white @6.6% fill, @15% border:
   - **rank** — quiet `01`/`02`/`03`, 15px Bold `#929DB6`, top-left. **No disc.**
   - **score** — right-aligned slim **outlined** pill, `#5EE8B4` text, 13% fill, 59% stroke.
   - **name** — 27px Bold white, the loudest element, ellipsis at `cardWidth-44`.
   - **meta** — 17px `#9AA4BC`, cuisine/type · price band.
   - **deal** — 3px accent rule + 16px text. **Not a chip.**
9. **Footer** y=588 — `gowayfind.com` muted left, deal count in `#FF7A32`,
   **gold CTA pill bottom-right**.

> **Collision, resolved.** The spec placed the deal count bottom-right and rule 3
> places the CTA bottom-right. The CTA is the action the card exists to drive, so
> it keeps the right edge; the deal count sits beside the wordmark on the left.
> Both survive.

---

## Rules that still hold from v1

- **Image-led, real.** The actual subject's best real photo (`?img=` passthrough /
  hero-images cron), never generic art when a real photo is known.
- **One hook.** One idea, hook-first, nothing the landing page can't verify.
- **Truthful numbers only.** Any figure is the real metric or absent.
- **Platform-native links.** Shared URLs carry the image ref and identify their surface.

## Hard rules

- **Never fewer than 3 picks.** Fall back to headline + photo. Never empty slots —
  two cards and a hole reads as broken software.
- **Never a place the page does not actually rank.** The card is a promise; a
  mismatch is a trust defect, not a cosmetic one.
- **Never render "0 local deals."** Omit the right footer entirely at zero.
- **Never redraw the logo.**
- **`s-maxage` never outlives the list's own revalidate**, and the card is
  **not** `immutable` — that is how a blank card got pinned for a year.

---

## Traps, each paid for once

- **Satori silently ignores the `inset` shorthand.** The scrim div and the
  panel's 80% blend both used `inset: 0`, both had zero size, and neither
  painted — the headline washed out and the panel showed a bright corner.
  Use explicit `top/left/width/height`. Asserted by the guard.
- **An `<img>` needs BOTH `width` and `height`.** Without them Satori fetches the
  asset to measure it, and a failed fetch throws *after* the 200 headers are
  streaming — the client gets a **zero-byte 200** the CDN caches. This shipped on
  `/api/og/intent` and blanked three cards for months.
- **Fetch assets from the request origin, not `SITE_URL`.** On a preview or dev
  host, `SITE_URL` points at production; if production rate-limits, the fetch
  returns HTML and Satori logs `Unsupported image type: unknown` and renders the
  card with **no photo and no wordmark**, still HTTP 200.
- **`Number(null) === 0`.** An unregistered focus coerced to `0` and pinned the
  crop to the top of the frame instead of returning null. Guard `null`/`undefined`
  explicitly before coercing.
