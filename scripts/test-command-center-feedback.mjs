// Command Center feedback inbox lock. Pure node, no network.
// Proves the owner panel receives a bounded, deliberately narrow read model
// and that untrusted saved text stays ordinary rendered text.

import { readFileSync } from "node:fs";
import { feedbackInbox } from "../lib/commandCenter/sources/firstParty.js";

let failures = 0;
const fail = (m) => { console.error("test-command-center-feedback: FAIL — " + m); failures++; };
const ok = (condition, message) => { if (!condition) fail(message); };

const env = {
  SUPABASE_URL: "https://feedback-fixture.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role-key",
};

let request;
const fixtureFetch = async (url, init) => {
  request = { url, init };
  return {
    ok: true,
    json: async () => [
      {
        message: "Place recommendation: Harbor Cafe\\n\\nAdd outdoor seating notes.",
        sentiment: "up",
        path: "/explore",
        place: "Harbor Cafe",
        created_at: "2026-09-19T12:00:00.000Z",
        handled: false,
        id: "must-not-return",
        user_id: "must-not-return",
        ua: "must-not-return",
        loc_name: "must-not-return",
        build: "must-not-return",
      },
      {
        message: "<img src=x onerror=alert(1)>",
        sentiment: "down",
        path: "/map",
        place: "",
        created_at: "2026-09-19T11:00:00.000Z",
        handled: true,
      },
    ],
  };
};

const report = await feedbackInbox(47, { env, fetchImpl: fixtureFetch });
ok(report.source.connected === true && report.data?.limit === 47, "feedback query: configured source returns the requested bounded page");
ok(request?.init?.cache === "no-store" && request?.init?.signal, "feedback query: server fetch is non-cached and abortable");
const requestUrl = new URL(request?.url || "https://invalid.test");
ok(requestUrl.pathname === "/rest/v1/wf_feedback", "feedback query: reads only the feedback table");
ok(requestUrl.searchParams.get("select") === "message,sentiment,path,place,created_at,handled", "feedback query: projection excludes ids and device/account metadata");
ok(requestUrl.searchParams.get("order") === "created_at.desc" && requestUrl.searchParams.get("limit") === "47", "feedback query: newest saved feedback is bounded");
ok(report.data?.rows?.[0]?.kind === "recommendation" && report.data?.rows?.[0]?.handled === false, "feedback mapping: stored recommendations and the handled flag survive");
ok(report.data?.rows?.[1]?.kind === "feedback" && report.data?.rows?.[1]?.handled === true, "feedback mapping: ordinary feedback and handled state survive");
ok(!JSON.stringify(report.data).includes("must-not-return"), "feedback mapping: ids, account data, and device metadata never leave the server");
ok(!JSON.stringify(report.data).includes("fixture-service-role-key"), "feedback mapping: service credentials never enter response data");

const missing = await feedbackInbox(46, { env: {} });
ok(missing.source.connected === false && missing.source.reason === "not_configured" && missing.data === null, "feedback query: unavailable credentials remain an honest unavailable state");

const source = readFileSync(new URL("../lib/commandCenter/sources/firstParty.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/command-center/[panel]/route.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../app/command-center/ui.js", import.meta.url), "utf8");
const feedbackFunction = source.slice(source.indexOf("export async function feedbackInbox"), source.indexOf("// ── v1.3 additions"));
ok(!/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)/.test(feedbackFunction), "feedback query: inbox data access has no mutation method");
ok(route.indexOf("const auth = await requireOwner(req)") < route.indexOf('case "feedback"'), "feedback panel: owner authorization runs before the panel switch");
ok(route.includes("fp.feedbackInbox(50)") && route.includes('case "feedback"'), "feedback panel: route uses the fixed latest-50 read model");
ok(ui.includes('usePanel("feedback", auth') && ui.includes('id="feedback"'), "feedback panel: protected UI requests the feedback endpoint");
ok(ui.includes("{row.message}</p>") && !ui.includes("dangerouslySetInnerHTML"), "feedback panel: saved text is rendered as text, never executable HTML");
ok(ui.includes('row.handled ? "Handled" : "Needs review"') && ui.includes("latest 50 saved messages"), "feedback panel: handled state and visible limit are explicit");
ok(ui.includes("saved feedback is the source of truth, while email notifications are secondary"), "feedback panel: email is labeled secondary to saved feedback");

if (failures) process.exit(1);
console.log("test-command-center-feedback: OK");
