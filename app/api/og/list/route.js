// Wayfind List share card (v5.70). A 1200x630 link-preview PNG rendered on the
// Edge from a list's hook. next/og renders through Satori, NOT a browser, so:
//   - the condensed look comes from a STATIC condensed face (Anton), never a
//     variable width axis (Satori ignores it silently);
//   - fonts are loaded as ArrayBuffers from bundled, Latin-subset .ttf files,
//     never fetched from Google Fonts at request time;
//   - every multi-child box is display:flex; no grid, no blur, no shadow;
//   - uppercase is applied in JS (Satori's text-transform is unreliable);
//   - the redaction bar keeps its rotate(-0.55deg) + negative-margin overhang.
// This PR renders from a base64url `d` param (or the reference sample) so the
// card is verifiable now; the versioned snapshot route wires the same layout to
// stored list JSON in the next PR.
import { ImageResponse } from "next/og";
import { headlineSize, fitTickerItems, splitAccent } from "../../../../lib/listEngine.js";

export const runtime = "edge";

const anton = fetch(new URL("./fonts/Anton-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());
const arch600 = fetch(new URL("./fonts/Archivo-600-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());
const arch700 = fetch(new URL("./fonts/Archivo-700-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());
const arch900 = fetch(new URL("./fonts/Archivo-900-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());

const INK = "#0A0B0D", WHITE = "#FFFFFF", ORANGE = "#FF6B1A", MUTE = "#6E757D", SEP = "#3C424A", HAIR = "#1E2126";

// The Part 6 reference, used when no `d` is supplied.
const SAMPLE = {
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

function decodeCard(raw) {
  if (!raw) return null;
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4);
    const json = decodeURIComponent(escape(atob(b64)));
    const c = JSON.parse(json);
    return c && typeof c === "object" ? c : null;
  } catch (e) { return null; }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const card = decodeCard(searchParams.get("d")) || SAMPLE;

    const strip = (Array.isArray(card.strip) ? card.strip : SAMPLE.strip).slice(0, 5).map((s) => String(s).toUpperCase());
    let lines = (card.hook && Array.isArray(card.hook.lines) ? card.hook.lines : SAMPLE.hook.lines).slice(0, 2).map((s) => String(s));
    if (!lines.length) lines = SAMPLE.hook.lines;
    const accent = (card.hook && card.hook.accent) || "";
    const barLabel = String(card.bar_label || "See which one").toUpperCase();
    const ticker = fitTickerItems(Array.isArray(card.ticker) ? card.ticker : SAMPLE.ticker);
    const note = String(card.note || "Updates hourly. Share it before it changes.");
    const size = headlineSize(lines);
    const lineH = Math.round(size * 0.861);

    const [fAnton, f6, f7, f9] = await Promise.all([anton, arch600, arch700, arch900]);

    return new ImageResponse(
      (
        <div style={{ width: "1200px", height: "630px", display: "flex", flexDirection: "column", backgroundColor: INK, padding: "38px 44px 34px", fontFamily: "Archivo" }}>
          {/* CONDITION STRIP */}
          <div style={{ display: "flex", flexShrink: 0, alignItems: "center", fontSize: 12, fontWeight: 700, letterSpacing: 2.3, color: MUTE }}>
            {strip.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 ? <span style={{ color: SEP, padding: "0 14px" }}>/</span> : null}
                <span>{t}</span>
              </div>
            ))}
          </div>

          {/* HOOK — takes all leftover space, vertically centered */}
          <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
            {lines.map((line, li) => (
              <div key={li} style={{ display: "flex", fontFamily: "Anton", fontSize: size, lineHeight: lineH + "px", letterSpacing: 0.4, color: WHITE }}>
                {splitAccent(line, accent).map((seg, si) => (
                  <span key={si} style={{ color: seg.accent ? ORANGE : WHITE, whiteSpace: "pre" }}>{seg.text}</span>
                ))}
              </div>
            ))}
          </div>

          {/* REDACTION BAR — the signature: off-axis, overhanging both sides */}
          <div style={{ display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "space-between", backgroundColor: ORANGE, color: INK, fontWeight: 900, fontSize: 24, letterSpacing: 3.4, padding: "24px 34px", marginTop: 36, marginLeft: -26, marginRight: -26, transform: "rotate(-0.55deg)" }}>
            <span>{barLabel}</span>
            <span style={{ opacity: 0.55 }}>{"→"}</span>
          </div>

          {/* RUNNERS-UP TICKER — ranks 2-5, one line, never wraps */}
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

          {/* FOOT */}
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
        headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
      }
    );
  } catch (e) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: INK, color: WHITE }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: ORANGE }}>Wayfind</div>
          <div style={{ display: "flex", fontSize: 30, color: MUTE, marginTop: 16 }}>Ranked local lists.</div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
