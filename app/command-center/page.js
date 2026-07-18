// /command-center — the owner-only Wayfind operating dashboard.
//
// Server shell only: real authorization happens per-request in
// /api/command-center/* (lib/commandCenter/auth.js). The route is noindexed
// and deliberately absent from app/sitemap.js — private tooling, not content.

import CommandCenter from "./ui";

export const metadata = {
  title: "Wayfind Command Center",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: null },
};

export default function Page() {
  return <CommandCenter />;
}
