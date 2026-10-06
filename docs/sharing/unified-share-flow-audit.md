# Unified text-first share flow audit

Date: 2026-10-04. Local branch: `feat/unified-sharing-group-plans-2026-10-04`.
This change has not been deployed. The public group-planning flag remains an explicit rollout gate.

## Contract

1. `lib/shareFlow.js::openShareFlow` opens the existing dark/orange intent menu. `Just share it` remains first and primary. `I’m asking someone out` remains next. `Organize a group` follows it only for a concrete place ID and `NEXT_PUBLIC_GROUP_PLANS_ENABLED === '1'`.
2. Plain shares and date invites both call `lib/shareOut.js`, which mounts an explicit text-first chooser synchronously. Text message is the orange primary choice, followed by Email, optional More share options, explicit Copy, and Cancel.
3. Text message and Email are recipient-free composer links. The user chooses the recipient and presses Send in that app. Opening the chooser, choosing a composer, and a native-share resolution never prove SMS delivery. No automatic sends occur.
4. More share options invokes the common native transport from its own fresh tap. Browser `navigator.share` runs synchronously before any activation-consuming clipboard call. Capacitor keeps its native plugin route. Native cancellation does not launch a second composer or copy a link. A genuine native refusal reopens visible choices.
5. Clipboard writes occur only after explicit Copy. A failure remains visible, keeps alternate options open, and never fires a success callback. The copy fallback checks `execCommand('copy') === true`.
6. The shared flow, chooser transport and native transport normalize relative, localhost and preview links through the existing canonical production-origin policy. Invalid schemes or embedded credentials fail visibly before a composer is opened. Query and fragment capabilities are preserved.
7. `lib/shareContext.js` validates concrete place IDs, builds the gated group route, and supplies the synchronous callback context that keeps existing shell callbacks from nesting a second intent menu.

## Share family census

| Family | Entry | Shared transport |
| --- | --- | --- |
| Home place cards, hero hooks, rails, holidays, lists, coupons and ticket/deal links | Existing `shareLink` adapter, or existing `askShareIntent` followed by that adapter | `openShareFlow` / `shareOut` |
| Place-detail sheet and lunch challenge | Existing context callback; the place share already asks intent | Same shell adapter; date-intent callback context prevents nested menus |
| Generic destination/guide/culture/event/collection share controls | `ShareButton` | `openShareFlow` |
| Place-card store floor, including pre-hydration queued Share | `cardActions.shareCard` | `openShareFlow`, concrete place ID included |
| Non-place content cards | `contentCardActions.share` | `openShareFlow`; arbitrary content IDs do not become place IDs |
| Trending and qualified-intent place cards | Existing `askShareIntent` | `shareOut` inside the selected intent |
| Trending, qualified intent, date-night, night-out and family page headers | Existing page button | `openShareFlow` |
| Best-beaches ranking | Existing page button | `openShareFlow` |
| Creator page | `CreatorShareButton` | `openShareFlow` |
| Sponsored place action floor | Canonical place-card actions | `cardActions.shareCard` |
| Sponsored full-page quiet action | Existing quiet Share control | `openShareFlow`; page share does not invent a place identity |
| Exploding-nearby trend | Existing Share button | `openShareFlow` |
| Unwired DaypartRail `/v8` fallback | Existing callback | `openShareFlow`; its old silent copy and unearned success state are removed |
| Date-invite recipient reply | Existing Tell button | `shareOut` with explicit text-only mode, retaining authored reply text and showing options/copy feedback |

## Essential exceptions

- AskClient’s user-selected **image-card export** remains file-based: `navigator.canShare({ files })`, then `navigator.share({ files })`, or the existing image/download view fallback. It is an image export, not a text-share transport. Cancellation remains inert. Native/device export behavior still needs device QA; this pass does not claim new production evidence for it.
- `home.copyCouponCode` is an explicitly requested **coupon-code copy**, not a Share action. It remains separate. It is the only direct `navigator.clipboard.writeText` caller outside the explicit share chooser.
- Ordinary contact/removal/privacy `mailto:` links are contact actions, not share controls. `dateInvite.smsHref` remains a pure tested encoder; it no longer independently navigates from the share-intent sheet.

## Preview and group readiness

The intent menu’s optional place preview uses the existing `/api/og/hero?kind=place&id=...&t=...&loc=...` route. It does not supply a photo URL, photoRef, rating, invented claim, or immutable-cache override. `lib/heroSource.js` remains authoritative for identity-keyed licensed real photography; `lib/heroCard.js` supplies the existing honest typographic fallback. A failed preview image is removed while all actions stay usable.

The group action closes the menu before navigating to `/group-plans/new?place=<id>&name=<optional-name>`. The place ID is required. The name is a bounded display hint; downstream authoritative place lookup belongs to the group-plan route. The menu does not promise a live/deployed feature merely because local code exists. Disabled, absent, or non-`1` rollout configuration hides the action.

## Recipient OG coverage versus transport

Transport unification does not make every destination photographic. These are the actual remaining renderer families:

- Concrete `/p/[id]` and durable `/places/[id]` destinations both emit `/api/og/hero?kind=place&id=...`. The shell’s richer `placeShareUrl` retains its title/category/city context. Bare `/p` links now recover a server-held name through the existing read-only inventory adapter in opt-in fresh-only mode; a fresh, matching, non-excluded inventory identity outranks untrusted `t=`. The query is bounded and never calls a paid provider. If no fresh identity is available, the existing caller-title/neutral fallback remains.
- Photo-led hero rendering is conditional on `heroSource` finding the exact place’s licensed identity-keyed photo. The established branded typographic fallback remains honest when no verified photo exists. The transport cannot create or guarantee a photograph.
- The eleven intent destinations (`best-of`, `budget`, `date-night`, `family`, `hidden-gems`, `nearby`, `quick-bite`, `seasonal`, `tonight`, `trending-now`, `worth-the-drive`) still emit `/api/og/intent`. That renderer explicitly ignores historical `img=` inputs and renders the existing branded intent typography.
- Beach ranking `/best-beaches/[metro]` uses `/api/og/beaches` and its branded ranking typography.
- Snapshot lists use versioned `/api/og/<slug>` and `snapshotModel`; ordinary `/l/<key>` uses `listModel` or existing finished static artwork. They have not been migrated to identity-keyed hero photos.
- All 19 registered rail identities use `/api/og/rail` to composite the exact existing poster artwork, with branded typography if poster bytes are unavailable. A poster is not a claim that a new licensed real venue photograph was selected.
- Coupons `/c` use `/api/og/coupon` for verified deal-number-oriented branded typography. This pass keeps that card as the URL preview rather than fetching and sharing a PNG before the user’s tap can reach a composer.
- Date invitations `/ask` deliberately use `/api/og?kind=invite`, which does not reveal the place or outing in the preview. The recipient’s optional dated PNG export remains the explicit image-export exception.

Accuracy risk retained for compatibility: `/p` caller-supplied rating/review/category/score/location/hook query fields still reach legacy metadata and hero fallback inputs. Fresh server identity now protects the name when available; this pass does not claim those remaining query facts have been independently verified. Wider fact canonicalization and any list/intent/date-art redesign require a separate scoped decision.

## Measurement semantics

The shell retains existing per-share hooks and single credit deduplication. Credit is associated with an explicit composer selection, successful explicit copy, or completed native handoff. It measures a share interaction, never delivery. The native app-rating high-point hook stays confined to successful native completion. Merely opening the menu or chooser earns no share-completion credit.

## Regression protection and local evidence

- `scripts/test-place-share-metadata.mjs`: real metadata declaration and read adapter controls for bare-place name recovery, exact identity/freshness, missing configuration/read errors, bounded no-paid reads and a subprocess mutation that restores the original missing-title defect.
- `scripts/test-unified-share-flow.mjs`: runtime positive/negative controls for feature gating, concrete ID validation, action order, close-before-navigation, identity-safe preview, text-first choice order/style, no automatic copy/share, fresh native activation, native cancellation/refusal, failed copy, text-only reply, and source-family fuses.
- Existing `test-share-out-chooser`, `check-guide-share`, `check-date-invite`, `check-card-actions`, `check-destination-share`, `test-beaches-page`, `check-rail-share`, and `check-fall-share` stay wired and green locally. Old implementation-specific assertions now follow the common policy while their user-visible invariants remain enforced.
- Two applied mutations prove the new protection can fail: making rollout default enabled, and adding a direct text `navigator.share` caller outside the shared policy. Each returns nonzero; restoring the source returns green.
- No remote push, PR, deployment, paid request, credential change, or production data write was performed. Integrated local production builds have passed; the prepared-milestone receipt records exact source and bundle results. Production smoke, browser geometry, iOS/Android composer checks, and hosted endpoint readiness remain integration/release verification gates.
