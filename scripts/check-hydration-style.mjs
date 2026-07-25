// scripts/check-hydration-style.mjs — inline <style> tags must NEVER render CSS
// as a JSX text child. React SSR escapes quotes in text (&quot;) but <style> is
// a raw-text element where entities are NOT decoded — so any quote inside the
// CSS makes the server DOM differ from the client render, hydration fails, and
// React tears down interactivity SITE-WIDE (2026-07-25 outage: the search
// button, map, and radius all "did nothing" from one content:"" in a style
// string). The rule: every inline style tag uses dangerouslySetInnerHTML.
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx)$/.test(e)) out.push(p);
  }
  return out;
}

let fail = 0;
for (const f of walk(join(ROOT, "app"))) {
  const src = readFileSync(f, "utf8");
  let idx = src.indexOf("<style>{");
  while (idx !== -1) {
    fail++;
    const line = src.slice(0, idx).split("\n").length;
    console.error(`check-hydration-style: FAIL — ${f.slice(ROOT.length + 1)}:${line} renders <style> CSS as a JSX text child. Use <style dangerouslySetInnerHTML={{ __html: css }} /> — a quote in the text child breaks hydration and kills ALL interactivity.`);
    idx = src.indexOf("<style>{", idx + 1);
  }
}

if (fail) process.exit(1);
console.log("check-hydration-style: OK — every inline <style> uses dangerouslySetInnerHTML (no raw-text hydration traps)");
