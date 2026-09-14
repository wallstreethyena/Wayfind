# PR #1315 review pack — one 268px place-card height

Owner-gated repair of the #1313 `height:auto` regression. Screenshots and
measurements live here so they survive the agent VM.

## Screenshots

| File | What it proves |
|---|---|
| `place-cards-390.png` | ≥3 stacked cards at a real 390px viewport, each labeled 268px / ~35.8% photo |
| `place-cards-440.png` | Same at 440px |
| `place-cards-390-simple-vs-creator.png` | Simple card and creator-video card share 268px; Save/Like/Share align |

## Measurements

- `card-height-before.json` — #1313 live (`94ff778`), stacked cards `height:auto`. Heights split 162–266px.
- `card-height-after.json` — this PR. Every live variant + skeleton is 268.00px at 320/390/440. 13px gutters. Photo 35.75–35.82%.

Richest legitimate card on the old auto layout was 266px, so the shared token stays `PLACE_CARD_HEIGHT_PX = 268`.

## Vercel preview diagnosis (head `e5c26acc`)

GitHub Actions on the same SHA: **guards + `npx next build` + `check-bundle` GREEN**
([run 34862255241](https://github.com/wallstreethyena/Wayfind/actions/runs/34862255241)).
Bundle ratchet: `479.1KB gz / 498KB`, headroom 18.9KB.

Vercel GitHub status on that SHA:

```
Deployment has failed — run this Vercel CLI command:
npx vercel inspect dpl_2Ax8L2HqGQD8Fm7KSVwZpNADW1oT --logs
```

Inspect URL: https://vercel.com/wayfind2/wayfind/2Ax8L2HqGQD8Fm7KSVwZpNADW1oT

What this environment could actually read:

- Vercel bot on #1315: `nextCommitStatus: FAILED`, `previewUrl: ""` (no URL minted).
- Inspect page and the `*.vercel.app` log URL return **403** without Vercel team auth.
- `npx vercel inspect … --logs` in this VM: `No existing credentials found. Starting login flow…` then waits on device OAuth. No deploy log body was returned.
- First revision `ed660e80` (`dpl_7PkvoNKMXmV2J4pPVcezQpRU8UM4`) failed in the **same second** it was created — that is not a finished `next build` + `postbuild` (those take minutes). Characteristic of a Vercel Git integration / authorization / enqueue failure, not a compile error in this PR.
- This PR did not change `vercel.json`, `package.json` `build`/`postbuild`, env, or Next config. Other open draft `cursor/*` PRs (e.g. #1314) preview successfully with the same `cursoragent@cursor.com` author.

**Verdict:** no evidence this PR’s card-height patch broke the Vercel build command. The exact build-log error line is **not available** without Vercel dashboard/CLI auth. GitHub’s production build of the same tree passed.
