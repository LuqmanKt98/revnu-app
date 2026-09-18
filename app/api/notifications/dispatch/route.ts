// POST /api/notifications/dispatch  { orderId? }  — send queued outbox rows (called by the
// browser right after an order transition, by any signed-in user; only queued rows are touched).
// GET  /api/notifications/dispatch?secret=CRON_SECRET — sweeper for a scheduler (optional).
import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/session";
import { hasServiceRole, supabaseAdmin } from "@/lib/supabase/admin";
import { sendMail, mailMode } from "@/lib/email/mailer";
import { orderStatusMail } from "@/lib/email/templates";

async function dispatch(orderId?: string) {
  if (!hasServiceRole()) return { processed: 0, skipped: "service role not configured" };
  const admin = supabaseAdmin();
  let q = admin.from("notifications").select("*").eq("status", "queued").order("created_at").limit(50);
  if (orderId) q = q.eq("order_id", orderId);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  let processed = 0;
  for (const n of rows || []) {
    try {
      if (!n.to_email) { await admin.from("notifications").update({ status: "failed", error: "no recipient" }).eq("id", n.id); continue; }
      const { data: o } = await admin.from("orders").select("id, customer_name, developer_id, project_id, developers(name, name_ar), projects(name, name_ar)").eq("id", n.order_id).maybeSingle();
      const dev = (o as unknown as { developers?: { name: string; name_ar: string | null } })?.developers;
      const proj = (o as unknown as { projects?: { name: string; name_ar: string | null } })?.projects;
      const mail = orderStatusMail(n.kind, {
        orderId: n.order_id, customerName: o?.customer_name, developerName: dev?.name || "Revnu", developerNameAr: dev?.name_ar,
        projectName: proj?.name, projectNameAr: proj?.name_ar, siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "",
      });
      if (!mail) { await admin.from("notifications").update({ status: "failed", error: "no template for " + n.kind }).eq("id", n.id); continue; }
      const r = await sendMail({ to: n.to_email, subject: mail.subject, html: mail.html, text: mail.text });
      await admin.from("notifications").update({ status: r.status, sent_at: new Date().toISOString(), error: null }).eq("id", n.id);
      processed++;
    } catch (e) {
      await admin.from("notifications").update({ status: "failed", error: String((e as Error).message).slice(0, 500) }).eq("id", n.id);
    }
  }
  return { processed, mode: mailMode() };
}

export async function POST(req: Request) {
  const { user } = await currentSession();
  if (!user) return NextResponse.json({ code: "SESSION_EXPIRED" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try { return NextResponse.json(await dispatch(typeof body.orderId === "string" ? body.orderId : undefined)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret") || req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try { return NextResponse.json(await dispatch()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
