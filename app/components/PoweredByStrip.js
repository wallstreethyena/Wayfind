// app/components/PoweredByStrip.js — companies, platforms, and AI models that
// power and represent Wayfind, rendered in a single horizontal line in the site footer.

export const POWERED_BY_PARTNERS = [
  { id: "google-antigravity", name: "Google Antigravity", src: "/brand/powered-by/google-antigravity.png", w: 52, h: 16, prefix: "Google" },
  { id: "grok", name: "Grok", src: "/brand/powered-by/grok.png", w: 15, h: 15, label: "Grok" },
  { id: "bots-team", name: "Bots Team", src: "/brand/powered-by/bots-team.png", w: 17, h: 15, label: "Bots Team" },
  { id: "muse-code", name: "Muse Code", src: "/brand/powered-by/muse-code.png", w: 68, h: 14 },
  { id: "claude", name: "Claude", src: "/brand/powered-by/claude.png", w: 15, h: 15, label: "Claude" },
  { id: "openai", name: "OpenAI", src: "/brand/powered-by/openai.png", w: 15, h: 15, label: "OpenAI" },
  { id: "github", name: "GitHub", src: "/brand/powered-by/github.png", w: 15, h: 15, label: "GitHub" },
  { id: "supabase", name: "Supabase", src: "/brand/powered-by/supabase.png", w: 15, h: 15, label: "Supabase" },
  { id: "vercel", name: "Vercel", src: "/brand/powered-by/vercel.png", w: 15, h: 15, label: "Vercel" },
  { id: "kimi", name: "Kimi", src: "/brand/powered-by/kimi.png", w: 15, h: 15, label: "Kimi" },
  { id: "llama", name: "Llama", src: "/brand/powered-by/llama.png", w: 15, h: 15, label: "Llama" },
  { id: "deepseek", name: "DeepSeek", src: "/brand/powered-by/deepseek.png", w: 15, h: 15, label: "DeepSeek" },
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
          marginBottom: 10,
        }}
      >
        Powered by &amp; built with
      </div>
      <div
        data-wf-powered-by-scroll="1"
        style={{
          width: "100%",
          overflowX: "auto",
          overscrollBehaviorInline: "contain",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "nowrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            width: "max-content",
            minWidth: "100%",
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
                gap: 4,
                height: 28,
                padding: "0 6px",
                borderRadius: 8,
                background: "#0D131D",
                border: "1px solid #1E293B",
                color: "#E2E8F0",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1,
                whiteSpace: "nowrap",
                flexShrink: 0,
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
                  borderRadius: 4,
                  objectFit: "contain",
                  display: "block",
                }}
              />
              {p.label ? <span>{p.label}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
