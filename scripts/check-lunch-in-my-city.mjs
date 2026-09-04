// The Shortcuts promise is specific: Lunch in My City opens a tall photo-led
// reveal, the question block is the trigger, and the returned postcard can only
// be a lunch place near the current center. Keep the copy, interaction, and
// picker honest together.
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { lunchRevealCookieValue, lunchRevealCount, lunchRevealLimit, lunchRevealRemaining } from "../lib/lunchReveal.js";
import { RAILS } from "../lib/rails.js";
import { DAYPART_IDS, orderFor, railHref } from "../lib/dayparts.js";

let pass = 0;
const fail = (m) => { console.error("check-lunch-in-my-city: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const home = read("app/home.js");
const menu = read("app/components/sheets/Menu.js");
const route = read("app/api/lunch-break/route.js");
const migration = read("supabase/migrations/20260904_wf_lunch_reveal_usage.sql");
const imageMigration = read("supabase/migrations/20260904_wf_lunch_dish_images.sql");
const repairMigration = read("supabase/migrations/20260904090000_preserve_editorial_and_lunch_images.sql");
const imageCron = read("app/api/cron/lunch-images/route.js");
const vercel = read("vercel.json");
const challengePage = read("app/lunch-challenge/page.js");
const challengeOpen = read("app/lunch-challenge/LunchChallengeOpen.js");
const detail = read("app/components/sheets/Detail.js");

ok(home.includes('["dice", "Lunch in My City", onSurprise'), "the rightmost Shortcuts chip is named Lunch in My City");
ok(/tile: "Surprise me", chip: "Lunch in My City", experience: "lunch_in_my_city"/.test(home), "the rename preserves the existing discovery funnel and adds the new experience identity");
ok(/async function rollLunchPick\(\)/.test(home), "the shortcut owns a reachable lunch picker");
ok(/fetch\("\/api\/lunch-break", \{[\s\S]{0,120}method: "POST"/.test(home), "the picker asks the server to choose and consume one lunch reveal");
ok(!/searchPlaces\("food", "lunch"/.test(home), "the reveal cannot fall through to a generic external place search");
ok(/\.filter\(\(place\) => place\.mustTry\)[\s\S]{0,40}\.slice\(0, 5\)/.test(route), "only the five highest-ranked verified menu picks enter the draw");
ok(!/function rollHomePick\(/.test(home), "the old generic homepage-pool roulette cannot answer the lunch promise");
ok(/atlasCardFor\(ATLAS_BY_ID/.test(route) && /\.filter\(\(place\) => place\.mustTry\)/.test(route), "inventory without sourced must-try editorial fails closed");
ok(/wf_consume_lunch_reveal/.test(route) && /SUPABASE_SERVICE_ROLE_KEY/.test(route), "the browser cannot grant or spend its own server allowance");
ok(/pg_advisory_xact_lock/.test(migration) && /greatest\(u\.attempts, excluded\.attempts\)/.test(migration), "the database consumes attempts atomically under concurrent taps");
ok(/revoke all on public\.wf_lunch_reveal_usage from anon, authenticated/.test(migration) && /grant execute on function public\.wf_consume_lunch_reveal\(text, text, date\) to service_role/.test(migration), "usage rows and the consume function are service-only");
ok(/subjectKey\("device", deviceId\)/.test(route) && /createHash\("sha256"\)/.test(route), "raw device identifiers are never stored in the usage table");
ok(/dishImagesFor\(s, available\.map/.test(route) && /imageKind: "must_try"/.test(route) && /imageKind: "restaurant"/.test(route), "a verified exact-dish image wins and the restaurant image is the explicit fallback");
ok(/official menu\|menu html\|this pass/.test(route) && /move\.length > 180/.test(route), "research/source notes can never escape into the Must try line");
ok(/cardImageSrc\(raw, 800\)/.test(route) && /restaurantPhoto/.test(route), "every card keeps a stable restaurant-photo fallback when an exact dish image is unavailable or expires");
ok(/matches may be true only when the visible food is specifically consistent/.test(imageCron) && /confidence < 0\.75/.test(imageCron), "the cron conservatively vision-verifies the exact must-try item");
ok(/officialWebsite/.test(imageCron) && /sourceUrls/.test(imageCron) && !/places\.googleapis\.com/.test(imageCron), "the cron checks restaurant-owned sources and never caches an expiring Google photo name");
ok(/No restaurant-owned source image could be verified[^\n]+use the restaurant photo/.test(imageCron), "the cron never generates or substitutes an unverified food image");
ok(/wf_lunch_dish_images/.test(imageMigration) && /revoke all[^\n]+anon, authenticated/.test(imageMigration), "dish-image decisions are server-owned");
ok(/add column if not exists image_url text/.test(repairMigration) && /add column if not exists source_url text/.test(repairMigration), "schema drift is repaired even when the older lunch-image table already exists");
ok(/\/api\/cron\/lunch-images\?limit=6/.test(vercel), "the dish-image refresh is scheduled daily");

ok(menu.includes('aria-label="Lunch in My City"'), "the reveal is named for assistive technology");
ok(menu.includes('src="/cards/lunch-in-my-city.webp"'), "the supplied city-wall image is the postcard art");
ok(menu.includes("Tap the box to accept your Lunch in My City challenge—for one standout place around you, wherever you are now."), "the prompt uses the owner's challenge wording");
ok(/className="wf-lunch-question"[\s\S]{0,520}onClick=\{\(\) => \{ playLunchCoin\(\); rollLunchPick\(\); \}\}/.test(menu), "the glowing question block is the reveal button and plays its coin cue in the click gesture");
ok(/AudioContext|webkitAudioContext/.test(menu) && /createOscillator\(\)/.test(menu), "the coin cue is synthesized without a plug-in or downloaded audio asset");
ok(/@keyframes wfLunchGlow/.test(menu) && /@keyframes wfLunchRise/.test(menu) && !/wfMarioPipe|wf-lunch-mario/.test(menu), "the trigger glows and the actual result card rises; Mario is never the animated layer");
const resultCard = menu.match(/<article key=\{lunchPick\.id\}[\s\S]*?<\/article>/)?.[0] || "";
ok(resultCard.includes("<FallbackImg") && resultCard.includes("{lunchPick.name}") && resultCard.includes("{lunchPick.mustTry}"), "the place card contains the photo, name, and must-try recommendation");
ok(!/PlaceScoreChip|distMi|reviews|Directions|Open the postcard/.test(resultCard), "the place card contains no score, distance, reviews, or unrelated navigation chrome");
ok(/wf-lunch-card-actions/.test(resultCard) && /Save/.test(resultCard) && /toggleLike/.test(resultCard) && /toggleDislike/.test(resultCard) && /Challenge/.test(resultCard), "the lunch postcard carries save, like, dislike, and a challenge-specific share action");
ok(/wfLunchDisclosure \.25s ease 2\.8s both/.test(menu), "the attempt disclosure appears two seconds after the card settles");
ok(menu.includes("Challenge someone") && />Close<\/button>/.test(menu) && /\/lunch-challenge/.test(menu), "the settled postcard can challenge someone or close, and shares the dedicated challenge link");
ok(menu.includes("YOU’VE BEEN CHALLENGED") && menu.includes("Completed it? Add your review + photos"), "the recipient sees the challenge state and the participant gets a post-lunch review door");
ok(/\?challenge=lunch&review=1/.test(menu) && /wf-community-takes/.test(detail) && /setCommentType\("Review"\)/.test(detail), "the completion CTA opens the chosen place at its review and photo composer");
ok(detail.includes("Challenge someone for Lunch in My City") && detail.includes("lunch_challenge_share"), "a lunch-result place keeps the challenge share treatment on its detail page");
ok(challengePage.includes("/api/og/rail?id=lunchcity") && challengePage.includes("You’ve been challenged: Lunch in My City"), "text messages use the branded Lunch in My City poster and challenge headline");
ok(challengeOpen.includes('window.location.replace("/?go=lunch&challenged=1")'), "a challenge recipient lands in the location-aware lunch reveal");
ok(/prefers-reduced-motion:reduce/.test(menu), "the reveal respects reduced-motion preferences");

const lunchRail = RAILS.find((rail) => rail.id === "lunchcity");
ok(!!lunchRail && lunchRail.opensPage === true, "Lunch in My City is a visible page-launch tile on the Amazon rail");
ok(railHref(lunchRail, "fl", "parrish") === "/?go=lunch", "the Amazon tile opens the location-aware lunch challenge");
ok(!lunchRail.href.includes("ChIJ9RHZGx6H3YgRnWVYIWsHNPM"), "the lunch poster can never reopen Gatorland's place route");
ok(DAYPART_IDS.every((band) => orderFor(band, RAILS.map((rail) => rail.id)).includes("lunchcity")), "the Lunch in My City tile appears in every daypart");
ok(lunchRail.short === "Tap the box to accept the challenge" && lunchRail.sub === "One lunch place around you, wherever you are now", "the Amazon tile carries the owner's challenge wording");
for (const file of ["lunchcity-380.avif", "lunchcity-380.webp", "lunchcity-760.avif", "lunchcity-760.webp", "lunchcity-760.jpg"]) {
  const railAsset = path.join(root, "public/cards-v8", file);
  ok(existsSync(railAsset) && statSync(railAsset).size > 20000, `Amazon rail art ${file} exists and carries real poster bytes`);
}

const day = "2026-09-04";
const one = lunchRevealCookieValue(day, 1);
ok(lunchRevealCount(one, day) === 1 && lunchRevealCount(one, "2026-09-05") === 0, "the reveal cookie tracks attempts for one site-day and resets on the next");
ok(lunchRevealLimit(false) === 1 && lunchRevealRemaining(one, day, false) === 0, "a guest receives one reveal per day");
ok(lunchRevealLimit(true) === 2 && lunchRevealRemaining(one, day, true) === 1, "sign-in unlocks exactly one additional reveal after the guest pick");

const asset = path.join(root, "public/cards/lunch-in-my-city.webp");
ok(existsSync(asset), "the supplied image asset exists");
ok(statSync(asset).size > 50000, "the image asset is not an empty placeholder");

console.log(`check-lunch-in-my-city: ${pass} assertions passed`);
