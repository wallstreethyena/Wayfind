// Zero-dependency CDP page navigation over Node 22 native WebSocket.
// Used by serverless /api/reserve/browser so Vercel routes never import playwright-core.

export async function navigateBrowserbasePage(connectUrl, targetUrl, { timeoutMs = 12000, WebSocketImpl = globalThis.WebSocket } = {}) {
  if (!connectUrl || !targetUrl) throw Object.assign(new Error("connectUrl and targetUrl are required"), { code: "INVALID_ARGUMENT" });
  if (typeof WebSocketImpl !== "function") throw Object.assign(new Error("WebSocket is unavailable in this runtime"), { code: "RUNTIME_UNSUPPORTED" });
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(connectUrl);
    const pending = new Map();
    let seq = 1;
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(val);
    };
    const send = (method, params = {}, sessionId = undefined) => new Promise((res, rej) => {
      const id = seq++;
      pending.set(id, { res, rej });
      const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        pending.delete(id);
        rej(e);
      }
    });
    const timer = setTimeout(() => finish(Object.assign(new Error("CDP navigation timed out"), { code: "CDP_TIMEOUT" })), timeoutMs);
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg && msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || "CDP error"));
        else res(msg.result);
      }
    };
    ws.onerror = () => finish(Object.assign(new Error("CDP WebSocket connection failed"), { code: "CDP_WS_ERROR" }));
    ws.onopen = async () => {
      try {
        const { targetInfos = [] } = await send("Target.getTargets");
        const pageTarget = targetInfos.find((t) => t && t.type === "page");
        if (!pageTarget || !pageTarget.targetId) throw Object.assign(new Error("No page target in cloud browser"), { code: "CDP_NO_PAGE" });
        const { sessionId } = await send("Target.attachToTarget", { targetId: pageTarget.targetId, flatten: true });
        await send("Page.enable", {}, sessionId);
        const nav = await send("Page.navigate", { url: targetUrl }, sessionId);
        finish(null, { frameId: nav?.frameId || null, navigated: true });
      } catch (err) {
        finish(err);
      }
    };
  });
}
