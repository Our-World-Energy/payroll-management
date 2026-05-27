import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Reads the public env vars that Next inlines
// into the client bundle. Use inside Client Components / event handlers.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
