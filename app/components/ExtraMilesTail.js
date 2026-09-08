"use client";
// app/components/ExtraMilesTail.js — "Worth the Extra Miles" (Lane E).
//
// The long-distance tail under the homepage Worth the Drive drop. Rendered
// ONLY when the drive drop is open and only via next/dynamic (ssr:false), so
// it costs the homepage nothing at first paint and stays out of the main
// bundle. It fetches its own route (/api/extra-miles) — never /api/rails —
// so the ordinary 12–27 mile cards above it are untouched by design: this
// component cannot see them and they cannot see it.
//
// Honesty rules, same as every rail: nothing renders until a real answer
// arrives; an empty answer renders nothing (no "nothing worth the miles"
// sentence — the section simply does not exist for that reader); a failed
// read renders nothing rather than a guess. Every card links to a real
// /places/<id> page the API already proved exists.
import { useEffect, useState } from "react";

const CSS = `
.wf8-xm{margin:18px 0 4px;padding:14px 0 0;border-top:1px dashed var(--wf8-line,rgba(148,163,184,.35))}
.wf8-xm-h{display:flex;flex-direction:column;gap:2px;margin:0 0 10px}
.wf8-xm-h h4{margin:0;font-size:17px;font-weight:800;letter-spacing:-.01em;color:var(--wf8-fg,#fff)}
.wf8-xm-h p{margin:0;font-size:13.5px;line-height:1.45;color:var(--wf8-mut,#94a3b8)}
.wf8-xm-rail{display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x mandatory;margin:0;padding:2px 0 6px;list-style:none}
.wf8-xm-rail::-webkit-scrollbar{display:none}
.wf8-xm-card{flex:0 0 min(78%,300px);scroll-snap-align:start;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;background:var(--wf8-card,#0f172a);border:1px solid var(--wf8-line,rgba(148,163,184,.25));color:inherit;text-decoration:none}
.wf8-xm-card img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#1e293b}
.wf8-xm-b{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px}
.wf8-xm-k{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--wf8-acc,#38bdf8)}
.wf8-xm-n{font-size:15px;font-weight:800;line-height:1.25;color:var(--wf8-fg,#fff)}
.wf8-xm-t{font-size:13px;line-height:1.4;color:var(--wf8-mut,#94a3b8)}
.wf8-xm-go{margin-top:4px;font-size:13px;font-weight:700;color:var(--wf8-fg,#fff)}
`;

function track(name, props) {
  try { if (typeof window !== "undefined" && window.posthog && window.posthog.capture) window.posthog.capture(name, props || {}); } catch (e) {}
}

export default function ExtraMilesTail({ lat, lng }) {
  const [data, setData] = useState(null);
  const la = Number.isFinite(lat) ? Math.round(lat * 100) / 100 : null;
  const ln = Number.isFinite(lng) ? Math.round(lng * 100) / 100 : null;

  useEffect(() => {
    if (la == null || ln == null) return undefined;
    let cancelled = false;
    setData(null);
    fetch(`/api/extra-miles?lat=${la}&lng=${ln}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const cards = j && j.ok && Array.isArray(j.cards) ? j.cards : [];
        setData({ title: (j && j.title) || "Worth the Extra Miles", sub: (j && j.sub) || "", cards });
        if (cards.length) track("extra_miles_shown", { count: cards.length, nearest_mi: cards[0].distMi, lat: la, lng: ln });
      })
      .catch(() => { if (!cancelled) setData({ title: "", sub: "", cards: [] }); });
    return () => { cancelled = true; };
  }, [la, ln]);

  if (!data || !data.cards.length) return null;
  return (
    <section className="wf8-xm" aria-label={data.title} data-wf-extra-miles>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wf8-xm-h">
        <h4>{data.title}</h4>
        {data.sub ? <p>{data.sub}</p> : null}
      </div>
      <ul className="wf8-xm-rail">
        {data.cards.map((c) => (
          <li key={c.id} style={{ display: "contents" }}>
            <a className="wf8-xm-card" href={c.href}
              onClick={() => track("extra_miles_open", { place_id: c.id, dist_mi: c.distMi })}>
              {/* The API already proved this photo serves from cache; if the
                  world changes between that check and this paint, hide the
                  broken glyph rather than show a wrong picture. */}
              <img src={c.image} alt={c.title} loading="lazy" decoding="async"
                onError={(e) => { try { e.currentTarget.style.display = "none"; } catch (_) {} }} />
              <div className="wf8-xm-b">
                <span className="wf8-xm-k">{c.drive} · {c.distMi} mi</span>
                <span className="wf8-xm-n">{c.title}</span>
                <span className="wf8-xm-t">{c.hook}</span>
                <span className="wf8-xm-go">See the park →</span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
