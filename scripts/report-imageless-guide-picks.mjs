#!/usr/bin/env node
// scripts/report-imageless-guide-picks.mjs — READ-ONLY. Lists, per guide, the
// picks that will render with no photo, and why.
//
//   node scripts/report-imageless-guide-picks.mjs            offline, static
//   node scripts/report-imageless-guide-picks.mjs --live     also resolves each
//                                                            declared place id
//                                                            through the real photo
//                                                            ladder (needs
//                                                            SUPABASE_URL and
//                                                            SUPABASE_SERVICE_ROLE_KEY)
//   add --json for machine output, --guide=<slug> to scope to one guide.
//
// NEVER spends: every network call is a Supabase REST GET or a free Wikimedia
// read (findFreePhoto), and the cached rung is /api/photo?...&nospend=1 shaped
// data only. There is no Google call anywhere in this file or what it imports.
// With no env the live pass is skipped and says so; it never guesses.
import { GUIDES } from "../lib/guides.js";
import { guidePickPhoto } from "../lib/guidePickPhotos.js";
import { guidePickMayResolvePlaceCard } from "../lib/guidePlaceIdentity.js";
import { guidePlaceFigureImage } from "../lib/guidePlaceFigureImage.js";
import { findSamePlaceCachedPhoto } from "../lib/photoCacheRecovery.js";
import { findFreePhoto } from "../lib/freePhoto.js";

const args = process.argv.slice(2);
const live = args.includes("--live");
const asJson = args.includes("--json");
const only = (args.find((a) => a.startsWith("--guide=")) || "").slice(8);
const haveEnv = !!((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);

const rows = [];
let total = 0;
const GUIDE_LIST = Array.isArray(GUIDES) ? GUIDES : Object.entries(GUIDES).map(([slug, g]) => ({ slug, ...g }));
for (const g of GUIDE_LIST) {
  if (only && g.slug !== only) continue;
  for (const pick of g.picks || []) {
    total += 1;
    // Mirrors app/guides/[slug]/GuideEditorial.js guidePickImage + page.js.
    const curated = (g.slug !== "orlando-halloween-food-2026" && pick.image) || guidePickPhoto(g.slug, pick.name);
    if (curated) continue;
    const resolvable = guidePickMayResolvePlaceCard(pick);
    const row = { guide: g.slug, pick: pick.name, placeId: pick.placeId || null, status: resolvable ? "needs-place-photo" : "no-place-identity" };
    if (live && haveEnv && resolvable && pick.placeId) {
      let img = null;
      try { img = await guidePlaceFigureImage({ id: pick.placeId, place_id: pick.placeId, name: pick.name }, { findFreePhoto, findSamePlaceCachedPhoto }); } catch {}
      row.status = !img ? "still-imageless" : img.noSpendCached ? (img.credit ? "photo-cached-credited" : "photo-cached-uncredited") : "photo-credited";
    }
    rows.push(row);
  }
}

if (live && !haveEnv) console.error("report-imageless-guide-picks: --live skipped, no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env (static report only)");
if (asJson) { console.log(JSON.stringify({ totalPicks: total, imageless: rows.length, rows }, null, 1)); process.exit(0); }
const byGuide = new Map();
for (const r of rows) { if (!byGuide.has(r.guide)) byGuide.set(r.guide, []); byGuide.get(r.guide).push(r); }
for (const [guide, list] of [...byGuide].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${guide}  (${list.length} without a curated photo)`);
  for (const r of list) console.log(`  ${r.status.padEnd(22)} ${r.pick}${r.placeId ? "  [" + r.placeId + "]" : ""}`);
}
const count = (s) => rows.filter((r) => r.status === s).length;
console.log(`\n${total} picks across ${GUIDE_LIST.length} guides; ${rows.length} lack a curated photo.`);
console.log(`  no-place-identity (cannot resolve a venue, fails closed): ${count("no-place-identity")}`);
console.log(`  needs-place-photo (venue resolvable, ladder not run offline): ${count("needs-place-photo")}`);
if (live && haveEnv) console.log(`  live: credited ${count("photo-credited")}, cached+credited ${count("photo-cached-credited")}, cached uncredited ${count("photo-cached-uncredited")}, still imageless ${count("still-imageless")}`);
