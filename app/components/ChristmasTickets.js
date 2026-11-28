"use client";

import { useEffect } from "react";
import { SOCIAL_AD_ATTR, SOCIAL_AD_FEATURE_ATTR, isSocialAdLanding, socialAdFeature } from "../../lib/socialAdLanding.js";
import { christmasPickMeasurement } from "../../lib/christmasPickMeasurement.js";
import { XM_CARD_CSS, organizerTap } from "./ChristmasTicketCard.js";
import CommerceClickBeacon from "./CommerceClickBeacon.js";
import { useCommerceImpression } from "./useCommerceImpression.js";
import { activeSeasonalMark } from "../../lib/seasonalBrand.js";
import { CHRISTMAS_BG_GRADIENT, CHRISTMAS_DOODLE_CSS, CHRISTMAS_LIGHTS_CSS } from "../../lib/christmasBackdrop.js";
import ChristmasElves from "./ChristmasElves.js";
import { FestivalLights } from "./ChristmasDecor.js";
import { ChristmasSnow } from "./ChristmasSnow.js";
import GuidePhoto from "./GuidePhoto.js";
import { styleHtml } from "../../lib/styleHtml.js";

// Wayfind home header replica plus Christmas ticket cards, built like the
// Halloween page (BoHalloweenHaunt). Deep night, warm white text, one festive
// pair (red and evergreen) and soft gold only on the light bulbs. Every
// visible string comes from the server model (lib/christmasTickets.js) and is
// dash free. The statewide browse and the watchlist arrive as `browse`.
const SURFACE = "christmas_tickets";

function askSanta() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wf:boo-open"));
}

const CSS = XM_CARD_CSS + `
.xm-page{
  --bg:#2C0610;--surface:#5A0712;--line:rgba(232,180,138,.55);
  --red:#E8343F;--redfill:#D92C37;--green:#3FBF7F;--gold:#F5C451;--cream:#FFF6F0;--muted:#F0D3C4;--soft:#E2BBA8;
  color:var(--cream);
  font-family:var(--wf-sans),sans-serif;font-weight:400;position:relative;isolation:isolate;
  background:${CHRISTMAS_BG_GRADIENT};
  min-height:100dvh;overflow-x:clip;box-sizing:border-box;padding-bottom:56px;
}
.xm-page *,.xm-page *::before,.xm-page *::after{box-sizing:border-box}
.xm-page button,.xm-page a,.xm-page input,.xm-page select{font-family:inherit}

${CHRISTMAS_DOODLE_CSS}
.xm-snow{position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none}
.xm-main{position:relative;z-index:2}

${CHRISTMAS_LIGHTS_CSS}

/* Wayfind header replica (home classes and values) */
.wf-topbar{background:transparent;border:0;padding:4px 16px 6px;position:relative;z-index:20}
.xm-topin{max-width:800px;margin:0 auto}
.wf-topbar-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0}
.wf-wordmark{display:flex;align-items:center;gap:5px;flex-shrink:0;filter:drop-shadow(0 4px 12px rgba(0,0,0,.3));text-decoration:none}
.wf-wordmark-text{display:block;flex:none;width:154.05px;height:39.06px;background-image:url("/brand/wayfind-wordmark-original-v3.png");background-image:image-set(url("/brand/opt/wordmark-original-v3-400.avif") type("image/avif"),url("/brand/opt/wordmark-original-v3-400.webp") type("image/webp"));background-repeat:no-repeat;background-size:contain;background-position:center}
.xm-goto{
  flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;border-radius:999px;
  background:#F97316;color:#0D1117;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 7px 14px rgba(249,115,22,.22);
}
.xm-goto:focus-visible{outline:2px solid #F97316;outline-offset:2px;border-radius:6px}

/* Page body */
.xm-main{max-width:720px;margin:0 auto;padding:26px 16px 0}
.xm-hero h1{margin:0 0 6px;font-size:26px;line-height:1.2;font-weight:700;color:var(--cream);letter-spacing:-.01em;text-wrap:balance;text-shadow:0 2px 10px rgba(30,0,6,.6)}
.xm-lede{margin:4px 0 0;font-size:15px;line-height:1.5;color:var(--muted)}
.xm-honest{margin:8px 0 0;font-size:13px;line-height:1.5;color:var(--soft)}
.xm-hero-actions{display:flex;align-items:center;gap:10px;margin-top:16px}.xm-ask{flex:1;min-width:0;min-height:48px;border-radius:12px;border:1px solid var(--line);cursor:pointer;background:linear-gradient(180deg,#E0303F,#B01728);color:#fff;font-size:15px;font-weight:700;box-shadow:0 0 14px rgba(232,180,138,.2)}
.xm-share{display:flex;flex:0 0 auto;justify-content:flex-start}
.xm-share button,.xm-share a{min-height:44px}
.xm-ask:focus-visible,.xm-filters button:focus-visible,.xm-more:focus-visible{outline:2px solid #FFD9AE;outline-offset:2px}

/* Top picks sit under the title for every visitor (paid Google included).
   Only the ad's own subject card stays hidden until that landing. Wide cards
   so the next one peeks and invites a swipe. */
.xm-pick[data-feature-pick]{display:none}
.xm-picks-label .xm-picks-from{display:none}
.xm-pick-from{position:absolute;left:8px;top:8px;z-index:1;margin:0;padding:3px 8px;border-radius:999px;background:#F5C451;color:#4A0610;font-size:11px;font-weight:800;line-height:1.3}
.xm-picks{margin:12px 0 4px}
.xm-picks-label{margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.02em;color:#FFE9C8}
.xm-picks-row{display:flex;gap:10px;margin:0 -16px;padding:0 16px 4px;list-style:none;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.xm-picks-row::-webkit-scrollbar{display:none}
.xm-pick{flex:0 0 min(78vw,300px);min-width:0;scroll-snap-align:start;display:flex;flex-direction:column;overflow:hidden;border-radius:12px;border:1px solid rgba(232,180,138,.9);background:#5A0712;box-shadow:0 8px 20px rgba(40,2,8,.5)}
.xm-pick-photo{position:relative;height:132px;background:#3A0510;overflow:hidden}
.xm-pick-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.xm-pick-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:10px;text-align:center;background:linear-gradient(180deg,#5A0712,#2A0309);color:#F7DCCB;font-size:12px;font-weight:600}
.xm-pick-credit{position:absolute;left:6px;right:8px;bottom:5px;margin:0;color:rgba(255,255,255,.7);font-size:9.5px;line-height:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.7)}
.xm-pick-body{flex:1 1 auto;display:flex;flex-direction:column;gap:4px;padding:10px 12px 12px}
.xm-pick h3{margin:0;font-size:15px;line-height:1.3;font-weight:700;color:#FFF6F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xm-pick-meta{margin:0;font-size:12.5px;line-height:1.35;color:#F7DCCB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xm-pick-urgent{align-self:flex-start;display:inline-block;margin:0;padding:2px 8px;border-radius:999px;background:#FFD24A;color:#3A0508;font-size:11px;font-weight:800;line-height:1.35}
.xm-pick-cta-row{margin-top:auto;padding-top:6px;display:flex;align-items:center;gap:10px}
.xm-pick-price{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-start;margin:0;line-height:1.1}
.xm-pick-from-lbl{font-size:10.5px;color:#E9C3B0}
.xm-pick-amt{font-size:18px;font-weight:800;color:#FFF6F0;text-shadow:0 1px 2px rgba(40,0,6,.7)}
.xm-pick-buy{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:44px;padding:6px 10px;border-radius:12px;background:linear-gradient(180deg,#FFE9B8,#F5C451);color:#4A0610;border:2px solid #E8B48A;font-size:14.5px;font-weight:800;line-height:1.2;text-decoration:none;text-align:center}
.xm-pick-buy:focus-visible{outline:2px solid #FFD9AE;outline-offset:2px}
.xm-pick-via{margin:2px 0 0;font-size:11px;line-height:1.3;color:#E9C3B0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#xm-tickets{margin-top:16px;scroll-margin-top:12px}
.xm-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:18px;padding-bottom:16px;border-bottom:1px solid rgba(232,180,138,.22)}
/* Owner 2026-11-26 (mobile clutter): on a phone the first listing card reaches
   the fold. Tighter title, a two line intro (the full text stays in the page),
   and tighter spacing around the picks, actions, time strip and count. */
@media(max-width:600px){.xm-controls{gap:8px;margin-top:2px;padding-bottom:10px}.xm-hero h1{font-size:22px}.xm-lede{font-size:14px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.xm-hero-actions{margin-top:12px}.xm-picks{margin:8px 0 2px}.xm-pick-photo{height:112px}.xm-count{margin-top:8px;font-size:13px}.xm-temporal-bar{padding-bottom:8px}}
.xm-sort-note{font-size:13px;color:#E1C6B6;line-height:1.4}.xm-clear{min-height:44px;margin-left:auto;padding:8px 4px;border:0;background:transparent;color:#E8B48A;cursor:pointer;font:inherit;font-size:13px}.xm-clear:focus-visible{outline:2px solid #FFE9C8;outline-offset:3px}.xm-see-all{display:flex;align-items:center;width:100%;min-height:44px;margin:10px 0 0;padding:10px 14px;border:1px solid #E8B48A;border-radius:12px;background:#2a1a14;color:#FFE9C8;cursor:pointer;font:inherit;font-size:15px;font-weight:700;text-align:left}.xm-see-all:focus-visible{outline:2px solid #FFE9C8;outline-offset:3px}
.xm-count{margin:14px 0 0;font-size:14px;color:var(--muted)}
.xm-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:12px}
@media(min-width:720px){.xm-main{max-width:960px}.xm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.xm-more{margin-top:16px;min-height:48px;padding:0 22px;border-radius:12px;cursor:pointer;background:linear-gradient(180deg,#FFE9B8,#F5C451);color:#4A0610;border:2px solid #E8B48A;font-size:15px;font-weight:800}
.xm-more:disabled{opacity:.7;cursor:default}
.xm-foot{margin-top:18px}
.xm-foot .wf-guide-commission{font-size:12px !important;color:var(--soft) !important;margin:0 !important}
.xm-empty{margin:16px 0 0;color:var(--muted);font-size:14px}
`;


// The wordmark follows the one seasonal resolver like every other header
// (owner direction: the original logo sitewide, so this is null today).
function seasonalMarkCss(mark) {
  if (!mark) return "";
  const width = (49.1 * mark.width / mark.height).toFixed(1);
  return `.wf-wordmark.is-seasonal{gap:0}.wf-wordmark.is-seasonal .wf-wordmark-text{width:${width}px;height:49.1px;background-image:url("${mark.png}");background-image:image-set(url("${mark.avif}") type("image/avif"),url("${mark.webp}") type("image/webp"));background-position:center;background-size:contain}`;
}

// Just the logo and one way back (owner 2026-11-01: "remove the top portion
// of the site and bring them back to gowayfind only by keeping the button").
// No category tabs, search or shortcut row: they led off this page into
// surfaces that are not part of it. It sits on the page's own red, so the top
// no longer reads as a separate dark block.
function WayfindHeader({ seasonal }) {
  return (
    <div className="wf-topbar xm-topbar">
      <div className="xm-topin">
        <div className="wf-topbar-row">
          <a className={"wf-wordmark" + (seasonal ? " is-seasonal" : "")} href="/" aria-label="Wayfind home">
            <span className="wf-wordmark-text" aria-hidden="true" />
          </a>
          <a className="xm-goto" href="/">Go to Wayfind<span aria-hidden="true">→</span></a>
        </div>
      </div>
    </div>
  );
}

// Top picks (2026-11-12, updated 2026-11-23). Paid visitors land here and most
// never scroll, so the ticket rows with a real photo and a partner way in sit
// under the title for every visitor, not only a Meta ad. Merit order never
// reads the partner or the commission. /go links are recorded by
// CommerceClickBeacon (commerce_cta_clicked, partner_click, and
// deal_card_outbound). Organizer links are recorded once, by organizerTap.
//
// The page is one cached copy for everyone. The ad's own subject card stays
// hidden until the inline script marks that landing. Regular picks are in the
// first screen either way. This effect only keeps the mark right after a
// client side navigation.
export function SocialTopPicks({ picks }) {
  useEffect(() => {
    const root = document.documentElement;
    try {
      const params = Object.fromEntries(new URLSearchParams(window.location.search));
      const feature = socialAdFeature(params);
      if (isSocialAdLanding(params) || feature) root.setAttribute(SOCIAL_AD_ATTR, "");
      else root.removeAttribute(SOCIAL_AD_ATTR);
      if (feature) root.setAttribute(SOCIAL_AD_FEATURE_ATTR, feature);
      else root.removeAttribute(SOCIAL_AD_FEATURE_ATTR);
    } catch { root.removeAttribute(SOCIAL_AD_ATTR); root.removeAttribute(SOCIAL_AD_FEATURE_ATTR); }
    return () => { root.removeAttribute(SOCIAL_AD_ATTR); root.removeAttribute(SOCIAL_AD_FEATURE_ATTR); };
  }, []);
  return <div data-social-picks=""><TopPicks picks={picks} /></div>;
}

// A row with `feature: true` is the listing a Meta ad is about
// (lib/socialAdLanding.js): it stays display:none until the page's inline
// script marks <html data-wf-feature="<its id>">, so only the visitor who
// tapped that ad sees it, first, before the regular picks.
const FEATURE_ID_RX = /^[a-z0-9-]{1,80}$/;

function PickCard({ row, rank }) {
  const measure = christmasPickMeasurement(row);
  const ref = useCommerceImpression(measure.commerce, measure.card);
  const photo = row.photos[0];
  const affiliate = row.cta.kind === "affiliate";
  const internal = row.cta.kind === "internal";
  const meta = [row.when, row.city].filter(Boolean).join(" · ");
  return (
    <li ref={ref} className="xm-pick" data-pick-id={row.id} data-rank={row.feature ? undefined : rank || undefined} data-feature-pick={row.feature ? row.id : undefined}>
      <div className="xm-pick-photo">
        {row.feature ? <p className="xm-pick-from">From the video</p> : null}
        {photo ? <GuidePhoto
          src={photo.src}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          sizes="(min-width: 720px) 300px, 78vw"
          loading={rank === 1 ? "eager" : "lazy"}
          fallbackClassName="xm-pick-ph"
          fallbackText={(row.placeholder && row.placeholder.label) || "Christmas event"}
        /> : <div className="xm-pick-ph" role="img" aria-label={row.name}><span aria-hidden="true">{(row.placeholder && row.placeholder.icon) || "✨"}</span> {(row.placeholder && row.placeholder.label) || "Christmas event"}</div>}
        {photo && photo.credit ? <p className="xm-pick-credit">{photo.credit}</p> : null}
      </div>
      <div className="xm-pick-body">
        {row.urgency && row.urgency.label ? <p className="xm-pick-urgent" data-urgency={row.urgency.kind}>{row.urgency.label}</p> : null}
        <h3>{row.name}</h3>
        {meta ? <p className="xm-pick-meta">{meta}</p> : null}
        <div className="xm-pick-cta-row">
          {row.price && row.price.kind === "from" ? (
            <p className="xm-pick-price" aria-label={"From " + row.price.text}>
              <span className="xm-pick-from-lbl">from</span>
              <span className="xm-pick-amt">{row.price.text}</span>
            </p>
          ) : null}
          <a
            className="xm-pick-buy"
            href={row.cta.href}
            target={internal ? undefined : "_blank"}
            rel={internal ? undefined : affiliate ? "sponsored nofollow noopener" : "nofollow noopener"}
            data-commerce-owner={affiliate || internal ? undefined : "ChristmasTickets"}
            onClick={affiliate || internal ? undefined : () => organizerTap(row)}
            aria-label={row.cta.label + (row.feature ? ": " : ": tickets for ") + row.name}
          >{row.cta.label}</a>
        </div>
        {row.cta.via ? <p className="xm-pick-via">{row.cta.via}</p> : null}
      </div>
    </li>
  );
}

export function TopPicks({ picks }) {
  // A featured row may carry no photo (its venue has none Wayfind may show):
  // it keeps its designed tile. Every regular pick still needs a real photo.
  const rows = Array.isArray(picks) ? picks.filter((r) => r && r.cta && Array.isArray(r.photos) && (r.feature ? FEATURE_ID_RX.test(r.id) && (r.photos[0] || r.placeholder) : r.photos[0])) : [];
  if (!rows.some((r) => !r.feature)) return null;
  const featured = rows.filter((r) => r.feature);
  let rank = 0;
  return (
    <div className="xm-picks" data-top-picks="" data-boo-clear="">
      {featured.length ? <style dangerouslySetInnerHTML={styleHtml(featured.map((r) => `html[data-wf-feature="${r.id}"] .xm-pick[data-feature-pick="${r.id}"]{display:flex}html[data-wf-feature="${r.id}"] .xm-picks-label .xm-picks-from{display:inline}html[data-wf-feature="${r.id}"] .xm-picks-label .xm-picks-plain{display:none}`).join(""))} /> : null}
      <p className="xm-picks-label" id="xm-picks-label"><span className="xm-picks-plain">Top picks with tickets</span><span className="xm-picks-from">From the video, then top picks</span></p>
      <ul className="xm-picks-row" aria-labelledby="xm-picks-label">
        {rows.map((row) => {
          const shownRank = row.feature ? 0 : ++rank;
          return <PickCard key={row.id} row={row} rank={shownRank} />;
        })}
      </ul>
    </div>
  );
}

// The page shell: theme, lights, snow, header and hero. The one list of every
// Christmas listing (ticketed events first, one pill menu) arrives as `browse`
// (owner direction 2026-11-01). `model` supplies the hero copy.
export default function ChristmasTickets({ model, share = null, browse = null, topPicks = null }) {
  const { chrome } = model;
  const seasonal = activeSeasonalMark();
  return (
    <section className="xm-page" aria-labelledby="xm-title" data-analytics-page={SURFACE}>
      <style dangerouslySetInnerHTML={styleHtml(CSS + seasonalMarkCss(seasonal))} />
      <CommerceClickBeacon surface={SURFACE} />
      <div className="xm-doodles" aria-hidden="true" />
      <div className="xm-sparkles" aria-hidden="true" />
      <ChristmasSnow />
      <FestivalLights />
      <ChristmasElves />
      <WayfindHeader seasonal={seasonal} />

      <div className="xm-main">
        <div className="xm-hero" id="xm-hero" data-boo-clear="">
          <h1 id="xm-title">{chrome.title}</h1>
          <SocialTopPicks picks={topPicks} />
          <p className="xm-lede">{chrome.lede}</p>
          <div className="xm-hero-actions">
            <button type="button" className="xm-ask" data-santa-ask="" onClick={askSanta}>{chrome.ask}</button>
            {share ? <div className="xm-share">{share}</div> : null}
          </div>
        </div>

        <div id="xm-tickets" data-ticket-grid="">{browse}</div>
        {chrome.honest ? <p className="xm-honest">{chrome.honest}</p> : null}
      </div>
    </section>
  );
}
