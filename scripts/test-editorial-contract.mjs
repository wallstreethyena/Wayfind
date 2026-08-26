// scripts/test-editorial-contract.mjs — locks the CARD_SUMMARY /
// DETAIL_EDITORIAL contract (v6.87, owner): Anthropic is the writer,
// lib/editorialValidator.js is the editor-in-chief, and no surface may fall
// back to generic filler ("and it holds up", "worth a look", a local
// template) when validation fails or evidence is thin. Good evidence -> show
// sharp copy. Weak evidence -> show nothing.
//
// Node can't `import` these ESM lib/app files directly without Next's
// bundler (no "type": "module" in package.json, matching every other test
// in this suite), so — like scripts/test-blurbs-cache.mjs — this is a
// static-source guard: it locks the invariants by inspecting the file text.
// The validator's actual runtime behavior (accepts the real Max's Table
// example, rejects the collectionHeader.js dangling-fragment bug pattern,
// drops unsupported menu items, strips staff-name sentences, rejects
// wall-of-text length) was hand-verified against lib/editorialValidator.js
// directly before this guard was written.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

const validator = readFileSync(new URL("../lib/editorialValidator.js", import.meta.url), "utf8");

// The exact banned phrases the owner named must survive any future edit.
const REQUIRED_BANNED = ["and it holds up", "worth a look", "a solid choice", "one of the better-reviewed spots", "our #1 pick", "locals love it"];
for (const phrase of REQUIRED_BANNED) ok(validator.includes(`"${phrase}"`), `BANNED_GENERIC_PHRASES lost required entry: "${phrase}"`);

ok(validator.includes("export function validateCardSummary"), "validateCardSummary export gone");
ok(validator.includes("export function validateDetailEditorial"), "validateDetailEditorial export gone");
ok(validator.includes("^known for\\b"), "card_line_1 no longer requires the 'Known for' lead-in");
ok(validator.includes("^best for\\b"), "card_line_2 no longer requires the 'Best for' lead-in");
ok(validator.includes("CARD_HARD_MAX_CHARS = 190"), "the 190-char hard cap drifted");
ok(validator.includes("filterSupportedItems"), "the unsupported-menu-item filter is gone");
ok(validator.includes("stripStaffNameSentences"), "the no-employee-names guard is gone");
ok(validator.includes("DANGLING_OPEN_RX"), "the dangling-fragment guard (the collectionHeader.js bug class) is gone");

// /api/blurbs (CARD_SUMMARY) must run every candidate through the validator
// and must never fall back to a generic template.
const blurbs = readFileSync(new URL("../app/api/blurbs/route.js", import.meta.url), "utf8");
ok(blurbs.includes('import { validateCardSummary } from "../../../lib/editorialValidator"'), "CARD_SUMMARY route lost its validator import");
ok(blurbs.includes("validateCardSummary(candidate, byId.get(p.id))"), "CARD_SUMMARY route no longer validates before caching");
ok(!/rankReason|templateBlurb/.test(blurbs), "a generic rank/template fallback crept into the card-summary route");

// /api/insight (DETAIL_EDITORIAL fields) must validate the "why" paragraph
// and filter what_to_order against actual evidence before caching. v6.9x
// (editorial-quality audit 2026-08-01): the contract actually shipped here —
// compact returns exactly { why_wayfind_picked_this }, full returns exactly
// { what_to_order, pairs_well, caveat }. No other field rides along.
const insight = readFileSync(new URL("../app/api/insight/route.js", import.meta.url), "utf8");
ok(insight.includes("validateWhyParagraph") && insight.includes("filterSupportedItems"), "insight route lost its validator pass");
ok(insight.includes("Never name an individual staff member"), "the no-employee-names prompt rule was removed from /api/insight");
ok(insight.includes("90 to 150 words"), "the why-paragraph target length drifted from the 90-150 word contract");
ok(insight.includes("what_to_order (a JSON array of 3 to 5"), "what_to_order cap drifted from the 3-5 item contract");
ok(insight.includes("why_wayfind_picked_this") && insight.includes("pairs_well") && insight.includes("caveat"), "insight route lost one of the DETAIL_EDITORIAL field names");
// Real code usage only (a `parsed.X` read or a "X (..." prompt-key
// description) — not prose. The file's own header comment recaps the old
// 18-field grab-bag by name for context, which a bare substring match would
// trip on (the same self-referential-regex trap check-no-llm-in-render-path.mjs
// and test-intent-header-clarity.mjs already warn about).
ok(!/parsed\.(mustTry|whyPicked|goodFor|skipIf|bestTime|bestFor|goWhen|oneWord)\b/.test(insight) && !/\b(mustTry|whyPicked|goodFor|skipIf|bestTime|bestFor|goWhen|oneWord)\s*\(/.test(insight), "the old pre-contract insight field names (mustTry/whyPicked/goodFor/skipIf/bestTime/bestFor/goWhen/oneWord) crept back into /api/insight as real code or prompt keys");
ok(insight.includes("insight2|"), "insight route did not bump its cache-key namespace for the new DETAIL_EDITORIAL shape");

// The two card renderers (PlaceCard in home.js, ThingsToDoList's row) must
// no longer show the rank-summary sentence or a generic local template —
// hide the block instead when there's nothing validated to show.
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(!/rankReason\(p, rank\)|templateBlurb\(p\)/.test(home), "PlaceCard's take-priority chain still falls back to rankReason/templateBlurb");
ok(home.includes("aiSummary.card_line_1") && home.includes("aiSummary.card_line_2"), "PlaceCard no longer renders the validated two-line CARD_SUMMARY");

const ttd = readFileSync(new URL("../app/components/ThingsToDoList.js", import.meta.url), "utf8");
ok(!/rankReason\(r, rank\)/.test(ttd), "ThingsToDoList's row still falls back to rankReason");
ok(/aiSummary=\{blurb/.test(ttd) || (ttd.includes("blurb.card_line_1") && ttd.includes("blurb.card_line_2")), "ThingsToDoList no longer hands the validated CARD_SUMMARY to IconicPlaceCard");

console.log(`test-editorial-contract: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
