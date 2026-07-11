// Moment/experience picks integrity — Phase 2/4 e2e (audit:regression).
// The /api/moment/picks contract must be LOUD: malformed or unknown-intent
// input returns 400 (never 200 {picks:[]}), and a well-formed request with too
// few candidates returns a 200 reason envelope — so a silent empty can never
// masquerade as "nothing nearby" again. (The chip-vs-modal identical-results
// invariant needs live Google place data, which the placeholder-key build
// lacks — same documented constraint as deeplinks/favorites-auth — so it is
// enforced by the shared resolver config + these contract tests rather than a
// live data comparison.)
const { test, expect } = require("@playwright/test");

async function post(request, body) {
  return request.post("/api/moment/picks", { data: body, headers: { "Content-Type": "application/json" } });
}

test("empty body is a 400 contract error, not 200 {picks:[]}", async ({ request }) => {
  const r = await post(request, {});
  expect(r.status()).toBe(400);
  const j = await r.json();
  expect(j.error).toBe("missing_intent");
});

test("an unknown/drifted intent id is a 400 (the cozy-indoor-day vs cozyindoor bug)", async ({ request }) => {
  const r = await post(request, { intent: "cozy-indoor-day", candidates: [] });
  expect(r.status()).toBe(400);
  const j = await r.json();
  expect(j.error).toBe("unknown_intent");
  expect(j.detail).toBe("cozy-indoor-day");
});

test("candidates not an array is a 400", async ({ request }) => {
  const r = await post(request, { intent: "cozyindoor", candidates: "nope" });
  expect(r.status()).toBe(400);
  expect((await r.json()).error).toBe("candidates_not_array");
});

test("a valid intent with too few candidates is a 200 reason envelope, not a bare empty", async ({ request }) => {
  const r = await post(request, { intent: "cozyindoor", candidates: [{ id: "a", name: "One" }] });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(Array.isArray(j.picks)).toBe(true);
  expect(j.picks.length).toBe(0);
  expect(j.reason).toBe("too_few_candidates");
  expect(j.candidatesReceived).toBe(1);
});
