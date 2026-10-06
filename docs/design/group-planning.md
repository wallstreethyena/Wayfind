# Unified sharing and group planning

Status: isolated implementation, not enabled or deployed. Rebased onto release head `517253af3599124143cee37253ea1d77c737f67d`. Do not integrate or activate without a separate reviewed acceptance decision. Later release fixes must still be reconciled before publication.

## User experience

Every share uses one text-first transport and the established Wayfind styling. A concrete place can offer **Just share it**, **I’m asking someone out**, and **Organize a group**. Existing safe, real-photo HERO link previews are reused. A message composer or Web Share completion is not delivery proof. No address book, phone number collection, or automated text messages.

An organizer signs in, names 1–10 invitees, picks a voting deadline and 1–3 outing intervals, and reviews the original place plus up to two genuinely comparable, higher-scoring places. The organizer is additional to the ten invitees and is available for the proposed times. No qualifying alternatives means fewer choices, never filler.

Each named slot has its own strong signed link. **Start invitations** explicitly opens voting before the organizer uses each private share link. The roster, places and times are fixed. Created, sharing initiated and replied are distinct states. The application cannot know whether a text was delivered. Invitees may change or withdraw while voting is open; voting closes on the final expected response or the deadline, after which responses are frozen. A decline is a response, not a vote or availability.

The organizer sees named response status. Invitees see only their own name/response and aggregate counts. No other guest names, contacts, credentials or organizer account ID appear in their API view. The organizer makes the final decision and shares a final-plan link through their own composer. Ties, missing responses, declines and no common time require honest disclosures. A respondent-only overlap is never called a time that works for everyone.

## Existing capabilities and exact gaps

- `shareOut`, `shareChooser`, `shareIntentSheet` already implement most sharing plumbing. Several callers bypass the common path.
- `heroCard`, `heroSource`, and `/api/og/hero` already implement branded, photo-led previews with safe pre-fetched image bytes and short CTAs. Reuse them.
- Date invitations are stateless URL payloads, with replies returned through the user's message composer. They are not a shared vote database.
- Live Supabase metadata on 2026-10-04 showed no group-plan, invite or poll relations.
- `wf_editorial_servable` is the operational-place-gated source of verified Wayfind copy. Its `written_at` is a writing date, not proof that every source was checked that day. Do not relabel it as such.
- The old insider generator is disabled because of fabricated claims. No group page invokes it or creates paid model requests. Reuse checked evidence or show unavailable.
- iOS push and operational email code exist, but a consented group-notification channel has not been verified. Initial implementation provides durable in-app results and an idempotent notification record. External notifications remain a release gap, not a claimed send.
- A canonical migration was generated with the Supabase CLI and executed against isolated embedded PostgreSQL using pinned PGlite 0.3.14 as a development-only dependency. Hosted Supabase and multi-connection concurrency remain unverified. Production application still requires the canonical runner, approval and receipts.
- Jev tools are unavailable in the current session. Architectural review is Astra's own review.

## Data and security contracts

The pure state machine has `draft → open → closed → finalized`, with organizer cancellation before finalization. Plan revision is monotonically increasing. Collections are immutable after creation in the first version. Changing them means starting a fresh draft. Command IDs are idempotent; duplicate or conflicting replays cannot add votes. Per-slot mutation budgets prevent one link holder from exhausting the organizer's controls.

Server-only plan rows hold owner ID and a random 256-bit per-plan signing secret. Invite capabilities use HMAC-SHA256 over the plan ID, slot ID and invite version. A token grants only that slot's actions, not account identity. Links may be forwarded: possession is sufficient to answer for that slot. The organizer is told to send each link privately. Invites expire with the plan and cancellation revokes them. Secrets never enter projections, logging, OG metadata or analytics.

Invite tokens travel in the URL fragment and are submitted in a request body. They are excluded from referrers and server access URLs. A generic group landing route supplies only the intentionally shared original place preview; private plan details are fetched after token verification. No contact details are collected.

All plan, notification and rate-limit tables enable RLS, revoke public/anon/authenticated access, and allow only the server role. API organizer access verifies the current Supabase session with the auth server, then matches owner ID. Mutations require same-origin JSON requests. Service-role-only database functions perform transactional compare-and-swap, server-clock deadline checks, the ten-invite cap, owner creation throttles, and unique notifications. A SQL/API error is a visible unavailable or retry state, never an empty successful plan.

Voting deadlines and outing intervals are different UTC instants with a retained IANA zone. Local datetime input is round-tripped through the zone; nonexistent daylight-saving times are rejected and repeated times require a choice. The deadline must precede every outing interval. First release bounds voting to 14 days and outings to 90 days. Cached third-party place facts expire independently and are removed/rehydrated before display rather than retained for the whole plan.

## Recommendations and editorial

Candidates come only from existing authorized inventory and cache; no Google or model spend is introduced. The original and candidates use the same current governed Wayfind Score context. Alternatives require a known current score strictly above the original, matching intent/category (including cuisine where known), nearby location and compatible known budget. Known opening-hour conflicts exclude a candidate; unknown hours do not. Attendee availability never proves opening hours. Unknown venue hours require an explicit organizer confirmation that they checked with the venue before finalizing. At most two qualify; ties in their scores use deterministic identifiers after distance. The initial place remains visibly marked as the organizer's pick.

Verified editorial is read from the gated view, with explicit provenance/availability. Publication time must not be called source-check time. No generic model-generated claims, fabricated ratings, invented dishes or padded alternatives. Only stable place IDs and neutral labels are persisted in long-lived group state. Current lawful facts are hydrated on each read; expired third-party facts are suppressed. Candidate identity never changes under an existing vote. When verified fresh editorial is absent, source-supported comparison reasons (category, distance, current score and compatible budget) explain the option.

## Notifications and delivery

Closing and finalizing write one durable organizer notice transactionally. Deadline closure has a bounded server worker; reads also settle expired plans. The worker needs a verified schedule before the feature is enabled. A pending, attempted, provider-accepted and delivered notification are different statuses. Optional email uses the existing Resend provider only after production sender verification, explicit feature enablement and a verified organizer email plus per-plan opt-in. The outbox has transactional leases, bounded retries and a stable provider idempotency key. Provider acceptance is never called inbox delivery. No actual emails were sent during this work. No SMS provider is assumed.

## Delivery gates

1. Deterministic state-machine, privacy, timezone/DST, alternative-eligibility and replay tests, including negative controls.
2. API tests: owner isolation, forged/expired tokens, same-origin enforcement, race retries, stale revisions, deadline crossing, closed-plan rejection, rate limiting and honest unavailable configuration.
3. Review and execute the exact schema locally/staging; adversarial concurrent writes and RLS denial tests. Then obtain approval for the canonical production migration and reconcile its receipt.
4. Render real mobile/tablet/desktop creation, ballot, result and share flows; verify achieved dimensions, keyboard/focus behavior, real-photo fallbacks, and old date-invite regressions.
5. Verify deadline worker and organizer notification behavior end to end without sending real invitations to third parties.
6. Reconcile with the final Fall release. Publish only on approval, preserve exact-head owner gates, then verify the deployed revision and the real device share behavior. Do not enable with only local unit tests.

## References

- [Web Share semantics](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share): resolved promises represent platform-dependent handoff, not confirmed message delivery.
- [Apple SMS links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/SMSLinks/SMSLinks.html): the URL scheme opens the user's composer; preview rendering and attachments are platform-controlled.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): table grants and row policies are separate controls.

## Read-only live capability evidence, 2026-10-04

- Production Vercel metadata lists ANTHROPIC_API_KEY, ANTHROPIC_MONTHLY_REQUEST_CAP, RESEND_API_KEY, WF_ALERT_FROM and WF_OWNER_USER_ID. Values were not decrypted. Presence is not a live-success test.
- The live October Anthropic ledger is 2,000/2,000 requests, last updated October 3. No paid probe or cap increase was performed.
- There are 87 insight-cache rows from the last 30 days (latest October 2). Their presence does not establish a successful provider response today.
- The detail cache holds 32,681 pd1 rows, only 40 fresh at inspection. None pairs structured hours with an IANA zone; 39 fresh rows have weekday-text hours and none has a recorded offset. No speculative text parser or paid refresh was added. Eligible alternatives remain offered with unverified hours.
- The separate share-photo task was reread through its authorized thread. Latest report says universal photo coverage is unfinished and local-only; its executor path is absent here. No remote share branch was found representing that recent local result.

## Activation checklist

1. Base reconciliation with Fall head `517253af3599124143cee37253ea1d77c737f67d` is complete. Reconcile any later release revisions and resolve inherited release guard failures before publication.
2. Approve and apply `supabase/migrations/20261004232233_wf_group_planning.sql` using the canonical runner. Verify grants, RLS, concurrent transactions and notices on the actual target.
3. Schedule `/api/cron/group-plans` using the existing approved scheduler/CRON_SECRET mechanism; verify deadline closure with the independently enabled authenticated worker. Permanent cleanup stays off pending separate retention approval. Only then set `WF_GROUP_PLAN_DEADLINE_WORKER_READY=1`. No schedule is installed by this patch.
4. Keep `NEXT_PUBLIC_GROUP_PLANS_ENABLED` and `WF_GROUP_PLANS_ENABLED` off until acceptance. Both must be 1 to activate.
5. For optional email, verify the existing sender with an explicitly authorized test, then set `WF_GROUP_PLAN_EMAIL_VERIFIED=1` and `WF_GROUP_PLAN_EMAIL_ENABLED=1` in production. Default is off; no new provider or credential is created.
6. Verify native/text/email/copy sharing, actual photo previews and achieved phone/tablet/desktop layouts. Browser geometry is not proved by SSR or unit tests.

## Review walkthrough

1. Choose **Organize a group** from a concrete place's shared menu. The value is explained as **Pick a place. Find a time.** Sign in so the plan can be resumed from **Your group plans**.
2. Name up to ten friends privately, propose one to three times, and set a separate response deadline. The organizer counts as available for those proposed intervals. Optional result email is offered only when the verified existing service is enabled.
3. Review the original and zero to two qualifying alternatives. Each card shows supported reasons, source-check status and opening-hour uncertainty. Licensed photo credits are displayed; missing credits fall back to the branded card, never a substitute venue image.
4. Each friend has their own secure link. **Start invitations** opens voting; **Share invite** then opens the common chooser for that one slot, and the next text/email/native composer is controlled by the organizer. Repeat for the intended slots. Link ready, sharing started, vote received and declined states help resume the task. There is no separate joined/open receipt, and no screen says those invitations were delivered.
5. A recipient opens their own link, chooses a place, and marks every proposed time they can attend, or declines. Responses can change or be withdrawn until the last expected response arrives or the deadline passes. The ballot states this closure rule before submission.
6. The organizer sees named progress and an honest result. A tie, missing response, decline or no universal overlap stays visible. The organizer must acknowledge any exception and independently check unknown venue hours before finalizing.
7. **Share final plan** opens the common user-controlled share chooser with a read-only final link. In-app notices are durable; enabled email is retried idempotently, and provider acceptance is never labeled delivery.

This walkthrough describes implemented source and tested JSX behavior. It is not a claim of a browser-rendered or real-phone acceptance test.

Detailed staged activation and permission boundaries: [Group planning activation](./group-planning-activation.md).
