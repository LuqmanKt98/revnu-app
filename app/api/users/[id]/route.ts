// DELETE /api/users/:id — remove a team member: soft-delete the profile (RLS decides), then
// block the auth account so the person can no longer sign in. Order history keeps their name.
import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { hasServiceRole, supabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, profile } = await currentSession();
  if (!user || !profile) return NextResponse.json({ code: "SESSION_EXPIRED" }, { status: 401 });
  if (id === user.id) return NextResponse.json({ code: "GENERIC", detail: "You can't remove your own account." }, { status: 400 });

  const sb = await supabaseServer();
  const { data, error } = await sb.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id");
  if (error) return NextResponse.json({ code: "NOT_ALLOWED", detail: error.message }, { status: 403 });
  if (!data || data.length === 0) return NextResponse.json({ code: "NOT_ALLOWED" }, { status: 403 });

  if (hasServiceRole()) {
    await supabaseAdmin().auth.admin.updateUserById(id, { ban_duration: "876600h" }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
