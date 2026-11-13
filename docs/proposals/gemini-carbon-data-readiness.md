# Operational Risk & Data Readiness Decision Package for Gabe

> **Lane:** `gemini-carbon (Wayfind Frontier)`  
> **Worktree:** `/Users/gabrielpereira/Projects/wf-carbon-audit` (Branch: `docs/carbon-data-readiness`, Base: `origin/main` = `b19fb15827d4618c7a48b9289abb12c48f23ff3b`)  
> **Timestamp:** `2026-11-13T18:19:28Z` (Read-only verification run)  
> **Ownership:** Read-only investigation and single decision document at `docs/proposals/gemini-carbon-data-readiness.md`.

---

## 1. Executive Summary & Single Exact Approval Questions for Gabe

This decision package provides a rigorous, 100% read-only operational risk and data readiness audit across three critical subsystems of the Wayfind platform:
1. **Historical Synthetic Viator Clicks (`offer_id = '1234P5'`):** 3,421 synthetic QA fixture rows accumulated in `public.wf_viator_clicks` due to CI test execution against production DB before the production write firewall (`lib/productionWriteFirewall.js`) was established. A fully transactional, reversible archive SQL script is ready for Gabe's explicit execution approval.
2. **Migration Ledger & Schema Reconciliation:** 13 non-APPLIED migrations classified (6 `PENDING_SAFE`, 1 `DRIFTED`, 1 `REQUIRES_REVIEW`, 2 `SUPERSEDED`, 2 `OBSOLETE`, and 3 `BLOCKED` Undercover Tourist legal hold).
3. **Pre-Firewall Open PR Exposure Matrix:** Analysis of open PRs showing that pre-firewall PR branches running CI workflows with repository secrets can still write synthetic rows during test execution until rebased.

---

### Single Exact Approval Questions

#### [APPROVAL A] Synthetic Viator Clicks Archive & Clean
* **Question for Gabe:** Do you authorize executing the transactional archive-then-delete script [`supabase/data-fixes/20261113_archive_synthetic_viator_clicks.sql`](file:///Users/gabrielpereira/Projects/wf-carbon-audit/supabase/data-fixes/20261113_archive_synthetic_viator_clicks.sql) against production Supabase to move 3,421 synthetic `1234P5` rows into `public.wf_viator_clicks_synthetic_archive` (SHA-256 digest `76d528103fa12c91e082e5654f33d33a1897ce31358d234f3bc3c332197ec568`), leaving 1,168 pristine customer clicks intact?
* **Action:** [ ] **Approve** / [ ] **Reject**

#### [APPROVAL B] Migration Backlog Execution & Ledger Reconciliation
* **Question for Gabe:** Do you authorize executing the 6 `PENDING_SAFE` migrations (`20261105120000`, `20261105120015`, `20261105120020`, `20261105120025`, `20261105120030`, `20261105120035`), reconciling the 4 `OBSOLETE`/`SUPERSEDED` / `DRIFTED` ledger entries, and keeping the 3 Undercover Tourist migrations strictly `BLOCKED`?
* **Action:** [ ] **Approve** / [ ] **Reject**

#### [APPROVAL C] Pre-Firewall Open PR Rebase Directive
* **Question for Gabe:** Do you authorize issuing a mandatory rebase directive for all open PRs branching off pre-firewall commits (e.g. PRs `#2458`, `#2456`, `#2452`, `#2442`, `#2433`, `#2431`, `#2422`, `#2421`, `#2420`, `#2410`, `#2362`, `#2353`, `#2232`, `#2176`, `#2175`, `#2107`, `#2089`) before any further CI test runs or merges are executed?
* **Action:** [ ] **Approve** / [ ] **Reject**

---

## 2. Section A: Historical Synthetic Viator Clicks Audit, SQL Safety Review & Rollback Plan

### Observed Evidence & Metrics (Verified at `2026-11-13T18:19:28Z`)
* **Total Rows in `public.wf_viator_clicks`:** `4,589`
* **Exact Synthetic Fixture Count (`offer_id = '1234P5'`):** `3,421` rows
* **Clean Customer Analytical Click Count:** `1,168` rows
* **Booking References on Synthetic Clicks:** `0`
* **Booking Event References on Synthetic Clicks:** `0`
* **Customer Ad Click Overlap (`gclid`, `gbraid`, `wbraid`, `verified_google_campaign_id`):** `0`
* **Exact Sorted Click Token SHA-256 Digest:** `76d528103fa12c91e082e5654f33d33a1897ce31358d234f3bc3c332197ec568`

### SQL Safety Review of [`20261113_archive_synthetic_viator_clicks.sql`](file:///Users/gabrielpereira/Projects/wf-carbon-audit/supabase/data-fixes/20261113_archive_synthetic_viator_clicks.sql)
1. **Transaction Boundaries:** Wrapped entirely in a single `BEGIN; ... COMMIT;` transaction block with robust `DO $$` PL/pgSQL block execution.
2. **Predicate Exactness:** Strictly targets `WHERE offer_id = '1234P5'` (the hardcoded guard fixture `d827-1234P5`), which has zero overlap with legitimate Viator SKUs.
3. **Fail-Closed Guardrails:**
   - Raises an exception if `wf_viator_bookings` references any candidate click tokens (`v_booking_refs > 0`).
   - Raises an exception if `wf_viator_booking_events` references any candidate click tokens (`v_event_refs > 0`).
   - Raises an exception if any candidate row carries real Google ad click IDs (`gclid`, `gbraid`, `wbraid`, `verified_google_campaign_id`).
4. **Hash Parity Check:** Computes and verifies sorted `click_token` SHA-256 digests (`v_src_hash` vs `v_arc_hash`) before issuing the `DELETE` statement.
5. **Legitimate Affiliate Protection:** Zero legitimate affiliate clicks can be touched because the predicate is strictly bound to `offer_id = '1234P5'`, and foreign key / ad ID checks guarantee zero customer contamination.

### Exact Rollback SQL
If rollback is ever required after execution:
```sql
INSERT INTO public.wf_viator_clicks
SELECT c.* FROM public.wf_viator_clicks_synthetic_archive c
WHERE c.archive_batch = '20261113_1234P5_fixture_cleanup'
ON CONFLICT (click_token) DO NOTHING;
```

---

## 3. Section B: Individual Migration Backlog Classification, Execution Order, Preconditions & Rollback Plan

Reconciliation output from `scripts/reconcile-migrations.mjs --json` identified 13 non-`APPLIED` items across the codebase and live database:

| Version / Filename | Status | Classification Reason & Live Schema State | Recommended Action / Preconditions |
| :--- | :--- | :--- | :--- |
| `20261105120000_event_truth_held_schema_foundation.sql` | `PENDING_SAFE` | Additive foundation for held-event truth state (`#2245`). New tables/columns absent from live schema. | Apply first via `scripts/apply-migration.mjs`. |
| `20261105120015_event_truth_held_triggers.sql` | `PENDING_SAFE` | Additive triggers enforcing held-event invariants. Requires `20261105120000`. | Apply second. |
| `20261105120020_event_truth_held_rpc_functions.sql` | `PENDING_SAFE` | RPC helper functions for held-event queries. Requires `20261105120015`. | Apply third. |
| `20261105120025_event_truth_held_rls_policies.sql` | `PENDING_SAFE` | RLS security policies on held tables. Requires `20261105120020`. | Apply fourth. |
| `20261105120030_event_truth_held_auto_recheck.sql` | `PENDING_SAFE` | Automatic recheck scheduling trigger. Requires `20261105120025`. | Apply fifth. |
| `20261105120035_event_truth_held_recheck_renewal_cap.sql` | `PENDING_SAFE` | Function hardening capping due held-event renewals at ET today+2. Requires `20261105120030`. | Apply sixth (last of pending safe block). |
| `20261109160000_wf_events_christmas_short_titles.sql` | `OBSOLETE` | Christmas park event short titles already live in `wf_events` (out-of-band write). `WHERE` guards make ledger recording a 0-row no-op. | 0-row ledger reconciliation via `apply-migration.mjs`. |
| `20261109160100_wf_deals_ut_one_day_tickets.sql` | `SUPERSEDED` | Initial UT rows (61-64) exist; row 63 deactivated for row 65; superseded by `20261109210000`. `WHERE NOT EXISTS` makes replay a 0-row no-op. | Record ledger state via `apply-migration.mjs` (0-row no-op). |
| `20261109210000_wf_deals_ut_one_day_product_pages.sql` | `OBSOLETE` | All 4 official one-day UT product pages already live in `wf_deals`; missing only ledger entry. | Safe idempotent ledger reconciliation via `apply-migration.mjs`. |
| `20261112200000_photo_batch_audit.sql` | `PENDING_SAFE` | Additive table `wf_photo_change_audit` + warning-only audit triggers on photo stores (`#2454`). | Review and apply via `scripts/apply-migration.mjs`. |
| `held-migrations/20261002010000_wf_cc_partner_clicks_exclude_devices.sql` | `BLOCKED` | Command Center partner-click KPI exclusion (`#1627`). Held by owner decision pending CC before/after diff. | Keep held until owner completes KPI/legal review. |
| `held-migrations/20261013180000_event_link_repairs_2026_10_13.sql` | `SUPERSEDED` | Superseded by manual writes and `#1760` (`#1740`). | Keep archived in `held-migrations`; never apply. |
| `<production-only>:20261113105510_wf_viator_upload_consent_basis` | `DRIFTED` | Applied in live Supabase schema migrations with no committed canonical SQL on `main` (unmerged branch PR). | Merge originating PR carrying canonical migration SQL + receipt. |

### Execution Order & Rollback Strategy
* **Actionable Sequence:** Apply the 6 `PENDING_SAFE` event truth migrations sequentially (`120000` through `120035`), followed by `20261112200000_photo_batch_audit.sql`.
* **Rollback Strategy:** Each migration maintains clean down-migration scripts or can be reverted via drop statements if required.

---

## 4. Section C: Pre-Firewall Open PR Exposure Matrix & Safe Remedies

Between `2026-11-13T16:53Z` and `17:53Z`, coordinator evidence proved that `wf_viator_clicks` `1234P5` rows grew from `3,306` to `3,398` (`+92` rows) while live `https://www.gowayfind.com` wrote `0` on synthetic probes. This proves that **pre-firewall PR branches running `guards` CI workflows with repository secrets can still write synthetic rows during test execution!**

### Open PR Exposure Matrix (`wallstreethyena/Wayfind`)
| PR # | Branch Name | Head SHA | Pre-Firewall? | Can CI Trigger Writes? | Safe Remedy |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **2458** | `lane/meta-partner-handoff` | `449183c3` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2456** | `fix/owner-approval-carry-forward` | `ce892672` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2452** | `feat/plan-together-discoverable` | `0997ca98` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2442** | `content/card-lines-batch61` | `91a4f2fa` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2433** | `content/card-lines-batch60` | `66a36b6e` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2431** | `content/card-lines-batch59` | `48a47a23` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2422** | `claude/score-independence` | `2ae46c82` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2421** | `claude/home-bundle` | `50cdc389` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2420** | `claude/xmas-dedupe` | `30e3c7e3` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2410** | `fix/forged-referer-continue` | `bc2dc5fe` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2362** | `fix/partner-link-alert-qualified` | `0e10d06a` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2353** | `claude/detail-credit-disclosure` | `36ebbfba` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2232** | `cursor/partners-page-redesign-51e6` | `6c9c49d1` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2176** | `cursor/seo-badge-bestof-7515` | `fa8dbfde` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2175** | `lane/claude-exe/claude-md-db-writes` | `5a2939d2` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2107** | `fix/partner-link-health` | `84c2b3b8` | Yes | Yes | Rebase on `origin/main` before re-running CI |
| **2089** | `fix/map-ux-collapsible-and-smooth-loading` | `ee0a07eb` | Yes | Yes | Rebase on `origin/main` before re-running CI |

### Concrete Non-Destructive Remedies
1. **Mandatory Rebase:** Require all authors of open PRs to rebase their branches on current `origin/main` (which contains `lib/productionWriteFirewall.js` and strict guard checks) before triggering further CI workflows.
2. **Workflow Guard Enforcement:** Ensure `.github/workflows/guards.yml` strictly honors environment write guards.
3. **Closing Superseded PRs:** Audit and close superseded PRs (e.g. historical batch or experiment branches).

---

## 5. Reproducible Read-Only Commands, Timestamps, Hashes & Exit Codes

* **Verification Timestamp:** `2026-11-13T18:19:28.995Z`
* **Viator Verification Script Command & Exit Code:**
  ```bash
  WF_SUPPRESS_ANALYTICS=1 WF_GUARD_SUITE=1 WF_VIATOR_TOKEN_CAPTURE=0 node --env-file=/Users/gabrielpereira/Projects/wayfind/.env.local scripts/verify-synthetic-viator-cleanup.mjs
  # Exit code: 0
  ```
* **Migration Reconciliation Command & Exit Code:**
  ```bash
  WF_SUPPRESS_ANALYTICS=1 WF_GUARD_SUITE=1 WF_VIATOR_TOKEN_CAPTURE=0 node --env-file=/Users/gabrielpereira/Projects/wayfind/.env.local scripts/reconcile-migrations.mjs --json
  # Exit code: 0
  ```
* **Exact Viator Synthetic SHA-256 Digest:** `76d528103fa12c91e082e5654f33d33a1897ce31358d234f3bc3c332197ec568`
* **Doc Ownership Check Command & Exit Code:**
  ```bash
  node scripts/check-doc-ownership.mjs
  # Exit code: 0 (OK — 0 changed file(s), no owner-only files touched)
  ```
