// lib/commandCenter/eventMap.js — the semantic event dictionary.
//
// The Command Center speaks CANONICAL metric names (the stable vocabulary the
// owner specified); Wayfind's production instrumentation predates that
// vocabulary and its event names are PRESERVED — analytics continuity beats
// renaming (and double-firing alias events would corrupt volume history).
// This map is the single translation layer: every canonical name points at the
// REAL tracked signal(s) it is computed from, or is explicitly marked
// `tracked: false` (never estimated). The UI renders these as the definition
// tooltips, so a number on screen is always one hover away from its source.
//
// Server twin of the SQL lists in supabase/command-center.sql
// (wf_cc_out_actions / wf_cc_engage_actions) — test-command-center.mjs locks
// the two in sync by grepping the SQL file.

export const OUT_ACTIONS = ["tickets_out", "hotel_out", "coupon_out", "eats_out", "ta_out", "tour_card_out", "maps_list"];
export const ENGAGE_ACTIONS = ["save", "like", "share", "directions", "coupon_save", "user_comment"];
export const BROWSE_ACTIONS = ["result_count_shown", "search", "intent_chip", "curated_open", "mood_tile", "map_pin_selected", "discovery_tile", "hero_tap"];

export const EVENT_MAP = {
  place_card_viewed: {
    tracked: false,
    sources: [],
    definition: "Impression of a place card in a feed. Not yet instrumented — hero_impression covers hero cards only. Planned additive event (batched per screenful).",
  },
  place_detail_opened: {
    tracked: true,
    sources: [{ store: "supabase.events", match: "action IN ('detail_open','event_open')" }, { store: "posthog", match: "detail_open / event_open" }],
    definition: "A place or event detail sheet was opened.",
  },
  place_saved: {
    tracked: true,
    sources: [{ store: "supabase.events", match: "action = 'save'" }],
    definition: "Place saved to the visitor's favorites.",
  },
  place_shared: {
    tracked: true,
    sources: [{ store: "supabase.events", match: "action = 'share'" }],
    definition: "Place or list shared via the share sheet (meta.kind carries what was shared).",
  },
  directions_clicked: {
    tracked: true,
    sources: [{ store: "supabase.events", match: "action = 'directions'" }],
    definition: "Directions button tapped on a place.",
  },
  affiliate_link_clicked: {
    tracked: true,
    sources: [{ store: "supabase.events", match: `action IN (${OUT_ACTIONS.map((a) => `'${a}'`).join(",")})` }],
    definition: "Tracked click on an approved outbound partner link (tickets, hotels, coupons, food delivery, Tripadvisor, tours). A click is not a booking.",
  },
  booking_confirmed: {
    tracked: false,
    sources: [],
    definition: "Provider-confirmed conversion. Requires the provider stats import (Travelpayouts/Viator postbacks) — until that is connected this is never inferred from clicks.",
  },
  signup_completed: {
    tracked: true,
    sources: [{ store: "supabase.auth.users", match: "row created (non-anonymous)" }, { store: "posthog", match: "auth_event" }],
    definition: "Successfully created authenticated account (Supabase Auth row is the source of truth).",
  },
  itinerary_created: {
    tracked: false,
    sources: [],
    definition: "Trip/itinerary created. Trips live client-side today; no server event exists yet. Planned additive event.",
  },
  search_submitted: {
    tracked: true,
    sources: [{ store: "supabase.events", match: "action = 'search' (meta.q = query)" }],
    definition: "A location/text search was submitted.",
  },
  search_no_results: {
    tracked: true,
    sources: [{ store: "supabase.events", match: "action = 'places_none' (meta.cat/loc)" }],
    definition: "A browse or search returned zero usable results (the empty-state event).",
  },
  city_changed: {
    tracked: false,
    sources: [],
    definition: "Explicit city switch. Approximated today by search events whose query is a city; a dedicated additive event is planned.",
  },
  category_selected: {
    tracked: true,
    sources: [{ store: "supabase.events", match: "action = 'result_count_shown' (meta.cat/sub)" }],
    definition: "A category (and optional sub-filter) was browsed; fires with the result count shown.",
  },
};

// Plain-English definitions for top-level KPIs (UI tooltips).
export const KPI_DEFS = {
  live_now: "Distinct devices with at least one first-party event in the last 5 minutes (Wayfind's own event log — no sampling). Internal traffic (the owner's accounts and any device that ever signed in as them) is excluded server-side.",
  visitors: "Deduplicated people as counted by the analytics source: PostHog unique persons where connected; otherwise distinct anonymous device ids from the first-party event log (labeled). First-party counts exclude internal (owner) accounts and devices.",
  sessions: "Analytics sessions (PostHog session ids where connected; first-party 'session' events otherwise).",
  page_views: "PostHog $pageview events across all routes.",
  screen_views: "In-app screen changes (the home app switches screens without URL changes; tracked first-party).",
  signups: "Successfully created authenticated accounts (Supabase Auth, non-anonymous).",
  affiliate_clicks: "Tracked clicks on approved outbound partner links. A click is never counted as a booking.",
  revenue: "Verified attributed commission from provider reports only — never projected from clicks.",
  errors_24h: "Application errors captured in the last 24 hours by the error monitor.",
  engaged: "Distinct devices that saved, liked, shared, got directions, commented, or clicked a partner link.",
  discovery_success: "Of devices that browsed or searched, the share that opened at least one place — the core health number for a discovery product. Internal traffic excluded.",
  time_to_action: "Median seconds from a device's first event in the window to its first meaningful action (place open, save/like/share/directions, or partner click).",
  score_coverage: "Share of the inventory catalog that carries rating signals (scoreable) — when this slips, results increasingly show 'Score pending'.",
};
