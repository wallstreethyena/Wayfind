// Portrait photos must show whole (contain over a blurred fill), landscape stays cover.
// Calls the real helper, then checks each gallery surface renders PortraitAwareImg.
import { readFileSync } from "node:fs";
import { isPortrait } from "../lib/portraitPhoto.js";

const fails = [];
const expect = (label, got, want) => { if (got !== want) fails.push(`${label}: got ${got}, want ${want}`); };
expect("isPortrait(1280,853) landscape", isPortrait(1280, 853), false);
expect("isPortrait(853,1280) portrait", isPortrait(853, 1280), true);
expect("isPortrait(1000,1040) near-square", isPortrait(1000, 1040), false);
expect("isPortrait(0,0) unknown", isPortrait(0, 0), false);
expect("isPortrait(undefined,500)", isPortrait(undefined, 500), false);

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const src = (f) => strip(readFileSync(new URL("../" + f, import.meta.url), "utf8"));

const comp = src("app/components/PortraitAwareImg.js");
if (!/import\s*\{\s*isPortrait\s*\}\s*from\s*"\.\.\/\.\.\/lib\/portraitPhoto\.js"/.test(comp)) fails.push("PortraitAwareImg must import isPortrait from lib/portraitPhoto.js");
if (!/isPortrait\(\s*el\.naturalWidth\s*,\s*el\.naturalHeight\s*\)/.test(comp)) fails.push("PortraitAwareImg must call isPortrait(naturalWidth, naturalHeight)");
if (!/objectFit:\s*"contain"/.test(comp)) fails.push("PortraitAwareImg must render the portrait photo with objectFit contain");
if (!/blur\(18px\)\s*brightness\(\.55\)/.test(comp) || !/scale\(1\.15\)/.test(comp)) fails.push("PortraitAwareImg backdrop must be blur(18px) brightness(.55) scale(1.15)");
if (!/aria-hidden="true"/.test(comp) || !/alt=""/.test(comp)) fails.push("PortraitAwareImg backdrop must be aria-hidden with alt=\"\"");
if (!/export default function PortraitAwareImg\b/.test(comp)) fails.push("PortraitAwareImg default export missing");

const imp = /import\s+PortraitAwareImg\s+from\s+"[^"]*PortraitAwareImg(?:\.js)?"/;
const surfaces = [
  ["app/components/EventPlacePhoto.js", /<PortraitAwareImg[\s/>]/g, 1],
  ["app/components/PlaceDetailPhotoHeader.js", /<PortraitAwareImg[\s/>]/g, 2],
  ["app/home.js", /<PortraitAwareImg[\s/>]/g, 1],
];
for (const [f, rx, n] of surfaces) {
  const s = src(f);
  if (!imp.test(s)) fails.push(`${f} must import PortraitAwareImg`);
  const got = (s.match(rx) || []).length;
  if (got !== n) fails.push(`${f}: <PortraitAwareImg> rendered ${got} times, want ${n}`);
}
const home = src("app/home.js");
if (!/function FallbackImg\([^)]*\bportraitFit\b/.test(home)) fails.push("FallbackImg must take an opt-in portraitFit prop");
if (!/\{portraitFit\s*\?\s*<PortraitAwareImg/.test(home)) fails.push("FallbackImg must switch on portraitFit");
const detail = src("app/components/sheets/Detail.js");
if (!/<FallbackImg\s+portraitFit\s+defer=\{i >= 2\}/.test(detail)) fails.push("Detail gallery FallbackImg must pass portraitFit");
if ((detail.match(/portraitFit/g) || []).length !== 1) fails.push("portraitFit must be used only by the Detail gallery slide");

if (fails.length) { console.error("check-portrait-photo-fit FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("check-portrait-photo-fit OK: helper thresholds called (5 cases); 3 surfaces + FallbackImg opt-in verified (comments stripped)");
