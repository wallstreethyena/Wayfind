// Server-side broker for model coordination. Never import it in a client or
// hand a model a database credential, RPC client, provider identity or scope.
import { env as serverEnv } from "node:process";
import { timingSafeEqual } from "node:crypto";
import { credential } from "./envPlaceholder.js";
import { classifyExecutionIdentity, classifyWriteTarget, evaluateProductionWrite, isSyntheticRequest } from "./productionWriteFirewall.js";
import { utcCalendarDateKey } from "./siteTime.js";

if (typeof window !== "undefined") throw new Error("The AI bulletin board is server-only.");

const PROVIDERS = new Set(["openai", "gemini", "grok", "claude"]);
const TOPICS = new Set(["posters", "project"]);
const REGIONS = new Set([
  "statewide", "tampa-bay", "sarasota-bradenton", "central-florida", "orlando",
  "miami", "south-florida", "first-coast", "suncoast", "southwest-florida",
  "daytona-space-coast", "treasure-coast", "panhandle", "north-florida", "keys",
]);
const DAYPARTS = new Set(["all-day", "morning", "afternoon", "evening", "late-night"]);
const STAGES = new Set(["intake", "verification", "selection", "publication", "health"]);
const STATUSES = new Set(["ready", "succeeded", "degraded", "skipped", "unavailable"]);
const SIGNALS = new Set([
  "none", "candidate_count", "verified_evidence", "stale_evidence", "provider_unavailable",
  "budget_limited", "configuration_missing", "no_safe_candidates", "deterministic_fallback",
]);
const SCOPE_KEYS = ["runDate", "region", "daypart", "topic"];
const NOTE_KEYS = ["stage", "status", "signal", "count"];
const ROW_KEYS = ["provider", ...NOTE_KEYS];
const MAX_NOTES = PROVIDERS.size * STAGES.size - (PROVIDERS.size - 1);
const READ_RPC = "wf_ai_bulletin_read";
const POST_RPC = "wf_ai_bulletin_post";

export class AiBulletinBoardError extends Error {
  constructor(code, message) { super(message); this.name = "AiBulletinBoardError"; this.code = code; }
}

function exactFields(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && keys.every((key) => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    return d && d.enumerable && "value" in d;
  });
}

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && utcCalendarDateKey(date) === value;
}

function validObservation(note, provider) {
  return STAGES.has(note.stage) && STATUSES.has(note.status) && SIGNALS.has(note.signal)
    && (note.stage !== "publication" || provider === "openai")
    && Number.isSafeInteger(note.count) && note.count >= 0 && note.count <= 500
    && (note.signal === "candidate_count" || note.count === 0);
}

function settings(env) {
  if (env["WF_AI_BULLETIN_BOARD_ENABLED"] !== "1") {
    throw new AiBulletinBoardError("BOARD_DISABLED", "AI bulletin board is disabled.");
  }
  const raw = (env["SUPABASE_URL"] || env["NEXT_PUBLIC_SUPABASE_URL"] || "").trim();
  let url;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
    url = parsed.origin;
  } catch {
    throw new AiBulletinBoardError("BOARD_CONFIGURATION", "AI bulletin board needs a valid Supabase URL.");
  }
  const key = credential(env["SUPABASE_SERVICE_ROLE_KEY"]);
  if (!key) throw new AiBulletinBoardError("BOARD_CONFIGURATION", "AI bulletin board needs the server Supabase credential.");
  return { url, key };
}

function hasVerifiedCronRequest(req, env) {
  const secret = credential(env["CRON_SECRET"]);
  if (!secret || !req?.headers?.get || isSyntheticRequest(req)) return false;
  const supplied = req.headers.get("authorization");
  if (typeof supplied !== "string" || supplied.length > 4096) return false;
  const given = Buffer.from(supplied);
  const expected = Buffer.from("Bearer " + secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const unavailable = () => new AiBulletinBoardError("BOARD_UNAVAILABLE", "AI bulletin board storage is unavailable.");
const invalidResponse = () => new AiBulletinBoardError("BOARD_INVALID_RESPONSE", "AI bulletin board storage returned an invalid response.");

/**
 * Only a trusted server job creates this broker and binds a provider. Model
 * text and user requests must never choose identities, scopes or actions.
 * The board's output is observations, never instructions or authority to publish.
 * Keep board exceptions isolated from deterministic/public poster generation.
 */
export function createAiBulletinBoard({ env = serverEnv, fetchImpl = fetch, req = null } = {}) {
  const { url, key } = settings(env);
  const mockHost = classifyWriteTarget(url, "POST", env).kind === "hermetic-mock-host";
  const testDouble = mockHost && fetchImpl !== fetch;
  if (!testDouble && !classifyExecutionIdentity({ env }).allowLiveWrites) {
    throw new AiBulletinBoardError("BOARD_FORBIDDEN", "AI bulletin board requires a verified server execution context.");
  }
  if (!testDouble && !hasVerifiedCronRequest(req, env)) {
    throw new AiBulletinBoardError("BOARD_FORBIDDEN", "AI bulletin board requires an authenticated scheduler request.");
  }
  // Never send the service role to unapproved endpoints. For this app the
  // trusted production Supabase endpoint is a project-ref supabase.co host.
  if (!testDouble && !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url)) {
    throw new AiBulletinBoardError("BOARD_CONFIGURATION", "AI bulletin board requires a Supabase project host.");
  }

  async function rpc(name, body) {
    const endpoint = url + "/rest/v1/rpc/" + name;
    if (name === POST_RPC && !evaluateProductionWrite({
      surface: "ai-bulletin-board", table: name, targetUrl: endpoint,
      payload: body, req, hasExplicitTestDouble: testDouble, env,
    }).allowed) {
      throw new AiBulletinBoardError("BOARD_FORBIDDEN", "AI bulletin board write was refused.");
    }
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(2500),
        headers: { apikey: key, Authorization: "Bearer " + key, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch { throw unavailable(); }
    if (!response?.ok) throw unavailable(); // Never return or log raw backend error bodies.
    try { return await response.json(); } catch { throw invalidResponse(); }
  }

  return Object.freeze({
    forProvider(provider, scope) {
      if (!PROVIDERS.has(provider) || !exactFields(scope, SCOPE_KEYS) ||
          !calendarDate(scope.runDate) || !REGIONS.has(scope.region) ||
          !DAYPARTS.has(scope.daypart) || !TOPICS.has(scope.topic)) {
        throw new AiBulletinBoardError("BOARD_SCOPE", "Invalid model or bulletin board scope.");
      }
      // All values are primitive and copied now: later mutation cannot retarget a session.
      const bound = Object.freeze({
        p_provider: provider, p_run_date: scope.runDate, p_region: scope.region,
        p_daypart: scope.daypart, p_topic: scope.topic,
      });
      return Object.freeze({
        read: async () => {
          const raw = await rpc(READ_RPC, bound);
          if (!Array.isArray(raw) || raw.length > MAX_NOTES) throw invalidResponse();
          const seen = new Set();
          return Object.freeze(raw.map((row) => {
            if (!exactFields(row, ROW_KEYS) || !PROVIDERS.has(row.provider) ||
                !validObservation(row, row.provider)) throw invalidResponse();
            const identity = row.provider + ":" + row.stage;
            if (seen.has(identity)) throw invalidResponse();
            seen.add(identity);
            return Object.freeze({
              provider: row.provider, stage: row.stage, status: row.status,
              signal: row.signal, count: row.count,
            });
          }));
        },
        post: async (note) => {
          if (!exactFields(note, NOTE_KEYS) || !validObservation(note, provider)) {
            throw new AiBulletinBoardError("BOARD_OBSERVATION", "Invalid bulletin board observation.");
          }
          const result = await rpc(POST_RPC, {
            ...bound, p_stage: note.stage, p_status: note.status, p_signal: note.signal, p_count: note.count,
          });
          if (result === "conflict") {
            throw new AiBulletinBoardError("BOARD_CONFLICT", "This bulletin board observation is already recorded.");
          }
          if (!["inserted", "unchanged"].includes(result)) throw invalidResponse();
          return result;
        },
      });
    },
  });
}
