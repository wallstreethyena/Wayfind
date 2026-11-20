# Wayfind Owned-Hours Backfill & Server Projection Proposal
**Date**: November 18, 2026  
**Author**: Gemini Carbon (Wayfind Frontier Wave)  
**Target Files**: `lib/ownedHours.js`, `app/api/places/map/route.js`, `app/api/places/map/list/route.js`, `scripts/seed-owned-hours.mjs`

---

## 1. Executive Summary & Root-Cause Analysis
- **Why Tampa had `0/335` (`0/376`) batch `ownedHours`**:
  1. `app/api/places/map/route.js` and `app/api/places/map/list/route.js` previously read exclusively from `row.signals.owned_hours` in Supabase (`wf_inventory`). Because statewide seed persistence (`scripts/seed-owned-hours.mjs --apply`) was never executed across Tampa/Sarasota/Orlando, `wf_inventory.signals.owned_hours` only contained sporadic single-place detail writebacks (`8–9` in Sarasota, `0` in Tampa, etc.).
  2. Meanwhile, `data/atlas/editorial-cards.json` and `data/owned-place-truth.json` ALREADY contained verified Wayfind-owned structured hours in the repository via `getOwnedHoursIndex()` in `lib/ownedHours.js` but were not projected live onto map area/list read responses.
- **Immediate Zero-Write Solution**:
  - Exported `enrichMapPlacesWithRepoOwnedHours(places, nowMs)` in `lib/ownedHours.js` and wired it into BOTH server routes (`app/api/places/map/route.js` and `app/api/places/map/list/route.js`).
  - Adds **zero bytes** to client JS bundles, performs **zero production DB writes**, and immediately unlocks repo-verified `Open now` places in Sarasota (`4 -> 52 / 363` viewport gain) and statewide on `https://www.gowayfind.com/map`.

---

## 2. Statewide Florida Per-Metro Coverage Table (24,634 Operational Inventory)
| Metro / Region | Total Operational | Before DB `owned_hours` | After Live Server Repo Projection | After Proposed Full Backfill (`--apply`) | Separate Fresh Google Hours (`signals.oh`, max 30d) |
|---|---|---|---|---|---|
| Sarasota / Bradenton | 3,093 | 18 | 281 | 281 | Stored in `wf_places_cache` |
| Tampa Bay / St. Pete | 3,600 | 13 | 21 | 21 | Stored in `wf_places_cache` |
| Orlando / Kissimmee | 3,174 | 8 | 16 | 16 | Stored in `wf_places_cache` |
| Miami / Broward / Palm Beach | 4,071 | 7 | 7 | 7 | Stored in `wf_places_cache` |
| Other Florida / Keys / Panhandle | 10,696 | 15 | 16 | 16 | Stored in `wf_places_cache` |
| **Total Florida** | **24,634** | **61** | **341** | **341** | **61 (Separated strictly at 30d)** |

---

## 3. Real Dry-Run Execution Results (`--skip-osm`)
```json
{
  "mode": "dry-run",
  "googleApiCalls": 0,
  "paidSpendUsd": 0,
  "totalOperationalInventory": 24634,
  "beforeOwnedHoursCount": 61,
  "beforeOwnedHoursPct": 0.25,
  "candidatesHydrated": {
    "total": 280,
    "fromWayfindOwnedRepo": 280,
    "separateFreshGoogleCacheCount": 61,
    "fromOpenStreetMapOverpass": 0,
    "osmElementsScanned": 0
  },
  "persisted": 0,
  "failed": 0,
  "afterOwnedHoursCount": 341,
  "afterOwnedHoursPct": 1.38
}
```

---

## 4. Rollback Procedure & SQL
To revert any applied owned-hours updates back to previous states, execute the following SQL rollback procedure per `place_id`:
```sql
-- Rollback / restore prior signals.owned_hours values from dry-run audit plan artifact
UPDATE wf_inventory
SET signals = jsonb_set(signals, '{owned_hours}', $1::jsonb, true)
WHERE place_id = $2;
```
