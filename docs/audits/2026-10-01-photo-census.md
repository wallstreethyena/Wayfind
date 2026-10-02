# Photo census and October budget check (2026-10-01)

Scope: every place photo a public surface renders, measured on production. Both crawls are **probe-only** (`x-wayfind-photo-probe: 1`), so they can never take a ledger grant or call Google.

- **Coverage crawl** (`scripts/photo-coverage-crawl.mjs`): what `/api/photo` would serve.
- **Decode census:** also follows each served photo to its final bytes and decodes it with `sharp`. A non-empty URL, a HEAD response or an HTTP 200 HTML page does not count as a photo.

Unique places are counted separately from appearances: one place on six surfaces is one problem and six appearances.

## Baseline (09:17–10:15 UTC, 22 published cities, 25 surfaces)

| Class | Unique places | Appearances |
|---|---|---|
| Decodes (real image) | 2,444 | 9,982 |
| Rejected or expired image response | 12 | 216 |
| Not cached: needs a ledger-gated fetch | 21 | 34 |
| No photo field (hotels without a place identity) | 69 | 76 |
| **Total** | **2,546** | **10,308** |

Breakfast and Best of the Best (announcement priority):
- **Breakfast rails, 14 published Florida cities:** 166 of 167 card appearances decode. The gap is Mademoiselle Paris (Anna Maria Island), which needs a fetch.
- **"Best of the Best Food":** 168 of 168 decode.

## Root causes and what was done

| Class | Cause | Repair | Result |
|---|---|---|---|
| Dead same-place cache rows (Ringling, Siesta Beach, Bayfront Park, Siegfried's, Riverwalk; 178 appearances) | Google withdrew the photo. The cached rented URI answers 403 everywhere. The existing liveness rules evict a row once it is due (validated more than 3 h ago). | No code change: the locked design worked. Verified by re-probing. | **Ringling and Siesta Beach** now serve their licensed free photos (identity checked visually: Ringling's museum facade, Siesta's white sand). **Bayfront, Riverwalk and Siegfried's** are evicted and now need a fetch. |
| Dead rented URI stored in `wf_inventory.photo_url` (Club Vault, Munchie's, The Twisted Tonic) | The inventory rung of `/api/photo` served that URI without probing it, so the card's same-place fallback got the same dead URI back. | **#1620** (`4ade04b`): a Google-hosted inventory URI is probed and skipped if dead. | Live: the fallback now resolves the place's own photo ref (needs a fetch) instead of replaying the dead URI. |
| External partner/event images (SamBoat ×3, Halloween on Central) | Crawler user agent only. | None needed. | All decode with browser headers. |
| Hotels with no place identity (69) | By design: no identity means the branded fallback. | The existing `WAYFIND_HOTEL_IDENTITY` backfill (on) resolves identities over time. | Honest fallback; no fabricated photo. |
| Not cached (21 → 27 after the moves above) | The photo was never fetched, or its row was evicted. | The existing ledger-gated path: reader requests and photo-warm. | **Still uncached at the 11:35 UTC re-check.** See the budget section. |

No photo was generated, borrowed from another place, stock-substituted, or stripped of its credit. No place was removed or down-ranked. Ranking was checked: 60 of 60 Breakfast, Eat and Best of the Best rails are identical in order and score before and after the release.

## October budget: what is verified and what is not

**Verified:**
- **Unit:** every photo cap counts **requests** (ledger grants, one per Google photo media call), not dollars (`lib/spendGate.js`).
- **Approved limit:** **3,000 grants per month**, owner-approved on 2026-09-15 and restored on 2026-09-23 after an unauthorized raise to 7,000 (`docs/proposals/photo-cap-audit-2026-09-23.md`).
- **Period:** the ledger month is the **UTC** calendar month. It rolled over at **2026-10-01 00:00 UTC** (Sep 30 8 pm ET). The quota circuit breaker is TTL-based (next Pacific midnight + 60 s, at most 25 h), so a September trip had expired by about 07:01 UTC on Oct 1.
- **Monitoring bug:** `/api/health/photos` keyed the ledger by the **Eastern** date. For the first 4 UTC hours of every month it reported last month's exhausted row. **Fixed in this PR** (`ledgerMonth()`, `test-ledger-month`).

**Not verified (blocked):**
- **The configured cap is unreadable.** `GOOGLE_PHOTOS_MONTH_CAP`, `WAYFIND_PHOTOS_PAID` and `WAYFIND_GATE` are Vercel "sensitive" variables. `GOOGLE_PHOTOS_MONTH_CAP` was **last changed 2026-09-28 19:48 UTC, and no PR records an approval for that change**. Under the 2026-09-23 rule, an unrecorded change must be treated as unauthorized until the owner confirms its value.
- **Usage and remaining allowance are unknown.** The Supabase connector is not authorized in this session, and direct ledger reads were refused. The `/api/health/photos` report needs `CRON_SECRET`.
- **Repairs have not visibly resumed.** The 21 uncached photos were still uncached at the 11:35 UTC re-check, about 11.5 hours after the rollover and roughly 46 photo-warm runs later. The cause cannot be determined without the ledger or pulse rows. Possibilities: the gate is shut, paid photos are off, the cap is reached under an unknown value, or warm is pausing.
- **This session triggered no paid fetch**, because the configured cap could not be confirmed to be within the approved 3,000.

**Owner actions to unblock:**
1. Confirm `GOOGLE_PHOTOS_MONTH_CAP` equals the approved 3000, or record a new approval in a PR.
2. Read `/api/health/photos` with `CRON_SECRET` (now month-correct), or authorize the Supabase connector, to see October used/remaining and the last photo-warm pulse.

## Notes on the measurement

- **54 endpoint fetch errors in the baseline crawl are not broken pages:**
  - 32 are Hawaii cities, where the Florida-only family-day, hotel and landing surfaces answer 400/404.
  - 22 are `/eat/<city>` and `/culture/<city>` probes. Those routes are keyed by metro (`/eat/tampa-bay`), so the crawler requests URLs the site never links to.
  - The four real category pages (`/things-to-do`, `/restaurants`, `/beaches`, `/nightlife`) answer 200.
- **Cape San Blas fix (also in this PR).** The independent audit of #1616 found that its Panhandle band read Cape San Blas (Gulf County, Eastern) as Central. The boundary moves from −85.35 to −85.38:
  - Mexico Beach stays Central.
  - Port St. Joe and Cape San Blas are Eastern.
  - Inland Jackson and Calhoun counties (Central in fact) still read Eastern, as before #1616; this is recorded as a known limit.
- **Accepted tradeoff in #1620.** The inventory rung's liveness probe is not age-gated (inventory rows carry no validation stamp). On a CDN miss it adds one HEAD to `lh3`, capped at 2.5 s. A timeout serves the URI as before. The 302 is CDN-cached for 3 h.
