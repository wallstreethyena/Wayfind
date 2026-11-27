// lib/liveTripTransport.js — browser transport for Wayfind Live Trips.
// Phone → server: HTTPS (bearer token). Server → phones: a PRIVATE Supabase
// Realtime channel "live-trip:<id>" (WebSocket); the database broadcasts each
// accepted batch in the same transaction that saves it. Presence (who is here,
// which stop they are editing) goes phone → phones on the same channel and is
// never stored.

export function createLiveTripTransport({ supabase, tripId, getToken, onPresence = () => {} }) {
  let channel = null;
  let presenceInfo = null;
  let handlers = null;
  let stopped = false;

  async function call(path, init = {}) {
    const token = await getToken();
    let res;
    try {
      res = await fetch(path, {
        ...init,
        headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...(init.headers || {}) },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return { status: 0, body: null };
    }
    if (res.status === 304) return { status: 304, body: null };
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  }

  async function subscribe() {
    if (!supabase || stopped) { handlers && handlers.onSocket("down"); return; }
    const token = await getToken();
    try { if (token) await supabase.realtime.setAuth(token); } catch {}
    if (stopped) return;
    const ch = supabase.channel("live-trip:" + tripId, { config: { private: true, broadcast: { self: false }, presence: { key: (presenceInfo && presenceInfo.memberId) || "anon" } } });
    ch.on("broadcast", { event: "ops" }, (m) => handlers.onOps(m && m.payload))
      .on("broadcast", { event: "members" }, (m) => handlers.onMembers(m && m.payload))
      .on("broadcast", { event: "ended" }, () => handlers.onEnded())
      .on("presence", { event: "sync" }, () => {
        try {
          const st = ch.presenceState();
          const list = [];
          for (const metas of Object.values(st)) for (const p of metas) list.push(p);
          onPresence(list);
        } catch {}
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          handlers.onSocket("subscribed");
          if (presenceInfo) ch.track(presenceInfo).catch(() => {});
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          handlers.onSocket("down");
        }
      });
    channel = ch;
  }

  return {
    sendOps(body) {
      return call("/api/trips/live/" + tripId + "/ops", { method: "POST", body: JSON.stringify(body) });
    },
    fetchSnapshot(since) {
      return call("/api/trips/live/" + tripId + (since != null && since >= 0 ? "?since=" + since : ""));
    },
    connect(h) {
      handlers = h;
      h.onSocket("connecting");
      subscribe();
    },
    disconnect() {
      stopped = true;
      if (channel && supabase) { try { supabase.removeChannel(channel); } catch {} }
      channel = null;
    },
    /** Presence: { memberId, name, color, editing } — who is in the trip right now. */
    setPresence(info) {
      presenceInfo = info;
      if (channel) channel.track(info).catch(() => {});
    },
    /** After a token refresh, give the socket the new token. */
    async refreshAuth() {
      const token = await getToken();
      try { if (token && supabase) await supabase.realtime.setAuth(token); } catch {}
    },
  };
}

export async function liveTripRequest(path, { token, method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { status: 0, body: { ok: false, message: "No connection. Try again when you're back online." } };
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, body: data || { ok: false, message: "Something went wrong. Please try again." } };
}
