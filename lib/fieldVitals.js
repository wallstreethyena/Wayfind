// Field Core Web Vitals for pages outside the home app (2026-11-13). The home
// app (app/home.js) reports its own; standalone landing pages reported nothing,
// so the Christmas page, the landing for every Meta ad, had no field LCP, CLS
// or INP at all and a layout fix could not be measured on real visits.
// Same event name ("web_vitals") and the same base properties as home, so the
// command center panel and every existing query read these rows unchanged.
// Only primitives are sent: attribution objects also carry DOM nodes and
// PerformanceEntry objects, which must never reach posthog.capture.
import { captureOrQueue, safePagePath } from "./browserAnalytics.js";

export const FIELD_VITALS_SURFACE = "landing";

export function vitalsProps(m, { win, route, startedAt, build = null, release = null } = {}) {
  const num = (v) => Math.round(Number(v) || 0);
  const str = (v, n) => (v == null ? null : String(v).slice(0, n));
  const a = (m && m.attribution) || {};
  const props = {
    metric: m.name,
    value: Math.round(m.name === "CLS" ? m.value * 1000 : m.value),
    rating: m.rating,
    route: (win && win.location && win.location.pathname) || route || null,
    device: win && win.innerWidth < 768 ? "mobile" : "desktop",
    loc_permission: "unknown",
    signed_in: false,
    build,
    release,
    metric_id: str(m.id, 100),
    page_route: route || null,
    page_started_at: startedAt || null,
    vitals_surface: FIELD_VITALS_SURFACE,
  };
  if (m.name === "LCP") {
    props.lcp_target = str(a.target, 300);
    props.lcp_url = str(a.url, 300);
    props.lcp_ttfb = num(a.timeToFirstByte);
    props.lcp_resource_load_delay = num(a.resourceLoadDelay);
    props.lcp_resource_load_duration = num(a.resourceLoadDuration);
    props.lcp_element_render_delay = num(a.elementRenderDelay);
  } else if (m.name === "CLS") {
    props.cls_target = str(a.largestShiftTarget, 300);
    props.cls_largest_shift = num((a.largestShiftValue || 0) * 1000);
    props.cls_shift_time = num(a.largestShiftTime);
    props.cls_load_state = str(a.loadState, 40);
  } else if (m.name === "INP") {
    props.inp_target = str(a.interactionTarget, 300);
    props.inp_type = str(a.interactionType, 40);
    props.inp_input_delay = num(a.inputDelay);
    props.inp_processing = num(a.processingDuration);
    props.inp_presentation = num(a.presentationDelay);
    props.inp_load_state = str(a.loadState, 40);
  }
  return props;
}

// Starts once per page load (window._wfVitals, the same guard home uses), so a
// page can never report twice.
export function startFieldVitals(win, { build = null, release = null, load = () => import("web-vitals/attribution") } = {}) {
  if (!win || win._wfVitals) return false;
  win._wfVitals = true;
  const route = safePagePath(win.location && win.location.pathname);
  const startedAt = Number.isFinite(win.performance && win.performance.timeOrigin) ? new Date(win.performance.timeOrigin).toISOString() : null;
  load().then(({ onLCP, onCLS, onINP, onTTFB, onFCP }) => {
    const send = (m) => { try { captureOrQueue(win, "web_vitals", vitalsProps(m, { win, route, startedAt, build, release })); } catch (e) {} };
    [onLCP, onCLS, onINP, onTTFB, onFCP].forEach((f) => { try { f(send); } catch (e) {} });
  }).catch(() => {});
  return true;
}
