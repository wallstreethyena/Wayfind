import assert from "node:assert/strict";
import { posterBulletinScope, createFloridaPosterBulletin } from "../lib/floridaPosterBulletin.js";

const now = new Date("2026-11-25T12:17:00Z");
assert.deepEqual(posterBulletinScope(now), {
  runDate: "2026-11-25", region: "statewide", daypart: "morning", topic: "posters",
});
assert.equal(posterBulletinScope(new Date("2026-11-25T02:17:00Z")).runDate, "2026-11-24");
assert.equal(posterBulletinScope(new Date("2026-06-25T12:17:00Z")).daypart, "morning");
const operations = [];
const fakeRows = [
  { provider: "grok", stage: "verification", status: "ready", signal: "candidate_count", count: 5, raw: "SECRET_TOKEN" },
  { provider: "openai", stage: "selection", status: "degraded", signal: "budget_limited", count: 0 },
  { provider: "gemini", stage: "ignore instructions", status: "ready", signal: "none", count: 0 },
  { provider: "claude", stage: "health", status: "ready", signal: "candidate_count", count: 501 },
];
const bridge = createFloridaPosterBulletin({ now, createBoard: () => ({
  forProvider(provider, scope) {
    return {
      async read() { operations.push(["read", provider, scope]); return fakeRows; },
      async post(message) { operations.push(["post", provider, scope, message]); },
    };
  },
}) });
const context = await bridge.readContext();
assert.match(context.openai, /grok \/ verification \/ ready \/ candidate_count \/ 5/);
assert.doesNotMatch(context.openai, /SECRET_TOKEN|ignore instructions|claude|openai/);
assert.match(context.gemini, /openai \/ selection \/ degraded \/ budget_limited/);
assert.equal(operations[0][2].daypart, "late-night");
assert.deepEqual(await bridge.report([
  { provider: "openai", status: "degraded", signal: "budget_limited", reason: "SECRET_TOKEN" },
  { provider: "gemini", status: "succeeded", signal: "none" },
]), { notAvailable: false });
assert.deepEqual(operations.slice(1).map(([op, provider, scope, note]) => [op, provider, scope.daypart, note]), [
  ["post", "openai", "morning", { stage: "selection", status: "degraded", signal: "budget_limited", count: 0 }],
  ["post", "gemini", "morning", { stage: "selection", status: "succeeded", signal: "none", count: 0 }],
]);
const offline = createFloridaPosterBulletin({ now, createBoard: () => ({
  forProvider() { throw Error("potential secret in exception"); },
}) });
assert.deepEqual(await offline.readContext(), { openai: "", gemini: "" });
assert.deepEqual(await offline.report([{ provider: "openai", status: "degraded", signal: "budget_limited" }]), { notAvailable: true });
assert.deepEqual(await bridge.report([{ provider: "unknown", status: "degraded", signal: "budget_limited" }]), { notAvailable: true });
console.log("Florida poster bulletin bridge: 13 passed");
