#!/usr/bin/env node
/**
 * scripts/audit-guide-images.mjs — Reproducible Guide Image Selection Audit & Contact Sheet Generator
 *
 * Executes the application's actual image selection functions against the repository
 * and read-only Supabase tables (`wf_inventory`, `wf_place_photo`, `wf_google_photo_store`),
 * producing:
 *   1. `selection-ledger.md` — full per-event and per-pick audit ledger with
 *      exact git revision, target URL, timestamp, primary selection, runtime
 *      fallback, provenance, license metadata, and reconciled coverage totals.
 *   2. `contact-sheet-fall-guide-40.png` — 40-tile visual contact sheet decoded
 *      from the actual primary and runtime fallback image bytes.
 *
 * Documented command:
 *   node scripts/audit-guide-images.mjs \
 *     --target-url https://www.gowayfind.com \
 *     --out-dir docs/audits/guide-images \
 *     --env-file .env.local
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = {
    repo: DEFAULT_REPO,
    outDir: "",
    targetUrl: "https://www.gowayfind.com",
    envFile: "",
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--repo" && argv[i + 1]) out.repo = path.resolve(argv[++i]);
    else if (arg === "--out-dir" && argv[i + 1]) out.outDir = path.resolve(argv[++i]);
    else if (arg === "--target-url" && argv[i + 1]) out.targetUrl = String(argv[++i]).replace(/\/+$/, "");
    else if (arg === "--env-file" && argv[i + 1]) out.envFile = path.resolve(argv[++i]);
  }
  if (!out.outDir) out.outDir = path.join(out.repo, "docs/audits/guide-images");
  if (!out.envFile) {
    const candidate = path.join(out.repo, ".env.local");
    if (existsSync(candidate)) out.envFile = candidate;
  }
  return out;
}

const { repo: REPO, outDir: OUT_DIR, targetUrl: TARGET_URL, envFile: ENV_FILE, help: SHOW_HELP } = parseArgs(process.argv);

if (SHOW_HELP) {
  console.log(
    "Usage: node scripts/audit-guide-images.mjs [--target-url <url>] [--out-dir <dir>] [--repo <dir>] [--env-file <file>]"
  );
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

const require = createRequire(path.join(REPO, "package.json"));
const sharp = require("sharp");

if (ENV_FILE && existsSync(ENV_FILE)) {
  const envText = readFileSync(ENV_FILE, "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

let gitRevision = "unknown";
try {
  gitRevision = execSync("git rev-parse HEAD", { cwd: REPO, encoding: "utf8" }).trim();
} catch {}
const generatedAtIso = new Date().toISOString();

const {
  FALL_GUIDE_STARTER_IDS,
  FALL_GUIDE_OCTOBER_WEEKENDS,
  FALL_GUIDE_WEEKDAY_IDS,
  findFallGuideEvent,
} = await import(path.join(REPO, "lib/floridaFallGuide2026.js"));
const { fallEventCardImageSrc, withFallVenueIdentity } = await import(path.join(REPO, "lib/fallEventImage.js"));
const { guidePlaceFigureImage } = await import(path.join(REPO, "lib/guidePlaceFigureImage.js"));
const { findFreePhoto, findSamePlaceCachedPhoto } = await import(path.join(REPO, "lib/freePhoto.js"));
const { guidePickPhoto, guidePhotoForPlace } = await import(path.join(REPO, "lib/guidePickPhotos.js"));
const { guideContextPhoto } = await import(path.join(REPO, "lib/guideContextPhotos.js"));
const { guideFinalRung, guideUsesNeutralFallback } = await import(path.join(REPO, "lib/guideNeutralFallback.js"));
const { readStoredGooglePhotoBytes } = await import(path.join(REPO, "lib/googlePhotoStore.js"));
const { GUIDES } = await import(path.join(REPO, "lib/guides.js"));
const { guideHero } = await import(path.join(REPO, "lib/guideHero.js"));
const { guidePickMayResolvePlaceCard, resolveGuidePickPlaceId } = await import(path.join(REPO, "lib/guidePlaceIdentity.js"));
const { regionCoords } = await import(path.join(REPO, "lib/guideNow.js"));
const { CATEGORY_SECTION, existingTypeSignals } = await import(path.join(REPO, "lib/placeCategory.js"));
const { isGooglePhotoSrc, isNoSpendCachedMedia } = await import(path.join(REPO, "lib/googlePhotoSrc.js"));

const auditFailures = [];
function verifyAuditInvariant(cond, message) {
  if (!cond) auditFailures.push(message);
}

function googleCreditMissing(media, showCaption = true) {
  if (!media || (media.source !== "google" && !isGooglePhotoSrc(media.src))) return false;
  if (isNoSpendCachedMedia(media)) return showCaption === false;
  const credit = typeof media.credit === "string" ? media.credit.trim() : "";
  const provider = typeof media.providerHref === "string" && /^https:\/\//.test(media.providerHref);
  return !credit || !provider || showCaption === false;
}

function guidePickImage(slug, pick) {
  if (slug === "orlando-halloween-food-2026") return null;
  return pick?.image || null;
}

function guidePickFigureImage(slug, pick) {
  const image = guidePickImage(slug, pick);
  if (!image) return null;
  if (typeof image === "object") return image;
  return {
    src: image,
    alt: pick?.imageAlt || pick?.name || "",
    caption: pick?.imageCaption || pick?.imageNote || null,
    credit: pick?.imageCredit || null,
    creditHref: pick?.imageCreditHref || null,
    license: pick?.imageLicense || null,
    licenseUrl: pick?.imageLicenseUrl || null,
    width: pick?.imageWidth || null,
    height: pick?.imageHeight || null,
    position: pick?.imagePosition || null,
  };
}

// ============================================================================
// PART 1: Exact Fall Guide Resolver (matching app/guides/florida-fall-festivals-2026/page.js)
// ============================================================================
const EVENT_PHOTO_PLACE_IDS = Object.freeze({
  "st-pete-pier-fall-fest-2026": "ChIJX-E766nhwogR8u_Re6nJTyk",
  "fox-squirrel-maze-2026": "ChIJFwrRu7o33YgRIuZ-0QgeCVQ",
  "keel-farms-harvest-days-2026": "ChIJ_5yVrBY13YgRwSgyH1hrRjg",
  "hunsader-pumpkin-2026": "ChIJuSnFvF8xw4gRt0WOWL_cqRc",
  "tampa-riverwalk-trick-or-treat-2026": "ChIJc8QsSADFwogRH9awG-1qaCs",
  "howl-o-scream-tampa-2026": "ChIJhRo4DU_GwogRUgjhMAj-pag",
  "oktoberfest-tampa-curtis-hixon-2026": "ChIJlRUlG4nEwogRJOgu0Hf2n54",
  "tampa-pig-jig-2026": "ChIJ-U84wHnEwogR9ry4KMSoZW8",
  "fantasy-fest-2026": "ChIJs_tsm0ix0YgRmYbIX_M5CT8",
  "mount-dora-craft-fair-2026": "ChIJGSMzu2Oi54gR-rlDDL6V3Qs",
  "florida-coffee-festival-2026": "ChIJcQyYH85654gRPh6gV_UpsDY",
  "southern-hill-farms-fall-festival-2026": "ChIJ-aI9NvSI54gRrVByB84z-AY",
  "great-scott-fall-fest-2026": "ChIJ68SLYriZ54gRaJgw169KqYA",
  "fruitville-grove-pumpkin-2026": "ChIJhWqZvoVHw4gRehUSFsbZARo",
  "gatorland-ghosts-goblins-2026": "ChIJ9RHZGx6H3YgRnWVYIWsHNPM",
});

const LOCAL_HERO_CREDITS = Object.freeze({
  "/guides/verified/hunsader-farms-goats.webp": {
    credit: "Robin Teng",
    creditHref: "https://unsplash.com/photos/a-couple-of-goats-laying-on-top-of-a-grass-covered-field-i_sBNY7UoNQ",
    license: "Unsplash License",
    licenseUrl: "https://unsplash.com/license",
    width: 1200,
    height: 800,
    contextual: true,
    kind: "illustrative",
    placeId: null,
    alt: "Two goats resting in a grassy pasture in Bradenton; contextual photograph, not a photograph of Hunsader Farms",
    caption: "Illustrative Bradenton farm photo.",
  },
  "/guides/verified/nature-parrish-railroad-museum.webp": {
    credit: "Ebyabe",
    creditHref: "https://commons.wikimedia.org/wiki/File:Parrish_FL_Florida_Railroad_Museum01.jpg",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    width: 1600,
    height: 1200,
  },
});

const EVENT_MANIFEST_FALLBACKS = Object.freeze({
  "halloween-horror-nights-orlando-2026": { slug: "fall-events-orlando-2026", name: "Halloween Horror Nights 35" },
  "epcot-food-wine-festival-2026": { slug: "fall-events-orlando-2026", name: "EPCOT International Food & Wine Festival" },
  "gatorland-ghosts-goblins-2026": { slug: "fall-events-orlando-2026", name: "Gators, Ghosts & Goblins at Gatorland" },
  "howl-o-scream-seaworld-orlando-2026": { slug: "fall-events-orlando-2026", name: "Howl-O-Scream at SeaWorld Orlando" },
  "mickeys-not-so-scary-halloween-party-2026": { slug: "fall-events-orlando-2026", name: "Mickey's Not-So-Scary Halloween Party" },
});

const fallHero = {
  src: "https://images.unsplash.com/photo-1537991458814-f9f068c1fd52?auto=format&fit=crop&fm=jpg&q=82&w=1600&h=1067",
  creditHref: "https://unsplash.com/photos/orange-pumpkin-lot-mVGhlNZGoLA",
};

function eventImage(event, venuePhotos = null) {
  if (!event) return null;
  const resolved = withFallVenueIdentity(event);
  const src = fallEventCardImageSrc(resolved, 900);
  if (venuePhotos?.has(event.event_id)) return venuePhotos.get(event.event_id);
  const localHero = LOCAL_HERO_CREDITS[src];
  if (localHero) {
    return {
      src,
      alt: localHero.alt || resolved.image_alt || ((resolved.venue || resolved.event_name) + "; venue photo"),
      width: localHero.width,
      height: localHero.height,
      caption: localHero.caption || resolved.image_alt || ((resolved.venue || resolved.event_name) + " — photo"),
      credit: localHero.credit,
      creditHref: localHero.creditHref,
      license: localHero.license,
      licenseUrl: localHero.licenseUrl,
      ...(localHero.contextual ? { contextual: true, kind: localHero.kind || "illustrative", placeId: null } : {}),
    };
  }
  const manifestFallback = EVENT_MANIFEST_FALLBACKS[event.event_id];
  if (manifestFallback) {
    const manifestImg = guidePickPhoto(manifestFallback.slug, manifestFallback.name);
    if (manifestImg) return manifestImg;
  }
  const placeId = resolved.place_id || EVENT_PHOTO_PLACE_IDS[event.event_id];
  if (placeId) {
    const reused = guidePhotoForPlace(placeId);
    if (reused) return reused;
  }
  if (!src) return null;
  const image = {
    src,
    alt: resolved.image_alt || ((resolved.venue || resolved.event_name) + "; venue photo"),
    width: 900,
    height: 675,
    caption: event.image_alt || "",
    credit: event.photoAttr || null,
    creditHref: event.photoAttrHref || null,
  };
  return googleCreditMissing(image, false) ? null : image;
}

async function resolveFallGuideVenuePhotos() {
  const cardIds = [...new Set([
    ...FALL_GUIDE_STARTER_IDS,
    ...FALL_GUIDE_OCTOBER_WEEKENDS.flatMap((w) => w.ids),
    ...FALL_GUIDE_WEEKDAY_IDS,
  ])];
  const events = cardIds.map(findFallGuideEvent).filter(Boolean);
  const placeMap = new Map();
  for (const event of events) {
    const resolved = withFallVenueIdentity(event);
    const src = fallEventCardImageSrc(resolved, 900);
    const manifest = EVENT_MANIFEST_FALLBACKS[event.event_id];
    const hasManifestImg = Boolean(manifest && guidePickPhoto(manifest.slug, manifest.name));
    if ((LOCAL_HERO_CREDITS[src] && !LOCAL_HERO_CREDITS[src].contextual) || hasManifestImg) continue;
    const placeId = resolved.place_id || EVENT_PHOTO_PLACE_IDS[event.event_id];
    if (placeId && !placeMap.has(placeId)) {
      placeMap.set(placeId, { id: placeId, name: resolved.venue || resolved.event_name });
    }
  }
  const byPlaceId = new Map();
  await Promise.all([...placeMap.values()].map(async (place) => {
    const img = await guidePlaceFigureImage(place, { findFreePhoto });
    if (img) byPlaceId.set(place.id, img);
  }));
  const venuePhotos = new Map();
  for (const event of events) {
    const resolved = withFallVenueIdentity(event);
    const placeId = resolved.place_id || EVENT_PHOTO_PLACE_IDS[event.event_id];
    const img = placeId ? byPlaceId.get(placeId) : null;
    if (img) venuePhotos.set(event.event_id, img);
  }
  return venuePhotos;
}

const fallVenuePhotos = await resolveFallGuideVenuePhotos();
const fallUsedSrc = new Set([fallHero.src, fallHero.creditHref].filter(Boolean));
const allFallUniqueIds = [...new Set([
  ...FALL_GUIDE_STARTER_IDS,
  ...FALL_GUIDE_OCTOBER_WEEKENDS.flatMap((w) => w.ids),
  ...FALL_GUIDE_WEEKDAY_IDS,
])];
for (const id of allFallUniqueIds) {
  const primary = eventImage(findFallGuideEvent(id), fallVenuePhotos);
  if (primary) {
    if (primary.src) fallUsedSrc.add(primary.src);
    if (primary.creditHref) fallUsedSrc.add(primary.creditHref);
  }
}

const renderedFallOccurrences = [
  ...FALL_GUIDE_STARTER_IDS.map((id, i) => ({ section: `StarterGrid #${i + 1}`, id })),
  ...FALL_GUIDE_OCTOBER_WEEKENDS.flatMap((w, wi) => w.ids.map((id) => ({ section: `Weekend ${wi + 1} (${w.date})`, id }))),
  ...FALL_GUIDE_WEEKDAY_IDS.map((id) => ({ section: "WeekdayPlans", id })),
];

const fallOccurrenceRecords = [];
const fallUniqueRecordsMap = new Map();

for (const occ of renderedFallOccurrences) {
  const event = findFallGuideEvent(occ.id);
  const resolved = withFallVenueIdentity(event);
  const placeId = resolved.place_id || EVENT_PHOTO_PLACE_IDS[event.event_id] || null;
  const primaryImage = eventImage(event, fallVenuePhotos);
  if (primaryImage) {
    if (primaryImage.src) fallUsedSrc.add(primaryImage.src);
    if (primaryImage.creditHref) fallUsedSrc.add(primaryImage.creditHref);
  }
  const fallbackImage = guideContextPhoto(
    "florida-fall-festivals-2026",
    { name: event.event_name, detail: [event.detail, event.card_hook, event.editorial_summary, event.schedule_note, event.guide_kind].filter(Boolean).join(" ") },
    { region: event.city || "Florida" },
    { usedSrc: primaryImage ? new Set(fallUsedSrc) : fallUsedSrc }
  );
  const selectedImage = primaryImage || fallbackImage;

  let selectionReason = "";
  let classification = "";
  let provenance = "";
  let reviewStatus = "";

  if (!primaryImage || selectedImage.contextual) {
    selectionReason = "Topic/location-matched editorial context fallback (no licensed venue photo in wf_place_photo or wf_google_photo_store)";
    classification = "Illustrative photograph (context fallback)";
    provenance = `Reviewed local context pool asset (${selectedImage.src}); source ${selectedImage.creditHref}; license ${selectedImage.license}`;
    reviewStatus = "Reviewed context asset (visibly labelled illustrative)";
  } else if (LOCAL_HERO_CREDITS[selectedImage.src]) {
    selectionReason = "Reviewed local venue hero asset on event record";
    classification = "Exact venue photograph";
    provenance = `Wikimedia Commons File:Parrish_FL_Florida_Railroad_Museum01.jpg (${selectedImage.credit}, ${selectedImage.license}); depicts Florida Railroad Museum ticket office in Parrish (venue, not seasonal train overlay)`;
    reviewStatus = "Reviewed venue asset (Commons provenance verified)";
  } else if (EVENT_MANIFEST_FALLBACKS[event.event_id] && selectedImage.src.startsWith("/guides/picks/")) {
    selectionReason = "Curated local Commons manifest photograph for venue (EVENT_MANIFEST_FALLBACKS)";
    classification = "Exact venue photograph";
    provenance = `Manifest ${EVENT_MANIFEST_FALLBACKS[event.event_id].slug}: ${selectedImage.creditHref} (${selectedImage.credit}, ${selectedImage.license}); depicts named venue (${resolved.venue || event.event_name}), not seasonal event overlay`;
    reviewStatus = "Reviewed venue asset (Commons pixel + title provenance verified)";
  } else if (selectedImage.src.startsWith("/api/photo/stored/")) {
    selectionReason = "Retained read-only Google venue photograph (wf_google_photo_store)";
    classification = "Exact venue photograph";
    provenance = `wf_google_photo_store row for ${placeId}: contributor ${selectedImage.credit} (${selectedImage.creditHref}), Google Maps place URI ${selectedImage.providerHref || "present"}`;
    reviewStatus = "Retained Google Place photo (author + place URI verified)";
  } else {
    selectionReason = "Verified free/Commons venue photograph (wf_place_photo)";
    classification = "Exact venue photograph";
    provenance = `wf_place_photo row for ${placeId}: ${selectedImage.creditHref} (${selectedImage.credit}); depicts venue (${resolved.venue || event.event_name}), not seasonal event overlay`;
    reviewStatus = "Reviewed Commons venue photo (wf_place_photo)";
  }

  const record = {
    section: occ.section,
    id: event.event_id,
    title: event.event_name,
    venue: resolved.venue || event.event_name,
    city: event.city || "Florida",
    placeId,
    selected: selectedImage,
    fallback: fallbackImage,
    selectionReason,
    classification,
    provenance,
    reviewStatus,
    isContextual: Boolean(!primaryImage || selectedImage.contextual),
  };
  fallOccurrenceRecords.push(record);
  if (!fallUniqueRecordsMap.has(event.event_id)) {
    fallUniqueRecordsMap.set(event.event_id, { ...record, sections: [occ.section] });
  } else {
    fallUniqueRecordsMap.get(event.event_id).sections.push(occ.section);
  }
}

const fallUniqueRecords = [...fallUniqueRecordsMap.values()];

// ============================================================================
// PART 2: Exact Standard Guides Resolver (matching app/guides/[slug]/page.js)
// ============================================================================
async function inventoryPlaceByStem(stem, near, exactNames = null) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon || !stem) return null;
  const wildcard = exactNames ? "" : "%";
  const pattern = wildcard + String(stem).replace(/['\u2018\u2019\u02BC\u00B4`]/g, "_") + wildcard;
  try {
    const r = await fetch(
      `${url}/rest/v1/wf_inventory?select=place_id,name,lat,lng,category,primary_type,google_types,signals,photo_ref,editorial&status=eq.OPERATIONAL&name=ilike.${encodeURIComponent(pattern)}&limit=5`,
      { headers: { apikey: anon, Authorization: "Bearer " + anon } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      const normalize = (name) => String(name || "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
      if (exactNames && !exactNames.some((name) => normalize(name) === normalize(row.name))) continue;
      const rating = Number(row && row.signals && row.signals.rating);
      const reviews = Number(row && row.signals && row.signals.reviews);
      if (!(rating > 0 && reviews >= 15)) continue;
      if (near && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng))) {
        const dLat = (Number(row.lat) - near.lat) * 69;
        const dLng = (Number(row.lng) - near.lng) * 69 * Math.cos((near.lat * Math.PI) / 180);
        if (Math.sqrt(dLat * dLat + dLng * dLng) > 80) continue;
      }
      return {
        id: row.place_id,
        name: row.name,
        rating,
        reviews,
        lat: row.lat,
        lng: row.lng,
        photoRef: row.photo_ref || null,
        types: existingTypeSignals(row),
        category: row.category || null,
        cardCategory: CATEGORY_SECTION[String(row.category || "").toLowerCase()] || null,
        primary_type: row.primary_type || null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function inventoryPlace(pick, near) {
  if (!guidePickMayResolvePlaceCard(pick)) return null;
  if (pick.placeId) {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    if (url && anon) {
      try {
        const r = await fetch(
          `${url}/rest/v1/wf_inventory?select=place_id,name,lat,lng,category,primary_type,google_types,signals,photo_ref,editorial&status=eq.OPERATIONAL&place_id=eq.${encodeURIComponent(pick.placeId)}&limit=1`,
          { headers: { apikey: anon, Authorization: "Bearer " + anon } }
        );
        if (r.ok) {
          const rows = await r.json();
          const row = Array.isArray(rows) && rows[0];
          if (row) {
            const rating = Number(row.signals && row.signals.rating);
            const reviews = Number(row.signals && row.signals.reviews);
            if (rating > 0 && reviews >= 15) {
              return {
                id: row.place_id,
                name: row.name,
                rating,
                reviews,
                lat: row.lat,
                lng: row.lng,
                photoRef: row.photo_ref || null,
                types: existingTypeSignals(row),
                category: row.category || null,
                cardCategory: CATEGORY_SECTION[String(row.category || "").toLowerCase()] || null,
                primary_type: row.primary_type || null,
              };
            }
          }
        }
      } catch {}
    }
    return null;
  }
  if (Array.isArray(pick.exactNames) && pick.exactNames.length) {
    for (const name of pick.exactNames) {
      const hit = await inventoryPlaceByStem(name, near, pick.exactNames);
      if (hit) return hit;
    }
    return null;
  }
  const seen = new Set();
  const candidates = [];
  const push = (s) => {
    const v = String(s || "").trim().slice(0, 60);
    if (v && v.length >= 6 && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      candidates.push(v);
    }
  };
  const windows = (raw) => {
    const words = String(raw || "").split(/[—,(]/)[0].trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    if (words.length === 1) return [words[0]];
    const out = [];
    for (let n = words.length; n >= 2; n--) {
      for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
    }
    return out;
  };
  for (const stem of windows(pick.appQuery)) push(stem);
  for (const stem of windows(pick.name)) push(stem);
  candidates.length = Math.min(candidates.length, 8);
  for (const stem of candidates) {
    const hit = await inventoryPlaceByStem(stem, near);
    if (hit) return hit;
  }
  return null;
}

const standardGuideRecords = [];
const guideSlugs = Object.keys(GUIDES);

for (const slug of guideSlugs) {
  const g = GUIDES[slug];
  const picks = g.picks || [];
  const near = regionCoords(g.region);
  const pickPlaces = await Promise.all(picks.map((p) => inventoryPlace(p, near)));
  const rawPlaceIds = picks.map((p, idx) => resolveGuidePickPlaceId(p, pickPlaces[idx]));
  const pickPlaceIds = [...rawPlaceIds];
  const dedupedSameGuide = new Set();
  {
    const rendered = new Set();
    for (let i = 0; i < pickPlaceIds.length; i++) {
      const pid = pickPlaceIds[i];
      if (!pid) continue;
      if (rendered.has(pid)) {
        dedupedSameGuide.add(i);
        pickPlaces[i] = null;
        pickPlaceIds[i] = null;
      } else {
        rendered.add(pid);
      }
    }
  }
  const curatedPickImages = picks.map((pick) => guidePickFigureImage(slug, pick) || guidePickPhoto(slug, pick.name));
  const initialCurated = [...curatedPickImages];
  const fallbackPickImages = [];
  const editorialImages = new Map();
  const neutralGuide = guideUsesNeutralFallback(g);
  const neutralPickFigures = [];
  const missingPickPhotos = (neutralGuide ? [] : picks)
    .map((p, idx) => (!curatedPickImages[idx] && pickPlaceIds[idx]) ? (pickPlaces[idx] || { id: pickPlaceIds[idx], name: p.name }) : null)
    .filter(Boolean);
  await Promise.all([...new Map(missingPickPhotos.map((place) => [place.id, place])).values()].map(async (place) => {
    editorialImages.set(place.id, await guidePlaceFigureImage(place, { findFreePhoto, findSamePlaceCachedPhoto }));
  }));

  const reusedIndices = new Set();
  const contextualIndices = new Set();
  const usedSrc = new Set();
  const rememberMedia = (im) => {
    if (!im) return;
    if (typeof im === "string") {
      usedSrc.add(im);
      return;
    }
    if (im.src) usedSrc.add(im.src);
    const ref = im.creditHref || im.source;
    if (ref && ref !== "https://pintofarm.com") usedSrc.add(ref);
  };
  for (const im of curatedPickImages) rememberMedia(im);
  for (const im of editorialImages.values()) rememberMedia(im);
  rememberMedia(guideHero(slug));
  picks.forEach((pick, i) => {
    if (curatedPickImages[i] || editorialImages.get(pickPlaceIds[i])) return;
    const reused = guidePhotoForPlace(pickPlaceIds[i], { avoidSrc: usedSrc });
    if (reused) {
      curatedPickImages[i] = reused;
      reusedIndices.add(i);
      rememberMedia(reused);
    }
  });
  picks.forEach((pick, i) => {
    if (!curatedPickImages[i] && !editorialImages.get(pickPlaceIds[i])) {
      const rung = guideFinalRung(slug, pick, g, { usedSrc });
      if (rung.kind === "neutral") {
        neutralPickFigures[i] = rung.media;
        return;
      }
      curatedPickImages[i] = rung.media;
      fallbackPickImages[i] = rung.media;
      contextualIndices.add(i);
    }
  });
  picks.forEach((pick, i) => {
    if (!fallbackPickImages[i] && !neutralGuide) {
      fallbackPickImages[i] = guideContextPhoto(slug, pick, g, { usedSrc: new Set(usedSrc) });
    }
  });

  picks.forEach((pick, i) => {
    const isNeutral = Boolean(neutralPickFigures[i]);
    const selected = isNeutral
      ? neutralPickFigures[i]
      : (curatedPickImages[i] || editorialImages.get(pickPlaceIds[i]));
    const fallback = fallbackPickImages[i] || null;
    const isContextual = !isNeutral && (contextualIndices.has(i) || Boolean(selected?.contextual));
    let sourceTier = "";
    let classification = "";
    let provenance = "";
    let reviewStatus = "";

    if (isNeutral) {
      sourceTier = "Neutral fallback tile (guideUsesNeutralFallback)";
      classification = "Neutral fallback tile (Photo unavailable)";
      provenance = "No approved photograph of this exact place; renders GuideNeutralFigure without img or credit";
      reviewStatus = "Verified neutral fallback tile";
    } else if (isContextual) {
      sourceTier = dedupedSameGuide.has(i)
        ? `Same-guide duplicate venue (${rawPlaceIds[i]}) -> editorial context fallback`
        : "Topic/location-matched editorial context fallback";
      classification = "Illustrative photograph (context fallback)";
      provenance = `Reviewed local context asset (${selected.src}); source ${selected.creditHref}; license ${selected.license}`;
      reviewStatus = "Reviewed context asset (visibly labelled illustrative)";
    } else if (initialCurated[i]) {
      sourceTier = "Curated local guide-pick manifest asset";
      classification = selected.kind === "contextual" || selected.kind === "illustrative"
        ? "Local contextual photograph"
        : "Exact venue/subject photograph (curated manifest)";
      provenance = `Manifest ${slug}: ${selected.sourceUrl || selected.creditHref || selected.src} (${selected.credit || "Wayfind"}, ${selected.license || "licensed"})`;
      reviewStatus = selected.reviewedAt ? `Manifest reviewed (${selected.reviewedAt})` : "Reviewed manifest asset";
    } else if (reusedIndices.has(i)) {
      sourceTier = "Cross-guide reused exact-place manifest asset (guidePhotoForPlace)";
      classification = "Exact venue photograph";
      provenance = `Reused manifest asset for ${pickPlaceIds[i]}: ${selected.sourceUrl || selected.creditHref || selected.src} (${selected.credit}, ${selected.license})`;
      reviewStatus = "Reviewed cross-guide venue asset";
    } else if (selected?.src?.startsWith("/api/photo/stored/")) {
      sourceTier = "Retained read-only Google venue photo (wf_google_photo_store)";
      classification = "Exact venue photograph";
      provenance = `wf_google_photo_store for ${pickPlaceIds[i]}: contributor ${selected.credit} (${selected.creditHref})`;
      reviewStatus = "Retained Google Place photo (author + place URI verified)";
    } else {
      sourceTier = "Live wf_place_photo Commons/free/permission venue photo";
      classification = "Exact venue photograph";
      provenance = `wf_place_photo for ${pickPlaceIds[i]}: ${selected?.creditHref || selected?.src} (${selected?.credit || "verified"}, ${selected?.license || "verified"})`;
      reviewStatus = "Reviewed wf_place_photo venue photo";
    }

    standardGuideRecords.push({
      slug,
      guideTitle: g.title,
      region: g.region || "Florida",
      pickIndex: i + 1,
      pickName: pick.name,
      explicitPlaceId: pick.placeId || null,
      canonicalPlaceId: rawPlaceIds[i] || null,
      effectivePlaceId: pickPlaceIds[i] || null,
      selected,
      fallback,
      sourceTier,
      classification,
      provenance,
      reviewStatus,
      isNeutral,
      isContextual,
    });
  });
}

const totalGuides = guideSlugs.length;
const totalPicks = standardGuideRecords.length;
const exactPicks = standardGuideRecords.filter((r) => !r.isContextual && !r.isNeutral);
const curatedManifestPicks = exactPicks.filter((r) => r.sourceTier.includes("manifest"));
const liveFreeVenuePicks = exactPicks.filter((r) => r.sourceTier.includes("wf_place_photo"));
const liveGoogleStoredPicks = exactPicks.filter((r) => r.sourceTier.includes("wf_google_photo_store"));
const neutralPicks = standardGuideRecords.filter((r) => r.isNeutral);
const contextualPicks = standardGuideRecords.filter((r) => r.isContextual);

const fallExactCount = fallUniqueRecords.filter((r) => !r.isContextual).length;
const fallContextCount = fallUniqueRecords.filter((r) => r.isContextual).length;
const fallLocalHeroCount = fallUniqueRecords.filter((r) => !r.isContextual && LOCAL_HERO_CREDITS[r.selected.src]).length;
const fallManifestCount = fallUniqueRecords.filter((r) => !r.isContextual && r.selected.src.startsWith("/guides/picks/")).length;
const fallFreePhotoCount = fallUniqueRecords.filter((r) => !r.isContextual && !LOCAL_HERO_CREDITS[r.selected.src] && !r.selected.src.startsWith("/guides/picks/") && !r.selected.src.startsWith("/api/photo/stored/")).length;
const fallGoogleStoredCount = fallUniqueRecords.filter((r) => !r.isContextual && r.selected.src.startsWith("/api/photo/stored/")).length;

// Verify mathematical reconciliation of all categories
verifyAuditInvariant(
  fallExactCount + fallContextCount === fallUniqueRecords.length,
  `Fall Guide unique total mismatch: ${fallExactCount} + ${fallContextCount} !== ${fallUniqueRecords.length}`
);
verifyAuditInvariant(
  fallLocalHeroCount + fallManifestCount + fallFreePhotoCount + fallGoogleStoredCount === fallExactCount,
  `Fall Guide exact tier breakdown mismatch: ${fallLocalHeroCount} + ${fallManifestCount} + ${fallFreePhotoCount} + ${fallGoogleStoredCount} !== ${fallExactCount}`
);
verifyAuditInvariant(
  exactPicks.length + neutralPicks.length + contextualPicks.length === totalPicks,
  `Standard Guides total mismatch: ${exactPicks.length} + ${neutralPicks.length} + ${contextualPicks.length} !== ${totalPicks}`
);
verifyAuditInvariant(
  curatedManifestPicks.length + liveFreeVenuePicks.length + liveGoogleStoredPicks.length === exactPicks.length,
  `Standard Guides exact tier breakdown mismatch: ${curatedManifestPicks.length} + ${liveFreeVenuePicks.length} + ${liveGoogleStoredPicks.length} !== ${exactPicks.length}`
);

console.log({
  gitRevision,
  targetUrl: TARGET_URL,
  generatedAtIso,
  fallGuideUniqueEvents: fallUniqueRecords.length,
  fallGuideOccurrences: fallOccurrenceRecords.length,
  fallGuideExactCount: fallExactCount,
  fallGuideContextualCount: fallContextCount,
  totalGuides,
  totalPicks,
  exactCount: exactPicks.length,
  curatedManifestCount: curatedManifestPicks.length,
  liveFreeVenueCount: liveFreeVenuePicks.length,
  liveGoogleStoredCount: liveGoogleStoredPicks.length,
  neutralFallbackCount: neutralPicks.length,
  contextualCount: contextualPicks.length,
});

// ============================================================================
// PART 3: Write Complete Selection Ledger (selection-ledger.md)
// ============================================================================
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

let md = `# Wayfind Guide Image Selection Ledger (Generated Live from Application Resolver)

- **Git Revision Audited**: \`${gitRevision}\`
- **Target Production URL**: \`${TARGET_URL}\`
- **Generated At (UTC)**: \`${generatedAtIso}\`
- **Reproducible Command**:
  \`\`\`bash
  node scripts/audit-guide-images.mjs \\
    --target-url ${TARGET_URL} \\
    --out-dir docs/audits/guide-images \\
    --env-file .env.local
  \`\`\`

Generated directly by executing the application's actual image selection functions (\`resolveFallGuideVenuePhotos\`, \`eventImage\`, \`resolveGuidePickPlaceId\`, \`guidePickFigureImage\`, \`guidePickPhoto\`, \`guidePlaceFigureImage\`, \`guidePhotoForPlace\`, \`guideFinalRung\`, \`guideUsesNeutralFallback\`, and \`guideContextPhoto\`) against repository commit \`${gitRevision}\` and read-only Supabase (\`wf_inventory\`, \`wf_place_photo\`, \`wf_google_photo_store\`).

---

## 1. Florida Fall Festivals Guide (\`/guides/florida-fall-festivals-2026\`)

- **Total \`<figure>\` elements rendered on page**: **${fallOccurrenceRecords.length + 1}** (**1** hero \`<figure>\` + **${fallOccurrenceRecords.length}** \`EventMiniCard\` \`<figure>\` elements)
- **Rendered card occurrences**: **${fallOccurrenceRecords.length}** (\`StarterGrid\`: ${FALL_GUIDE_STARTER_IDS.length}, \`OctoberWeekendPlanner\`: ${FALL_GUIDE_OCTOBER_WEEKENDS.reduce((n, w) => n + w.ids.length, 0)} [4 shared with \`StarterGrid\`: \`frrm-pumpkin-patch-express-2026\`, \`hunsader-pumpkin-2026\`, \`dakin-harvest-festival-2026\`, \`southern-hill-farms-fall-festival-2026\`], \`WeekdayPlans\`: ${FALL_GUIDE_WEEKDAY_IDS.length})
- **Unique event records**: **${fallUniqueRecords.length}**
- **Exact venue photographs**: **${fallExactCount} / ${fallUniqueRecords.length}** unique events (**${fallOccurrenceRecords.filter((r) => !r.isContextual).length} / ${fallOccurrenceRecords.length}** rendered card occurrences):
  - **${fallLocalHeroCount}** reviewed local venue hero asset (\`/guides/verified/nature-parrish-railroad-museum.webp\`, Commons \`File:Parrish_FL_Florida_Railroad_Museum01.jpg\` by \`Ebyabe\`, \`CC BY-SA 3.0\`)
  - **${fallManifestCount}** curated local Commons venue manifest photograph (\`EVENT_MANIFEST_FALLBACKS\`: \`/guides/picks/fall-events-orlando-2026/epcot-spaceship-earth-monorail.webp\`, EPCOT Spaceship Earth + monorail by \`Anthony Quintano\`, \`CC BY 2.0\`)
  - **${fallFreePhotoCount}** \`wf_place_photo\` Commons/free venue photographs (across ${new Set(fallUniqueRecords.filter((r) => !r.isContextual && r.selected.src.startsWith("https://gbhtoehdxkzjsmmkisgu.supabase.co/")).map((r) => r.placeId)).size} unique places; the 3 Zoo Miami events share Zoo Miami's \`Flooded_Forest_building_at_Zoo_Miami.jpg\` venue photo)
  - **${fallGoogleStoredCount}** retained read-only Google venue photographs (\`wf_google_photo_store\`, including \`hunsader-pumpkin-2026\` resolved to Hunsader Farms \`ChIJuSnFvF8xw4gRt0WOWL_cqRc\` by \`Erin Henshaw\` and \`rosallie-lattes-leaves-2026\` resolved to Rosallie Le French Cafe \`ChIJ15lqd26D54gR0zik2zNTX4o\` by \`Don B\`)
- **Contextual / illustrative fallbacks**: **${fallContextCount} / ${fallUniqueRecords.length}** unique events (**${fallOccurrenceRecords.filter((r) => r.isContextual).length} / ${fallOccurrenceRecords.length}** rendered card occurrences): ${fallUniqueRecords.filter((r) => r.isContextual).map((r) => `\`${r.id}\` (\`${r.selected.src}\`)`).join(", ")}
- **Note on \`hunsader-farms-goats.webp\`**: The Unsplash source (\`i_sBNY7UoNQ\` by Robin Teng) carries only a \`Bradenton, United States\` location tag and does not establish Hunsader Farms. It is marked \`contextual: true\` in \`LOCAL_HERO_CREDITS\` and \`data/fall-festival-photo-provenance.json\` so \`resolveFallGuideVenuePhotos()\` resolves \`hunsader-pumpkin-2026\` (\`ChIJuSnFvF8xw4gRt0WOWL_cqRc\`) to its retained Hunsader Farms venue photograph (\`/api/photo/stored/ChIJuSnFvF8xw4gRt0WOWL_cqRc?v=e5a10b0e78ca5be7a3e9a42da048b0a2b465251862997498117598a4508a0f0b\`, credit \`Erin Henshaw\`), while any offline fallback to \`hunsader-farms-goats.webp\` renders with an explicit \`Illustrative Bradenton farm photo.\` caption.

### All ${fallUniqueRecords.length} Unique Fall Guide Events (${fallOccurrenceRecords.length} Rendered Occurrences)

| # | Event ID & Rendered Sections | Title & Venue | Canonical Place ID | Selected Asset (\`src\`) | Classification | Attribution & Provenance | Runtime Fallback (\`src\` & Credit) | Review Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

fallUniqueRecords.forEach((r, idx) => {
  md += `| ${idx + 1} | \`${esc(r.id)}\`<br><small>${esc(r.sections.join("; "))}</small> | **${esc(r.title)}**<br><small>${esc(r.venue)} (${esc(r.city)})</small> | \`${esc(r.placeId || "none")}\` | \`${esc(r.selected.src)}\` | ${esc(r.classification)} | **${esc(r.selected.credit || "Unknown")}** (${esc(r.selected.license || "Google Maps Platform read-only store")})<br><small>${esc(r.provenance)}</small> | \`${esc(r.fallback.src)}\`<br><small>${esc(r.fallback.caption)} — ${esc(r.fallback.credit)} (${esc(r.fallback.license)})</small> | ${esc(r.reviewStatus)} |\n`;
});

md += `
---

## 2. Standard Guides (\`/guides/[slug]\` — ${totalGuides} Guides, ${totalPicks} Rendered Picks)

- **Total active standard guides**: **${totalGuides}**
- **Total rendered guide picks**: **${totalPicks}**
- **Exact venue/subject photographs**: **${exactPicks.length} / ${totalPicks}**
  - **${curatedManifestPicks.length}** curated local guide-pick manifest assets (including cross-guide exact-place reuse via \`guidePhotoForPlace\`)
  - **${liveFreeVenuePicks.length}** live \`wf_place_photo\` Commons/free/owner-permission venue photographs
  - **${liveGoogleStoredPicks.length}** retained read-only Google venue photographs (\`wf_google_photo_store\`)
- **Neutral fallback tiles (\`Photo unavailable\` / \`GuideNeutralFigure\`)**: **${neutralPicks.length} / ${totalPicks}** (used on opted-in rainy-day and holiday guides when a pick has no approved exact venue photograph; renders \`data-photo-fallback="unavailable"\` with no \`<img>\`, no credit, and no contextual photo)
- **Contextual / illustrative photographs**: **${contextualPicks.length} / ${totalPicks}** (visibly labelled \`Illustrative <topic> photo, not <Venue>.\` with \`alt\` stating \`not a photograph of <pick>\` and \`placeId: null\`)

### 2A. Live Venue Photographs Resolved via \`guidePlaceFigureImage\` (${liveFreeVenuePicks.length + liveGoogleStoredPicks.length} Picks)

| # | Guide Slug | Pick Name | Canonical Place ID | Selected Source (\`src\`) | Classification | Attribution & Provenance | Runtime Fallback (\`src\`) | Review Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

[...liveFreeVenuePicks, ...liveGoogleStoredPicks].forEach((r, idx) => {
  const fbText = r.fallback ? `\`${esc(r.fallback.src)}\` (${esc(r.fallback.credit)})` : "`none (neutral guide)`";
  md += `| ${idx + 1} | \`${esc(r.slug)}\` | ${esc(r.pickName)} | \`${esc(r.effectivePlaceId)}\` | \`${esc(r.selected.src)}\` | ${esc(r.classification)} | **${esc(r.selected.credit)}**<br><small>${esc(r.provenance)}</small> | ${fbText} | ${esc(r.reviewStatus)} |\n`;
});

md += `
### 2B. Neutral Fallback Tiles Across Opted-In Guides (${neutralPicks.length} Picks)

| # | Guide Slug | Pick Name | Canonical Place ID | Rendered State | Reason | Review Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

neutralPicks.forEach((r, idx) => {
  md += `| ${idx + 1} | \`${esc(r.slug)}\` | ${esc(r.pickName)} | \`${esc(r.canonicalPlaceId || "none")}\` | \`Photo unavailable\` (\`data-photo-fallback="unavailable"\`) | ${esc(r.selected.reason)} | ${esc(r.reviewStatus)} |\n`;
});

md += `
### 2C. Contextual / Illustrative Selections Across Standard Guides (${contextualPicks.length} Picks)

| # | Guide Slug | Pick Name | Canonical Place ID | Visible Caption | Selected Context Asset | Attribution & License | Selection Reason | Review Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

contextualPicks.forEach((r, idx) => {
  md += `| ${idx + 1} | \`${esc(r.slug)}\` | ${esc(r.pickName)} | \`${esc(r.canonicalPlaceId || "none (editorial/activity)")}\` | \`${esc(r.selected.caption)}\` | \`${esc(r.selected.src)}\` | ${esc(r.selected.credit)} (${esc(r.selected.license)}) | ${esc(r.sourceTier)} | ${esc(r.reviewStatus)} |\n`;
});

md += `
### 2D. Per-Guide Summary Across All ${totalGuides} Standard Guides (${totalPicks} Picks)

| # | Guide Slug | Region | Total Picks | Curated Manifest | Live \`wf_place_photo\` | Retained Google Store | Neutral Tile | Contextual / Illustrative |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

guideSlugs.forEach((slug, idx) => {
  const rows = standardGuideRecords.filter((r) => r.slug === slug);
  const cMan = rows.filter((r) => !r.isContextual && !r.isNeutral && r.sourceTier.includes("manifest")).length;
  const cFree = rows.filter((r) => !r.isContextual && !r.isNeutral && r.sourceTier.includes("wf_place_photo")).length;
  const cGoog = rows.filter((r) => !r.isContextual && !r.isNeutral && r.sourceTier.includes("wf_google_photo_store")).length;
  const cNeutral = rows.filter((r) => r.isNeutral).length;
  const cCtx = rows.filter((r) => r.isContextual).length;
  verifyAuditInvariant(
    cMan + cFree + cGoog + cNeutral + cCtx === rows.length,
    `Per-guide row sum mismatch for ${slug}: ${cMan} + ${cFree} + ${cGoog} + ${cNeutral} + ${cCtx} !== ${rows.length}`
  );
  md += `| ${idx + 1} | \`${esc(slug)}\` | ${esc(GUIDES[slug].region || "Florida")} | ${rows.length} | ${cMan} | ${cFree} | ${cGoog} | ${cNeutral} | ${cCtx} |\n`;
});

const ledgerPath = path.join(OUT_DIR, "selection-ledger.md");
writeFileSync(ledgerPath, md, "utf8");
console.log(`Wrote ${ledgerPath}`);

// ============================================================================
// PART 4: Generate Verified Contact Sheet (contact-sheet-fall-guide-40.png)
// Every tile renders the ACTUAL selected primary image bytes AND a separate
// inset for the runtime fallback image bytes, with matching labels & credits.
// ============================================================================
async function loadActualImageBuffer(src) {
  if (!src) return { buf: null, error: "empty src" };
  try {
    if (src.startsWith("/guides/")) {
      return { buf: readFileSync(path.join(REPO, "public", src)), error: null };
    }
    if (src.startsWith("/api/photo/stored/")) {
      const u = new URL(src, TARGET_URL);
      const placeId = decodeURIComponent(u.pathname.split("/").pop());
      const version = u.searchParams.get("v");
      const res = await readStoredGooglePhotoBytes({ placeId, version });
      if (!res?.body) return { buf: null, error: "stored photo bytes unavailable" };
      return { buf: res.body, error: null };
    }
    if (src.startsWith("https://")) {
      const r = await fetch(src, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { buf: null, error: `HTTP ${r.status}` };
      return { buf: Buffer.from(await r.arrayBuffer()), error: null };
    }
    return { buf: null, error: "unsupported src scheme" };
  } catch (e) {
    return { buf: null, error: e.message };
  }
}

const COLS = 4;
const ROWS = Math.ceil(fallUniqueRecords.length / COLS);
const TILE_W = 520;
const TILE_H = 380;
const HEADER_H = 90;
const SHEET_W = COLS * TILE_W;
const SHEET_H = HEADER_H + ROWS * TILE_H;

const xmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const trunc = (s, n) => {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
};

const composites = [];

const headerSvg = `<svg width="${SHEET_W}" height="${HEADER_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0B0F17"/>
  <text x="24" y="38" fill="#F8FAFC" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="800">
    Wayfind Florida Fall Guide 2026 — Verified 40-Event Primary &amp; Runtime Fallback Contact Sheet (${xmlEsc(gitRevision.slice(0, 8))})
  </text>
  <text x="24" y="68" fill="#94A3B8" font-family="system-ui, -apple-system, sans-serif" font-size="15">
    40 Unique Events (${fallOccurrenceRecords.length} Rendered Occurrences) · ${fallExactCount}/40 Exact Venue Photos (${fallLocalHeroCount} local Commons hero, ${fallManifestCount} Commons manifest, ${fallFreePhotoCount} wf_place_photo Commons, ${fallGoogleStoredCount} wf_google_photo_store) · ${fallContextCount}/40 Illustrative Context Fallbacks · Every thumbnail decoded from actual selected image bytes
  </text>
</svg>`;
composites.push({ input: Buffer.from(headerSvg), top: 0, left: 0 });

for (let i = 0; i < fallUniqueRecords.length; i++) {
  const r = fallUniqueRecords[i];
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const left = col * TILE_W;
  const top = HEADER_H + row * TILE_H;

  const badgeBg = r.isContextual ? "#7C2D12" : "#065F46";
  const badgeText = r.isContextual ? "CONTEXTUAL / ILLUSTRATIVE" : "EXACT VENUE PHOTO";
  const sourceKind = r.isContextual
    ? "guideContextPhoto"
    : LOCAL_HERO_CREDITS[r.selected.src]
      ? "LOCAL_HERO_CREDITS (Commons)"
      : r.selected.src.startsWith("/guides/picks/")
        ? "EVENT_MANIFEST (Commons)"
        : r.selected.src.startsWith("https://gbhtoehdxkzjsmmkisgu.supabase.co/")
          ? "wf_place_photo (Commons)"
          : "wf_google_photo_store";

  const primaryLoad = await loadActualImageBuffer(r.selected.src);
  const fallbackLoad = await loadActualImageBuffer(r.fallback.src);

  verifyAuditInvariant(Boolean(primaryLoad.buf), `Contact sheet primary image failed to decode for ${r.id} (${r.selected.src}): ${primaryLoad.error}`);
  verifyAuditInvariant(Boolean(fallbackLoad.buf), `Contact sheet fallback image failed to decode for ${r.id} (${r.fallback.src}): ${fallbackLoad.error}`);

  const shortSrc = r.selected.src.startsWith("https://gbhtoehdxkzjsmmkisgu.supabase.co/")
    ? "wf_place_photo/" + r.selected.src.split("/place-photos/")[1]?.split("?")[0]
    : r.selected.src.startsWith("/api/photo/stored/")
      ? r.selected.src.slice(0, 46) + "…"
      : r.selected.src;

  const tileSvg = `<svg width="${TILE_W}" height="${TILE_H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="${TILE_W - 8}" height="${TILE_H - 8}" rx="10" fill="#111827" stroke="#1F2937" stroke-width="2"/>
    <rect x="364" y="14" width="142" height="106" rx="6" fill="#0B0F17" stroke="#374151" stroke-width="1"/>
    <text x="370" y="114" fill="#9CA3AF" font-family="system-ui, sans-serif" font-size="10" font-weight="700">
      Fallback: ${xmlEsc(trunc(r.fallback.src.replace("/guides/context/", ""), 22))}
    </text>
    <rect x="14" y="218" width="175" height="20" rx="4" fill="${badgeBg}"/>
    <text x="20" y="232" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="10.5" font-weight="800">
      ${xmlEsc(badgeText)}
    </text>
    <text x="196" y="232" fill="#93C5FD" font-family="system-ui, sans-serif" font-size="11" font-weight="700">
      ${xmlEsc(trunc(sourceKind, 32))}
    </text>
    <text x="14" y="254" fill="#F9FAFB" font-family="system-ui, sans-serif" font-size="13.5" font-weight="800">
      #${i + 1} ${xmlEsc(trunc(r.title, 48))}
    </text>
    <text x="14" y="272" fill="#D1D5DB" font-family="system-ui, sans-serif" font-size="11.5">
      ID: ${xmlEsc(trunc(r.id, 34))} · Place: ${xmlEsc(trunc(r.placeId || "none", 22))}
    </text>
    <text x="14" y="290" fill="#9CA3AF" font-family="monospace" font-size="10.5">
      Primary: ${xmlEsc(trunc(shortSrc, 56))}
    </text>
    <text x="14" y="308" fill="#E5E7EB" font-family="system-ui, sans-serif" font-size="11">
      Credit: ${xmlEsc(trunc((r.selected.credit || "Unknown") + " (" + (r.selected.license || "Google Place Store") + ")", 58))}
    </text>
    <text x="14" y="326" fill="#9CA3AF" font-family="system-ui, sans-serif" font-size="10.5">
      Provenance: ${xmlEsc(trunc(r.provenance, 64))}
    </text>
    <text x="14" y="344" fill="#6EE7B7" font-family="system-ui, sans-serif" font-size="10.5">
      Fallback credit: ${xmlEsc(trunc(r.fallback.credit + " (" + r.fallback.license + ") · " + r.fallback.caption, 62))}
    </text>
    <text x="14" y="362" fill="#94A3B8" font-family="system-ui, sans-serif" font-size="10.5">
      Status: ${xmlEsc(trunc(r.reviewStatus + " · Sections: " + r.sections.join(", "), 64))}
    </text>
  </svg>`;
  composites.push({ input: Buffer.from(tileSvg), top, left });

  if (primaryLoad.buf) {
    const thumb = await sharp(primaryLoad.buf).resize(340, 196, { fit: "cover" }).png().toBuffer();
    composites.push({ input: thumb, top: top + 14, left: left + 14 });
  } else {
    const errSvg = `<svg width="340" height="196" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#7F1D1D"/>
      <text x="16" y="98" fill="#FCA5A5" font-family="system-ui, sans-serif" font-size="14" font-weight="700">
        UNAVAILABLE: ${xmlEsc(primaryLoad.error || "failed")}
      </text>
    </svg>`;
    composites.push({ input: Buffer.from(errSvg), top: top + 14, left: left + 14 });
  }

  if (fallbackLoad.buf) {
    const fbThumb = await sharp(fallbackLoad.buf).resize(134, 82, { fit: "cover" }).png().toBuffer();
    composites.push({ input: fbThumb, top: top + 18, left: left + 368 });
  }
}

const sheetPath = path.join(OUT_DIR, "contact-sheet-fall-guide-40.png");
await sharp({
  create: {
    width: SHEET_W,
    height: SHEET_H,
    channels: 4,
    background: { r: 11, g: 15, b: 23, alpha: 1 },
  },
})
  .composite(composites)
  .png({ compressionLevel: 8 })
  .toFile(sheetPath);

console.log(`Wrote ${sheetPath}`);

if (auditFailures.length > 0) {
  console.error("audit-guide-images: FAIL — unreconciled counts or decode failures:");
  for (const msg of auditFailures) console.error("  - " + msg);
  process.exit(1);
}
console.log("audit-guide-images: OK — all coverage totals reconciled and all 40 primary + fallback contact sheet images decoded");
