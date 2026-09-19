# Florida premium photography

## Current implementation

The paid Florida landing uses the existing reviewed Key West photograph by Lisa Davidson, sourced from Unsplash. Its local optimized WebP, location, alt text, original source and license are recorded in `lib/guideHero.js`. The hero and its destination link refer to Key West. The image is eagerly loaded; the page remains readable if it fails.

## Account connection status, September 19, 2026

- Adobe: a connector was offered for installation/sign-in. Connection has not been confirmed. Its advertised capability includes Creative Cloud assets; this does not establish Adobe Stock search or licensing access.
- iStock: no direct connector was available in the current catalog. No account access or API entitlement has been verified.
- Unsplash: existing licensed local images are usable now. No membership or API account has been connected. Unsplash+ and the public Unsplash API are separate access paths.

## Bringing licensed images into the site

Use original downloaded files from the owner's Adobe Stock, iStock or Unsplash account, accompanied by the asset page and license/download record. Keep private account and receipt details outside the public repository. Record the public source, photographer, provider, asset identifier, permitted use, true location and focal point alongside the image's existing guideHero record. Optimize a local derivative; keep the original in the owner's asset library. Review desktop and phone crops before publishing.

Select genuine Florida photography with a recognizable setting, strong natural light and room for headline copy. A scenic image can illustrate a destination; it must not stand in for a different named venue or attraction. Do not ship watermarked previews. Do not automatically spend subscription credits or license paid assets without identifying the selection and entitlement first.

For the next hero selection: Key West palms and water, a Gulf Coast sunset, or a clear Florida spring. Prefer an original at least 2400px wide, with a usable 2:1 desktop crop and a separate portrait crop. The current 1600px image is suitable for the preview but a higher-resolution licensed original is preferable for large displays.

## Optional direct API integration

A membership alone is not evidence of API access. Establish API entitlement and intended workflow before adding credentials or backend integration. Keep provider secrets server-side. Search and preview are separate from licensing/downloading; do not license on page views. For Unsplash API use, follow its hotlinking, attribution and download-tracking requirements rather than reusing the local-file workflow above.

Official references:
- Adobe Stock licensing: https://developer.adobe.com/stock/docs/getting-started/apps/06-licensing-assets
- Adobe Stock API access: https://developer.adobe.com/stock/docs/faq/
- Getty Images API: https://github.com/gettyimages/gettyimages-api
- Unsplash API: https://unsplash.com/documentation
- Unsplash+ license: https://unsplash.com/plus/license
