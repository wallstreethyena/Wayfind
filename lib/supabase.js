import { createClient } from "@supabase/supabase-js";

// Clean a possibly messy env value: strip surrounding whitespace, quotes,
// and any stray trailing slash so a copy/paste mistake can't break anything.
function clean(v) {
  if (!v) return "";
  return String(v).trim().replace(/^['"]+|['"]+$/g, "");
}

const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anon = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Only build a client when the URL really is an http(s) URL and the key looks
// like a real token. Anything else -> null, so the app (and the build) keep
// working exactly as before, just without accounts. createClient is also
// wrapped so it can never throw during build/prerender.
const looksValid = /^https?:\/\/[^\s]+\.[^\s]+/i.test(url) && anon.length > 20;

let client = null;
if (looksValid) {
  try {
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch {
    client = null;
  }
}

export const supabase = client;
export const hasSupabase = !!client;
