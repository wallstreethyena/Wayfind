// Guardrail: legal pages carry no template placeholders and name the real
// entity and contact.
import { readFileSync } from "fs";
const fail = (m) => { console.error("check-legal: FAIL — " + m); process.exit(1); };
for (const f of ["../app/terms/page.js", "../app/privacy/page.js"]) {
  const s = readFileSync(new URL(f, import.meta.url), "utf8");
  if (/example\.com|your-email|\bTODO\b|general template/i.test(s)) fail(f + " contains placeholder/template text");
}
const t = readFileSync(new URL("../app/terms/page.js", import.meta.url), "utf8");
if (!t.includes('hello@gowayfind.com')) fail("terms missing real contact email");
if (!t.includes("WAYFIND LLC")) fail("terms missing legal entity");

// v6.55 (owner): "we are definitely going to sell the data in the future...
// just don't [do it] in the legal terms in a legal language that we are
// required to disclose." The privacy page is the ONE place a data-sale
// possibility may be mentioned, and it must be done in real legal/regulatory
// language, honestly reserving the right rather than promising it will never
// happen — casual UI copy (the taste panel, the consent card) must never
// make that promise at all, since it would then contradict this disclosure.
const priv = readFileSync(new URL("../app/privacy/page.js", import.meta.url), "utf8");
if (!/Sale or sharing of personal information/.test(priv)) fail("privacy page is missing the data-sale/sharing disclosure section");
if (!/CCPA\/CPRA|CCPA|CPRA/.test(priv)) fail("the data-sale disclosure must use real legal/regulatory terms (CCPA/CPRA), not dumbed-down language");
if (/we do not sell (it|location data)|never sold|never sells your data/i.test(priv)) fail("privacy page still makes a blanket 'never sell' promise the owner explicitly retracted");

console.log("check-legal: OK — real contact, real entity, no template text, honest data-sale disclosure in legal language");
