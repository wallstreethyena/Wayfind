# Miami rail latency, September 11, 2026

## Confirmed baseline

Production commit `67903eb29edbd27b87b6af874e424fefb88a96ab`, Vercel deployment
`dpl_4Moh6R5gRTCcXhmMzvhuRXeFFcP8`, returned two uncached 503 responses for
`/api/rails?lat=25.7617&lng=-80.1918&city=miami&v=2`.

The request logs identify the existing 9,000 ms computation deadline:

| UTC request | Ranked | Nearby | Parallel pools | Last stage | Result |
| --- | ---: | ---: | ---: | --- | --- |
| 17:09:26 | 4,398 ms | 1,562 ms | 2,109 ms | editorial | timeout at 9,000 ms |
| 17:10:00 | 1,884 ms | 5,122 ms | 1,993 ms | parallel-pools | timeout at 8,999 ms |

The second request also logged a Nearby nightlife read timeout at six miles.
These are cumulative critical-path failures, not evidence that Miami has no
qualifying places. Both responses correctly said `covered:false`, `failed:true`,
`data:null`, with `Cache-Control:no-store`.

Parrish, Tampa, Sarasota and Orlando returned HTTP 200 with `complete:true` and
`degraded:false`. Miami's separate Night Out, Date Night and Today Discovery APIs
also returned HTTP 200 with `degraded:false`. Runtime error clustering alone
missed the two 503s; request-level logs supplied the evidence above.

## Existing implementation and protected rules

Open PR #1263, head `77d9c4c8092d00bc697e5de30ea25198cce09b2c`, already contains
a bounded eight-task queue overlapping ranked and Nearby reads after the
consolidated prime. Its server portion predates #1287's explicit completeness
contract and must retain that newer contract when integrated. Its broader
client preparation, public-answer reuse and Fall changes are separate scope.

The latency repair must preserve the nine-second deadline, identity-before-cap,
exact geography, ranking and output order, dedupe, explicit completeness, cache
admission, read and byte budgets, refresh/shuffle clocks and provider spending.
Concurrency is not permission to cache a partial result or broaden an identity.

## Acceptance

1. Execute a controlled concurrency test on real `loadPools`, with positive
   controls and a serialized mutation that fails.
2. Preserve complete and incomplete read behavior, output ordering and the
   existing compute snapshots and budgets.
3. Run required guards and build on the exact integrated revision.
4. After an authorized deployment, verify deployment identity, fresh Miami
   responses and request-level computation timing, plus healthy metro controls.

The baseline alone does not establish the speed of a proposed repair. A database
snapshot audit also does not measure live request latency.
