"use client";
// "This weekend near you" (or "in Florida"): up to 4 categories with 3 options
// each, above the filter toolbar. Options, never one pick. The statewide
// version is server rendered; once the page knows where the visitor is, this
// asks /api/christmas/browse?group=weekend for the near you version. A tile
// opens the same page the card opens (its event or place page, else the
// organizer's own page). Photos are shown only when the card already has one.
import { useEffect, useState } from "react";
import { styleHtml } from "../../lib/styleHtml.js";

const CSS = `
.xw-row{margin:22px 0 4px;padding:18px 0 6px;border-top:1px solid rgba(232,180,138,.22)}
.xw-head h2{margin:0;color:#FFF7ED;font-family:Georgia,serif;font-size:24px;font-weight:500;line-height:1.2;letter-spacing:-.3px}
.xw-when{margin:5px 0 0;color:#E1C6B6;font-size:13px;line-height:1.4}
.xw-group{margin:18px 0 0}.xw-label{margin:0 0 8px;color:#E8B48A;font-size:11px;font-weight:750;letter-spacing:1.3px;text-transform:uppercase}
.xw-tiles{display:flex;gap:10px;margin:0 -16px;padding:2px 16px 8px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;list-style:none}
.xw-tile{flex:0 0 min(72vw,260px);scroll-snap-align:start;min-width:0}
.xw-link{display:flex;flex-direction:column;height:100%;box-sizing:border-box;overflow:hidden;border:1px solid #E8B48A40;border-radius:16px;background:linear-gradient(160deg,#3E0C19,#230710 80%);color:#FFF7ED;text-decoration:none}
.xw-link:focus-visible{outline:2px solid #FFE9C8;outline-offset:3px}
.xw-photo{display:block;width:100%;height:118px;object-fit:cover;background:#2A0A12}
.xw-blank{display:block;width:100%;height:118px;background:linear-gradient(135deg,#630F22,#2A0A12)}
.xw-body{display:block;padding:11px 13px 13px}
.xw-title{display:block;color:#FFF7ED;font-family:Georgia,serif;font-size:17px;line-height:1.25}
.xw-meta{display:block;margin-top:5px;color:#E1C6B6;font-size:13px;line-height:1.4}
.xw-dist{color:#E8B48A}
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
function tilePhoto(card) {
  const t = card.ticketRow && Array.isArray(card.ticketRow.photos) ? card.ticketRow.photos[0] : null;
  if (t && t.src) return t.src;
  if (Array.isArray(card.photos) && card.photos[0] && card.photos[0].src) return card.photos[0].src;
  const src = card.image;
  return src && !/\/cards-v8\//.test(src) && !/wfplacediscovery/.test(src) ? src : "";
}
function tileWhen(card) {
  return (card.ticketRow && card.ticketRow.when) || card.when || card.seasonalWhen || "";
}

// A photo that fails to load (a dead link) falls back to the plain tile, never a broken image icon.
function TilePhoto({ src }) {
  const [dead, setDead] = useState(false);
  if (!src || dead) return <span className="xw-blank" aria-hidden="true" />;
  return <img className="xw-photo" src={src} alt="" loading="lazy" decoding="async" onError={() => setDead(true)} />;
}

export default function ChristmasWeekendRow({ initial, lat, lng }) {
  const [data, setData] = useState(initial || null);
  useEffect(() => {
    if (lat == null || lat === "" || lng == null || lng === "") { setData(initial || null); return undefined; }
    const controller = new AbortController();
    fetch("/api/christmas/browse?group=weekend&lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status " + r.status))))
      .then((json) => { if (json && Array.isArray(json.groups)) setData(json); })
      .catch(() => {});
    return () => controller.abort();
  }, [lat, lng]);
  const groups = data && Array.isArray(data.groups) ? data.groups.filter((g) => g && g.cards && g.cards.length) : [];
  if (!groups.length) return null;
  const near = !!data.located;
  const range = weekendRangeText(data.window);
  return <section className="xw-row" aria-labelledby="xw-heading" data-boo-clear="" data-christmas-weekend="" data-weekend-located={near ? "1" : "0"}>
    <style dangerouslySetInnerHTML={styleHtml(CSS)} />
    <div className="xw-head">
      <h2 id="xw-heading">{near ? "This weekend near you" : "This weekend in Florida"}</h2>
      {range ? <p className="xw-when">{range}. Top rated choices, three in each kind.</p> : null}
    </div>
    {groups.map((group) => <div className="xw-group" key={group.id} data-weekend-group={group.id}>
      <h3 className="xw-label">{group.label}</h3>
      <ul className="xw-tiles">
        {group.cards.map((card) => {
          const href = weekendTileHref(card);
          const photo = tilePhoto(card);
          const when = tileWhen(card);
          const inner = <>
            <TilePhoto src={photo} />
            <span className="xw-body">
              <span className="xw-title">{card.title || card.name}</span>
              <span className="xw-meta">{[card.city, when].filter(Boolean).join(" · ")}{near && card.distMi != null ? <span className="xw-dist">{" · " + Math.round(card.distMi) + " mi"}</span> : null}</span>
            </span>
          </>;
          return <li className="xw-tile" key={card.id}>
            {href ? <a className="xw-link" href={href} {...(href.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>{inner}</a> : <div className="xw-link">{inner}</div>}
          </li>;
        })}
      </ul>
    </div>)}
  </section>;
}
