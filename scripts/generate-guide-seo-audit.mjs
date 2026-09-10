import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGuideSeoAudit } from "./guide-seo-audit-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, "../docs/seo/guide-seo-audit-2026-09-10.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(buildGuideSeoAudit(), null, 2) + "\n");
console.log(`wrote ${output}`);
