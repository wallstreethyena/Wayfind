"use client";
// "This weekend near you" (or "in Florida"): each category that has something
// this weekend, up to 10 options, in a row you can swipe. Family friendly is
// not a row. A tile opens the event page. When the card already has a ticket
// way in, the gold partner button uses that same tracked redirect, attributed
// to this rail. A tile with no real photo is not shown.
import { useEffect, useRef, useState } from "react";
import { styleHtml } from "../../lib/styleHtml.js";
import { emitCommerce, mintClickId } from "../../lib/commerce.js";
import { planRowOrganizerClick } from "../../lib/partnerClick.js";
import { track } from "../../lib/track.js";
import {
  CHRISTMAS_WEEKEND_RAIL_IMPRESSION, CHRISTMAS_WEEKEND_SURFACE, CHRISTMAS_WEEKEND_TILE_CLICK,
  weekendCardPhoto, weekendRailImpressionProps, weekendTicketCta, weekendTileClickProps,
} from "../../lib/christmasWeekendTile.js";

const CSS = `
.xw-row{margin:22px 0 4px;padding:18px 0 6px;border-top:1px solid rgba(232,180,138,.22)}
.xw-head h2{margin:0;color:#FFF7ED;font-family:Georgia,serif;font-size:24px;font-weight:500;line-height:1.2;letter-spacing:-.3px}
.xw-when{margin:5px 0 0;color:#E1C6B6;font-size:13px;line-height:1.4}
.xw-group{margin:18px 0 0}.xw-label{margin:0 0 8px;color:#E8B48A;font-size:11px;font-weight:750;letter-spacing:1.3px;text-transform:uppercase}
.xw-tiles{display:flex;gap:10px;margin:0 -16px;padding:2px 16px 8px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;list-style:none}
.xw-tile{flex:0 0 min(72vw,260px);scroll-snap-align:start;min-width:0;display:flex}
.xw-card{display:flex;flex-direction:column;width:100%;box-sizing:border-box;overflow:hidden;border:1px solid #E8B48A40;border-radius:16px;background:linear-gradient(160deg,#3E0C19,#230710 80%);color:#FFF7ED}
.xw-open{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;color:inherit;text-decoration:none}
.xw-open:focus-visible,.xw-buy:focus-visible{outline:2px solid #FFE9C8;outline-offset:3px}
.xw-photo{display:block;width:100%;height:118px;object-fit:cover;background:#2A0A12}
.xw-body{display:block;padding:11px 13px 13px}
.xw-title{display:block;color:#FFF7ED;font-family:Georgia,serif;font-size:17px;line-height:1.25}
.xw-meta{display:block;margin-top:5px;color:#E1C6B6;font-size:13px;line-height:1.4}
.xw-dist{color:#E8B48A}
.xw-buy{display:flex;align-items:center;justify-content:center;width:calc(100% - 26px);min-height:44px;margin:0 13px 13px;padding:6px 8px;background:linear-gradient(180deg,#FFE9B8,#F5C451);color:#4A0610;border:2px solid #E8B48A;border-radius:12px;font-size:15px;font-weight:800;line-height:1.2;text-decoration:none;text-align:center;box-shadow:0 0 10px rgba(232,180,138,.25)}
@media(min-width:720px){.xw-tiles{margin:0;padding:2px 2px 8px}}
`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  return DAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + " " + MONTHS[+m[2] - 1] + " " + +m[3];
}
export function weekendRangeText(window) {
  if (!Array.isArray(window) || window.length !== 2) return "";
  return window[0] === window[1] ? dayText(window[0]) : dayText(window[0]) + " to " + dayText(window[1]);
}

// Where a tile goes: the card's own page, else the organizer's page.
export function weekendTileHref(card) {
  if (card.detailHref && String(card.detailHref).startsWith("/")) return card.detailHref;
  const url = card.url || card.sourceUrl || "";
  return /^https:\/\//.test(url) ? url : null;
}
function tileWhen(card) {
  return (card.ticketRow && card.ticketRow.when) || card.when || card.seasonalWhen || "";
}

// A photo that fails to load falls back to nothing visible rather than a broken icon.
function TilePhoto({ src }) {
  const [dead, setDead] = useState(false);
  if (!src || dead) return null;
  return <img className="xw-photo" src={src} alt="" loading="lazy" decoding="async" onError={() => setDead(true)} />;
}

function visibleGroups(data) {
  const groups = data && Array.isArray(data.groups) ? data.groups : [];
  const out = [];
  for (const group of groups) {
    if (!group || !Array.isArray(group.cards)) continue;
    const cards = group.cards.filter((card) => card && weekendCardPhoto(card));
    if (cards.length) out.push({ ...group, cards });
  }
  return out;
}

// Official Tickets leaves our site, so the beacon cannot see it. Record that
// tap once here. /go links are the beacon's, from the surface on the href.
function organizerTap(card, cta) {
  try {
    const plan = planRowOrganizerClick(
      { id: card.slug || card.id, slug: card.slug || null, cta: { href: cta.href } },
      CHRISTMAS_WEEKEND_SURFACE,
      { locationHost: typeof location !== "undefined" ? location.host : undefined, mint: mintClickId },
    );
    if (plan) emitCommerce("commerce_cta_clicked", plan.ctx);
  } catch { /* ignore */ }
}

export default function ChristmasWeekendRow({ initial, lat, lng }) {
  const [data, setData] = useState(initial || null);
  const rootRef = useRef(null);
  const seen = useRef("");
  useEffect(() => {
    if (lat == null || lat === "" || lng == null || lng === "") { setData(initial || null); return undefined; }
    const controller = new AbortController();
    fetch("/api/christmas/browse?group=weekend&lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status " + r.status))))
      .then((json) => { if (json && Array.isArray(json.groups)) setData(json); })
      .catch(() => {});
    return () => controller.abort();
  }, [lat, lng]);
  const groups = visibleGroups(data);
  const signature = groups.map((group) => group.id + ":" + group.cards.length).join("|");
  const impressionRef = useRef(null);
  impressionRef.current = weekendRailImpressionProps(groups);
  useEffect(() => {
    if (!signature || seen.current === signature) return undefined;
    const fire = () => {
      if (seen.current === signature) return;
      seen.current = signature;
      try { track(CHRISTMAS_WEEKEND_RAIL_IMPRESSION, impressionRef.current); } catch { /* ignore */ }
    };
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver !== "function") { fire(); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { fire(); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [signature]);
  if (!groups.length) return null;
  const near = !!data.located;
  const range = weekendRangeText(data.window);
  return <section ref={rootRef} className="xw-row" aria-labelledby="xw-heading" data-boo-clear="" data-christmas-weekend="" data-weekend-located={near ? "1" : "0"}>
    <style dangerouslySetInnerHTML={styleHtml(CSS)} />
    <div className="xw-head">
      <h2 id="xw-heading">{near ? "This weekend near you" : "This weekend in Florida"}</h2>
      {range ? <p className="xw-when">{range}. Top rated choices in each kind.</p> : null}
    </div>
    {groups.map((group) => <div className="xw-group" key={group.id} data-weekend-group={group.id}>
      <h3 className="xw-label">{group.label}</h3>
      <ul className="xw-tiles">
        {group.cards.map((card, index) => {
          const href = weekendTileHref(card);
          const photo = weekendCardPhoto(card);
          const when = tileWhen(card);
          const cta = weekendTicketCta(card);
          const position = index + 1;
          const open = <>
            <TilePhoto src={photo} />
            <span className="xw-body">
              <span className="xw-title">{card.title || card.name}</span>
              <span className="xw-meta">{[card.city, when].filter(Boolean).join(" · ")}{near && card.distMi != null ? <span className="xw-dist">{" · " + Math.round(card.distMi) + " mi"}</span> : null}</span>
            </span>
          </>;
          const onTile = () => { try { track(CHRISTMAS_WEEKEND_TILE_CLICK, weekendTileClickProps(group.id, position, !!cta)); } catch { /* ignore */ } };
          return <li className="xw-tile" key={card.id} data-weekend-position={position} data-weekend-cta={cta ? "1" : "0"}>
            <div className="xw-card">
              {href
                ? <a className="xw-open" href={href} onClick={onTile} {...(href.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>{open}</a>
                : <div className="xw-open">{open}</div>}
              {cta ? <a
                className="xw-buy"
                href={cta.href}
                target="_blank"
                rel={cta.kind === "affiliate" ? "sponsored nofollow noopener" : "nofollow noopener"}
                data-commerce-owner={cta.kind === "affiliate" ? undefined : "ChristmasWeekendRow"}
                onClick={cta.kind === "affiliate" ? undefined : () => organizerTap(card, cta)}
              >{cta.label}</a> : null}
            </div>
          </li>;
        })}
      </ul>
    </div>)}
  </section>;
}
