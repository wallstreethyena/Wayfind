// The Fall rail cache epoch, read the way CLAUDE.md asks guards to read code:
// comments stripped, anchored on the ONE `const key = `fall-intents:vN:${today}`
// declaration. A malformed, missing, duplicated or comment-only key yields NaN,
// so every `>= N` epoch check fails closed instead of matching prose.
export function fallIntentsEpoch(source) {
  const code = String(source || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const keys = [...code.matchAll(/const\s+key\s*=\s*`fall-intents:v(\d+):\$\{today\}/g)];
  if (keys.length !== 1) return NaN;
  const value = Number(keys[0][1]);
  return Number.isSafeInteger(value) && !/^0\d/.test(keys[0][1]) ? value : NaN;
}
