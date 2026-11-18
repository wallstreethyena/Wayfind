# Redirect failures and return visits, audit of 2026-11-01

All numbers are PostHog HogQL over the 30 days ending 2026-11-01 unless noted.

## Outbound redirect failures

`provider_redirect_failed` 30 day total: 2,227. 2,192 of those (98%) are
`crawler-refused`, which is the gate working (largest single source:
`facebookexternalhit` link previews, 237 on Ticketmaster). Since the
2026-10-28 deploy every redirect event carries `traffic_class`; filter
`traffic_class = 'human'` on dashboards.

Non crawler failures, 30 days (35 total):

| provider | reason | n | cause |
|---|---|---|---|
| unknown | unknown-provider | 11 | owner curl QA, offer `curltest`, surface `owner_curl_qa` |
| ticketnetwork | offer-not-found | 8 | WS Game 3 reel link clicked 2026-10-23 03:33 to 12:29 UTC, before the offer commit b5a66af9 deployed (13:40 UTC). Now resolves to the Tropicana Field fallback with the CJ wrapper. |
| viator | no-verified-product | 3 | legacy query links (Gatorland, KSC, Mote) fail closed by design |
| viator | missing-provider-or-offer | 3 | malformed requests, no surface |
| viator | offer-not-found / offer-link-dead | 4 | 124462P1, 105290P10 (already in RETIRED_VIATOR_PINS), 302444P1, d5403-173028P1 (audit) |
| clipp | offer-not-found | 2 | lapsed coupons (Dave and Busters Orlando, Qdoba Apopka) |
| undercover_tourist | offer-not-found | 1 | menu offer 8, MNSSHP, partner page gone 2026-10-28 |
| others | | 3 | verify/audit probes and one missing-url |

Since 2026-10-29: 1 human failure that was not our own QA, against about 950 human redirects started.

## Return visits

| definition | visitors | returning | rate |
|---|---|---|---|
| every person_id with any event | 16,928 | 216 on 2+ days | 1.28% |
| web pageview persons | 9,989 | 132 on 2+ days | 1.32% |
| web, excluding self referred first pageview and headless | 6,011 | 131 on 2+ days | 2.18% |
| same, 2+ sessions | 6,011 | 284 | 4.72% |
| same, US only, 2+ sessions | 5,121 | | 4.92% |

Distortions found:
1. 6,166 "persons" exist only as server events (redirect click ids). They are personless but still carry a person_id; always filter `$lib = 'web'`.
2. 3,978 web persons whose first pageview referrer is www.gowayfind.com: 99% desktop 1920x1080, led by Seychelles (652), Bangladesh, Vietnam, Pakistan, 1 return in 30 days. Traffic exchange or bot traffic. It inflates the denominator by 66%.
3. Only 6 identified persons, so cross device returns are invisible (`person_profiles: identified_only`, identify only on sign in).
4. Facebook and Instagram in app browsers (about 900 visitors) keep separate storage from Safari and Chrome, so a return outside the app counts as new.
5. Safari ITP caps script written storage at 7 days, so iOS returns after a week read as new.
