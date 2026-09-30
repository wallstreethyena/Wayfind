// Session-level traffic quality for the owner's visitor story. Pure: no fetch,
// no React. Decides which sessions are "likely automated" from evidence the
// session itself carries — never from where the visitor is (country is kept
// only as a descriptive label on the result).
//
// Why a rule of our own at all: in 2026-09 roughly 800 desktop sessions a week
// loaded moment, place and event pages with no referrer, no tap, ~5 s in front,
// and PostHog's $virt_is_bot flagged NONE of them. They were more than half of
// all "sessions" and they were the Command Center's headline path. The client
// already refuses known crawler UAs (lib/browserAnalytics.isKnownBot), so what
// reaches PostHog is the traffic that looks like a browser.
//
// Tiers (a session is excluded when ANY hard reason holds):
//   crawler_user_agent        $raw_user_agent matches the same crawler/headless
//                             pattern the client uses (a UA the client missed,
//                             e.g. an older build, still gets caught here)
//   posthog_bot_flag          PostHog's own $virt_is_bot
//   no_browser_identity       neither $browser nor $os resolved AND no tap —
//                             real browsers report both; a tapping visitor is
//                             kept even if UA parsing failed
//   repeated_no_engagement    one page, zero taps, under QUICK_EXIT_MS in front,
//                             no referrer, desktop, AND the same
//                             browser|os|page-type fingerprint repeats in at
//                             least REPEAT_MIN such sessions in the window.
//                             One quick bounce is a person; the same empty
//                             bounce stamped out again and again is a script.
//                             Phones and tablets are never excluded by this
//                             tier: a link opened from a chat app has no
//                             referrer and a quick mobile bounce is normal.
// Soft (kept as people, only counted): no_engagement — a single quick bounce.
//
// Nothing is deleted. The report carries raw and filtered totals side by side
// and a per-reason count, so a wrong rule shows up as a visible gap.

import { isKnownBot } from "../browserAnalytics.js";

export const TRAFFIC_RULE_VERSION = "tq-2026-09-30";
export const QUICK_EXIT_MS = 10_000;
export const REPEAT_MIN = 5;

const text = (value) => String(value == null ? "" : value).trim();
const num = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
const truthy = (value) => ["true", "1"].includes(text(value).toLowerCase());

export function pageKind(path) {
  const clean = text(path).split(/[?#]/)[0] || "/";
  if (clean === "/") return "home";
  if (/^\/(?:p|places)\//.test(clean)) return "place";
  if (/^\/guides\/[^/]+/.test(clean)) return "guide";
  if (/^\/events\/[^/]+\/[^/]+/.test(clean)) return "event-detail";
  if (/^\/florida-events\/[^/]+/.test(clean)) return "event-detail";
  return clean.split("/").filter(Boolean).slice(0, 1).join("/") || "home";
}

/** Everything the rule needs, read from one session's events (sorted). */
export function sessionSignals(events) {
  const first = (key) => { for (const row of events) if (text(row[key])) return text(row[key]); return ""; };
  const visits = events.filter((row) => row.event === "page_visit");
  const pages = new Set(visits.map((row) => `${text(row.page_path)}|${text(row.page_surface)}`));
  const byVisit = new Map();
  for (const row of events) {
    if (row.event !== "page_exit" && row.event !== "page_active_time") continue;
    const id = text(row.visit_id);
    const cur = byVisit.get(id) || { exit: null, flush: 0 };
    if (row.event === "page_exit") cur.exit = Math.max(cur.exit || 0, num(row.active_ms) || 0);
    else cur.flush += num(row.active_ms) || 0;
    byVisit.set(id, cur);
  }
  let activeMs = 0;
  for (const value of byVisit.values()) activeMs += value.exit != null ? value.exit : value.flush;
  return {
    ua: first("user_agent"),
    browser: first("browser"),
    os: first("os"),
    device: first("device"),
    country: first("country").toUpperCase() || null,
    referrer: text(visits[0] && visits[0].referrer_domain),
    landingKind: pageKind(visits[0] && visits[0].page_path),
    pages: pages.size,
    clicks: events.filter((row) => row.event === "element_click").length,
    activeMs,
    posthogBot: events.some((row) => truthy(row.ph_bot)),
    // Only a source that SELECTED the identity columns can say they are
    // missing; rows without the keys at all (older callers, fixtures) are
    // "not measured", never "no identity".
    identityMeasured: events.some((row) => Object.hasOwn(row, "browser") || Object.hasOwn(row, "os")),
  };
}

const noEngagement = (sig) => sig.clicks === 0 && sig.pages <= 1 && sig.activeMs < QUICK_EXIT_MS;
const fingerprint = (sig) => `${sig.browser || "?"}|${sig.os || "?"}|${sig.landingKind}`;

/**
 * @param {Map<string, object[]>|Array<[string, object[]]>} sessions id -> sorted events
 * @returns {{ bySession: Map<string, {automated: boolean, reasons: string[], soft: string[], signals: object}>, summary: object }}
 */
export function classifySessions(sessions) {
  const entries = sessions instanceof Map ? [...sessions.entries()] : [...(sessions || [])];
  const signals = new Map(entries.map(([id, events]) => [id, sessionSignals(events)]));
  const repeatCount = new Map();
  for (const sig of signals.values()) {
    if (noEngagement(sig) && !sig.referrer && sig.device === "Desktop") {
      const key = fingerprint(sig);
      repeatCount.set(key, (repeatCount.get(key) || 0) + 1);
    }
  }
  const bySession = new Map();
  const byReason = { crawler_user_agent: 0, posthog_bot_flag: 0, no_browser_identity: 0, repeated_no_engagement: 0 };
  let automated = 0;
  let softNoEngagement = 0;
  const automatedCountries = new Map();
  for (const [id, sig] of signals) {
    const reasons = [];
    if (sig.ua && isKnownBot(sig.ua)) reasons.push("crawler_user_agent");
    if (sig.posthogBot) reasons.push("posthog_bot_flag");
    // Zero taps required too: if PostHog ever fails to parse a new phone
    // build's UA, a real reader who taps anything must not vanish.
    if (sig.identityMeasured && !sig.browser && !sig.os && sig.clicks === 0) reasons.push("no_browser_identity");
    if (noEngagement(sig) && !sig.referrer && sig.device === "Desktop" && (repeatCount.get(fingerprint(sig)) || 0) >= REPEAT_MIN) reasons.push("repeated_no_engagement");
    const soft = !reasons.length && noEngagement(sig) ? ["no_engagement"] : [];
    if (reasons.length) {
      automated++;
      for (const reason of reasons) byReason[reason]++;
      const cc = sig.country || "??";
      automatedCountries.set(cc, (automatedCountries.get(cc) || 0) + 1);
    } else if (soft.length) softNoEngagement++;
    bySession.set(id, { automated: reasons.length > 0, reasons, soft, signals: sig });
  }
  return {
    bySession,
    summary: {
      rule_version: TRAFFIC_RULE_VERSION,
      thresholds: { quick_exit_s: QUICK_EXIT_MS / 1000, repeat_min: REPEAT_MIN },
      raw_sessions: signals.size,
      people_sessions: signals.size - automated,
      automated_sessions: automated,
      by_reason: byReason,
      people_quick_bounces: softNoEngagement,
      // Descriptive only — country never decides the classification.
      automated_countries: [...automatedCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    },
  };
}
