# Meta pixel (Facebook / Instagram ads)

- **Dataset:** "Wayfind Website", pixel id `1424559705968711`, Meta business `681034706429651`,
  ad account `5438739619543785`. Created 2026-10-27 in Events Manager with Conversions API enabled.
- **Code:** `app/components/MetaPixel.js` (loads once from `app/layout.js`) and `lib/metaPixel.js`
  (id resolution + the event bridge). Lock test: `scripts/test-meta-pixel.mjs`.
- **Id:** `DEFAULT_META_PIXEL_ID` in `lib/metaPixel.js`, overridable by `NEXT_PUBLIC_META_PIXEL_ID`
  (`off` disables the pixel entirely). An invalid value falls back to the default so the site can
  never silently detach from the live dataset.
- **Events sent from the browser:** PageView (every page, client navigations included),
  `ViewContent` on `detail_open`, `AddToWishlist` on `save`, `CompleteRegistration` on
  `signup_completed`. Params go through the same `sanitizeParams` as Google (no emails, no free text).
  **Affiliate taps are no longer sent from the browser** (2026-11-12): the old browser `Lead` fired on
  an unverified tap (`tickets_out` etc.), so Meta could be trained on clicks that never reached a partner.
- **The one conversion, `PartnerHandoff` (server, 2026-11-12):** see the section below.
- **Not sent:** anything inside the iOS shell (`isNative()`), group-plan pages, analytics-only
  noise (search, screen_view, impressions).
- **CSP:** `connect.facebook.net` (script), `www.facebook.com` (img + connect).
- A second, unused dataset `1355932256549651` was created by mistake on 2026-10-28; ignore it or
  delete it in Events Manager.

## OutboundTicketClick (2026-10-29)

- **What:** a CUSTOM event, `fbq('trackCustom','OutboundTicketClick',{content_ids:[id],content_type:'event',seller,surface},{eventID})`,
  fired once per accepted `commerce_cta_clicked` whose provider is a TICKET seller (`TICKET_PROVIDERS` in
  lib/campaignAttribution.js: tours, attractions, events, passes; never coupons, stays, food or transfers) (the choke point is `emitCommerce` in `lib/commerce.js`, via the
  `window.__WF_ATTR` bridge from `lib/campaignAttribution.js`). Never Purchase / Lead, no value, no currency, so it
  changes no campaign optimization. Build it as a custom conversion in Ads Manager if you want to optimize for it.
- **Not sent:** suppressed sessions (owner, verifier UAs, bots, native shell, group plans) and any session carrying
  `wf_test=<label>` unless `wf_meta_test=<code>` is also present.
- **CAPI relay (audited 2026-11-15, dormant):** `lib/metaCapi.js buildCapiPayload` + `POST /api/meta/capi` can mirror the event with
  the SAME `event_name` + `event_id`. It needs BOTH the server env `META_CAPI_ACCESS_TOKEN` AND the build-time flag
  `NEXT_PUBLIC_META_CAPI_RELAY=1`; the browser relays only when that flag is `"1"` (`app/components/PostHogProvider.js`). The flag is NOT set in
  production, so delivery is browser-only. The route itself is reachable whatever the flag says, so since 2026-11-15 it goes
  through the same consent gate as PartnerHandoff (`decideConsent()` / `decideQaLane()` in `lib/metaConsent.js`): default blocked even with a
  token, Limited Data Use on any allowed live send, a client-supplied `test_event_code` is always stripped and only the server QA lane can add one.
  Locked in `scripts/test-campaign-attribution.mjs`.
- **What it is NOT:** a browser custom event. It is not deduped with `PartnerHandoff` (different event name, different id), it fires on an
  unverified tap, and it must NEVER be chosen as an optimization event or a custom conversion. Meta's one conversion is `PartnerHandoff`.
  The code is kept (not deleted) as a browser-only diagnostic.
- **Testing:** open `/halloween-in-florida?wf_test=<label>&wf_meta_test=<Events Manager test code>` in a fresh private window,
  tap a ticket button, watch Events Manager > Test Events. `wf_test` tags every PostHog event `is_test=true`.

- **Server-side landing context:** the same-tab ticket links unload the page before PostHog's idle boot can send a
  queued click, so the `/api/*/go` redirect event (which always fires) now carries `landing_campaign`, `landing_source`,
  `landing_medium`, `landing_click_type`, `landing_path`, `first_touch_campaign` and `is_test`/`wf_test`, read from the
  first-party session cookie `wf_attr` written at landing. Click-id VALUES are never stored there, and no route copies
  the cookie into a seller URL. Business reporting: `provider_redirect_started` where `traffic_class = 'human'` and
  `is_test` is not true.
- **Click-id values** (fbclid/gclid/ttclid) live only in the tab-session record; the 90-day first-touch record and the
  `wf_ft_*` super-properties keep only the click TYPE. `landing_*` = this session's landing; first touch only as `first_touch_*`.

## PartnerHandoff: the one Meta conversion (2026-11-12, consent-gated 2026-11-15)

**What it proves.** Wayfind resolved a valid partner destination for a human, non-test visitor and issued a redirect: one of
`/api/{commerce,viator,ticketmaster,stubhub,hotels}/go` emitted `provider_redirect_started` with `traffic_class = human`. It does **not**
prove the partner page loaded, that anything was booked, or that any commission will be paid. Sent by the server
(`lib/metaCapi.js` `relayPartnerHandoff`, hooked in `lib/serverEvents.js` `captureServerInBackground`), so a same-tab navigation cannot lose
it. Lock tests: `scripts/test-meta-partner-handoff.mjs`.

**It is identifying tracking data.** `client_ip_address`, `client_user_agent`, `_fbp` and `_fbc` identify a browser to Meta. `_fbc` can contain
the Facebook click id. `event_id` (`wf_ph_<click_id>`) contains Wayfind's own internal click id. Do not describe this event as
anonymous, as free of click ids, or as something Meta "already knows". Hence the consent gate below.

**Consent gate (default BLOCKED).** There is no approved Meta consent policy. `META_CAPI_CONSENT_POLICY` is read on every send:

| value | behaviour |
|---|---|
| unset, empty, or ANY unrecognized value | `blocked`: nothing is sent, even with a token and Meta cookies |
| `us_no_gpc` | send only when `x-vercel-ip-country` is exactly `US`, the request has no `Sec-GPC: 1`, and the `wf_ad_ctx` cookie holds no ad consent denial. Every event carries Limited Data Use |

Basis labels (also in `meta_capi_result.consent_basis`): `policy_blocked`, `gpc_opt_out`, `consent_denied`, `unknown_region`, `non_us`,
`eligible_us_no_gpc`, `qa_test_lane`. The Google upload basis (`uploadConsentBasis`) is deliberately not reused: it allows any non-EEA country.
Under `us_no_gpc` each event also carries `data_processing_options: ["LDU"]`, `data_processing_options_country: 0`,
`data_processing_options_state: 0` (Meta decides the location). Enabling `us_no_gpc` is a policy decision for the owner, not a code default.

**Exactly what Meta receives**

| field | live lane (`us_no_gpc`) | QA lane |
|---|---|---|
| `event_name` | `PartnerHandoff` | same |
| `event_id` | `wf_ph_<click_id>` (one per click; Meta dedupes a retry) | same |
| `event_time`, `action_source` | seconds, `website` | same |
| `event_source_url` | `https://www.gowayfind.com` + landing path only (no query; `@` or a 7+ digit run falls back to `/`) | same |
| `user_data` | `client_ip_address`, `client_user_agent`, `fbp` and/or `fbc` | same |
| `custom_data` | `content_type: product`, `provider`, `content_ids: [id]`, `surface` | same |
| LDU keys on the event | `data_processing_options ["LDU"]`, `..._country 0`, `..._state 0` | only when the policy is `us_no_gpc` |
| top-level `test_event_code` | **never** | the server env code, always |

`provider`, `surface` and `content_ids` pass a strict token filter: no `@ ? = %`, spaces or slashes; no 7+ digit run in `provider`/`surface`; a
content id is dropped when it is phone-shaped (10+ digits, or purely numeric and 7+ long). Viator codes (`12345P1`), slugs, compound slugs and
Google place ids pass. Never sent: email, phone, name, user or person id, `external_id`, hashes, query strings, the fbclid/gclid VALUE, utm
labels, value or currency. A visitor without `_fbp`/`_fbc` is not sent.

**QA lane.** For checking delivery in Events Manager > Test Events with a real browser. Allowed only when ALL of: the session is marked test
(`is_test` true or a non-empty `wf_test`), env `META_CAPI_TEST_EVENT_CODE` matches `/^TEST\w{1,40}$/`, and the cookie `wf_meta_qa` equals env
`META_CAPI_QA_SECRET` (at least 24 characters, constant-time compare). It still needs a human, valid ids, `_fbp`/`_fbc`, IP and UA. A QA event
always carries `test_event_code`; a live event never does. Meta does NOT drop test-coded events: per its Conversions API docs they also flow into Events Manager and are used for targeting and ads measurement, so the QA lane is only for a maintainer's own browser, never a visitor, and the test code is removed (env unset) after verification; test traffic outside the QA lane is skipped (`test_traffic`).
*Two different QA markers:* the browser `wf_meta_test=<code>` URL param (sessionStorage `wf_meta_test_v1`) only steers the browser-side
`OutboundTicketClick` relay. The server lane ignores any client-supplied code: its code and its secret come only from server env.

**Delivery.** One Graph POST with a 2.5 s bound; never awaited by the redirect (`waitUntil`). Success means the JSON body has
`events_received >= 1`; HTTP 200 alone is not success. Failure classes: `timeout`, `network`, `http_<status>`, `graph_error_<code>`,
`zero_received`, `bad_json`. Auth errors (code 190, HTTP 401/403) never retry. Timeout, network and 5xx get ONE retry with the identical
payload (same `event_id`, same `event_time`). The access token travels only in the POST body and never appears in logs, errors or results.
Each attempt logs one `[meta-capi]` line (outcome, reason, lane, provider, surface, http, received, fbtrace, attempt) with no IP, UA, `_fbp`,
`_fbc`, click id, event id or token, and records a PII-free PostHog `meta_capi_result` event (personless) with the same safe fields plus
`consent_basis`, `ldu`, `attempts`; consent skips are recorded as `outcome = skipped`. The Graph version is `CAPI_VERSION` in
`lib/metaCapi.js`, overridable with `META_GRAPH_VERSION` (`/^v\d{2}\.\d$/`).

**Never sends** (shared suppression, same predicate as PostHog `captureServer` plus stricter checks): `WF_SUPPRESS_ANALYTICS=1`, synthetic monitor
UA, `x-wf-synthetic`, `x-wayfind-qa`, verifier / QA UAs, synthetic cookies, preview, development, build, guard and test processes (only a
`VERCEL_ENV=production` runtime sends).

**Env names.** `META_CAPI_ACCESS_TOKEN` (dormant without it), `META_CAPI_CONSENT_POLICY` (default blocked), `META_CAPI_PARTNER_HANDOFF=off`
(kill switch), `META_CAPI_TEST_EVENT_CODE`, `META_CAPI_QA_SECRET`, `META_GRAPH_VERSION`.

**Rollback / kill.** Fastest: set `META_CAPI_PARTNER_HANDOFF=off` (or remove `META_CAPI_ACCESS_TOKEN`, or set `META_CAPI_CONSENT_POLICY=blocked`) in
Vercel Production and redeploy; the redirect is unaffected. Events already received by Meta are not recalled by this; use Events Manager.
Optimizing a campaign toward the event (only after the policy is approved and delivery verified): create a custom conversion on the custom
event `PartnerHandoff`. Never pick `OutboundTicketClick`.

Funnel and revenue queries: `docs/META_ATTRIBUTION_REPORTING.md`.

**What stays internal (PostHog + Supabase, never Meta)**

| stage | event | where |
|---|---|---|
| landing | `$pageview` + `wf_sess_*` / `wf_ft_*` super properties (utm_*, click TYPE, landing path) | PostHog |
| place / event viewed | `detail_open` (Meta gets only `ViewContent` with sanitized params) | PostHog |
| partner tap | `commerce_cta_clicked` with `landing_*` incl. `landing_content` (ad id) / `landing_term` (ad set id) | PostHog |
| verified handoff | `provider_redirect_started` (`provider`, `click_id`, `traffic_class`, `landing_*`) | PostHog |
| provider click token | `wf_viator_clicks` (click token, `session_attribution` with utm_*), Travelpayouts sub_id map | Supabase |
| revenue | `wf_viator_booking_events` (commission by `click_token`) | Supabase |

**Ad identity.** Meta ads must carry URL parameters
`utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`
(Ads Manager > ad > Tracking > URL parameters). Landing captures them; `wf_attr` carries
`landing_campaign` / `landing_term` / `landing_content` to the server redirect event. An ad without them
is still identified as Meta paid (`landing_click_type = fbclid`) but not WHICH ad.

**Reports.** Dated cohort funnel and revenue-by-ad SQL (PostHog HogQL and Supabase) live in `docs/META_ATTRIBUTION_REPORTING.md`. Only Viator
has per-ad revenue attribution; other providers do not.
