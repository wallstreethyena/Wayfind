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
- **CAPI:** no Conversions API sender existed in this repo. `lib/metaCapi.js` + `POST /api/meta/capi` can mirror the same
  event with the SAME `event_name` + `event_id` (Meta dedupes on that pair). It is dormant: it needs the server env
  `META_CAPI_ACCESS_TOKEN` AND the build flag `NEXT_PUBLIC_META_CAPI_RELAY=1`. Until both are set, delivery is browser only.
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

## PartnerHandoff: the one Meta conversion (2026-11-12)

**Definition.** A human, non-test visitor was actually handed to a revenue partner: one of
`/api/{commerce,viator,ticketmaster,stubhub,hotels}/go` resolved a partner destination and emitted
`provider_redirect_started` with `traffic_class = human`. Failed, refused, crawler, prefetch, verifier
and `wf_test` traffic never qualify. Sent by the server (`lib/metaCapi.js` `relayPartnerHandoff`, hooked
in `lib/serverEvents.js` `captureServerInBackground`, the choke point all five routes already use), so a
same-tab navigation cannot lose it. Lock test: `scripts/test-meta-partner-handoff.mjs`.

**Exactly what Meta receives**

| field | value |
|---|---|
| `event_name` | `PartnerHandoff` |
| `event_id` | `wf_ph_<click_id>` (one per click; Meta dedupes a retry) |
| `event_time`, `action_source` | seconds, `website` |
| `event_source_url` | `https://www.gowayfind.com` + landing path (never a query string) |
| `user_data` | `client_ip_address`, `client_user_agent`, and Meta's own `_fbp` / `_fbc` cookies |
| `custom_data` | `content_type: product`, `provider`, `content_ids: [our place/offer id]`, `surface` |

Never sent: email, phone, name, user or person id, `external_id`, any hash, any query string, the
fbclid/gclid VALUE, utm labels, value or currency. Only sent when the browser already carries `_fbp` or
`_fbc` (Meta already knows it); a visitor Meta has never seen is not introduced to Meta by this event.

**Switches.** Dormant until `META_CAPI_ACCESS_TOKEN` is set in Vercel Production (Events Manager >
dataset "Wayfind Website" > Settings > Conversions API > generate access token). `META_CAPI_PARTNER_HANDOFF=off`
turns only this event off. `META_CAPI_TEST_EVENT_CODE=<code>` sends every event to Events Manager > Test
Events while verifying; remove it afterwards. Optimizing a campaign toward it: create a custom conversion
on the custom event `PartnerHandoff` in Events Manager, then pick it as the ad set's conversion event.

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

**Report: which Meta campaign / ad set / ad produced partner handoffs (PostHog SQL)**

```sql
SELECT properties.landing_campaign AS campaign_id,
       properties.landing_term     AS adset_id,
       properties.landing_content  AS ad_id,
       properties.provider         AS provider,
       count()                     AS handoffs,
       uniq(properties.click_id)   AS unique_clicks
FROM events
WHERE event = 'provider_redirect_started'
  AND timestamp >= now() - INTERVAL 30 DAY
  AND properties.traffic_class = 'human'
  AND coalesce(toString(properties.is_test), '') != 'true'
  AND (properties.landing_click_type = 'fbclid' OR properties.landing_source IN ('meta','facebook','fb','instagram','ig'))
GROUP BY campaign_id, adset_id, ad_id, provider
ORDER BY handoffs DESC
```

**Revenue by Meta ad (Supabase, Viator today; read only)**

```sql
SELECT c.session_attribution->>'utm_campaign' AS campaign_id,
       c.session_attribution->>'utm_term'     AS adset_id,
       c.session_attribution->>'utm_content'  AS ad_id,
       count(DISTINCT b.booking_ref)          AS bookings,
       sum(coalesce(b.confirmed_commission, b.estimated_commission)) AS commission
FROM wf_viator_booking_events b
JOIN wf_viator_clicks c ON c.click_token = b.click_token
WHERE c.session_attribution->>'utm_source' IN ('meta','facebook','fb','instagram','ig')
GROUP BY 1, 2, 3
ORDER BY commission DESC NULLS LAST;
```
