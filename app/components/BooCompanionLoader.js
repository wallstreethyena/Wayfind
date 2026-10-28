"use client";
// next/dynamic with ssr:false is only legal in a Client Component, and
// app/layout.js is a Server Component, so the lazy boundary lives here.
// BooCompanion lands in its own chunk and never touches the route bundle.
import dynamic from "next/dynamic";

const BooCompanion = dynamic(() => import("./BooCompanion"), { ssr: false });

export default function BooCompanionLoader() {
  return <BooCompanion />;
}
