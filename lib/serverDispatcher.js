// lib/serverDispatcher.js - one retry for the idle keep-alive socket race, for
// every server-side fetch (Next's patched fetch, supabase-js, ~108 rest/v1 call sites).
//
// THE INCIDENT. Production (nodejs24.x) logged 583 "TypeError: fetch failed"
// with cause SocketError "other side closed", code UND_ERR_SOCKET, bytesRead 0,
// remoteAddress a Cloudflare IP in front of Supabase. bytesRead 0 on a pooled
// connection means undici wrote a request onto a keep-alive socket the peer had
// already closed (idle race). Nothing was processed by the server, so repeating a
// read is safe, but each one blanked a server-rendered surface.
//
// THE FIX, in one place. Install a global undici dispatcher composed with the
// retry interceptor: ONE retry, only for idempotent methods, only for transport
// level error codes, and NEVER on a status code (statusCodes is []): a 429 quota
// or billing answer is deterministic and must not be retried (CLAUDE.md rule 2).
// Node's built-in fetch reads globalThis[Symbol.for("undici.globalDispatcher.1")],
// which the npm package's setGlobalDispatcher also sets, so every fetch is covered.
import { Agent, interceptors, setGlobalDispatcher } from "undici";

export const RETRY_OPTIONS = Object.freeze({
  maxRetries: 1,
  minTimeout: 50,
  maxTimeout: 200,
  methods: Object.freeze(["GET", "HEAD", "OPTIONS"]),
  statusCodes: Object.freeze([]),
  errorCodes: Object.freeze(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE", "UND_ERR_CONNECT_TIMEOUT"]),
});

export const GLOBAL_DISPATCHER_SYMBOL = Symbol.for("undici.globalDispatcher.1");

// Pure builder (no global side effects) so the guard can use it directly.
export function buildResilientDispatcher(agentOptions = {}) {
  const opts = {
    ...RETRY_OPTIONS,
    methods: [...RETRY_OPTIONS.methods],
    statusCodes: [...RETRY_OPTIONS.statusCodes],
    errorCodes: [...RETRY_OPTIONS.errorCodes],
  };
  return new Agent(agentOptions).compose(interceptors.retry(opts));
}

// Installs it globally. Never throws: a failure here must not break startup.
export function installResilientDispatcher(agentOptions = {}) {
  try {
    const dispatcher = buildResilientDispatcher(agentOptions);
    setGlobalDispatcher(dispatcher);
    if (globalThis[GLOBAL_DISPATCHER_SYMBOL] == null) {
      throw new Error("undici global dispatcher symbol not set; built-in fetch would bypass the retry");
    }
    console.log("[serverDispatcher] resilient undici dispatcher installed (1 retry, idempotent, transport errors only)");
    return dispatcher;
  } catch (err) {
    console.error("[serverDispatcher] install failed, continuing with default fetch:", err && err.message);
    return null;
  }
}
