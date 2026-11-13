# Operational Risk & Data Readiness Decision Package for Gabe

> **Lane:** `gemini-carbon (Wayfind Frontier)`  
> **Worktree:** `/Users/gabrielpereira/Projects/wf-carbon-audit` (Branch: `docs/carbon-data-readiness`, Base: `origin/main` = `b19fb15827d4618c7a48b9289abb12c48f23ff3b`)  
> **Timestamp:** `2026-11-13T18:25:24Z` (Strict verifier correction run)  
> **Ownership:** Read-only investigation and single decision document at `docs/proposals/gemini-carbon-data-readiness.md`.

---

## 1. Executive Summary & Single Exact Approval Questions for Gabe

This decision package provides a rigorous, 100% read-only operational risk and data readiness audit across three critical subsystems of the Wayfind platform:
1. **Historical Synthetic Viator Clicks (`offer_id = '1234P5'`):** 3,421 synthetic QA fixture rows accumulated in `public.wf_viator_clicks` due to CI test execution against production DB before the production write firewall (`lib/productionWriteFirewall.js`) was established. A fully transactional, reversible archive SQL script is ready for Gabe's explicit execution approval.
2. **Migration Ledger & Schema Reconciliation:** 15 non-APPLIED migrations classified (6 `PENDING_SAFE`, 1 `DRIFTED`, 1 `REQUIRES_REVIEW`, 2 `SUPERSEDED`, 2 `OBSOLETE`, and 3 `BLOCKED` Undercover Tourist legal hold).
3. **Pre-Firewall Open PR Exposure Matrix:** Analysis of all 31 currently open PRs on `wallstreethyena/Wayfind` showing which PRs were branched pre-firewall (ancestor of `8fb4f47bc119fc413d77aafac6226fd939ce94ad` = `False`) and can still trigger synthetic writes during CI test runs until rebased.

---

### Single Exact Approval Questions

#### [APPROVAL A] Synthetic Viator Clicks Archive & Clean
* **Question for Gabe:** Do you authorize executing the transactional archive-then-delete script [`supabase/data-fixes/20261113_archive_synthetic_viator_clicks.sql`](file:///Users/gabrielpereira/Projects/wf-carbon-audit/supabase/data-fixes/20261113_archive_synthetic_viator_clicks.sql) against production Supabase to move 3,421 synthetic `1234P5` rows into `public.wf_viator_clicks_synthetic_archive` (SHA-256 digest `76d528103fa12c91e082e5654f33d33a1897ce31358d234f3bc3c332197ec568`), leaving 1,168 pristine customer clicks intact?
* **Action:** [ ] **Approve** / [ ] **Reject**

#### [APPROVAL B] Migration Backlog Execution & Ledger Reconciliation
* **Question for Gabe:** Do you authorize executing the 6 `PENDING_SAFE` migrations (`20261021030000`, `20261027120000`, `20261103120000`, `20261105120030`, `20261105120035`, `20261112200000`), reconciling the 5 `OBSOLETE`/`SUPERSEDED`/`DRIFTED` ledger entries, holding `20261015180200` for review, and keeping all 3 `BLOCKED` migrations (including Undercover Tourist / partner items) strictly held unless Gabe explicitly authorizes them?
* **Action:** [ ] **Approve** / [ ] **Reject**

#### [APPROVAL C] Pre-Firewall Open PR Rebase Directive
* **Question for Gabe:** Do you authorize issuing a mandatory rebase directive for all open PRs branching off pre-firewall commits before any further CI test runs or merges are executed?
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

### Exact Rollback SQL (From `supabase/data-fixes/20261113_archive_synthetic_viator_clicks.sql` lines 95-120 / exact schema columns)
```sql
-- Explicit rollback INSERT matching exact live public.wf_viator_clicks columns & archive batch ID filter:
INSERT INTO public.wf_viator_clicks (
  click_token, client_click_id, visitor_context_hash, provider, offer_id, page_key, surface,
  content_id, placement_campaign, attributed_campaign, destination_host, gclid, gbraid, wbraid,
  observed_utm_campaign, verified_google_campaign_id, campaign_metadata_provenance,
  campaign_verification_status, google_campaign_id, consent_ad_user_data, consent_ad_personalization,
  session_attribution, first_touch_attribution, clicked_at, expires_at, redact_after, redacted_at
)
SELECT 
  click_token, client_click_id, visitor_context_hash, provider, offer_id, page_key, surface,
  content_id, placement_campaign, attributed_campaign, destination_host, gclid, gbraid, wbraid,
  observed_utm_campaign, verified_google_campaign_id, campaign_metadata_provenance,
  campaign_verification_status, google_campaign_id, consent_ad_user_data, consent_ad_personalization,
  session_attribution, first_touch_attribution, clicked_at, expires_at, redact_after, redacted_at
FROM public.wf_viator_clicks_synthetic_archive
WHERE archive_batch = '20261113_1234P5_fixture_cleanup'
ON CONFLICT (click_token) DO NOTHING;
```

---

## 3. Section B: Individual Migration Backlog Classification, Execution Order, Preconditions & Rollback Plan

Reconciliation output from `scripts/reconcile-migrations.mjs --json` identified all **15** non-`APPLIED` items across the codebase and live database:

| Version / Filename | Status | Classification Reason & Live Schema State | Recommended Action, Preconditions & Rollback / Reverse Path |
| :--- | :--- | :--- | :--- |
| `20261015180000_wf_inventory_wikidata_coords.sql` | `BLOCKED` | Blocked on legal/counsel Q1 (#1809): Google-corroborated coordinate derivation. | **LEAVE BLOCKED** until counsel Q1 sign-off. Rollback: Drop inventory coordinate columns added by migration. |
| `20261015180100_wf_inventory_official_address_coords_corroborated.sql` | `BLOCKED` | Blocked on legal/counsel Q1 (#1809): Google-corroborated coordinate derivation. | **LEAVE BLOCKED** until counsel Q1 sign-off. Rollback: Drop corroboration fields. |
| `20261015180200_wf_inventory_official_address_coords_uncorroborated.sql` | `REQUIRES_REVIEW` | 97 US Census geocodes without secondary position corroboration; requires manual spot-check before map pin promotion. | Hold for position accuracy review before applying. Rollback: Revert coordinate updates via backup snapshot. |
| `20261021030000_wf_inventory_coords_independent_verified.sql` | `PENDING_SAFE` | 35 Google-free dual-corroborated coordinates (19 Wikidata P625 + 16 US Census geocodes) with full reverse SQL script. | Safe to apply via `scripts/apply-migration.mjs` after owner review. Rollback via `supabase/data-fixes/20261021_wf_inventory_coords_independent_verified_reverse.sql`. |
| `20261027120000_wf_redirect_burst.sql` | `PENDING_SAFE` | Purely additive RLS-locked table + RPC for cross-instance redirect burst limiting; app currently fails open cleanly. | Apply via `scripts/apply-migration.mjs` when SUPABASE_ACCESS_TOKEN is provided. Rollback: `DROP FUNCTION IF EXISTS public.wf_take_redirect_burst(text, timestamptz, integer, integer); DROP TABLE IF EXISTS public.wf_redirect_burst;`. |
| `20261103120000_indigenous_sarasota_closed_permanently.sql` | `PENDING_SAFE` | Single-row transactional closure for permanently closed Indigenous Restaurant (Sarasota) affecting `public.wf_inventory` & `public.wf_place_editorial`. | Apply via `scripts/apply-migration.mjs`. Rollback via `supabase/data-fixes/20261103_indigenous_sarasota_reopen.sql`. |
| `20261105120030_event_truth_held_recheck_guard.sql` | `PENDING_SAFE` | Additive BEFORE INSERT/UPDATE trigger ensuring held future events retain a <=2-day ET recheck deadline. | Apply first (before `120035`) via `scripts/apply-migration.mjs`. Rollback: `DROP TRIGGER IF EXISTS wf_events_held_recheck_guard ON public.wf_events; DROP FUNCTION IF EXISTS public.wf_enforce_held_event_recheck();`. |
| `20261105120035_event_truth_held_recheck_renewal_cap.sql` | `PENDING_SAFE` | Function-only hardening capping due held-event renewals at ET today+2; requires `20261105120030` trigger first. | Apply immediately after `20261105120030`. Rollback: Re-apply prior `public.wf_renew_due_events(integer)` definition from `supabase/migrations/20261015010000_sighting_renewal_queue.sql` (do not drop function). |
| `20261109160000_wf_events_christmas_short_titles.sql` | `OBSOLETE` | Christmas park event short titles already live in `wf_events` (out-of-band write). `WHERE` guards make ledger recording a 0-row no-op. | Safe 0-row ledger reconciliation via `apply-migration.mjs`. Rollback: N/A (0-row no-op ledger insert). |
| `20261109160100_wf_deals_ut_one_day_tickets.sql` | `SUPERSEDED` | Initial UT rows (61-64) exist; row 63 deactivated for row 65; superseded by `20261109210000`. `WHERE NOT EXISTS` makes replay a 0-row no-op. | Record ledger state via `apply-migration.mjs` (0-row no-op; held unless explicitly authorized). Rollback: N/A. |
| `20261109210000_wf_deals_ut_one_day_product_pages.sql` | `OBSOLETE` | All 4 official one-day UT product pages already live in `wf_deals`; missing only schema_migrations ledger entry. | Safe idempotent ledger reconciliation via `apply-migration.mjs` (held unless explicitly authorized). Rollback: N/A. |
| `20261112200000_photo_batch_audit.sql` | `PENDING_SAFE` | Additive table `wf_photo_change_audit` + warning-only audit triggers on photo stores (`#2454`). | Review SQL and apply via canonical `scripts/apply-migration.mjs`. Rollback: `DROP TRIGGER IF EXISTS wf_photo_store_batch_audit ON public.wf_google_photo_store; DROP TRIGGER IF EXISTS wf_place_photo_batch_audit ON public.wf_place_photo; DROP FUNCTION IF EXISTS public.wf_audit_photo_batch(); DROP TABLE IF EXISTS public.wf_photo_change_audit;`. |
| `held-migrations/20261002010000_wf_cc_partner_clicks_exclude_devices.sql` | `BLOCKED` | Command Center partner-click KPI exclusion (`#1627`). Held by owner decision pending CC before/after diff. | Keep held until owner completes KPI/legal review. Rollback: Drop table/function modifications if ever applied. |
| `held-migrations/20261013180000_event_link_repairs_2026_10_13.sql` | `SUPERSEDED` | Superseded by manual writes and `#1760` (`#1740`). | Keep archived in `held-migrations`; never apply. Rollback: N/A. |
| `<production-only>:20261113105510_wf_viator_upload_consent_basis` | `DRIFTED` | Applied in live Supabase schema migrations with no committed canonical SQL on `main` (unmerged branch PR `#2490`). | Merge originating PR `#2490` carrying canonical migration SQL + receipt. Rollback: N/A (already live). |

---

## 4. Section C: Pre-Firewall Open PR Exposure Matrix & Safe Remedies

Between `2026-11-13T16:53Z` and `17:53Z`, coordinator evidence proved that `wf_viator_clicks` `1234P5` rows grew from `3,306` to `3,398` (`+92` rows) while live `https://www.gowayfind.com` wrote `0` on synthetic probes. This proves that **pre-firewall PR branches running `guards` CI workflows with repository secrets can still write synthetic rows during test execution!**

### Complete Open PR Exposure Matrix (`wallstreethyena/Wayfind`) — All 31 Open PRs (Generated from `gh pr list`)
| PR # | Branch Name | Head SHA | Pre-Firewall? (Ancestor = False) | Can CI Trigger Writes? | Safe Remedy |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **2508** | `claude/planner-imessage-santa` | `743dafa3` | **False** (Post-firewall) | No | Safe to run / merge |
| **2502** | `feat/partner-revenue-engine` | `a0347e29` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2499** | `ci/owner-approval-fingerprint` | `c6b95fc1` | **False** (Post-firewall) | No | Safe to run / merge |
| **2498** | `feat/self-healing-truth-engine` | `64957d97` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2494** | `claude/owner-approval-v2` | `9c79bb4b` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2491** | `claude/expected-state-notify-rule` | `6a16ba9f` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2490** | `lane/claude/ad-consent-region-gate` | `539f4476` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` (Carries canonical migration for `20261113105510`) |
| **2478** | `infra/merge-train` | `7c35879c` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2477** | `content/card-lines-batch62` | `99c48c31` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2475** | `fix/known-for-join-clean` | `57a75cc4` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2473** | `fix/guide-sarasota-hours-clean` | `130293ec` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2472** | `fix/guide-tampa-hours-clean` | `1a42a70a` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2471** | `claude/operating-mode-consolidated` | `ae23cb70` | **False** (Post-firewall) | No | Safe to run / merge |
| **2467** | `claude/async-infra-rule` | `c7df4cb2` | **False** (Post-firewall) | No | Safe to run / merge |
| **2458** | `lane/meta-partner-handoff` | `449183c3` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2456** | `fix/owner-approval-carry-forward` | `ce892672` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2452** | `feat/plan-together-discoverable` | `0997ca98` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2442** | `content/card-lines-batch61` | `91a4f2fa` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2433** | `content/card-lines-batch60` | `66a36b6e` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2431** | `content/card-lines-batch59` | `48a47a23` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2422** | `claude/score-independence` | `2ae46c82` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2421** | `claude/home-bundle` | `50cdc389` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2420** | `claude/xmas-dedupe` | `30e3c7e3` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2410** | `fix/forged-referer-continue` | `bc2dc5fe` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2362** | `fix/partner-link-alert-qualified` | `0e10d06a` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2353** | `claude/detail-credit-disclosure` | `36ebbfba` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2232** | `cursor/partners-page-redesign-51e6` | `6c9c49d1` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2176** | `cursor/seo-badge-bestof-7515` | `fa8dbfde` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2175** | `lane/claude-exe/claude-md-db-writes` | `5a2939d2` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2107** | `fix/partner-link-health` | `84c2b3b8` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |
| **2089** | `fix/map-ux-collapsible-and-smooth-loading` | `ee0a07eb` | **True** (Pre-firewall) | Yes | **Mandatory Rebase** on `origin/main` |

---

## 5. Reproducible Read-Only Commands, Timestamps, Hashes & Exit Codes

* **Verification Timestamp:** `2026-11-13T18:25:24.000Z`
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
  # Exit code: 0 (OK — 1 changed file(s), no owner-only files touched)
  ```
