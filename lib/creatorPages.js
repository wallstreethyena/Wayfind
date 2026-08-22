// lib/creatorPages.js — SERVER-RENDERED. The indexable /creators layer (Phase 2b).
//
// WHY THIS EXISTS (owner, 2026-08-22: "i also want you to add Cindy's own place
// card on wayfind as a wayfind influence and organize all of her place cards
// there"). Until now a creator's whole body of work on Wayfind lived inside
// sheets/SocialFind.js — a client sheet, behind a tap, on a noindex surface.
// A creator could not link anyone to it, Google could not read it, and the only
// thing Wayfind could actually offer a creator in exchange for participation
// (wayfind-voice-and-creator-archetype-strategy-prompt-2026-08-04.md, §B4) did
// not exist yet. This is that page: one durable, crawlable URL per creator,
// with every place they have featured organised by city.
//
// IT IS ALSO THE BACKLINK ENGINE, and that is the deliberate part. Each page
// carries a FOLLOWED link to the creator's own profile and to each of their
// posts (no nofollow, no noreferrer — same rule lib/trending.js already
// follows). That is a real, permanent SEO gift, which is precisely what makes a
// creator want to link back to their page from a bio, a caption or a story —
// and a link earned that way is the only kind worth having. Nothing here is a
// trick played on a crawler: the page is a genuine, unique, human-useful index
// of real places with real addresses and real videos.
//
// WHAT IT REFUSES TO DO, on purpose:
//   · No "Wayfind Creator" framing, anywhere. lib/creatorRights.js bans the
//     phrase and check-creator-rights.mjs fails the build on it — a membership
//     badge over a real person's face is Lanham Act s.43(a) false endorsement,
//     and a disclaimer elsewhere does not cure it. These pages say what is
//     true: independent creators, publicly posted, credited and linked.
//   · No VideoObject JSON-LD. It is gated behind the same owner decision
//     lib/trending.js records — a valid VideoObject needs a durable thumbnail
//     and a real uploadDate, and re-hosting a creator's frame is the one thing
//     the Hunley v. Instagram embedding defence does NOT reach.
//   · No page for a creator with a single curated spot. A one-item page is a
//     thin/doorway page; those get filtered, they do not rank, and shipping 17
//     of them to chase URL count is exactly the kind of loophole that costs a
//     domain its trust. MIN_SPOTS is the honest line.
import { SITE_URL } from "./site";
import { socialMeta } from "./socialMeta";
import { allCreators, PLATFORM, CREATOR_PAGE_MIN_SPOTS } from "./creatorVideos";
import { isEmbeddable } from "./videoEmbed";
import { summaryFor, archetypeFor } from "./creatorArchetypes";
import { AFFILIATION_DISCLOSURE, REMOVAL_PROMPT, REMOVAL_CONTACT } from "./creatorRights";
import { TRENDING } from "./trending";
import VideoFacade from "../app/components/VideoFacade";
import CreatorAvatar from "../app/components/CreatorAvatar";

// A creator earns a page at three curated spots. Below that there is not enough
// unique, real content on the page to be worth a crawler's time or a reader's.
// The number itself lives in lib/creatorVideos.js so the CLIENT sheet that links
// to these pages can ask the same question without importing this module.
export const MIN_SPOTS = CREATOR_PAGE_MIN_SPOTS;

// Handles are used verbatim as the slug — they are already URL-safe in practice
// (letters, digits, "." and "_"), and a lossy slugify would break the round trip
// back to the handle the rest of the codebase keys on.
const SLUG_OK = /^[A-Za-z0-9._-]{1,40}$/;

/** Every creator with a page, richest body of work first. */
export function pagedCreators() {
  const { creators } = allCreators();
  return creators.filter((c) => c.count >= MIN_SPOTS && SLUG_OK.test(c.handle));
}

export function creatorSlugs() {
  return pagedCreators().map((c) => c.handle);
}

/** One creator's page model, or null when they have no page. */
export function creatorProfile(handle) {
  const want = String(handle || "").toLowerCase();
  const c = pagedCreators().find((x) => x.handle.toLowerCase() === want);
  if (!c) return null;

  // Group by city, most-featured city first, then alphabetically. A spot whose
  // entry carries no city (a handful of older curations) lands in "More spots"
  // rather than inventing a location for it.
  const byCity = new Map();
  const noCity = [];
  for (const s of c.spots) {
    if (!s.city) { noCity.push(s); continue; }
    if (!byCity.has(s.city)) byCity.set(s.city, []);
    byCity.get(s.city).push(s);
  }
  const cities = Array.from(byCity, ([city, spots]) => ({ city, spots }))
    .sort((a, b) => b.spots.length - a.spots.length || a.city.localeCompare(b.city));

  const platform = c.spots[0] && c.spots[0].platform ? c.spots[0].platform : "tiktok";
  const role = archetypeFor(c.handle);
  return {
    handle: c.handle,
    platform,
    platformLabel: (PLATFORM[platform] || PLATFORM.tiktok).label,
    platformColor: (PLATFORM[platform] || PLATFORM.tiktok).color,
    count: c.spots.length,
    placeCount: new Set(c.spots.map((s) => s.key)).size,
    cities,
    noCity,
    summary: summaryFor(c.handle) || "",
    roleLabel: role && role.label ? role.label : "",
    roleLine: role && role.line ? role.line : "",
    profileUrl: profileUrlFor(platform, c.handle),
  };
}

// The creator's OWN profile on their OWN platform. Constructed per platform
// from the real handle — never guessed, never a search URL dressed up as a
// profile. Mirrors sheets/SocialFind.js's profileUrlFor().
export function profileUrlFor(platform, handle) {
  const h = String(handle || "").replace(/^@+/, "");
  if (!h) return null;
  if (platform === "tiktok") return `https://www.tiktok.com/@${h}`;
  if (platform === "instagram") return `https://www.instagram.com/${h}/`;
  if (platform === "youtube") return `https://www.youtube.com/@${h}`;
  if (platform === "x") return `https://x.com/${h}`;
  return null;
}

// The city slug lib/trending.js uses, when that city has a page to cross-link.
function trendingSlugFor(city) {
  const slug = String(city || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug && TRENDING[slug] ? slug : null;
}

// ── metadata ────────────────────────────────────────────────────────────────

export function creatorMetadata(handle) {
  const p = creatorProfile(handle);
  if (!p) return { title: "Not found", robots: { index: false } };
  const url = `${SITE_URL}/creators/${encodeURIComponent(p.handle)}`;
  const where = p.cities.slice(0, 2).map((g) => g.city).join(" & ");
  // No pronoun: we do not know a creator's, and "they've featured" reads oddly
  // over a named person's page. The handle carries the subject instead, which
  // also puts the query term earliest in the title.
  const title = `Every place @${p.handle} has featured${where ? ` in ${where}` : ""} | Wayfind`;
  const description = `${p.placeCount} real places @${p.handle} has featured on ${p.platformLabel}, organised by city — each with the original video and an honest Wayfind take on hours, directions and what's nearby.`;
  return { title, description, alternates: { canonical: url }, ...socialMeta({ title, description, url }) };
}

export function creatorsIndexMetadata() {
  const url = `${SITE_URL}/creators`;
  const title = "Local creators on Wayfind — the people behind the finds";
  const description = "The independent local creators whose videos sit behind Wayfind's picks, and every place each of them has featured, organised by city.";
  return { title, description, alternates: { canonical: url }, ...socialMeta({ title, description, url }) };
}

// ── styles (inline, same dark tokens as lib/trending.js so the two indexable
//    surfaces are visibly one site rather than two) ──────────────────────────
const S = {
  wrap: { maxWidth: 780, margin: "0 auto", padding: "28px 18px 64px", color: "#F1F5F9", fontFamily: "system-ui, -apple-system, sans-serif" },
  crumb: { fontSize: 12.5, color: "#94A3B8", marginBottom: 14 },
  crumbLink: { color: "#94A3B8", textDecoration: "none" },
  hero: { display: "flex", alignItems: "center", gap: 15, marginBottom: 14 },
  ring: { flexShrink: 0, padding: 2.5, borderRadius: "50%", boxShadow: "0 6px 22px rgba(0,0,0,.45)" },
  h1: { fontSize: 27, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.5px", margin: "0 0 4px" },
  role: { fontSize: 12, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "#FF9B50" },
  lede: { fontSize: 14.5, color: "#CBD5E1", lineHeight: 1.55, margin: "0 0 18px", maxWidth: 640 },
  statRow: { display: "flex", flexWrap: "wrap", gap: 10, margin: "0 0 22px" },
  stat: { display: "inline-flex", alignItems: "baseline", gap: 6, padding: "7px 12px", border: "1px solid #26303B", borderRadius: 999, background: "#161B22", fontSize: 12.5, color: "#94A3B8" },
  statN: { fontSize: 15, fontWeight: 800, color: "#F8FAFC" },
  follow: { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 999, fontSize: 13.5, fontWeight: 800, textDecoration: "none", border: "1px solid currentColor" },
  cityH: { fontSize: 12.5, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "#94A3B8", margin: "26px 0 10px" },
  card: { background: "#161B22", border: "1px solid #26303B", borderRadius: 16, padding: 16, marginBottom: 14 },
  place: { fontSize: 17.5, fontWeight: 800, color: "#F8FAFC", margin: "0 0 3px" },
  addr: { fontSize: 12.5, color: "#8B949E", margin: "0 0 12px" },
  credit: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, textDecoration: "none", marginTop: 12 },
  open: { display: "inline-block", marginTop: 12, marginLeft: 14, fontSize: 13, fontWeight: 700, color: "#F97316", textDecoration: "none" },
  link: { display: "inline-block", marginRight: 14, fontSize: 14, fontWeight: 700, color: "#F97316", textDecoration: "none" },
  disc: { fontSize: 11.5, color: "#6E7681", marginTop: 30, lineHeight: 1.5, borderTop: "1px solid #26303B", paddingTop: 16 },
};

function jsonLd(obj) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />;
}

// One spot: the place, its address, the creator's own video, and the two ways
// out — their post (followed, theirs) and the place in Wayfind (ours).
function spotCard(s, platformColor) {
  const v = s.video;
  const pl = PLATFORM[v.platform] || {};
  const label = `${s.name} on ${pl.label || v.platform}`;
  // A curated placeId deep-links straight into the place; without one, the
  // search route is the honest fallback rather than a URL that 404s.
  const openHref = s.placeId ? `/p/${encodeURIComponent(s.placeId)}` : `/?q=${encodeURIComponent(s.name)}`;
  return (
    <div key={s.key + v.url} style={S.card}>
      <h3 style={S.place}>{s.name}</h3>
      <div style={S.addr}>{s.address || s.city}</div>
      {v.caption ? <p style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.55, margin: "0 0 14px" }}>{v.caption}</p> : null}
      {isEmbeddable(v.platform, v.url) && <VideoFacade platform={v.platform} url={v.url} label={label} />}
      <div>
        {/* FOLLOWED, deliberately — no nofollow, no noreferrer. This link is the
            creator's side of the deal, and it is also the always-visible
            fallback if the player fails or the post is taken down. */}
        <a href={v.url} target="_blank" rel="noopener" style={{ ...S.credit, color: pl.color || platformColor }} aria-label={`Watch ${label} on ${pl.label || v.platform} (opens in a new tab)`}>
          Watch on {pl.label || v.platform} ↗
        </a>
        <a href={openHref} style={S.open}>Open {s.name} in Wayfind →</a>
      </div>
    </div>
  );
}

export function CreatorPage({ handle }) {
  const p = creatorProfile(handle);
  if (!p) {
    return (
      <div style={S.wrap}>
        <h1 style={S.h1}>Creator not found</h1>
        <p style={S.lede}><a href="/creators" style={S.link}>See every creator on Wayfind →</a></p>
      </div>
    );
  }
  const url = `${SITE_URL}/creators/${encodeURIComponent(p.handle)}`;
  const allSpots = [...p.cities.flatMap((g) => g.spots), ...p.noCity];

  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Creators", item: `${SITE_URL}/creators` },
    { "@type": "ListItem", position: 3, name: `@${p.handle}`, item: url },
  ] };
  // ProfilePage + Person. `sameAs` points at the creator's real profile, which
  // is the entity link that lets a search engine connect this page to the
  // person — and it is a claim we can back, unlike any affiliation.
  const profile = { "@context": "https://schema.org", "@type": "ProfilePage", url, mainEntity: {
    "@type": "Person", alternateName: `@${p.handle}`, name: `@${p.handle}`,
    description: p.summary || `An independent local creator whose ${p.platformLabel} videos feature ${p.placeCount} places listed on Wayfind.`,
    ...(p.profileUrl ? { sameAs: [p.profileUrl] } : {}),
  } };
  const itemList = { "@context": "https://schema.org", "@type": "ItemList", name: `Places featured by @${p.handle}`, numberOfItems: allSpots.length,
    itemListElement: allSpots.map((s, i) => ({ "@type": "ListItem", position: i + 1, item: {
      "@type": "LocalBusiness", name: s.name, ...(s.address ? { address: s.address } : {}),
    } })) };

  const others = pagedCreators().filter((c) => c.handle !== p.handle).slice(0, 6);

  return (
    <div style={S.wrap}>
      {jsonLd(breadcrumb)}
      {jsonLd(profile)}
      {jsonLd(itemList)}
      <nav style={S.crumb}><a href="/" style={S.crumbLink}>Wayfind</a> › <a href="/creators" style={S.crumbLink}>Creators</a> › @{p.handle}</nav>

      <div style={S.hero}>
        <span style={{ ...S.ring, background: `linear-gradient(150deg, ${p.platformColor}, rgba(255,255,255,.28) 58%, ${p.platformColor})` }}>
          <CreatorAvatar handle={p.handle} platform={p.platform} size={72} color={p.platformColor} />
        </span>
        <div style={{ minWidth: 0 }}>
          {p.roleLabel ? <div style={S.role}>{p.roleLabel}</div> : null}
          <h1 style={S.h1}>@{p.handle}</h1>
          {p.roleLine ? <div style={{ fontSize: 13.5, color: "#94A3B8" }}>{p.roleLine}</div> : null}
        </div>
      </div>

      <p style={S.lede}>
        {p.summary ? p.summary + " " : ""}
        Every place @{p.handle} has featured that Wayfind lists is below, organised by city — with the original {p.platformLabel} video and a way straight into the place for hours, directions and what's worth pairing it with nearby.
      </p>

      <div style={S.statRow}>
        <span style={S.stat}><span style={S.statN}>{p.placeCount}</span> places featured</span>
        <span style={S.stat}><span style={S.statN}>{p.cities.length}</span> {p.cities.length === 1 ? "city" : "cities"}</span>
        <span style={S.stat}><span style={S.statN}>{p.count}</span> {p.count === 1 ? "video" : "videos"}</span>
      </div>

      {p.profileUrl ? (
        <p style={{ margin: "0 0 6px" }}>
          {/* Followed, on purpose. See the file header. */}
          <a href={p.profileUrl} target="_blank" rel="noopener" style={{ ...S.follow, color: p.platformColor }}>
            Follow @{p.handle} on {p.platformLabel} ↗
          </a>
        </p>
      ) : null}

      {p.cities.map((g) => {
        const t = trendingSlugFor(g.city);
        return (
          <section key={g.city}>
            <h2 style={S.cityH}>{g.city} — {g.spots.length} {g.spots.length === 1 ? "spot" : "spots"}</h2>
            {g.spots.map((s) => spotCard(s, p.platformColor))}
            {t ? <p style={{ margin: "0 0 6px" }}><a href={`/trending/${t}`} style={S.link}>Everything trending in {g.city} →</a></p> : null}
          </section>
        );
      })}

      {p.noCity.length ? (
        <section>
          <h2 style={S.cityH}>More spots</h2>
          {p.noCity.map((s) => spotCard(s, p.platformColor))}
        </section>
      ) : null}

      {others.length ? (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#94A3B8", marginBottom: 8 }}>Other creators on Wayfind</div>
          {others.map((c) => (<a key={c.handle} href={`/creators/${encodeURIComponent(c.handle)}`} style={S.link}>@{c.handle} →</a>))}
        </div>
      ) : null}

      <p style={S.disc}>
        {AFFILIATION_DISCLOSURE} {REMOVAL_PROMPT} <a href={`mailto:${REMOVAL_CONTACT}`} style={{ color: "#8B949E" }}>{REMOVAL_CONTACT}</a>
      </p>
    </div>
  );
}

export function CreatorsIndexPage() {
  const creators = pagedCreators();
  const itemList = { "@context": "https://schema.org", "@type": "ItemList", name: "Local creators on Wayfind", numberOfItems: creators.length,
    itemListElement: creators.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: `@${c.handle}`, url: `${SITE_URL}/creators/${encodeURIComponent(c.handle)}` })) };
  return (
    <div style={S.wrap}>
      {jsonLd(itemList)}
      <nav style={S.crumb}><a href="/" style={S.crumbLink}>Wayfind</a> › Creators</nav>
      <h1 style={S.h1}>The local creators behind the finds</h1>
      <p style={S.lede}>
        Wayfind ranks places on real reviews, not on who posted about them — but when an independent local creator has actually been somewhere and filmed it, that is worth seeing. These are the creators whose videos sit behind our picks, and every place each of them has featured.
      </p>
      {creators.map((c) => {
        const prof = creatorProfile(c.handle);
        if (!prof) return null;
        const where = prof.cities.slice(0, 3).map((g) => g.city).join(" · ");
        return (
          <a key={c.handle} href={`/creators/${encodeURIComponent(c.handle)}`} style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}>
            <span style={{ ...S.ring, background: `linear-gradient(150deg, ${prof.platformColor}, rgba(255,255,255,.28) 58%, ${prof.platformColor})` }}>
              <CreatorAvatar handle={c.handle} platform={prof.platform} size={46} color={prof.platformColor} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ ...S.place, display: "block" }}>@{c.handle}</span>
              <span style={{ ...S.addr, display: "block", margin: 0 }}>{prof.placeCount} places{where ? ` · ${where}` : ""} →</span>
            </span>
          </a>
        );
      })}
      <p style={S.disc}>{AFFILIATION_DISCLOSURE} {REMOVAL_PROMPT} <a href={`mailto:${REMOVAL_CONTACT}`} style={{ color: "#8B949E" }}>{REMOVAL_CONTACT}</a></p>
    </div>
  );
}
