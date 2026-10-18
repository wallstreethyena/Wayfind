// Campaign context for the Sarasota Halloween Crown fan-vote page.
// Session-scoped, no PII: a fixed creative id plus the utm_* values on the
// landing URL. Later pageviews and clicks read the same session record.

export const CROWN_PATH = "/sarasota-halloween-crown";
export const CROWN_CREATIVE_ID = "WF-CREATIVE-20261018-001";
export const CROWN_SESSION_KEY = "wf_crown_campaign";
export const CROWN_QA_KEY = "wf_qaverify";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
const FIELD_KEYS = ["creative_id", ...UTM_KEYS];

export const CROWN_CONTENDERS = Object.freeze([
  {
    slot: 1,
    slug: "haunted-sarasota-trolley-tour-2026",
    title: "1. Haunted Sarasota Ghost Tour",
    placeId: "ChIJaVDYNb5Bw4gRbV2ffQ-VTfQ",
    facts: ["Select October nights", "$62.99"],
  },
  {
    slot: 2,
    slug: "ghostbusters-in-concert-van-wezel-2026",
    title: "2. Ghostbusters in Concert at Van Wezel",
    placeId: "ChIJew4bcA9Aw4gR3bU-SA7qAgU",
    facts: ["Oct 29, 2026 at 7 PM", "Prices shown include fees."],
  },
  {
    slot: 3,
    slug: "halos-and-horns-halloween-bash-at-perspective-roofto-sarasota-2026",
    title: "3. Halos & Horns at Perspective Rooftop (21+)",
    placeId: "ChIJ62qtuiVBw4gRFdwvl9Z4X_Y",
    facts: ["Oct 31, 9 PM to 1:30 AM Nov 1", "21+"],
  },
]);

export const CROWN_EVENT_SLUGS = new Set(CROWN_CONTENDERS.map((c) => c.slug));

function clean(value) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || s.length > 200 || s.includes("@") || /[\r\n]/.test(s)) return null;
  return s;
}

export function crownFieldsFromSearch(search) {
  const raw = typeof search === "string" ? search : "";
  let params;
  try { params = new URLSearchParams(raw.charAt(0) === "?" ? raw.slice(1) : raw); }
  catch { return {}; }
  const out = {};
  for (const key of UTM_KEYS) {
    const value = clean(params.get(key));
    if (value) out[key] = value;
  }
  if (Object.keys(out).length) out.creative_id = CROWN_CREATIVE_ID;
  return out;
}

export function readCrownCampaign(storage) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    const raw = storage.getItem(CROWN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const out = {};
    for (const key of FIELD_KEYS) {
      const value = clean(parsed[key]);
      if (value) out[key] = value;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Write campaign fields when the URL carries them. An empty URL keeps the session. */
export function saveCrownCampaign(search, storage) {
  const incoming = crownFieldsFromSearch(search);
  const existing = readCrownCampaign(storage) || {};
  const next = Object.keys(incoming).length ? { ...existing, ...incoming } : existing;
  if (Object.keys(incoming).length && storage && typeof storage.setItem === "function") {
    try { storage.setItem(CROWN_SESSION_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }
  return Object.keys(next).length ? next : null;
}

export function crownCampaignFields(storage) {
  if (storage) return readCrownCampaign(storage);
  try { return readCrownCampaign(globalThis.sessionStorage); }
  catch { return null; }
}

export function mergeCrownCampaign(properties, storage) {
  const fields = storage ? readCrownCampaign(storage) : crownCampaignFields();
  if (!fields) return properties && typeof properties === "object" ? properties : {};
  const out = { ...(properties && typeof properties === "object" ? properties : {}) };
  for (const [key, value] of Object.entries(fields)) {
    if (out[key] == null || out[key] === "") out[key] = value;
  }
  return out;
}

let crownViewLock = 0;
/** Collapse a strict-mode double effect. A later real visit still counts. */
export function claimCrownPageView() {
  const now = Date.now();
  if (now - crownViewLock < 80) return false;
  crownViewLock = now;
  return true;
}

export function crownPageViewedProps(pathname, fields) {
  const path = typeof pathname === "string" && pathname.startsWith("/") ? pathname.split("?")[0] : CROWN_PATH;
  return { path, ...(fields || {}) };
}

export function contenderDestination(contender) {
  return "/florida-events/" + contender.slug;
}

export function decorateCrownHref(path, fields) {
  const base = String(path || "");
  if (!fields) return base;
  const [withoutHash, hash] = base.split("#");
  const q = withoutHash.indexOf("?");
  const pathname = q >= 0 ? withoutHash.slice(0, q) : withoutHash;
  const params = new URLSearchParams(q >= 0 ? withoutHash.slice(q + 1) : "");
  for (const key of UTM_KEYS) {
    if (fields[key] && !params.has(key)) params.set(key, fields[key]);
  }
  const qs = params.toString();
  return pathname + (qs ? "?" + qs : "") + (hash ? "#" + hash : "");
}

export function contenderClickProps(contender, storage) {
  const fields = readCrownCampaign(storage);
  return {
    contender_slot: contender.slot,
    contender_slug: contender.slug,
    destination_path: contenderDestination(contender),
    ...(fields || {}),
  };
}

export function crownClickId(qa) {
  let body = "";
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") body = crypto.randomUUID();
  } catch { /* fall through */ }
  if (!body) body = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  body = body.replace(/[^A-Za-z0-9_-]/g, "");
  return ((qa ? "wf-qaverify-" : "wf-") + body).slice(0, 64);
}

export function isQaClick(storage) {
  try { return !!(storage && storage.getItem(CROWN_QA_KEY) === "1"); }
  catch { return false; }
}

export function ticketProvider(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  if (host === "eventbrite.com" || host.endsWith(".eventbrite.com")) return "eventbrite";
  if (host === "feverup.com" || host.endsWith(".feverup.com")) return "fever";
  if (host === "vanwezel.org" || host.endsWith(".vanwezel.org")) return "vanwezel";
  return null;
}

export function isAffiliateGo(url) {
  return /^\/api\/(?:commerce\/go|[\w-]+\/go)\/?$/.test(url.pathname);
}

/**
 * One ticket-link tap on a Crown contender's event page.
 * Affiliate go-routes use commerce_cta_clicked. Every other external booking
 * link uses event_outbound_clicked. Returns null for links that are not a
 * ticket or official booking hop.
 */
export function outboundTicketEvent(href, eventSlug, { qa = false, storage, origin = "https://www.gowayfind.com", kind = "" } = {}) {
  let url;
  try { url = new URL(String(href || ""), origin); }
  catch { return null; }
  const affiliate = isAffiliateGo(url);
  const external = url.origin !== new URL(origin).origin;
  if (!affiliate && !external) return null;
  const provider = ticketProvider(url.hostname) || (affiliate ? clean(url.searchParams.get("provider")) : null);
  const fields = readCrownCampaign(storage);
  const properties = {
    event_slug: eventSlug,
    destination_domain: external ? url.hostname.replace(/^www\./, "") : undefined,
    click_id: crownClickId(qa),
    ...(provider ? { provider } : {}),
    ...(fields || {}),
  };
  if (affiliate) {
    properties.surface = "florida_event_page";
    properties.content_id = eventSlug;
    if (!properties.destination_domain) delete properties.destination_domain;
  }
  return {
    event: affiliate || kind === "affiliate" ? "commerce_cta_clicked" : "event_outbound_clicked",
    properties,
  };
}
