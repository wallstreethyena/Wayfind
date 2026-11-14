"use client";
// Booking profile editor: the details Wayfind reuses on future reservations (GET, PUT and DELETE /api/reserve/profile).
// Email and mobile are saved only with the consent box ticked. Lazy: opened from the account sheet and the reserve sheet.
import { useEffect, useState } from "react";
import { C } from "./kit";
import { mainBtn, quietBtn, field, label, stepBtn, errStyle, keepVisible, Shell, showInHost } from "./reserveUi.js";
import { RESERVE_LIMITS, getProfile, saveProfile, deleteProfile, cleanPhoneInput, profileBody } from "../../lib/reserveClientApi.js";

const EMPTY = { firstName: "", lastName: "", email: "", phone: "", defaultPartySize: 2 };
export const CONSENT_TEXT = "Save these details and reuse them for future reservations";

export function ReserveProfileView({ onClose }) {
  const [f, setF] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState("loading"); // loading | ready | signedout | error
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    let stop = false;
    getProfile().then((r) => {
      if (stop) return;
      if (r.status === 401) { setState("signedout"); return; }
      if (!r.ok) { setState("error"); return; }
      const p = r.profile;
      if (p) { setF({ firstName: p.firstName || "", lastName: p.lastName || "", email: p.preferredEmail || "", phone: cleanPhoneInput(p.mobilePhone || "") || "", defaultPartySize: p.defaultPartySize || 2 }); setConsent(!!p.consentAt); }
      setState("ready");
    });
    return () => { stop = true; };
  }, []);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setNote(""); };

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setNote(""); setError("");
    const first = f.firstName.trim();
    if (!first || first.length > RESERVE_LIMITS.nameMax) { setError("Add a first name, up to 40 letters."); return; }
    if (!consent) { setError("Tick the box to save these details."); return; }
    let phone = "";
    if (f.phone.trim()) { phone = cleanPhoneInput(f.phone); if (!phone) { setError("Add a mobile number with 10 digits, or leave it blank."); return; } }
    const email = f.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("That email does not look right."); return; }
    setBusy(true);
    const r = await saveProfile(profileBody(null, { firstName: first, lastName: f.lastName.trim(), preferredEmail: email, mobilePhone: phone, defaultPartySize: f.defaultPartySize, consent: true }));
    setBusy(false);
    if (r.ok) { setNote("Saved."); if (r.profile) setF((x) => ({ ...x, phone: cleanPhoneInput(r.profile.mobilePhone || "") || phone, email: r.profile.preferredEmail || email })); }
    else setError(r.message || "We could not save that. Please try again.");
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setError(""); setNote("");
    const r = await deleteProfile();
    setBusy(false); setAsking(false);
    if (r.ok) { setF(EMPTY); setConsent(false); setNote("Your booking details are deleted."); }
    else setError(r.message || "We could not delete that. Please try again.");
  }

  return (
    <Shell title="Booking profile" sub="Used to fill in your reservations" onClose={onClose} titleId="wf-reserve-profile-title">
      {state === "loading" ? <div style={{ fontSize: 14, color: C.muted }}>Loading</div> : null}
      {state === "signedout" ? <div style={{ fontSize: 14, color: C.light }}>Sign in to save your booking details.</div> : null}
      {state === "error" ? <div role="alert" style={errStyle}>We could not load your details. Please try again.</div> : null}
      {state === "ready" ? (
        <form onSubmit={save} noValidate data-reserve-profile-form="1">
          <label htmlFor="wf-rp-first" style={label}>First name</label>
          <input id="wf-rp-first" value={f.firstName} onChange={set("firstName")} onFocus={keepVisible} maxLength={RESERVE_LIMITS.nameMax} autoComplete="given-name" style={field} />
          <label htmlFor="wf-rp-last" style={label}>Last name</label>
          <input id="wf-rp-last" value={f.lastName} onChange={set("lastName")} onFocus={keepVisible} maxLength={RESERVE_LIMITS.nameMax} autoComplete="family-name" style={field} />
          <label htmlFor="wf-rp-email" style={label}>Booking email</label>
          <input id="wf-rp-email" type="email" inputMode="email" value={f.email} onChange={set("email")} onFocus={keepVisible} maxLength={120} autoComplete="email" style={field} />
          <label htmlFor="wf-rp-phone" style={label}>Mobile</label>
          <input id="wf-rp-phone" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} onFocus={keepVisible} maxLength={20} autoComplete="tel" style={field} />
          <span style={label} id="wf-rp-party-l">Usual party size</span>
          <div role="group" aria-labelledby="wf-rp-party-l" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" aria-label="One fewer person" style={stepBtn} onClick={() => setF((x) => ({ ...x, defaultPartySize: Math.max(1, x.defaultPartySize - 1) }))}>{"−"}</button>
            <div aria-live="polite" data-rp-party="1" style={{ minWidth: 36, textAlign: "center", fontSize: 18, fontWeight: 800, color: C.text }}>{f.defaultPartySize}</div>
            <button type="button" aria-label="One more person" style={stepBtn} onClick={() => setF((x) => ({ ...x, defaultPartySize: Math.min(RESERVE_LIMITS.maxParty, x.defaultPartySize + 1) }))}>+</button>
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, minHeight: 44, padding: "14px 0 6px", fontSize: 14, color: C.light, cursor: "pointer" }}>
            <input type="checkbox" data-rp-consent="1" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(""); }} style={{ width: 24, height: 24, marginTop: 0, flexShrink: 0 }} />
            <span>{CONSENT_TEXT}</span>
          </label>
          {error ? <div role="alert" style={errStyle}>{error}</div> : null}
          {note ? <div role="status" style={{ color: C.green, fontSize: 14, margin: "8px 0" }}>{note}</div> : null}
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <button type="submit" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy}>Save</button>
            {asking ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Delete your saved booking details?</div>
                <button type="button" data-rp-delete-yes="1" style={mainBtn} disabled={busy} onClick={remove}>Yes, delete them</button>
                <button type="button" style={quietBtn} onClick={() => setAsking(false)}>Keep them</button>
              </div>
            ) : <button type="button" data-rp-delete="1" style={quietBtn} onClick={() => setAsking(true)}>Delete my booking details</button>}
          </div>
        </form>
      ) : null}
    </Shell>
  );
}

export function showReserveProfile() {
  showInHost((close) => <ReserveProfileView onClose={close} />);
}
export default ReserveProfileView;
