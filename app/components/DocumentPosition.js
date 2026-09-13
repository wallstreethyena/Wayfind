"use client";
import { useLayoutEffect } from "react";
import { installDocumentPosition } from "../../lib/documentPosition";
export default function DocumentPosition() {
  useLayoutEffect(() => installDocumentPosition(window), []);
  return null;
}
