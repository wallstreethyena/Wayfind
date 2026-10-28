import { readFileSync } from "node:fs";
import path from "node:path";
import { __CURATED_FOR_CODEGEN__ as CURATED, allCreators, creatorVideosFor, creatorCountFor, hasCreatorPage } from "../../lib/creatorVideos.js";
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
  // Exact owner intake stays executable in the existing mandatory guard.
  // Two unidentified clips must remain unattached rather than borrow a name.
  const intake = JSON.parse(readFileSync(path.join(repo, "docs/curation/owner-seven-instagram-2026-10-28.json"), "utf8"));
  ensure(intake.sources.length === 7, "owner seven-link intake must retain every submitted source");
  ensure(new Set(intake.sources.map((source) => source.shortcode)).size === 7, "owner intake shortcodes must be distinct");
  const verified = intake.sources.filter((source) => source.status === "verified");
  const held = intake.sources.filter((source) => source.status === "held_identity");
  ensure(verified.length === 5 && held.length === 2, "five sourced posts and two explicit identity holds must remain accountable");
  ensure(verified.flatMap((source) => source.places).length === 8, "the four-destination beach roundup must retain all four associations");
  for (const source of verified) for (const place of source.places) {
    const videos = creatorVideosFor({ id: place.place_id, name: place.name, city: place.city }, place.city);
    const matches = videos.filter((video) => video.url === source.native_url);
    ensure(matches.length === 1 && matches[0].creator === source.creator, `${source.shortcode} must reach ${place.name} once with its creator credit`);
    const caption = captionFor(matches[0]);
    ensure(caption.length > 40, `${place.key} needs its original editorial caption`);
    if (source.kind === "multi_place_roundup") ensure(/roundup/i.test(caption), `${place.key} must disclose the shared roundup`);
    ensure(embedSrc("instagram", source.native_url) === source.native_url + "embed/", `${source.shortcode} must retain its native embed path`);
    const wrong = creatorVideosFor({ id: "ChIJdifferentVerifiedVenue123", name: place.name, city: place.city }, place.city);
    ensure(!wrong.some((video) => video.url === source.native_url), `${place.key} cannot transfer its video to a same-name different Google ID`);
    for (const other of verified.flatMap((candidate) => candidate.places)) {
      if (source.places.some((candidate) => candidate.place_id === other.place_id)) continue;
      ensure(!creatorVideosFor({ id: other.place_id }).some((video) => video.url === source.native_url), `${source.shortcode} cannot appear on unrelated ${other.name}`);
    }
  }
  for (const source of held) {
    ensure(source.places.length === 0 && source.needed, `${source.shortcode} must explain its missing venue identity`);
    ensure(!CURATED.some((entry) => entry.videos.some((video) => video.url === source.native_url)), `${source.shortcode} must stay unpublished until the exact venue is sourced`);
  }
  for (const twin of ["ChIJPbX5AxsTw4gROkfgzEmV-5M", "ChIJV7hk7dQTw4gRNDR1PONlwis", "ChIJ4azy4NsTw4gRggI1e2ak_Rs", "ChIJX34pbZ0Pw4gR0NCoG6ZZVzA", "ChIJ-Y2aKDjLwogRtoPAwILap6k"]) {
    ensure(!creatorVideosFor({ id: twin }).some((video) => intake.sources.some((source) => source.native_url === video.url)), `owner intake cannot attach to excluded/access/wedding twin ${twin}`);
  }
  for (const key of ["treasure-island-beach", "ever-after-farms-upick-flowers-seffner", "coquina-beach-bradenton-beach", "bradenton-beach-destination", "holmes-beach-destination", "bean-point-beach-anna-maria", "guanabanas-jupiter"]) {
    const entry = CURATED.find((candidate) => candidate.key === key);
    ensure(entry && creatorCountFor({ id: entry.placeId }) === 0, `${key} displays credited business/guide content without inventing independent corroboration`);
  }
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
  // 47 prior mapped sources + 14 verified current sources + 4 formerly
  // unresolved identities + 6 exact DFB sources + 3 recovered Instagram backlog originals.
  // Plus the owner-submitted Rreal Tacos Tampa source reviewed 2026-10-22.
  ensure(audit.records.length === 75, `expected 75 audited sources, got ${audit.records.length}`);
  ensure(new Set(audit.records.map((row) => row.shortcode)).size === 75, "shortcodes must be unique");
  ensure(unresolved.length === 0, `the four historical identities are now resolved; got ${unresolved.length} still marked unresolved`);
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
  ensure(audit.summary.sources_with_any_association === 75, "mapped source coverage drifted");
  ensure(audit.summary.source_total === audit.records.length, "audited source total drifted");
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
  const screamJess = "https://www.instagram.com/reel/Dc2vEpFiFL5/";
  const screamOriginal = [
    "https://www.instagram.com/reel/Dc2WqU-xuCD/",
    "https://www.instagram.com/reel/Dc2vk3eBHGQ/",
    "https://www.instagram.com/reel/Dc2e78nNoMm/",
    "https://www.instagram.com/reel/Dc2dtxHNbtt/",
  ];
  const screamPosts = eventSocialPosts("screamageddon-2026");
  const screamWfc = eventSocialPosts("wfc:screamageddon-2026");
  const screamUrls = screamPosts.map((post) => post.url);
  const otherHalloween = [
    "hhn-orlando-2026",
    "howl-o-scream-tampa-2026",
    "howl-o-scream-seaworld-2026",
    "brick-or-treat-2026",
    "beware-the-night-brevard-zoo-2026",
    "mnsshp-2026",
  ];
  ensure(eventSocialPosts("howl-o-scream-tampa-2026").length === 0, "Howl-O-Scream must not claim the general Tampa September roundup as event footage");
  ensure(screamWfc.length === 5, "the wfc: event-id path keeps all five dedicated Scream-A-Geddon posts");
  ensure(screamPosts.length === 5, "screamageddon-2026 keeps the original four dedicated posts plus the verified Jess reel");
  ensure(screamPosts.some((post) => post.url === screamJess && post.creator === "makingmemorieswithjess"), "Dc2vEpFiFL5 resolves on screamageddon-2026 as makingmemorieswithjess");
  ensure(screamOriginal.every((url) => screamUrls.includes(url)), "the original four Scream-A-Geddon URLs remain");
  ensure(screamUrls.join("\0") === screamWfc.map((post) => post.url).join("\0"), "wfc:screamageddon-2026 and screamageddon-2026 return the same five URLs");
  ensure(new Set(screamUrls).size === screamUrls.length, "Scream-A-Geddon exact posts have no duplicate URLs");
  ensure(!eventSocialPosts("hhn-orlando-2026").some((post) => post.url === screamJess), "Jess's Scream-A-Geddon reel must not appear on HHN");
  for (const eventId of otherHalloween) {
    ensure(!eventSocialPosts(eventId).some((post) => post.url === screamJess), `Dc2vEpFiFL5 must not attach to ${eventId}`);
  }
  const hhn = eventSocialPosts("hhn-orlando-2026");
  const hhnExpected = [
    "https://www.instagram.com/reel/DcycQAlkXid/",
    "https://www.instagram.com/reel/DcwSHqZj-TU/",
  ];
  ensure(
    hhn.length === 2
      && hhn.map((post) => post.url).join("\0") === hhnExpected.join("\0")
      && hhn.every((post) => post.creator === "horrornightsorl"),
    "HHN keeps the two official #1306 reels in that order"
  );
  ensure(!roundupLinks.has(screamJess) && !venueContextLinks.has(screamJess), "Dc2vEpFiFL5 stays off ROUNDUP_MENTIONS and VENUE_CONTEXT_POSTS");
  ensure(eventSocialPosts("scream-a-geddon-dade-city-2026").length === 0, "the public slug is not an eventSocial key");
  ensure(!eventSocialPosts("screamageddon-2026").some((post) => post.url === tampaRoundup), "Scream-A-Geddon must not mix a roundup mention into its dedicated event posts");
  ensure(eventSocialPosts("pintos-fall-at-the-farm-2026").length === 0, "Pinto's event must not promote either a farm roundup or a venue-only post as event footage");
  ensure(eventSocialPosts("florida-coffee-festival-2026").some((post) => post.url.endsWith("/Dc_KiM5xqhv/") && post.association === "exact_event"), "Florida Coffee Festival's dedicated organiser post remains available as the positive control");

  // The owner's flyer and four new Florida reels must reach their exact venue
  // cards. Test mismatched IDs too: a familiar venue name cannot steal credit.
  const octoberSources = [
    ["DeZO5ntRRM9", "sarasota-fairgrounds-sarasota", "ChIJPWsUhY9Aw4gRoltOtGa3nPM", "sarasota_lifebynay"],
    ["DdKRIpttTiK", "dead-coconut-club-citywalk-orlando", "ChIJwZ_GK-d-54gRm5Ahg7PZYeY", "magicalmaddieb"],
    ["DdHjBG-CfcV", "permanent-vacation-maitland", "ChIJsTUqwm5x54gRrbDWFjwv8TM", "sunshinestateselling"],
    ["DdJ2qn3Riw7", "showcase-of-citrus-clermont", "ChIJW5C20gaI54gRZuH_-8hPQy8", "oliviashannonwolk"],
    ["DcFJ6i9sJBe", "cherry-smash-coral-springs", "ChIJXWVI-Nca2YgRJxmxjtOPI3U", "doseofsunshinefl"],
    ["Dc_wbrxy7dr", "cherry-smash-coral-springs", "ChIJXWVI-Nca2YgRJxmxjtOPI3U", "cherrysmashfl"],
    ["Dc50nKNB9pJ", "cordova-inn-st-petersburg", "ChIJxzf0Op3hwogRjW4p7ZQeClE", "tampabayisawesome"],
    ["Dc1zpeROuEE", "cherry-smash-coral-springs", "ChIJXWVI-Nca2YgRJxmxjtOPI3U", "aquiestamama"],
  ];
  for (const [shortcode, key, placeId, creator] of octoberSources) {
    const entry = curatedByKey.get(key);
    const source = audit.records.find((row) => row.shortcode === shortcode);
    ensure(entry?.placeId === placeId && source?.creator_handle === creator, `${shortcode} must retain verified venue and creator identity`);
    ensure(creatorVideosFor({ id: placeId }).some((video) => video.url === source.native_url && video.creator === creator), `${shortcode} must resolve through the exact existing inventory ID`);
    const impostor = { id: "ChIJdifferentVerifiedVenue123", name: entry.match.name, city: entry.match.city };
    ensure(!creatorVideosFor(impostor, entry.match.city).some((video) => video.url === source.native_url), `${shortcode} must not attach to a different Google ID with the same name`);
  }
  const flyerUrl = "https://www.instagram.com/p/DeZO5ntRRM9/";
  const frightFest = eventSocialPosts("sarasota-frightfest-2026");
  ensure(frightFest.length === 1 && frightFest[0].url === flyerUrl && frightFest[0].creator === "sarasota_lifebynay", "FrightFest must show its dedicated static flyer with the observed creator credit");
  ensure(eventSocialPosts("wfc:sarasota-frightfest-2026")[0]?.url === flyerUrl, "FrightFest's wfc event ID must retain the same native static post");
  ensure(embedSrc("instagram", flyerUrl) === "https://www.instagram.com/p/DeZO5ntRRM9/embed/", "a static flyer must not be rewritten as a Reel");
  const flyerVideo = creatorVideosFor({ id: "ChIJPWsUhY9Aw4gRoltOtGa3nPM" }).find((video) => video.url === flyerUrl);
  ensure(/flyer/i.test(captionFor(flyerVideo)) && /announcement, not footage of a visit/i.test(captionFor(flyerVideo)), "FrightFest's place caption must describe a flyer rather than claim a filmed visit");
  ensure(!eventSocialPosts("hhn-orlando-2026").some((post) => post.url === flyerUrl), "the FrightFest flyer must not appear on a different Halloween event");
  ensure(creatorCountFor({ id: "ChIJXWVI-Nca2YgRJxmxjtOPI3U" }) === 2, "Cherry Smash has two independent visits; its own announcement must not become a third creator");
  ensure(creatorCountFor({ id: "ChIJxzf0Op3hwogRjW4p7ZQeClE" }) === 0, "Cordova's aggregator source must not manufacture independent corroboration");
  for (const outsideFlorida of ["DcHASaNRyjm", "DdHEy0dObxh", "DdKmHElP4NM"]) {
    const url = `https://www.instagram.com/reel/${outsideFlorida}/`;
    ensure(!placeLinks.has(url) && !eventLinks.has(url), `${outsideFlorida} is positively identified outside this Florida intake`);
  }
  const gideonsUrl = "https://www.instagram.com/p/DZATY0ZkaR5/";
  ensure(creatorVideosFor({ id: "ChIJPd6UAfJ_3YgRP-V0GS5jS8I" }).some((video) => video.url === gideonsUrl && video.creator === "disneyfoodblog"), "DFB's Gideon's source reaches its verified Disney Springs branch");
  ensure(!creatorVideosFor({ id: "ChIJC9pvtLN654gR6F0GZH-G-8I", name: "Gideon's Bakehouse", city: "Orlando" }, "Lake Buena Vista").some((video) => video.url === gideonsUrl), "the same-name East End Gideon's branch cannot steal Disney Springs credit");
  const epcotUrl = "https://www.instagram.com/p/DcZS_9jks2n/";
  ensure(eventSocialPosts("epcot-food-wine-2026").some((post) => post.url === epcotUrl && post.creator === "disneyfoodblog"), "DFB's verified Food & Wine post resolves on the exact 2026 festival ID");
  ensure(!placeLinks.has(epcotUrl) && !eventSocialPosts("epcot-international-food-and-wine-festival-2026").some((post) => post.url === epcotUrl), "festival coverage attaches by event identity rather than a park place ID or public slug");
  const yanetRoundup = "https://www.instagram.com/p/DdE9KVAlB5y/";
  const yanetParents = ["ChIJkWXRuBC02YgRripCIoUAN9g", "ChIJcxJRMYe42YgRDSlj6Z_CDxk", "ChIJhdEC7MUD2YgRWqeIwaYujc4", "ChIJgYp-DDIv2YgRH8hrgA3I3pI", "ChIJqwCnDja_2YgR0fQINSRA2MM"];
  ensure(yanetParents.every((id) => creatorVideosFor({ id }).some((video) => video.url === yanetRoundup && video.creator === "yanetfins")), "the five-slide haunted-event roundup credits all five verified parent venues");
  ensure(!eventLinks.has(yanetRoundup), "a static multi-event roundup must never be published as exact event footage");
  for (const video of CURATED.flatMap((entry) => entry.videos || []).filter((video) => video.url === yanetRoundup)) {
    ensure(/roundup/.test(captionFor(video)) && /venue context, not footage/.test(captionFor(video)), "each roundup association preserves the context boundary");
  }
  const cakePosts = creatorVideosFor({ id: "ChIJUcSOQap_3YgRzKLq5rYIdYI" });
  ensure(cakePosts.some((video) => video.url.endsWith("/DeSRAJ1EhW2/")) && cakePosts.some((video) => video.url.endsWith("/DcYoVW-GwHR/")), "the shared Cake Bake listing retains distinct restaurant and bakery sources without duplicate place identities");
  const olivia = creatorVideosFor({ id: "ChIJAcphlZd_3YgRVnw4XgEUJoY" }).find((video) => video.url.endsWith("/DcWvff6AdDh/"));
  ensure(!!olivia && /dated.*news roundup/i.test(captionFor(olivia)) && /not a filmed brunch visit/i.test(captionFor(olivia)), "Olivia's verified alternate is dated menu news and does not falsely resolve original brunch footage");
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
  ensure(/<CreatorVideoAction platform=\{post\.platform\} url=\{post\.url\}/.test(eventPage) && /Watch @\{post\.creator\}&rsquo;s post in Wayfind/.test(eventPage), "event posts must retain attribution and open the shared in-app player");
  ensure(eventPage.indexOf('aria-label="Creator posts about this event"') < eventPage.indexOf("\n      <EventWhere\n"), "event creator posts must appear before the map and nearby recommendations");
  ensure(/poster=\{socialPoster\}/.test(eventPage) && /fallbackPoster=\{socialPosterFallback\}/.test(eventPage), "event creator facades must open with the event's available hero cover");

  const facade = readFileSync(path.join(repo, "app/components/VideoFacade.js"), "utf8");
  ensure(/from "\.\.\/\.\.\/lib\/creatorPlatforms"/.test(facade) && !/from "\.\.\/\.\.\/lib\/creatorVideos"/.test(facade), "the facade must not pull the full creator registry into an event-page chunk");
  ensure(/if \(play\)/.test(facade) && /<CreatorVideoPlayer platform=\{platform\}/.test(facade), "the third-party iframe must remain behind an explicit play/view action");
  ensure(facade.includes('const instagramPost = platform === "instagram" && /\\/p\\//.test(url)') && facade.includes("data-creator-play-icon") && facade.includes("data-creator-post-icon"), "video covers must show a play triangle while ambiguous /p/ posts retain a distinct post control");
  const detail = readFileSync(path.join(repo, "app/components/sheets/Detail.js"), "utf8");
  ensure(detail.includes("Watch ${handle}'s video about ${detail.name}") && !detail.includes("Watch ${handle}'s visit to ${detail.name}"), "creator video headlines must describe the source without inventing a personal visit for a district guide or roundup");

  const fallRoute = readFileSync(path.join(repo, "app/api/events/fall/route.js"), "utf8");
  // v26 or later: each publication moves the key forward, never back.
  const fallKeyVersion = Number((fallRoute.match(/fall-intents:v(\d+):/) || [])[1]);
  ensure(fallKeyVersion >= 26, `fall rail cache must invalidate pre-v26 payloads (v24 added verified visit facts and operating status; v25 the 2026-10-06 Halloween DB seed; v26 the 2026-10-06 statewide gap fill; v27 the 2026-10-07 farm/food gap fill) — found v${fallKeyVersion}`);
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
