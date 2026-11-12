"use client";
// TrendingSocialShelf — the "Trending on social" shelf at the top of the
// TRENDING NOW poster (owner brief, 2026-11-12). Every eligible Wayfind Reel
// and carousel, and every creator post about something current, whatever it
// is about: an event, a place, a guide or a plan. Ranked on the server by the
// Wayfind Trend Score (/api/trending/social); this chunk only renders the
// cards for what the server returns, page by page, until the pool is done.
// Lives inside the TrendingRails lazy chunk, so the homepage ships none of it.
import { useEffect, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";

const C = { muted: "#8B93A1" };
const FORMAT = { reel: "Reel", carousel: "Carousel", image: "Post", post: "Post", video: "Video" };

export function socialEyebrow(item) {
  const what = FORMAT[item.format] || "Post";
  return item.owned ? "Wayfind " + what : item.owner ? "@" + item.owner + " " + what.toLowerCase() : "Creator " + what.toLowerCase();
}

export function socialWhen(item, today = new Date()) {
  if (!item.publishedAt) return null;
  const days = Math.floor((today.getTime() - Date.parse(item.publishedAt)) / 86400000);
  return days <= 0 ? "Posted today" : days === 1 ? "Posted yesterday" : "Posted " + days + " days ago";
}

export default function TrendingSocialShelf({ center = null, onTrack = null }) {
  const track = (name, item, postId) => { if (onTrack) { try { onTrack(name, { social_id: postId, card_id: item.id, entity: item.entity.type + ":" + item.entity.id, rank: item.rank }); } catch (e) {} } };
  const [state, setState] = useState({ items: [], status: "loading" });
  useEffect(() => {
    let live = true;
    const base = "/api/trending/social?limit=24" + (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)
      ? "&lat=" + center.lat.toFixed(2) + "&lng=" + center.lng.toFixed(2) : "");
    (async () => {
      const all = [];
      for (let offset = 0, guard = 0; guard < 20; guard += 1) {
        const res = await fetch(base + "&offset=" + offset);
        if (!res.ok) throw new Error("status " + res.status);
        const body = await res.json();
        all.push(...(body.items || []));
        if (!live) return;
        setState({ items: all.slice(), status: body.hasMore ? "more" : "done" });
        if (!body.hasMore) break;
        offset += body.limit || 24;
      }
    })().catch(() => { if (live) setState((s) => ({ items: s.items, status: s.items.length ? "done" : "failed" })); });
    return () => { live = false; };
  }, [center && center.lat, center && center.lng]);

  const { items, status } = state;
  if (status === "failed" || (!items.length && status !== "loading")) return null;
  const railId = "trending-social";
  const count = items.length;
  return (
    <section aria-label="Trending on social" style={{ marginTop: 22 }} data-trending-rail="social">
      <RailHeading title="Trending on Social" description="Wayfind's newest Reels and carousels, plus creator posts about what's happening now.">
        {count ? <RailNav railId={railId} count={count} total={count} loaded={count} unit={count === 1 ? "post" : "posts"} /> : null}
      </RailHeading>
      {!count ? <p role="status" style={{ color: C.muted, fontSize: 13, padding: "7px 2px 13px" }}>Loading trending posts…</p> : (
        <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label="Trending on social">
          {items.map((item, index) => {
            const more = item.alternates && item.alternates.length ? "+" + item.alternates.length + " more " + (item.alternates.length === 1 ? "post" : "posts") + " below" : null;
            const open = () => {
              if (onTrack) { try { onTrack("trend_social_open", { social_id: item.id, entity: item.entity.type + ":" + item.entity.id, rank: item.rank, score: item.trend && item.trend.score }); } catch (e) {} }
              if (item.entity.href) window.location.assign(item.entity.href);
              else window.open(item.permalink, "_blank", "noopener");
            };
            return <RailCard key={item.id} className="wf-exploding-primary"
              photo={item.cover && item.cover.src || null}
              photoAttr={item.cover && item.cover.credit ? item.cover.credit.label : undefined}
              photoAttrHref={item.cover && item.cover.credit && item.cover.credit.href ? item.cover.credit.href : undefined}
              photoFallback={item.cover && item.cover.fallback || undefined}
              photoFallbackCategory={item.entity.type === "place" ? "attractions" : "events"}
              eagerMedia={index < 6}
              placeholder={item.cover ? null : { icon: item.format === "reel" ? "🎬" : "🖼️", label: socialEyebrow(item), tint: "linear-gradient(160deg,#3a1f4d,#12091a)" }}
              title={item.title}
              eyebrow={socialEyebrow(item)}
              rank={index + 1}
              when={socialWhen(item) ? { label: socialWhen(item) } : null}
              facts={[item.entity.city, more].filter(Boolean)}
              take={(item.trend && item.trend.labels && item.trend.labels[0]) || item.caption || null}
              ctaNode={<div className="wf-trend-social-links" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <a className="wf-place-card-book wf-rail-card-cta" href={item.permalink} target="_blank" rel="noopener"
                  onClick={(e) => { e.stopPropagation(); track("trend_social_watch", item, item.id); }}>{item.owned ? "Watch on Instagram ↗" : "Watch the post ↗"}</a>
                {item.alternates && item.alternates.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 12 }}>
                  {item.alternates.map((a, i) => <a key={a.id} href={a.permalink} target="_blank" rel="noopener" style={{ color: "#FF9B50", minHeight: 24, display: "inline-flex", alignItems: "center" }}
                    aria-label={"Watch " + socialEyebrow(a) + " about " + item.title}
                    onClick={(e) => { e.stopPropagation(); track("trend_social_watch", item, a.id); }}>{(a.owned ? "Wayfind " : "@" + (a.owner || "creator") + " ") + (FORMAT[a.format] || "post").toLowerCase() + " ↗"}</a>)}
                </div> : null}
              </div>}
              ariaLabel={(item.entity.href ? "Open " : "Watch ") + item.title}
              onOpen={open} />;
          })}
        </div>
      )}
      {count > 1 ? <RailDots railId={railId} count={count} /> : null}
    </section>
  );
}
