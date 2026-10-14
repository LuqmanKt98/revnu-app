// POST /api/notifications/dispatch  { orderId? }  — send queued outbox rows (called by the
// browser right after an order transition, by any signed-in user; only queued rows are touched).
// POST { signingCode } without a session — the buyer's phone right after signing: only the queued rows
// of the order behind that signing link, and only once the link is signed.
// GET  /api/notifications/dispatch?secret=CRON_SECRET — sweeper for a scheduler (optional).
import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/session";
import { hasServiceRole, supabaseAdmin } from "@/lib/supabase/admin";
import { sendMail, mailMode } from "@/lib/email/mailer";
import { orderStatusMail, type Payment } from "@/lib/email/templates";

type PaymentDetails = { bankName?: string; bankNameAr?: string; accountName?: string; iban?: string; firstPct?: number | null; dueDays?: number | null; note?: string; noteAr?: string };

/** The "signed" e-mail's extras: units, the rep, the signed agreement's link and the first payment (same figures as R.paymentDue). */
async function signedExtras(admin: ReturnType<typeof supabaseAdmin>, o: { id: string; unit_price: number | null; furnish_cost: number | null; rep_id: string | null; unit_number: string | null }, pd: PaymentDetails | null, site: string) {
  const [units, link, rep] = await Promise.all([
    admin.from("order_units").select("unit_number, sort").eq("order_id", o.id).order("sort"),
    admin.from("signing_links").select("code, slug").eq("order_id", o.id).eq("status", "signed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    o.rep_id ? admin.from("profiles").select("name").eq("id", o.rep_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const total = (Number(o.unit_price) || 0) + (Number(o.furnish_cost) || 0); const pct = Number(pd?.firstPct) || 0;
  const payment: Payment | null = pd && pd.iban ? {
    total, pct, amount: pct > 0 ? Math.round((total * pct) / 100) : null, days: Number(pd.dueDays) || null, bank: pd.bankName || "", bankAr: pd.bankNameAr || "",
    holder: pd.accountName || "", iban: String(pd.iban).replace(/\s/g, "").toUpperCase(), note: pd.note || "", noteAr: pd.noteAr || "",
  } : null;
  const l = link.data as { code: string; slug: string | null } | null;
  return {
    units: ((units.data as { unit_number: string }[] | null) || []).map((u) => u.unit_number).filter(Boolean).concat(units.data && units.data.length ? [] : o.unit_number ? [o.unit_number] : []),
    signUrl: l && site ? `${site}/sign/${l.slug ? l.slug + "-" : ""}${l.code}` : null,
    repName: (rep.data as { name?: string } | null)?.name || null,
    payment,
  };
}

// Links in e-mails point where the request came from (the live domain on Vercel); the env var is the fallback.
async function dispatch(orderId?: string, origin?: string) {
  const site = origin || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (!hasServiceRole()) return { processed: 0, skipped: "service role not configured" };
  const admin = supabaseAdmin();
  // A claim older than this belongs to a dispatcher that stopped mid-send; the row is retried.
  const stale = new Date(Date.now() - 10 * 60e3).toISOString();
  const pick = () => { let q = admin.from("notifications").select("*").order("created_at").limit(50); if (orderId) q = q.eq("order_id", orderId); return q; };
  const [queued, stuck] = await Promise.all([pick().eq("status", "queued"), pick().eq("status", "sending").lt("sent_at", stale)]);
  if (queued.error) throw new Error(queued.error.message);
  if (stuck.error) throw new Error(stuck.error.message);
  let processed = 0;
  for (const n of [...(queued.data || []), ...(stuck.data || [])]) {
    // Claim the row before sending: of two dispatchers racing for it, only the one whose update matched sends the e-mail.
    let claim = admin.from("notifications").update({ status: "sending", sent_at: new Date().toISOString() }).eq("id", n.id);
    claim = n.status === "queued" ? claim.eq("status", "queued") : claim.eq("status", "sending").lt("sent_at", stale);
    const { data: mine, error: claimError } = await claim.select("id");
    if (claimError) throw new Error(claimError.message);
    if (!mine || !mine.length) continue;
    try {
      if (!n.to_email) { await admin.from("notifications").update({ status: "failed", error: "no recipient" }).eq("id", n.id); continue; }
      const { data: o } = await admin.from("orders").select("id, customer_name, developer_id, project_id, unit_number, unit_price, furnish_cost, rep_id, developers(name, name_ar), projects(name, name_ar, payment_details)").eq("id", n.order_id).maybeSingle();
      const dev = (o as unknown as { developers?: { name: string; name_ar: string | null } })?.developers;
      const proj = (o as unknown as { projects?: { name: string; name_ar: string | null; payment_details: PaymentDetails | null } })?.projects;
      const extras = n.kind === "signed" && o ? await signedExtras(admin, o, proj?.payment_details || null, site) : {};
      const mail = orderStatusMail(n.kind, {
        orderId: n.order_id, customerName: o?.customer_name, developerName: dev?.name || "Revnu", developerNameAr: dev?.name_ar,
        projectName: proj?.name, projectNameAr: proj?.name_ar, siteUrl: site, ...extras,
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

/** "noor-khuzam-AB2CDE" or "AB2CDE" → "AB2CDE" (the link alphabet has no I, O, 0 or 1). */
function signingCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().split("-").pop()?.toUpperCase() || "";
  return /^[A-HJ-NP-Z2-9]{6}$/.test(c) ? c : null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const origin = new URL(req.url).origin;
  const { user } = await currentSession();
  if (!user) {
    const code = signingCode(body.signingCode);
    if (!code || !hasServiceRole()) return NextResponse.json({ code: "SESSION_EXPIRED" }, { status: 401 });
    const { data: link } = await supabaseAdmin().from("signing_links").select("order_id, status").eq("code", code).maybeSingle();
    if (!link || link.status !== "signed") return NextResponse.json({ processed: 0 });
    try { return NextResponse.json(await dispatch(link.order_id, origin)); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  }
  try { return NextResponse.json(await dispatch(typeof body.orderId === "string" ? body.orderId : undefined, origin)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret") || req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try { return NextResponse.json(await dispatch(undefined, new URL(req.url).origin)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
