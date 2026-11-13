"use client";
// Mounts lib/fieldVitals.js on a standalone page (renders nothing).
import { useEffect } from "react";
import { startFieldVitals } from "../../lib/fieldVitals.js";

export default function FieldVitals() {
  useEffect(() => { startFieldVitals(window, { release: process.env.NEXT_PUBLIC_WF_BUILD || null }); }, []);
  return null;
}
