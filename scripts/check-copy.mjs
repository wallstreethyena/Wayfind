// Guardrail: banned algorithm-speak in user-facing copy. The pickReason
// generator once shipped phrases like "easy add to the plan" and "review
// strength"; this gate makes that class of copy a build failure forever.
import { readFileSync } from "fs";
const s = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const BANNED = [
  "easy add to the plan",
  "rated near the top",
  "review strength",
  "the play here",
  "Pick it for ",
  "Not for you if ",
  "already know exactly what you want",
  "review volume most picks",
  "hidden gem because",
  "crowd favorite because",
  "a safe nearby pick",
];
const hits = BANNED.filter((p) => s.toLowerCase().includes(p.toLowerCase()));
if (hits.length) { console.error("check-copy: FAIL — banned phrases present: " + hits.join(" | ")); process.exit(1); }
console.log("check-copy: OK — no algorithm-speak in user-facing copy (" + BANNED.length + " banned phrases enforced)");
