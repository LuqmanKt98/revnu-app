// POST /api/users/:id/reset-password — an admin issues a new temporary password for a colleague
// who is locked out (works before any e-mail service is live). Shown once, must be changed on sign-in.
import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { hasServiceRole, supabaseAdmin } from "@/lib/supabase/admin";
import { tempPassword } from "@/lib/auth/temp-password";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, profile } = await currentSession();
  if (!user || !profile) return NextResponse.json({ code: "SESSION_EXPIRED" }, { status: 401 });
  if (!hasServiceRole()) return NextResponse.json({ code: "SERVICE_ROLE_MISSING" }, { status: 503 });

  // May the caller manage this profile? Ask RLS by performing the flag update under their session.
  const sb = await supabaseServer();
  const { data, error } = await sb.from("profiles").update({ must_change_password: true }).eq("id", id).select("id, email");
  if (error || !data || data.length === 0) return NextResponse.json({ code: "NOT_ALLOWED" }, { status: 403 });

  const pw = tempPassword();
  const { error: aErr } = await supabaseAdmin().auth.admin.updateUserById(id, { password: pw, ban_duration: "none" });
  if (aErr) return NextResponse.json({ code: "GENERIC", detail: aErr.message }, { status: 500 });
  return NextResponse.json({ tempPassword: pw, email: data[0].email });
}
