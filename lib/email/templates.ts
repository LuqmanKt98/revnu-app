// Bilingual (EN + AR) e-mail templates for order status notifications.
// Copy mirrors the prototype's NOTIFY_TEMPLATES; the body adds the order reference and next step.
type Ctx = { orderId: string; customerName?: string | null; developerName: string; developerNameAr?: string | null; projectName?: string | null; projectNameAr?: string | null; siteUrl: string };

const COPY: Record<string, { subject: string; subjectAr: string; body: string; bodyAr: string }> = {
  issued: {
    subject: "Your agreement is ready to sign", subjectAr: "اتفاقيتك جاهزة للتوقيع",
    body: "Your purchase & investment agreement for order {order} has been prepared by {developer}. Your sales representative will share the document with you for signature.",
    bodyAr: "تم إعداد اتفاقية الشراء والاستثمار للطلب {order} من قبل {developer}. سيشاركك مندوب المبيعات المستند للتوقيع.",
  },
  signed: {
    subject: "Signed agreement received", subjectAr: "تم استلام الاتفاقية الموقّعة",
    body: "We have received your signed agreement for order {order}. The next step is the first payment under your unit purchase agreement.",
    bodyAr: "استلمنا اتفاقيتك الموقّعة للطلب {order}. الخطوة التالية هي الدفعة الأولى وفق عقد شراء الوحدة.",
  },
  paid: {
    subject: "Payment confirmed — welcome aboard", subjectAr: "تم تأكيد الدفع — أهلاً بك",
    body: "Your payment for order {order} has been confirmed. Welcome to {project}! Furnishing and installation are scheduled from the unit readiness date.",
    bodyAr: "تم تأكيد دفعتك للطلب {order}. أهلاً بك في {project}! تُجدول أعمال التأثيث والتركيب من تاريخ جاهزية الوحدة.",
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fill = (t: string, c: Ctx, ar: boolean) => t
  .replace("{order}", c.orderId)
  .replace("{developer}", (ar ? c.developerNameAr : null) || c.developerName)
  .replace("{project}", (ar ? c.projectNameAr : null) || c.projectName || (ar ? c.developerNameAr || c.developerName : c.developerName));

export function orderStatusMail(kind: string, c: Ctx) {
  const t = COPY[kind];
  if (!t) return null;
  const en = fill(t.body, c, false), ar = fill(t.bodyAr, c, true);
  const greetEn = c.customerName ? `Dear ${c.customerName},` : "Hello,";
  const greetAr = c.customerName ? `عزيزنا ${c.customerName}،` : "مرحبًا،";
  const html = `<!doctype html><html><body style="margin:0;background:#F8F5EE;font-family:Outfit,Arial,sans-serif;color:#080B14">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="background:#fff;border-radius:16px;padding:28px 28px 22px;border:1px solid rgba(8,11,20,.08)">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A93A6;margin-bottom:10px">${esc(c.developerName)} · ${esc(c.orderId)}</div>
    <h1 style="font-size:22px;margin:0 0 14px;font-weight:500">${esc(t.subject)}</h1>
    <p style="font-size:14.5px;line-height:1.6;margin:0 0 8px">${esc(greetEn)}</p>
    <p style="font-size:14.5px;line-height:1.6;margin:0 0 22px">${esc(en)}</p>
    <hr style="border:0;border-top:1px solid rgba(8,11,20,.08);margin:18px 0" />
    <div dir="rtl" style="text-align:right;font-family:Almarai,Tahoma,Arial,sans-serif">
      <h2 style="font-size:20px;margin:0 0 12px;font-weight:500">${esc(t.subjectAr)}</h2>
      <p style="font-size:14.5px;line-height:1.7;margin:0 0 8px">${esc(greetAr)}</p>
      <p style="font-size:14.5px;line-height:1.7;margin:0">${esc(ar)}</p>
    </div>
  </div>
  <div style="text-align:center;font-size:11px;color:#8A93A6;margin-top:16px">Powered by Revnu · ${esc(c.siteUrl)}</div>
</div></body></html>`;
  const text = `${greetEn}\n\n${en}\n\n---\n\n${greetAr}\n\n${ar}\n\n— ${c.developerName} · Powered by Revnu`;
  return { subject: `${t.subject} · ${t.subjectAr}`, html, text };
}
