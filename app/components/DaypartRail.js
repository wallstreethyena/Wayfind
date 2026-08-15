"use client";

// app/components/DaypartRail.js — the rail menu.
//
// WHAT IT REPLACES: the hero swipe rail (app/home.js HeroRail, eight cards
// reachable only by swiping) plus the category tile row. Both navigated with
// window.location.assign() inside onClick, which means a crawler reading the
// homepage found NO links to /best-beaches, /hidden-gems, /date-night, /family
// or /trending-now at all. Every tile here is a real <a href>, so the homepage
// finally links to the pages it has always been about.
//
// THE TWO RULES THIS COMPONENT ENFORCES
//
// 1. The hour decides what LEADS, never what EXISTS. All 15 rails render in
//    every daypart; an off-peak one is parked on the right, one swipe away.
//    Hiding a card the visitor came for is worse than showing it late.
//    (lib/dayparts.js orderFor)
//
// 2. Every rail owns exactly ONE axis. If a rail's axis-true pool is too thin
//    to fill, it renders an honest line and its route link — never someone
//    else's places wearing its name. (lib/railsData.js MIN_CARDS)
//
// HYDRATION: the server cannot know the visitor's clock, so it renders the
// daypart the CITY is in at regeneration and the browser corrects it in an
// effect after mount. First client render matches the server byte for byte;
// the reorder is an ordinary state update, not a mismatch.
//
// THE CLOCK: siteHourFloat(now, tzForPoint(lat,lng)) from lib/nowContext.js —
// never new Date().getHours(). Venue-local, not device-local: a reader in
// Seattle at 6pm PT looking at Orlando is looking at a 9pm ET city, and the
// rail must lead with tonight, not the afternoon. scripts/check-one-clock.mjs
// enforces this; scripts/test-dayparts.mjs proves the four bands never
// contradict nowContext's three.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IconicPlaceCard from "./IconicPlaceCard";
import { DAYPARTS, partForHour, orderFor, railHref, LEGACY_HERO_EVENT } from "../../lib/dayparts.js";
import { siteHourFloat, tzForPoint } from "../../lib/nowContext.js";
import { railArt, railArtSrcSet, railArtFallback, railTint, RAIL_ART_SIZES } from "../../lib/rails.js";

const Chevron = ({ dir }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === "l" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);

function logEvent(name, props) {
  try { if (typeof window !== "undefined" && window.posthog && window.posthog.capture) window.posthog.capture(name, props || {}); } catch (e) {}
}

// Rendered from the SAME float hour the band is chosen from, so the chip can
// never show a time that disagrees with the ordering beside it.
const clockLabel = (hourFloat) => {
  const h = Math.floor(hourFloat) % 24;
  const m = Math.round((hourFloat - Math.floor(hourFloat)) * 60) % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

/** Left/right arrow enablement for a scroller, recomputed on scroll + resize. */
function useScrollEnds(ref, deps) {
  const [ends, setEnds] = useState({ atStart: true, atEnd: true });
  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth - 2;
    setEnds({ atStart: el.scrollLeft <= 2, atEnd: el.scrollLeft >= max });
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    sync();
    const raf = requestAnimationFrame(sync);
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("scroll", sync); window.removeEventListener("resize", sync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync, ...(deps || [])]);
  return [ends, sync];
}

export default function DaypartRail({
  rails = [],
  places = {},
  guides = [],
  thin = [],
  region = "fl",
  citySlug = "sarasota",
  cityLabel = "",
  lat = null,
  lng = null,
  initialDaypart = "afternoon",
}) {
  const [daypart, setDaypart] = useState(initialDaypart);
  const [clock, setClock] = useState("");
  const [selected, setSelected] = useState(null);
  const trackRef = useRef(null);
  const pcRef = useRef(null);
  const menuRef = useRef(null);
  const thinSet = useMemo(() => new Set(thin), [thin]);
  const railById = useMemo(() => new Map(rails.map((r) => [r.id, r])), [rails]);
  const order = useMemo(() => orderFor(daypart, rails.map((r) => r.id)), [daypart, rails]);
  const band = DAYPARTS[daypart] || DAYPARTS.afternoon;

  // The live hour, after mount, from the ONE clock — read in the timezone of
  // the coordinates being ranked. Re-checkedevery minute so a rail left open across
  // a band edge reorders instead of going stale.
  useEffect(() => {
    const tz = tzForPoint(lat, lng);
    const tick = () => {
      const h = siteHourFloat(new Date(), tz);
      setDaypart(partForHour(h));
      setClock(clockLabel(h));
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [lat, lng]);

  // THE OVERLAY IS A PRE-PAINT FALLBACK, and `onLoad` alone cannot retire it.
  // These tiles are server-rendered, so on a warm cache the browser has already
  // decoded the art before React hydrates — the load event fired before any
  // handler existed to hear it, and the fallback text stayed stamped over the
  // artwork forever. Measured: 0 of 15 tiles marked, desktop and phone.
  // An <img> reports its own state, so ask it directly on mount and keep the
  // handler for the ones still in flight.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const mark = (img) => { const t = img.closest(".wf8-tile"); if (t) t.classList.add("has-art"); };
    const imgs = [...el.querySelectorAll("img.wf8-tim")];
    const onLoad = (e) => mark(e.currentTarget);
    for (const img of imgs) {
      if (img.complete && img.naturalWidth) mark(img);
      else img.addEventListener("load", onLoad, { once: true });
    }
    // A tile scrolled into view later is lazy-loaded and mounts its own handler
    // through the JSX onLoad; this pass only closes the already-decoded gap.
    return () => { for (const img of imgs) img.removeEventListener("load", onLoad); };
  }, [order]);

  const [trackEnds, syncTrack] = useScrollEnds(trackRef, [order.length]);
  const [pcEnds, syncPc] = useScrollEnds(pcRef, [selected]);

  const open = useCallback((id, src) => {
    const rail = railById.get(id);
    if (!rail) return;
    setSelected(id);
    logEvent("rail_open", {
      rail_id: id, rail_title: rail.title, daypart, region, city: citySlug,
      position: order.indexOf(id) + 1, src: src || "rail",
      has_places: (places[id] || []).length,
    });
    // The hero cards these replace fire eight named events that live dashboards
    // depend on. Keep emitting them for one release so nothing flatlines at
    // cutover; delete LEGACY_HERO_EVENT once the new series has history.
    const legacy = LEGACY_HERO_EVENT[id];
    if (legacy) logEvent(legacy, { src: "rail", rail_id: id });
  }, [railById, daypart, region, citySlug, order, places]);

  const close = useCallback(() => setSelected(null), []);

  // Park the band under the sticky header so the drop lands in the eye.
  useEffect(() => {
    if (!selected || !menuRef.current) return;
    const reduced = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const y = window.scrollY + menuRef.current.getBoundingClientRect().top - 78;
    window.scrollTo({ top: Math.max(0, y), behavior: reduced ? "auto" : "smooth" });
    if (pcRef.current) pcRef.current.scrollLeft = 0;
    syncPc();
  }, [selected, syncPc]);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  const tileClick = (e, id) => {
    // Let the browser do its thing for a new tab / new window / middle click —
    // the tile is a real link and must keep behaving like one.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (selected === id) close(); else open(id, "rail");
  };

  const scrollBy = (ref, dir) => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * (el.clientWidth - 70), behavior: reduced ? "auto" : "smooth" });
  };

  const selRail = selected ? railById.get(selected) : null;
  const selPlaces = selected ? (places[selected] || []) : [];
  const near = cityLabel ? ` near ${cityLabel}` : "";

  return (
    <div className={`wf8 is-${daypart}${selected ? " is-open" : ""}`} data-daypart={daypart}>
      <section className="wf8-railsec" aria-label="What to do right now">
        <div className="wf8-in">
          <div className="wf8-dpbar">
            <span className="wf8-dpnow"><i />{band.label}{clock ? <> · <b>{clock}</b></> : null}</span>
            <span className="wf8-dpwhy">{band.why}</span>
          </div>
          <div className="wf8-rhead">
            <h2>{band.label} first · all {rails.length} ways in</h2>
          </div>
          <p className="wf8-railhint">Pick one and the places drop below — nothing is hidden, later cards are parked to the right.</p>
          <div className="wf8-railwrap">
            <div className="wf8-track" ref={trackRef}>
              {order.map((id, i) => {
                const r = railById.get(id);
                if (!r) return null;
                const base = railArt(r, region);
                const href = railHref(r, region, citySlug) || "#";
                const eager = i < 2;
                return (
                  <a
                    key={id}
                    className={`wf8-tile${selected === id ? " is-sel" : ""}`}
                    href={href}
                    data-id={id}
                    aria-label={`${r.title} — ${r.short}`}
                    style={{ background: railTint(id) }}
                    onClick={(e) => tileClick(e, id)}
                  >
                    <picture>
                      <source type="image/avif" srcSet={railArtSrcSet(base, "avif")} sizes={RAIL_ART_SIZES} />
                      <source type="image/webp" srcSet={railArtSrcSet(base, "webp")} sizes={RAIL_ART_SIZES} />
                      <img
                        className="wf8-tim"
                        src={railArtFallback(base)}
                        alt={r.title}
                        width="760"
                        height="1350"
                        decoding="async"
                        loading={eager ? "eager" : "lazy"}
                        fetchPriority={eager ? "high" : "low"}
                        onLoad={(e) => { const t = e.currentTarget.closest(".wf8-tile"); if (t) t.classList.add("has-art"); }}
                      />
                    </picture>
                    {/* Shown only until the art paints — a card is never a blank
                        box on a cold cache, and it still reads without images. */}
                    <div className="wf8-ov">
                      <div className="wf8-eye">{r.title}</div>
                      <h3 className="wf8-th">{r.short}</h3>
                      <p className="wf8-tsub">{r.sub}</p>
                      <div className="wf8-tcta">{r.cta} →</div>
                    </div>
                  </a>
                );
              })}
            </div>
            <button type="button" className="wf8-nav l" aria-label="Scroll left" disabled={trackEnds.atStart}
              onClick={() => { scrollBy(trackRef, -1); syncTrack(); }}><Chevron dir="l" /></button>
            <button type="button" className="wf8-nav r" aria-label="Scroll right" disabled={trackEnds.atEnd}
              onClick={() => { scrollBy(trackRef, 1); syncTrack(); }}><Chevron dir="r" /></button>
          </div>
        </div>
      </section>

      <section className="wf8-menusec" ref={menuRef} aria-label={selRail ? `${selRail.title} — picks` : "Picks"} aria-hidden={!selected}>
        <div className="wf8-in">
          <div className="wf8-mbar">
            <p className="wf8-mhd">Showing <b>{selRail ? selRail.title : ""}</b>{selRail && !selRail.guides ? near : ""}</p>
            <button type="button" className="wf8-mclose" onClick={close}>✕ Close</button>
          </div>

          {/* the same rails, same order, same reason — a rail, never a stack */}
          <div className="wf8-catwrap">
            <div className="wf8-catrail" aria-label="Ways in">
              {order.map((id) => {
                const r = railById.get(id);
                if (!r) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected === id}
                    className={`wf8-cat${selected === id ? " is-on" : ""}`}
                    onClick={() => open(id, "chip")}
                  >
                    <img className="wf8-cico" src={railArtFallback(railArt(r, region))} alt="" width="36" height="36" loading="lazy" decoding="async" />
                    <span className="wf8-ctx"><b>{r.title}</b></span>
                  </button>
                );
              })}
            </div>
          </div>

          {selRail && selRail.guides ? (
            <ul className="wf8-grail" aria-label="Local guides">
              {guides.map((g, i) => (
                <li key={g.slug}>
                  <a className="wf8-gcard" style={{ "--wf8-i": i }} href={`/guides/${g.slug}`}
                    onClick={() => logEvent("guide_open", { slug: g.slug, region: g.region, src: "rail_library" })}>
                    <div className="wf8-gtop">{g.region}<em>· {g.mins} min read</em></div>
                    <h4 className="wf8-gtit">{g.title}</h4>
                    <p className="wf8-gtea">{g.teaser}</p>
                    <div className="wf8-gread">Read the guide →</div>
                  </a>
                </li>
              ))}
              <li>
                <a className="wf8-gcard" style={{ "--wf8-i": guides.length }} href="/guides">
                  <div className="wf8-gtop">All guides</div>
                  <h4 className="wf8-gtit">Every Wayfind guide, in one place</h4>
                  <p className="wf8-gtea">{guides.length} guides, each written after someone actually went.</p>
                  <div className="wf8-gread">Open the library →</div>
                </a>
              </li>
            </ul>
          ) : selRail && selPlaces.length ? (
            <div className="wf8-pcwrap">
              <ul className="wf8-pcrail" ref={pcRef}>
                {selPlaces.map((p, i) => (
                  <IconicPlaceCard
                    key={p.id}
                    place={p}
                    rank={i + 1}
                    href={`/p/${encodeURIComponent(p.id)}`}
                  />
                ))}
              </ul>
              <button type="button" className="wf8-pnav l" aria-label="Previous places" disabled={pcEnds.atStart}
                onClick={() => { scrollBy(pcRef, -1); syncPc(); }}><Chevron dir="l" /></button>
              <button type="button" className="wf8-pnav r" aria-label="More places" disabled={pcEnds.atEnd}
                onClick={() => { scrollBy(pcRef, 1); syncPc(); }}><Chevron dir="r" /></button>
            </div>
          ) : selRail ? (
            <div className="wf8-thin">
              <p>
                {thinSet.has(selRail.id)
                  ? `Nothing${near} clears this bar right now — ${selRail.axis}. Padding it with places that don't belong would make the rail worthless.`
                  : `We're still gathering places for this${near}.`}
              </p>
              <a href={railHref(selRail, region, citySlug) || "/"}>{selRail.cta} →</a>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
