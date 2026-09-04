# Proposal — One ranking law for every rail

- **Lane:** claude-sonnet (rank-law lane)
- **Target file if adopted:** `CLAUDE.md`, as a new top-level section (placed
  right after the "Guard pattern — assert the invariant, not the file path"
  section, before "Recent state")
- **Origin:** WO-A (2026-09-03), fixing `lib/nightOutIntent.js` and
  `lib/fallIntentRails.js` ranking a distance ring ahead of the Wayfind
  Score. `check-doc-ownership.mjs` (landed on `main` while this lane was
  mid-fix, via #1096) forbids a lane from writing `CLAUDE.md` directly, so
  this rule is filed here instead of being committed straight into it.
- **Status:** awaiting owner adoption. Not in force until it lands in
  `CLAUDE.md` under an owner commit.

## The rule, verbatim, ready to paste

### 🏆 One ranking law (2026-09-03)

**Every rail sorts by `lib/railRank.js`: Wayfind Score DESC, reviews DESC,
distance ASC, place_id ASC. Distance is a TIE-BREAK ONLY — it may never
pre-empt the score.** `byWayfindScore` / `rankRailPlaces` are the only
sanctioned comparator; a rail composer that hand-rolls its own sort is
carrying a fork of this law, not an equivalent to it.

**The two rails that broke it.** `lib/nightOutIntent.js` and
`lib/fallIntentRails.js` both sorted by a distance RING *before* the score:

```js
const ring = (a.distMi > NEAR_MI) - (b.distMi > NEAR_MI);
return ring || (scoreOf(b) - scoreOf(a)) || (a.distMi - b.distMi);
```

The owner's screenshot (2026-09-03, third time asking), Night Out → Clubs &
Dancing near Parrish: Joyland 8.5/16.8mi, La Jaula 7.7/14.9mi, Enigma
9.0/18mi — Enigma's 9.0 rendered LAST. Joyland and La Jaula were both inside
the 17mi ring (ring 0) and sorted on score against each other; Enigma at 18mi
was ring 1 and was exiled below both, regardless of the number on its card.
The code was doing exactly what it was written to do — the writing itself is
what the owner rejected, three times.

**Why the existing guard stayed green through all three complaints.**
`scripts/test-rail-score-order.mjs` exists for this exact complaint (its
header quotes the owner, 2026-08-05) — but every assertion targets
`rankExperiences()` in `lib/experiencesData.js`, the Experiences rail only.
It asserted nothing about nightOut / fall / dateNight / birthday /
todayDiscovery / lunchBreak, and it was scoped BY NAME to one composer, so
every rail composer written since was born unguarded. That file still covers
Experiences and only Experiences — see its header for the pointer to the
guard below.

**The fix is `scripts/check-rail-rank-law.mjs`, and its whole point is
enumerate, don't list.** It globs `lib/*Intent*.js` + `lib/*Rails*.js`,
inspects each file's real exports for a `compose*`/`split*`/`rank*` symbol,
and FAILS the build if any discovered composer has no fixture registered in
the guard — so a brand-new `lib/xyzRails.js` with a `composeXyzRails` export
fails this guard by name the moment it lands, instead of shipping unguarded
like every rail composer written after 2026-08-05 did. For every covered
composer it runs the owner's real numbers through the REAL function (assert
on the call, not the string) and checks both the winner and the full
monotonic order of every rail returned. It also red-proves itself: it
reinserts the exact shipped ring into a scratch copy of the fixed files and
asserts its own fixture check goes red against it — proving the sabotage
actually applied and that the check can detect the bug CLASS, not just
today's two instances.

Fall additionally had a second, quieter bug in the same neighborhood:
`rankEvent`/`rankPlace` compared `scoreEvent()` (curated-event urgency/
freshness, ~0–10) directly against `wfScore` (0–100) — a place's score
numerically dominated almost every event regardless of quality. Fixed by
normalizing `scoreEvent` onto wfScore's 0–100 magnitude (`× 10`) rather than
declaring events and places incomparable; see the comment above
`normalizedCardScore` in `lib/fallIntentRails.js` for the reasoning.

## Why it is worth adopting

Same family as every other entry in "the identifier must play its ROLE, not
merely appear": `test-rail-score-order.mjs` ran, read real content, and
returned a truthful answer to a question nobody asked about the two rails
that were actually broken. The fix pairs a real behavioral law
(`lib/railRank.js`, executable, imported by 8 composers) with a guard that
enumerates its enforcement surface from the filesystem instead of trusting a
hand-written list — which is the only thing that makes "the next new rail
arrives guarded" true instead of aspirational.
