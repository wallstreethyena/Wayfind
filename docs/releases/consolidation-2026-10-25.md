# Consolidated release, October 25, 2026

Base reviewed: `1855b5b48fc420e897778ccfaf14f0021a08d39e`. All 29 open source PRs accounted for. Source branches are preserved.

This release does not execute migrations, repair files, paid Atlas calls, or change production credentials. Required CI and owner gates remain in place.

| Source PR | Exact reviewed head | Result |
|---|---|---|
| #1657 | `28c2fe7d58ccda368a4c6c87a7e09b7c65e8d004` | Integrated with current main and overlapping changes preserved. |
| #1668 | `b1b334442b9ac35a61ee6f30ed6fb776e5576491` | Superseded by #1701; stronger share routing retained. |
| #1669 | `bbf8d07d559ff2eafd5845bcce0fa6794837a109` | Superseded by #1701; unknown price and sorting retained. |
| #1670 | `c3611613943ed7840689b99bd19bcb0bab819576` | Superseded by #1701; staff-note scrub retained. Deleted ScoreExplanation component was not resurrected. |
| #1696 | `620c60679bb17ad8a2600ab2ff75e75f46529987` | Integrated with current main and overlapping changes preserved. |
| #1701 | `1145a601e1655630ca57c68ba697777b29143fcf` | Share/price/editorial fixes integrated preserving newer DateNightRails distance policy and current consumers. |
| #1722 | `c927e9e53094521480034953de9cdcbceba58a9a` | Integrated with current main and overlapping changes preserved. |
| #1732 | `806d083aa8c8bfe93f93d5c528cbb559a2bf3e57` | Seven seasonal venues rechecked October 25; exact historical schedules retained, Fear Fest Oct9–11 history completed. Newer current cache inputs preserved. |
| #1735 | `5f65fa2b029791d45f31bfbfe063fbf0bf3febd0` | Superseded by current main applied migration receipts. Historical applied SQL hashes and current pending ledger retained; no replay. |
| #1739 | `cbe0bae81f8dfa4a5dd92e2a36650d56a8af1da7` | Proposal SQL and mock-only pilot retained. No paid activation, production calls or SQL application. |
| #1752 | `d5e09f66492cf704e32cc8aa5c42dfe2e348e9c1` | Latest gated watcher integrated; pending heartbeat migration recorded only. No SQL applied. |
| #1758 | `989ce98cadc634ed854090e2cee69911e525aac0` | Net expansion over already merged #1751 baseline; latest corrected data and validator retained. |
| #1759 | `63a9e9c881238ea108b4b9304f1f6ef846578f89` | Hub commits e8515733 and 63a9e9c8 only; stale inherited anchor data excluded in favor of #1758. |
| #1760 | `a63775d30abec8e145ad14325dc2d31e9e46b837` | Tip a63775d3 repair files/tests only. No fixes executed; newest #1752 workflow gates preserved. |
| #1767 | `7e7b23fe772bd858aad7fb60c68a69210972cb80` | Null-coordinate truth retained; newer current map validation, Florida filtering, JSX cache recording and cache version preserved. |
| #1771 | `ad40e9f64eb8972efff66f5681ff6ae228511874` | Tip ad40e9f6 findings/tests only; newest #1752 workflow gates preserved. |
| #1813 | `2ec9ab1f6600539c35096aa53334d66d13adccd8` | Integrated with current main and overlapping changes preserved. |
| #1824 | `6a786d248bc2560e3e32acab3ccfa41aabf920b1` | Integrated with current main and overlapping changes preserved. |
| #1861 | `954797d462ee7b6512fd4336e4dfe999ea486185` | Integrated with current main and overlapping changes preserved. |
| #1878 | `0a828787122337bbc02132d1b6d9a0d4cd1d82e3` | Integrated with current main and overlapping changes preserved. |
| #1903 | `8fc2f02d2da2927da11d0be5979c56043f835017` | Integrated with current main and overlapping changes preserved. |
| #1909 | `c61d4a4bae01a9acaeb64e343daded01d5e993ff` | Integrated with current main and overlapping changes preserved. |
| #1910 | `f2fd558b439114750434a99d046b8d8ca23fa745` | Inconclusive pulse semantics combined with #1903 shallow-link reporting. |
| #1911 | `7cf78d28e872ab6ef9bccbca80765b9b3d3fe60f` | Offer corrections retained; newer owner resale approval comment preserved. |
| #1914 | `b8818a226008d1342a809f4db18b2a8860886076` | Licensed credits and research attribution integrated with #1878; already-tracked URLs retain disclosure without double wrapping. |
| #1923 | `0e24cabb56708a0dcb80c2e3ca22c575ebe4c12b` | Already on main: test NODE_ENV selected before importing React. Current explanatory comment retained. |
| #1930 | `8bfa5e6bddbcceccafcd1360df86d52ebf3cdca6` | Integrated with current main and overlapping changes preserved. |
| #1952 | `a9373d67ffaa2c6d90565850a8727e6db744286d` | Geometry integrated with mandatory place-card gate invoking the hermetic header test and copying its evidence. Latest source head only merges main 1855b5b4, already preserved here. |
| #1953 | `25fad1dcc31c8286010b752684148e48222fd6e4` | Already merged into current main as 1855b5b4. Mobile fit preserved. Exemption replaced by explicit mandatory --require-browser CI step and hermetic test; no exemption added. |

## Verification

Required: full registered guard suite, JSX check, production build and bundle ratchet, mandatory rendered CI checks. Outcomes are recorded in the replacement PR; preparation is not a passing result.

## Retained safeguards

Current applied migration receipts and SQL bytes are unchanged. Atlas remains disabled unless separately configured; the pilot rejects non-mock execution. The anchor repair workflow requires main, production-data reviewers, exact expected values, audit and rollback. Maps retain coordinate validity and Florida relevance. Displayed scores and photo TTL policy are unchanged.

The consolidated Fall rail epoch is `v41`, retiring cached snapshots that predate the newly reviewed menus and licensed credits.

Atlas integration checks retain the current main budget-gate pulse and freeze the reviewed combined web-lane source. The pilot still rejects an altered frozen configuration and still forbids paid execution. Focused mock tests pass: web lane 119 assertions and pilot 153 assertions.

The client Halloween place-id mirror includes the two newly reviewed Halloween venues. Ticket fallback checks cover both raw and pretracked Ticketmaster attribution while preserving direct non-Ticketmaster organizer links.
