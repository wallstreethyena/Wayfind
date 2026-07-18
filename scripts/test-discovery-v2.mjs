// Focused, dependency-free contract tests for PR 1 discovery-v2 foundations.
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { isDiscoveryV2Enabled } from "../lib/discoveryV2.js";

let assertions = 0;
const fail = (message) => { console.error(`test-discovery-v2: FAIL — ${message}`); process.exit(1); };
const ok = (condition, message) => { if (!condition) fail(message); assertions++; };

const component = readFileSync(new URL("../app/components/discovery-v2.js", import.meta.url), "utf8");
const kit = readFileSync(new URL("../app/components/kit.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const brand = readFileSync(new URL("../app/components/BrandLockup.js", import.meta.url), "utf8");
const social = readFileSync(new URL("../app/components/SocialReviewCardV2.js", import.meta.url), "utf8");
const facade = readFileSync(new URL("../app/components/VideoFacade.js", import.meta.url), "utf8");
const creatorVideos = readFileSync(new URL("../lib/creatorVideos.js", import.meta.url), "utf8");
const videoEmbed = readFileSync(new URL("../lib/videoEmbed.js", import.meta.url), "utf8");
const wordmarkAsset = readFileSync(new URL("../public/wordmark.png", import.meta.url));
const pinAsset = readFileSync(new URL("../public/pin.png", import.meta.url));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

ok(isDiscoveryV2Enabled(undefined) === false, "missing flag defaults OFF");
ok(isDiscoveryV2Enabled("") === false, "empty flag defaults OFF");
ok(isDiscoveryV2Enabled("false") === false && isDiscoveryV2Enabled("off") === false, "explicit false/off remain OFF");
ok(isDiscoveryV2Enabled("true") && isDiscoveryV2Enabled("1") && isDiscoveryV2Enabled("ON"), "only documented opt-in values enable v2");
ok(component.includes("enabled = DISCOVERY_V2_ENABLED") && component.includes("return enabled ? children : fallback"), "DiscoveryV2Boundary gates new surfaces");
ok(!home.includes("discovery-v2") && !home.includes("NEXT_PUBLIC_DISCOVERY_V2"), "current application shell is untouched while foundations are isolated");

const expectedLabels = ["Food", "Night out", "Things to do", "Family", "Stays", "Shopping"];
for (const label of expectedLabels) ok(component.includes(`label: "${label}"`), `CategoryNav includes ${label}`);
ok((component.match(/\{ key: "[^"]+", label: "[^"]+", icon: "[^"]+" \}/g) || []).length === 6, "CategoryNav has exactly six primary categories");
ok(component.includes('gridTemplateColumns: "repeat(6, minmax(0, 1fr))"'), "CategoryNav uses six exactly equal columns");
ok(component.includes('width: "100%",\n                height: 76') && component.includes('padding: `${SPACE.xs}px 2px`') && component.includes('whiteSpace: "normal"') && component.includes('overflowWrap: "anywhere"'), "category controls have equal fixed height and wrapping labels without clipping");

ok(/export function DealsButton[\s\S]*?<Icon name="ticket"/.test(component), "DealsButton reuses the kit ticket icon");
ok(kit.includes('ticket: <><path') && kit.includes('bookmark:') && kit.includes('thumbup:') && kit.includes('thumbdown:') && kit.includes('share:'), "all discovery actions use the shared icon set");

const pulse = component.slice(component.indexOf("export function LocalPulse"), component.indexOf("export function ExperienceRail"));
ok(pulse.includes("background: C.panel") && pulse.includes("color: C.accent"), "LocalPulse uses charcoal and orange tokens");
ok((pulse.match(/45,212,191/g) || []).length === 1 && pulse.includes('border: "1px solid rgba(45,212,191,.42)"'), "LocalPulse restricts teal to one restrained border");

const rail = component.slice(component.indexOf("export function ExperienceRail"), component.indexOf("function ActionButton"));
ok(rail.includes('overflowX: "auto"') && rail.includes('scrollSnapType: "x mandatory"'), "ExperienceRail is horizontally scrollable and snap-aligned");
ok(rail.includes("<DiscoveryImage") && rail.includes("experience.image || experience.photo"), "ExperienceRail is photographic and uses the existing image state pipeline");

const card = component.slice(component.indexOf("export function PlaceCardV2"));
ok(card.includes("toDisplayScore(place.wfScore)") && card.includes("<WayfindScoreBadge"), "PlaceCardV2 renders the existing Wayfind Score contract");
ok(card.includes("Curator&apos;s Pick") && card.includes("ownerPick"), "PlaceCardV2 supports source-backed Curator's Pick");
ok(card.includes('aria-label="Experience tags"') && card.includes("experienceTags"), "PlaceCardV2 supports experience tags");
ok(card.includes("dealText") && card.includes('<Icon name="ticket"'), "PlaceCardV2 supports contextual deal badges");
for (const action of ["Save", "Like", "Dislike", "Share"]) ok(card.includes(`label="${action}"`), `PlaceCardV2 exposes ${action}`);
ok(component.includes("imageDisplayState({ src, errored, loaded })") && component.includes("<BrandedImageFallback"), "Discovery images reuse skeleton/error/fallback pipeline");
ok(home.includes("function PlaceCard({"), "original PlaceCard remains present");

ok(brand.includes("export function BrandLockup"), "canonical BrandLockup is reusable");
ok(brand.indexOf('src="/wordmark.png"') < brand.indexOf('src="/pin.png"'), "BrandLockup ordering is wordmark then pin");
ok(brand.includes('flexDirection: "row"') && brand.includes('flexWrap: "nowrap"'), "BrandLockup ordering cannot wrap or rearrange");
ok(brand.includes('gap: "calc(var(--wf-brand-lockup-size) * .16)"'), "BrandLockup has one proportional spacing rule");
ok((brand.match(/height: "var\(--wf-brand-lockup-size\)"/g) || []).length === 2, "wordmark and pin share one responsive size");
ok(brand.includes('size = "clamp(28px, 7vw, 34px)"'), "BrandLockup defaults to responsive sizing");
ok(brand.includes('role="img"') && brand.includes("aria-label={ariaLabel}"), "BrandLockup exposes one accessible brand label");
ok((brand.match(/alt=""/g) || []).length === 2 && (brand.match(/aria-hidden="true"/g) || []).length === 2, "decorative child images do not duplicate the accessible label");
ok(brand.includes('background: "transparent"') && !/background:\s*["'](?:#0{3,6}|black)/i.test(brand), "BrandLockup stays transparent with no baked black rectangle");
ok(!/filter:|transform:|row-reverse|text-transform/i.test(brand), "BrandLockup does not recolor, capitalize, or rearrange assets");
ok(sha256(wordmarkAsset) === "fce1e641e554188b56d518e3999eb2b8346982e860fb37b0d9f83d08da37141a", "canonical wordmark asset is byte-for-byte unchanged");
ok(sha256(pinAsset) === "f95402445dc25f78f790534f6e0d41cb5532f5b971587bbbb70663247bfd376c", "canonical pin asset is byte-for-byte unchanged");
ok(!/BrandLockup/.test(home), "BrandLockup is not mounted in app/home.js");

ok(social.includes('import { creatorVideosFor, PLATFORM } from "../../lib/creatorVideos"'), "SocialReviewCardV2 reuses the existing creator-video source and platform metadata");
ok(social.includes('import VideoFacade from "./VideoFacade"') && social.includes("<VideoFacade"), "SocialReviewCardV2 reuses the click-to-load VideoFacade");
ok(social.includes('import { isEmbeddable } from "../../lib/videoEmbed"'), "SocialReviewCardV2 reuses existing embed eligibility");
ok(social.includes("creatorVideosFor(place, locName).filter(isSupportedCreatorVideo)"), "social reviews resolve only through curated renderable creator data");
ok(creatorVideos.includes("function renderable(videos)") && creatorVideos.includes("v.url.trim().length > 0"), "existing source keeps staged/non-native records from rendering");
for (const platform of ["tiktok", "instagram", "youtube"]) ok(social.includes(`${platform}: [`), `SocialReviewCardV2 supports ${platform}`);
ok(!social.includes("facebook:"), "SocialReviewCardV2 fails closed for unsupported Facebook share links");
ok(social.includes("source.protocol === \"https:\"") && social.includes("isPlatformHost(source.hostname"), "social reviews require a native HTTPS platform URL");
ok(social.includes("Featured on ${platform.label}") && social.includes("video.creatorName") && social.includes("video.creator_name"), "card supports platform label, handle, and optional creator name");
ok(social.includes("video.headline") && social.includes("video.description || video.caption"), "card supports a place-specific headline and factual source-backed description");
ok(social.includes("thumbnail={video.thumbnail}") && facade.includes("{thumbnail && <img"), "source-backed thumbnails flow into the existing facade");
ok(facade.includes("const [play, setPlay] = useState(false)") && facade.indexOf("<iframe") < facade.indexOf('onClick={() => setPlay(true)}'), "third-party iframe remains click-to-load with no initial autoplay embed");
ok(facade.includes('aria-label={`Play ${label}`}'), "VideoFacade retains its accessible play control");
ok(social.includes('Watch Video <span aria-hidden="true">↗</span>') && social.includes('href={video.url}') && social.includes('target="_blank"'), "Watch Video opens the creator's original post externally");
ok(!/fetch\(|download|rehost|<iframe/i.test(social), "SocialReviewCardV2 does not fetch, download, rehost, or directly embed creator media");
ok(social.includes('rel={partner ? "sponsored noopener" : "noopener"}') && social.includes("Sponsored creator content.") && social.includes("Partner creator content."), "optional sponsored/partner disclosure is explicit");
ok(social.includes("enabled = DISCOVERY_V2_ENABLED") && social.includes("if (!enabled"), "social review card and badge default behind discovery-v2 flag");
ok(social.includes("SocialPlatformBadgeV2({ place, locName") && social.includes("socialReviewVideoFor(place, locName, videoIndex)"), "compact social badge resolves through the curated source instead of accepting arbitrary data");
ok(card.includes("showSocialBadge = false") && card.includes("<SocialPlatformBadgeV2 place={place} locName={socialReviewLocName}"), "PlaceCardV2 supports an optional source-backed compact platform badge");
ok(social.includes('gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))"'), "SocialReviewCardV2 collapses responsively on narrow surfaces");
ok(!/SocialReviewCardV2|SocialPlatformBadgeV2/.test(home), "social-review v2 foundations are not mounted in app/home.js");
ok(!/wfScore|WayfindScore|rank|boost|curator/i.test(social), "social-review presentation cannot alter score, ranking, or Curator Boost");
ok(videoEmbed.includes("youtube-nocookie.com") && videoEmbed.includes("instagram.com/reel") && videoEmbed.includes("tiktok.com/player"), "existing privacy/performance embed paths remain the single implementation");

console.log(`test-discovery-v2: OK — ${assertions} assertions`);
