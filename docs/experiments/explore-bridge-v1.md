# explore-bridge-v1: change history

The pre-registration for this experiment lives with its code:

- the hypothesis, primary outcome and guardrails (including CLS) are in the header of `app/components/ExploreBridge.js`;
- assignment, exposure and the split (`TREATMENT_PCT = 50`) are in `lib/experiment.js`.

This file records production changes made **while it runs**, so a before/after reading can account for them. Nothing here changes the key, the split, assignment, exposure counting or the primary outcome.

| when (UTC) | change | merge / deploy | effect on this test |
|---|---|---|---|
| 2026-10-01 05:30:08 (prod ready) | **#1602 layout repair (#1609).** The treatment block was server-rendered as `null` and inserted at hydration, after the guide had painted, pushing the partner rail and pick 1 down under the reader. It is now server-rendered for everyone, hidden by CSS unless a pre-paint script (`lib/exploreBridgeGate.js`) marks the treatment arm with the **same** assignment as `recordExposure()`. | merge `5ab657e`, `dpl_EeTEPDNEGE8NrHfRhfisP7xBUNaS` | **Treatment** sees the same block, painted at its final size instead of inserted. **Control** and automation see nothing, as before. Assignment is unchanged; `scripts/test-explore-bridge-gate.mjs` executes the script against `recordExposure()` for 4,000 ids. Exposure is still recorded only at mount, and the block takes no taps until then, so no tap can precede its exposure. **The CLS guardrail is not comparable across this timestamp:** treatment CLS falls by design. Measured on a local production build, slow hydration at 390px: before, 0.32–0.39; after, 0–0.03 (the 0.03 is the guide-inline-book cue). Read the CLS guardrail separately before and after this deploy. |
| 2026-10-01 06:21:24 (prod ready) | **#1602 follow-up (#1614).** An independent audit found that `pointer-events:none` stopped taps before exposure but not the keyboard. The block is now server-rendered `inert` until the client resolves the arm (value `"inert"`, because React 19 treats `inert` as a boolean). | merge `faaf893`, `dpl_8LYfcowsPH9z17UXUkaJZiFpETXg` | Treatment only. No tap, Tab or Enter can reach a bridge link before its exposure is recorded, so `cta_open_app` and bridge `detail_open` can no longer precede `$feature_flag_called` in a session. Nothing visible changes. Production: 36/36, with the treatment block inert before hydration and released after. |

Production check after release (2026-10-01, `5ab657e`, 390×844 plus a 1280px desktop run with the `#pick-1` anchor; client JS held back 3s; rail forced slow, failing or empty):
- **Treatment:** the block was already at its final height at first paint (Orlando 563px, Sarasota 492px, desktop 385px) and did not change. Pick 1 did not move. CLS was 0.
- **Control and automation:** no block, nothing moved, CLS 0.
- All 36 cases of `tests/e2e/guide-rail-layout.spec.js` passed.

