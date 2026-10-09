# Atlas pilot rubric (atlas-pilot-2026-10-08)

Blind comparison of two writers on the same 20 places. The scorer sees only `blind/packet.json`:
each place with output A and output B, in a randomized order. Model names, token counts and costs
are in `blind/mapping.json` and `summary.json` and stay sealed until scoring is locked.

## What is scored (each output, each place)

Gates first. A failed gate makes the output **unacceptable** no matter how well it reads.

1. **Correct venue (gate).** The text is about this exact place, in this metro, not a namesake,
   chain sibling or neighboring business. Pass / fail.
2. **Unsupported claims (gate).** Count every claim the cited sources do not support. Any
   fabricated or wrong-place claim (invented hours, prices, amenities, history, awards, distances,
   a fact that belongs to a different place) fails the gate. Write the count and quote each claim.

Then score 0 to 2 on each, only for outputs that passed both gates:

| Criterion | 0 | 1 | 2 |
|---|---|---|---|
| Factual support | Several facts lack a matching source in the packet | Mostly sourced, minor stretch | Every fact traceable to a listed source |
| Meaningful specificity | Could describe any similar place | Some place-specific detail | Concrete details only this place has |
| Useful practical detail | None a visitor can act on | One usable detail | Several (what to order or do, when, how to get in) |
| Accurate caveats | Missing or misleading limits | Present but vague | Accurate and appropriately cautious |
| Readable prose | Awkward, padded or stiff | Clear enough | Clean, natural, easy to scan |

Maximum 10 points per output.

## Verdict per output

- **Publishable**: both gates pass and total 8 to 10, with no criterion at 0.
- **Needs edits**: both gates pass and total 5 to 7, or any single criterion at 0 that an editor could fix quickly.
- **Unacceptable**: either gate fails, or total 4 or less.

"Both unacceptable" is a valid outcome for a place and must be recorded as such. Do not force a
winner. If the packet shows `no_output` (the writer found too few sources and declined), record it as
"declined", not as a failure of the gates; a decline is judged only in the summary of failure categories.

## Blinding protocol

1. Scorer opens only `blind/packet.json`. No model names, costs or token counts are in it.
2. Scores go in one file, `scores.json`: per place, per side (A or B), gate results, unsupported
   claim count with quoted claims, five criterion scores, verdict, and a one-line note.
3. Before anything is unblinded, compute `sha256sum scores.json` and record the hash (in the
   pilot channel or a commit message). Editing scores after unblinding invalidates the pilot.
4. Only then open `blind/mapping.json` and `summary.json`, join on `place_id`, and compare models,
   failure categories (`insufficient_sources`, `wrong_place`, `unsupported_claim`,
   `malformed_output`, `dash`, `blocked_source`, `tool_failure`, `provider_error`, `incomplete`) and
   settled cost per accepted card.
5. A second scorer, if available, scores independently from the same packet; disagreements on a
   gate are resolved by reading the cited source page together, not by averaging.

## What this pilot can and cannot say

Twenty places is **pilot evidence**. It is **not proof of equivalence** between the two models and
it does **not establish a stable failure rate** for either. With samples this small, a difference
of a few places is within noise, and one unlucky search can move a place from publishable to
unacceptable. The results are good for finding failure modes, sanity checking cost per accepted
card, and deciding whether a larger test is worth running. They are not enough to switch the
production writer by themselves.

The pipeline's own checks (identity gate, verifier) also run on every output and are reported
separately. A card that passes them can still fail this rubric, and the reverse. Judge the text, not
the verifier's verdict.
