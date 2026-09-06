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
  // Set automatically by Vercel per deployment; absent locally BY DESIGN. The
  // "dev" fallback in /api/version + VersionWatch is fail-CLOSED (watch
  // disables itself), not a silent default — a missing value can never cause
  // a reload loop, it just means stale tabs update only on manual refresh.
  { keys: ["VERCEL_GIT_COMMIT_SHA", "NEXT_PUBLIC_WF_BUILD"], feature: "stale-tab version watch (absent = watch off, tabs update on manual refresh only)" },
  // Command Center (/command-center) provider reads — each absent key renders
  // as an explicit "Not connected" panel with the setup step, never fake data.
  { keys: ["POSTHOG_PERSONAL_API_KEY"], feature: "Command Center: PostHog traffic/geo/CWV/error panels" },
  { keys: ["SENTRY_AUTH_TOKEN"], feature: "Command Center: Sentry unresolved-issues panel" },
  { keys: ["VERCEL_API_TOKEN"], feature: "Command Center: deployment-state panel" },
  { keys: ["TRAVELPAYOUTS_TOKEN"], feature: "Command Center: provider-confirmed bookings/commission" },
];

// ─── Value overrides: a THIRD kind of env var ───────────────────────────────
// Every list above classifies on PRESENCE — a key is there or the feature is
// off. ATLAS_MODEL is not that shape. Absent is its CORRECT state (the code
// falls back to a good default), so putting it in OPTIONAL would print
// "integration OFF" for the healthy case. The question is not whether it is
// set; it is whether what it is set TO is real.
//
// Why this exists: `process.env.ATLAS_MODEL || "claude-haiku-4-5"` appeared in
// no audit list at all. Set it to a retired or mistyped model and atlas-build
// sends that string to Anthropic, gets a 404, `writeEditorial` returns null, and
// the row is stored issues=['PENDING SOURCE'] — indistinguishable from a place
// that genuinely could not be sourced. That is the exact silent-failure shape
// that let the cron write 525 rows and publish zero for five days (#440).
//
// A typo in an env var must not be able to look like a sourcing problem.
//
// Deliberately NOT a hard allowlist that throws: a genuinely new model would
// then be blocked by a stale constant, and this module never throws by design.
// Known value -> silent. Unknown but model-shaped -> LOUD warning naming the
// consequence. Not model-shaped -> LOUD error. Loud is the point; the failure
// was never that the value was wrong, it was that nothing said so.
const KNOWN_MODELS = [
  "claude-fable-5", "claude-opus-5", "claude-opus-4-8", "claude-opus-4-7",
  "claude-opus-4-6", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5",
];
const MODEL_SHAPE = /^claude-[a-z0-9]+(-[a-z0-9]+)*$/;

// `known` is optional. With a list, membership is checked and a well-shaped
// stranger is "unknown" (warn, never block — a new model must not be barred by a
// stale constant). Without one, shape is the whole test: there is no closed set
// of valid email addresses.
// SUPABASE KEY FORMAT. Not a value override in the "pick a behaviour" sense —
// this one detects a value that is PRESENT and REJECTED, which is precisely the
// state the presence-only lists cannot express and which cost five days in #440.
//
// Supabase disabled legacy anon/service_role JWTs on 2026-07-16. A legacy key
// still LOOKS fine to every presence check: it is a long non-empty string in the
// right env var. It just 401s with "Legacy API keys are disabled" on every call.
// Measured 2026-07-29: NEXT_PUBLIC_SUPABASE_ANON_KEY had been rotated to the new
// sb_publishable_ format, SUPABASE_SERVICE_ROLE_KEY had NOT — a half-finished
// migration that nothing in the codebase could see.
//
// 39 files read SUPABASE_SERVICE_ROLE_KEY. None of them can tell a working key
// from a disabled one. This makes the shape itself auditable.
const LEGACY_JWT = /^eyJ/;
export const SUPABASE_KEYS = [
  { key: "SUPABASE_SERVICE_ROLE_KEY", feature: "every server write (39 call sites)" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", feature: "the browser client" },
];

/**
 * Flag Supabase keys that are present but in the DISABLED legacy JWT format.
 * Pure; no logging, no throw. Returns [] when everything is on the new format.
 */
export function legacySupabaseKeys() {
  const out = [];
  for (const s of SUPABASE_KEYS) {
    const v = val(s.key);
    if (v && LEGACY_JWT.test(v)) out.push({ ...s, chars: v.length });
  }
  return out;
}

// ─── Placeholders: a FOURTH kind of wrong ───────────────────────────────────
// legacySupabaseKeys() above catches a value that is present and REJECTED by the
// provider. This catches the one before it: a value that is present and was
// never a credential at all.
//
// Measured 2026-08-22. The repo's own .env.local carried
// `ANTHROPIC_API_KEY=[SENSITIVE]` — thirty-nine of its sixty-eight variables had
// been replaced with that literal string by a redaction pass. Every presence
// check in this file reported green, because `[SENSITIVE]` is a perfectly good
// non-empty string. aiKey() returned it, /api/insight sent it to Anthropic,
// Anthropic answered 401, the route's `if (!r || !r.ok)` returned {error:true},
// and every AI block on the site rendered empty with nothing anywhere saying why.
//
// This is the same mistake as a rail with no identity (lib/railSelect.js,
// scripts/check-rail-identity.mjs, same day): asking "is it THERE" when the
// question is "is it RIGHT". Presence is not validity. A check that cannot tell
// a credential from the word "changeme" is not checking anything.
const PLACEHOLDER_RX = /^(\[[^\]]*\]|<[^>]*>|your[-_ ].*|change[-_ ]?me|replace[-_ ]?me|placeholder|todo|tbd|x{3,}|example|sample|dummy|null|undefined|none)$/i;

/**
 * Every classified env var whose value is present but is obviously not a value.
 * Pure; no logging, no throw.
 */
export function placeholderEnvKeys() {
  const out = [];
  for (const g of [...REQUIRED, ...FEATURE_REQUIRED, ...OPTIONAL]) {
    for (const k of g.keys) {
      const v = val(k);
      if (v && PLACEHOLDER_RX.test(v)) out.push({ key: k, feature: g.feature, value: v });
    }
  }
  return out;
}

// ─── Key SHAPE, for the credentials whose format is knowable ────────────────
// A placeholder is the obvious case. This is the quieter one: a real-looking
// string in the wrong slot — an OpenAI key pasted into ANTHROPIC_API_KEY, a
// truncated paste, a key with the variable name still attached. Anthropic keys
// are `sk-ant-` prefixed and long; that is enough to separate "a credential" from
// "some text", which is the whole job. Never a hard allowlist and never a throw:
// this module classifies and logs, it does not block.
export const KEY_SHAPES = [
  {
    key: "ANTHROPIC_API_KEY",
    shape: /^sk-ant-[A-Za-z0-9_\-]{20,}$/,
    feature: "AI (card one-liners, detail verdict, insider, hooks)",
    consequence: "every Anthropic call 401s and every AI block on the site renders empty, silently",
  },
];

/** Keys that are present but not shaped like the credential they stand in for. */
export function malformedKeys() {
  const out = [];
  for (const s of KEY_SHAPES) {
    const v = val(s.key);
    if (v && !PLACEHOLDER_RX.test(v) && !s.shape.test(v)) out.push({ ...s, chars: v.length });
  }
  return out;
}

export const VALUE_OVERRIDES = [
  {
    key: "ATLAS_MODEL",
    fallback: "claude-haiku-4-5",
    known: KNOWN_MODELS,
    shape: MODEL_SHAPE,
    feature: "atlas-build editorial model",
    consequence: "atlas-build will 404 on every call and store every row as PENDING SOURCE",
  },
  // Found by check-env-value-overrides.mjs the first time it ran — same shape,
  // same silence. A wrong sender is not rejected by us, it is rejected by
  // Resend, so the alert simply never arrives and nothing local looks wrong.
  {
    key: "WF_ALERT_FROM",
    fallback: "Wayfind Alerts <onboarding@resend.dev>",
    shape: /^[^<>@]*<?[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}>?$/i,
    feature: "cc-alerts sender identity",
    consequence: "Resend rejects the send and every production alert is silently lost",
  },
  // A typo here does not bounce anywhere we would notice — the weekly executive
  // digest just goes to nobody, or to the wrong person, indefinitely.
  {
    key: "DIGEST_EMAIL",
    fallback: "gabrielpereira@me.com",
    shape: /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i,
    feature: "weekly executive digest recipient",
    consequence: "the digest goes to the wrong address, or nowhere, with no bounce anyone sees",
  },
  // WO-D-atlas-cache-batch (2026-09-04): the operator-run Batch API backfill
  // (scripts/atlas-batch.mjs) is a SEPARATE value override from ATLAS_MODEL —
  // deliberately, because the two paths must be free to run different models
  // (Sonnet clears the prompt-cache minimum after the standard-doc inlining;
  // Haiku, the trickle default, does not) without either one's typo silently
  // masquerading as the other's failure mode.
  {
    key: "ATLAS_BATCH_MODEL",
    fallback: "claude-sonnet-5",
    known: KNOWN_MODELS,
    shape: MODEL_SHAPE,
    feature: "atlas-batch backfill model (operator-run scripts/atlas-batch.mjs)",
    consequence: "every batch request 404s at Anthropic after the batch is already submitted and paid the batch minimum, and the run's own token-count preflight cannot catch a bad model id — only Anthropic can, after spend",
  },
];

/**
 * Resolve a value override and say WHERE the value came from and whether it is
 * recognised. Pure — no logging, no throw. `status` is one of:
 *   "default"      unset, using the fallback (the healthy quiet case)
 *   "known"        set to a value we recognise
 *   "unknown"      set, model-shaped, not in the known list (new model? typo?)
 *   "malformed"    set to something that is not even the right shape
 */
export function resolveOverride(key) {
  const spec = VALUE_OVERRIDES.find((o) => o.key === key);
  if (!spec) return { key, value: null, status: "default", spec: null };
  const raw = val(key);
  if (!raw) return { key, value: spec.fallback, status: "default", spec };
  if (!spec.shape.test(raw)) return { key, value: raw, status: "malformed", spec };
  // No closed set to check against -> a well-shaped value is simply accepted.
  if (!Array.isArray(spec.known)) return { key, value: raw, status: "known", spec };
  if (spec.known.includes(raw)) return { key, value: raw, status: "known", spec };
  return { key, value: raw, status: "unknown", spec };
}

// Pure classifier — safe to call anywhere (no logging, no throw).
export function auditEnv() {
  const missingRequired = REQUIRED.filter((g) => !anyPresent(g));
  const missingFeature = FEATURE_REQUIRED.filter((g) => !anyPresent(g));
  const offOptional = OPTIONAL.filter((g) => !anyPresent(g));
  const overrides = VALUE_OVERRIDES.map((o) => resolveOverride(o.key));
  const badOverrides = overrides.filter((o) => o.status === "unknown" || o.status === "malformed");
  const placeholders = placeholderEnvKeys();
  const malformed = malformedKeys();
  // A placeholder or a wrong-shaped key is a BROKEN feature, not a configured
  // one — so it must not also be counted as present. Without this line the
  // audit would say "AI: on" about a key that 401s on every call.
  const brokenKeys = [...placeholders, ...malformed];
  return { missingRequired, missingFeature, offOptional, overrides, badOverrides, placeholders, malformed, brokenKeys, ok: missingRequired.length === 0 && brokenKeys.length === 0 };
}

// Logs the audit exactly once per process. Guarded on a global flag; call from
// request-time code paths only (see the module header).
export function logEnvAuditOnce() {
  if (globalThis.__wfEnvAudited) return;
  globalThis.__wfEnvAudited = true;
  try {
    const { missingRequired, missingFeature, offOptional, overrides, placeholders, malformed } = auditEnv();
    for (const g of missingRequired) console.error(`[env] MISSING REQUIRED ${g.keys[0]} — ${g.feature}`);
    for (const g of missingFeature) console.warn(`[env] AI key absent (${g.keys.join(" or ")}) — ${g.feature} is OFF (app still runs)`);
    if (offOptional.length) console.info(`[env] optional integrations OFF (missing key, section hidden by design): ${offOptional.map((g) => g.keys[0]).join(", ")}`);
    // A disabled legacy Supabase key is the loudest thing this function can say:
    // every write fails, and every presence check reports green.
    // Loudest of all, because it is the failure that looks most like health: the
    // variable is set, the audit is green, and the provider rejects every call.
    for (const p of placeholders) {
      console.error(`[env] ${p.key}="${p.value}" is a PLACEHOLDER, not a value — ${p.feature} is DOWN while every presence check reports it configured. Set the real value.`);
    }
    for (const m of malformed) {
      console.error(`[env] ${m.key} is set (${m.chars} chars) but is not shaped like the credential it stands in for — ${m.consequence}.`);
    }
    for (const k of legacySupabaseKeys()) {
      console.error(`[env] ${k.key} is a LEGACY Supabase JWT (${k.chars} chars, starts "eyJ"). Legacy keys were disabled 2026-07-16 and 401 on every call — ${k.feature} is DOWN. Replace with the new sb_secret_ / sb_publishable_ key.`);
    }
    // Value overrides. A set-but-wrong value is the dangerous case and it gets
    // the loudest line, because its failure mode downstream is silent.
    for (const o of overrides) {
      if (o.status === "malformed") {
        console.error(`[env] ${o.key}="${o.value}" is not a valid model id — ${o.spec.consequence}. Unset it to use ${o.spec.fallback}.`);
      } else if (o.status === "unknown") {
        console.warn(`[env] ${o.key}="${o.value}" is not a recognised model — if this is a new model it is fine, if it is a typo then ${o.spec.consequence}. Known: ${o.spec.known.join(", ")}.`);
      } else if (o.status === "known") {
        console.info(`[env] ${o.key}="${o.value}" overriding the ${o.spec.fallback} default — ${o.spec.feature}`);
      }
    }
  } catch (e) {}
}
