// POST /api/users — invite a team member.
// 1. the auth account is created with the service role (no e-mail is sent),
// 2. the profile row is inserted with the CALLER's session, so Row Level Security decides
//    whether this person may add someone to that team,
// 3. the temporary password is returned ONCE to the admin's browser and never stored.
import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/access";
import { supabaseServer } from "@/lib/supabase/server";
import { hasServiceRole, supabaseAdmin } from "@/lib/supabase/admin";
import { tempPassword } from "@/lib/auth/temp-password";
import { profiles as profileMapper } from "@/lib/data/mappers";

export async function POST(req: Request) {
  const { user, profile } = await currentSession();
  if (!user || !profile) return NextResponse.json({ code: "SESSION_EXPIRED" }, { status: 401 });
  if (!hasServiceRole()) return NextResponse.json({ code: "SERVICE_ROLE_MISSING" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || body.nameAr || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return NextResponse.json({ code: "GENERIC", detail: "name and a valid email are required" }, { status: 400 });

  const developerId: string | null = body.role === "revnu_admin" ? null : (body.developerId || profile.developerId || null);
  if (!canManage(profile, developerId)) return NextResponse.json({ code: "NOT_ALLOWED" }, { status: 403 });

  const admin = supabaseAdmin();
  const pw = tempPassword();

  // Reactivate a previously removed colleague instead of failing on the unique email.
  const { data: existing } = await admin.from("profiles").select("id, deleted_at, developer_id").eq("email", email).maybeSingle();
  if (existing && !existing.deleted_at) return NextResponse.json({ code: "EMAIL_IN_USE" }, { status: 409 });

  let authId: string;
  if (existing) {
    authId = existing.id;
    const { error } = await admin.auth.admin.updateUserById(authId, { password: pw, ban_duration: "none", email_confirm: true });
    if (error) return NextResponse.json({ code: "GENERIC", detail: error.message }, { status: 500 });
    const { error: pe } = await admin.from("profiles").update({ deleted_at: null, must_change_password: true }).eq("id", authId);
    if (pe) return NextResponse.json({ code: "GENERIC", detail: pe.message }, { status: 500 });
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name } });
    if (error) {
      if (/already/i.test(error.message)) return NextResponse.json({ code: "EMAIL_IN_USE" }, { status: 409 });
      return NextResponse.json({ code: "GENERIC", detail: error.message }, { status: 500 });
    }
    authId = data.user.id;
  }

  // Profile under the caller's RLS.
  const sb = await supabaseServer();
  const row = profileMapper.toRow({
    id: authId, developerId, name, nameAr: body.nameAr || null, email,
    role: developerId ? (body.role || "sales_rep") : "revnu_admin", roleAr: body.roleAr || null,
    roleId: developerId ? null : (body.roleId || "team"),
    perms: body.perms || null, commissionLevelId: body.commissionLevelId || null, reportsTo: body.reportsTo || null,
    bank: body.bank || null, mustChangePassword: true,
  });
  const { data: inserted, error: insErr } = existing
    ? await sb.from("profiles").update(row).eq("id", authId).select().single()
    : await sb.from("profiles").insert(row).select().single();
  if (insErr) {
    if (!existing) await admin.auth.admin.deleteUser(authId).catch(() => {});
    const status = /row-level security|permission|not allowed/i.test(insErr.message) ? 403 : 400;
    return NextResponse.json({ code: status === 403 ? "NOT_ALLOWED" : "GENERIC", detail: insErr.message }, { status });
  }
  const projectIds: string[] = Array.isArray(body.assignedProjectIds) ? body.assignedProjectIds : [];
  await sb.from("profile_projects").delete().eq("profile_id", authId);
  if (projectIds.length) await sb.from("profile_projects").insert(projectIds.map((project_id) => ({ profile_id: authId, project_id })));

  return NextResponse.json({ profile: profileMapper.fromRow(inserted), tempPassword: pw });
}
