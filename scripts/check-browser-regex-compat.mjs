// A modern Node build accepts lookbehind that crashes Safari 15 at load time.
// Check every client entry and transitive local import, including lazy chunks.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import { incompatibleRegexes, scanClientRegexes } from "./lib/browserRegexCompatibility.mjs";
import { CAT_ALLOW, placeAllowed } from "../lib/placeFilter.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const bad = [
  'const bad = /(?<!and[_ ])breakfast/i;',
  'const bad = /(?<=a)b/;',
  'const bad = new RegExp("(?<!and[_ ])breakfast", "i");',
  'const bad = RegExp(`(?<=a)b`);',
];
for (const source of bad) assert.equal(incompatibleRegexes(source).length, 1, `must reject executable lookbehind: ${source}`);
for (const source of ['// /(?<=a)b/\nconst good = /a(?=b)/;', 'const good = /[()?!<=]/;', 'const good = /\\(?<=a/;', 'const prose = "(?<=a)b";', 'const good = new RegExp("a(?=b)");']) assert.equal(incompatibleRegexes(source).length, 0, `safe regex/comments/prose: ${source}`);

// Test-only original predicate, constructed at runtime on modern Node. Never
// imported by the product. Prove exact .test() parity, including nonword and
// newline prefixes, mixed casing, multiple breakfast tokens, and lodging.
const source = CAT_ALLOW.food.source;
const compatible = String.raw`(?:^[\s\S]{0,3}|(?!and[_ ])[\s\S]{4})breakfast`;
assert.ok(source.includes(compatible), "exercise the actual fixed breakfast branch");
const original = new RegExp(source.replace(compatible, "(?<!and[_ ])breakfast"), CAT_ALLOW.food.flags);
const prefixes = ["", "a", "an", "and", "and ", "and_", "AND ", "bed and ", "bed_and_", "bed&", "x\n", "\n\n\n\n", " and\n", "a_nd_", "abcd", "and and "];
let compared = 0;
for (const prefix of prefixes) for (const suffix of ["breakfast", "BREAKFAST", "breakfast_restaurant", "breakfast breakfast", "breakfast and_breakfast", "breakfast cafe", "breakfast lodging"]) {
  const value = prefix + suffix;
  assert.equal(CAT_ALLOW.food.test(value), original.test(value), `food eligibility changed: ${JSON.stringify(value)}`);
  compared++;
}
assert.equal(placeAllowed("food", "all", { name: "Southern Comfort Bed and Breakfast", types: ["lodging", "bed_and_breakfast"] }), false);
assert.equal(placeAllowed("food", "all", { name: "Keke's Breakfast Cafe", primaryType: "breakfast_restaurant", types: ["breakfast_restaurant", "cafe"] }), true);
// Execute the real editorial splitter and public validator; punctuation and
// privacy filtering must retain the pre-fix behavior across whitespace shapes.
const editorialSource = readFileSync(path.join(root, "lib/editorialValidator.js"), "utf8");
const editorial = await import(`data:text/javascript;base64,${Buffer.from(editorialSource + "\nexport { editorialSentences as testSentences };\n").toString("base64")}`);
const oldSplit = new RegExp("(?<=[.!?])\\s+");
for (const text of ["", "No punctuation", "First. Next! Last?", "First.\n\tNext.  ", "Leading?\n\nTrailing!", "\nHello...\r\nNext", "A ! B ? C . D"]) {
  assert.deepEqual(editorial.testSentences(text), text.split(oldSplit), `sentence boundaries changed: ${JSON.stringify(text)}`);
}
const safe = "The bakery fills its counter with fresh pastries and warm bread from the kitchen.";
for (const text of [`Server Julia was helpful. ${safe}`, `One reviewer loved it! ${safe}`, `${safe} Server Julia was helpful.`, `${safe}\n\nOne reviewer loved it!`]) {
  const result = editorial.validateWhyParagraph(text, {}, { minWords: 1, maxWords: 200 });
  assert.ok(result.ok && result.text === safe, "editorial still strips named-staff and reviewer anecdotes without dropping the usable sentence");
}
const graph = scanClientRegexes(root);
assert.ok(graph.files.size > 100, `real client graph must be scanned (${graph.files.size})`);
assert.ok(graph.files.has(path.join(root, "lib/placeFilter.js")), "the failing shared module must be in the client graph");
assert.equal(graph.issues.length, 0, JSON.stringify(graph.issues));
// Red proof: the scanner must flag the actual incident when restored to the
// exact real module, not merely a comment containing its spelling.
const fixedSource = readFileSync(path.join(root, "lib/placeFilter.js"), "utf8");
assert.equal(incompatibleRegexes(fixedSource.replace(compatible, "(?<!and[_ ])breakfast"), "lib/placeFilter.js").length, 1);
console.log(`check-browser-regex-compat: OK — ${graph.roots} client roots / ${graph.files.size} modules, ${compared} food-filter parity cases, literal/constructor controls and original-incident red proof`);
