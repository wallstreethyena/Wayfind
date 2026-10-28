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
