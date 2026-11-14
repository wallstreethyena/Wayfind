# Share attribution, schema v2

**Cutover: 2026-11-13 (US Eastern).** Code: `lib/shareAttribution.js`. Contract test: `scripts/test-share-attribution.mjs` (in `scripts/guards.txt`).

## Why v1 is retired for attribution

| v1 event | What it actually measured | Use after cutover |
|---|---|---|
| `share_open` | Any page load with `?place=`, `?rail=`, a list or an itinerary in the URL, **including Wayfind's own internal navigation**. In the 30 days before cutover, about 8,557 place landings had `www.gowayfind.com` as the referrer and only about 500 were direct. | Still fires, unchanged, so the series stays comparable with itself. **Not a share and not a recipient.** Do not use it for recipient attribution and do not add it to v2 numbers. |
| `share_return` | "This device once opened some shared card and came back 6h to 7d later." No sender, no link. | Still fires, unchanged. **A guess, unsuitable for attribution.** |
| `share`, `page_share`, `guide_share`, `event_share`, `content_share` | A tap on a share control (various surfaces). | Still fire. Count share *intent* only. |

Never add v1 and v2 counts together, and never compare a v1 rate with a v2 rate across the cutover date.

## v2 events (all carry `share_schema: 2`)

| Event | Fires when | Key properties |
|---|---|---|
| `share_opened` | The sender deliberately opens sharing UI: the share intent sheet, or the share chooser when no sheet opened it. Once per flow. | `surface` (`intent_sheet` / `chooser`), `kind`, `share_token`, `tokenized` |
| `share_attempted` | The sender picks a method in the chooser. | `method`: `sms`, `email`, `native`, `copy` |
| `share_completed` | The method handed off. | `method`, `completion_type`: `clipboard_write` (copy succeeded), `native_resolved` (navigator.share resolved), `native_bridge_shared` (iOS app shell reported shared), `composer_handoff` (Messages or Mail composer opened). **None of these prove a message was sent or delivered.** A cancelled native sheet or a failed copy produces no `share_completed`. |
| `shared_link_visited` | A browser opens a link with a valid token it did not mint itself. | `share_token`, `landing_path` (`place`, `list`, `guide`, `event`, `home`, `page`), `dedupe_rule` |
| `shared_recipient_converted` | That browser fires an existing conversion within the window. | `share_token`, `conversion`, `minutes_since_visit`, `attribution: last_touch`, `window_days: 7` |

## Rules

- **Token.** 128 random bits from `crypto.getRandomValues`, base64url (22 characters), in the `wf_st` query parameter. One token per share flow. No Math.random fallback: no crypto means no token. The token names nothing. No user id, email, name, account id or auth token ever goes into the URL.
- **Where it is added.** Same-origin `https://` share URLs only, after canonicalization. Every other parameter (`?place`, `utm_*`, `fbclid`, `gclid` and the rest, and the hash) is preserved. Private group plan links (`/group-plans/...`) never carry a token, and visits there are not measured, because analytics is suppressed on those pages by design.
- **Consent.** A token is minted only when analytics would be recorded for that browser. That rules out the owner or an internal-marked browser, internal verifiers, bots and webdriver, PostHog opted out, and Global Privacy Control. Otherwise the share proceeds with a plain URL. Sharing never depends on analytics, storage or crypto being available.
- **Visit dedupe.** The first visit per token per browser storage counts. The token is removed from the address bar on arrival with `history.replaceState`, so refreshes, back and forward, re-renders and a recipient copying the address bar cannot recount it. Reopening the original link in the same browser is a duplicate. With blocked storage, dedupe falls back to in-memory for that page.
- **Self-visits.** The sender's browser remembers the tokens it minted (30 days, 100 max) and never counts its own visit.
- **Excluded traffic.** Owner, internal-marked and QA browsers, internal verifier agents, bots and webdriver emit nothing (the existing `analyticsSuppressionReason`). Synthetic QA runs set `wf_test_v1`, which tags every event `is_test: true`. Exclude `is_test = true` in reports.
- **Forwarded links.** The token travels with the link. If a recipient forwards the original message, the next visitor is attributed to the same original token (same share, second generation). If a recipient re-shares through Wayfind's share button, that is a new flow with a new token.
- **/s/ short links.** The token is carried to the destination by `lib/preserveRedirectParams.js` and counted there, not on the 50 ms redirect page.
- **Conversions.** Existing events only: `commerce_cta_clicked` (outbound partner handoff, see `lib/commerce.js`) and `save` (place saved). Last touch wins: the most recent attributed visit in this browser. The window is 7 days from that visit. One conversion per token per conversion type.
- **Distinct browsers are not distinct people.** One person on two devices counts twice. Two people on one browser count once. Private browsing resets dedupe.

## Measurement limitations

- Delivery is never observable. `share_completed` means handed off, not sent.
- Sender and recipient are linked only by the token in PostHog. `shared_link_visited` is linked to the share by `share_token`. Do not assume the order events arrive in equals the order they happened. Use event timestamps.
- Sender events from a browser that later turns out to be the owner's are dropped from the pre-ready queue (existing behavior).
- In-app browsers (Instagram, Facebook) have their own storage, so a recipient who opens the link in Instagram and later in Safari counts as two browsers.
- The Supabase-backed `/api/metrics/share` endpoint reports v1 only and labels it as such. v2 lives in PostHog.

## Key query (PostHog HogQL)

```sql
-- shares that produced at least one qualified recipient visit
SELECT count(DISTINCT properties.share_token)
FROM events
WHERE event = 'shared_link_visited' AND properties.share_schema = 2
  AND coalesce(properties.is_test, false) = false
  AND timestamp >= toDateTime('2026-11-13 05:00:00')
```
