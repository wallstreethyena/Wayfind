# JOB1 — photo burst analysis and queue truth — 2026-09-10

## Owner question
Why did the photos ledger jump after paid photos were briefly enabled, what is the real queue, and can the health surface distinguish historical budget headroom from an actually armed paid switch?

## Verified live facts
- September `photos` ledger: 1061 used / 2000 cap at audit time.
- August `photos` ledger: 950 / 950.
- Latest queue read at audit time: 550 open, 5 recovered, 0 budget_blocked.
- Latest monitor pulse: 92% placeholder-rate of 499 probes, open=550, cold=230.
- Recent `photo-repair` pulses do not carry a current readable `allowance=used/cap` tag, so a pulse-only runway can be absent even while the ledger itself is readable.

## Failure class
A stored ledger cap is historical state. It does not prove `WAYFIND_PHOTOS_PAID` is currently armed. The old health/OS wording could turn measured burn plus ledger headroom into a countdown without checking the live paid switch.

## Fix
`lib/photoRunwayTruth.js` is now the single wording policy for photo runway truth. Both the health API and generated OS state use it.

When paid photos are disabled, the surface says the remaining allowance is a reserve and does not expose `runwayDays` as an automatic countdown. When enabled, the same helper may report the measured runway. The health API also exposes `paidPhotosEnabled`, `allowanceUsed`, and `allowanceCap` explicitly.

## Spend safety
This change performs no Google call, applies no database migration, changes no spend cap, and does not enable paid photos. It only changes observability and wording.

## Burst interpretation
The ledger moved from the old 950 operating line to 1061 during the period when paid photo fetching had headroom. The repository does not currently keep a per-grant request log with route, IP/UA, or place identity, so it is not possible to prove a more detailed attribution from the ledger alone. Treat any claim that the burst was definitely human traffic, definitely bots, or definitely one route as unproven until grant-level observability exists.
