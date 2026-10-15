// lib/guideVisualMonitor.js — the pure half of scripts/guide-visual-monitor.mjs:
// parse a live guide / blog page into recommendations and sort each one into
// the owner's three states (2026-10-14):
//   A  photo exists and renders      B  photo exists, Wayfind fails to show it
//   C  no verified photo available (sourcing backlog, never an alarm)
// A-context (2026-10-15, #1811): a reviewed topic photo captioned
// "Illustrative …" stands in for a place with no licensed photo of its own.
// It renders and is credited, so it is not an alarm, but it is counted apart
// from A so the exact-place share stays visible.
// No I/O here; scripts/test-guide-visual-monitor.mjs executes it on fixed HTML.
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1].replace(/&amp;/g, "&") : null; };
const ILLUSTRATIVE = />\s*Illustrative\b[^<]*photo\.?\s*</;
export function parseGuidePicks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<section id="pick-(\d+)"[^>]*>([\s\S]*?)<\/section>/g)) {
    const body = m[2];
    const name = (body.match(/<h2[^>]*>(?:<a[^>]*>)?([^<]+)/) || [])[1] || "?";
    const imgs = [...body.matchAll(/<img\b[^>]*>/g)].map((t) => attr(t[0], "src")).filter((s) => s && !s.startsWith("data:"));
    out.push({ n: Number(m[1]), name: name.trim(), imgs, credited: /Photo:/.test(body), live: /data-guide-live-photo="pending"/.test(body), illustrative: ILLUSTRATIVE.test(body) });
  }
  return out;
}
/** A guide with its own route (e.g. /guides/pintos-farm-miami-2026) has no
 * pick sections; it is checked as ONE recommendation: its photos load and are
 * credited. Returns null when the page does use pick sections. */
export function parseDedicatedGuide(html) {
  if (/<section id="pick-\d+"/.test(String(html))) return null;
  const imgs = [...String(html).matchAll(/<img\b[^>]*>/g)].map((t) => attr(t[0], "src"))
    .filter((s) => s && !s.startsWith("data:") && !/wordmark|logo|\.svg(?:$|\?)/i.test(s));
  return { n: 0, name: "(dedicated guide page)", imgs: imgs.slice(0, 12), credited: /Photo:/.test(String(html)), live: false, illustrative: false };
}
export function parseBlogItems(html) {
  const out = [];
  for (const m of String(html).matchAll(/<section class="list-item"[^>]*>([\s\S]*?)<\/section>/g)) {
    const body = m[1];
    const name = ((body.match(/<h2[^>]*>[\s\S]*?<\/span>([^<]+)/) || [])[1] || "?").trim();
    const imgs = [...body.matchAll(/<img\b[^>]*>/g)].map((t) => attr(t[0], "src")).filter(Boolean);
    out.push({ name, imgs, credited: /Photo:/.test(body), live: /data-live-photo="pending"/.test(body) });
  }
  return out;
}
/** One recommendation -> "A" | "A-context" | "A-live" | "B" | "C" with a reason. */
export function classify({ imgs, credited, live, illustrative, expectPhoto, documented, hasGoogleRef, imgOk }) {
  if (imgs.length) {
    if (!imgOk) return ["B", "image does not load"];
    if (!credited) return ["B", "image shown without its credit"];
    return illustrative ? ["A-context", "labelled topic photo, not the place itself"] : ["A", "renders"];
  }
  if (live) return hasGoogleRef === false ? ["C", "Google has no photo of this place"] : ["A-live", "live credited photo (client)"];
  if (expectPhoto) return ["B", "code has a photo for this pick but the page shows none"];
  return documented ? ["C", "documented exception"] : ["C", "no verified photo source"];
}

