// Bilingual (EN + AR) e-mail templates for order status notifications.
// Copy mirrors the prototype's NOTIFY_TEMPLATES; the body adds the order reference and next step.
// When the project has payment details, the "signed" e-mail carries the first payment and where to send it
// (the same figures as the buyer's signed screen and the rep's WhatsApp: R.paymentDue in lib/data/remote.js).
export type Payment = { total: number; pct: number; amount: number | null; days: number | null; bank: string; bankAr: string; holder: string; iban: string; note: string; noteAr: string };
type Ctx = {
  orderId: string; customerName?: string | null; developerName: string; developerNameAr?: string | null; projectName?: string | null; projectNameAr?: string | null; siteUrl: string;
  units?: string[]; signUrl?: string | null; repName?: string | null; payment?: Payment | null;
};

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
  // "signed", when the project has payment details
  signed_pay: {
    subject: "Agreement signed — your first payment", subjectAr: "تم توقيع العقد — الدفعة الأولى",
    body: "Thank you for signing the agreement for order {order}{units}. The next step is the first payment; the details are below. Please use the order number as the transfer reference.",
    bodyAr: "شكرًا لتوقيعك اتفاقية الطلب {order}{units}. الخطوة التالية هي الدفعة الأولى، وتجد تفاصيلها أدناه. يرجى استخدام رقم الطلب مرجعًا للتحويل.",
  },
  paid: {
    subject: "Payment confirmed — welcome aboard", subjectAr: "تم تأكيد الدفع — أهلاً بك",
    body: "Your payment for order {order} has been confirmed. Welcome to {project}! Furnishing and installation are scheduled from the unit readiness date.",
    bodyAr: "تم تأكيد دفعتك للطلب {order}. أهلاً بك في {project}! تُجدول أعمال التأثيث والتركيب من تاريخ جاهزية الوحدة.",
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const sar = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
const iban = (v: string) => v.replace(/(.{4})/g, "$1 ").trim();
const daysEn = (n: number) => n + (n === 1 ? " day" : " days");
const daysAr = (n: number) => (n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n >= 3 && n <= 10 ? n + " أيام" : n + " يومًا");
const ltr = (s: string) => "‪" + s + "‬";   // a unit number inside Arabic text keeps its order (14094-A-5-1-202)
const fill = (t: string, c: Ctx, ar: boolean) => t
  .replace("{order}", c.orderId)
  .replace("{units}", c.units && c.units.length ? (ar ? " (" + (c.units.length > 1 ? "الوحدات " : "الوحدة ") + c.units.map(ltr).join("، ") + ")" : " (" + (c.units.length > 1 ? "units " : "unit ") + c.units.join(", ") + ")") : "")
  .replace("{developer}", (ar ? c.developerNameAr : null) || c.developerName)
  .replace("{project}", (ar ? c.projectNameAr : null) || c.projectName || (ar ? c.developerNameAr || c.developerName : c.developerName));

/** The payment block: label / value rows, the note, and the button to the signed agreement. */
function paymentRows(p: Payment, orderId: string, ar: boolean): [string, string, boolean?][] {
  return [
    ...(p.amount != null ? [[ar ? "المبلغ" : "Amount", ar ? `${sar(p.amount)} ريال (${p.pct}% من ${sar(p.total)} ريال)` : `SAR ${sar(p.amount)} (${p.pct}% of SAR ${sar(p.total)})`] as [string, string]] : []),
    ...(p.days ? [[ar ? "السداد خلال" : "Pay within", ar ? daysAr(p.days) : daysEn(p.days)] as [string, string]] : []),
    [ar ? "البنك" : "Bank", (ar ? p.bankAr || p.bank : p.bank || p.bankAr)],
    [ar ? "اسم الحساب" : "Account name", p.holder],
    ["IBAN", iban(p.iban), true],
    [ar ? "المرجع" : "Reference", orderId, true],
  ];
}
function paymentHtml(c: Ctx, ar: boolean) {
  const p = c.payment as Payment; const note = ar ? p.noteAr || p.note : p.note || p.noteAr;
  const rows = paymentRows(p, c.orderId, ar).map(([k, v, mono]) =>
    `<tr><td style="padding:7px 0;color:#8A93A6;font-size:13px;vertical-align:top;width:38%">${esc(k)}</td><td style="padding:7px 0;font-size:14px;font-weight:600;${mono ? "font-family:Consolas,Menlo,monospace;direction:ltr;unicode-bidi:embed;" : ""}">${esc(v)}</td></tr>`).join("");
  const btn = c.signUrl ? `<a href="${esc(c.signUrl)}" style="display:inline-block;background:#080B14;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:14px;margin-top:6px">${ar ? "عرض العقد الموقّع" : "View your signed agreement"}</a>` : "";
  const rep = c.repName ? `<p style="font-size:13px;line-height:1.6;color:#555F73;margin:14px 0 0">${esc(ar ? `لأي استفسار، مندوب المبيعات ${c.repName} في خدمتك.` : `Questions? Your sales rep ${c.repName} is happy to help.`)}</p>` : "";
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:4px 0 12px;border-top:1px solid rgba(8,11,20,.08);border-bottom:1px solid rgba(8,11,20,.08)">${rows}</table>`
    + (note ? `<p style="font-size:13.5px;line-height:1.6;margin:0 0 12px">${esc(note)}</p>` : "") + btn + rep;
}
function paymentText(c: Ctx, ar: boolean) {
  const p = c.payment as Payment; const note = ar ? p.noteAr || p.note : p.note || p.noteAr;
  return paymentRows(p, c.orderId, ar).map(([k, v]) => `${k}: ${v}`).join("\n") + (note ? "\n" + note : "")
    + (c.signUrl ? "\n\n" + (ar ? "العقد الموقّع: " : "Your signed agreement: ") + c.signUrl : "")
    + (c.repName ? "\n" + (ar ? `لأي استفسار، مندوب المبيعات ${c.repName} في خدمتك.` : `Questions? Your sales rep ${c.repName} is happy to help.`) : "");
}

export function orderStatusMail(kind: string, c: Ctx) {
  const pay = kind === "signed" && !!c.payment;
  const t = COPY[pay ? "signed_pay" : kind];
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
    <p style="font-size:14.5px;line-height:1.6;margin:0 0 ${pay ? 12 : 22}px">${esc(en)}</p>
    ${pay ? paymentHtml(c, false) : ""}
    <hr style="border:0;border-top:1px solid rgba(8,11,20,.08);margin:18px 0" />
    <div dir="rtl" style="text-align:right;font-family:Almarai,Tahoma,Arial,sans-serif">
      <h2 style="font-size:20px;margin:0 0 12px;font-weight:500">${esc(t.subjectAr)}</h2>
      <p style="font-size:14.5px;line-height:1.7;margin:0 0 8px">${esc(greetAr)}</p>
      <p style="font-size:14.5px;line-height:1.7;margin:0${pay ? " 0 12px" : ""}">${esc(ar)}</p>
      ${pay ? paymentHtml(c, true) : ""}
    </div>
  </div>
  <div style="text-align:center;font-size:11px;color:#8A93A6;margin-top:16px">Powered by Revnu · ${esc(c.siteUrl)}</div>
</div></body></html>`;
  const text = `${greetEn}\n\n${en}${pay ? "\n\n" + paymentText(c, false) : ""}\n\n---\n\n${greetAr}\n\n${ar}${pay ? "\n\n" + paymentText(c, true) : ""}\n\n— ${c.developerName} · Powered by Revnu`;
  return { subject: `${t.subject} · ${t.subjectAr}`, html, text };
}
