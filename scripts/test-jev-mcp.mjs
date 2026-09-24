// Hermetic regression lock for the Wayfind Jev MCP integration.
// No network, no Supabase, no TypeSafe spend.
import { readFileSync } from "node:fs";
import {
  TYPESAFE_SYSTEMONE_URL,
  buildCheckRequest,
  buildClassifyRequest,
  buildScoreRequest,
  callTypeSafe,
  runChecks,
  runClassification,
  runScore,
} from "../supabase/functions/wayfind-jev-mcp/jevCore.js";

let assertions = 0;
let failures = 0;
function ok(condition, message) {
  assertions += 1;
  if (!condition) {
    failures += 1;
    console.error("test-jev-mcp: FAIL — " + message);
  }
}
function eq(actual, expected, message) {
  ok(Object.is(actual, expected), `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

const root = new URL("..", import.meta.url);
const edge = readFileSync(new URL("supabase/functions/wayfind-jev-mcp/index.ts", root), "utf8");
const consent = readFileSync(new URL("app/oauth/consent/OAuthConsentClient.js", root), "utf8");
const consentPage = readFileSync(new URL("app/oauth/consent/page.js", root), "utf8");
const docs = readFileSync(new URL("docs/jev-mcp.md", root), "utf8");

// Structural security locks.
ok(edge.includes("withOAuthProtectedResource("), "OAuth protected-resource discovery wraps the MCP server");
ok(edge.includes("withSupabase({ auth: 'user' }"), "Supabase OAuth user verification gates the MCP tools");
ok(edge.indexOf("withOAuthProtectedResource(") < edge.indexOf("withSupabase({ auth: 'user' }"), "OAuth discovery is outside the auth gate");
ok(edge.includes("JEV_MCP_OWNER_USER_ID"), "owner allowlist is required");
ok(edge.includes("userData.user.id !== ownerId"), "non-owner users are refused");
ok(edge.includes("TYPESAFE_API_KEY"), "TypeSafe key is server-side only");
ok(!edge.includes("SUPABASE_SERVICE_ROLE_KEY"), "MCP server never uses the Supabase service-role key");
ok(!edge.includes("app/home"), "MCP server is not wired into the homepage/ranking path");
ok(consent.includes("getAuthorizationDetails"), "consent screen loads the OAuth request from Supabase");
ok(consent.includes("approveAuthorization"), "consent screen can explicitly approve");
ok(consent.includes("denyAuthorization"), "consent screen can explicitly deny");
ok(consentPage.includes('robots: { index: false, follow: false }'), "consent route is not indexed");
ok(docs.includes("verify_jwt=false"), "deployment note locks the OAuth discovery requirement");

// Request builders exactly follow TypeSafe SystemOne's named-question shape.
{
  const body = buildCheckRequest({ state: "A venue has live music tonight.", propositions: ["It fits Night Out", "It is a beach"] }, "jev-test");
  eq(body.model, "jev-test", "check model override is preserved");
  eq(Object.keys(body.questions).length, 2, "checks bundle into one SystemOne request");
  eq(body.questions.check_1.type, "noul", "check question uses noul");
}
{
  const body = buildClassifyRequest({
    state: "Open until 2am, DJ, dance floor.",
    instructions: "Choose the best rail.",
    labels: [{ label: "nightlife", description: "Late-night bar or club" }, { label: "dinner", description: "Dinner-first restaurant" }],
  }, "jev-test");
  eq(body.questions.classification.type, "choice", "classification uses choice");
  eq(body.questions.classification.criteria.nightlife, "Late-night bar or club", "classification preserves label description");
}
{
  const body = buildScoreRequest({ state: "Evidence bundle", instructions: "Rate support.", levels: ["weak", "mixed", "strong"] }, "jev-test");
  eq(body.questions.score.type, "score", "rubric uses score");
  eq(body.questions.score.criteria.length, 3, "rubric levels are preserved");
}

// Missing key fails closed and makes no request.
{
  let calls = 0;
  try {
    await callTypeSafe({ state: "x", questions: { q: { type: "noul" } }, model: "jev-test" }, {
      apiKey: "",
      fetchImpl: async () => { calls += 1; throw new Error("must not run"); },
    });
    ok(false, "missing TypeSafe key should throw");
  } catch (error) {
    eq(error.code, "typesafe_unconfigured", "missing key has explicit error code");
    eq(calls, 0, "missing key makes zero upstream calls");
  }
}

// One request, fixed host, auth header present upstream but never returned to caller.
{
  const calls = [];
  const result = await runChecks({ state: "Known state", propositions: ["Supported"] }, {
    apiKey: "secret-test-key",
    model: "jev-test",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        model: "jev-test",
        answers: { check_1: { type: "noul", noul: 0.91 } },
        usage: { input_tokens: 10, output_tokens: 2 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  eq(calls.length, 1, "one Jev tool call makes exactly one TypeSafe request");
  eq(calls[0].url, TYPESAFE_SYSTEMONE_URL, "TypeSafe host is fixed");
  eq(calls[0].init.method, "POST", "TypeSafe call is POST");
  eq(calls[0].init.headers.Authorization, "Bearer secret-test-key", "server sends bearer key upstream");
  eq(result.results[0].probability, 0.91, "check probability is returned");
  ok(!JSON.stringify(result).includes("secret-test-key"), "TypeSafe key is never returned in result");
}

// Choice and score parsing.
{
  const classify = await runClassification({
    state: "DJ until 2am",
    instructions: "Choose a rail",
    labels: [{ label: "nightlife" }, { label: "dinner" }],
  }, {
    apiKey: "k",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "jev-test",
      answers: { classification: { type: "choice", choice: "nightlife", confidence: 0.84, probabilities: { nightlife: 0.84, dinner: 0.16 } } },
      usage: { input_tokens: 8, output_tokens: 3 },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  eq(classify.choice, "nightlife", "choice answer is parsed");

  const score = await runScore({ state: "Evidence", instructions: "Rate quality", levels: ["low", "medium", "high"] }, {
    apiKey: "k",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "jev-test",
      answers: { score: { type: "score", score: 1.7, confidence: 0.77, legend: { 0: "low", 1: "medium", 2: "high" }, probabilities: { 0: 0.05, 1: 0.2, 2: 0.75 } } },
      usage: { input_tokens: 9, output_tokens: 4 },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  eq(score.score, 1.7, "score answer is parsed");
}

// Upstream errors are sanitized and are NOT retried.
{
  let calls = 0;
  try {
    await callTypeSafe({ state: "x", questions: { q: { type: "noul" } }, model: "jev-test" }, {
      apiKey: "top-secret",
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: "sensitive upstream body top-secret" }), { status: 500, headers: { "content-type": "application/json" } });
      },
    });
    ok(false, "HTTP 500 should throw");
  } catch (error) {
    eq(calls, 1, "HTTP failure is not retried");
    eq(error.code, "typesafe_http_500", "HTTP failure has bounded error code");
    ok(!String(error.message).includes("sensitive upstream body"), "upstream body is not leaked");
    ok(!String(error.message).includes("top-secret"), "secret is not leaked in error");
  }
}

// Invalid/oversized input dies before transport.
{
  let calls = 0;
  try {
    await runChecks({ state: "x".repeat(12001), propositions: ["p"] }, {
      apiKey: "k",
      fetchImpl: async () => { calls += 1; throw new Error("must not run"); },
    });
    ok(false, "oversized state should throw");
  } catch (error) {
    eq(error.code, "invalid_input", "oversized state is invalid_input");
    eq(calls, 0, "oversized input spends nothing");
  }
}

if (failures) {
  console.error(`test-jev-mcp: ${failures}/${assertions} assertions failed`);
  process.exit(1);
}
console.log(`test-jev-mcp: PASS (${assertions} assertions)`);
