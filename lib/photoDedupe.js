// One key per picture so a card rail or detail rail never shows the same photo twice.
// Two copies match when their normalized URLs match or when both carry the same
// stored perceptual hash (signals gallery entries may hold a `phash` field).
export function normalizePhotoUrl(src) {
  let s = String(src || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s, "https://www.gowayfind.com");
    let path = decodeURIComponent(u.pathname).replace(/\/+/g, "/").replace(/\/$/, "");
    // /_next/image?url=... wraps the real source
    if (path === "/_next/image" && u.searchParams.get("url")) return normalizePhotoUrl(u.searchParams.get("url"));
    // Supabase render/sign endpoints point at the same object as /object/public
    path = path.replace("/storage/v1/render/image/public/", "/storage/v1/object/public/").replace("/storage/v1/object/sign/", "/storage/v1/object/public/");
    return (u.host.toLowerCase().replace(/^www\./, "") + path).toLowerCase();
  } catch {
    return s.split("?")[0].split("#")[0].toLowerCase();
  }
}

export function photoHashKey(entry) {
  const h = entry && typeof entry === "object" ? String(entry.phash || entry.hash || "").trim().toLowerCase() : "";
  return /^[0-9a-f]{16}$/.test(h) ? "h:" + h : "";
}

/** Keeps the first copy of each picture. `getSrc` reads the URL from an item. */
export function dedupePhotos(items, getSrc = (p) => (p && (p.src || p.url)) || "") {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const keys = [normalizePhotoUrl(typeof item === "string" ? item : getSrc(item)), photoHashKey(item)].filter(Boolean);
    if (!keys.length || keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(item);
  }
  return out;
}
