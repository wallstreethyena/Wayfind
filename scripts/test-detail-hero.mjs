// scripts/test-detail-hero.mjs — compact Detail sheet when there is no real
// place photo. The Links Garage screenshot (250px pin-on-gradient) was
// BrandedImageFallback: Detail always reserved a 250px hero and FallbackImg
// of a missing src painted the branded pin. A photo-led hero exists ONLY
// when hasRealPlacePhoto(detail) is true.
import { readFileSync } from "fs";
import ts from "typescript";
import { hasRealPlacePhoto, mergeHealedPlacePhotos, detailHeroLayout } from "../lib/detailHero.js";
import { detailLocationLine } from "../lib/locationHonesty.js";
import { PLACE_DETAIL_PHOTO_STANDARD } from "../lib/placeDetailPhotoStandard.js";

let failures = 0;
const fail = (m) => { console.error("test-detail-hero: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

// Runtime state transition protection, wired through this existing build guard.
// Late photos use the same large default as initially available photos.
const compact = detailHeroLayout(null, "place-a", false);
ok(compact.expanded === false, "a photoless arrival starts compact");
ok(detailHeroLayout(compact, "place-a", true).expanded === true, "late photo receives the full-width gallery");
ok(detailHeroLayout(compact, "place-a", false) === compact, "failed photo keeps compact geometry");
const gallery = detailHeroLayout(compact, "place-b", true);
ok(gallery.expanded === true, "a different place with a photo starts with its full gallery");
ok(detailHeroLayout(gallery, "place-b", false).expanded === false, "a genuine miss collapses the media frame");
ok(detailHeroLayout(gallery, "place-c", false).expanded === false, "a different photoless place resets to compact");
ok(detailHeroLayout(compact, "place-a", false, true).expanded === true, "pending acquisition reserves the same full-width frame");
ok(PLACE_DETAIL_PHOTO_STANDARD.frame.width === "100%" && PLACE_DETAIL_PHOTO_STANDARD.frame.aspectRatio === "16 / 9", "shared place-detail frame is full width and16:9");
ok(PLACE_DETAIL_PHOTO_STANDARD.frame.minHeight === 220 && PLACE_DETAIL_PHOTO_STANDARD.frame.maxHeight === 420, "shared media height is bounded220–420px");
ok(PLACE_DETAIL_PHOTO_STANDARD.image.objectFit === "cover" && PLACE_DETAIL_PHOTO_STANDARD.image.objectPosition === "center", "shared place-detail image fills its frame from the center");

const REAL_REF = "places/ChIJ1234567890abcdef/photos/AX1234567890abcdef";
const REAL_PROXY = "/api/photo?ref=" + encodeURIComponent(REAL_REF) + "&w=640";
const OWNED_PLACE_PROXY = "/api/photo?place=ChIJa7bjTAB_54gR-M-m-KIOCP0&w=640";
const REAL_HTTPS = "https://lh3.googleusercontent.com/p/AF1QipRealPlacePhoto=w640";

// real photos[] → hero
ok(hasRealPlacePhoto({ photos: [REAL_PROXY] }) === true, "photos[] with a Google photo proxy → hero");
ok(hasRealPlacePhoto({ photos: [REAL_HTTPS] }) === true, "photos[] with a real https image → hero");
ok(hasRealPlacePhoto({ photos: [{ name: REAL_REF }] }) === true, "photos[] of Google photo objects → hero");
ok(hasRealPlacePhoto({ photos: [{ _directUri: REAL_HTTPS }] }) === true, "photos[] of {_directUri} https objects → hero");

// photoRef / photo that is a real Google photo → hero
ok(hasRealPlacePhoto({ photoRef: REAL_REF }) === true, "photoRef Google resource name → hero");
ok(hasRealPlacePhoto({ photo_ref: REAL_REF }) === true, "photo_ref Google resource name → hero");
ok(hasRealPlacePhoto({ photo: REAL_PROXY }) === true, "photo /api/photo?ref= with a real Google ref → hero");
ok(hasRealPlacePhoto({ photo: OWNED_PLACE_PROXY }) === true, "owned inventory /api/photo?place= with an exact place id → hero");
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
ok(hasRealPlacePhoto({ photo: "/api/photo?place=bad%20id&w=640" }) === false, "place-photo proxy with an invalid place id → compact");
ok(hasRealPlacePhoto({ photo: "/api/photo?w=640" }) === false, "photo proxy without a ref or place identity → compact");

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

// Compact still shows the sheet's decision surface. The location line is
// detailLocationLine: a street stays a street, a stored city is not replaced
// by the nearest covered market.
ok(/detail\.name/.test(detailSrc) && /detailLocationLine\(detail\)/.test(detailSrc),
  "compact sheet still renders the name and the location line");
ok(detailLocationLine({ name: "Links Garage", address: "25 S Links Ave, Sarasota", lat: 27.3364, lng: -82.5307 }) === "25 S Links Ave, Sarasota",
  "a street address still shows on the compact sheet");

// Heal-on-open: fetchPlaceDetail must ask for photos; openDetail must merge them.
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const fn = google.indexOf("export async function fetchPlaceDetail(");
ok(fn >= 0, "fetchPlaceDetail is still in lib/google.js");
const body = google.slice(fn, google.indexOf("\n}", google.indexOf("catch", fn)));
ok(/kind:\s*"detail"/.test(body),
  "fetchPlaceDetail asks the guarded rich-detail route for healing data");
const detailsRoute = readFileSync(new URL("../app/api/places/details/route.js", import.meta.url), "utf8");
ok(/detail:\s*"[^"]*photos/.test(detailsRoute),
  "the fixed rich-detail field mask asks for photos so a photoless list row can heal");

// Owned place identities must open even when paid enrichment is unavailable.
{
  const routeBody = detailsRoute.replace(/^import .*;$/gm, "").replace(/export /g, "");
  const compile = new Function("NextResponse", "gateShut", "spendAllow", "getInventoryIdentity", "process", "fetch", routeBody + "\nreturn POST;");
  let paidCalls = 0;
  const post = compile({ json: (body, options) => ({ body, status: options?.status || 200 }) },
    () => true, async () => { paidCalls++; return false; },
    async (id) => id === "ChIJowned" ? { place_id: id, name: "Owned family venue", lat: 27.3, lng: -82.5, signals: { rating: 4.7, reviews: 900 } } : null,
    { env: { GOOGLE_MAPS_SERVER_KEY: "test-only" } }, async () => { paidCalls++; throw new Error("No paid calls allowed"); });
  const owned = await post({ json: async () => ({ placeId: "ChIJowned", kind: "place" }) });
  ok(owned.body.place?.id === "ChIJowned" && owned.body.source === "inventory", "owned card opens from inventory with spending gate shut");
  const missing = await post({ json: async () => ({ placeId: "ChIJmissing", kind: "place" }) });
  ok(!missing.body.place && missing.body.error === "gate shut", "missing identity still respects spending gate");
  ok(paidCalls === 0, "owned identity and closed gate do not spend on Google");
}

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/mergeHealedPlacePhotos\s*\(/.test(home),
  "openDetail merges healed photos onto the already-open sheet");
ok(/setDetail\(\s*p\s*\)/.test(home),
  "openDetail still setDetail(p) immediately so the sheet opens fast");
ok(/setDetail\(\s*p\s*\)\s*;[\s\S]{0,120}setDetail\(\s*attachOfficialScoreReceipt/.test(home),
  "receipt attach is a same-turn follow-up after setDetail(p), not a replacement of the first paint");

// List PlaceCard monogram is out of this cut — pin the existing branch so this
// PR cannot silently redesign it.
ok(/wf-place-card-monogram/.test(home),
  "list PlaceCard monogram markup is still present");
ok(/cardInitials/.test(home) && /split\(\/\\s\+\/\)/.test(home),
  "list PlaceCard monogram initials logic is unchanged");

// A /p/{id} arrival may keep the populated Home shell mounted for Back, but
// an unrelated homepage poster must not be the visual backdrop of the shared
// park. The exact place photo owns the arrival; the retained shell stays
// hidden under an opaque neutral layer until the sheet closes.
ok(/isSharedPlaceArrival:\s*!!initialPlaceId/.test(home),
  "the shared-place route marks its initial detail presentation");
ok(/isSharedPlaceArrival\s*\?\s*\{\s*\.\.\.sheetBg,\s*background:\s*["']#050608["']\s*\}\s*:\s*sheetBg/.test(detailSrc),
  "shared place arrivals hide unrelated homepage posters behind an opaque neutral backdrop");

// Execute the actual hero JSX, including each layout branch, in the build guard.
// This catches regressions back to a thumbnail or letterboxed image.
const ast = ts.createSourceFile('Detail.jsx', detailSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let heroNode;
function findHero(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(p => p.name?.text === 'data-detail-hero')) heroNode = node;
  ts.forEachChild(node, findHero);
}
findHero(ast);
ok(!!heroNode, 'runtime hero fixture locates the shipped JSX');
const heroJs = ts.transpileModule('const render = () => (' + heroNode.getText(ast) + ');', { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
const createElement = (type, props, ...children) => ({ type, props: props || {}, children });
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...node.children.flatMap(walk)];
for (const [label, expandedHero, showHero, liveId, photos, galleryIdx = 0] of [
  ['existing gallery', true, true, 'ChIJfixture', ['portrait.jpg', 'wide.jpg']],
  ['last gallery photo', true, true, 'ChIJfixture', ['portrait.jpg', 'wide.jpg'], 1],
  ['late photo', true, true, 'ChIJfixture', ['portrait.jpg']],
  ['late owned photo', true, true, null, ['owned.jpg']],
  ['pending photo', true, false, 'ChIJfixture', []],
  ['terminal no-photo', false, false, 'ChIJfixture', []],
  ['no photo lookup', false, false, null, []],
]) {
  let openedPhoto, galleryDirection;
  const ctx = { expandedHero, showHero, liveId, galleryPhotos: photos, heroSrc: photos[0], galleryIdx,
    detail: { name: 'Fixture place' }, PLACE_DETAIL_PHOTO_STANDARD, C: {}, FallbackImg: 'fixture-image', galleryRef: null,
    onGalleryScroll() {}, scrollGallery(direction) { galleryDirection = direction; }, galleryBtn: () => ({}), setLightbox(src) { openedPhoto = src; },
    primaryCategory: () => 'Food', isLivePlaceId: id => !!id };
  const render = new Function('React', ...Object.keys(ctx), heroJs + ';return render;')({ createElement, Fragment: 'fragment' }, ...Object.values(ctx));
  const nodes = walk(render());
  const images = nodes.filter(n => n.type === 'fixture-image');
  ok(images.length === photos.length, label + ': every available gallery photo renders');
  ok(images.every(n => n.props.fit === 'cover'), label + ': every detail image fills the frame without letterboxing');
  const slideWidth = photos.length > 1 ? '78%' : '100%';
  ok(images.every(n => n.props.style.width === slideWidth && n.props.style.height === '100%'), label + ': ' + (photos.length > 1 ? 'each photo peeks the next at 78% and still fills its slide' : 'a single photo fills the frame'));
  for (const image of images) { image.props.onClick(); ok(openedPhoto === image.props.src, label + ': tapping keeps the original photo source for its full-size viewer'); }
  const media = nodes.find(n => 'data-detail-photo-media' in n.props);
  ok(!!media === expandedHero, label + ': full media exists only for a real photo or pending acquisition');
  if (media) for (const [key, value] of Object.entries(PLACE_DETAIL_PHOTO_STANDARD.frame)) ok(media.props.style[key] === value, label + ': media uses shared ' + key);
  ok(!nodes.some(n => 'data-detail-photo-preview' in n.props), label + ': no square thumbnail preview');
  const title = nodes.find(n => n.children.includes('Fixture place'));
  ok(!!title && !nodes.some(n => n.props.style?.position === 'absolute' && walk(n).includes(title)), label + ': title is not painted over photo');
  if (media) ok(nodes.indexOf(media) < nodes.indexOf(title) && !walk(media).includes(title), label + ': full-width photo is above a separate headline');
  ok(nodes.some(n => n.props['aria-label'] === 'Back'), label + ': Back control remains available');
  if (label === 'pending photo') ok(nodes.some(n => 'data-detail-photo-pending' in n.props), 'pending photo reserves the full frame without a fallback image');
  if (!expandedHero) ok(nodes.some(n => 'data-detail-photo-unavailable' in n.props), label + ': compact truthful no-photo text');
  if (photos.length > 1) {
    const direction = galleryIdx > 0 ? -1 : 1;
    const arrow = nodes.find(n => n.props['aria-label'] === (direction === -1 ? 'Previous photo' : 'Next photo'));
    ok(!!arrow, label + ': gallery keeps its photo navigation control');
    arrow?.props.onClick(); ok(galleryDirection === direction, label + ': gallery control keeps its direction');
    ok(nodes.some(n => n.props['aria-hidden'] === 'true' && n.children.includes(galleryIdx + 1) && n.children.includes(photos.length)), label + ': gallery keeps its current-photo counter');
    ok(nodes.some(n => n.props.onScroll === ctx.onGalleryScroll && n.props.style.scrollSnapType === 'x mandatory'), 'gallery keeps native swipe and snap');
  }
}

if (failures) process.exit(1);
console.log("test-detail-hero: OK — shared full-width cover frame above headline for initial/late photos; same frame while pending; genuine misses compact; gallery/viewer controls preserved; heal-on-open stays truthful");
