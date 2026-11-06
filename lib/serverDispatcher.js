// lib/serverDispatcher.js - one retry for raw Supabase table/view reads that
// encounter the idle keep-alive socket race. Never retry a provider or mutation.
//
// THE INCIDENT. Production (nodejs24.x) logged 583 "TypeError: fetch failed"
// with cause SocketError "other side closed", code UND_ERR_SOCKET, bytesRead 0,
// remoteAddress a Cloudflare IP in front of Supabase. bytesRead 0 on a pooled
// connection is consistent with the idle race. It does NOT prove the server did
// no work. Only an idempotent table/view read may be repeated after that failure.
//
// THE FIX, in one place. Install a global undici dispatcher composed with the
// retry interceptor: ONE retry, only for GET/HEAD table/view reads, only for transport
// level error codes, and NEVER on a status code (statusCodes is []): a 429 quota
// or billing answer is deterministic and must not be retried (CLAUDE.md rule 2).
// Node's built-in fetch reads globalThis[Symbol.for("undici.globalDispatcher.1")],
// which the npm package's setGlobalDispatcher also sets. The interceptor below
// scopes it to our exact database origin and excludes SDK-managed retry stacks.
import { Agent, interceptors, setGlobalDispatcher } from "undici";

export const RETRY_OPTIONS = Object.freeze({
  maxRetries: 1,
  minTimeout: 50,
  maxTimeout: 200,
  methods: Object.freeze(["GET", "HEAD"]),
  statusCodes: Object.freeze([]),
  errorCodes: Object.freeze(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE", "UND_ERR_CONNECT_TIMEOUT"]),
});

export const GLOBAL_DISPATCHER_SYMBOL = Symbol.for("undici.globalDispatcher.1");

function headerNames(headers) {
  if (!headers) return [];
  if (typeof headers.keys === "function" && !Array.isArray(headers)) return [...headers.keys()].map((s) => String(s).toLowerCase());
  if (Array.isArray(headers)) return headers.filter((_, i) => i % 2 === 0).map((s) => String(s).toLowerCase());
  return Object.keys(headers).map((s) => s.toLowerCase());
}

function originOf(value) {
  try { return new URL(String(value || "").trim().replace(/^['\"]+|['\"]+$/g, "")).origin; }
  catch { return null; }
}

export function isRetryableDatabaseRead(opts, supabaseOrigin) {
  if (!supabaseOrigin || originOf(opts.origin) !== supabaseOrigin || !RETRY_OPTIONS.methods.includes(opts.method)) return false;
  // RPCs may have effects, even when their caller chose GET. Auth and storage
  // also have different semantics. Limit this fix to one PostgREST relation.
  const pathname = String(opts.path || "").split("?", 1)[0];
  if (!/^\/rest\/v1\/(?!rpc(?:$|\/))[^/]+$/.test(pathname)) return false;
  const names = headerNames(opts.headers);
  // supabase-js/postgrest-js already own a retry loop. Adding a dispatcher
  // retry underneath it multiplies attempts. The same applies to an explicit
  // per-request retry policy. Raw readers that own a retry identify that owner
  // explicitly so a transport retry cannot multiply their application attempts.
  return !names.includes("x-client-info") && !names.includes("x-retry-count") && !names.includes("x-wf-retry-owner") && opts.retryOptions == null;
}

// Pure builder (no global side effects) so the guard can use it directly.
export function buildResilientDispatcher(agentOptions = {}, supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const supabaseOrigin = originOf(supabaseUrl);
  const opts = {
    ...RETRY_OPTIONS,
    methods: [...RETRY_OPTIONS.methods],
    statusCodes: [...RETRY_OPTIONS.statusCodes],
    errorCodes: [...RETRY_OPTIONS.errorCodes],
  };
  const retry = interceptors.retry(opts);
  return new Agent(agentOptions).compose((dispatch) => {
    const retryDispatch = retry(dispatch);
    return (request, handler) => isRetryableDatabaseRead(request, supabaseOrigin)
      ? retryDispatch(request, handler)
      : dispatch(request, handler);
  });
}

// Installs it globally. Never throws: a failure here must not break startup.
export function installResilientDispatcher(agentOptions = {}, supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const dispatcher = buildResilientDispatcher(agentOptions, supabaseUrl);
    setGlobalDispatcher(dispatcher);
    if (globalThis[GLOBAL_DISPATCHER_SYMBOL] == null) {
      throw new Error("undici global dispatcher symbol not set; built-in fetch would bypass the retry");
    }
    console.log("[serverDispatcher] dispatcher installed (1 retry for raw Supabase table reads; SDK/provider/mutation retries unchanged)");
    return dispatcher;
  } catch (err) {
    console.error("[serverDispatcher] install failed, continuing with default fetch:", err && err.message);
    return null;
  }
}
