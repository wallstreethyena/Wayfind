// scripts/credited-photo-targets.mjs — the deterministic target list for the
// credited-photo warm, with a dry-run cost estimate. READ-ONLY: Supabase
// SELECTs only, NEVER a Google request, NEVER a ledger grant, NEVER a write.
//
//   node scripts/credited-photo-targets.mjs                 summary + estimate
//   node scripts/credited-photo-targets.mjs --ids           one place id per line
//   node scripts/credited-photo-targets.mjs --json          full list
//
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY when set (also reads which
// venues already hold a live pair, so the estimate is exact); otherwise the
// public publishable key (blog + inventory + credit rows are public), and the
// estimate is an upper bound because the photo cache is not public.
import { loadBlogTargets, guideTargets, mergeTargets, PLACE_ID_RX } from "../lib/creditedPhotoTargets.js";
import { estimate, readLivePairs, PHOTO_PRICE_USD, MIN_REMAINING_MS } from "../lib/creditedPhotoWarm.js";
import { GUIDES } from "../lib/guides.js";
import { GUIDE_PLACE_RAILS } from "../lib/guidePlaceRails.js";
import { guidePickMayResolvePlaceCard } from "../lib/guidePlaceIdentity.js";

const PUBLIC_URL = "https://gbhtoehdxkzjsmmkisgu.supabase.co";
const PUBLIC_KEY = "sb_publishable_ndsgaxn2quVMyFmV_JNuTQ_mnuQnI_N";
const has = (f) => process.argv.includes(f);

const svcUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const privileged = !!(svcUrl && svcKey);
const env = privileged ? { url: svcUrl, key: svcKey } : { url: PUBLIC_URL, key: PUBLIC_KEY };

const blog = await loadBlogTargets(env);
const guide = guideTargets(GUIDES, GUIDE_PLACE_RAILS, guidePickMayResolvePlaceCard);
const targets = mergeTargets(blog.ids, guide.ids);
const ids = targets.map((t) => t.placeId);
if (!ids.every((id) => PLACE_ID_RX.test(id))) { console.error("a target id failed validation"); process.exit(1); }

if (has("--ids")) { console.log(ids.join("\n")); process.exit(0); }
if (has("--json")) { console.log(JSON.stringify(targets, null, 1)); process.exit(0); }

let paired = new Set();
let pairNote = "photo cache is not public: every target is counted as needing a warm (upper bound)";
if (privileged) {
  const r = await readLivePairs(ids, { env, now: Date.now() });
  if (r.error) pairNote = "could not read live pairs (" + r.error + "): upper bound";
  else { paired = r.paired; pairNote = `exact: ${paired.size} venues already hold a live cached+credited pair with >= ${MIN_REMAINING_MS / 86400000} days left`; }
}
const est = estimate(ids, paired);
const both = targets.filter((t) => t.sources.length === 2).length;
console.log(JSON.stringify({
  blog: blog.stats,
  guide: guide.stats,
  overlapBlogAndGuide: both,
  mergedTargets: targets.length,
  ...{ alreadyPaired: est.alreadyPaired, toWarm: est.toWarm },
  oneTimeCostUsdUpperBound: est.costUsdUpperBound,
  pricePerVenueUsd: PHOTO_PRICE_USD,
  note: pairNote,
}, null, 2));
