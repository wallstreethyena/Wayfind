// scripts/test-detail-hero.mjs — compact Detail sheet when there is no real
// place photo. The Links Garage screenshot (250px pin-on-gradient) was
// BrandedImageFallback: Detail always reserved a 250px hero and FallbackImg
// of a missing src painted the branded pin. A photo-led hero exists ONLY
// when hasRealPlacePhoto(detail) is true.
import { readFileSync } from "fs";
import { hasRealPlacePhoto, mergeHealedPlacePhotos } from "../lib/detailHero.js";

let failures = 0;
const fail = (m) => { console.error("test-detail-hero: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

const REAL_REF = "places/ChIJ1234567890abcdef/photos/AX1234567890abcdef";
const REAL_PROXY = "/api/photo?ref=" + encodeURIComponent(REAL_REF) + "&w=640";
const REAL_HTTPS = "https://lh3.googleusercontent.com/p/AF1QipRealPlacePhoto=w640";

// real photos[] → hero
ok(hasRealPlacePhoto({ photos: [REAL_PROXY] }) === true, "photos[] with a Google photo proxy → hero");
ok(hasRealPlacePhoto({ photos: [REAL_HTTPS] }) === true, "photos[] with a real https image → hero");
ok(hasRealPlacePhoto({ photos: [{ name: REAL_REF }] }) === true, "photos[] of Google photo objects → hero");

// photoRef / photo that is a real Google photo → hero
ok(hasRealPlacePhoto({ photoRef: REAL_REF }) === true, "photoRef Google resource name → hero");
ok(hasRealPlacePhoto({ photo_ref: REAL_REF }) === true, "photo_ref Google resource name → hero");
ok(hasRealPlacePhoto({ photo: REAL_PROXY }) === true, "photo /api/photo?ref= with a real Google ref → hero");
ok(hasRealPlacePhoto({ photo: REAL_HTTPS }) === true, "photo https Google image → hero");

// missing / empty / branded-fallback-only → compact
ok(hasRealPlacePhoto(null) === false, "null detail → compact");
ok(hasRealPlacePhoto({}) === false, "empty detail → compact");
ok(hasRealPlacePhoto({ photos: [] }) === false, "empty photos[] → compact");
ok(hasRealPlacePhoto({ photos: [""] }) === false, "photos[] of empty strings → compact");
ok(hasRealPlacePhoto({ photo: "" }) === false, "empty photo → compact");
ok(hasRealPlacePhoto({ photo: null, photoRef: "", photos: [] }) === false, "all-empty photo fields → compact");
ok(hasRealPlacePhoto({ photoRef: "not-a-google-photo" }) === false, "non-Google photoRef → compact");
ok(hasRealPlacePhoto({ photo: "/api/photo?ref=bogus" }) === false, "photo proxy with an invalid ref → compact");

// Stock is scene-setting, never a photo of that named business.
ok(hasRealPlacePhoto({ photo: "https://images.pexels.com/photos/123/sarasota-beach.jpg" }) === false,
  "Pexels stock on photo must not count as a photo of the named business");
ok(hasRealPlacePhoto({ photos: ["https://www.pexels.com/photo/x"] }) === false,
  "Pexels stock in photos[] must not count as a real place photo");
ok(hasRealPlacePhoto({ photo: "/api/market-photo?q=food+Sarasota" }) === false,
  "market-photo stock chrome must not become a Detail hero");

// Heal: only attach what Places actually returned. Never invent a ref.
{
  const row = { id: "ChIJ", name: "Links Garage", address: "25 S Links Ave, Sarasota" };
  ok(hasRealPlacePhoto(row) === false, "photoless list row starts compact");
  const failed = mergeHealedPlacePhotos(row, { ok: false, photos: [REAL_PROXY], photoRef: REAL_REF });
  ok(failed === row, "a failed Places fetch must not donate photos");
  ok(hasRealPlacePhoto(failed) === false, "failed heal stays compact");
  const none = mergeHealedPlacePhotos(row, { ok: true, photos: [], photo: null, photoRef: null });
  ok(none === row, "Places returning none is fail-closed — no invented photo_ref");
  const healed = mergeHealedPlacePhotos(row, { ok: true, photos: [REAL_PROXY], photo: REAL_PROXY, photoRef: REAL_REF });
  ok(healed !== row && hasRealPlacePhoto(healed) === true, "a real Google photo upgrades compact → hero");
  ok(healed.photoRef === REAL_REF && healed.photos[0] === REAL_PROXY, "heal copies the returned ref and proxy URL, nothing else");
  const already = { ...row, photos: [REAL_HTTPS] };
  const keep = mergeHealedPlacePhotos(already, { ok: true, photos: [REAL_PROXY], photoRef: REAL_REF });
  ok(keep.photos[0] === REAL_HTTPS, "an already-real gallery is not replaced");
}

// Detail.js must not still paint a 250px branded pin when there is no real photo.
const detailSrc = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
ok(/hasRealPlacePhoto\s*\(\s*detail\s*\)/.test(detailSrc),
  "Detail.js must consult hasRealPlacePhoto(detail) before painting a hero");
ok(/from ["']\.\.\/\.\.\/\.\.\/lib\/detailHero["']/.test(detailSrc) || /from ["']\.\.\/\.\.\/\.\.\/lib\/detailHero\.js["']/.test(detailSrc),
  "Detail.js imports hasRealPlacePhoto from lib/detailHero");

// The exact shipped bug: empty photos[] fell through to FallbackImg of
// detail.photo at height 250, which is BrandedImageFallback when src is missing.
ok(!/\{\s*detail\.photos && detail\.photos\.length > 0 \?[\s\S]{0,1200}?:\s*\(\s*<FallbackImg src=\{detail\.photo\}[^>]*height:\s*250/.test(detailSrc),
  "ungated 250px FallbackImg of detail.photo is gone — that is the branded-pin hero");

const heroBranch = detailSrc.includes("hasRealPlacePhoto(detail)")
  ? detailSrc.slice(detailSrc.indexOf("hasRealPlacePhoto(detail)"))
  : "";
ok(heroBranch.length > 80, "hasRealPlacePhoto(detail) is used in the render path");
ok(!/height:\s*250[\s\S]{0,240}BrandedImageFallback|BrandedImageFallback[\s\S]{0,240}height:\s*250/.test(detailSrc),
  "Detail must not render a 250px BrandedImageFallback hero");

// Compact still shows the sheet's decision surface.
ok(/detail\.name/.test(detailSrc) && /detail\.address/.test(detailSrc),
  "compact sheet still has name and address");

// Heal-on-open: fetchPlaceDetail must ask for photos; openDetail must merge them.
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const fn = google.indexOf("export async function fetchPlaceDetail(");
ok(fn >= 0, "fetchPlaceDetail is still in lib/google.js");
const body = google.slice(fn, google.indexOf("\n}", google.indexOf("catch", fn)));
const fieldsM = body.match(/fields:\s*\[([^\]]+)\]/);
ok(!!fieldsM, "fetchPlaceDetail still passes a fields array");
ok(fieldsM && fieldsM[1].includes('"photos"'),
  "fetchPlaceDetail asks for photos so a photoless list row can heal");

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/mergeHealedPlacePhotos\s*\(/.test(home),
  "openDetail merges healed photos onto the already-open sheet");
ok(/setDetail\(\s*p\s*\)/.test(home),
  "openDetail still setDetail(p) immediately so the sheet opens fast");

// List PlaceCard monogram is out of this cut — pin the existing branch so this
// PR cannot silently redesign it.
ok(/wf-place-card-monogram/.test(home),
  "list PlaceCard monogram markup is still present");
ok(/cardInitials/.test(home) && /split\(\/\\s\+\/\)/.test(home),
  "list PlaceCard monogram initials logic is unchanged");

if (failures) process.exit(1);
console.log("test-detail-hero: OK — real photos[] / Google photoRef → hero; missing, empty, branded-fallback, and stock → compact; Detail no longer paints a 250px branded pin; heal-on-open asks for photos and fails closed");
