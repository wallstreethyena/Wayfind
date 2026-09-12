import { readFileSync } from "node:fs";
import path from "node:path";
import { __CURATED_FOR_CODEGEN__ as CURATED, allCreators, creatorVideosFor, hasCreatorPage } from "../../lib/creatorVideos.js";
import { captionFor } from "../../lib/creatorCaptions.js";
import {
  __EVENT_SOCIAL_FOR_GUARDS__ as EVENT_SOCIAL,
  __EVENT_ROUNDUP_MENTIONS_FOR_GUARDS__ as EVENT_ROUNDUP_MENTIONS,
  __EVENT_VENUE_CONTEXT_FOR_GUARDS__ as EVENT_VENUE_CONTEXT,
  eventSocialPosts,
} from "../../lib/eventSocial.js";
import { embedSrc } from "../../lib/videoEmbed.js";

const ensure = (condition, message) => {
  if (!condition) throw new Error(`social-attachment-regression: ${message}`);
};

export function checkSocialAttachments(repo) {
  const audit = JSON.parse(readFileSync(path.join(repo, "social-attachment-audit.json"), "utf8"));
  const curatedByKey = new Map(CURATED.map((entry) => [entry.key, entry]));
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
  const roundupLinks = new Map();
  for (const [eventId, posts] of Object.entries(EVENT_ROUNDUP_MENTIONS)) for (const [, url] of posts) {
    const ids = roundupLinks.get(url) || new Set();
    ids.add(eventId);
    roundupLinks.set(url, ids);
  }
  const venueContextLinks = new Map();
  for (const [eventId, posts] of Object.entries(EVENT_VENUE_CONTEXT)) for (const [, url] of posts) {
    const ids = venueContextLinks.get(url) || new Set();
    ids.add(eventId);
    venueContextLinks.set(url, ids);
  }
  const unresolved = audit.retrievable_unresolved_sources || [];
  ensure(audit.records.length === 47, `expected 47 audited sources, got ${audit.records.length}`);
  ensure(new Set(audit.records.map((row) => row.shortcode)).size === 47, "shortcodes must be unique");
  ensure(unresolved.length === 4, `expected 4 retrievable unresolved sources, got ${unresolved.length}`);
  ensure(new Set([...audit.records, ...unresolved].map((row) => row.shortcode)).size === audit.records.length + unresolved.length, "mapped and unresolved shortcodes must be unique");
  for (const row of unresolved) {
    ensure(row.status === "unresolved_identity", `${row.shortcode} must explain why it cannot be attached`);
    ensure(row.native_path_kind === (row.native_url.includes("/p/") ? "p" : "reel"), `${row.shortcode} changed native route kind`);
    ensure(!placeLinks.has(row.native_url), `${row.shortcode} is marked unresolved but is attached to a place`);
    ensure(!eventLinks.has(row.native_url), `${row.shortcode} is marked unresolved but is attached to an exact event`);
    ensure(!roundupLinks.has(row.native_url), `${row.shortcode} is marked unresolved but is attached as a roundup mention`);
    ensure(!venueContextLinks.has(row.native_url), `${row.shortcode} is marked unresolved but is attached as venue context`);
    ensure(row.evidence && row.evidence_needed, `${row.shortcode} must record checked evidence and the evidence still needed`);
  }
  const reviewedRoundups = new Set(audit.roundup_reviews.map((row) => row.shortcode));
  for (const row of audit.records) {
    ensure(row.place_associations.length + row.event_associations.length + (row.roundup_event_mentions || []).length + (row.venue_context_associations || []).length > 0, `${row.shortcode} has no association`);
    ensure(row.native_path_kind === (row.native_url.includes("/p/") ? "p" : "reel"), `${row.shortcode} changed native route kind`);
    const auditedPlaceKeys = new Set(row.place_associations.map((place) => place.curated_key));
    const registryPlaceKeys = placeLinks.get(row.native_url) || new Set();
    ensure(auditedPlaceKeys.size === registryPlaceKeys.size && [...registryPlaceKeys].every((key) => auditedPlaceKeys.has(key)), `${row.shortcode} place associations differ between the registry and audit`);
    for (const place of row.place_associations) {
      ensure(registryPlaceKeys.has(place.curated_key), `${row.shortcode} is absent from ${place.curated_key}`);
      const entry = curatedByKey.get(place.curated_key);
      ensure(!!entry, `${place.curated_key} does not exist in the creator registry`);
      ensure((entry.displayName || entry.match?.name) === place.name && (entry.displayCity || entry.match?.city) === place.city, `${place.curated_key} name/city identity differs from its audit record`);
      ensure((entry.placeId || null) === place.place_id, `${place.curated_key} place-id identity differs from its audit record`);
      ensure(Boolean(place.place_id) === place.native_wayfind_surface.startsWith("/p/"), `${place.curated_key} may deep-link only when its exact place id was verified`);
      const video = (entry.videos || []).find((candidate) => candidate.url === row.native_url);
      const caption = captionFor({ ...video, k: entry.key });
      ensure(!!caption, `${place.curated_key} has no local editorial caption evidence for ${row.shortcode}`);
      if (reviewedRoundups.has(row.shortcode)) {
        ensure(/roundup|shared post|brand|names|includes|does not (?:claim|identify)/i.test(caption), `${place.curated_key} caption must identify the reviewed source as multi-subject rather than claim a visit`);
      }
    }
    for (const event of row.event_associations) ensure(eventLinks.get(row.native_url)?.has(event.event_id), `${row.shortcode} is absent from ${event.event_id}`);
    for (const event of row.roundup_event_mentions || []) ensure(roundupLinks.get(row.native_url)?.has(event.event_id), `${row.shortcode} roundup mention is absent from ${event.event_id}`);
    for (const event of row.venue_context_associations || []) ensure(venueContextLinks.get(row.native_url)?.has(event.event_id), `${row.shortcode} venue context is absent from ${event.event_id}`);
    const embed = embedSrc("instagram", row.native_url);
    ensure(!!embed, `${row.shortcode} does not resolve to an official Instagram embed`);
    ensure(embed.includes(`/${row.native_path_kind === "p" ? "p" : "reel"}/${row.shortcode}/embed/`), `${row.shortcode} embed changed its native route kind`);
  }
  for (const [eventId, posts] of Object.entries(EVENT_SOCIAL)) for (const [, url] of posts) {
    const row = audit.records.find((candidate) => candidate.native_url === url);
    ensure(row?.event_associations.some((event) => event.event_id === eventId && event.association_kind === "exact_event"), `${eventId} exact post ${url} has no matching exact-event audit record`);
  }
  for (const [eventId, posts] of Object.entries(EVENT_ROUNDUP_MENTIONS)) for (const [, url] of posts) {
    const row = audit.records.find((candidate) => candidate.native_url === url);
    ensure(row?.roundup_event_mentions?.some((event) => event.event_id === eventId && event.association_kind === "roundup_mention"), `${eventId} roundup ${url} has no matching mention audit record`);
  }
  for (const [eventId, posts] of Object.entries(EVENT_VENUE_CONTEXT)) for (const [, url] of posts) {
    const row = audit.records.find((candidate) => candidate.native_url === url);
    ensure(row?.venue_context_associations?.some((event) => event.event_id === eventId && event.association_kind === "venue_context"), `${eventId} venue-context post ${url} has no matching audit record`);
  }
  ensure(audit.summary.sources_with_any_association === 47, "mapped source coverage drifted");
  ensure(audit.summary.retrievable_reported_source_total === audit.records.length + unresolved.length, "retrievable intake total drifted");
  ensure(audit.summary.retrievable_reported_sources_mapped === audit.records.length, "retrievable mapped-source total drifted");
  ensure(audit.summary.remaining_unmapped_sources === unresolved.length, "retrievable unresolved-source total drifted");
  ensure(audit.summary.place_association_count === audit.records.reduce((count, row) => count + row.place_associations.length, 0), "place-association count drifted");
  ensure(audit.summary.unique_place_association_count === new Set(audit.records.flatMap((row) => row.place_associations.map((place) => place.curated_key))).size, "unique place-association count drifted");
  ensure(audit.summary.sources_with_event_association === audit.records.filter((row) => row.event_associations.length > 0).length, "exact-event source count drifted");
  ensure(audit.summary.exact_event_association_count === Object.values(EVENT_SOCIAL).flat().length, "exact-event association count drifted");
  ensure(audit.summary.roundup_event_mention_count === Object.values(EVENT_ROUNDUP_MENTIONS).flat().length, "roundup mention count drifted");
  ensure(audit.summary.venue_context_association_count === Object.values(EVENT_VENUE_CONTEXT).flat().length, "venue-context association count drifted");

  const tampaRoundup = "https://www.instagram.com/reel/Dc3asu4uUOI/";
  const farmRoundup = "https://www.instagram.com/reel/Dc3WlMLx2iv/";
  ensure(eventSocialPosts("howl-o-scream-tampa-2026").length === 0, "Howl-O-Scream must not claim the general Tampa September roundup as event footage");
  ensure(eventSocialPosts("wfc:screamageddon-2026").length === 4, "the wfc: event-id path keeps all four dedicated Scream-A-Geddon posts");
  ensure(!eventSocialPosts("screamageddon-2026").some((post) => post.url === tampaRoundup), "Scream-A-Geddon must not mix a roundup mention into its dedicated event posts");
  ensure(eventSocialPosts("pintos-fall-at-the-farm-2026").length === 0, "Pinto's event must not promote either a farm roundup or a venue-only post as event footage");
  ensure(eventSocialPosts("florida-coffee-festival-2026").some((post) => post.url.endsWith("/Dc_KiM5xqhv/") && post.association === "exact_event"), "Florida Coffee Festival's dedicated organiser post remains available as the positive control");
  for (const [url, ids] of roundupLinks) {
    ensure(![...ids].some((eventId) => eventSocialPosts(eventId).some((post) => post.url === url)), `${url} must remain mention evidence, never exact event media`);
  }
  for (const [url, ids] of venueContextLinks) {
    ensure(![...ids].some((eventId) => eventSocialPosts(eventId).some((post) => post.url === url)), `${url} must remain venue context, never exact event media`);
  }

  const social = readFileSync(path.join(repo, "app/components/sheets/SocialFind.js"), "utf8");
  ensure(/hydratedFindForSpot\(spot, videoHeroPlaces\)/.test(social) && !/find\(\(o\) => o\.video\.url === spot\.video\.url\)/.test(social), "roundup cards must hydrate by place identity");
  ensure((social.match(/setSocialFind\(\{ place: local\.place, video: spot\.video \}\)/g) || []).length === 2, "both browse surfaces must retain the selected post");
  ensure(/!curatedSpot && \(/.test(social) && /<VideoFacade platform=\{video\.platform\}/.test(social), "registry previews must embed the native post without a full-place CTA");

  const eventPage = readFileSync(path.join(repo, "app/florida-events/[slug]/page.js"), "utf8");
  ensure(/eventSocialPosts\(e\.event_id\)/.test(eventPage) && /<CreatorVideoRail/.test(eventPage) && /<VideoFacade/.test(eventPage), "event pages must render reviewed creator posts through the shared premium rail and click-to-load facade");
  ensure(/View @\{post\.creator\}&rsquo;s post on Instagram/.test(eventPage) && /href=\{post\.url\}/.test(eventPage), "event pages must keep visible, attributed native-link fallbacks");
  ensure(eventPage.indexOf('aria-label="Creator posts about this event"') < eventPage.indexOf("\n      <EventWhere\n"), "event creator posts must appear before the map and nearby recommendations");
  ensure(/poster=\{socialPoster\}/.test(eventPage) && /fallbackPoster=\{socialPosterFallback\}/.test(eventPage), "event creator facades must open with the event's available hero cover");

  const facade = readFileSync(path.join(repo, "app/components/VideoFacade.js"), "utf8");
  ensure(/from "\.\.\/\.\.\/lib\/creatorPlatforms"/.test(facade) && !/from "\.\.\/\.\.\/lib\/creatorVideos"/.test(facade), "the facade must not pull the full creator registry into an event-page chunk");
  ensure(/if \(play\)/.test(facade) && /<iframe src=\{src\}/.test(facade), "the third-party iframe must remain behind an explicit play/view action");
  ensure(/const instagramPost = platform === "instagram"/.test(facade) && /instagramPost \? "View post" : "Play"/.test(facade), "every Instagram embed must use post-neutral wording because the provider may offer only a native handoff");

  const fallRoute = readFileSync(path.join(repo, "app/api/events/fall/route.js"), "utf8");
  ensure(/fall-intents:v14:/.test(fallRoute), "fall rail cache must invalidate payloads written before creator marks");
  ensure(/const creatorReels = detailHref \? eventSocialPosts\(e\.event_id\)/.test(fallRoute), "fall event marks must require a reachable Wayfind detail page");
  ensure(/\.filter\(\(post\) => post\.platform === "instagram" && \/instagram/.test(fallRoute) && /creatorReels,/.test(fallRoute), "fall cards must receive compact Instagram reel credit, never ambiguous /p/ media");
  ensure(!/creatorReels[^\n]*url/.test(fallRoute), "fall card credit must not copy native URLs into the rail payload");

  const fallComponent = readFileSync(path.join(repo, "app/components/FallIntentRails.js"), "utf8");
  const railCard = readFileSync(path.join(repo, "app/components/RailCard.js"), "utf8");
  ensure(/creatorVideos=\{isEvent \? card\.creatorReels : undefined\}/.test(fallComponent), "fall event cards must pass compact creator credit to the shared card");
  ensure(/Array\.isArray\(creatorVideos\)[^]*?creatorVideos[^]*?: place \? \(creatorVideosFor\(place\)/.test(railCard), "RailCard must prefer explicit event creator credit without changing place resolution");

  const dinerBrand = allCreators().creators.find((creator) => creator.handle.toLowerCase() === "atthediner");
  ensure(dinerBrand && dinerBrand.count === new Set(dinerBrand.spots.map((spot) => spot.key)).size, "page eligibility must count unique venues");
  ensure(hasCreatorPage("atthediner") === false, "two brand locations must not mint a thin creator page");
  const wrongRegion = [
    ...creatorVideosFor({ name: "Urban Kai", city: "Miami", address: "Miami, FL" }, "Miami"),
    ...creatorVideosFor({ name: "Florida Avenue Brewing Co.", city: "Orlando", address: "Orlando, FL" }, "Orlando"),
  ];
  ensure(!wrongRegion.some((video) => video.url.endsWith("/Dc3asu4uUOI/")), "Tampa Bay roundup previews must not match same-name venues in another city");
}
