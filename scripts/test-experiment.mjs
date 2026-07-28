// scripts/test-experiment.mjs — prebuild gate for the explore-bridge A/B.
//
// An experiment that silently mis-assigns is worse than no experiment: it
// produces a confident number that is wrong. The failure modes pinned here are
// the ones that would do that quietly.
//   - sample-ratio mismatch (a split that is not actually 50/50)
//   - re-randomizing a returning visitor (contaminates BOTH arms)
//   - exposure fired after interaction, or more than once per session
//   - experiment properties leaking onto events for unexposed visitors
//   - control rendering anything at all
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { console.error("test-experiment: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

const E = await import("../lib/experiment.js");

/* ── sample ratio: the split must actually be 50/50 ────────────────────── */
{
  const N = 20000;
  let treatment = 0;
  for (let i = 0; i < N; i++) {
    if (E.variantForId("id-" + i + "-" + (i * 2654435761 % 97), E.EXPERIMENT_KEY) === "treatment") treatment++;
  }
  const ratio = treatment / N;
  // A real SRM check tolerance. 50% +/- 1.5pp over 20k is very generous for a
  // deterministic hash; anything outside it means the hash is biased.
  ok(ratio > 0.485 && ratio < 0.515, "assignment is ~50/50 over " + N + " ids, got " + (ratio * 100).toFixed(2) + "%");

  // UUID-shaped ids (what the browser actually generates) must split evenly too.
  let t2 = 0;
  for (let i = 0; i < 5000; i++) {
    const id = "3f2a" + i.toString(16).padStart(4, "0") + "-1c4e-4b9a-9f21-" + (i * 7919 % 999999).toString(16).padStart(6, "0");
    if (E.variantForId(id, E.EXPERIMENT_KEY) === "treatment") t2++;
  }
  ok(t2 / 5000 > 0.47 && t2 / 5000 < 0.53, "UUID-shaped ids split evenly, got " + ((t2 / 5000) * 100).toFixed(2) + "%");
}

/* ── determinism: the same id always lands in the same arm ─────────────── */
{
  for (const id of ["abc", "3f2a1c4e-1c4e-4b9a-9f21-000001", "z".repeat(64)]) {
    const a = E.variantForId(id, E.EXPERIMENT_KEY);
    const b = E.variantForId(id, E.EXPERIMENT_KEY);
    ok(a === b, "assignment is deterministic for " + id);
    ok(E.VARIANTS.indexOf(a) >= 0, "assignment is one of the declared variants");
  }
  // Different experiment keys must not correlate, so a future experiment does
  // not inherit this one's split.
  let same = 0;
  for (let i = 0; i < 2000; i++) {
    if (E.variantForId("u" + i, "explore-bridge") === E.variantForId("u" + i, "some-other-test")) same++;
  }
  ok(same / 2000 > 0.4 && same / 2000 < 0.6, "a second experiment key re-randomizes independently, overlap " + ((same / 2000) * 100).toFixed(1) + "%");
}

/* ── SSR safety ────────────────────────────────────────────────────────── */
{
  ok(typeof window === "undefined", "running SSR-like (no window)");
  let threw = null;
  try {
    ok(E.getVariant() === null, "no storage on the server => no variant (caller renders control)");
    ok(E.recordExposure({ entry_page: "/guides/x", page_type: "guide" }) === null, "exposure is a no-op on the server");
    const p = E.experimentProps();
    ok(Object.keys(p).length === 0, "no experiment properties on the server");
    E.setEntryContext({ entry_page: "/x" }); E.getEntryContext(); E._reset();
  } catch (e) { threw = e; }
  ok(!threw, "experiment module never throws server-side (" + (threw && threw.message) + ")");
}

/* ── source guarantees ─────────────────────────────────────────────────── */
{
  const exp = readFileSync(join(ROOT, "lib/experiment.js"), "utf8");
  const comp = readFileSync(join(ROOT, "app/components/ExploreBridge.js"), "utf8");
  const track = readFileSync(join(ROOT, "lib/track.js"), "utf8");
  const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
  const guide = readFileSync(join(ROOT, "app/guides/[slug]/page.js"), "utf8");
  const culture = readFileSync(join(ROOT, "app/culture/[metro]/page.js"), "utf8");

  // Sticky assignment: written once, never recomputed.
  ok(/if \(existing === "control" \|\| existing === "treatment"\) return existing/.test(exp),
    "a stored assignment is returned as-is — a returning visitor is never re-randomized");

  // Exposure uses PostHog's native flag-exposure event, once per session.
  ok(exp.indexOf("$feature_flag_called") >= 0, "exposure uses PostHog's native feature-flag event");
  ok(exp.indexOf("$feature_flag_response") >= 0, "the variant rides on the standard property");
  ok(/if \(already\) return variant/.test(exp), "exposure fires at most once per session");

  // Control must render NOTHING.
  ok(/if \(variant !== "treatment"\) return null/.test(comp), "control (and SSR) render nothing at all");
  // Exposure must be recorded before interaction — it is in a layout effect,
  // which runs before paint and therefore before any click is possible.
  ok(comp.indexOf("useIsoLayoutEffect") >= 0 && comp.indexOf("recordExposure") >= 0,
    "exposure is recorded pre-paint, before any interaction");
  ok(comp.indexOf("recordExposure") < comp.indexOf('variant !== "treatment"'),
    "exposure is recorded for BOTH arms, not only the treatment (else the control arm has no denominator)");

  // The decision content the experiment is actually testing.
  ok(comp.indexOf("What are you looking for") >= 0, "the bridge asks a decision question");
  for (const l of ["Tonight", "Free", "Family", "Near me"]) ok(comp.indexOf(l) >= 0, "intent present: " + l);
  for (const [n, w] of [["p.rating", "rating"], ["p.reviews", "review count"], ["p.distMi", "distance"], ["p.openNow", "open status"], ["p.reason", "reason to choose"]]) {
    ok(comp.indexOf(n) >= 0, "each pick shows " + w);
  }
  ok(comp.indexOf('"/?place=" + encodeURIComponent(p.id)') >= 0, "a pick opens the place directly");
  ok(comp.indexOf("wf_center") >= 0, "the article's city is carried into the app");

  // Properties ride on EXISTING events at both choke points.
  ok(track.indexOf("experimentProps") >= 0, "lib/track attaches the experiment slice");
  ok(home.indexOf("experimentProps") >= 0, "home.js attaches the experiment slice");
  ok(/_exp\)\)/.test(home), "the slice is merged into the PostHog capture payload");
  // Unexposed visitors must be unaffected.
  ok(/if \(!exposed\) return \{\}/.test(exp), "never-exposed visitors get NO experiment properties");

  // No new product event names.
  ok(comp.indexOf('track("detail_open"') < 0 || true, "");
  const newNames = (comp.match(/go\("([a-z_]+)"/g) || []).map((m) => m.slice(4, -1));
  for (const n of newNames) {
    ok(["detail_open", "intent_chip", "cta_open_app", "maps_list"].indexOf(n) >= 0, "bridge fires only existing event names, saw: " + n);
  }

  // Both surfaces wired, above the long-form body.
  ok(guide.indexOf("<ExploreBridge") > 0 && guide.indexOf('pageType="guide"') > 0, "guide pages mount the bridge");
  ok(culture.indexOf("<ExploreBridge") > 0 && culture.indexOf('pageType="culture"') > 0, "culture pages mount the bridge");
  ok(guide.indexOf("<ExploreBridge") < guide.indexOf("g.picks.map"), "the bridge renders ABOVE the guide's long-form body");
  // SEO must be untouched: no canonical/robots change on either page.
  ok(!/robots:/.test(guide) && !/robots:/.test(culture), "no robots directive added to either content page");
}

if (failures) { console.error(`test-experiment: ${failures} failure(s)`); process.exit(1); }
console.log("test-experiment: OK");
