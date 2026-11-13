"use client";
import { useEffect } from "react";
import { preserveRedirectParams } from "../../../lib/preserveRedirectParams.js";

export default function Redirect({ to }) {
  useEffect(() => {
    const dest = preserveRedirectParams(
      to,
      typeof window !== "undefined" ? window.location.search : "",
      typeof window !== "undefined" ? window.location.pathname : "",
    );
    const id = setTimeout(() => { window.location.replace(dest); }, 50);
    return () => clearTimeout(id);
  }, [to]);
  return null;
}
