// lib/pageShareUrl.js — the URL a destination page's Share button sends.
//
// Its own module, deliberately: lib/site.js is imported by the homepage client
// bundle, and a helper exported from there ships to every homepage visitor
// whether or not anything on the homepage calls it (measured: +0.9KB gz on a
// budget with 6.5KB of headroom). Only destination pages import this file.
import { canonicalShareUrl, SITE_URL } from "./site.js";

// 2026-09-23 —
//
// Owner, after the #1464 push check: the Florida Events page a notification
// opened had no Share button at all. The audit behind the fix found the same
// hole on most destination templates (city lists, place pages, trending,
// partners, the guide index...), so every destination now renders the ONE
// standard control, app/components/ShareButton.js, over a URL built here on
// the SERVER. scripts/check-destination-share.mjs holds the page registry.
//
// What this builds, and why each rule exists:
//   · the canonical production origin, never the host that rendered the page
//     (a preview or dev host is unopenable for the recipient — canonicalShareUrl)
//   · the page's own path, so the recipient lands on THIS page, not the homepage
//   · the page's filter context: query params the page reads are kept
//   · minus anything that describes the SENDER's visit rather than the page:
//     ad click ids, utm tags, email tracking, Vercel share tokens, and the
//     app-internal wf_* handoffs (wf_resume would replay the offline resume).
//     Forwarding someone's gclid misattributes the next visit to their ad click.
//   · no #fragment: a scroll position is not part of the destination.
const SHARE_DROP_PARAM = /^(?:utm_[a-z0-9_]+|mc_(?:cid|eid)|_hs(?:enc|mi|msgid)|fbclid|gclid|gbraid|wbraid|dclid|msclkid|ttclid|twclid|igshid|li_fat_id|yclid|_vercel_share|x-vercel-[a-z-]+|wf_[a-z0-9_]+)$/i;

export function pageShareUrl(path, searchParams) {
  let u;
  try { u = new URL(String(path || "/"), SITE_URL); } catch (e) { return SITE_URL + "/"; }
  const add = (k, v) => {
    if (v == null || v === "") return;
    u.searchParams.append(k, String(v));
  };
  try {
    if (searchParams) {
      const entries = typeof searchParams.entries === "function" && !Array.isArray(searchParams)
        ? Array.from(searchParams.entries())
        : Object.entries(searchParams);
      for (const [k, v] of entries) {
        if (Array.isArray(v)) v.forEach((x) => add(k, x)); else add(k, v);
      }
    }
  } catch (e) {}
  for (const k of Array.from(new Set(u.searchParams.keys()))) {
    if (SHARE_DROP_PARAM.test(k)) u.searchParams.delete(k);
  }
  u.hash = "";
  return canonicalShareUrl(u.toString());
}
