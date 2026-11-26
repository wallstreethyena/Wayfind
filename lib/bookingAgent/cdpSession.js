// Booking agent browser for Vercel functions: a Browserbase cloud Chrome driven over the
// Chrome DevTools Protocol with Node's native WebSocket. No playwright-core in the app.
//
// Honest by construction:
// - every request and navigator.userAgent carry AGENT_UA (Network.setUserAgentOverride),
//   and launch reads it back so runNext can refuse a browser that hides what it is;
// - the Browserbase session asks for no proxy and no challenge solving;
// - cookie banners get the most private choice or are left alone, never "accept all".
// It exposes the same session/page shape services/booking-agent/browser.js gives runNext.

import { AGENT_UA } from "./constants.js";
import { browserbaseConfig, createBrowserbaseSession, getBrowserbaseLiveView, releaseBrowserbaseSession } from "./browserbase.js";

// Seconds the cloud browser may live. One run plus a code wait or a guest step fits inside it.
export const AGENT_SESSION_TIMEOUT_SECONDS = 280;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Split a comma list of CSS selectors, ignoring commas inside quotes or brackets. */
export function splitSelectorList(list) {
  const out = [];
  let cur = "";
  let quote = null;
  let depth = 0;
  for (const ch of String(list || "")) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Turn "button:has-text('Verify')" into { css: "button", text: "Verify" }. Plain CSS keeps text null. */
export function parseSelectorPart(part) {
  const m = /^(.*?):has-text\((['"])(.*?)\2\)\s*$/.exec(String(part || "").trim());
  if (!m) return { css: String(part || "").trim(), text: null };
  return { css: m[1].trim() || "*", text: m[3] };
}

/** Selector list -> parts the page script can run. */
export function compileSelector(list) {
  return splitSelectorList(list).map(parseSelectorPart).filter((p) => p.css);
}

// Runs inside the page. Returns the visible elements matching any part, in document order per part.
const FIND = `function __wfFind(parts){
  const seen = new Set(); const out = [];
  for (const p of parts) {
    let nodes = [];
    try { nodes = Array.from(document.querySelectorAll(p.css)); } catch (e) { nodes = []; }
    for (const el of nodes) {
      if (seen.has(el)) continue;
      if (p.text && !String(el.innerText || el.textContent || "").includes(p.text)) continue;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 && r.height === 0) continue;
      if (st.visibility === "hidden" || st.display === "none") continue;
      seen.add(el); out.push(el);
    }
  }
  return out;
}`;

function expr(body) {
  return `(() => { ${FIND}\n${body} })()`;
}

/** One CDP connection to a page target. Flat sessions, one socket. */
export function createCdpConnection(connectUrl, { WebSocketImpl = globalThis.WebSocket, timeoutMs = 15000 } = {}) {
  if (typeof WebSocketImpl !== "function") throw Object.assign(new Error("WebSocket is unavailable in this runtime"), { code: "RUNTIME_UNSUPPORTED" });
  const ws = new WebSocketImpl(connectUrl);
  const pending = new Map();
  const listeners = new Set();
  let seq = 1;
  let closed = false;
  const opened = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error("CDP connect timed out"), { code: "CDP_TIMEOUT" })), timeoutMs);
    ws.onopen = () => { clearTimeout(t); resolve(); };
    ws.onerror = () => { clearTimeout(t); reject(Object.assign(new Error("CDP WebSocket connection failed"), { code: "CDP_WS_ERROR" })); };
  });
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(String(ev.data)); } catch { return; }
    if (msg && msg.id && pending.has(msg.id)) {
      const { res, rej, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) rej(Object.assign(new Error(msg.error.message || "CDP error"), { code: "CDP_ERROR" }));
      else res(msg.result || {});
      return;
    }
    if (msg && msg.method) for (const fn of listeners) { try { fn(msg); } catch { /* listener errors never break the socket */ } }
  };
  ws.onclose = () => {
    closed = true;
    for (const { rej, timer } of pending.values()) { clearTimeout(timer); rej(Object.assign(new Error("CDP connection closed"), { code: "CDP_CLOSED" })); }
    pending.clear();
  };
  const send = async (method, params = {}, sessionId) => {
    await opened;
    if (closed) throw Object.assign(new Error("CDP connection closed"), { code: "CDP_CLOSED" });
    return new Promise((res, rej) => {
      const id = seq++;
      const timer = setTimeout(() => { pending.delete(id); rej(Object.assign(new Error(`CDP ${method} timed out`), { code: "CDP_TIMEOUT" })); }, timeoutMs);
      pending.set(id, { res, rej, timer });
      const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
      try { ws.send(JSON.stringify(payload)); } catch (e) { clearTimeout(timer); pending.delete(id); rej(e); }
    });
  };
  return {
    opened,
    send,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    close() { closed = true; try { ws.close(); } catch { /* already closed */ } },
  };
}

/** Attach to the cloud browser's page and force the honest Wayfind user agent. */
export async function attachHonestPage(conn, { userAgent = AGENT_UA } = {}) {
  const { targetInfos = [] } = await conn.send("Target.getTargets");
  let target = targetInfos.find((t) => t && t.type === "page");
  if (!target) {
    const created = await conn.send("Target.createTarget", { url: "about:blank" });
    target = { targetId: created.targetId };
  }
  const { sessionId } = await conn.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  await conn.send("Page.enable", {}, sessionId);
  await conn.send("Network.enable", {}, sessionId);
  await conn.send("Runtime.enable", {}, sessionId);
  await conn.send("Network.setUserAgentOverride", { userAgent }, sessionId);
  const ua = await conn.send("Runtime.evaluate", { expression: "navigator.userAgent", returnByValue: true }, sessionId);
  return { sessionId, userAgent: ua && ua.result ? String(ua.result.value || "") : "" };
}

function evaluator(conn, sessionId) {
  return async (body) => {
    const res = await conn.send("Runtime.evaluate", { expression: expr(body), returnByValue: true, awaitPromise: true }, sessionId);
    if (res && res.exceptionDetails) throw Object.assign(new Error("page script failed"), { code: "PAGE_SCRIPT" });
    return res && res.result ? res.result.value : undefined;
  };
}

/** Page wrapper with the methods runNext calls. */
export function wrapCdpPage(conn, sessionId, { getStatus }) {
  const run = evaluator(conn, sessionId);
  const exists = async (parts) => Boolean(await run(`return __wfFind(${JSON.stringify(parts)}).length > 0;`));
  const waitFor = async (parts, ms) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      try { if (await exists(parts)) return true; } catch { /* page is navigating */ }
      await sleep(250);
    }
    return false;
  };
  // Scroll the element into view and return the centre of its box, or null.
  const centreOf = async (parts, text) => run(`
    const els = __wfFind(${JSON.stringify(parts)});
    const want = ${JSON.stringify(text || null)};
    const el = want ? els.find((e) => String(e.innerText || e.textContent || "").replace(/\\s+/g, " ").includes(want)) : els[0];
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  `);
  const mouseClick = async (pt) => {
    await conn.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y }, sessionId);
    await conn.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", clickCount: 1 }, sessionId);
    await conn.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", clickCount: 1 }, sessionId);
  };
  const clickParts = async (parts, text = null, timeoutMs = 15000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const pt = await centreOf(parts, text).catch(() => null);
      if (pt) { await mouseClick(pt); return true; }
      await sleep(250);
    }
    return false;
  };
  return {
    async snapshot() {
      const page = await run(`return { html: document.documentElement ? document.documentElement.outerHTML : "", url: location.href, title: document.title };`);
      return { html: page?.html || "", url: page?.url || "", title: page?.title || "", httpStatus: getStatus() };
    },
    async listSlots(selector) {
      const labels = await run(`return __wfFind(${JSON.stringify(compileSelector(selector))}).map((e) => String(e.innerText || e.textContent || "").replace(/\\s+/g, " ").trim());`);
      return Array.isArray(labels) ? labels : [];
    },
    async clickSlot(selector, targetLabel) {
      const parts = compileSelector(selector);
      if (!(await exists(parts))) return false;
      return clickParts(parts, targetLabel || null, 5000);
    },
    async clickOptional(selector, waitMs = 2500) {
      const parts = compileSelector(selector);
      if (!(await waitFor(parts, waitMs))) return false;
      return clickParts(parts, null, 5000);
    },
    async waitForSettled(waitSelector = null, waitMs = 6000) {
      if (waitSelector) { await waitFor(compileSelector(waitSelector), waitMs); return; }
      await sleep(Math.min(waitMs, 2500));
    },
    async fill(selector, value) {
      const parts = compileSelector(selector);
      if (!(await waitFor(parts, 5000))) throw Object.assign(new Error("field not found"), { code: "FIELD_MISSING" });
      const focused = await run(`
        const el = __wfFind(${JSON.stringify(parts)})[0];
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.focus();
        if (typeof el.select === "function") el.select();
        return document.activeElement === el;
      `);
      if (!focused) throw Object.assign(new Error("field not focusable"), { code: "FIELD_MISSING" });
      // Clear what is there, then type through the browser's own input pipeline so the page's handlers see it.
      await conn.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
      await conn.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
      await conn.send("Input.insertText", { text: String(value) }, sessionId);
    },
    async click(selector) {
      const parts = compileSelector(selector);
      const done = await clickParts(parts, null, 15000);
      if (!done) throw Object.assign(new Error("element not found"), { code: "ELEMENT_MISSING" });
    },
    async screenshot() { /* serverless runs keep no screenshots */ },
    url() { return null; },
  };
}

// OneTrust's own buttons. Reject first; the close button only dismisses. Never "accept all".
const COOKIE_REJECT = compileSelector("#onetrust-reject-all-handler, .ot-pc-refuse-all-handler, #onetrust-close-btn-container button");

/**
 * Launch one honest Browserbase session over raw CDP.
 * Returns { userAgent, liveViewUrl, providerSessionId, open(url), close() } for runNext.
 */
export async function launchBrowserbaseCdp(opts = {}) {
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;
  const WebSocketImpl = opts.WebSocketImpl || globalThis.WebSocket;
  const cfg = browserbaseConfig(env);
  // The booking agent never routes through a proxy pool, whatever the Live Browser default is.
  const created = await createBrowserbaseSession({ apiKey: cfg.apiKey, projectId: cfg.projectId, proxies: false, keepAlive: false, timeout: AGENT_SESSION_TIMEOUT_SECONDS, fetchImpl });
  let conn = null;
  try {
    const debug = await getBrowserbaseLiveView({ apiKey: cfg.apiKey, sessionId: created.id, fetchImpl });
    conn = createCdpConnection(created.connectUrl, { WebSocketImpl });
    const { sessionId, userAgent } = await attachHonestPage(conn, { userAgent: opts.userAgent || AGENT_UA });
    let httpStatus = 0;
    conn.on((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === "Network.responseReceived" && msg.params && msg.params.type === "Document") httpStatus = Number(msg.params.response?.status) || 0;
    });
    const page = wrapCdpPage(conn, sessionId, { getStatus: () => httpStatus });
    return {
      userAgent,
      liveViewUrl: debug.liveViewUrl,
      providerSessionId: created.id,
      async open(url, { timeoutMs = 15000 } = {}) {
        const loaded = new Promise((resolve) => {
          const off = conn.on((msg) => {
            if (msg.sessionId === sessionId && msg.method === "Page.loadEventFired") { off(); resolve(); }
          });
          setTimeout(() => { off(); resolve(); }, timeoutMs);
        });
        const nav = await conn.send("Page.navigate", { url }, sessionId);
        if (nav && nav.errorText) throw Object.assign(new Error(nav.errorText), { code: "CDP_NAVIGATION_FAILED" });
        await loaded;
        // OpenTable renders its slots or the guest form after hydration.
        await page.waitForSettled("[data-test='slot-button'], #firstName, [data-synthetic='first-name'], [data-synthetic='slot-button']", Math.min(timeoutMs, 10000));
        await page.clickOptional("#onetrust-reject-all-handler, .ot-pc-refuse-all-handler, #onetrust-close-btn-container button", 500);
        return page;
      },
      async close() {
        if (conn) conn.close();
        await releaseBrowserbaseSession({ apiKey: cfg.apiKey, projectId: cfg.projectId, sessionId: created.id, fetchImpl });
      },
    };
  } catch (error) {
    if (conn) conn.close();
    await releaseBrowserbaseSession({ apiKey: cfg.apiKey, projectId: cfg.projectId, sessionId: created.id, fetchImpl });
    throw error;
  }
}

export const _test = { COOKIE_REJECT, FIND };
