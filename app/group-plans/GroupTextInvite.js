"use client";
import { useEffect, useState } from "react";

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
    for (const number of numbers) {
      // A contact can share home and mobile. Let the organizer choose which one.
      choices.set(number, choices.get(number) === true || numbers.size === 1);
    }
  }
  return Array.from(choices, ([number, checked]) => ({ number, checked }));
}

export function GroupTextInvite({ body, single, onNotice }) {
  const [canPick, setCanPick] = useState(false);
  const [choices, setChoices] = useState([]);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    setCanPick(window.isSecureContext && typeof navigator.contacts?.select === "function");
  }, []);

  async function chooseContacts() {
    setPicking(true);
    try {
      const contacts = await navigator.contacts.select(["tel"], { multiple: true });
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
    // Use only in this click. Contact numbers never enter a link in the DOM,
    // a Wayfind request, persistent storage or an analytics event.
    window.location.assign(`sms:${selected.join(",")}${bodyQuery}`);
    onNotice("Review the recipients and send in your messaging app.");
  }

  return <>
    {choices.length > 0 ? <>
      <fieldset className="gp-field ph-no-capture" data-sentry-mask="">
        <legend>Numbers for this group text</legend>
        {choices.map(({ number, checked }) => <label key={number}>
          <input type="checkbox" checked={checked} onChange={() => setChoices((current) =>
            current.map((choice) => choice.number === number ? { ...choice, checked: !choice.checked } : choice)
          )}/> {number}
        </label>)}
        <span className="gp-note">Choose up to 10. These numbers stay on this device.</span>
      </fieldset>
      <button type="button" className="gp-button primary" disabled={selected.length === 0 || selected.length > 10}
        onClick={composeSelected}>{`Text ${selected.length} ${selected.length === 1 ? "number" : "numbers"}`}</button>
      <button type="button" className="gp-button" onClick={() => setChoices([])}>Clear numbers</button>
    </> : <a className="gp-button primary" href={`sms:${bodyQuery}`} onClick={() => onNotice("Choose recipients and send in your messaging app.")}>
      {single ? "Text your friend" : "Send one text to your group"}
    </a>}
    {canPick && <button type="button" className="gp-button" disabled={picking} onClick={chooseContacts}>
      {choices.length ? "Choose different contacts" : "Choose contacts"}
    </button>}
  </>;
}
