// Pure report builder for the owner-only visitor story. Input rows contain
// ephemeral visit/session ids so events can be correlated; output is aggregate
// only and never exposes either identifier.

const CORE_EVENTS = ["page_visit", "page_exit", "element_click", "attention_sample"];
const MAX_PATH_PAGES = 6;

const text = (value, fallback = "") => String(value == null ? fallback : value).trim();
const number = (value) => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 1) => value == null ? null : Number(Number(value).toFixed(digits));
const median = (values) => {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
};

function add(map, key, make) {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
}

function rank(rows, field = "visits", limit = 20) {
  return rows.sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0)).slice(0, limit);
}

function classifyExit(click, exit) {
  const destination = text(click && click.destination_type).toLowerCase();
  if (["booking", "affiliate", "partner"].includes(destination)) return "partner_click_before_exit";
  if (["outbound", "external"].includes(destination)) return "external_click_before_exit";
  if (["internal", "wayfind", "route"].includes(destination)) return text(exit && exit.reason).toLowerCase() === "route_change" ? "internal_navigation" : "internal_click_before_exit";
  return "unobserved_exit";
}

const surfaceName = (row) => text(row && row.page_surface, "document") || "document";
const surfaceLabel = (path, surface) => surface && surface !== "document" ? `${path} (${surface.replace(/[-_]+/g, " ")})` : path;
function pageWords(path) {
  const clean = text(path, "Unknown page").split(/[?#]/)[0];
  if (clean === "/") return "Home";
  if (!clean || clean === "Unknown page") return "an unknown page";
  if (/^\/p\/[^/]+\/?$/i.test(clean)) return "Place page";
  const part = clean.split("/").filter(Boolean).at(-1) || "Home";
  return part.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bucketWords(bucket) {
  const value = text(bucket).toLowerCase();
  if (value === "top" || value === "0") return "the top of the page";
  if (value === "bottom" || value === "100") return "the bottom of the page";
  if (/^[1-8]$/.test(value)) return `${Number(value) * 10}–${(Number(value) + 1) * 10}% down the page`;
  if (value === "9") return "the bottom of the page";
  return value && value !== "unknown" ? value.replace(/[-_]+/g, " ") : "an unknown part of the page";
}

function diagnosticFindings(rows) {
  const out = [];
  for (const row of rank([...(rows || [])], "occurrences", 8)) {
    const event = text(row.event);
    const page = text(row.page_path, "Unknown page");
    const pageLabel = pageWords(page);
    const occurrences = Number(row.occurrences) || 0;
    const visitors = Number(row.visitors) || 0;
    if (!occurrences) continue;
    if (event === "places_none" || event === "events_none") out.push({
      id: `diagnostic:${event}:${page}`, kind: "opportunity", title: `Search returned no useful result on ${pageLabel}`,
      evidence: `${occurrences} empty-result event${occurrences === 1 ? " was" : "s were"} measured across ${visitors} visitor${visitors === 1 ? "" : "s"}. Review the requested area/category coverage for this page; the event does not reveal what result the visitor expected.`,
      recommendation: "Review the empty-result inputs and add or repair relevant coverage where the requests are valid.",
      metric: "empty results", value: occurrences, denominator: null, sample_size: visitors, confidence: "measured",
    });
    else if (["app_error", "provider_redirect_failed"].includes(event)) out.push({
      id: `diagnostic:${event}:${page}`, kind: "issue", title: `${event === "app_error" ? "The page showed an app error" : event === "provider_redirect_failed" ? "A partner redirect failed" : event === "primary_cta_null" ? "A primary action had no destination" : "A content rail needed a retry"}${page === "Unknown page" ? "" : ` on ${pageLabel}`}`,
      evidence: `${occurrences} ${event} event${occurrences === 1 ? " was" : "s were"} measured across ${visitors} visitor${visitors === 1 ? "" : "s"}. This is an observed failure signal; inspect the matching error or provider logs before choosing a fix.`,
      recommendation: "Inspect the matching event details and server logs, reproduce the failure, then fix the proven cause.",
      metric: "failure events", value: occurrences, denominator: null, sample_size: visitors, confidence: "measured",
    });
    else if (event === "$rageclick") out.push({
      id: `diagnostic:rageclick:${page}`, kind: "clue", title: `Repeated clicks were detected on ${pageLabel}`,
      evidence: `${occurrences} repeated-click signal${occurrences === 1 ? " was" : "s were"} measured across ${visitors} visitor${visitors === 1 ? "" : "s"}. This identifies friction worth replaying; it does not identify the broken control by itself.`,
      recommendation: "Review the matching replay or click target and verify whether the control responded visibly.",
      metric: "repeated-click signals", value: occurrences, denominator: null, sample_size: visitors, confidence: "measured",
    });
    else if (event === "primary_cta_null") out.push({
      id: `diagnostic:primary_cta_null:${page}`, kind: "opportunity", title: `No booking link was offered on ${pageLabel}`,
      evidence: `${occurrences} page view${occurrences === 1 ? " had" : "s had"} no monetizable primary action across ${visitors} visitor${visitors === 1 ? "" : "s"}. Directions can be the correct action for a free place, so this is an inventory clue rather than a broken-link finding.`,
      recommendation: "Review whether these places should have a verified booking option; keep Directions when no correct paid action exists.",
      metric: "pages without booking links", value: occurrences, denominator: null, sample_size: visitors, confidence: "measured",
    });
    else if (event === "rail_retry") out.push({
      id: `diagnostic:rail_retry:${page}`, kind: "clue", title: `Visitors asked a content row to try again on ${pageLabel}`,
      evidence: `${occurrences} retry tap${occurrences === 1 ? " was" : "s were"} measured across ${visitors} visitor${visitors === 1 ? "" : "s"}. A retry tap shows the first result was not useful or did not load, but does not identify which cause occurred.`,
      recommendation: "Compare retry events with loading and result-count telemetry before changing the content row.",
      metric: "retry taps", value: occurrences, denominator: null, sample_size: visitors, confidence: "measured",
    });
    else if (event === "content_disliked" || event === "dislike") out.push({
      id: `diagnostic:${event}:${page}`, kind: "opportunity", title: `Visitors explicitly disliked content on ${pageLabel}`,
      evidence: `${occurrences} dislike signal${occurrences === 1 ? " was" : "s were"} measured across ${visitors} visitor${visitors === 1 ? "" : "s"}. Review the affected content; the signal records dissatisfaction but not the reason.`,
      recommendation: "Inspect which content was disliked and look for repeated relevance or quality problems before changing ranking.",
      metric: "dislike signals", value: occurrences, denominator: null, sample_size: visitors, confidence: "measured",
    });
  }
  return out;
}

function findingsFor({ pageAttention, exits, heatmap, diagnostics, truncated }) {
  const findings = [];
  if (truncated) findings.push({
    id: "report-row-cap", kind: "issue", title: "This report reached its event cap",
    evidence: "The source returned more events than the bounded report can safely process, so the rankings are incomplete.",
    metric: "event rows", value: 50000, denominator: null, sample_size: 50000, confidence: "measured",
  });

  const scrollOpportunity = pageAttention.find((row) => row.exits_measured >= 5 && row.active_s_avg >= 30 && row.max_scroll_pct_avg != null && row.max_scroll_pct_avg < 40);
  if (scrollOpportunity) findings.push({
    id: `attention-before-depth:${scrollOpportunity.page_path}`, kind: "opportunity",
    title: `People spend time on ${pageWords(scrollOpportunity.page_path)} before reaching most of it`,
    evidence: `${scrollOpportunity.exits_measured} measured page visits ended after an average ${Math.round(scrollOpportunity.active_s_avg)} seconds with the page in front. They reached about ${Math.round(scrollOpportunity.max_scroll_pct_avg)}% down the page. This supports checking content order; it does not reveal why people stopped.`,
    metric: "average page depth reached", value: round(scrollOpportunity.max_scroll_pct_avg), denominator: 100,
    sample_size: scrollOpportunity.exits_measured, confidence: "measured",
  });

  const totalExits = exits.reduce((sum, row) => sum + row.visits, 0);
  const unknownExits = exits.filter((row) => row.classification === "unobserved_exit").reduce((sum, row) => sum + row.visits, 0);
  if (totalExits >= 10 && unknownExits / totalExits >= 0.6) findings.push({
    id: "unobserved-last-action", kind: "issue", title: "Most visit endings have no measured next action",
    evidence: `${unknownExits} of ${totalExits} measured page visits ended with no preceding internal or partner click. What happened next is unknown and must not be described as abandonment.`,
    metric: "unobserved endings", value: unknownExits, denominator: totalExits, sample_size: totalExits, confidence: "measured",
  });

  const strongest = heatmap[0];
  if (strongest && strongest.samples >= 5) findings.push({
    id: `attention-area:${strongest.page_path}:${strongest.document_bucket}`, kind: "clue",
    title: `The most measured attention is on ${pageWords(strongest.page_path)}`,
    evidence: `${Math.round(strongest.active_s)} seconds with the page in front were measured at ${bucketWords(strongest.document_bucket)} across ${strongest.samples} samples. This ranks observed time; it does not measure sentiment or intent.`,
    metric: "foreground seconds", value: round(strongest.active_s), denominator: null, sample_size: strongest.samples, confidence: "measured",
  });
  return [...diagnosticFindings(diagnostics), ...findings].slice(0, 12);
}

export function buildVisitorReport(inputRows, { truncated = false, diagnostics = [], diagnosticsTruncated = false } = {}) {
  const rows = (Array.isArray(inputRows) ? inputRows : []).map((row) => ({ ...row, _at: new Date(row.timestamp).getTime() || 0 }));
  const counts = Object.fromEntries(CORE_EVENTS.map((event) => [event, 0]));
  for (const row of rows) if (Object.hasOwn(counts, row.event)) counts[row.event]++;

  const bySession = new Map();
  const byVisit = new Map();
  for (const row of rows) {
    const sessionId = text(row.session_id);
    const visitId = text(row.visit_id);
    if (sessionId) add(bySession, sessionId, () => []).push(row);
    if (visitId) add(byVisit, visitId, () => []).push(row);
  }

  const journeyMap = new Map();
  for (const events of bySession.values()) {
    const pages = [];
    for (const row of events.sort((a, b) => a._at - b._at)) {
      if (row.event !== "page_visit") continue;
      const path = text(row.page_path, "/").split(/[?#]/)[0] || "/";
      const surface = surfaceName(row);
      const previous = pages.at(-1);
      if (!previous || previous.path !== path || previous.surface !== surface) pages.push({ path, surface });
    }
    if (!pages.length) continue;
    const shown = pages.slice(0, MAX_PATH_PAGES);
    const key = JSON.stringify(shown);
    const item = add(journeyMap, key, () => ({
      path: shown.map((page) => page.path), surfaces: shown.map((page) => page.surface),
      label: shown.map((page) => surfaceLabel(page.path, page.surface)).join(" → "),
      visits: 0, pages: pages.length, truncated: pages.length > MAX_PATH_PAGES,
    }));
    item.visits++;
    item.pages = Math.max(item.pages, pages.length);
    item.truncated ||= pages.length > MAX_PATH_PAGES;
  }
  const journeys = rank([...journeyMap.values()]);

  const attentionMap = new Map();
  const clickMap = new Map();
  const exitMap = new Map();
  for (const events of byVisit.values()) {
    events.sort((a, b) => a._at - b._at);
    const page = text(events.find((row) => row.page_path)?.page_path, "/").split(/[?#]/)[0] || "/";
    const pageSurface = surfaceName(events.find((row) => row.page_surface));
    const exits = events.filter((row) => row.event === "page_exit");
    const flushes = events.filter((row) => row.event === "page_active_time");
    const lastExit = exits.at(-1) || null;
    const activeMs = number(lastExit && lastExit.active_ms) ?? flushes.reduce((sum, row) => sum + (number(row.active_ms) || 0), 0);
    if (lastExit || flushes.length) {
      const item = add(attentionMap, JSON.stringify([page, pageSurface]), () => ({ page_path: page, page_surface: pageSurface, visits: 0, exits_measured: 0, active_ms_total: 0, activeValues: [], scrollValues: [] }));
      item.visits++;
      if (lastExit) item.exits_measured++;
      item.active_ms_total += activeMs;
      item.activeValues.push(activeMs / 1000);
      const scroll = number(lastExit && lastExit.max_scroll_pct);
      if (scroll != null) item.scrollValues.push(scroll);
    }

    const lastClick = events.filter((row) => row.event === "element_click").at(-1) || null;
    if (lastClick) {
      const click = {
        page_path: page, page_surface: pageSurface, element_type: text(lastClick.element_type, "unknown"),
        element_label: text(lastClick.element_label) || null, destination_type: text(lastClick.destination_type, "unknown"),
        destination_path: text(lastClick.destination_path) || null, outbound_domain: text(lastClick.outbound_domain) || null,
      };
      const key = JSON.stringify(click);
      add(clickMap, key, () => ({ ...click, visits: 0 })).visits++;
    }
    if (lastExit) {
      const priorClick = events.filter((row) => row.event === "element_click" && row._at <= lastExit._at).at(-1) || null;
      const clickBeforeExit = priorClick && lastExit._at - priorClick._at <= 10_000 ? priorClick : null;
      const classification = classifyExit(clickBeforeExit, lastExit);
      const reason = classification === "unobserved_exit"
        ? "No next action was captured; this page ending is unknown, not abandonment."
        : classification === "partner_click_before_exit"
          ? "A partner or booking click was captured before the page ended; this does not prove a booking or that the destination opened."
          : classification === "external_click_before_exit"
            ? "A click to another site was captured before the page ended; this does not prove the visitor left or completed an action."
            : classification === "internal_click_before_exit"
              ? "An internal click was captured shortly before the page ended, but no route change was measured. What happened next is unknown."
            : text(lastExit.reason) || null;
      const key = JSON.stringify([page, pageSurface, classification, reason]);
      add(exitMap, key, () => ({ page_path: page, page_surface: pageSurface, classification, reason, visits: 0 })).visits++;
    }
  }

  const pageAttention = rank([...attentionMap.values()].map((row) => ({
    page_path: row.page_path, page_surface: row.page_surface, visits: row.visits, exits_measured: row.exits_measured,
    active_s_total: round(row.active_ms_total / 1000), active_s_avg: round(row.active_ms_total / 1000 / row.visits),
    active_s_p50: round(median(row.activeValues)),
    max_scroll_pct_avg: row.scrollValues.length ? round(row.scrollValues.reduce((a, b) => a + b, 0) / row.scrollValues.length) : null,
  })), "active_s_total");
  const lastClicks = rank([...clickMap.values()]);
  const exits = rank([...exitMap.values()]);

  const heatmapMap = new Map();
  for (const row of rows.filter((item) => item.event === "attention_sample")) {
    const page = text(row.page_path, "/").split(/[?#]/)[0] || "/";
    const pageSurface = surfaceName(row);
    const documentBucket = text(row.document_bucket, "unknown");
    const viewportBucket = text(row.viewport_bucket, "unknown");
    const key = JSON.stringify([page, pageSurface, documentBucket, viewportBucket]);
    const item = add(heatmapMap, key, () => ({ page_path: page, page_surface: pageSurface, document_bucket: documentBucket, viewport_bucket: viewportBucket, active_s: 0, samples: 0, visitIds: new Set() }));
    item.active_s += (number(row.active_ms) || 0) / 1000;
    item.samples++;
    if (row.visit_id) item.visitIds.add(row.visit_id);
  }
  const heatmap = rank([...heatmapMap.values()].map((row) => ({
    page_path: row.page_path, page_surface: row.page_surface, document_bucket: row.document_bucket, viewport_bucket: row.viewport_bucket,
    active_s: round(row.active_s), samples: row.samples, visits: row.visitIds.size,
  })), "active_s");

  const missing = CORE_EVENTS.filter((event) => counts[event] === 0);
  const notes = [
    "Only events captured after this instrumentation shipped are measurable; earlier behavior is unknown.",
    "Paths include page visits inside the chosen dates. A session already underway at the start or still active at the end is censored, so its full journey is unknown.",
    "A page_exit marks the end of one measured page lifecycle, not necessarily the end of a browser session or visit.",
  ];
  if (missing.length) notes.push(`No ${missing.join(", ")} events were present in this window, so the related sections remain unknown.`);
  if (truncated) notes.push("The source returned more than 50,000 report events; rankings are partial and the cap is shown as an issue.");
  if (diagnosticsTruncated) notes.push("More than 50 issue/opportunity rows were measured; findings use the 50 most frequent rows and are partial.");
  const hasDiagnostics = diagnostics.length > 0;
  const coverage = {
    status: rows.length === 0 && !hasDiagnostics ? "unavailable" : (missing.length || truncated || diagnosticsTruncated ? "partial" : "measured"),
    notes, events: counts,
  };
  const findings = findingsFor({ pageAttention, exits, heatmap, diagnostics, truncated });
  return { coverage, journeys, pageAttention, lastClicks, exits, heatmap, findings };
}
