// Shared render for the 1200x630 list share card (v5.71). Both the preview route
// (/api/og/list?d=) and the versioned snapshot route (/api/og/<slug>?v=) call
// listCardResponse() so the layout and fonts live in exactly one place. Edge-
// safe: only ImageResponse + import.meta.url font fetches, no node APIs.
import { ImageResponse } from "next/og";
import { headlineSize, fitTickerItems, splitAccent } from "../../../../lib/listEngine.js";

const anton = fetch(new URL("./fonts/Anton-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());
const arch600 = fetch(new URL("./fonts/Archivo-600-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());
const arch700 = fetch(new URL("./fonts/Archivo-700-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());
const arch900 = fetch(new URL("./fonts/Archivo-900-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());

const INK = "#0A0B0D", WHITE = "#FFFFFF", ORANGE = "#FF6B1A", MUTE = "#6E757D", SEP = "#3C424A", HAIR = "#1E2126";

// The Part 6 reference, used when no card data is supplied.
export const SAMPLE = {
  strip: ["Sarasota", "7:14 PM Sat", "94°F Overcast", "12 open now"],
  hook: { lines: ["Sarasota’s #1 hot dog", "is at a gas station."], accent: "gas station" },
  bar_label: "See which one",
  ticker: [
    { rank: 2, name: "Georgie’s Dogs", rating: 4.7 },
    { rank: 3, name: "The Dog House", rating: 4.6 },
    { rank: 4, name: "Dawgy Style", rating: 4.4 },
    { rank: 5, name: "Wieners on Main", rating: 4.3 },
  ],
  note: "Updates hourly. Share it before it changes.",
};

// Decode a base64url-encoded card JSON (preview route).
export function decodeCard(raw) {
  if (!raw) return null;
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4);
    const c = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return c && typeof c === "object" ? c : null;
  } catch (e) { return null; }
}

export const CARD_CACHE = {
  immutable: "public, immutable, no-transform, s-maxage=31536000, max-age=31536000",
  live: "public, max-age=600, s-maxage=600",
};

export async function listCardResponse(card, opts = {}) {
  const c = card && typeof card === "object" ? card : SAMPLE;
  const strip = (Array.isArray(c.strip) ? c.strip : SAMPLE.strip).slice(0, 5).map((s) => String(s).toUpperCase());
  let lines = (c.hook && Array.isArray(c.hook.lines) ? c.hook.lines : SAMPLE.hook.lines).slice(0, 2).map((s) => String(s));
  if (!lines.length) lines = SAMPLE.hook.lines;
  const accent = (c.hook && c.hook.accent) || "";
  const barLabel = String(c.bar_label || "See which one").toUpperCase();
  const ticker = fitTickerItems(Array.isArray(c.ticker) ? c.ticker : SAMPLE.ticker);
  const note = String(c.note || "Updates hourly. Share it before it changes.");
  const size = headlineSize(lines);
  const lineH = Math.round(size * 0.861);

  const [fAnton, f6, f7, f9] = await Promise.all([anton, arch600, arch700, arch900]);

  const res = new ImageResponse(
    (
      <div style={{ width: "1200px", height: "630px", display: "flex", flexDirection: "column", backgroundColor: INK, padding: "38px 44px 34px", fontFamily: "Archivo" }}>
        <div style={{ display: "flex", flexShrink: 0, alignItems: "center", fontSize: 12, fontWeight: 700, letterSpacing: 2.3, color: MUTE }}>
          {strip.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 ? <span style={{ color: SEP, padding: "0 14px" }}>/</span> : null}
              <span>{t}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
          {lines.map((line, li) => (
            <div key={li} style={{ display: "flex", fontFamily: "Anton", fontSize: size, lineHeight: lineH + "px", letterSpacing: 0.4, color: WHITE }}>
              {splitAccent(line, accent).map((seg, si) => (
                <span key={si} style={{ color: seg.accent ? ORANGE : WHITE, whiteSpace: "pre" }}>{seg.text}</span>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "space-between", backgroundColor: ORANGE, color: INK, fontWeight: 900, fontSize: 24, letterSpacing: 3.4, padding: "24px 34px", marginTop: 36, marginLeft: -26, marginRight: -26, transform: "rotate(-0.55deg)" }}>
          <span>{barLabel}</span>
          <span style={{ opacity: 0.55 }}>{"→"}</span>
        </div>

        <div style={{ display: "flex", flexShrink: 0, alignItems: "center", marginTop: 32, fontSize: 16, fontWeight: 600 }}>
          {ticker.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 ? <span style={{ color: SEP, padding: "0 12px" }}>/</span> : null}
              <span style={{ color: ORANGE, fontWeight: 900 }}>{String(it.rank)}</span>
              <span style={{ color: WHITE, padding: "0 8px" }}>{it.name}</span>
              <span style={{ color: MUTE }}>{it.rating}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "space-between", marginTop: 28, paddingTop: 28, borderTop: "1px solid " + HAIR }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg width="23" height="23" viewBox="0 0 24 24"><path fill={ORANGE} d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Z" /><circle cx="12" cy="10" r="3" fill={INK} /></svg>
            <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: 2.7, color: WHITE, paddingLeft: 10 }}>WAYFIND</span>
          </div>
          <div style={{ display: "flex", fontSize: 13, fontWeight: 600, color: MUTE }}>{note}</div>
          <div style={{ display: "flex", fontSize: 17, fontWeight: 700, color: WHITE }}>gowayfind.com</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Anton", data: fAnton, weight: 400, style: "normal" },
        { name: "Archivo", data: f6, weight: 600, style: "normal" },
        { name: "Archivo", data: f7, weight: 700, style: "normal" },
        { name: "Archivo", data: f9, weight: 900, style: "normal" },
      ],
    }
  );
  // next/og's ImageResponse sets its OWN default Cache-Control (public, immutable,
  // no-transform, max-age=31536000). Passing headers in the options APPENDS to
  // it, so the live card shipped both that and max-age=600 — a cache honoring the
  // first directive would freeze the "live" card for a year, breaking the
  // snapshot contract. set() REPLACES, guaranteeing one correct directive.
  res.headers.set("Cache-Control", opts.immutable ? CARD_CACHE.immutable : CARD_CACHE.live);
  return res;
}

export function listCardFallback() {
  const res = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: INK, color: WHITE }}>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: ORANGE }}>Wayfind</div>
        <div style={{ display: "flex", fontSize: 30, color: MUTE, marginTop: 16 }}>Ranked local lists.</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
  // A transient error fallback — never let next/og's immutable default freeze it.
  res.headers.set("Cache-Control", "public, max-age=60");
  return res;
}
