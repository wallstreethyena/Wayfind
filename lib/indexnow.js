// IndexNow (SEO engine 2026-11-23): tells Bing, Yandex, Seznam, Naver and the
// other IndexNow engines the moment a Wayfind page changes, so new and updated
// event pages get crawled in hours instead of weeks. Bing also feeds ChatGPT
// search. Free, no account. The key is public by design: the engines fetch
// https://www.gowayfind.com/<key>.txt and check it matches before trusting a
// submission. Only our own URLs are ever submitted.

export const INDEXNOW_KEY = "ebdb4032ac1a9545fbd4633a4fc618a9";
export const INDEXNOW_HOST = "www.gowayfind.com";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_MAX_URLS = 10000;

// Normalise a path or URL to an absolute https://www.gowayfind.com URL, or
// null when it points anywhere else (never submit another site's page).
export function indexNowUrl(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  const raw = input.trim();
  let u;
  try {
    u = raw.startsWith("/") ? new URL(raw, `https://${INDEXNOW_HOST}`) : new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== INDEXNOW_HOST && host !== "gowayfind.com") return null;
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  // Partner redirect and API paths are never pages to index.
  if (u.pathname.startsWith("/api/")) return null;
  u.protocol = "https:";
  u.hostname = INDEXNOW_HOST;
  u.hash = "";
  return u.toString();
}

export function buildIndexNowPayload(inputs) {
  const seen = new Set();
  const urlList = [];
  for (const i of Array.isArray(inputs) ? inputs : []) {
    const u = indexNowUrl(i);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    urlList.push(u);
    if (urlList.length >= INDEXNOW_MAX_URLS) break;
  }
  return { host: INDEXNOW_HOST, key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_LOCATION, urlList };
}
