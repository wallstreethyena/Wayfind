"use client";
import { useState } from "react";
import { GroupBallot } from "../GroupBallot.js";

// Preview only: the friend's vote page with nothing saved or sent.
export default function PreviewBallot({ plan }) {
  const [note, setNote] = useState("");
  return <>
    <GroupBallot plan={plan} busy={false} onCommand={(c) => setNote(c?.subscribeConsent ? "Preview only: on the live site this vote and text signup would be saved." : "Preview only: on the live site this vote would be saved.")} />
    {note && <p className="gp-status" role="status">{note}</p>}
  </>;
}
