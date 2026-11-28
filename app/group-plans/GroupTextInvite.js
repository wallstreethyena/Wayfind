"use client";
import { useEffect, useState } from "react";

// Recently texted friends, kept only on this phone (never sent to Wayfind) so
// the next group text is one tap. Names and numbers the organizer picked.
const RECENT_KEY = "wf_gv_recent_contacts";
function readRecent() {
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((c) => c && /^\+?[0-9]{7,15}$/.test(String(c.number || ""))).slice(0, 12) : [];
  } catch { return []; }
}
function saveRecent(picked) {
  try {
    const merged = new Map();
    for (const c of [...picked, ...readRecent()]) if (!merged.has(c.number)) merged.set(c.number, { number: c.number, name: String(c.name || "").slice(0, 40) });
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([...merged.values()].slice(0, 12)));
  } catch { /* private mode: nothing kept */ }
}
function contactNumbers(contacts) {
  const choices = new Map();
  for (const contact of contacts) {
    const numbers = new Set();
    for (const value of Array.isArray(contact?.tel) ? contact.tel : []) {
      if (typeof value !== "string") continue;
      const digits = value.trim().replace(/[\s().-]/g, "");
      // Leave national numbers in the device's dialing plan. Reject extensions,
      // extra recipients and URI parameters before putting a number in sms:.
      if (/^\+?[0-9]{7,15}$/.test(digits)) numbers.add(digits);
    }
    const name = Array.isArray(contact?.name) ? String(contact.name[0] || "") : "";
    for (const number of numbers) {
      // A contact can share home and mobile. Let the organizer choose which one.
      const prior = choices.get(number);
      choices.set(number, { checked: prior?.checked === true || numbers.size === 1, name: prior?.name || name });
    }
  }
  return Array.from(choices, ([number, v]) => ({ number, checked: v.checked, name: v.name }));
}

export function GroupTextInvite({ body, single, onNotice, remember = false }) {
  const [canPick, setCanPick] = useState(false);
  const [choices, setChoices] = useState([]);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    setCanPick(window.isSecureContext && typeof navigator.contacts?.select === "function");
    if (remember) { const recent = readRecent(); if (recent.length) setChoices(recent.map((c) => ({ ...c, checked: false }))); }
  }, [remember]);

  async function chooseContacts() {
    setPicking(true);
    try {
      const contacts = await navigator.contacts.select(remember ? ["name", "tel"] : ["tel"], { multiple: true });
      if (!contacts.length) return;
      const next = contactNumbers(contacts);
      setChoices(next);
      onNotice(next.length ? "" : "No usable phone numbers were shared. You can choose recipients in Messages.");
    } catch (error) {
      if (error?.name !== "AbortError") onNotice("Contact access is unavailable. You can choose recipients in Messages.");
    } finally {
      setPicking(false);
    }
  }

  const selected = choices.filter((choice) => choice.checked).map((choice) => choice.number);
  const bodyQuery = `?&body=${encodeURIComponent(body)}`;
  function composeSelected() {
    if (remember) saveRecent(choices.filter((c) => c.checked));
    // Use only in this click. Contact numbers never enter a link in the DOM,
    // a Wayfind request, persistent storage or an analytics event.
    window.location.assign(`sms:${selected.join(",")}${bodyQuery}`);
    onNotice("Review the recipients and send in your messaging app.");
  }

  return <>
    {choices.length > 0 ? <>
      <fieldset className="gp-field ph-no-capture" data-sentry-mask="">
        <legend>Numbers for this group text</legend>
        {choices.map(({ number, checked, name }) => <label key={number}>
          <input type="checkbox" checked={checked} onChange={() => setChoices((current) =>
            current.map((choice) => choice.number === number ? { ...choice, checked: !choice.checked } : choice)
          )}/> {name ? `${name} · ${number}` : number}
        </label>)}
        <span className="gp-note">Choose up to 10. These numbers stay on this phone and are never sent to Wayfind.</span>
      </fieldset>
      <button type="button" className="gp-button primary" disabled={selected.length === 0 || selected.length > 10}
        onClick={composeSelected}>{`Text ${selected.length} ${selected.length === 1 ? "number" : "numbers"}`}</button>
      <a className="gp-button" href={`sms:${bodyQuery}`} onClick={() => onNotice("Choose recipients and send in your messaging app.")}>Pick people in Messages</a>
      <button type="button" className="gp-button" onClick={() => { setChoices([]); if (remember) { try { window.localStorage.removeItem(RECENT_KEY); } catch {} } }}>Clear numbers</button>
    </> : <a className="gp-button primary" href={`sms:${bodyQuery}`} onClick={() => onNotice("Choose recipients and send in your messaging app.")}>
      {single ? "Text your friend" : remember ? "Text the group" : "Send one text to your group"}
    </a>}
    {canPick && <button type="button" className="gp-button" disabled={picking} onClick={chooseContacts}>
      {choices.length ? "Choose different contacts" : "Choose contacts"}
    </button>}
  </>;
}
