import "server-only";
// Service-role client. ONLY for operations Postgres cannot do under the caller's
// session: creating auth users (invites), resetting passwords, dispatching e-mail.
// Never import this from a Client Component or expose its result to the browser.
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function hasServiceRole() { return !!process.env.SUPABASE_SERVICE_ROLE_KEY; }
