// Only live, mounted card images use this request. No disk or browser storage.
const inflight = new Map();

export function cardPhotoRequest(src) {
  if (typeof src !== "string" || !src.startsWith("/api/photo?")) return null;
  const u = new URL(src, "https://www.gowayfind.com");
  const ref = u.searchParams.get("ref") || "";
  const id = /^places\/([A-Za-z0-9_-]+)\/photos\//.exec(ref)?.[1] || u.searchParams.get("place");
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return null;
  const q = new URLSearchParams({ place: id, s: "card", fmt: "json", w: "1200" });
  if (u.searchParams.get("nospend") === "1") q.set("nospend", "1");
  return "/api/photo?" + q;
}

export function fetchCardPhoto(url, fetchImpl = fetch) {
  if (inflight.has(url)) return inflight.get(url);
  const pending = Promise.resolve().then(async () => {
    try {
      const r = await fetchImpl(url, { cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || typeof j.src !== "string" || !/^(https:\/\/|\/(?!\/))/.test(j.src)) return null;
      // The Google source link must accompany the exact shown image.
      if (j.source === "google" && !/^https:\/\//.test(j.credit?.mapsUri || "")) return null;
      return j;
    } catch { return null; }
    finally { inflight.delete(url); }
  });
  inflight.set(url, pending);
  return pending;
}
