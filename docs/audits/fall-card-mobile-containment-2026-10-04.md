# Hosted Fall card geometry correction

Base: published PR #1636 head `517253af3599124143cee37253ea1d77c737f67d`.

## Observed evidence

[Required browser job](https://github.com/wallstreethyena/Wayfind/actions/runs/37242451893/job/111553700536) and [downloaded metrics/screenshots](https://github.com/wallstreethyena/Wayfind/actions/runs/37242451893/artifacts/11316889201) show:

- Nine adapter groups actually contain three RailCard specimens and two of each other adapter: 17 live cards plus two skeletons. The old accounting assertions incorrectly expected 16 live cards and two per group.
- At achieved 320px, the rich Fall card is 271.46875px wide and 268px high, with bottom y=616. Its two CTA controls wrap into separate 30px rows separated by an 8px gap. All four reaction buttons end at y=621.234375, 5.234375px outside the card body. The other two RailCard specimens remain contained.
- The same rich Fall specimen is contained at 360px and 390px; the failure is not an incorrect body-height measurement.
- Both Vercel previews also stopped at the source assertion in `check-home-answer-first` that requires `src={shownPhoto}`. The card now truthfully tracks its filtered original or matching-primary, one-shot fallback through `displayedPhoto`; actual fallback and credit transitions are already exercised by `test-fall-card-integration`.

## Corrections

- Only the shared dual-CTA slot changes: equal `minmax(0,1fr)` columns let each label wrap inside one row. The 268px card body, width cap, media column, title style, four reaction controls and their containment tolerances are unchanged.
- Required rendered fixture accounting now checks the exact unique adapter identities and per-adapter counts, including the third rich RailCard state. It does not lower a count or replace exact checks with a minimum.
- Cost text joins the existing rendered containment checks. A new 320px browser negative control restores the former stacked dual links and must reproduce all four clipped reactions. The existing 340px size-mutation protection remains intact.
- The photo assertion now verifies the entire filtered-original, matching-primary fallback, consumed retry, failure state and monogram chain. Nine in-memory source mutations must be rejected by that same check. The original assertion count is preserved.

## Acceptance status

Local targeted checks pass: home-answer 180 assertions; Fall visit facts 52; actual Fall integration 16; house-card 101; shared CSS reachability 15 render sites; no-Directions 24,778 assertions; JSX and whitespace checks. Guard registry parity passes, and the geometry expectation ratchets from 77 to 78 assertions for the added browser negative control.

Local `check-place-card-standard` passes only its structural portion; native Chromium remains unavailable to that runner. Neither corrected 320px geometry nor the new browser negative control has a local rendered pass. The required hosted browser rerun must establish both before acceptance. No paid build, deployment, owner approval, database change or gate bypass is performed by this patch.

The follow-up local Next build reached static generation (772/816 pages), then its execution poll returned `automatic approval review was cancelled`. No final build or new bundle result is claimed for this follow-up, and it was not restarted. This is separate from the earlier candidate's successful build. The previous broad diagnostic likewise did not resume: its one authorized original-session poll retry returned `Unknown process id 97156`. Neither limitation is bypassed by this patch.
