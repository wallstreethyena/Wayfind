// The "home shell" source (July 2026 decomposition, G0). app/home.js plus
// everything extracted out of it — the shared kit and the dynamically loaded
// screens/sheets. The content guardrails (check-cards/copy/cta/ux/moment/auth/
// meals/lodging/radius) grep this concatenation instead of home.js alone, so
// moving code between shell files never breaks a contract while removing code
// from the shell entirely still fails loudly. check-version/canon/seo/gate
// stay pinned to app/home.js on purpose: BUILD_ID, CANON_ORIGIN, the loader
// copy, and the data-fetch wiring must not migrate out of the shell root.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);

export function shellFiles() {
  const files = ["app/home.js"];
  if (existsSync(new URL("app/components/kit.js", root))) files.push("app/components/kit.js");
  for (const dir of ["app/components/screens", "app/components/sheets"]) {
    const abs = new URL(dir + "/", root);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(fileURLToPath(abs)).sort()) if (f.endsWith(".js")) files.push(dir + "/" + f);
  }
  return files;
}

export function shellSrc() {
  return shellFiles().map((f) => readFileSync(new URL(f, root), "utf8")).join("\n");
}
