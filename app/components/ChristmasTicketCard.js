"use client";

import { useState } from "react";
import GuidePhoto from "./GuidePhoto.js";
import PhotoCreditLink from "./PhotoCreditLink.js";
import { emitCommerce } from "../../lib/commerce.js";

// THE one Christmas card on /christmas-in-florida (owner direction 2026-11-01:
// "I like the one from image 1 better but add the background similar to image
// 2"). The dark ticket card layout (photo 40%, chip, title, when, city, price,
// one button) wearing the red Christmas background. ChristmasTickets renders it
// for the top ticket grid and ChristmasBrowse renders the same component for
// every statewide result, including the "Show more" pages. There is no second
// card component and the red .wf-christmas RailCard skin is not used here.
//
// The background copies the values of the red skin in css.js (XMAS_SCOPES):
// the #5A0712 base and the owner's card-bg art (red gradient plus the faint
// gift, holly, tree, snowflake and sparkle doodles), right anchored and sized
// to the card height. Text uses the skin's warm light colours. The ticket
// button is gold and cream with dark red text so it still stands out on red.
export const XM_CARD_CSS = `
.xm-card{--xm-cream:#FFF6F0;--xm-warm:#F7DCCB;--xm-soft:#E9C3B0;--xm-rose:#E8B48A;--xm-ink:#4A0610;display:grid;grid-template-columns:40% minmax(0,1fr);min-width:0;overflow:hidden;color:var(--xm-cream);background:#5A0712 url(/christmas/card-bg-640.webp?v=3) right top/auto 100% no-repeat;border:1px solid rgba(232,180,138,.9);border-radius:12px;box-shadow:0 10px 26px rgba(40,2,8,.55),0 0 14px rgba(192,16,42,.28);scroll-margin-top:12px}
@media(min-resolution:1.5dppx){.xm-card{background-image:url(/christmas/card-bg-1100.webp?v=3)}}
.xm-photo{position:relative;min-width:0;min-height:230px;height:100%;background:#3A0510;border-right:1px solid rgba(232,180,138,.85);overflow:hidden}
.xm-strip{position:absolute;inset:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.xm-strip::-webkit-scrollbar{display:none}
.xm-slide{position:relative;flex:0 0 100%;min-width:0;height:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden}
.xm-slide img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.xm-ph,.xm-tile{position:absolute;inset:0;background:linear-gradient(180deg,#5A0712 0%,#2A0309 100%)}
.xm-ph{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px;text-align:center}
.xm-ph::before{content:"\\2728";font-size:30px;line-height:1;opacity:.85}
.xm-ph span{font-size:12px;font-weight:600;line-height:1.3;color:var(--xm-warm)}
.xm-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px;text-align:center}
.xm-tile i{font-style:normal;font-size:34px;line-height:1;opacity:.9}
.xm-tile b{font-size:12px;font-weight:600;line-height:1.3;color:var(--xm-warm)}
.xm-dots{position:absolute;left:0;right:0;bottom:8px;z-index:1;display:flex;justify-content:center;gap:5px;pointer-events:none}
.xm-dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,248,238,.45)}
.xm-dots i.is-on{background:#FFF8EE}
.xm-body{display:flex;flex-direction:column;gap:6px;min-width:0;padding:12px}
.xm-chip{align-self:flex-start;max-width:100%;padding:3px 9px;border-radius:999px;background:linear-gradient(180deg,#4A0610,#33040B);border:1px solid var(--xm-rose);color:#FFE9DC;font-size:12px;font-weight:700;line-height:1.4}
.xm-card :is(h2,h3){margin:0;font-size:16px;line-height:1.3;min-height:calc(1.3em * 2);font-weight:700;color:var(--xm-cream);text-shadow:0 1px 3px rgba(40,0,6,.7);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.xm-credit{margin:0;font-size:11px;line-height:1.35;height:calc(1.35em);color:var(--xm-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xm-credit a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.xm-line{display:flex;align-items:flex-start;gap:7px;margin:0;font-size:13px;line-height:1.4;color:var(--xm-warm);text-shadow:0 1px 2px rgba(40,0,6,.65);min-width:0;overflow-wrap:anywhere}
.xm-line .xm-when{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:calc(1.4em * 2)}
.xm-line svg{flex:0 0 auto;width:15px;height:15px;margin-top:1px}
.xm-bottom{margin-top:auto;display:flex;flex-direction:column;gap:6px;padding-top:6px}
.xm-pricerow,.xm-note{min-height:calc(1.2em + 12px * 1.2 + 2px)}
.xm-pricerow{display:flex;flex-direction:column;align-items:flex-end;margin:0;min-width:0}
.xm-from{font-size:12px;line-height:1.2;color:var(--xm-soft)}
.xm-amt{text-align:right;font-size:22px;line-height:1.2;font-weight:800;color:var(--xm-cream);text-shadow:0 1px 3px rgba(40,0,6,.7)}
.xm-note{margin:0;font-size:13px;line-height:1.35;color:var(--xm-cream);text-shadow:0 1px 2px rgba(40,0,6,.65);text-align:right;overflow-wrap:anywhere}
.xm-buy{display:flex;align-items:center;justify-content:center;width:100%;min-height:46px;padding:6px 8px;background:linear-gradient(180deg,#FFE9B8,#F5C451);color:var(--xm-ink);border:2px solid var(--xm-rose);border-radius:12px;font-size:15px;font-weight:800;line-height:1.2;text-decoration:none;text-align:center;box-shadow:0 0 10px rgba(232,180,138,.25)}
.xm-via{margin:0;font-size:11px;line-height:1.35;color:var(--xm-soft);text-align:center}
.xm-event{display:flex;align-items:center;justify-content:center;min-height:44px;color:#FFD9AE;font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.xm-card a:focus-visible{outline:2px solid #FFD9AE;outline-offset:2px}
`;

const SURFACE = "christmas_tickets";

// Organizer links (no affiliate, not one of our /go routes) are invisible to
// CommerceClickBeacon, so the card records its own single tap. Our /go links
// are recorded once by the beacon and never here.
function organizerTap(row) {
  try {
    emitCommerce("commerce_cta_clicked", { surface: SURFACE, provider: "organizer", merchant: new URL(row.cta.href).hostname, content_id: row.id });
  } catch { /* ignore */ }
}

const ICON = { fill: "none", stroke: "#E9C3B0", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

function PhotoStrip({ row, priority }) {
  const [active, setActive] = useState(0);
  const photos = row.photos;
  const onScroll = (event) => {
    const el = event.currentTarget;
    if (!el.clientWidth) return;
    setActive(Math.max(0, Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
  };
  if (!photos.length) {
    const tile = row.placeholder || { icon: "✨", label: "Christmas event" };
    return (
      <div className="xm-photo" data-photo-count="0">
        <div className="xm-tile" data-event-tile="" role="img" aria-label={tile.label}>
          <i aria-hidden="true">{tile.icon}</i>
          <b>{tile.label}</b>
        </div>
      </div>
    );
  }
  return (
    <div className="xm-photo" data-photo-strip="" data-photo-count={photos.length}>
      <div className="xm-strip" onScroll={onScroll} role="group" aria-label="Photos" tabIndex={photos.length > 1 ? 0 : undefined}>
        {photos.map((photo, i) => (
          <div className="xm-slide" key={photo.src}>
            <GuidePhoto
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              sizes="(min-width: 720px) 190px, 40vw"
              loading={i === 0 && priority ? "eager" : "lazy"}
              fallbackClassName="xm-ph"
              fallbackText={(row.placeholder && row.placeholder.label) || "Christmas event"}
            />
          </div>
        ))}
      </div>
      {photos.length > 1 ? (
        <div className="xm-dots" aria-hidden="true">
          {photos.map((photo, i) => <i key={photo.src} className={i === active ? "is-on" : ""} />)}
        </div>
      ) : null}
    </div>
  );
}

function PhotoCredit({ photos }) {
  const seen = new Set();
  const lines = (photos || []).filter((p) => p && p.credit && !seen.has(p.credit) && seen.add(p.credit));
  if (!lines.length) return <p className="xm-credit" aria-hidden="true">&nbsp;</p>;
  return (
    <p className="xm-credit">
      {lines.map((photo, i) => (
        <span key={photo.credit}>
          {i ? " · " : ""}
          {photo.creditHref ? <PhotoCreditLink href={photo.creditHref} rel="nofollow">{photo.credit}</PhotoCreditLink> : photo.credit}
        </span>
      ))}
    </p>
  );
}

// row.cta is the ticket way in (affiliate /go route or organizer ticket page),
// or null. With no ticket the main button is the event page (row.eventHref) or
// the official source (row.sourceHref), and the secondary link is omitted so
// the same page is never offered twice.
export function TicketCard({ row, chrome, priority = false, idPrefix = "xm-", headingLevel = 2 }) {
  const { price, cta } = row;
  const affiliate = !!cta && cta.kind === "affiliate";
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const fallback = !cta
    ? (row.eventHref ? { href: row.eventHref, label: row.pageLabel || chrome.eventPage, external: false } : row.sourceHref ? { href: row.sourceHref, label: "Official site", external: true } : null)
    : null;
  return (
    <article id={idPrefix + row.id} data-ticket-id={row.id} className="xm-card">
      <PhotoStrip row={row} priority={priority} />
      <div className="xm-body" data-boo-clear="">
        <span className="xm-chip">{row.chip}</span>
        <Heading>{row.name}</Heading>
        <PhotoCredit photos={row.photos} />
        {row.when ? (
          <p className="xm-line">
            <svg viewBox="0 0 16 16" {...ICON}><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.3 1.5" /></svg>
            <span className="xm-when">{row.when}</span>
          </p>
        ) : null}
        {row.city ? (
          <p className="xm-line xm-city">
            <svg viewBox="0 0 16 16" {...ICON}><path d="M8 14.5s4.5-4 4.5-7.5a4.5 4.5 0 1 0-9 0c0 3.5 4.5 7.5 4.5 7.5z" /><circle cx="8" cy="7" r="1.6" /></svg>
            <span>{row.city}</span>
          </p>
        ) : null}
        <div className="xm-bottom">
          {!price ? null : price.kind === "from" ? (
            <p className="xm-pricerow" aria-label={"From " + price.text + (price.unit ? " " + price.unit : "")}>
              <span className="xm-from">from</span>
              <span className="xm-amt">{price.text}</span>
              {price.unit ? <span className="xm-from">{price.unit}</span> : null}
            </p>
          ) : price.kind === "free" ? (
            <p className="xm-pricerow" aria-label={price.text}><span className="xm-amt">{price.text}</span></p>
          ) : (
            <p className="xm-note">{price.text}</p>
          )}
          {cta ? (
            <>
              <a
                className="xm-buy"
                href={cta.href}
                target="_blank"
                rel={affiliate ? "sponsored nofollow noopener" : "nofollow noopener"}
                data-commerce-owner={affiliate ? undefined : "ChristmasTickets"}
                onClick={affiliate ? undefined : () => organizerTap(row)}
              >{cta.label}</a>
              <p className="xm-via">{cta.via}</p>
              {row.eventHref ? <a className="xm-event" href={row.eventHref}>{chrome.eventPage}</a> : null}
            </>
          ) : fallback ? (
            <a
              className="xm-buy"
              href={fallback.href}
              {...(fallback.external ? { target: "_blank", rel: "nofollow noopener" } : {})}
            >{fallback.label}</a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
