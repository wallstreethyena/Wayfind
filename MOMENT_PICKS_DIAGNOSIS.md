# Moment/experience picks — Phase 0 diagnosis

Branch `moment-picks-integrity-2026-07`. Diagnosis only — one inert
telemetry line added (`moment_open_diag`), no behavior change. Confirmed by
code trace + a live curl of production `/api/moment/picks`.

## Entry-path matrix (every way a moment/experience view opens)

| Entry path | Fn called | Render surface | Candidate source | Radius fetched | Visible-list clamp |
|---|---|---|---|---|---|
| Badge chip on a place card (home / saved / itinerary / shared / detail / experience) — `onBadge={openExperience}` | `openExperience(key)` | Experience screen (`Experience.js`) | fresh `searchPlaces` into `expPlaces` | `exp.radius` or 17mi → widens to **60mi** | **`expMi` (default 17mi)** |
| ✨ mood modal → "Let's Wayfind it" (`Intro.js:122`) | `openExperience(key)` | **same Experience screen** | same | same | same |
| Surprise screen / Detail sheet / "all experiences" sheet / deep link `?exp=` / search hit | `openExperience(key)` | same | same | same | same |
| Natural-language "feeling" search (`home.js:5090`) | `openMoment(feel)` | HookDetail sheet (`HookDetail.js`) | `placesForHook` → its own fetch effect | `radiusOverride` or **110000m (~68mi)** | **`hkMi` (default 17mi)** |
| "Perfect right now" block on the Experience screen | `momentPicks` effect (`home.js:3800`) | inline card | top 12 open-now of **`expPlaces`** (POSTed to `/api/moment/picks`) | inherits Experience fetch | none (uses `expPlaces` directly) |

**Critical correction to the assumed model:** the chip path and the mood
modal are NOT two different code paths — both call `openExperience` and
render the *same* Experience screen. So "same intent, different results"
is a **state/timing** divergence on top of a systematic display bug, not
two parallel implementations. But candidate acquisition + scope IS
duplicated three ways (Experience effect, HookDetail effect, momentPicks
effect), each with its own radius and clamp — which is the structural
reason "same intent" cannot guarantee "same candidates."

## Confirmed findings

1. **The empty-state copy is false (systematic, every location).**
   `Experience.js:90` hardcodes "Nothing matched within 60 miles", but
   `Experience.js:11` clamps the visible `list` to `expMi` (default
   **17mi**). The Experience effect *fetches* to 60mi into `expPlaces`, then
   the render throws away everything beyond 17mi. At a sparse market like
   Parrish, an indoor intent (`cozyindoor`: museums, cafés, aquariums —
   Google returns them 25–35mi out in St. Pete/Tampa) fetches real places,
   clamps them all away, and renders "Nothing matched within 60 miles."
   Nothing ever *displayed* 60 miles; the copy lies about the searched
   scope. `HookDetail.js:33` has the identical 17mi clamp (`hkMi`).

2. **"0 curated picks · Tap any to see full details" instructs tapping at
   zero** (`Experience.js:53`) — renders even when `list.length === 0`.

3. **`/api/moment/picks` has no input validation (confirmed live).**
   `POST {}` → `200 {"picks":[]}`; `POST {"intent":"cozy-indoor-day",...}`
   (wrong id) → `200 {"picks":[]}`. A malformed request, an unknown intent
   id, or client/server id drift is indistinguishable from a legitimate
   "no matches" — exactly how this degraded silently.

4. **The 21-vs-0 divergence** (mood modal shows 21 incl. 30mi Dalí; a card
   chip shows 0, same intent/location/minute) is the state/timing layer:
   for the same `openExperience("cozyindoor")`, one render shows the
   fetched wide results and the other renders a stale/pre-clamp `expPlaces`
   or an adopted in-flight run (`home.js:4281` adopts a prior run when
   center moved <3km; `expPlaces` is only nulled inside `openExperience`).
   The new `moment_open_diag` telemetry (fetched / kept / radiusMi /
   clampMi / within17) will pin the exact trigger on the owner's device —
   but the FIX is the same regardless: one resolver, no arbitrary 17mi
   clamp on a moment view, honest scope copy, loud API.

## Secondary issues (triaged per spec)

- **Food → Dinner near a small town renders "Nothing here right now."**
  Same class: the category/experience view clamps its fetched pool to the
  17mi default, so Ellenton/Bradenton dinner options 10–15 min out that the
  fetch found are hidden. **Same root cause → fixed by Phase 1's resolver +
  Phase 3's honest scope.**
- **"Could not find this venue" toast when selecting "Parrish, FL, USA"
  from autocomplete.** A city was routed through a venue/place-detail code
  path. **Separate root cause (search-autocomplete area/establishment
  disambiguation) — belongs to the v5.50 audit remediation prompt's search
  scope, filed here, NOT fixed in this branch.**
- **Price `$$$$` + "Moderate" mismatch, CSP-report spam** — the spec
  explicitly assigns these to the audit prompt; not touched here.

## Event-detail regressions (separate track, from PR #67/#68 — owner-reported)

Not moment-picks scope, but real and mine; filed to fix separately:
"Open in Wayfind" on the event page only returns to /events (relabel to
"Back to all events" or hide); "Get tickets" on the Florida Railroad
Museum train ride opened Expedia (likely a Stay22 LinkSwap rewrite hitting
the wrong link, or the venue-detail hotel CTA); "The Market at Waterside"
internal event URL gave "Safari can't open the page" (staple id embeds a
date — the live tapped date likely isn't in the current `generateStaples`
window, so `resolveEventById` 404s); the "green theme" on open (tapped the
venue → place detail sheet, colored by category).

## Diagnosis (one paragraph, before Phase 1)

Every moment/experience view opens through `openExperience` into one
Experience screen (the mood modal included — not a separate path), which
correctly fetches candidates out to 60 miles but then renders a list
clamped to a 17-mile default (`expMi`), while the empty state hardcodes
"Nothing matched within 60 miles." At a sparse location an indoor intent
fetches real museums/cafés 25–35 miles out, clamps every one of them away,
and prints a scope claim that is simply false — and because
`/api/moment/picks` returns `200 {picks:[]}` for malformed or
unknown-intent input with no validation, an id drift or a client bug is
rendered identically to "nothing nearby." The 21-vs-0 split between the
modal and a card chip is a state/timing artifact (stale or adopted
`expPlaces`) layered on that systematic clamp+copy bug. The fix the spec
prescribes is right: one intent-scoped resolver that every entry path uses
and that fetches when the loaded pool lacks coverage, an empty state that
only renders after a real full-scope search and states the scope it
actually searched, and an API that rejects malformed input with 400
against a shared intent-id module. Proceeding to Phase 1 on that basis;
the dinner-near-small-town case rides along on the same fix, and the
city-as-venue toast + price + CSP items are filed to the audit prompt as
out of scope here.
