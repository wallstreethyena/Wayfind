// app/components/PoweredByStrip.js — companies, platforms, and AI models that
// power and represent Wayfind, rendered in the site footer.

export const POWERED_BY_PARTNERS = [
  { id: "google-antigravity", name: "Google Antigravity", src: "/brand/powered-by/google-antigravity.png", w: 76, h: 24, prefix: "Google" },
  { id: "grok", name: "Grok", src: "/brand/powered-by/grok.png", w: 22, h: 22, label: "Grok" },
  { id: "bots-team", name: "Bots Team", src: "/brand/powered-by/bots-team.png", w: 24, h: 22, label: "Bots Team" },
  { id: "muse-code", name: "Muse Code", src: "/brand/powered-by/muse-code.png", w: 96, h: 20 },
  { id: "claude", name: "Claude", src: "/brand/powered-by/claude.png", w: 22, h: 22, label: "Claude" },
  { id: "openai", name: "OpenAI", src: "/brand/powered-by/openai.png", w: 22, h: 22, label: "OpenAI" },
  { id: "github", name: "GitHub", src: "/brand/powered-by/github.png", w: 22, h: 22, label: "GitHub" },
  { id: "supabase", name: "Supabase", src: "/brand/powered-by/supabase.png", w: 22, h: 22, label: "Supabase" },
  { id: "vercel", name: "Vercel", src: "/brand/powered-by/vercel.png", w: 22, h: 22, label: "Vercel" },
  { id: "adobe-photoshop", name: "Adobe Photoshop", src: "/brand/powered-by/adobe-photoshop.png", w: 22, h: 22, label: "Adobe Photoshop" },
  { id: "adobe-stock", name: "Adobe Stock", src: "/brand/powered-by/adobe-stock.png", w: 22, h: 22, label: "Adobe Stock" },
  { id: "istock", name: "iStock", src: "/brand/powered-by/istock.png", w: 58, h: 20, lightBg: true },
  { id: "kimi", name: "Kimi", src: "/brand/powered-by/kimi.png", w: 22, h: 22, label: "Kimi" },
  { id: "llama", name: "Llama", src: "/brand/powered-by/llama.png", w: 22, h: 22, label: "Llama" },
  { id: "deepseek", name: "DeepSeek", src: "/brand/powered-by/deepseek.png", w: 22, h: 22, label: "DeepSeek" },
];

export default function PoweredByStrip({ compact = false } = {}) {
  return (
    <section
      aria-label="Companies and technology powering Wayfind"
      style={{
        marginTop: compact ? 18 : 24,
        paddingTop: compact ? 14 : 20,
        borderTop: "1px solid #1F2937",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          color: "#94A3B8",
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          marginBottom: 12,
        }}
      >
        Powered by &amp; built with
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: compact ? 8 : 10,
          maxWidth: compact ? 520 : 880,
          margin: "0 auto",
        }}
      >
        {POWERED_BY_PARTNERS.map((p) => (
          <div
            key={p.id}
            title={p.name}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 34,
              padding: "0 10px",
              borderRadius: 10,
              background: "#0D131D",
              border: "1px solid #1E293B",
              color: "#E2E8F0",
              fontSize: 11.5,
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {p.prefix ? <span style={{ color: "#CBD5E1", fontWeight: 700 }}>{p.prefix}</span> : null}
            <img
              src={p.src}
              alt={p.name}
              width={p.w}
              height={p.h}
              loading="lazy"
              decoding="async"
              style={{
                height: p.h,
                width: "auto",
                maxWidth: p.w,
                borderRadius: 5,
                objectFit: "contain",
                display: "block",
                background: p.lightBg ? "#F8FAFC" : undefined,
                padding: p.lightBg ? "2px 6px" : undefined,
              }}
            />
            {p.label ? <span>{p.label}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
