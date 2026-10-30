// Safari 15 accepts lookahead but cannot compile lookbehind, even in a
// RegExp constructor. Check literal patterns, not comments/prose. Dynamic
// runtime-built patterns are outside this static check.
import ts from "typescript";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export function hasLookbehind(pattern) {
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (!inClass && (pattern.slice(i, i + 4) === "(?<=" || pattern.slice(i, i + 4) === "(?<!")) return true;
  }
  return false;
}

export function incompatibleRegexes(source, filename = "module.js") {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, /\.tsx?$/.test(filename) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
  const issues = [];
  const visit = (node) => {
    let pattern = null;
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const text = node.getText(ast);
      pattern = text.slice(1, text.lastIndexOf("/"));
    } else if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && node.arguments?.length) {
      const callee = node.expression;
      const regexp = ts.isIdentifier(callee) && callee.text === "RegExp"
        || ts.isPropertyAccessExpression(callee) && callee.name.text === "RegExp";
      const arg = node.arguments[0];
      if (regexp) {
        if (ts.isStringLiteralLike(arg)) pattern = arg.text;
      }
    }
    if (pattern != null && hasLookbehind(pattern)) issues.push({ file: filename, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, pattern });
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return issues;
}

const EXTS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
export function codeFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...codeFiles(p));
    else if (EXTS.includes(path.extname(p))) files.push(p);
  }
  return files;
}

export function scanClientRegexes(root) {
  const files = ["app", "lib"].flatMap((dir) => codeFiles(path.join(root, dir)));
  const records = new Map();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const info = ts.preProcessFile(source, true, true);
    const client = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|\s)*["']use client["']/.test(source);
    records.set(file, { source, client, specs: info.importedFiles.map((i) => i.fileName) });
  }
  const roots = [...records].filter(([, r]) => r.client).map(([f]) => f);
  if (!roots.length) throw new Error("No client roots found; nothing verified");
  const seen = new Set(), pending = [...roots], issues = [];
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const r = records.get(file);
    if (!r) continue;
    issues.push(...incompatibleRegexes(r.source, path.relative(root, file)));
    for (const spec of r.specs) {
      if (!spec.startsWith(".")) continue; // Bundled dependencies are checked after build.
      const base = path.resolve(path.dirname(file), spec);
      const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, "index" + e))];
      const resolved = candidates.find((f) => existsSync(f) && statSync(f).isFile());
      if (!resolved) {
        if (/\.(css|json|svg|png|jpe?g|webp)$/.test(spec)) continue;
        throw new Error(`Unresolved client import ${spec} from ${path.relative(root, file)}`);
      }
      if (records.has(resolved)) pending.push(resolved);
    }
  }
  return { roots: roots.length, files: seen, issues };
}

export function scanBuiltRegexes(directory) {
  const files = codeFiles(directory);
  if (!files.length) throw new Error("No built browser JavaScript found; nothing verified");
  const issues = files.flatMap((file) => incompatibleRegexes(readFileSync(file, "utf8"), file));
  return { files: files.length, issues };
}
