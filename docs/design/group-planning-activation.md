# Group planning activation sequence

Updated 2026-10-05. This is an operator proposal, not a receipt that production was changed.

## Exact database boundary

The release integrator normalized the final blank line of `supabase/migrations/20261004232233_wf_group_planning.sql`; the candidate's exact SHA-256 is `2adb9c859541b728e0ce3155f39f0a788f54e467364eccbbfdecdf308b0552fd`. Recheck against the final published revision before approval. Do not apply the older archive's bytes. The new migration adds three private RLS tables and six service-role-only functions. It creates no public grants or provider credentials, and sends no messages.

Use the existing canonical `node scripts/apply-migration.mjs supabase/migrations/20261004232233_wf_group_planning.sql` from an authorized, already credentialed checkout. The runner requires its management token and reconciliation URL/service-role credentials, checks committed whole-file identity, records the hash and result, and runs reconciliation in the same operation. No such credentials are available in this cloud shell. Do not paste secrets into chat, decrypt production secrets into this workspace, or substitute connector SQL for this rule. The owner can run the command or enable task access to their connected computer so its existing setup can be inspected. Missing existing credentials still require the supported secure setup, not a fabricated receipt.

Draft PR/source and flags-off preview publication can proceed for review. Production migration reconciliation must pass before merging/deploying the unchanged candidate. Turning UI flags off does not waive the production migration ledger expectation.

## Verify hidden worker first

1. Review/apply the exact schema and obtain its canonical receipt. Verify hosted RLS, role grants, owner isolation, concurrent CAS and unique outbox behavior with approved synthetic test records.
2. Deploy the reviewed source with `NEXT_PUBLIC_GROUP_PLANS_ENABLED=0`, `WF_GROUP_PLANS_ENABLED=0`, both email flags off and `WF_GROUP_PLAN_CLEANUP_ENABLED=0`.
3. Explicitly enable only `WF_GROUP_PLAN_WORKER_ENABLED=1`. This lets the authenticated cron run without enabling public create/read/preview. It still requires the existing CRON_SECRET and server-only database credentials. No new credential or broader account permission is created.
4. Proposed schedule: `/api/cron/group-plans` every five minutes (`*/5 * * * *`). It gives an approximate five-minute offline-notice cadence, not a hard delivery guarantee. Reads settle expired plans immediately. One-minute cadence would mean 43,200 invocations per 30 days; five-minute cadence means 8,640; fifteen minutes means 2,880 with correspondingly later offline notices. Five minutes is the recommended balance, subject to current spend/plan approval. Existing function usage and email quotas apply; it is not represented as free.
5. Verify a real authenticated tick and its due-plan result. The route has a 60-second ceiling; every database/provider fetch shares a 45-second abort budget. A timed-out row is unconfirmed/failed, unattempted rows are deferred, and next ticks resume idempotently. At most 50 due plans and 3 email notices are considered per invocation. A full batch or deferred work is not called complete.
6. Only then acknowledge `WF_GROUP_PLAN_DEADLINE_WORKER_READY=1` and complete browser/device acceptance before enabling both public/server flags in a new deployment.

## Optional email remains part of the release

Read-only Resend checks confirmed gowayfind.com is verified for sending, with verified DKIM/SPF/MX and tracking off. At inspection there were 99 daily and 2,373 monthly messages remaining. A recently delivered operational alert corroborates the existing sender, but no exact self-test organizer recipient has been approved or verified for this feature.

Before enabling `WF_GROUP_PLAN_EMAIL_VERIFIED=1` and `WF_GROUP_PLAN_EMAIL_ENABLED=1`, approve one exact verified organizer recipient and one test completion notice. Test only that notice through the actual existing provider configuration, then verify provider delivery, inbox receipt and the authenticated result link. Do not enable the general queue processor just to send a test: it may claim other eligible notices. No-send tests and a text preview remain available while recipient approval is pending. Provider acceptance alone is not delivery.

Public email opt-in must not be described as available until its channel passes this test. If rollout is staged, preserve the email requirement as pending; do not silently replace it with in-app-only completion.

## Permanent cleanup is separate

`WF_GROUP_PLAN_CLEANUP_ENABLED` is absent/off by default. Deadline and email activation do not call cleanup. The existing prepared cleanup function, if separately approved and enabled, permanently deletes up to 500 expired group plans and their cascading notices per run, plus up to 500 rate-limit records older than two days. Plans expire at up to 120 days. No new production group data currently exists, but future deletion remains a separate owner decision. Never enable this flag merely to make the worker green.

## Narrow verification

The worker-only change has 205 service/API assertions and 42 notification assertions. Its 50-row fixture exercises actual service behavior with an abort-aware network seam: the first stalled request aborts, 49 rows defer, then a healthy retry closes exactly 50 and creates exactly 50 notices. Removing the shared deadline makes the elapsed-budget assertion fail. Mutations enabling public access or default cleanup are also rejected. These are local injected tests, not a hosted 60-second latency or real-message receipt.

Official reference checks: [Vercel cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Functions pricing](https://vercel.com/docs/functions/usage-and-pricing). Actual incremental CPU, memory and account-credit usage remains to be measured; no plan upgrade or spending-cap change is proposed.
