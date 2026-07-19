// lib/envAudit.js — classifies the env surface (kept in lockstep with
// .env.local.example, the single source of truth) and logs, ONCE per server
// process, which integrations are live vs OFF.
//
// "Fail loud on required, quiet on optional" here means LOG loudly — we never
// throw. The whole app is fail-soft (missing key => that feature is hidden), and
// that stays true; this just makes an empty section read as "no key" in the logs,
// not "broken feature."
//
// IMPORTANT: only ever call logEnvAuditOnce() from REQUEST-TIME code (aiKey(),
// cget()), never at module scope — `next build` imports these modules to
// prerender, where optional keys are legitimately absent, and a module-scope log
// would spew "INTEGRATIONS OFF" into every build and make a green build look broken.

const val = (k) => String(process.env[k] || "").trim();
const has = (k) => val(k).length > 0;
const anyPresent = (g) => g.keys.some(has);

// Boot-critical: the app is meaningfully broken without these.
const REQUIRED = [
  { keys: ["NEXT_PUBLIC_SUPABASE_URL"], feature: "Supabase client (accounts, saves, lists)" },
  { keys: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"], feature: "Supabase client auth" },
  { keys: ["SUPABASE_URL"], feature: "Supabase server (shared cache, crons)" },
  { keys: ["SUPABASE_SERVICE_ROLE_KEY"], feature: "Supabase server writes (RLS bypass)" },
  { keys: ["NEXT_PUBLIC_GOOGLE_MAPS_KEY"], feature: "Google Maps/Places (map + place data)" },
];

// Required for a FEATURE, but the app still boots (degrades to the feature off).
// Classified separately so a missing AI key doesn't read as "app is down."
const FEATURE_REQUIRED = [
  { keys: ["ANTHROPIC_API_KEY", "LLM_API_KEY"], feature: "AI (card one-liners, detail verdict, insider, hooks)" },
];

// Optional integrations: absent => that section is hidden, by design.
const OPTIONAL = [
  { keys: ["GOOGLE_MAPS_SERVER_KEY"], feature: "server Places proxy + shared cache (absent = direct browser calls, Places 429 exposure)" },
  { keys: ["YOUTUBE_API_KEY"], feature: "place video-reviews block (CreatorFeature secondary strip)" },
  { keys: ["FOURSQUARE_API_KEY"], feature: "Foursquare 2nd place source" },
  { keys: ["TICKETMASTER_API_KEY"], feature: "Ticketmaster events" },
  { keys: ["SEATGEEK_CLIENT_ID"], feature: "SeatGeek events" },
  { keys: ["PREDICTHQ_TOKEN"], feature: "PredictHQ events" },
  { keys: ["SERPAPI_KEY"], feature: "Google Events (SerpApi)" },
  { keys: ["OPENWEBNINJA_KEY"], feature: "Google Events (OpenWeb Ninja)" },
  { keys: ["EVENTBRITE_PRIVATE_TOKEN"], feature: "Eventbrite events" },
  { keys: ["BANDSINTOWN_PARTNER_KEY"], feature: "Bandsintown events (gated partner)" },
  { keys: ["NPS_API_KEY"], feature: "National Park Service outdoors" },
  { keys: ["RIDB_API_KEY"], feature: "Recreation.gov outdoors" },
  { keys: ["VIATOR_API_KEY"], feature: "Viator tours booking CTA" },
  { keys: ["TRIPADVISOR_API_KEY", "TA_API_KEY", "TRIPADVISOR_KEY"], feature: "Tripadvisor ratings" },
  { keys: ["NEXT_PUBLIC_POSTHOG_KEY"], feature: "PostHog analytics" },
  { keys: ["RESEND_API_KEY"], feature: "email digests/notifications" },
  { keys: ["CRON_SECRET"], feature: "cron auth (fail-closed crons)" },
  { keys: ["METRICS_SECRET"], feature: "metrics endpoint auth" },
  { keys: ["SIGNUP_WEBHOOK_URL"], feature: "signup webhook" },
  { keys: ["PAGESPEED_API_KEY"], feature: "PageSpeed/CWV cron" },
  // Command Center (/command-center) provider reads — each absent key renders
  // as an explicit "Not connected" panel with the setup step, never fake data.
  { keys: ["POSTHOG_PERSONAL_API_KEY"], feature: "Command Center: PostHog traffic/geo/CWV/error panels" },
  { keys: ["SENTRY_AUTH_TOKEN"], feature: "Command Center: Sentry unresolved-issues panel" },
  { keys: ["VERCEL_API_TOKEN"], feature: "Command Center: deployment-state panel" },
  { keys: ["TRAVELPAYOUTS_TOKEN"], feature: "Command Center: provider-confirmed bookings/commission" },
];

// Pure classifier — safe to call anywhere (no logging, no throw).
export function auditEnv() {
  const missingRequired = REQUIRED.filter((g) => !anyPresent(g));
  const missingFeature = FEATURE_REQUIRED.filter((g) => !anyPresent(g));
  const offOptional = OPTIONAL.filter((g) => !anyPresent(g));
  return { missingRequired, missingFeature, offOptional, ok: missingRequired.length === 0 };
}

// Logs the audit exactly once per process. Guarded on a global flag; call from
// request-time code paths only (see the module header).
export function logEnvAuditOnce() {
  if (globalThis.__wfEnvAudited) return;
  globalThis.__wfEnvAudited = true;
  try {
    const { missingRequired, missingFeature, offOptional } = auditEnv();
    for (const g of missingRequired) console.error(`[env] MISSING REQUIRED ${g.keys[0]} — ${g.feature}`);
    for (const g of missingFeature) console.warn(`[env] AI key absent (${g.keys.join(" or ")}) — ${g.feature} is OFF (app still runs)`);
    if (offOptional.length) console.info(`[env] optional integrations OFF (missing key, section hidden by design): ${offOptional.map((g) => g.keys[0]).join(", ")}`);
  } catch (e) {}
}
