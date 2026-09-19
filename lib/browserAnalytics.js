// Privacy-safe browser analytics primitives. This module deliberately has no
// React or PostHog dependency so the policy can be tested without a browser.

export const INTERNAL_BROWSER_KEY = "wf_internal_browser_v1";
export const OWNER_EMAIL = "gabrielpereira@me.com";
export const OWNER_HANDLE = "gabrielpereira";
export const ACTIVE_FLUSH_MS = 10000;

const BOT_RX = /(?:bot\b|crawler|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptimerobot|facebookexternalhit|whatsapp|google-inspectiontool|googleother|bingpreview|yandex|baidu)/i;
const PRIVATE_SEGMENT_RX = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{24,}|[A-Za-z0-9_-]{28,}|[^/]*%40[^/]*)$/i;
const PRIVATE_PARENTS = new Set(["s", "share", "invite", "reset", "confirm", "auth"]);
const EXIT_REASONS = new Set(["hidden", "pagehide", "route_change", "unmount"]);
const SAFE_ACTION_LABELS = [
  [/^save(?:d)?\b/i, "Save"], [/^directions?\b/i, "Directions"],
  [/^(?:book|reserve)\b/i, "Book"], [/^(?:buy|get) tickets?\b/i, "Tickets"],
  [/^search\b/i, "Search"], [/^map\b/i, "Map"], [/^share\b/i, "Share"],
  [/^sign in\b/i, "Sign in"], [/^favorites?\b/i, "Favorites"],
  [/^filters?\b/i, "Filters"], [/^back\b/i, "Back"], [/^close\b/i, "Close"],
  [/^explore\b/i, "Explore"], [/^call\b/i, "Call"], [/^website\b/i, "Website"],
  [/^menu\b/i, "Menu"], [/^home\b/i, "Home"], [/^events?\b/i, "Events"],
  [/^coupons?\b/i, "Coupons"],
];

const clean = (value, limit = 120) => String(value == null ? "" : value).trim().slice(0, limit);

export function isOwnerUser(user) {
  if (!user || typeof user !== "object") return false;
  const emails = [user.email];
  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) emails.push(identity && identity.identity_data && identity.identity_data.email);
  }
  if (emails.some((email) => clean(email, 254).toLowerCase() === OWNER_EMAIL)) return true;
  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  return [metadata.user_name, metadata.preferred_username, metadata.username]
    .some((handle) => clean(handle, 80).toLowerCase() === OWNER_HANDLE);
}

export function isKnownBot(userAgent, webdriver = false) {
  return !!webdriver || BOT_RX.test(clean(userAgent, 500));
}

export function hasInternalBrowserMark(storage) {
  try { return !!(storage && storage.getItem(INTERNAL_BROWSER_KEY) === "1"); } catch (e) { return false; }
}

export function markInternalBrowser(storage) {
  try { if (storage) storage.setItem(INTERNAL_BROWSER_KEY, "1"); } catch (e) {}
}

export function analyticsSuppressionReason({ storage, user, userAgent, webdriver } = {}) {
  if (isOwnerUser(user)) {
    markInternalBrowser(storage);
    return "internal";
  }
  if (hasInternalBrowserMark(storage)) return "internal";
  if (isKnownBot(userAgent, webdriver)) return "bot";
  return null;
}

// Query strings and fragments never enter analytics. Opaque auth/share tokens
// are replaced even when a caller accidentally hands us an absolute URL.
export function safePagePath(value, origin = "https://gowayfind.com") {
  let pathname = "/";
  try { pathname = new URL(clean(value, 2048) || "/", origin).pathname || "/"; } catch (e) {}
  const parts = pathname.split("/").filter(Boolean).map((segment, index, all) => {
    const parent = index ? all[index - 1].toLowerCase() : "";
    return PRIVATE_PARENTS.has(parent) || PRIVATE_SEGMENT_RX.test(segment) ? ":private" : clean(segment, 80);
  });
  return "/" + parts.join("/");
}

export function safeReferrerDomain(value) {
  try { return clean(new URL(clean(value, 2048)).hostname.toLowerCase().replace(/^www\./, ""), 120) || null; } catch (e) { return null; }
}

export function sanitizeAnalyticsProperties(properties) {
  const source = properties && typeof properties === "object" ? properties : {};
  const out = { ...source };
  for (const [key, value] of Object.entries(out)) {
    if (!/(?:^|[_$])(?:url|href|referrer)$/i.test(key) || typeof value !== "string") continue;
    try {
      const parsed = new URL(value, "https://gowayfind.com");
      if (!/^https?:$/.test(parsed.protocol)) { out[key] = null; continue; }
      // Keep an absolute URL shape so PostHog's standard page/referrer parsing
      // still works, while discarding query, fragment and opaque path tokens.
      out[key] = /referrer/i.test(key)
        ? `${parsed.origin}/`
        : parsed.origin + safePagePath(parsed.pathname, parsed.origin);
    } catch (e) { out[key] = null; }
  }
  return out;
}

export function clickProperties(target, locationLike) {
  if (!target || typeof target.closest !== "function") return null;
  const element = target.closest("a,button,[role='button']");
  if (!element) return null;
  const tag = clean(element.tagName, 20).toLowerCase();
  const role = clean(element.getAttribute && element.getAttribute("role"), 20).toLowerCase();
  const elementType = tag === "a" ? "link" : (tag === "button" || role === "button" ? "button" : "control");
  const rawLabel = clean(
    (element.getAttribute && (element.getAttribute("data-analytics-label") || element.getAttribute("aria-label"))) || element.textContent,
    120,
  );
  const props = { element_type: elementType, destination_type: "none" };
  const safeLabel = SAFE_ACTION_LABELS.find(([pattern]) => pattern.test(rawLabel));
  if (safeLabel) props.element_label = safeLabel[1];

  const href = clean(element.getAttribute && element.getAttribute("href"), 2048);
  if (!href || /^(?:javascript:|mailto:|tel:)/i.test(href)) return props;
  try {
    const base = locationLike && locationLike.origin ? locationLike.origin : "https://gowayfind.com";
    const url = new URL(href, base);
    if (url.origin === base) {
      props.destination_type = "internal";
      props.destination_path = safePagePath(url.pathname, base);
    } else if (/^https?:$/.test(url.protocol)) {
      props.destination_type = "outbound";
      props.outbound_domain = clean(url.hostname.toLowerCase().replace(/^www\./, ""), 120);
    }
  } catch (e) {}
  return props;
}

export function positionBuckets(win, doc, scrollNode) {
  const viewport = Math.max(1, Number(scrollNode && scrollNode.clientHeight) || Number(win && win.innerHeight) || 1);
  const y = Math.max(0, Number(scrollNode && scrollNode.scrollTop) || Number(win && win.scrollY) || 0);
  const height = Math.max(viewport, Number(scrollNode && scrollNode.scrollHeight) || Number(doc && doc.documentElement && doc.documentElement.scrollHeight) || viewport);
  const midpoint = Math.min(height, y + viewport / 2);
  const documentBucket = Math.min(9, Math.max(0, Math.floor((midpoint / height) * 10)));
  // We attribute dwell to the viewport midpoint; this is a scroll-attention
  // map, not eye tracking. Do not invent gaze from scroll offset modulo height.
  const viewportBucket = 5;
  return { viewport_bucket: viewportBucket, document_bucket: documentBucket };
}

function visitId(win) {
  try { if (win.crypto && typeof win.crypto.randomUUID === "function") return win.crypto.randomUUID(); } catch (e) {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createPageVisitTracker({ win, doc, capture, now = () => Date.now(), setIntervalFn, clearIntervalFn }) {
  if (!win || !doc || typeof capture !== "function") return { navigate() {}, stop() {} };
  const every = setIntervalFn || win.setInterval.bind(win);
  const cancelEvery = clearIntervalFn || win.clearInterval.bind(win);
  let visit = null;
  let activeSince = null;
  let activeMs = 0;
  let reportedActiveMs = 0;
  let attentionSince = null;
  let attentionBuckets = null;
  let timer = null;
  let stopped = false;
  let overlayScrollNode = null;

  const primaryNode = () => {
    try { return doc.querySelector && doc.querySelector("[data-analytics-page]"); } catch (e) { return null; }
  };
  const safeSurfacePart = (value, fallback) => {
    const valueString = clean(value, 40).toLowerCase();
    return /^[a-z0-9_-]+$/.test(valueString) ? valueString : fallback;
  };
  const pageSurface = () => {
    const primary = primaryNode();
    if (!primary || typeof primary.getAttribute !== "function") return "document";
    const page = safeSurfacePart(primary.getAttribute("data-analytics-page"), "document");
    const overlay = safeSurfacePart(primary.getAttribute("data-analytics-overlay"), "");
    return overlay ? `${page}:${overlay}` : page;
  };
  const scrollable = (node) => !!(node && Number(node.clientHeight) > 0 && Number(node.scrollHeight) > Number(node.clientHeight));
  const scrollNode = () => {
    const primary = primaryNode();
    const overlay = primary && primary.getAttribute && primary.getAttribute("data-analytics-overlay");
    if (overlay) {
      if (overlayScrollNode && overlayScrollNode.isConnected !== false && scrollable(overlayScrollNode)) return overlayScrollNode;
      try {
        const dialog = doc.querySelector && doc.querySelector('[role="dialog"][aria-modal="true"]');
        if (scrollable(dialog)) return dialog;
      } catch (e) {}
      // A modal is open but its scrollport is unknown. Returning null prevents
      // the covered feed from receiving false attention heat.
      return null;
    }
    overlayScrollNode = null;
    return primary || doc.scrollingElement || doc.documentElement;
  };

  const active = () => doc.visibilityState === "visible" && (typeof doc.hasFocus !== "function" || doc.hasFocus());
  const pagePath = () => safePagePath(win.location && win.location.href, win.location && win.location.origin);
  const common = () => ({ page_path: visit.pagePath, page_surface: visit.pageSurface, visit_id: visit.id });
  const accrue = () => {
    if (activeSince == null) return;
    const stamp = now();
    const delta = Math.max(0, stamp - activeSince);
    activeMs += delta;
    activeSince = stamp;
  };
  const startActive = () => {
    if (activeSince == null && active()) activeSince = now();
    if (attentionSince == null && active()) {
      attentionSince = now();
      const node = scrollNode();
      attentionBuckets = node ? positionBuckets(win, doc, node) : null;
    }
  };
  const emitAttention = () => {
    if (!visit || attentionSince == null) return;
    const stamp = now();
    const delta = Math.max(0, stamp - attentionSince);
    attentionSince = active() ? stamp : null;
    if (delta < 1000) return;
    if (!attentionBuckets) return;
    capture("attention_sample", { ...common(), ...attentionBuckets, active_ms: Math.round(delta) });
  };
  const pause = () => {
    accrue();
    emitAttention();
    activeSince = null;
    attentionSince = null;
    attentionBuckets = null;
  };
  const activeTotal = () => {
    accrue();
    return Math.round(activeMs);
  };
  const maxScrollPct = () => {
    const node = scrollNode();
    if (!node) return 0;
    const viewport = Math.max(1, Number(node.clientHeight) || Number(win.innerHeight) || 1);
    const height = Math.max(viewport, Number(node.scrollHeight) || Number(doc.documentElement && doc.documentElement.scrollHeight) || viewport);
    const y = Math.max(0, Number(node.scrollTop) || (node === doc.documentElement ? Number(win.scrollY) || 0 : 0));
    return Math.min(100, Math.max(0, Math.round(((y + viewport) / height) * 100)));
  };
  const finish = (reason, emitExit = true) => {
    if (!visit) return;
    pause();
    const boundedReason = EXIT_REASONS.has(reason) ? reason : "unmount";
    const total = Math.round(activeMs);
    const base = { ...common(), max_scroll_pct: visit.maxScrollPct, reason: boundedReason };
    capture("page_active_time", { ...base, active_ms: Math.max(0, total - reportedActiveMs) });
    if (emitExit) capture("page_exit", { ...base, active_ms: total });
    visit = null;
  };
  const begin = (path) => {
    activeMs = 0;
    reportedActiveMs = 0;
    visit = { id: visitId(win), pagePath: safePagePath(path || pagePath(), win.location && win.location.origin), pageSurface: pageSurface(), maxScrollPct: maxScrollPct() };
    capture("page_visit", { ...common(), referrer_domain: safeReferrerDomain(doc.referrer) });
    startActive();
  };
  const syncSurface = () => {
    if (!visit || visit.pageSurface === pageSurface()) return;
    finish("route_change");
    begin(pagePath());
  };
  const onScroll = (event) => {
    if (!visit) return;
    const primary = primaryNode();
    const target = event && event.target;
    if (primary && primary.getAttribute && primary.getAttribute("data-analytics-overlay") && target && target !== doc && target !== primary && scrollable(target)) {
      overlayScrollNode = target;
    }
    syncSurface();
    emitAttention();
    const node = scrollNode();
    attentionBuckets = node ? positionBuckets(win, doc, node) : null;
    visit.maxScrollPct = Math.max(visit.maxScrollPct, maxScrollPct());
  };
  const onClick = (event) => {
    if (!visit) return;
    syncSurface();
    const props = clickProperties(event && event.target, win.location);
    if (props) capture("element_click", { ...common(), ...props });
  };
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") {
      pause();
      if (visit) {
        const total = Math.round(activeMs);
        capture("page_active_time", { ...common(), active_ms: Math.max(0, total - reportedActiveMs), max_scroll_pct: visit.maxScrollPct, reason: "hidden" });
        reportedActiveMs = total;
      }
    } else startActive();
  };
  const onFocus = () => startActive();
  const onBlur = () => pause();
  const onPageHide = () => finish("pagehide");
  const onPageShow = () => { if (!visit) begin(pagePath()); else startActive(); };

  doc.addEventListener("visibilitychange", onVisibility);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("scroll", onScroll, true);
  win.addEventListener("focus", onFocus);
  win.addEventListener("blur", onBlur);
  win.addEventListener("pagehide", onPageHide);
  win.addEventListener("pageshow", onPageShow);
  timer = every(() => { if (active()) { syncSurface(); accrue(); emitAttention(); onScroll(); } }, ACTIVE_FLUSH_MS);
  begin(pagePath());

  return {
    navigate(path) {
      const next = safePagePath(path || pagePath(), win.location && win.location.origin);
      if (!visit || next === visit.pagePath) return;
      finish("route_change");
      begin(next);
    },
    sync: syncSurface,
    stop({ emitExit = true } = {}) {
      if (stopped) return;
      stopped = true;
      if (timer != null) cancelEvery(timer);
      finish("unmount", emitExit);
      doc.removeEventListener("visibilitychange", onVisibility);
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("scroll", onScroll, true);
      win.removeEventListener("focus", onFocus);
      win.removeEventListener("blur", onBlur);
      win.removeEventListener("pagehide", onPageHide);
      win.removeEventListener("pageshow", onPageShow);
    },
  };
}
