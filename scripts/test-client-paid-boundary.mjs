// Paid provider data must never be reachable directly from browser modules.
// STRUCTURAL-ONLY: this is a repository-wide TypeScript AST boundary scan; no single runtime import can prove that all client modules exclude provider endpoints and public credentials.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = new URL("..", import.meta.url).pathname;
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (/\.(js|jsx|ts|tsx)$/.test(name)) files.push(path);
  }
}
walk(join(root, "app"));
walk(join(root, "lib"));

const client = files.filter((path) => /^\s*["']use client["'];/m.test(readFileSync(path, "utf8")));
const forbidden = [
  /@googlemaps\/js-api-loader/,
  /NEXT_PUBLIC_GOOGLE_MAPS_KEY/,
  /places\.googleapis\.com/,
  /maps\.googleapis\.com\/maps\/api/,
  /api\.anthropic\.com/,
  /api\.viator\.com/,
  /api\.foursquare\.com|places-api\.foursquare\.com/,
  /terra\.tripadvisor\.com/,
  /googleapis\.com\/youtube\/v3/,
  /api\.pexels\.com/,
];
const failures = [];
for (const path of client) {
  const source = readFileSync(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true,
    /\.tsx?$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
  const strings = [];
  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) strings.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const executableStrings = strings.join("\n");
  for (const pattern of forbidden) {
    if (pattern.test(executableStrings) || (pattern.source === "NEXT_PUBLIC_GOOGLE_MAPS_KEY" && pattern.test(source))) {
      failures.push(`${relative(root, path)} matches ${pattern}`);
    }
  }
}
const pkg = readFileSync(join(root, "package.json"), "utf8");
if (/@googlemaps\/js-api-loader/.test(pkg)) failures.push("package.json still ships the browser Google SDK loader");
const home = readFileSync(join(root, "app/home.js"), "utf8");
if (/fetchSuggestionsDirect|resolvePlaceDetailsDirect|importLibrary\("places"\)/.test(home)) failures.push("home.js still contains a direct paid Places fallback");

if (failures.length) {
  for (const failure of failures) console.error("test-client-paid-boundary: FAIL — " + failure);
  process.exit(1);
}
console.log(`test-client-paid-boundary: OK — ${client.length} client modules contain no paid-provider endpoints, public Google key, or browser Places SDK`);
