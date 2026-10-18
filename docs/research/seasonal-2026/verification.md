# Verification record

Feature checks run on October 18, 2026, based on main `53b62665fe3033cb6ca70ea9cf2318f743edea34` before rebasing onto the subsequently published Apple map recovery change. The PR's CI checks are the release evidence for the combined revision.

- Full local suite: **925/925 guards plus one credentialed rerun passed**, 620.1 seconds.
- Production `next build`: **passed** with the repository's documented public build placeholders.
- Bundle check: **488.5 KB gzip total**, under the **498 KB** budget; route chunk **0.6 KB**, under **175 KB**.
- JSX check: passed.
- Required shared card browser guard: **4,671 assertions passed**. Actual viewport widths 320, 360, 390, 768, 900, 1440 and 1920; the 340px mutation correctly failed. The non-required-flag version also passed inside the full suite with 4,670 assertions.
- Christmas media browser guard: **312 assertions passed**, including missing, failed, undecodable and successful photos.
- Halloween E2E: **three tests passed** at 390×844, 768px and 1440px. Actual cards were 336.28×268, 440×268 and 440×268. Event and venue paging reached 25 unique records each; dates, scores and source controls remained inside the cards.
- Christmas research/browse checks: **1,265 assertions passed**; card/credit check **27 passed**. Exact-date browsing excludes select-date venues without a verified calendar; the real Oasis December 25 case was rejected while its December season listing remained available.
- Live fall registry check: **102 assertions passed** with the project's active public read key. Application fixtures retained their documented placeholder configuration. No service-role credentials were used.
- Expanded owned-inventory request: **HTTP 200**, 269 requested IDs, 254 returned rows, **3,212 ms** within the existing 3,500 ms deadline. All 191 catalog venue identities were present in a separate exact-ID read. Runtime gates admitted 188 distinct venues.

The initial browser installation lacked the guard's stress-test fonts. The same card failures were reproduced on unchanged main, then resolved by supplying the actual Freefont/Liberation fonts locally. No card sizing rule or guard threshold was weakened. A genuine new mobile source-chip overflow was separately fixed using compact date copy and existing card slots.

Astra reviewed the catalog's exact identity joins, source samples, separate seasonal windows, expired offerings, duplicate handling and exact-date filtering. The 50-per-area research goal remains unmet. This record does not claim a production deployment; that must be established from the merged revision and live checks.
