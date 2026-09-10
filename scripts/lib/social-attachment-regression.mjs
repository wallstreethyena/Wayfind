import { readFileSync } from "node:fs";
import path from "node:path";
import { __CURATED_FOR_CODEGEN__ as CURATED, allCreators, creatorVideosFor, hasCreatorPage } from "../../lib/creatorVideos.js";
import { __EVENT_SOCIAL_FOR_GUARDS__ as EVENT_SOCIAL } from "../../lib/eventSocial.js";

const ensure = (condition, message) => {
  if (!condition) throw new Error(`social-attachment-regression: ${message}`);
};

export function checkSocialAttachments(repo) {
  const audit = JSON.parse(readFileSync(path.join(repo, "social-attachment-audit.json"), "utf8"));
  const placeLinks = new Map();
  for (const entry of CURATED) for (const video of entry.videos || []) {
    if (!video.url) continue;
    const keys = placeLinks.get(video.url) || new Set();
    keys.add(entry.key);
    placeLinks.set(video.url, keys);
  }
  const eventLinks = new Map();
  for (const [eventId, posts] of Object.entries(EVENT_SOCIAL)) for (const [, url] of posts) {
    const ids = eventLinks.get(url) || new Set();
    ids.add(eventId);
    eventLinks.set(url, ids);
  }
  ensure(audit.records.length === 45, `expected 45 audited sources, got ${audit.records.length}`);
  ensure(new Set(audit.records.map((row) => row.shortcode)).size === 45, "shortcodes must be unique");
  for (const row of audit.records) {
    ensure(row.place_associations.length + row.event_associations.length > 0, `${row.shortcode} has no association`);
    ensure(row.native_path_kind === (row.native_url.includes("/p/") ? "p" : "reel"), `${row.shortcode} changed native route kind`);
    for (const place of row.place_associations) ensure(placeLinks.get(row.native_url)?.has(place.curated_key), `${row.shortcode} is absent from ${place.curated_key}`);
    for (const event of row.event_associations) ensure(eventLinks.get(row.native_url)?.has(event.event_id), `${row.shortcode} is absent from ${event.event_id}`);
  }
  ensure(audit.summary.sources_with_any_association === 45 && audit.summary.remaining_unmapped_sources === 0, "summary coverage drifted");

  const social = readFileSync(path.join(repo, "app/components/sheets/SocialFind.js"), "utf8");
  ensure(/hydratedFindForSpot\(spot, videoHeroPlaces\)/.test(social) && !/find\(\(o\) => o\.video\.url === spot\.video\.url\)/.test(social), "roundup cards must hydrate by place identity");
  ensure((social.match(/setSocialFind\(\{ place: local\.place, video: spot\.video \}\)/g) || []).length === 2, "both browse surfaces must retain the selected post");
  ensure(/!curatedSpot && \(/.test(social) && /<VideoFacade platform=\{video\.platform\}/.test(social), "registry previews must embed the native post without a full-place CTA");

  const eventPage = readFileSync(path.join(repo, "app/florida-events/[slug]/page.js"), "utf8");
  ensure(/eventSocialPosts\(e\.event_id\)/.test(eventPage) && /See @\{post\.creator\}&rsquo;s post on Instagram/.test(eventPage), "event pages must render creator credit and native links");

  const dinerBrand = allCreators().creators.find((creator) => creator.handle.toLowerCase() === "atthediner");
  ensure(dinerBrand && dinerBrand.count === new Set(dinerBrand.spots.map((spot) => spot.key)).size, "page eligibility must count unique venues");
  ensure(hasCreatorPage("atthediner") === false, "two brand locations must not mint a thin creator page");
  const wrongRegion = [
    ...creatorVideosFor({ name: "Urban Kai", city: "Miami", address: "Miami, FL" }, "Miami"),
    ...creatorVideosFor({ name: "Florida Avenue Brewing Co.", city: "Orlando", address: "Orlando, FL" }, "Orlando"),
  ];
  ensure(!wrongRegion.some((video) => video.url.endsWith("/Dc3asu4uUOI/")), "Tampa Bay roundup previews must not match same-name venues in another city");
}
