"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

const C = {
  bg: "#0D1117",
  card: "#161B22",
  border: "#30363D",
  text: "#E6EDF3",
  muted: "#8B949E",
  accent: "#F0883E",
  danger: "#FF7B72",
};

function safeRedirect(url) {
  try {
    const parsed = new URL(String(url || ""));
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback) ? parsed.href : "";
  } catch {
    return "";
  }
}

function cleanError(error, fallback) {
  const message = error && typeof error.message === "string" ? error.message.trim() : "";
  return message ? message.slice(0, 240) : fallback;
}

export default function OAuthConsentClient({ authorizationId }) {
  const [status, setStatus] = useState("loading");
  const [details, setDetails] = useState(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!authorizationId) {
      setError("This authorization request is missing its ID.");
      setStatus("error");
      return;
    }
    if (!supabase || !supabase.auth) {
      setError("Wayfind sign-in is not configured on this deployment.");
      setStatus("error");
      return;
    }

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData && sessionData.session;
      if (!session || !session.user) {
        setStatus("signin");
        return;
      }
      setEmail(session.user.email || "");

      if (!supabase.auth.oauth || typeof supabase.auth.oauth.getAuthorizationDetails !== "function") {
        throw new Error("This Wayfind deployment does not yet support OAuth client consent.");
      }
      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (detailsError) throw detailsError;

      const alreadyApproved = safeRedirect(data && data.redirect_url);
      if (alreadyApproved) {
        window.location.replace(alreadyApproved);
        return;
      }
      if (!data || !data.authorization_id) {
        throw new Error("The authorization request could not be loaded.");
      }
      setDetails(data);
      setStatus("ready");
    } catch (err) {
      setError(cleanError(err, "The authorization request could not be loaded."));
      setStatus("error");
    }
  }, [authorizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function signIn(provider) {
    setError("");
    try {
      const redirectTo = window.location.href;
      const { error: signInError } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (signInError) throw signInError;
    } catch (err) {
      setError(cleanError(err, "Sign in could not start."));
    }
  }

  async function decide(action) {
    if (!details || !supabase || !supabase.auth || !supabase.auth.oauth) return;
    setStatus("working");
    setError("");
    try {
      const fn = action === "approve"
        ? supabase.auth.oauth.approveAuthorization.bind(supabase.auth.oauth)
        : supabase.auth.oauth.denyAuthorization.bind(supabase.auth.oauth);
      const { data, error: decisionError } = await fn(authorizationId, { skipBrowserRedirect: true });
      if (decisionError) throw decisionError;
      const redirectUrl = safeRedirect(data && data.redirect_url);
      if (!redirectUrl) throw new Error("The authorization server did not return a safe redirect.");
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(cleanError(err, `Could not ${action} this request.`));
      setStatus("ready");
    }
  }

  const client = details && details.client ? details.client : {};
  const clientName = client.client_name || "AI client";
  const scopes = String((details && details.scope) || "").split(/\s+/).filter(Boolean);
  let redirectHost = "";
  try { redirectHost = details && details.redirect_uri ? new URL(details.redirect_uri).host : ""; } catch {}

  return (
    <main style={{ minHeight: "100dvh", background: C.bg, color: C.text, display: "grid", placeItems: "center", padding: "28px 18px", fontFamily: "var(--wf-sans)" }}>
      <section style={{ width: "100%", maxWidth: 520, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "26px 22px", boxShadow: "0 24px 70px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
          <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 999, background: C.accent, display: "inline-block" }} />
          <strong style={{ fontSize: 18, letterSpacing: "-.02em" }}>wayfind</strong>
        </div>

        {status === "loading" && <p style={{ color: C.muted, margin: 0 }}>Loading authorization request…</p>}

        {status === "signin" && (
          <>
            <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Sign in to continue</h1>
            <p style={{ color: C.muted, lineHeight: 1.55, margin: "0 0 20px" }}>An AI client is asking to connect to Wayfind. Sign in first so Wayfind can show you exactly what is requesting access.</p>
            <button onClick={() => signIn("google")} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: "#FFFFFF", color: "#1F2937", fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 10 }}>Continue with Google</button>
            <button onClick={() => signIn("apple")} style={{ width: "100%", padding: 13, borderRadius: 12, border: "1px solid #000", background: "#000", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Continue with Apple</button>
          </>
        )}

        {(status === "ready" || status === "working") && details && (
          <>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>AI connection request</div>
            <h1 style={{ fontSize: 24, margin: "0 0 8px", lineHeight: 1.18 }}>{clientName} wants to connect</h1>
            <p style={{ color: C.muted, lineHeight: 1.55, margin: "0 0 18px" }}>Only approve this if you started the connection. The client will act as your signed-in Wayfind account for the access listed below.</p>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
              {email && <div style={{ fontSize: 13, marginBottom: 9 }}><span style={{ color: C.muted }}>Account:</span> {email}</div>}
              {redirectHost && <div style={{ fontSize: 13, marginBottom: scopes.length ? 9 : 0 }}><span style={{ color: C.muted }}>Returns to:</span> {redirectHost}</div>}
              {scopes.length > 0 && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: C.muted }}>Requested access:</span>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    {scopes.map((scope) => <li key={scope} style={{ marginBottom: 5 }}>{scope}</li>)}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ borderRadius: 12, background: "rgba(240,136,62,.09)", border: "1px solid rgba(240,136,62,.24)", padding: "11px 12px", color: C.muted, fontSize: 12.5, lineHeight: 1.5, marginBottom: 18 }}>
              The Wayfind Jev connector is owner-locked. Jev makes bounded judgments; it does not get permission to modify Wayfind production data through this connector.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button disabled={status === "working"} onClick={() => decide("deny")} style={{ padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 14, fontWeight: 800, cursor: status === "working" ? "default" : "pointer", opacity: status === "working" ? .55 : 1 }}>Deny</button>
              <button disabled={status === "working"} onClick={() => decide("approve")} style={{ padding: 13, borderRadius: 12, border: "none", background: C.accent, color: C.bg, fontSize: 14, fontWeight: 900, cursor: status === "working" ? "default" : "pointer", opacity: status === "working" ? .65 : 1 }}>{status === "working" ? "Working…" : "Approve"}</button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <h1 style={{ fontSize: 23, margin: "0 0 8px" }}>Connection could not continue</h1>
            <p style={{ color: C.muted, lineHeight: 1.55, margin: 0 }}>{error || "This authorization request could not be completed."}</p>
          </>
        )}

        {error && status !== "error" && <p role="alert" style={{ color: C.danger, fontSize: 13, margin: "14px 0 0" }}>{error}</p>}
        <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5, margin: "20px 0 0" }}>Never approve a connection you did not start yourself. You can revoke OAuth grants later from your account controls.</p>
      </section>
    </main>
  );
}
