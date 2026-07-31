# KIMI queue — product decisions waiting on an owner call

Questions that engineering **deliberately did not answer**, because answering them would
have meant making a product decision inside a technical PR.

**Format:** newest first. Each entry states the question, what is true today, why it was
not decided in-flight, and what unblocks. When an entry is answered, record the decision
and who made it, then strike it — do not delete the history; a queue with no record of
past answers gets the same question re-asked.

---

## 5. Deals registry follow-through (Clipp geo-gating, coupon patch, Uber Eats, CJ quick wins)

**Question:** What is the ship order for the revenue layers that are live but broken or misapplied?

**Decision (Kim, 2026-07-30):** Fix geo-relevance and deploy blockers before expanding the deals layer. Do not grow Clipp to restaurant detail sheets until a Sarasota/Bradenton card cannot render for an Orlando visitor.

**What is true today:**
- Clipp is live in production (PR #474) and Tampa/Orlando markets are now registered (PR #517 merged).
- Geo-gating is still missing: Sarasota/Bradenton cards can still render for Orlando visitors until the filter ships.
- The coupon-menu visual patch is unapplied.
- Uber Eats is rendering plain untracked URLs (`eats_out` = 0 non-owner clicks in 14 days).
- CityPASS and TicketSmarter are active CJ advertisers but unwired.
- `NEXT_PUBLIC_BOOK_IT` is set but not yet deployed.

**Ship order (by money-per-hour-of-work):**
1. **~~Close server-side provider-redirect capture gap.~~ DONE.** `/api/commerce/go`, `/api/viator/go`, and `/api/eats/go` now emit `provider_redirect_started`/`failed` server-side. Guard: `scripts/check-provider-redirects.mjs`.
2. Deploy the BOOK_IT env change.
3. Set `NEXT_PUBLIC_UBEREATS_TEMPLATE`.
4. Apply the coupon-menu visual patch.
5. Detail-sheet CTA ladder (cafe → Directions, hotel → Check rates).
6. Clipp geo-gating — then, and only then, expansion to restaurant detail sheets.

**Execution:**
- `Kim` (done): server-side provider-redirect capture + `scripts/check-provider-redirects.mjs`.
- `GWEN`: location-gating logic, Uber Eats template, CityPASS/TicketSmarter CJ wiring.
- `claude.exe`: coupon-menu patch deploy, Clipp card UI/UX, placement on surfaces.
- `DEEPSEEK`: per-merchant Clipp matching in cuisine shortlist (after gating fix).

**Status:** Awaiting execution by owning lanes.

---

## 4. Guide Factory targets

**Status:** PR #501 merged 2026-07-31. 20 ranked targets selected, each with a monetizable terminal today. Next: LLAMA writes the guides; Search Console data from Wave 1 validates the per-guide traffic/conversion assumption before scaling to the 5,000-guide denominator.

---

## 3. Navigation feel: app-like vs editorial

**Question:** What should Wayfind's navigation feel like, and is "app-like" the right premium direction?

**Decision (Kim, 2026-07-30):** Adopt the v8 floating frosted dock as canonical, but make it **editorial-first, not fake-native-app-first.** Reduce bottom nav from 6 items to 4: Home, Map, Saved, Explore. Fold Events, Coupons, and the former experiences chooser into Explore.

**Rationale:** Real traffic enters from Google guides with intent already formed. The homepage is secondary. A persistent dock is good; fake-native gestures and hidden chrome are bad for first-time visitors. Editorial content needs navigation that elevates it.

**Execution:**
- `claude.exe`: frosted dock, merge Favorites + Itinerary into Saved, wire Home/Map/Saved.
- `DEEPSEEK`: own Explore — Events, Coupons, experiences/occasions tile set.
- `LLAMA`: ensure editorial guides surface cleanly inside Explore.

**Status:** Awaiting execution by owning lanes.

---

## 2. ~~The converted experiences chooser needs an entry point~~

**Question:** Where does the experiences/occasions chooser open from, and does it show `EXPERIENCES` or `INTENTS`?

**Decision (Kim, 2026-07-30):** Delete the converted sheet. Do not wire an entry point.

**Rationale:** The sheet had no reachable setter because there was never a clear user moment for it. Real traffic arrives on guides and detail sheets with intent already formed; the homepage is not the right lever. A styled surface with no door is product debt.

**Resolution:**
- `claude.exe`: remove the chooser component, route, and guard.
- `LLAMA`: fold each experience tile into an existing or new guide page.
- `claude.exe`: rotate top 3–5 experiences through the Surprise/Roulette tile.
- `DEEPSEEK`: fold food-specific experiences into the cuisine chooser's food-tour rail.

**Status:** Decided; awaiting execution.

---

## 1. ~~Should the experiences chooser offer `EXPERIENCES` instead of `INTENTS`?~~

Folded into entry 2 above — answered by deleting the sheet. The tile-set question is moot because the surface itself is removed.
