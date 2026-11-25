// app/latest/page.js — gowayfind.com/latest, the @gowayfind.app Instagram bio
// link. It shows the place or event from Wayfind's newest Reel with its ticket
// button, so someone who just watched the Reel lands on that exact thing.
//
// Which Reel: lib/latestReel.pickLatestReel (hand-set LATEST_REEL vs the
// synced wf_owned_social catalog, newest wins). A failed catalog read falls
// back to the hand-set entry; it never renders an empty page.
//
// NO PARTNER URL IN THIS FILE. Ticket buttons come from
// eventDetailTicketAction() (the same rule the event page uses: registry deal
// through /api/commerce/go, Ticketmaster through /api/ticketmaster/go, else
// the organizer's verified link, nothing when sold out or past).
import Link from "next/link";
import CommerceClickBeacon from "../components/CommerceClickBeacon";
import { SITE_URL } from "../../lib/site";
import { siteTodayStr } from "../../lib/siteTime";
import { readOwnedRows } from "../../lib/ownedSocialStore";
import { fetchCuratedEventBySlug, dateRangeLabel, eventDetailTicketAction } from "../../lib/curatedEvents";
import { eventVenueImageSrc } from "../../lib/eventPageImage";
import { eventTitleWithYear } from "../../lib/eventTitle";
import { pickLatestReel, eventSlugOf, LATEST_SURFACE, LATEST_REEL } from "../../lib/latestReel";

export const revalidate = 300;

const INK = "#0A0B0D", CARD = "#14171C", HAIR = "#232830", WHITE = "#FFFFFF", MUTE = "#9AA3AD", ORANGE = "#FF6B1A";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "From our latest Reel | Wayfind",
  description: "The place from Wayfind's newest Instagram Reel, with dates, details and tickets.",
  alternates: { canonical: "/latest" },
  // The bio link changes with every Reel: the value is the tap, not the index.
  robots: { index: false, follow: true },
};

async function loadReel(today) {
  let rows = [];
  try { rows = await readOwnedRows({ shelfOnly: true }); } catch { rows = []; }
  return pickLatestReel(rows, today) || pickLatestReel([], today, { override: LATEST_REEL });
}

async function loadCard(link, today) {
  const slug = eventSlugOf(link.href);
  if (!slug) return { kind: "place", href: link.href, title: link.label };
  let e = null;
  try { e = await fetchCuratedEventBySlug(slug); } catch { e = null; }
  if (!e) return { kind: "place", href: link.href, title: link.label };
  let img = "";
  try { img = eventVenueImageSrc(e) || ""; } catch { img = ""; }
  return {
    kind: "event",
    href: link.href,
    title: eventTitleWithYear(e.event_name, e.year) || e.event_name || link.label,
    when: dateRangeLabel(e),
    where: [e.venue, e.city].filter(Boolean).join(", "),
    hook: e.card_hook || e.why_go || "",
    img: /^https:\/\//.test(img) || img.startsWith("/") ? img : "",
    ticket: eventDetailTicketAction(e, { surface: LATEST_SURFACE, today }),
    eventId: e.event_id,
  };
}

const S = {
  page: { minHeight: "100vh", background: INK, color: WHITE, fontFamily: "var(--wf-sans, system-ui, -apple-system, sans-serif)" },
  wrap: { maxWidth: 520, margin: "0 auto", padding: "20px 16px 48px" },
  brand: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  logo: { height: 26, width: "auto" },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: ORANGE, margin: "0 0 6px" },
  h1: { fontSize: 26, lineHeight: 1.15, fontWeight: 800, margin: "0 0 8px", overflowWrap: "anywhere" },
  sub: { fontSize: 15, color: MUTE, margin: "0 0 18px", lineHeight: 1.45 },
  reelLink: { color: WHITE, fontSize: 14, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 },
  card: { background: CARD, border: `1px solid ${HAIR}`, borderRadius: 18, overflow: "hidden", marginTop: 18 },
  img: { display: "block", width: "100%", aspectRatio: "16 / 10", objectFit: "cover", background: "#1B1F25" },
  body: { padding: "16px 16px 18px" },
  title: { fontSize: 20, fontWeight: 800, lineHeight: 1.2, margin: "0 0 6px", overflowWrap: "anywhere" },
  meta: { fontSize: 14, color: MUTE, margin: "0 0 4px", lineHeight: 1.4 },
  hook: { fontSize: 15, lineHeight: 1.5, margin: "10px 0 0" },
  btn: { display: "block", textAlign: "center", background: ORANGE, color: "#111", fontWeight: 800, fontSize: 16, padding: "14px 16px", borderRadius: 12, textDecoration: "none", marginTop: 16, minHeight: 48, boxSizing: "border-box" },
  ghost: { display: "block", textAlign: "center", background: "transparent", color: WHITE, fontWeight: 700, fontSize: 15, padding: "13px 16px", borderRadius: 12, textDecoration: "none", marginTop: 10, border: `1px solid ${HAIR}`, minHeight: 48, boxSizing: "border-box" },
  note: { fontSize: 12, color: MUTE, margin: "10px 0 0", lineHeight: 1.4 },
  more: { marginTop: 28, display: "grid", gap: 10 },
  moreH: { fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: MUTE, margin: "0 0 2px" },
};

export default async function LatestReelPage() {
  const today = siteTodayStr();
  const reel = await loadReel(today);
  const cards = reel ? await Promise.all(reel.links.map((l) => loadCard(l, today))) : [];
  return (
    <main style={S.page} data-latest-reel={reel ? reel.shortcode : ""}>
      <CommerceClickBeacon surface={LATEST_SURFACE} />
      <div style={S.wrap}>
        <div style={S.brand}>
          <Link href="/" aria-label="Wayfind home">
            <img src="/brand/wayfind/logo/wayfind-logo-white-orange-transparent-a.png" alt="Wayfind" style={S.logo} />
          </Link>
        </div>
        <p style={S.kicker}>From our latest Reel</p>
        <h1 style={S.h1}>{reel ? reel.title : "Florida plans, picked for you"}</h1>
        <p style={S.sub}>
          {reel && reel.city ? reel.city + ", Florida. " : ""}Everything from the video, in one tap.{" "}
          {reel ? <a href={reel.permalink} target="_blank" rel="noopener" style={S.reelLink}>Watch the Reel</a> : null}
        </p>

        {cards.map((c) => (
          <section key={c.href} style={S.card} data-latest-card={c.kind}>
            {c.img ? <img src={c.img} alt={c.title} style={S.img} loading="eager" /> : null}
            <div style={S.body}>
              <h2 style={S.title}>{c.title}</h2>
              {c.when ? <p style={S.meta}>{c.when}</p> : null}
              {c.where ? <p style={S.meta}>{c.where}</p> : null}
              {c.hook ? <p style={S.hook}>{c.hook}</p> : null}
              {c.ticket ? (
                <a
                  href={c.ticket.href}
                  target="_blank"
                  rel={c.ticket.kind === "affiliate" ? "sponsored nofollow noopener" : (c.ticket.rel || "noopener nofollow")}
                  style={S.btn}
                  data-wf-latest-ticket={c.ticket.kind}
                  {...(c.ticket.kind === "organizer" ? { "data-wf-outbound-ticket": "organizer", "data-wf-content-id": c.eventId } : {})}
                >
                  {"🎟️ " + c.ticket.label}
                </a>
              ) : null}
              <Link href={c.href} style={c.ticket ? S.ghost : S.btn}>
                {c.kind === "event" ? "See dates, hours and tips" : "Open on Wayfind"}
              </Link>
              {c.ticket && c.ticket.kind === "affiliate" ? <p style={S.note}>We may earn a commission when you book through partner links. It never changes our rankings.</p> : null}
            </div>
          </section>
        ))}

        <nav style={S.more} aria-label="More from Wayfind">
          <p style={S.moreH}>Keep planning</p>
          <Link href="/christmas-in-florida" style={S.ghost}>Christmas in Florida 2026</Link>
          <Link href="/florida-events" style={S.ghost}>Florida events this week</Link>
          <Link href="/" style={S.ghost}>Find places near you</Link>
        </nav>
      </div>
    </main>
  );
}
