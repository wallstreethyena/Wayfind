// Durable Viator Book lock. A SKU that is dead, hopped, wrong-place, or
// denylisted cannot become a Book CTA through isLiveEligible, a place pin,
// commerce resolve, /api/viator/go, or /api/viator/tours.
//
// Status codes are not proof of life. A 200 whose H1 is "Sorry, this product
// is unavailable", a soft-404 body, a searchResults landing, or a dest/SKU
// hop is dead. Fail closed — never a neighbor SKU, never a city search that
// looks like Book.
//
// HOLD entries are CODE, not comments. Adding a later placePick of a
// denylisted SKU cannot merge: placePickIsLive / isLiveEligible / resolveOffer
// all refuse it.
//
// Codes live in lib/viatorDenylist.js so the homepage chunk does not
// pull inspect / HTML parsers. Re-export so existing callers stay put.

export {
  PRODUCT_CODE_RE,
  VIATOR_SKU_DENYLIST,
  deniedViatorReason,
  isDeniedViatorSku,
  isViatorSearchOrHomeUrl,
  normalizeProductCode,
  placePickIsLive,
} from "./viatorDenylist.js";

import { PRODUCT_CODE_RE, deniedViatorReason, isDeniedViatorSku, isViatorSearchOrHomeUrl } from "./viatorDenylist.js";

export function parseViatorProductUrl(url) {
  const m = String(url || "").match(PRODUCT_CODE_RE);
  if (!m) return null;
  return { destId: m[1], productCode: m[2] };
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ");
}

function extractTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og) return decodeEntities(og[1]).replace(/\s+\|\s+Viator.*$/i, "").trim();
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return t ? decodeEntities(t[1]).replace(/\s+\|\s+Viator.*$/i, "").trim() : "";
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return "";
  return decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function pageNamesPlace(hay, placeName, city) {
  const h = String(hay || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const place = String(placeName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!h || !place) return false;
  if (h.includes(place)) return "place";
  const tokens = place.split(" ").filter((t) => t.length >= 4);
  const hit = tokens.filter((t) => h.includes(t)).length;
  if (tokens.length >= 2 && hit >= Math.min(2, tokens.length)) return "place-tokens";
  if (city) {
    const c = String(city)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (c && h.includes(c) && hit >= 1) return "city+token";
  }
  return false;
}

// Pure. Callers pass a fetched (or fixture) body. A 200 is never enough.
export function inspectViatorProductPage(input = {}) {
  const startUrl = String(input.startUrl || input.url || "");
  const finalUrl = String(input.finalUrl || startUrl);
  const body = String(input.body || "");
  const httpStatus = Number(input.httpStatus);
  const placeName = input.placeName || "";
  const city = input.city || "";
  const parsed = parseViatorProductUrl(startUrl);
  const out = {
    ok: false,
    livePageOk: false,
    destHop: false,
    productCode: parsed && parsed.productCode,
    destId: parsed && parsed.destId,
    startUrl,
    finalUrl,
    httpStatus: Number.isFinite(httpStatus) ? httpStatus : 0,
    title: "",
    h1: "",
    named: false,
    reason: "",
  };

  if (isViatorSearchOrHomeUrl(startUrl)) {
    out.reason = "start-url-is-searchResults";
    return out;
  }
  if (!parsed) {
    out.reason = "url-is-not-a-product-path";
    return out;
  }
  if (isDeniedViatorSku(parsed.productCode)) {
    out.reason = deniedViatorReason(parsed.productCode);
    return out;
  }
  if (isViatorSearchOrHomeUrl(finalUrl)) {
    out.reason = "redirected-to-searchResults";
    return out;
  }
  const finalParsed = parseViatorProductUrl(finalUrl);
  if (finalUrl && !finalParsed) {
    out.reason = "final-url-is-not-a-product-path";
    return out;
  }
  if (finalParsed && finalParsed.productCode.toUpperCase() !== parsed.productCode.toUpperCase()) {
    out.destHop = true;
    out.reason = `redirected-to-other-product:${finalParsed.productCode}`;
    out.productCode = finalParsed.productCode;
    out.destId = finalParsed.destId;
    return out;
  }
  if (finalParsed && finalParsed.destId !== parsed.destId) {
    out.destHop = true;
    out.reason = `redirected-to-other-dest:${finalParsed.destId}`;
    out.destId = finalParsed.destId;
    return out;
  }

  if (body) {
    if (/<title[^>]*>\s*404/i.test(body) || /there is no such page/i.test(body)) {
      out.reason = "soft-404";
      return out;
    }
    out.title = extractTitle(body);
    out.h1 = extractH1(body);
    if (/sorry,\s*this product is unavailable/i.test(`${out.h1} ${out.title} ${body}`)) {
      out.reason = "product-unavailable";
      return out;
    }
    if (placeName) {
      out.named = pageNamesPlace(`${out.title} ${out.h1} ${finalUrl}`, placeName, city);
      if (!out.named) {
        out.reason = "page-does-not-name-place-or-city";
        return out;
      }
    }
  } else if (Number.isFinite(httpStatus) && httpStatus > 0 && httpStatus !== 200) {
    // No body and a non-200: fail closed. A 200 with no body is also not
    // proof — callers that cannot supply a body must not claim live.
    out.reason = `http-${httpStatus}`;
    return out;
  } else if (!body) {
    out.reason = "no-page-body";
    return out;
  }

  out.ok = true;
  out.livePageOk = true;
  out.reason = "verified";
  return out;
}

// Book-click destination. A missing/failed product never becomes search or
// the Viator homepage. Honest Search Viator uses intent=search separately.
export function chooseViatorGoLocation(input = {}) {
  const rawProduct = String(input.rawProduct || "");
  const resolvedProductUrl = String(input.resolvedProductUrl || "");
  const intent = String(input.intent || "");
  const searchUrl = typeof input.searchUrl === "function" ? input.searchUrl : null;
  const siteFallback = input.siteFallback || "/";

  const refuse = (reason, resolverPath) => ({
    ok: false,
    location: siteFallback,
    resolver_path: resolverPath,
    reason,
  });

  const acceptProduct = (url, resolverPath) => {
    if (isViatorSearchOrHomeUrl(url)) return refuse("search-is-not-book", "search-is-not-book");
    const parsed = parseViatorProductUrl(url);
    if (parsed && isDeniedViatorSku(parsed.productCode)) {
      return refuse(deniedViatorReason(parsed.productCode), "denied-sku");
    }
    if (isDeniedViatorSku(input.productCode)) {
      return refuse(deniedViatorReason(input.productCode), "denied-sku");
    }
    return { ok: true, location: url, resolver_path: resolverPath, reason: "product" };
  };

  if (rawProduct) return acceptProduct(rawProduct, "exact-product");
  if (resolvedProductUrl) return acceptProduct(resolvedProductUrl, "product");
  if (intent === "search" && typeof searchUrl === "function") {
    const url = searchUrl();
    if (url) return { ok: true, location: url, resolver_path: "search", reason: "search-intent" };
  }
  return refuse("no-verified-product", "fail-closed");
}
