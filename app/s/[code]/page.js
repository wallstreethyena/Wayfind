import Redirect from "./Redirect";

const SITE = "https://wayfind-xi.vercel.app";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function s(v) {
  if (Array.isArray(v)) return v[0] || "";
  return v || "";
}

// Look up the stored payload for a short share code.
async function lookupPayload(code) {
  if (!SUPA_URL || !SUPA_KEY) return null;
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/shared_lists?code=eq.${encodeURIComponent(code)}&select=payload`,
      { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }, cache: "no-store" }
    );
    const rows = await r.json();
    return rows && rows[0] && rows[0].payload ? rows[0].payload : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ searchParams }) {
  const t = s(searchParams.t) || "A few spots worth your time";
  const loc = s(searchParams.loc);
  const n = s(searchParams.n).replace(/[^0-9]/g, "");
  const desc =
    (n ? `${n} curated spots` : "Curated spots") +
    (loc ? ` in ${loc}` : "") +
    " · Tap to explore on Wayfind";
  const og = `/api/og?t=${encodeURIComponent(t)}&loc=${encodeURIComponent(loc)}&n=${encodeURIComponent(n)}&v=3`;
  return {
    metadataBase: new URL(SITE),
    title: `${t} · Wayfind`,
    description: desc,
    openGraph: {
      title: t,
      description: desc,
      type: "website",
      siteName: "Wayfind",
      images: [{ url: og, width: 1200, height: 630, alt: t }],
    },
    twitter: {
      card: "summary_large_image",
      title: t,
      description: desc,
      images: [og],
    },
  };
}

export default async function SharePage({ params, searchParams }) {
  const code = s(params.code);
  const t = s(searchParams.t) || "your Wayfind list";
  // Short codes (<= 12 chars) are stored in Supabase; long codes are the
  // self-contained payload from the fallback path.
  let payload = code;
  if (code.length <= 12) {
    const found = await lookupPayload(code);
    if (found) payload = found;
  }
  const target = `/?list=${payload}`;
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0D1117",
        color: "#F1F5F9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <Redirect to={target} />
      <div style={{ fontSize: 28, fontWeight: 800, color: "#F97316", letterSpacing: "1px", marginBottom: 14 }}>
        📍 WAYFIND
      </div>
      <div style={{ fontSize: 16, color: "#CBD5E1", marginBottom: 22 }}>Opening {t}…</div>
      <a
        href={target}
        style={{
          display: "inline-block",
          padding: "12px 22px",
          borderRadius: 999,
          background: "#F97316",
          color: "#0D1117",
          fontWeight: 800,
          fontSize: 15,
          textDecoration: "none",
        }}
      >
        Open in Wayfind
      </a>
    </div>
  );
}
