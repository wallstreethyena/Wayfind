// lib/preserveRedirectParams.js — preserve campaign attribution and location
// query parameters across Wayfind's client-side shortlink/share redirects
// (/s/[code], /l/*, ShareRedirect) without touching storage.
//
// Inside the native iOS shell (isNative() === true), ad click identifiers are
// NEVER forwarded so ATT / privacy-label invariants hold everywhere.

import { isNative } from "./native.js";

const ALWAYS_SAFE_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "wf_test",
  "wf_meta_test",
  "wf_st", // share attribution token (lib/shareAttribution.js): random, names nothing
  "loc",
  "city",
  "near",
]);

const CLICK_ID_KEYS = new Set([
  "fbclid",
  "ttclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
]);

function safeParamValue(val) {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 200) return null;
  // Never propagate emails, URLs, or control characters in redirect params.
  if (/[@\s\\<>]/.test(trimmed) || /^https?:/i.test(trimmed)) return null;
  return trimmed;
}

function normPathname(p) {
  const s = String(p || "").trim();
  if (!s) return "";
  return s.length > 1 ? s.replace(/\/+$/, "") : s;
}

/**
 * Merge allowlisted incoming query parameters from `currentSearch` onto an
 * internal destination `to` (e.g. "/?place=abc") without overwriting params
 * already present on `to`. External destinations are returned untouched.
 * If `currentPathname` matches `to`'s pathname (e.g. "/s/abc" -> "/s/abc"),
 * rewrite the destination pathname to "/" to prevent redirect loops.
 */
export function preserveRedirectParams(to, currentSearch, currentPathname = "") {
  if (typeof to !== "string" || !to.startsWith("/") || to.startsWith("//")) return to;
  const hashIdx = to.indexOf("#");
  const base = hashIdx >= 0 ? to.slice(0, hashIdx) : to;
  const hash = hashIdx >= 0 ? to.slice(hashIdx) : "";
  const qIdx = base.indexOf("?");
  const rawPathname = qIdx >= 0 ? base.slice(0, qIdx) : base;
  const existingStr = qIdx >= 0 ? base.slice(qIdx + 1) : "";
  const curNorm = normPathname(currentPathname);
  const selfLoop = Boolean(curNorm && curNorm !== "/" && normPathname(rawPathname) === curNorm);
  const pathname = selfLoop ? "/" : rawPathname;
  if (!selfLoop && (typeof currentSearch !== "string" || !currentSearch || currentSearch === "?")) return to;
  let incoming = null;
  if (typeof currentSearch === "string" && currentSearch && currentSearch !== "?") {
    try {
      incoming = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
    } catch {
      incoming = null;
    }
  }
  const native = isNative();
  let out;
  try {
    out = new URLSearchParams(selfLoop ? "" : existingStr);
  } catch {
    return selfLoop ? "/" : to;
  }
  let changed = selfLoop;
  if (incoming) {
    for (const [key, rawVal] of incoming.entries()) {
      const k = String(key || "").toLowerCase();
      const allowed = ALWAYS_SAFE_KEYS.has(k) || (!native && CLICK_ID_KEYS.has(k));
      if (!allowed || out.has(key) || out.has(k)) continue;
      const cleanVal = safeParamValue(rawVal);
      if (!cleanVal) continue;
      out.set(k, cleanVal);
      changed = true;
    }
  }
  if (!changed) return to;
  const qs = out.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash}`;
}
