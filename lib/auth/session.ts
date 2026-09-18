// Server-side session helpers used by the portal gates and route handlers.
import { supabaseServer } from "@/lib/supabase/server";
import { profiles as profileMapper } from "@/lib/data/mappers";
import { destinationFor, type ProfileLike } from "@/lib/auth/routing";

export type SessionInfo = { user: { id: string; email?: string } | null; profile: ProfileLike | null };

export async function currentSession(): Promise<SessionInfo> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { user: null, profile: null };
  const { data } = await sb.from("profiles_v").select("*").eq("id", user.id).maybeSingle();
  return { user: { id: user.id, email: user.email ?? undefined }, profile: data ? (profileMapper.fromRow(data) as ProfileLike) : null };
}

export { destinationFor };
