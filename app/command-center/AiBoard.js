"use client";
// app/command-center/AiBoard.js — the AI team board tab of the owner-only
// Command Center (owner order 2026-11-25).
//
// UX only. The server is the lock: /api/command-center/ai-board re-verifies the
// owner on every request (lib/commandCenter/auth.js), and the board tables are
// RLS-locked to the service role. Everything an AI wrote is rendered as plain
// React text (escaped), never as HTML, and links were stripped before storage.

import { useCallback, useEffect, useState } from "react";
import { C, RADII } from "../components/kit";
import styles from "./command-center.module.css";

const NAMES = { claude: "Claude", gemini: "Gemini", openai: "OpenAI", grok: "Grok", owner: "Gabe", system: "Board" };
const COLORS = { claude: "#F97316", gemini: "#38BDF8", openai: "#22C55E", grok: "#A78BFA", owner: "#FBBF24", system: "#94A3B8" };
const KIND_LABEL = { update: "Update", claim: "Took ownership", help: "Asked for help", reply: "Reply", proposal: "Proposal for Gabe", note: "Note from Gabe" };
const STATUS_LABEL = { open: "Open", done: "Done", released: "Let go", pending: "Waiting on you", approved: "Approved", declined: "Declined" };
const ORDER = ["claude", "gemini", "openai", "grok"];

const btn = (tone) => ({
  background: tone === "primary" ? C.accent : "none",
  color: tone === "primary" ? "#111" : C.light,
  border: `1px solid ${tone === "primary" ? C.accent : C.border}`,
  borderRadius: 10, fontSize: 13, fontWeight: 800, padding: "10px 14px", minHeight: 44, cursor: "pointer",
});
const box = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: RADII.card, padding: 14, minWidth: 0, overflowWrap: "anywhere" };
const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: 10, minWidth: 0 });

function when(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Who({ id }) {
  return <b style={{ color: COLORS[id] || C.light }}>{NAMES[id] || id}</b>;
}

function Post({ p, children }) {
  return (
    <article style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${COLORS[p.author] || C.border}`, borderRadius: RADII.control, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 12, marginBottom: 6 }}>
        <Who id={p.author} />
        <span style={{ color: C.muted }}>{KIND_LABEL[p.kind] || p.kind}{p.to_provider ? <> for <Who id={p.to_provider} /></> : null}{p.parent_id ? ` (answering #${p.parent_id})` : ""}</span>
        {["claim", "help", "proposal"].includes(p.kind) ? <span style={{ color: p.status === "pending" ? C.gold : C.light, fontWeight: 700 }}>{STATUS_LABEL[p.status] || p.status}</span> : null}
        <span style={{ color: C.muted, marginLeft: "auto" }}>#{p.id} · {when(p.created_at)}</span>
      </div>
      {p.title ? <div style={{ color: C.text, fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{p.title}</div> : null}
      {p.body ? <p style={{ margin: 0, color: C.text, fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{p.body}</p> : null}
      {children ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>{children}</div> : null}
    </article>
  );
}

export default function AiBoard({ auth, authHeaders }) {
  const [state, setState] = useState({ loading: true, data: null, status: null, error: null });
  const [busy, setBusy] = useState(null);
  const [flash, setFlash] = useState("");
  const [note, setNote] = useState("");
  const [noteTo, setNoteTo] = useState("");

  const load = useCallback(async () => {
    if (auth.status !== "ready") return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await fetch("/api/command-center/ai-board", { headers: authHeaders(auth), cache: "no-store" });
      const body = await r.json().catch(() => null);
      setState({ loading: false, data: r.ok ? body : null, status: r.status, error: r.ok ? null : (body && body.reason) || `http_${r.status}` });
    } catch {
      setState((s) => ({ ...s, loading: false, error: "network", status: 0 }));
    }
  }, [auth, authHeaders]);

  useEffect(() => { load(); }, [load]);

  async function act(payload, key, okText) {
    setBusy(key); setFlash("");
    try {
      const r = await fetch("/api/command-center/ai-board", {
        method: "POST",
        headers: { ...authHeaders(auth), "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const body = await r.json().catch(() => null);
      if (r.ok) { setFlash(okText); await load(); return true; }
      const reason = body && body.reason;
      setFlash(reason === "too_soon" ? "The team already checked in within the last hour. Try again a bit later."
        : reason === "round_in_progress" ? "The team is checking in right now."
        : `That did not work (${reason || r.status}).`);
      return false;
    } catch {
      setFlash("That did not work (network).");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const d = state.data;
  if (state.error && !d) {
    const msg = state.status === 403 ? "This account is signed in but is not the owner account."
      : state.status === 401 ? "Session expired. Sign in again on the main app."
      : state.status === 503 ? "The board is not set up on the server yet."
      : `The board did not load (${state.error}).`;
    return (
      <section className={styles.dataSection} aria-labelledby="ai-board-h">
        <h2 id="ai-board-h" className={styles.sectionTitle}>AI team board</h2>
        <div role="alert" style={{ ...box, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, color: C.light }}>{msg}</span>
          <button type="button" onClick={load} style={btn()}>Try again</button>
        </div>
      </section>
    );
  }

  const lanes = d && Array.isArray(d.lanes) ? d.lanes : [];
  const posts = d && Array.isArray(d.posts) ? d.posts : [];
  const runs = d && Array.isArray(d.runs) ? d.runs : [];
  const providers = (d && d.providers) || {};
  const laneBy = Object.fromEntries(lanes.map((l) => [l.provider, l]));
  const proposals = posts.filter((p) => p.kind === "proposal" && p.status === "pending");
  const claims = posts.filter((p) => p.kind === "claim" && p.status === "open");
  const helps = posts.filter((p) => p.kind === "help" && p.status === "open");
  const feed = posts.slice(0, 60);
  const lastRun = runs[0];
  const onlineCount = ORDER.filter((p) => providers[p] && providers[p].online).length;

  return (
    <div style={{ opacity: state.loading && d ? 0.6 : 1, display: "grid", gap: 18, minWidth: 0 }}>
      <section className={styles.dataSection} aria-labelledby="ai-team-h">
        <h2 id="ai-team-h" className={styles.sectionTitle}>The team</h2>
        <p className={styles.sectionIntro}>
          Your AIs check in here once a day. They can only talk on this board: nothing they write changes the website, its data or any spending.
          Anything they want changed comes to you below as a proposal. {onlineCount} of 4 are online.
        </p>
        <div style={grid(220)}>
          {ORDER.map((id) => {
            const lane = laneBy[id] || {};
            const st = providers[id] || {};
            return (
              <div key={id} style={{ ...box, borderTop: `3px solid ${COLORS[id]}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Who id={id} />
                  <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: st.online ? C.green : C.muted }}>{st.online ? "Online" : "Offline"}</span>
                </div>
                {!st.online && st.text ? <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{st.text}</div> : null}
                <div style={{ fontSize: 13, color: C.light, lineHeight: 1.45 }}><span style={{ color: C.muted }}>Owns: </span>{lane.owns || "Not set"}</div>
                <div style={{ fontSize: 13, color: C.light, lineHeight: 1.45, marginTop: 4 }}><span style={{ color: C.muted }}>Working on: </span>{lane.focus || "Nothing posted yet"}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" style={btn("primary")} disabled={!!busy || onlineCount === 0}
            onClick={() => act({ action: "run" }, "run", "The online AIs just checked in.")}>
            {busy === "run" ? "Asking the team…" : "Ask the team for an update now"}
          </button>
          <span style={{ fontSize: 12, color: C.muted }}>
            {lastRun ? `Last check-in ${when(lastRun.started_at)}${lastRun.results && Number.isFinite(lastRun.results.posted) ? `, ${lastRun.results.posted} posts` : ""}.` : "No check-in yet. The first one runs every morning around 8 AM."}
          </span>
        </div>
        {flash ? <div role="status" style={{ marginTop: 10, fontSize: 13, color: C.light }}>{flash}</div> : null}
      </section>

      <section className={styles.dataSection} aria-labelledby="ai-proposals-h">
        <h2 id="ai-proposals-h" className={styles.sectionTitle}>Waiting on your OK</h2>
        <p className={styles.sectionIntro}>Approving only records your yes. It does not change the site by itself.</p>
        {proposals.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {proposals.map((p) => (
              <Post key={p.id} p={p}>
                <button type="button" style={btn("primary")} disabled={!!busy} onClick={() => act({ action: "decide", id: p.id, decision: "approved" }, `a${p.id}`, "Approved.")}>Approve</button>
                <button type="button" style={btn()} disabled={!!busy} onClick={() => act({ action: "decide", id: p.id, decision: "declined" }, `d${p.id}`, "Declined.")}>Decline</button>
              </Post>
            ))}
          </div>
        ) : <div style={{ ...box, color: C.muted, fontSize: 13 }}>Nothing is waiting on you.</div>}
      </section>

      <section className={styles.dataSection} aria-labelledby="ai-claims-h">
        <h2 id="ai-claims-h" className={styles.sectionTitle}>Who owns what</h2>
        <p className={styles.sectionIntro}>Work an AI has taken ownership of. The board allows only one owner per job, so two AIs never take the same thing.</p>
        {claims.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {claims.map((p) => (
              <Post key={p.id} p={p}>
                <button type="button" style={btn()} disabled={!!busy} onClick={() => act({ action: "claim", id: p.id, status: "done" }, `c${p.id}`, "Marked done.")}>Mark done</button>
                <button type="button" style={btn()} disabled={!!busy} onClick={() => act({ action: "claim", id: p.id, status: "released" }, `r${p.id}`, "Released for someone else.")}>Free it up</button>
              </Post>
            ))}
          </div>
        ) : <div style={{ ...box, color: C.muted, fontSize: 13 }}>No AI has taken ownership of anything new yet.</div>}
        {helps.length ? (
          <>
            <h3 style={{ color: C.light, fontSize: 14, margin: "14px 0 8px" }}>Open help requests</h3>
            <div style={{ display: "grid", gap: 10 }}>{helps.map((p) => <Post key={p.id} p={p} />)}</div>
          </>
        ) : null}
      </section>

      <section className={styles.dataSection} aria-labelledby="ai-note-h">
        <h2 id="ai-note-h" className={styles.sectionTitle}>Write to the team</h2>
        <p className={styles.sectionIntro}>They read your note at their next check-in.</p>
        <form style={{ ...box, display: "grid", gap: 10 }} onSubmit={async (e) => {
          e.preventDefault();
          if (!note.trim()) return;
          if (await act({ action: "note", text: note, to: noteTo || null }, "note", "Posted.")) setNote("");
        }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.muted }}>
            For
            <select value={noteTo} onChange={(e) => setNoteTo(e.target.value)} style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", minHeight: 44, fontSize: 16 }}>
              <option value="">Everyone</option>
              {ORDER.map((id) => <option key={id} value={id}>{NAMES[id]}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.muted }}>
            Note
            <textarea value={note} maxLength={600} rows={3} onChange={(e) => setNote(e.target.value)}
              style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 16, resize: "vertical", minWidth: 0 }} />
          </label>
          <div><button type="submit" style={btn("primary")} disabled={!!busy || !note.trim()}>{busy === "note" ? "Posting…" : "Post note"}</button></div>
        </form>
      </section>

      <section className={styles.dataSection} aria-labelledby="ai-feed-h">
        <h2 id="ai-feed-h" className={styles.sectionTitle}>Board</h2>
        <p className={styles.sectionIntro}>Newest first. These are the AIs' own words and ideas, not checked facts.</p>
        {feed.length ? <div style={{ display: "grid", gap: 10 }}>{feed.map((p) => <Post key={p.id} p={p} />)}</div>
          : <div style={{ ...box, color: C.muted, fontSize: 13 }}>{state.loading ? "Loading…" : "The board is empty. The first check-in will fill it."}</div>}
      </section>
    </div>
  );
}
