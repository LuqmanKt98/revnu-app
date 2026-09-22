// support.js — guided walkthrough (first sign-in + replay button), support tickets that land in the
// Revnu admin, and the document picker. Ported from the prototype; tickets now persist to the
// database and files go to Supabase Storage through the store (no base64 in localStorage).
"use client";
import React from "react";
import D from "./store";
import api from "./api";

let installed = false;
export function installSupport() {
  if (installed || typeof window === "undefined") return window.RevnuSupport;
  installed = true;

  const AR = () => !!(window.I18N && window.I18N.isAR);
  const L = (en, ar) => (AR() ? ar : en);
  const css = document.createElement("style");
  css.textContent = `
.rs-dim{position:fixed;inset:0;z-index:900;pointer-events:none}
.rs-spot{position:fixed;z-index:901;border-radius:12px;box-shadow:0 0 0 9999px rgba(8,11,20,0.62),0 0 0 3px var(--brand,#2a6fdb);transition:all .25s ease;pointer-events:none}
.rs-tip{position:fixed;z-index:902;width:320px;max-width:calc(100vw - 24px);background:var(--bg-card,#fff);color:var(--text,#111);border-radius:14px;padding:16px 18px;box-shadow:0 24px 60px rgba(0,0,0,.35);font-size:13px;line-height:1.55}
.rs-tip .rs-k{font-family:var(--font-mono,monospace);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-soft,#777);margin-bottom:4px}
.rs-tip h4{margin:0 0 6px;font-size:15px}
.rs-tip .rs-row{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:14px}
.rs-modal{position:fixed;inset:0;z-index:950;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:20px}
.rs-card{width:480px;max-width:100%;background:var(--bg-card,#fff);border-radius:16px;padding:22px 24px;box-shadow:0 24px 60px rgba(0,0,0,.35);color:var(--text,#111)}
.rs-card label{display:block;font-size:12px;color:var(--text-soft,#777);margin:12px 0 5px}
.rs-toast{position:fixed;bottom:22px;inset-inline-start:22px;z-index:960;background:var(--ink,#111);color:#fff;padding:10px 14px;border-radius:10px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:min(520px,calc(100vw - 44px));line-height:1.45}
.rs-toast.rs-err{background:#a63a2b}
.rs-toast.rs-ok{background:#1f8a5b}
.rs-btns{display:inline-flex;gap:6px;align-items:center}
.rs-btns .btn{height:32px}
.rs-busy{position:fixed;inset:0;z-index:970;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.55);backdrop-filter:blur(1px)}
.rs-busy .rs-card{width:auto;padding:16px 22px;font-size:13px;display:flex;gap:12px;align-items:center}
.rs-spin{width:18px;height:18px;border-radius:50%;border:2.5px solid var(--line-strong,#ccc);border-top-color:var(--brand,#2a6fdb);animation:rs-spin .8s linear infinite}
@keyframes rs-spin{to{transform:rotate(360deg)}}
`;
  document.head.appendChild(css);

  /* ---------------- toasts + busy overlay ---------------- */
  function toast(msg, kind) {
    const el = document.createElement("div"); el.className = "rs-toast" + (kind ? " rs-" + kind : ""); el.textContent = msg; document.body.appendChild(el);
    setTimeout(() => el.remove(), kind === "err" ? 6000 : 3200);
  }
  /** Show the friendly message of any error (ApiError or otherwise). */
  function fail(e) {
    const msg = e && typeof e.friendly === "function" ? e.friendly(AR()) : L("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى.");
    if (e && e.code === "SESSION_EXPIRED") { toast(msg, "err"); setTimeout(() => { location.href = "/login?next=" + encodeURIComponent(location.pathname + location.search); }, 1200); return; }
    toast(msg, "err");
    if (e && e.code === "GENERIC") console.error(e.raw || e);
  }
  let busyEl = null;
  function busy(msg) {
    if (busyEl) busyEl.remove();
    busyEl = document.createElement("div"); busyEl.className = "rs-busy"; busyEl.dir = AR() ? "rtl" : "ltr";
    busyEl.innerHTML = '<div class="rs-card"><span class="rs-spin"></span><span>' + (msg || L("Saving…", "جارٍ الحفظ…")) + "</span></div>";
    document.body.appendChild(busyEl);
    return () => { if (busyEl) { busyEl.remove(); busyEl = null; } };
  }
  /** Run an async action with a busy overlay, a success toast and friendly error handling. */
  async function act(fn, { pending, done } = {}) {
    const stop = busy(pending);
    try { const r = await fn(); if (done && r !== null) toast(done, "ok"); return r === undefined ? true : r; }   // undefined is reserved for "failed"; null is a soft-reject the caller messages itself
    catch (e) { fail(e); return undefined; }
    finally { stop(); }
  }

  /* ---------------- tickets ---------------- */
  const load = () => D.TICKETS;
  async function createTicket(t) {
    const rec = await api.tickets.create(Object.assign({ page: location.pathname + location.search }, t));
    await D.refresh(["supportTickets"]);
    return rec;
  }
  async function updateTicket(id, patch) { await api.tickets.update(id, patch); await D.refresh(["supportTickets"]); return D.TICKETS.find((x) => x.id === id) || null; }
  async function addReply(id, text) { await api.tickets.reply(id, text); await D.refresh(["supportTickets"]); }

  function openTicketModal() {
    const m = document.createElement("div"); m.className = "rs-modal"; m.dir = AR() ? "rtl" : "ltr";
    m.innerHTML = '<div class="rs-card">' +
      '<div class="eyebrow" style="margin-bottom:4px">// ' + L("SUPPORT", "الدعم") + '</div>' +
      '<h3 style="margin:0 0 4px;font-size:18px">' + L("Raise a ticket", "إرسال بلاغ / طلب دعم") + '</h3>' +
      '<div style="font-size:12.5px;color:var(--text-soft)">' + L("Goes straight to the Revnu team. We reply here and by email.", "يصل مباشرةً إلى فريق Revnu. نردّ هنا وعبر البريد.") + '</div>' +
      '<label>' + L("Type", "النوع") + '</label><select class="select" id="rs-type"><option value="bug">' + L("Something is broken", "خلل في النظام") + '</option><option value="question">' + L("Question / how do I…", "سؤال / كيف أقوم بـ…") + '</option><option value="request">' + L("Change or new feature", "تعديل أو ميزة جديدة") + '</option><option value="billing">' + L("Payments / invoices", "المدفوعات / الفواتير") + '</option></select>' +
      '<label>' + L("Subject", "العنوان") + '</label><input class="input" id="rs-subj" placeholder="' + L("Short title", "عنوان مختصر") + '" />' +
      '<label>' + L("Details", "التفاصيل") + '</label><textarea class="input" id="rs-body" rows="4" style="height:auto;padding-top:8px" placeholder="' + L("What happened, on which order / page?", "ماذا حدث، وفي أي طلب / صفحة؟") + '"></textarea>' +
      '<div class="rs-row" style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button class="btn btn-ghost" id="rs-cancel">' + L("Cancel", "إلغاء") + '</button><button class="btn btn-primary" id="rs-send">' + L("Send to Revnu", "إرسال إلى Revnu") + '</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    m.querySelector("#rs-cancel").onclick = () => m.remove();
    m.querySelector("#rs-send").onclick = async () => {
      const subject = m.querySelector("#rs-subj").value.trim(); const body = m.querySelector("#rs-body").value.trim();
      if (!subject) { m.querySelector("#rs-subj").focus(); return; }
      const btn = m.querySelector("#rs-send"); btn.disabled = true; btn.textContent = L("Sending…", "جارٍ الإرسال…");
      try {
        const rec = await createTicket({ type: m.querySelector("#rs-type").value, subject, body });
        m.remove(); toast(L("Ticket " + rec.id + " sent to Revnu.", "أُرسل البلاغ " + rec.id + " إلى Revnu."), "ok");
      } catch (e) { btn.disabled = false; btn.textContent = L("Send to Revnu", "إرسال إلى Revnu"); fail(e); }
    };
    setTimeout(() => m.querySelector("#rs-subj").focus(), 30);
  }

  /* ---------------- one-time credentials dialog (invites / password resets) ---------------- */
  function showCredentials({ name, email, password, reset }) {
    const m = document.createElement("div"); m.className = "rs-modal"; m.dir = AR() ? "rtl" : "ltr";
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    m.innerHTML = '<div class="rs-card">' +
      '<div class="eyebrow" style="margin-bottom:4px">// ' + (reset ? L("PASSWORD RESET", "إعادة تعيين كلمة المرور") : L("ACCOUNT CREATED", "تم إنشاء الحساب")) + '</div>' +
      '<h3 style="margin:0 0 6px;font-size:18px">' + esc(name) + '</h3>' +
      '<div style="font-size:12.5px;color:var(--text-soft);line-height:1.55">' + (reset
        ? L("Share this temporary password privately (in person or by phone). They will be asked to choose a new one when they sign in.", "شارك كلمة المرور المؤقتة بشكل خاص (شخصيًا أو هاتفيًا). سيُطلب منه اختيار كلمة مرور جديدة عند تسجيل الدخول.")
        : L("The account is ready. Share these details privately — the temporary password is shown only once and must be changed at first sign-in.", "الحساب جاهز. شارك هذه البيانات بشكل خاص — تظهر كلمة المرور المؤقتة مرة واحدة فقط ويجب تغييرها عند أول تسجيل دخول.")) + '</div>' +
      '<label>' + L("Sign-in page", "صفحة الدخول") + '</label><div class="rv-secret">' + esc(location.origin + "/login") + '</div>' +
      '<label>' + L("Email", "البريد") + '</label><div class="rv-secret">' + esc(email) + '</div>' +
      '<label>' + L("Temporary password", "كلمة المرور المؤقتة") + '</label><div class="rv-secret"><strong id="rs-pw">' + esc(password) + '</strong><button class="btn btn-sm btn-secondary" id="rs-copy">' + L("Copy", "نسخ") + '</button></div>' +
      '<div class="rs-row" style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn btn-secondary" id="rs-copyall">' + L("Copy all", "نسخ الكل") + '</button><button class="btn btn-primary" id="rs-done">' + L("Done", "تم") + '</button></div></div>';
    document.body.appendChild(m);
    const copy = (txt, btn) => { navigator.clipboard && navigator.clipboard.writeText(txt).then(() => { const t = btn.textContent; btn.textContent = L("Copied ✓", "تم النسخ ✓"); setTimeout(() => { btn.textContent = t; }, 1600); }).catch(() => toast(L("Select and copy the text manually.", "حدّد النص وانسخه يدويًا."))); };
    m.querySelector("#rs-copy").onclick = (e) => copy(password, e.currentTarget);
    m.querySelector("#rs-copyall").onclick = (e) => copy([L("Sign in: ", "تسجيل الدخول: ") + location.origin + "/login", L("Email: ", "البريد: ") + email, L("Temporary password: ", "كلمة المرور المؤقتة: ") + password].join("\n"), e.currentTarget);
    m.querySelector("#rs-done").onclick = () => m.remove();
  }

  /* ---------------- file picker (returns the File; upload happens in the store) ---------------- */
  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = accept || ".pdf,image/*"; inp.style.display = "none";
      document.body.appendChild(inp);
      inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); resolve(f || null); };
      inp.click();
      setTimeout(() => { if (document.body.contains(inp)) { window.addEventListener("focus", () => setTimeout(() => { if (document.body.contains(inp)) { inp.remove(); resolve(null); } }, 400), { once: true }); } }, 0);
    });
  }
  /** Pick + upload a document for an order, with progress and friendly errors. Resolves the document row or null. */
  async function uploadFor(order, kind, milestoneId, accept) {
    const f = await pickFile(accept || ".pdf,image/*");
    if (!f) return null;
    return act(() => D.uploadOrderDocument(order, kind, f, milestoneId), {
      pending: L("Uploading " + f.name + "…", "جارٍ رفع " + f.name + "…"),
      done: L("Uploaded " + f.name + ".", "تم رفع " + f.name + "."),
    });
  }
  const openDocument = (doc) => act(() => D.openDocument(doc), { pending: L("Opening…", "جارٍ الفتح…") });

  /* ---------------- tour ---------------- */
  const TOURS = {};
  function defineTour(portal, steps) { TOURS[portal] = steps; }
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  function byText(sel, re) { return [...document.querySelectorAll(sel)].find((e) => vis(e) && re.test(e.textContent || "")) || null; }
  function startTour(portal) {
    const steps = (TOURS[portal] || []).map((s) => ({ ...s, el: typeof s.find === "function" ? s.find() : document.querySelector(s.find) })).filter((s) => s.el && vis(s.el));
    if (!steps.length) return toast(L("Nothing to show on this screen yet.", "لا يوجد ما يُعرض في هذه الشاشة بعد."));
    let i = 0;
    const dim = document.createElement("div"); dim.className = "rs-dim";
    const spot = document.createElement("div"); spot.className = "rs-spot";
    const tip = document.createElement("div"); tip.className = "rs-tip"; tip.dir = AR() ? "rtl" : "ltr";
    document.body.append(dim, spot, tip);
    const close = () => { dim.remove(); spot.remove(); tip.remove(); window.removeEventListener("resize", place); };
    const place = () => {
      const s = steps[i]; const r = s.el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 60) window.scrollTo({ top: window.scrollY + r.top - 120, behavior: "smooth" });
      const rr = s.el.getBoundingClientRect();
      spot.style.left = (rr.left - 8) + "px"; spot.style.top = (rr.top - 8) + "px"; spot.style.width = (rr.width + 16) + "px"; spot.style.height = (rr.height + 16) + "px";
      tip.innerHTML = '<div class="rs-k">' + L("Step", "الخطوة") + " " + (i + 1) + " / " + steps.length + '</div><h4>' + (AR() ? (s.titleAr || s.title) : s.title) + '</h4><div style="color:var(--text-muted)">' + (AR() ? (s.bodyAr || s.body) : s.body) + '</div>' +
        '<div class="rs-row"><button class="btn btn-ghost btn-sm" id="rs-skip">' + L("Skip tour", "تخطّي الدليل") + '</button><span class="rs-btns">' + (i > 0 ? '<button class="btn btn-secondary btn-sm" id="rs-prev">' + L("Back", "رجوع") + '</button>' : "") + '<button class="btn btn-primary btn-sm" id="rs-next">' + (i === steps.length - 1 ? L("Done", "تم") : L("Next", "التالي")) + '</button></span></div>';
      const tw = 320, th = tip.offsetHeight || 160;
      let top = rr.bottom + 14; if (top + th > window.innerHeight - 12) top = Math.max(12, rr.top - th - 14);
      let left = Math.min(Math.max(12, rr.left), window.innerWidth - tw - 12);
      tip.style.top = top + "px"; tip.style.left = left + "px";
      tip.querySelector("#rs-skip").onclick = close;
      tip.querySelector("#rs-next").onclick = () => { if (i >= steps.length - 1) return close(); i++; place(); };
      const p = tip.querySelector("#rs-prev"); if (p) p.onclick = () => { i = Math.max(0, i - 1); place(); };
    };
    window.addEventListener("resize", place);
    place();
  }
  function firstRun(portal) {
    const s = D.me(); const k = "revnu_tour_done_" + portal + "_" + ((s && s.id) || "anon");
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, "1"); } catch (e) { return; }
    setTimeout(() => startTour(portal), 1400);
  }

  /* ---------------- React button group (tour + ticket) ---------------- */
  function SupportButtons(props) {
    const portal = props.portal;
    return React.createElement("span", { className: "rs-btns", "data-support-buttons": "1" },
      React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", title: L("Guided walkthrough", "الدليل التعريفي"), onClick: () => startTour(portal) }, "◎ " + L("Walkthrough", "الدليل")),
      props.noTicket ? null : React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", title: L("Raise a support ticket", "إرسال بلاغ للدعم"), onClick: openTicketModal }, "✉ " + L("Support", "الدعم"))
    );
  }

  /* ---------------- default tours (verbatim) ---------------- */
  const side = (re) => () => byText(".side-link", re);
  defineTour("developer", [
    { find: side(/Dashboard|لوحة/), title: "Your dashboard", titleAr: "لوحتك", body: "Live deals, extras sold and units in operations across your projects.", bodyAr: "الصفقات الحيّة والإضافات المباعة والوحدات في التشغيل عبر مشاريعك." },
    { find: side(/^Orders|الطلبات/), title: "Orders", titleAr: "الطلبات", body: "Every deal moves Submitted → Contract issued → Signed (upload the signed agreement) → Customer paid (upload proof of payment).", bodyAr: "كل صفقة تمرّ: مُقدَّمة ← صدر العقد ← موقّع (ارفع العقد الموقّع) ← دفع العميل (ارفع إثبات الدفع)." },
    { find: side(/Revnu payments|مدفوعات/), title: "Revnu payments", titleAr: "مدفوعات Revnu", body: "What is owed to Revnu per order once the customer has paid — Revnu confirms each milestone against your proof.", bodyAr: "المستحق لـ Revnu عن كل طلب بعد دفع العميل — تؤكّد Revnu كل دفعة مقابل إثبات التحويل." },
    { find: side(/Inventory|المخزون/), title: "Inventory", titleAr: "المخزون", body: "Units, types and status. Units in a live deal are locked automatically.", bodyAr: "الوحدات وأنواعها وحالتها. الوحدات في صفقة حيّة تُقفل تلقائيًا." },
    { find: side(/Users|المستخدمون|الصلاحيات/), title: "Users & roles", titleAr: "المستخدمون والصلاحيات", body: "Invite your team, set what each person can see and do, and their commission level and IBAN.", bodyAr: "ادعُ فريقك، وحدّد ما يراه ويفعله كل شخص، ومستوى عمولته وآيبانه." },
    { find: () => document.querySelector("[data-support-buttons]"), title: "Help is here", titleAr: "المساعدة هنا", body: "Replay this walkthrough any time, or raise a ticket that lands with the Revnu team.", bodyAr: "أعد هذا الدليل في أي وقت، أو أرسل بلاغًا يصل مباشرةً إلى فريق Revnu." },
  ]);
  defineTour("rep", [
    { find: side(/My deals|صفقاتي/), title: "My deals", titleAr: "صفقاتي", body: "Your board. Drag or click to move a deal forward; some steps ask for a document first.", bodyAr: "لوحتك. حرّك الصفقة للأمام؛ بعض الخطوات تطلب مستندًا أولًا." },
    { find: () => byText("a.btn, button.btn", /New order|طلب جديد/), title: "Start a sale", titleAr: "ابدأ عملية بيع", body: "Customer → units → design → package → smart home → operating model → calculator → agreement.", bodyAr: "العميل ← الوحدات ← التصميم ← الباقة ← المنزل الذكي ← التشغيل ← الحاسبة ← الاتفاقية." },
    { find: side(/earnings|أرباحي/), title: "My earnings", titleAr: "أرباحي", body: "Commission is earned on the ex-VAT extras once the customer's first payment lands.", bodyAr: "تُستحق العمولة على قيمة الإضافات بدون الضريبة بعد وصول دفعة العميل الأولى." },
    { find: () => document.querySelector("[data-support-buttons]"), title: "Help is here", titleAr: "المساعدة هنا", body: "Replay this walkthrough, or raise a ticket to Revnu.", bodyAr: "أعد الدليل أو أرسل بلاغًا إلى Revnu." },
  ]);
  defineTour("sales", [
    { find: ".progress-strip", title: "The sale in 8 steps", titleAr: "البيع في 8 خطوات", body: "Each step must be complete before you continue. Optional features can be skipped when the project allows it.", bodyAr: "كل خطوة يجب إكمالها قبل المتابعة. الميزات الاختيارية يمكن تخطّيها إذا سمح المشروع." },
    { find: ".step-area", title: "Work with the customer here", titleAr: "اعمل مع العميل هنا", body: "Pick units, see plans and 3D renders, choose the design palette, package and operating model. Multi-unit deals can be configured per unit.", bodyAr: "اختر الوحدات، شاهد المخططات واللقطات ثلاثية الأبعاد، واختر لوحة الألوان والباقة ونموذج التشغيل. يمكن تجهيز صفقات الوحدات المتعددة لكل وحدة." },
    { find: ".action-bar", title: "Continue · Submit", titleAr: "متابعة · إرسال", body: "The last step shows the full agreement — download it as Word or PDF for signature, then submit the order.", bodyAr: "الخطوة الأخيرة تعرض الاتفاقية كاملة — نزّلها Word أو PDF للتوقيع، ثم أرسل الطلب." },
  ]);
  defineTour("revnu", [
    { find: side(/Dashboard|لوحة/), title: "Revnu dashboard", titleAr: "لوحة Revnu", body: "Income flow, deals in progress and units locked for operations across all developers.", bodyAr: "تدفّق الدخل والصفقات قيد التنفيذ والوحدات المرتبطة بالتشغيل عبر كل المطوّرين." },
    { find: side(/Developers|المطوّرون/), title: "Developers", titleAr: "المطوّرون", body: "Each developer's workspace: brand, projects, catalogue, payment terms, commission ladder and team.", bodyAr: "مساحة كل مطوّر: الهوية والمشاريع والكتالوج وشروط الدفع وسلّم العمولة والفريق." },
    { find: side(/Developer payments|مدفوعات/), title: "Developer payments", titleAr: "مدفوعات المطوّرين", body: "Invoices are raised automatically when a customer pays; tick each milestone here against the developer's proof of payment.", bodyAr: "تُنشأ الفاتورة تلقائيًا عند دفع العميل؛ علّم كل دفعة هنا مقابل إثبات تحويل المطوّر." },
    { find: side(/Support tickets|التذاكر/), title: "Support tickets", titleAr: "تذاكر الدعم", body: "Everything developers and sales teams report lands here. Reply and track status.", bodyAr: "كل ما يبلّغ عنه المطوّرون وفرق المبيعات يصل هنا. ردّ وتابع الحالة." },
  ]);

  window.RevnuSupport = { createTicket, updateTicket, addReply, list: load, defineTour, startTour, firstRun, openTicketModal, SupportButtons, pickFile, uploadFor, openDocument, showCredentials, toast, fail, busy, act };
  return window.RevnuSupport;
}

export default installSupport;
