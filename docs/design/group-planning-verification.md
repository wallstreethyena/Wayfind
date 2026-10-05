# Group planning prepared milestone

Prepared 2026-10-05. Local-only feature branch `feat/unified-sharing-group-plans-2026-10-04`, based on release revision `517253af3599124143cee37253ea1d77c737f67d`. This is a reviewable implementation, **not a production acceptance or all-guards-pass receipt**. No push, migration application, provider send, paid probe, or feature activation was performed.

## Delivered scope

- One text-first share policy across inventoried text-share families, with canonical-origin normalization, explicit SMS/email/copy choices, native-share cancellation handling and earned interaction credit. Explicit PNG export remains file-sharing by design.
- Disabled-by-default durable group creation, private per-slot invitations, vote/availability editing until disclosed closure, immutable choices, organizer results/finalization/cancellation and resumable plan listing.
- Deterministic ties, declines, nonresponses, respondent-only versus universal time overlap, and independent opening-hour verification. No padded alternatives or model-determined votes.
- Read-only grounded alternative selection and editorial fallback, licensed attributed photo hydration, privacy-safe public previews, analytics/token redaction.
- Server-owned RLS schema and transactional CAS/notices/outbox, rate/mutation budgets, deadline worker, bounded cleanup and gated existing-provider optional email.

## Verification ledger

- Core runtime tests: domain 176, timezone 50, service/API 170, candidate/evidence 130, actual JSX/callback UI 141, embedded PostgreSQL 50, fake notification transport 40, place metadata 39 assertions. No production database or real message transport was used.
- Unified transport: 64 runtime/negative/source assertions; canonical sink policy 46 runtime/negative controls over 58 app/lib sinks; app-rating 77 and date-invite 892 assertions; plus the existing chooser, guide, card-action, destination, rail and beach regression guards. Applied mutations cover default-enabled rollout, bypass text sharing, stale UI revision, venue-hours acknowledgement, missing place identity, bad absolute-link boundaries and neutral-moment app-rating triggers.
- The final frozen-runtime production build completed with all 818 static pages (exit 0), after two earlier successful 818-page builds. The final bundle gate passes at 465.4 KB gzip total against a 498 KB budget (32.6 KB headroom); the home route chunk is 0.5 KB against 175 KB. Raw build and bundle receipts are preserved at handoff; placeholder public keys deliberately do not establish real integration readiness. The first default parallel build exited 137; single-static-worker builds completed. No unsupported root cause is inferred from that exit.
- Canonical runner's last recorded stop was check **178**, `check-og-absolute.mjs`. Its obsolete sink scanner was repaired to execute real shared transports and shell wiring, with negative mutations and no unknown accepted share provenance. This focused repair is not retroactively described as a complete canonical run.
- A separate bounded diagnostic executed **all 647 remaining commands, 179–825**: **630 passed, 17 failed** in that snapshot. It deliberately continued after failures, so it is a diagnostic, never a replacement deployment gate. Subsequent focused repairs and their raw receipts are preserved separately.
- Feature-related failures were repaired narrowly: explicit method declaration for the bare-call scanner, positive controls in the time test, group photo-surface registration, shared-transport assertions and reviewed guard registry fingerprints. No guard was removed or silently weakened. The two newly strengthened share guards were removed from the existing weak-guard debt ledger. Final focused runs of registry parity, honesty, hermeticity and JSX compilation are green.

## Inherited and environmental failures

Nine failures were reproduced by read-only execution in the release checkout at HEAD `517253af` (which also had staged mobile-containment changes):

1. `check-creator-events.mjs`: old Fall cache version assertion.
2. `test-rail-select.mjs`: old paging sentinel source assertion.
3. `check-market-photo-honesty.mjs`: RailCard source assertion.
4. `test-fall-intent-rails.mjs`: old paging sentinel source assertion.
5. `check-no-dead-end-pages.mjs`: Florida event-detail map target assertion.
6. `check-card-photo-error-fallback.mjs`: RailCard retry source assertion.
7. `test-event-experience.mjs`: EventWhere fixture reaches `pins.length` with null.
8. `test-empty-rail-visibility.mjs`: sports destination assertion.
9. `check-photo-surface-registry.mjs`: Florida event-detail registration absent. The new group surface is registered.

The committed base also failed `check-home-answer-first.mjs`; the release lane's staged repair passed. These belong to the release lane, not a claim that they are all harmless or fixed. This feature does not alter those Fall-owned files.

`check-doc-ownership.mjs` requires the real owner's exact-head approval through GitHub. Local identity changes cannot grant it. `check-fall-registry-integrity.mjs`'s live branch failed with intentionally fake test credentials; a clean-env rerun passed 52 static assertions and explicitly skipped live checks. `test-map-family-layout.mjs` could not launch Chromium because the environment denied its socket/ptrace facilities. A failed browser launch is not browser QA.

## Remaining acceptance gates

1. Reconcile any later release head, resolve inherited failures and run the canonical gate in the approved environment. Preserve real exact-head owner approval; never synthesize it.
2. Review and approve the exact migration, apply through the required canonical runner, and verify hosted RLS plus genuinely concurrent claims/votes/deadline/CAS/outbox races. Embedded single-process PostgreSQL does not prove hosted concurrency.
3. Authorize and verify deadline scheduling, cleanup and the existing email sender. No existing key's presence establishes sender readiness. Email stays off until verified and each organizer opts in.
4. Render and interact with real phone/tablet/desktop flows, auth resume, keyboard/focus, photo credit/fallback, native SMS/email/Web Share and actual link unfurls. Only source/SSR/callback verification exists for the new group UI today.
5. Review exact lifecycle wording: Start invitations opens voting; per-slot sharing records chooser initiation, not delivery. Link-ready, sharing-started, voted and declined are shown. A separate joined/open receipt is intentionally not implemented.
6. Review remaining visual coverage. Concrete place and group links reuse photo-led HERO previews when licensed photos exist. Intent, collection/list, coupon, beach, rail-poster and privacy-preserving date-invite families retain their documented existing renderers. Universal photographic redesign is **not complete**. Legacy `/p` query-fact canonicalization beyond the fresh server-held name remains a documented accuracy risk.

Keep `NEXT_PUBLIC_GROUP_PLANS_ENABLED`, `WF_GROUP_PLANS_ENABLED`, worker-ready and email flags disabled until their respective gates pass. The safest publication is a separately reviewed disabled-feature change, reconciled into the desired clean release only after explicit integration acceptance. No new paid LLM use is needed for this implementation; the observed Anthropic monthly cap is already reached.
