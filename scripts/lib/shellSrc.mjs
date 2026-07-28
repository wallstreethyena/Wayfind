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
  // Wave 1 of the same decomposition: the homepage's ~520 lines of
  // server-rendered CSS (WF_LAYOUT_CSS / WF_SEARCH_CSS / WF_PLACE_CARD_CSS /
  // WF_TASTE_CSS + WF_DESKTOP_BP). It is pure extracted shell content — home.js
  // still concatenates all four into the one inline <style> tag — so it belongs
  // in the grep set exactly like kit.js. Without this line every guardrail that
  // looks for a .wf-* class or a media query would go quietly blind.
  if (existsSync(new URL("app/components/css.js", root))) files.push("app/components/css.js");
  // Wave 2 of the same decomposition: the owner's first-party curation DATA
  // (BEST_OF_NAMES / LOCAL_FAVE_EXTRA, WAYFIND_PHOTOS, WAYFIND_NOTES,
  // WAYFIND_FEATURED, CURATED_NOTES). home.js still imports and uses all of it,
  // and every predicate that reads it stayed behind in home.js, so this is pure
  // extracted shell content — same case as css.js above. Drop this line and any
  // guardrail that greps the shell for a curated place name or an editorial note
  // stops seeing it, and passes while asserting nothing.
  if (existsSync(new URL("app/components/curatedData.js", root))) files.push("app/components/curatedData.js");
  // NOTE: app/components/BookingCTA.js is deliberately NOT in this set. The
  // booking CTA was extracted there so check-booking-cta.mjs can assert the raw
  // construction (Aff.ticketsUrl / experienceGoUrl) lives ONLY in that component
  // and never leaks back into the shell — i.e. shellSrc means "the shell EXCEPT
  // the sanctioned CTA." Checks that need BookingCTA's own code (check-ux's
  // reservation-capture assertions) must read that file directly, not via here.
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
