# Meta pixel (Facebook / Instagram ads)

- **Dataset:** "Wayfind Website", pixel id `1424559705968711`, Meta business `681034706429651`,
  ad account `5438739619543785`. Created 2026-10-27 in Events Manager with Conversions API enabled.
- **Code:** `app/components/MetaPixel.js` (loads once from `app/layout.js`) and `lib/metaPixel.js`
  (id resolution + the event bridge). Lock test: `scripts/test-meta-pixel.mjs`.
- **Id:** `DEFAULT_META_PIXEL_ID` in `lib/metaPixel.js`, overridable by `NEXT_PUBLIC_META_PIXEL_ID`
  (`off` disables the pixel entirely). An invalid value falls back to the default so the site can
  never silently detach from the live dataset.
- **Events sent:** PageView (every page, client navigations included), `Lead` on a verified
  affiliate handoff (`partner_click` and the `*_out` events), `ViewContent` on `detail_open`,
  `AddToWishlist` on `save`, `CompleteRegistration` on `signup_completed`. Params go through the
  same `sanitizeParams` as Google (no emails, no free text).
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
