"use client";
import { useEffect, useRef, useState } from "react";
import { openDirectInvite } from "../../lib/shareFlow.js";
import { placeKinds } from "../../lib/dateInvite.js";

const HeartSparkGlyph = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ display: "block", flex: "0 0 auto" }}
  >
    <path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 6a5 5 0 0 1 7.5 6.6Z" />
  </svg>
);

export default function AskSomeoneButton({
  url,
  title,
  name,
  city = "",
  placeId = "",
  category = "",
  types,
  when = "",
  eventDate = "",
  geo = "",
  surface = "direct",
  label = "Ask someone",
  className = "",
  style,
}) {
  const [said, setSaid] = useState("");
  const timer = useRef(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const subjectName = name || title || "";
  if (!subjectName && !url) return null;

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const kind = placeKinds({ name: subjectName, category, types });
    openDirectInvite(
      {
        url,
        title: subjectName,
        name: subjectName,
        city,
        placeId,
        kind,
        when,
        eventDate,
        geo,
        surface,
      },
      () => {
        setSaid("Invite copied");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setSaid(""), 2400);
      }
    );
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-wf-ask-someone={surface}
      aria-label={said || (subjectName ? `${label}: ${subjectName}` : label)}
      className={className || undefined}
      style={
        style || {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          minHeight: 42,
          padding: "10px 16px",
          borderRadius: 999,
          cursor: "pointer",
          font: "inherit",
          fontSize: 13.5,
          fontWeight: 800,
          lineHeight: 1,
          background: "rgba(249,115,22,0.12)",
          color: "#FDBA74",
          border: "1.5px solid rgba(249,115,22,0.42)",
          WebkitTapHighlightColor: "transparent",
        }
      }
    >
      <HeartSparkGlyph />
      <span aria-live="polite">{said || label}</span>
    </button>
  );
}
