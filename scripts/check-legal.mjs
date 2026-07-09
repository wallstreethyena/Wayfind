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
console.log("check-legal: OK — real contact, real entity, no template text");
