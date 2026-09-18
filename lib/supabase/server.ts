// Server-side Supabase client bound to the request's cookies (Server Components, Route Handlers).
// Runs with the caller's JWT => every query is RLS-scoped exactly like the browser's.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return store.getAll(); },
      setAll(list) {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* called from a Server Component: proxy.ts already refreshed the session */ }
      },
    },
  });
}
