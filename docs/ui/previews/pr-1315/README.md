# PR #1315 review pack — restore the #1302 premium card

Owner-gated restoration. **Stay draft. Do not merge until the founder
approves the look.** Screenshots and measurements live here so CoS can
fetch them without a Cursor login.

Canonical premium design: PR #1302 / `45e486c6654fd0fdbaae8a2f8135ec11572cf423`  
Production regression: PR #1313 / `94ff778698c940648fb00f65275fe99a00c915d5`  
Repair branch: PR #1315

## What this PR restores

Keep #1313's geometry that was actually correct:

- stacked lists fill the column (`min(100%, 440px)`)
- 13px page gutters — no 40–44px dead strip on the right
- 1.08 peek is rail-only
- stacked photo ~36% (32–38%), not the 88/96px sliver
- rails keep 96px mobile media
- one 268px outer height; skeleton matches live cards

Restore the #1302 compact hierarchy at `<=430px`: 10/10/8 content pad, 15px
title, 9.75px meta, 22px award, 21px highlights, 34px action row, 44/26/26
grid, compact like/dislike. Same radius, border, layered background, shadow,
orange accent, score, rank, pills.

## Screenshots (clean, full-size, real shared renderer)

Orange debug overlays are **not** the review proof. Use these unlabeled
shots first. Measurements are secondary.

Photos in these fixtures are deterministic local stand-ins (no network
Places images). They prove media column width and hierarchy. Live QA
against production inventory is what shows venue photography.

| File | What it proves |
|---|---|
| `place-cards-390.png` | ≥3 stacked cards at a real 390px viewport |
| `place-cards-440.png` | Same at 440px |
| `place-cards-390-simple-vs-creator.png` | Simple card and creator-video card share 268px; actions align |
| `place-card-missing-image-390.png` | Monogram / missing-image card does not collapse |
| `place-card-commerce-390.png` | Ticket CTA stays inside the 268px body |
| `place-cards-rail-peek-390.png` | Horizontal rail still uses the 1.08 peek |

## Measurements

- `card-height-before.json` — #1313 live (`94ff778`), stacked cards `height:auto`. Heights split 162–266px.
- `card-height-after.json` — 268px lock after the first height-only pass.
- `visual-contract-measured.json` — computed styles at 320/390/440 after the premium restore (gutters, media %, padding, type, actions, radius).

## Vercel failure — corrected diagnosis

The earlier note that Vercel failed to enqueue or authenticate was **wrong**.
Founder checked the actual GitHub and Vercel evidence.

The deploy failed inside `npm run prebuild` → `check-place-card-equal-height`:

```
check-place-card-equal-height: FAIL
MUTATION CONTROL: a 300px simple-card override must fail this guard (got status 0)
MUTATION CONTROL: rendered evaluator names unequal-height failure
run-guards failed
```

Immediately before that, Vercel reports Chromium unavailable, so the
equal-height test correctly runs **source only**. The bug was the harness:
after source-only validation it still spawned `--mutation-control-child`
and required `child.status !== 0` plus `RENDER mutation caught`. The child
also has no Chromium, cannot run the rendered 300px mutation, and exits 0.

That is a test-harness defect, not a CSS defect and not a Vercel
integration/auth/enqueue failure.

Fixed architecture:

1. Source checks always run everywhere.
2. Source-level mutation controls always run everywhere.
3. Rendered equal-height checks run only when Chromium exists.
4. Rendered 300px mutation control runs only when Chromium exists.
5. `--require-browser` fails if Chromium is unavailable.
6. GitHub merge CI calls this guard with `--require-browser`.
7. Vercel may source-only when it has no browser, and must print
   `SOURCE CONTRACT PASSED — RENDERED CONTRACT NOT EXECUTED`.
8. GitHub remains the authoritative rendered merge gate. Absence of
   Chromium is never a fake green merge.

## Release gates (all required — founder visual approval last)

- GitHub rendered guard GREEN (`--require-browser`)
- Vercel preview READY/GREEN
- real 390px QA GREEN
- real 440px QA GREEN
- no horizontal scroll
- all cards 268px
- actions aligned
- photo not a sliver
- no right dead strip
- premium visual contract restored
- founder visual approval received (`ui-owner-approved`)

Do not ship on “guards enough.” Stay draft until the founder signs off.
