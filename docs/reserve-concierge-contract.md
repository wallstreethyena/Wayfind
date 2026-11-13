# Reserve concierge contract (PR #2416)

Claude is the concierge. Providers are plumbing.

## Lanes
| kind | provider id | when | availability | create |
|---|---|---|---|---|
| instant | `wayfind_direct` | active partner, `booking_mode='instant'` | real slots from `wf_reserve_slots` | `wf_reserve_book` → status `confirmed` |
| request | `wayfind_request` | active partner, `booking_mode='request'` | none (never claimed) | `wf_reserve_request` → status `requested`; restaurant answers on `/reserve/manage/<token>` |
| handoff | `opentable_handoff` | active verified `wf_reserve_platform_links` row | none (never claimed) | not possible: returns `HANDOFF_ONLY` + `/api/reserve/go?...` URL |
| api | `opentable_api` | NEVER selected unless `RESERVE_OPENTABLE_API=on` AND credentials exist (they do not) | throws `NOT_ENABLED` | throws `NOT_ENABLED` |
| none | `none` | everything else | none | `NO_PROVIDER` |

## Provider interface (`lib/reserveProviders/`)
Every provider exports an object with `id`, `kind` and these async methods (all return plain objects, never throw except `opentable_api`):
- `searchAvailability({ placeId, date, partySize })` → `{ ok, verified: boolean, times: string[] | null }` (`times` is `HH:MM`, only when `verified`)
- `createReservation({ placeId, userId, date, time, partySize, guestName, note, phone, phoneConsent, idempotencyKey })` → `{ ok: true, booking }` | `{ ok: false, code, handoffUrl? }`
- `cancelReservation({ bookingId, userId })` → `{ ok, booking? , code? }`
- `modifyReservation(...)` → `{ ok: false, code: "NOT_SUPPORTED" }` until a modify RPC exists (manage = cancel + rebook)
- `getReservation({ bookingId, userId })` → `{ ok, booking? }`

`createProviderRegistry({ repository, env })` → `{ forPlace(placeId) → Promise<provider> }`. All existing handlers (`slots`, `book`, `cancel`, `path`) route through it.

## Concierge endpoint: `POST /api/reserve/concierge`
Same-origin JSON. Signed-in optional (anonymous gets a `signin` card when it would book).

Request:
```json
{ "messages": [{ "role": "user", "content": "Book Wayfind Test Kitchen tomorrow around 7 for four" }],
  "context": { "placeId": "optional place the user is looking at" },
  "state":   { "placeId": null, "date": null, "time": null, "partySize": null } }
```
Response (`ok: true` always unless a 4xx input error):
```json
{ "ok": true,
  "say": "I found 6:45 PM, 7:00 PM and 7:15 PM for 4 tomorrow at Wayfind Test Kitchen. Which one?",
  "state": { "placeId": "wf-test-kitchen", "restaurantName": "Wayfind Test Kitchen", "lane": "instant", "date": "2026-11-14", "time": "19:00", "partySize": 4 },
  "missing": [],
  "card": { "type": "times", "date": "2026-11-14", "partySize": 4, "options": [{ "time": "18:45", "label": "6:45 PM" }] },
  "profile": { "hasName": true, "hasPhone": true, "display": "Gabriel P." } }
```
`card.type` is one of:
- `times` — real open times (instant only). User taps one → client POSTs `/api/reserve/book` `{ placeId, date, time, partySize, idempotencyKey }` (profile fills name/phone server side).
- `request` — `{ date, time, partySize }`; button "Send request" → same `/api/reserve/book` call; server routes to `wf_reserve_request`.
- `handoff` — `{ url: "/api/reserve/go?placeId=..&date=..&time=..&party=..", label: "Open <name> on OpenTable", sentTime }`. Never says booked.
- `profile` — `{ needs: ["name"] }`; client shows first/last name (+ optional mobile) and a "Save for future bookings" checkbox, PUTs `/api/reserve/profile` when checked, then resends the turn.
- `signin` — the user must sign in to book on Wayfind.
- `choose` — `{ restaurants: [{ placeId, name, address }] }` (ambiguous name).
- `alternatives` — `{ picks }` from `findTables` when the restaurant is full or has no provider.
- `null` — just a question (missing date/time/party) or a final message.

Rules:
- The model only EXTRACTS intent (`restaurant`, `again`, `date`, `time`, `partySize`, `note`). It never sees name, phone, email, user id, booking ids or tokens; it gets `profile` booleans only.
- Every availability or booking sentence in `say` is written by the server from database results. The model's text is used only to ask for missing information.
- "it", "again", "same place" → the user's most recent booking (`listAllUserBookings`), reusing its party size and time unless the user gives new ones.
- Booking happens ONLY from a structured user tap posting to `/api/reserve/book`, never from model output.
- Degraded (AI blocked, breaker open, unparseable) → deterministic parser fallback, still `ok: true`.

## Booked card (client)
`Booked. Wayfind Test Kitchen, Friday at 7:15 PM for 4.` + confirmation code, Add to itinerary, Directions, Add to calendar, Cancel. Request: `Request sent to <name> for Friday at 7:15 PM for 4. We'll show their answer in My reservations.`

## Manage (restaurant)
`POST /api/reserve/manage` `{ token, bookingId, action: "accept" | "decline", reason? }` → `wf_reserve_respond_request`. `GET` lists `requested` rows too.
