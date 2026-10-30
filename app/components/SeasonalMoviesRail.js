"use client";
// Seasonal "Movies" rail (Fall / Halloween / Christmas): a sibling of the intent
// rails, rendered in the middle of them (after the 5th content rail, lib/moviesRailSlot.js). Options, not a single pick.
// Data comes from /api/movies/seasonal so the registry stays out of client chunks.
// Tapping the card body opens the Wayfind movie page (/movies/<id>); Share sends that page's canonical URL.
// Every card with a buy button goes through /api/commerce/go (ticket.href), never
// a partner URL. The button sells the live Undercover Tourist movie ticket deal (offer comes
// from the API payload, so the registry stays out of the client). If ctaLive were ever false
// production renders nothing: an affiliate card without its buy button is not allowed.
import { useEffect, useMemo, useRef, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";
import RailLoading from "./RailLoading";
import { fallSkinLive } from "../../lib/fallSkin.js";
import { spookyEyebrow, spookySkinLive, withSpookyChip } from "../../lib/spookySkin.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { useSiteToday } from "../../lib/siteDayClock.js";
import { fetchClassifiedPosterJson as fetchRailJson } from "../../lib/posterJson.js";
import { railRenderState, RAIL_RENDER_STATE } from "../../lib/railVisibility.js";
import { partnerTicketLabel } from "../../lib/partnerCopy.js";
import { SITE_URL } from "../../lib/site.js";

export const MOVIES_LOAD_TIMEOUT_MS = 10000;
const COLORS = { text: "#FFF7ED", muted: "#A99FA8" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-12-19" -> "Dec 19" (calendar text only, no Date math, so no timezone drift).
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  return `${MONTHS[Number(m[2]) - 1] || ""} ${Number(m[3])}`.trim();
}

function runtimeLabel(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n}m`;
}

function movieWhen(movie) {
  if (movie.status === "coming_soon") {
    const opens = shortDate(movie.releaseDate);
    return opens ? { label: "Opens", value: opens, tone: "later" } : null;
  }
  const until = shortDate(movie.through);
  return { label: "Now playing", value: until ? "thru " + until : "In theaters", tone: "now" };
}

// wf-movie-card (css.js) widens the photo column to 150px so most of the tall 2:3 poster shows (cover, ~8% trimmed per side).
// Placeholder tile when the movie has no owned art (no stock, no hotlinking).
const TILE_TINT = { fall: "#92400E", halloween: "#581C87", christmas: "#991B1B" };
function placeholderFor(collection, status) {
  return { icon: "\u{1F3AC}", label: status === "coming_soon" ? "Coming soon" : "Now playing", tint: TILE_TINT[collection] || TILE_TINT.fall };
}

function movieCta(movie, collection, onTrack) {
  if (!movie.ticket?.href) return null;
  const surface = collection + "_movies_rail";
  return {
    label: partnerTicketLabel("Undercover Tourist", { product: "movie-voucher", card: true }), href: movie.ticket.href, external: true, sponsored: true,
    onClick: (event) => {
      const provider = movie.ticket.provider;
      const offerId = movie.ticket.offerId;
      try { onTrack?.("tickets_out", { kind: surface, id: movie.id, name: movie.title, deal: offerId }); } catch {}
      import("../../lib/commerce.js").then(({ commerceHref, emitCommerce, mintClickId }) => {
        try {
          const clickId = mintClickId();
          const live = commerceHref({ provider, offerId, surface, contentId: movie.id, clickId });
          if (live && event && event.currentTarget) event.currentTarget.href = live;
          emitCommerce("commerce_cta_clicked", { surface, content_id: movie.id, provider, merchant: "Undercover Tourist", offer_id: String(offerId), click_id: clickId, disclosure_version: "fall-intent-v2" });
        } catch {}
      }).catch(() => {});
    },
  };
}

export default function SeasonalMoviesRail({ collection = "fall", active = true, onTrack = null }) {
  const [payload, setPayload] = useState(null);
  const [failed, setFailed] = useState(false);
  const hiddenTracked = useRef("");
  const siteDay = useSiteToday();
  const skinLive = fallSkinLive(siteDay);
  const today = siteTodayStr();

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    setPayload(null);
    setFailed(false);
    fetchRailJson("/api/movies/seasonal?collection=" + encodeURIComponent(collection), { timeoutMs: MOVIES_LOAD_TIMEOUT_MS, signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        if (!result || !Array.isArray(result.movies)) { setFailed(true); return; }
        setPayload(result);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; controller.abort(); };
  }, [collection, active]);

  const movies = useMemo(() => (Array.isArray(payload?.movies) ? payload.movies : []), [payload]);
  const ctaLive = payload?.ctaLive === true;
  // Production: no live ticket offer means no rail. Dev: render without the button so the layout can be checked.
  const devPreview = process.env.NODE_ENV !== "production";
  const hideForPending = !!payload && !ctaLive && !devPreview;

  useEffect(() => {
    if (!hideForPending || hiddenTracked.current === collection) return;
    hiddenTracked.current = collection;
    try { onTrack?.("movies_rail_hidden", { collection, reason: "ticket_cta_pending" }); } catch {}
    // The parent's inline telemetry callback is not request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideForPending, collection]);

  if (!active) return null;
  const title = payload?.railTitle || "Movies in Theaters";
  const deck = payload?.deck || "";
  const renderState = failed ? RAIL_RENDER_STATE.HIDDEN : railRenderState(hideForPending ? [] : movies, { loading: !payload });
  if (renderState === RAIL_RENDER_STATE.HIDDEN || renderState === RAIL_RENDER_STATE.ERROR) return null;
  if (renderState === RAIL_RENDER_STATE.LOADING) return <section aria-label="Movies in theaters" style={{ marginTop: 22 }}>
    <RailLoading label="Loading movies in theaters" />
  </section>;

  const railId = collection + "-intent-movies";
  const halloween = collection === "halloween";
  const spooky = halloween && spookySkinLive(today);
  const skin = halloween || collection === "fall" ? (skinLive ? " wf-fall" : "") : collection === "christmas" ? " wf-christmas" : "";

  return <section aria-label={title} style={{ marginTop: 22 }}>
    <RailHeading title={title} description={deck}>
      <RailNav railId={railId} count={movies.length} total={movies.length} loaded={movies.length} unit={movies.length === 1 ? "option" : "options"} />
    </RailHeading>
    <>
      <div className={"wf-rail wf-rail-exploding" + skin} data-rail={railId} tabIndex={0} role="region" aria-label={title} style={{ color: COLORS.text }}>
        {movies.map((movie, index) => {
          const baseChips = (Array.isArray(movie.vibes) ? movie.vibes : []).slice(0, 3).map((label) => ({ key: "vibe-" + label, icon: "\u{1F3AC}", label }));
          const art = movie.art && movie.art.src ? movie.art : null;
          return <RailCard key={movie.id} className="wf-exploding-primary wf-movie-card"
            photo={art ? art.src : null}
            placeholder={art ? null : placeholderFor(collection, movie.status)}
            eagerMedia={index < 3}
            place={null}
            href={"/movies/" + movie.id}
            actionItem={{ id: "movie:" + movie.id, type: "event", title: movie.title, image: art ? art.src : null, url: SITE_URL + "/movies/" + movie.id }}
            title={movie.title} eyebrow={spooky ? spookyEyebrow(title) : title} rank={index + 1} spooky={spooky}
            score={null} when={movieWhen(movie)}
            facts={[movie.rating || null, runtimeLabel(movie.runtimeMin), art && art.credit ? art.credit : null].filter(Boolean)}
            chips={spooky ? withSpookyChip(baseChips) : baseChips}
            take={movie.why || null} cta={movieCta(movie, collection, onTrack)}
            ariaLabel={movie.title} />;
        })}
      </div>
      {movies.length > 1 ? <RailDots railId={railId} count={movies.length} /> : null}
    </>
  </section>;
}
