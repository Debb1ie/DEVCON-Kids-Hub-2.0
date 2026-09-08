import { createClient } from "@supabase/supabase-js";

const runtimeEnv = import.meta.env || globalThis.process?.env || {};
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL || runtimeEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY || runtimeEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or the NEXT_PUBLIC equivalents.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Required so the browser client can carry the unresolved OAuth/PKCE state
    // from the redirect URL back into getSession() on /auth/callback.
    persistSession: true,
    // Use localStorage so session flags survive even if the callback page reloads.
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    // Faster getSession() polling when no session is present yet.
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Immediately check for session from URL on app load (triggers OAuth code exchange)
if (typeof window !== "undefined") {
  console.log("[Supabase Init] Checking for session in URL...");
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.warn("[Supabase Init] getSession() error:", error);
    } else {
      console.log(
        "[Supabase Init] getSession() result:",
        data?.session ? `user ${data.session.user.email}` : "no session",
      );
    }
  });
}
