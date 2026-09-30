// Pure report builder for the owner-only visitor story. Input rows contain
// ephemeral visit/session ids so events can be correlated; output is aggregate
// only and never exposes either identifier.

import { classifySessions } from "./trafficQuality.js";

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
  if (["booking", "affiliate", "partner"].includes(destination) || /^\/api\/[a-z0-9-]+\/go\/?$/i.test(text(click && click.destination_path))) return "partner_click_before_exit";
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

// ── plain-English layer ─────────────────────────────────────────────────────
// The owner asked for a report that TALKS: "someone went to Date Night, tapped
// the card for X, then left." Everything below turns measured events into
// sentences with real page and place names. It never invents a reason: a
// "why" is only stated where the page's own structure proves it (the guide
// CTA really does sit after every pick), and otherwise the text says what was
// measured and what to try.

const FRIENDLY_SOURCES = [
  [/(^|\.)google\./, "Google search"], [/(^|\.)bing\.com$/, "Bing"], [/(^|\.)yahoo\.com$/, "Yahoo search"],
  [/duckduckgo\.com$/, "DuckDuckGo"], [/syndicatedsearch\.goog$/, "Google search"],
  [/facebook\.com$/, "Facebook"], [/instagram\.com$/, "Instagram"], [/youtube\.com$/, "YouTube"],
  [/tiktok\.com$/, "TikTok"], [/(^|\.)t\.co$|twitter\.com$|x\.com$/, "X/Twitter"], [/reddit\.com$/, "Reddit"],
  [/pinterest\./, "Pinterest"], [/chatgpt\.com$|openai\.com$/, "ChatGPT"], [/perplexity\.ai$/, "Perplexity"],
];
const PHOTO_CREDIT_DOMAINS = /(?:^|\.)(?:unsplash\.com|pexels\.com|wikimedia\.org|wikipedia\.org|flickr\.com|creativecommons\.org)$/;
const MAPS_DOMAINS = /(?:^|\.)(?:google\.com|goo\.gl|maps\.apple\.com|waze\.com)$/;
const HOME_SURFACES = {
  suggested: "the home feed", events: "the Events tab", map: "the map", saved: "Saved places",
  coupons: "Coupons", tonight: "Tonight", explore: "Explore",
};

const titleCaseSlug = (slug) => text(slug).replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function lookup(map, key) {
  if (!map || !key) return null;
  if (map instanceof Map) return map.get(key) || null;
  return Object.hasOwn(map, key) ? map[key] || null : null;
}

export function sourceWords(referrerDomain) {
  const domain = text(referrerDomain).toLowerCase().replace(/^www\./, "");
  if (!domain) return "a direct link or app (no referrer)";
  if (domain === "gowayfind.com") return "another Wayfind page";
  const known = FRIENDLY_SOURCES.find(([rx]) => rx.test(domain));
  return known ? known[1] : domain;
}

export function placeIdFromPath(path) {
  const match = /^\/(?:p|places)\/([^/?#]+)\/?$/.exec(text(path));
  return match && match[1] !== ":private" ? match[1] : null;
}

/** "the guide “12 Things to Do in Orlando…”", "Wekiwa Springs State Park", "the home feed". */
export function pageTitle(path, surface, ctx = {}) {
  const clean = text(path, "/").split(/[?#]/)[0] || "/";
  const surfaceValue = text(surface, "document");
  const [base, overlay] = surfaceValue.split(":");
  const parts = clean.split("/").filter(Boolean);
  const placeId = placeIdFromPath(clean);
  if (placeId) {
    const name = lookup(ctx.names, placeId);
    return name ? name : "a place page (name not found)";
  }
  if (clean === "/") {
    if (overlay === "place") return "a place detail";
    return HOME_SURFACES[base] || "the home page";
  }
  if (parts.includes(":private")) return "a private link (share, invite or sign-in)";
  if (parts[0] === "guides") {
    if (parts.length === 1) return "the guides list";
    const title = lookup(ctx.guideTitles, parts[1]) || titleCaseSlug(parts[1]);
    return `the guide “${title}”`;
  }
  if (parts[0] === "florida-events") return parts.length === 1 ? "the Florida events page" : `the event “${titleCaseSlug(parts[1])}”`;
  if (parts[0] === "events" && parts.length >= 3) return `the ${titleCaseSlug(parts[1])} event “${titleCaseSlug(parts[2])}”`;
  if (parts[0] === "events" && parts.length === 2) return `${titleCaseSlug(parts[1])} events`;
  if (parts[0] === "things-to-do" && parts[1]) return `Things to do in ${titleCaseSlug(parts[1])}`;
  if (parts[0] === "restaurants" && parts[1]) return `Restaurants in ${titleCaseSlug(parts[1])}`;
  return titleCaseSlug(parts.at(-1));
}

function isPartnerClick(click) {
  const destination = text(click && click.destination_type).toLowerCase();
  return ["partner", "booking", "affiliate"].includes(destination) || /^\/api\/[a-z0-9-]+\/go\/?$/i.test(text(click && click.destination_path));
}

/** Classify a click into what it means for the business. */
export function clickKind(click) {
  if (isPartnerClick(click)) return "partner";
  const domain = text(click && click.outbound_domain).toLowerCase();
  if (domain) {
    if (PHOTO_CREDIT_DOMAINS.test(domain)) return "photo_credit";
    if (MAPS_DOMAINS.test(domain) || text(click.element_label) === "Directions") return "directions";
    return "outbound";
  }
  const label = text(click && click.element_label);
  if (label === "Share") return "share";
  if (label === "Sign in") return "sign_in";
  if (label === "Save") return "save";
  if (click && click.place_id) return "place";
  return text(click && click.destination_type) === "internal" ? "internal" : "other";
}

/** One click as a sentence fragment: "opened the card for Lake Eola Park". */
export function clickWords(click, ctx = {}) {
  const placeId = text(click && click.place_id) || placeIdFromPath(click && click.destination_path);
  const name = placeId ? lookup(ctx.names, placeId) : null;
  const on = name ? ` for ${name}` : "";
  const domain = text(click && click.outbound_domain);
  const label = text(click && click.element_label);
  switch (clickKind(click)) {
    case "partner": return `tapped a partner booking link${on} (earns commission)`;
    case "photo_credit": return `tapped a photo credit and was sent to ${domain}`;
    case "directions": return `tapped Directions${name ? ` to ${name}` : ""} (${/apple/.test(domain) ? "Apple Maps" : "Google Maps"})`;
    case "outbound": return `tapped a link to ${domain}${on}`;
    case "share": return `tapped Share${name ? ` on ${name}` : ""}`;
    case "sign_in": return "tapped Sign in";
    case "save": return name ? `saved ${name}` : "tapped Save";
    default: break;
  }
  if (label) return `tapped ${label}${on}`;
  if (name) return `opened the card for ${name}`;
  if (text(click && click.destination_path)) return `tapped a link to ${pageTitle(click.destination_path, "document", ctx)}`;
  return "tapped something unlabeled";
}

const secondsWords = (sec) => {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  if (n < 60) return `${n} sec`;
  const m = Math.floor(n / 60);
  const rest = n % 60;
  return rest ? `${m} min ${rest} sec` : `${m} min`;
};

const pct = (part, whole) => whole ? Math.round((part / whole) * 100) : 0;

function whenWords(ms) {
  if (!ms) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric" }).format(new Date(ms));
  } catch (e) { return null; }
}

function sessionTraits(events) {
  const firstWith = (key) => events.find((row) => text(row[key]))?.[key];
  const firstVisit = events.find((row) => row.event === "page_visit");
  const country = text(firstWith("country")).toUpperCase() || null;
  const device = text(firstWith("device")) || null;
  const referrer = text(firstVisit && firstVisit.referrer_domain) || null;
  const clicks = events.filter((row) => row.event === "element_click");
  return { country, device, referrer, clicks };
}

function sessionStory(events, ctx) {
  const steps = [];
  const visitStep = new Map();
  let previous = null;
  let lastPage = null;
  let activeTotal = 0;
  const visitActive = new Map();
  for (const row of events) {
    if (row.event === "page_visit") {
      const path = text(row.page_path, "/").split(/[?#]/)[0] || "/";
      const surface = surfaceName(row);
      const key = `${path}|${surface}`;
      if (key !== previous) {
        const title = pageTitle(path, surface, ctx);
        steps.push({ kind: "page", text: steps.length ? `Opened ${title}` : `Arrived from ${sourceWords(row.referrer_domain)} on ${title}`, path, title });
        previous = key;
        lastPage = { path, surface, title };
      }
      if (row.visit_id) visitStep.set(row.visit_id, steps.length - 1);
    } else if (row.event === "page_exit" || row.event === "page_active_time") {
      const ms = number(row.active_ms) || 0;
      const id = text(row.visit_id);
      const prev = visitActive.get(id) || { active: 0, exit: null, scroll: null };
      if (row.event === "page_exit") { prev.exit = ms; prev.scroll = number(row.max_scroll_pct); } else prev.active += ms;
      visitActive.set(id, prev);
    } else if (row.event === "element_click") {
      steps.push({ kind: clickKind(row), text: clickWords(row, ctx) });
    }
  }
  for (const [id, value] of visitActive) {
    const ms = value.exit != null ? value.exit : value.active;
    activeTotal += ms;
    const index = visitStep.get(id);
    if (index == null || !steps[index]) continue;
    const bits = [];
    if (ms >= 1000) bits.push(`spent ${secondsWords(ms / 1000)}`);
    if (value.scroll != null) bits.push(`scrolled ${Math.round(value.scroll)}% down`);
    if (bits.length) steps[index].detail = bits.join(", ");
  }
  const clicks = steps.filter((step) => step.kind !== "page");
  const last = steps.at(-1);
  let outcome = "left";
  let ending;
  if (last && last.kind === "partner") { outcome = "partner"; ending = "Left for a partner booking site — the money path."; }
  else if (last && last.kind === "directions") { outcome = "directions"; ending = "Left for directions — likely heading there, but Wayfind earned nothing."; }
  else if (last && last.kind === "photo_credit") { outcome = "photo_credit"; ending = "Left through a photo credit — a pure leak."; }
  else if (last && last.kind === "outbound") { outcome = "outbound"; ending = "Left for another website."; }
  else if (!clicks.length && steps.filter((step) => step.kind === "page").length <= 1) { outcome = "one_page"; ending = `Left from ${lastPage ? lastPage.title : "the page"} without tapping anything.`; }
  else ending = `Last seen on ${lastPage ? lastPage.title : "a page"}; nothing else was recorded after that.`;
  return { steps, outcome, ending, activeSeconds: Math.round(activeTotal / 1000) };
}

function landingLeaks(sessions, ctx) {
  const byLanding = new Map();
  for (const session of sessions) {
    const firstVisit = session.events.find((row) => row.event === "page_visit");
    if (!firstVisit) continue;
    const path = text(firstVisit.page_path, "/").split(/[?#]/)[0] || "/";
    const surface = surfaceName(firstVisit);
    const key = `${path}|${surface}`;
    const item = add(byLanding, key, () => ({ path, surface, title: pageTitle(path, surface, ctx), sessions: 0, noTap: 0, partner: 0, activeValues: [], scrollValues: [] }));
    item.sessions++;
    const pages = new Set(session.events.filter((row) => row.event === "page_visit").map((row) => `${row.page_path}|${surfaceName(row)}`));
    if (!session.traits.clicks.length && pages.size <= 1) item.noTap++;
    if (session.traits.clicks.some(isPartnerClick)) item.partner++;
    const landingVisit = text(firstVisit.visit_id);
    const exit = session.events.find((row) => row.event === "page_exit" && text(row.visit_id) === landingVisit);
    const active = exit ? number(exit.active_ms) : session.events.filter((row) => row.event === "page_active_time" && text(row.visit_id) === landingVisit).reduce((sum, row) => sum + (number(row.active_ms) || 0), 0);
    if (active != null && active > 0) item.activeValues.push(active / 1000);
    const scroll = number(exit && exit.max_scroll_pct);
    if (scroll != null) item.scrollValues.push(scroll);
  }
  return [...byLanding.values()].map((row) => ({
    page_path: row.path, page_surface: row.surface, title: row.title, sessions: row.sessions,
    left_without_tapping: row.noTap, left_without_tapping_pct: pct(row.noTap, row.sessions), partner_sessions: row.partner,
    read_s_median: round(median(row.activeValues), 0), scroll_pct_median: round(median(row.scrollValues), 0),
  })).sort((a, b) => b.left_without_tapping - a.left_without_tapping || b.sessions - a.sessions);
}

function countBy(values) {
  const map = new Map();
  for (const value of values) if (value) map.set(value, (map.get(value) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

const REASON_WORDS = {
  crawler_user_agent: "a crawler or headless-browser user agent",
  posthog_bot_flag: "PostHog's own bot flag",
  no_browser_identity: "no browser or operating system reported at all",
  repeated_no_engagement: "the same empty desktop visit repeated over and over (one page, no tap, under 10 seconds, no link that sent them, identical browser and page type)",
};

function plainDiagnosis({ total, human, automated, traffic, leaks, outcomes, clickKinds, tappedPlaces, partnerPages }) {
  const out = [];
  if (automated >= 5) out.push({
    id: "automated-traffic", severity: automated >= human ? "high" : "medium",
    title: `${automated} of ${total} sessions (${pct(automated, total)}%) look automated, not human`,
    what: `Why: ${Object.entries(traffic.by_reason).filter(([, n]) => n).map(([reason, n]) => `${n} for ${REASON_WORDS[reason] || reason}`).join("; ")}. They are left out of the story below; the unfiltered numbers stay in “Filtered vs unfiltered”. Where they came from (for context only, not used to decide): ${traffic.automated_countries.slice(0, 4).map(([cc, n]) => `${cc} ${n}`).join(", ") || "unknown"}.`,
    why: "Scrapers that run a real browser look like visitors to a simple counter, and PostHog's own bot check did not catch them. That is why an older version of this report said “Date Night” was the most popular path.",
    fix: "Nothing to change on the site for the story. If they keep growing, rate-limit them at the edge, because every page they load can trigger paid map lookups.",
  });
  const worst = leaks.find((row) => row.sessions >= 5 && row.left_without_tapping_pct >= 50);
  if (worst) {
    const isGuide = /^\/guides\/[^/]+$/.test(worst.page_path);
    out.push({
      id: `leak:${worst.page_path}`, severity: "high",
      title: `Biggest leak: ${worst.left_without_tapping_pct}% of people who landed on ${worst.title} left without tapping anything`,
      what: `${worst.left_without_tapping} of ${worst.sessions} real visits. The typical reader stayed ${worst.read_s_median != null ? secondsWords(worst.read_s_median) : "an unmeasured time"}${worst.scroll_pct_median != null ? ` and stopped about ${worst.scroll_pct_median}% of the way down` : ""}. They were interested enough to read, then ran out of reasons to tap.`,
      why: isGuide
        ? `On guides the one booking button lived at the very end, after every pick. Readers who stop around ${worst.scroll_pct_median != null ? worst.scroll_pct_median : "halfway"}% never see it.`
        : "The first clear next step (book, save, see nearby) is not in front of them before they stop.",
      fix: isGuide
        ? "Shipped: a slim booking bar now follows readers down every guide once they pass the intro, and hides when the real button is on screen. Next: give the top two picks their own ticket button."
        : "Put one clear next step in the first screen of this page, and a Save button so they can come back.",
    });
  }
  if (outcomes.directions >= 3) out.push({
    id: "directions-exit", severity: "medium",
    title: `${outcomes.directions} visits ended with Directions (Google or Apple Maps)`,
    what: "That's a real win for the visitor — they're heading out — but Wayfind earned nothing and lost them to Google.",
    why: "Directions is the last button on the place page, and there's no reason to come back afterwards.",
    fix: "On places that sell tickets, put the ticket/tour button beside Directions. Ask them to Save the place (sign-up prompt) before they leave, so they come back next time.",
  });
  if (outcomes.photo_credit >= 1 || clickKinds.photo_credit >= 1) out.push({
    id: "photo-credit-exit", severity: "medium",
    title: `${clickKinds.photo_credit} taps on photo credits sent people to Unsplash or other photo sites`,
    what: "The photo credit link opened in the same tab, so the reader left Wayfind to look at a stock-photo page.",
    why: "Credits are required by the photo license, but they were plain links.",
    fix: "Shipped: photo credits now open in a new tab, so Wayfind stays open behind them.",
  });
  out.push({
    id: "money-path", severity: clickKinds.partner ? "info" : "high",
    title: clickKinds.partner ? `${clickKinds.partner} partner booking taps — this is the money path` : "No partner booking taps from real people in this period",
    what: clickKinds.partner
      ? `They came from ${partnerPages.slice(0, 3).map(([page, n]) => `${page} (${n})`).join(", ")}. A tap is not a booking; paid earnings show on the Places tab.`
      : "Nobody tapped a tickets/tours link, so there was nothing for partners to pay on.",
    why: "",
    fix: clickKinds.partner ? "Put more of these links where readers actually are: the pages above with the most readers." : "Start with the biggest leak above: that's where the readers are.",
  });
  if (tappedPlaces.length) out.push({
    id: "top-places", severity: "info",
    title: `Most-tapped places: ${tappedPlaces.slice(0, 5).map(([name, n]) => `${name} (${n})`).join(", ")}`,
    what: "These are the place cards and links real people chose.",
    why: "",
    fix: "Make sure each of these has a working ticket, tour or deal button and good photos. They are your proven demand.",
  });
  out.push({
    id: "engagement", severity: (clickKinds.sign_in + clickKinds.share + clickKinds.save) ? "info" : "medium",
    title: `Sign-ups, shares and saves: ${clickKinds.sign_in} Sign-in taps, ${clickKinds.share} Share taps, ${clickKinds.save} Save taps`,
    what: `Out of ${human} real visits.`,
    why: "Save, share and sign-in only show up after someone opens a place. Most readers never get that far (see the biggest leak).",
    fix: "Offer “Save this guide” and “Send to a friend” right where readers stop, not only at the end of the page.",
  });
  return out;
}

export function buildVisitorReport(inputRows, { truncated = false, diagnostics = [], diagnosticsTruncated = false, names = null, guideTitles = null } = {}) {
  const ctx = { names, guideTitles };
  const allRows = (Array.isArray(inputRows) ? inputRows : []).map((row) => ({ ...row, _at: new Date(row.timestamp).getTime() || 0 }));
  // Split people from automated sessions BEFORE anything is ranked.
  const sessionsById = new Map();
  for (const row of allRows) {
    const sessionId = text(row.session_id);
    if (sessionId) add(sessionsById, sessionId, () => []).push(row);
  }
  for (const events of sessionsById.values()) events.sort((a, b) => a._at - b._at);
  const quality = classifySessions(sessionsById);
  const humanSessions = [];
  const automatedSessionIds = new Set();
  const allSessions = [];
  for (const [id, events] of sessionsById) {
    const session = { events, traits: sessionTraits(events) };
    allSessions.push(session);
    if (quality.bySession.get(id)?.automated) automatedSessionIds.add(id);
    else humanSessions.push(session);
  }
  const rows = allRows.filter((row) => !automatedSessionIds.has(text(row.session_id)));
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
  if (automatedSessionIds.size) notes.push(`${automatedSessionIds.size} sessions matched the automated-traffic rule (${quality.summary.rule_version}: crawler user agent, PostHog bot flag, no browser identity, or a repeated empty desktop visit) and are excluded from every section. Raw totals are in the traffic comparison.`);
  const findings = findingsFor({ pageAttention, exits, heatmap, diagnostics, truncated });

  // Names for every aggregate row, so the UI never has to guess from a URL.
  for (const row of journeys) row.titles = row.path.map((path, index) => pageTitle(path, row.surfaces[index], ctx));
  for (const row of pageAttention) row.title = pageTitle(row.page_path, row.page_surface, ctx);
  for (const row of exits) row.title = pageTitle(row.page_path, row.page_surface, ctx);
  for (const row of lastClicks) { row.title = pageTitle(row.page_path, row.page_surface, ctx); row.words = clickWords(row, ctx); }
  for (const row of heatmap) row.title = pageTitle(row.page_path, row.page_surface, ctx);

  const stories = humanSessions.map((session) => ({ ...sessionStory(session.events, ctx), traits: session.traits, startedAt: session.events[0]?._at || 0 }));
  const outcomes = { partner: 0, directions: 0, photo_credit: 0, outbound: 0, one_page: 0, left: 0 };
  for (const story of stories) outcomes[story.outcome] = (outcomes[story.outcome] || 0) + 1;
  const humanClicks = humanSessions.flatMap((session) => session.traits.clicks);
  const clickKinds = { partner: 0, directions: 0, photo_credit: 0, outbound: 0, share: 0, sign_in: 0, save: 0, place: 0, internal: 0, other: 0 };
  for (const click of humanClicks) clickKinds[clickKind(click)]++;
  const tappedPlaces = countBy(humanClicks.map((click) => {
    const id = text(click.place_id) || placeIdFromPath(click.destination_path);
    return id ? lookup(names, id) : null;
  }));
  const partnerPages = countBy(humanSessions.flatMap((session) => session.events
    .filter((row) => row.event === "element_click" && isPartnerClick(row))
    .map((row) => pageTitle(row.page_path, surfaceName(row), ctx))));
  const leaks = landingLeaks(humanSessions, ctx);
  const human = humanSessions.length;
  const total = sessionsById.size;
  const topLanding = [...leaks].sort((a, b) => b.sessions - a.sessions)[0] || null;
  const story = {
    sessions_total: total,
    sessions_people: human,
    sessions_automated: automatedSessionIds.size,
    traffic: {
      ...quality.summary,
      // Same landing-page table computed twice, so the effect of the rule is
      // visible rather than asserted.
      comparison: {
        unfiltered: landingLeaks(allSessions, ctx).sort((a, b) => b.sessions - a.sessions).slice(0, 8).map(({ title, sessions, left_without_tapping_pct }) => ({ title, sessions, left_without_tapping_pct })),
        filtered: [...leaks].sort((a, b) => b.sessions - a.sessions).slice(0, 8).map(({ title, sessions, left_without_tapping_pct }) => ({ title, sessions, left_without_tapping_pct })),
      },
    },
    outcomes,
    clicks: clickKinds,
    headline: human
      ? `${human} real visit${human === 1 ? "" : "s"}. ${outcomes.one_page} (${pct(outcomes.one_page, human)}%) read one page and left without tapping anything; ${outcomes.partner} ended on a partner booking link.`
      : "No real visits were measured for these dates.",
    top_landing: topLanding,
    leaks: leaks.filter((row) => row.sessions >= 2).slice(0, 10),
    tapped_places: tappedPlaces.slice(0, 10),
    diagnosis: human ? plainDiagnosis({ total, human, automated: automatedSessionIds.size, traffic: quality.summary, leaks, outcomes, clickKinds, tappedPlaces, partnerPages }) : [],
    // Most recent first. Only coarse traits (source, device, country) and
    // an hour-level time — never a session, visit or person id.
    visits: stories.sort((a, b) => b.startedAt - a.startedAt).slice(0, 25).map((item) => ({
      when: whenWords(item.startedAt),
      source: sourceWords(item.traits.referrer),
      device: item.traits.device || "Unknown device",
      country: item.traits.country || null,
      active_s: item.activeSeconds,
      outcome: item.outcome,
      steps: item.steps.map((step) => (step.detail ? `${step.text} — ${step.detail}` : step.text)),
      ending: item.ending,
    })),
  };
  return { coverage, journeys, pageAttention, lastClicks, exits, heatmap, findings, story };
}
