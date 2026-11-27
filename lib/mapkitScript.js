// lib/mapkitScript.js — how to recognise Apple's MapKit JS scripts.
//
// WAYFIND-1M (2026-11-27): "SyntaxError: Unexpected token '{'", 20 events since
// Nov 3, latest on iPhone Mobile Safari 16.3 on an event page. The only frame
// was MapKit's own library file (app:///mk/6.1.205/libs/mapkit.core.user-location
// .ab2fb6.js line 2): MapKit JS 6 uses syntax Safari before 16.4 cannot parse,
// so the library fails to load and the map can never start there. Not our code
// and not fixable in our code, but two things are ours: the reader should get
// the map fallback at once instead of after the 15s watchdog
// (lib/appleMapsRuntime.js), and Sentry should not page the owner for it
// (lib/sentryShared.js). Both use the patterns below, so they agree.
//
// Sentry rewrites the CDN origin to app:// in some events, so the frame form
// accepts either origin. The path shape (/mk/<version>/[libs/]mapkit.*.js) is
// Apple's; nothing of ours is served under /mk/.
export const MAPKIT_ORIGIN_FILE = /^https:\/\/cdn\.apple-mapkit\.com\/mk\//i;
export const MAPKIT_LIBRARY_FRAME = /^(?:https:\/\/cdn\.apple-mapkit\.com|app:\/\/)\/mk\/[\w.-]+\/(?:libs\/)?mapkit\.[\w.-]+\.js(?:[?#].*)?$/i;
