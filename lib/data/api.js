// =====================================================================
//  REVNU_API — the "remote" transport the prototype's api.js anticipated.
//  Every write the UI can perform goes through here: plain table writes
//  under RLS, or an RPC for anything that must be atomic / gated.
//  Errors are normalised to ApiError with bilingual, human messages so
//  end users never see a database error.
// =====================================================================
"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchSnapshot } from "./snapshot";
import * as M from "./mappers";

export class ApiError extends Error {
  constructor(code, detail, raw) { super(code); this.code = code; this.detail = detail; this.raw = raw; }
  /** Human message in the active language. */
  friendly(ar) {
    const T = MESSAGES[this.code] || MESSAGES.GENERIC;
    const words = this.code === "LINK_CLOSED" ? LINK_STATES : this.code === "NOT_OFFERED" ? OFFER_ITEMS : null;
    const d = (words && words[this.detail]) ? words[this.detail][ar ? 1 : 0] : (this.code === "NOT_OFFERED" ? OFFER_ITEMS.item[ar ? 1 : 0] : this.detail);
    return (ar ? T.ar : T.en).replace("{detail}", d || "");
  }
}

// LINK_CLOSED:<status> — the status in words
const LINK_STATES = { expired: ["expired", "منتهي"], revoked: ["withdrawn", "ملغى"], submitted: ["already used", "مستخدم"], paused: ["paused", "متوقف مؤقتًا"], signed: ["already signed", "تم توقيعه"] };
// NOT_OFFERED:<item> — the item in words
const OFFER_ITEMS = { kitchen: ["Kitchens are no longer offered", "المطابخ لم تعد متاحة"], cooling: ["Cooling is no longer offered", "التكييف لم يعد متاحًا"], package: ["This furnishing package is no longer offered", "باقة التأثيث هذه لم تعد متاحة"], smart: ["This smart-home tier is no longer offered", "باقة المنزل الذكي هذه لم تعد متاحة"], operations: ["This operating model is no longer offered", "نموذج التشغيل هذا لم يعد متاحًا"], item: ["One of the chosen items is no longer offered", "أحد الخيارات المختارة لم يعد متاحًا"] };

const MESSAGES = {
  GENERIC:               { en: "Something went wrong. Please try again — if it keeps happening, raise a support ticket.", ar: "حدث خطأ ما. حاول مرة أخرى — وإذا تكرّر، أرسل بلاغًا للدعم." },
  NETWORK:               { en: "You appear to be offline. Check your connection and try again.", ar: "يبدو أنك غير متصل بالإنترنت. تحقّق من الاتصال وحاول مجددًا." },
  SESSION_EXPIRED:       { en: "Your session has expired. Please sign in again.", ar: "انتهت جلستك. يرجى تسجيل الدخول مجددًا." },
  NOT_ALLOWED:           { en: "You don't have permission to do this. Ask your admin if you think you should.", ar: "ليست لديك صلاحية لهذا الإجراء. راجع مديرك إذا كنت تعتقد أنه يجب أن تملكها." },
  UNIT_TAKEN:            { en: "Unit {detail} was just taken by another deal. Please choose a different unit.", ar: "الوحدة {detail} دخلت للتو في صفقة أخرى. يرجى اختيار وحدة أخرى." },
  NEEDS_SIGNED_CONTRACT: { en: "Upload the signed agreement first — the deal can't move to Signed without it.", ar: "ارفع الاتفاقية الموقّعة أولًا — لا يمكن نقل الصفقة إلى «موقّع» بدونها." },
  NEEDS_PAYMENT_PROOF:   { en: "Upload the customer's proof of payment first.", ar: "ارفع إثبات دفع العميل أولًا." },
  DOCUMENT_MISSING:      { en: "The file didn't reach storage. Please upload it again.", ar: "لم يصل الملف إلى التخزين. يرجى رفعه مرة أخرى." },
  BAD_ORDER_REF:         { en: "This order reference is not valid. Reload the page to get a new one.", ar: "مرجع الطلب غير صالح. أعد تحميل الصفحة للحصول على مرجع جديد." },
  ORDER_CANCELLED:       { en: "This order is cancelled. Reinstate it before changing its status.", ar: "هذا الطلب مُلغى. استعده أولًا قبل تغيير حالته." },
  INVALID_TRANSITION:    { en: "The deal can only move one step forward at a time.", ar: "يمكن نقل الصفقة خطوة واحدة للأمام فقط في كل مرة." },
  REASON_REQUIRED:       { en: "A reason is required.", ar: "السبب إلزامي." },
  ALREADY_SUBMITTED:     { en: "This order was already submitted.", ar: "هذا الطلب أُرسل مسبقًا." },
  DUPLICATE:             { en: "This already exists — use a different reference.", ar: "هذا موجود مسبقًا — استخدم مرجعًا مختلفًا." },
  IN_USE:                { en: "This can't be deleted while other records still depend on it (team members, projects, units or orders). Remove those first.", ar: "لا يمكن الحذف لأن سجلات أخرى ما زالت مرتبطة به (أعضاء الفريق أو المشاريع أو الوحدات أو الطلبات). احذف تلك أولًا." },
  FILE_TOO_LARGE:        { en: "That file is too large. The limit is {detail}.", ar: "حجم الملف كبير جدًا. الحد الأقصى {detail}." },
  FILE_TYPE:             { en: "That file type isn't supported. Please upload a PDF or an image.", ar: "نوع الملف غير مدعوم. يرجى رفع ملف PDF أو صورة." },
  EMAIL_IN_USE:          { en: "An account with this email already exists.", ar: "يوجد حساب بهذا البريد مسبقًا." },
  SAME_PASSWORD:         { en: "Choose a password that is different from the temporary one.", ar: "اختر كلمة مرور مختلفة عن كلمة المرور المؤقتة." },
  WEAK_PASSWORD:         { en: "That password is too easy to guess. Use at least 8 characters — a short phrase works well.", ar: "كلمة المرور هذه سهلة التخمين. استخدم 8 أحرف على الأقل — عبارة قصيرة تفي بالغرض." },
  SERVICE_ROLE_MISSING:  { en: "Account management isn't configured on this server yet. Please contact Revnu support.", ar: "إدارة الحسابات غير مهيّأة على هذا الخادم بعد. يرجى التواصل مع دعم Revnu." },
  DEADLINE:              { en: "Changes to this choice closed on {detail}.", ar: "انتهت مهلة تعديل هذا الخيار في {detail}." },
  NEGATIVE_AMOUNT:       { en: "Amounts can't be negative.", ar: "لا يمكن أن تكون المبالغ سالبة." },
  // remote ordering + e-signature
  REMOTE_OFF:            { en: "Remote ordering is switched off for this project.", ar: "الطلب عن بعد غير مفعّل لهذا المشروع." },
  LINK_NOT_FOUND:        { en: "This link isn't valid. Check the link you received, or ask your sales rep for a new one.", ar: "هذا الرابط غير صالح. تأكد من الرابط أو اطلب رابطًا جديدًا من مندوب المبيعات." },
  LINK_CLOSED:           { en: "This link is no longer open ({detail}). Ask your sales rep for a new one.", ar: "هذا الرابط لم يعد متاحًا ({detail}). اطلب رابطًا جديدًا من مندوب المبيعات." },
  SUBMISSION_CLOSED:     { en: "This submission was already handled ({detail}).", ar: "تمت معالجة هذا الطلب مسبقًا ({detail})." },
  ASSIGN_UNIT_FIRST:     { en: "Assign a unit first.", ar: "حدد الوحدة أولًا." },
  PICK_UNITS:            { en: "Pick at least one of the offered units.", ar: "اختر وحدة واحدة على الأقل من الوحدات المعروضة." },
  PICK_TYPE:             { en: "Pick a unit type.", ar: "اختر نوع الوحدة." },
  NAME_REQUIRED:         { en: "Please enter the buyer's full name.", ar: "اكتب الاسم الكامل للمشتري." },
  INVALID_NATIONAL_ID:   { en: "The national ID / Iqama must be 10 digits starting with 1 or 2.", ar: "رقم الهوية / الإقامة يجب أن يكون 10 أرقام يبدأ بـ 1 أو 2." },
  INVALID_MOBILE:        { en: "Enter a valid mobile number.", ar: "أدخل رقم جوال صحيح." },
  INVALID_EMAIL:         { en: "Enter a valid e-mail address.", ar: "أدخل بريدًا إلكترونيًا صحيحًا." },
  EMAIL_REQUIRED:        { en: "Please enter the buyer's e-mail — the agreement and the payment details are sent there.", ar: "أدخل البريد الإلكتروني للمشتري، فعليه يصل العقد وتفاصيل الدفع." },
  CONSENT_REQUIRED:      { en: "Please tick the consent box to continue.", ar: "يرجى تأكيد الموافقة للمتابعة." },
  READ_ALL:              { en: "Read every page of the agreement before signing.", ar: "اقرأ كل صفحات العقد قبل التوقيع." },
  SIGNATURE_REQUIRED:    { en: "Draw your signature (or type your full name) to sign.", ar: "ارسم توقيعك (أو اكتب اسمك الكامل) للتوقيع." },
  NOT_OPEN_FOR_SIGNING:  { en: "This agreement isn't open for signing.", ar: "هذا العقد غير متاح للتوقيع." },
  BUYER_LOCKED:          { en: "Buyer details are locked once the agreement is signed.", ar: "بيانات المشتري مقفلة بعد توقيع العقد." },
  SIGNATORY_IMAGE:       { en: "Use a PNG or JPEG image for the signature and stamp.", ar: "استخدم صورة PNG أو JPEG للتوقيع والختم." },
  SUSPENDED:             { en: "Platform access for this developer is suspended — contact Revnu.", ar: "وصول هذا المطور إلى المنصة معلق — تواصل مع Revnu." },
  PRICE_MISMATCH:        { en: "A price no longer matches the price list (it may have just changed). Refresh and try again.", ar: "أحد الأسعار لم يعد مطابقًا لقائمة الأسعار (ربما تغيّر للتو). حدّث الصفحة وحاول مجددًا." },
  NOT_OFFERED:           { en: "{detail} on this project. Refresh the page and choose again.", ar: "{detail} في هذا المشروع. حدّث الصفحة واختر من جديد." },
  AGREEMENT_CHANGED:     { en: "The agreement was just updated by your sales rep. It reloads now — please review it again before signing.", ar: "تم تحديث العقد للتو من مندوب المبيعات. سيعاد تحميله الآن، يرجى مراجعته مرة أخرى قبل التوقيع." },
  RATE_LIMITED:          { en: "Too many attempts from this connection. Please wait a while and try again.", ar: "محاولات كثيرة من هذا الاتصال. انتظر قليلًا ثم حاول مجددًا." },
};

/** Convert a Supabase/PostgREST/fetch error into an ApiError. */
export function normaliseError(e) {
  if (e instanceof ApiError) return e;
  const msg = String(e?.message || e || "");
  const code = e?.code || "";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return new ApiError("NETWORK", null, e);
  if (/JWT|expired|refresh_token|not authenticated/i.test(msg) || e?.status === 401) return new ApiError("SESSION_EXPIRED", null, e);
  if (/should be different from the old password|same_password/i.test(msg + " " + code)) return new ApiError("SAME_PASSWORD", null, e);
  if (/weak_password|password should (be|contain)|password is known to be weak/i.test(msg + " " + code)) return new ApiError("WEAK_PASSWORD", null, e);
  const m = msg.match(/^(UNIT_TAKEN|NEEDS_SIGNED_CONTRACT|NEEDS_PAYMENT_PROOF|ORDER_CANCELLED|INVALID_TRANSITION|REASON_REQUIRED|DOCUMENT_MISSING|DEADLINE|NEGATIVE_AMOUNT|REMOTE_OFF|LINK_NOT_FOUND|LINK_CLOSED|SUBMISSION_CLOSED|ASSIGN_UNIT_FIRST|PICK_UNITS|PICK_TYPE|NAME_REQUIRED|INVALID_NATIONAL_ID|INVALID_MOBILE|INVALID_EMAIL|EMAIL_REQUIRED|CONSENT_REQUIRED|READ_ALL|SIGNATURE_REQUIRED|NOT_OPEN_FOR_SIGNING|BUYER_LOCKED|SIGNATORY_IMAGE|SUSPENDED|FILE_TOO_LARGE|PRICE_MISMATCH|NOT_OFFERED|AGREEMENT_CHANGED|RATE_LIMITED)(?::(.*))?/);
  if (m) return new ApiError(m[1], m[1] === "DEADLINE" ? String(m[2] || "").split(":").pop() : (m[2] || null), e);
  if (/invalid order reference/i.test(msg)) return new ApiError("BAD_ORDER_REF", null, e);
  if (/already submitted/i.test(msg)) return new ApiError("ALREADY_SUBMITTED", null, e);
  if (code === "42501" || /not allowed|permission denied|insufficient_privilege|violates row-level security/i.test(msg)) return new ApiError("NOT_ALLOWED", null, e);
  if (code === "23505" || /duplicate key/i.test(msg)) return new ApiError("DUPLICATE", null, e);
  if (code === "23503" || /violates foreign key constraint/i.test(msg)) return new ApiError("IN_USE", null, e);
  if (/exceeded the maximum allowed size|Payload too large|too large/i.test(msg)) return new ApiError("FILE_TOO_LARGE", "25 MB", e);
  if (/mime type .* is not supported/i.test(msg)) return new ApiError("FILE_TYPE", null, e);
  return new ApiError("GENERIC", msg, e);
}

const sb = () => supabaseBrowser();

async function run(promise) {
  let res;
  try { res = await promise; } catch (e) { throw normaliseError(e); }
  if (res?.error) throw normaliseError(res.error);
  return res?.data;
}

/** JSON call to one of our own Route Handlers (invites, resets, email dispatch). */
async function call(method, path, body) {
  let res;
  try {
    res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { throw new ApiError("NETWORK", null, e); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.code || (res.status === 401 ? "SESSION_EXPIRED" : res.status === 403 ? "NOT_ALLOWED" : "GENERIC"), json.detail || json.error || null, json);
  return json;
}

/** A public function's answer for an unknown code → the same error the rest of the app shows for it. */
const found = (r) => { if (r && r.status === "not_found") throw new ApiError("LINK_NOT_FOUND"); return r; };

// Bilingual catalogue content: store kind -> [table, mapper]
const CONTENT_KINDS = {
  design: ["design_styles", M.designStyles], package: ["packages", M.packages], smart: ["smart_home", M.smartHome], ops: ["ops_models", M.opsModels],
  kitchen: ["kitchens", M.kitchens], ac: ["ac_systems", M.acSystems], flooring: ["flooring_finishes", M.flooringFinishes], layout: ["layout_options", M.layoutOptions],
  flooringZones: ["flooring_zones", M.flooringZones], coolingPoints: ["cooling_points", M.coolingPoints],
};

// generic table helpers (partial updates use the mapper so callers stay camelCase)
const upd = (table, m, match, patch) => run(sb().from(table).update(m.toRow(patch, { partial: true })).match(match).select().single()).then((r) => m.fromRow(r));
const ins = (table, m, obj) => run(sb().from(table).insert(m.toRow(obj)).select().single()).then((r) => m.fromRow(r));
const del = (table, match) => run(sb().from(table).delete().match(match));

export const api = {
  snapshot: { fetch: (only) => fetchSnapshot(sb(), only) },

  auth: {
    async signIn(email, password) {
      const { data, error } = await sb().auth.signInWithPassword({ email, password });
      if (error) {
        if (/Invalid login credentials/i.test(error.message)) throw new ApiError("BAD_CREDENTIALS", null, error);
        if (/Email not confirmed/i.test(error.message)) throw new ApiError("EMAIL_UNCONFIRMED", null, error);
        if (/banned/i.test(error.message)) throw new ApiError("ACCOUNT_DISABLED", null, error);
        throw normaliseError(error);
      }
      return data.user;
    },
    async myProfile() {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return null;
      const row = await run(sb().from("profiles_v").select("*").eq("id", user.id).maybeSingle());
      return row ? M.profiles.fromRow(row) : null;
    },
    async setPassword(password) {
      await run(sb().auth.updateUser({ password }));
      await run(sb().rpc("clear_must_change_password"));
    },
    async requestReset(email) {
      const redirectTo = window.location.origin + "/auth/callback?next=" + encodeURIComponent("/login?set-password=1");
      await run(sb().auth.resetPasswordForEmail(email, { redirectTo }));
    },
    async signOut() { try { await sb().auth.signOut({ scope: "local" }); } catch {} },
  },

  developers: {
    update: (id, patch) => upd("developers", M.developers, { id }, patch),
    create: (obj) => ins("developers", M.developers, obj),
    async remove(id) {
      // Removing a team member only soft-deletes the profile (keeps their name on old orders), which
      // leaves developer_id set and permanently blocks this delete (it's ON DELETE RESTRICT). A super
      // admin deleting the whole developer is already destroying every project/unit/order underneath
      // it, so clear any remaining profiles for it first — RLS already limits this delete to super
      // admins (see "profile delete" policy), same as the developer delete itself just below.
      await run(sb().from("profiles").delete().eq("developer_id", id));
      return del("developers", { id });
    },
    async setLadder(developerId, ladder) {
      // Upsert the levels that remain (so team members keep their level when only a share changes), then drop the removed ones.
      if (ladder.length) await run(sb().from("commission_levels").upsert(ladder.map((l, i) => M.commissionLevels.toRow({ ...l, developerId, sort: i })), { onConflict: "developer_id,id" }));
      const keep = ladder.map((l) => l.id);
      let q = sb().from("commission_levels").delete().eq("developer_id", developerId);
      if (keep.length) q = q.not("id", "in", "(" + keep.map((id) => '"' + String(id).replace(/"/g, '""') + '"').join(",") + ")");
      await run(q);
    },
  },

  projects: {
    create: (obj) => ins("projects", M.projects, obj),
    update: (id, patch) => upd("projects", M.projects, { id }, patch),
    remove: (id) => del("projects", { id }),
  },

  unitTypes: {
    create: (obj) => ins("unit_types", M.unitTypes, obj),
    update: (id, patch) => upd("unit_types", M.unitTypes, { id }, patch),
    remove: (id) => del("unit_types", { id }),
  },

  units: {
    create: (obj) => ins("units", M.units, obj),
    update: (number, patch) => upd("units", M.units, { number }, patch),
    remove: (number) => del("units", { number }),
    createMany: (list) => run(sb().from("units").insert(list.map((u) => M.units.toRow(u))).select()).then((rows) => rows.map(M.units.fromRow)),
    // Bulk import: numbers that already exist (even in a project this account can't see) are skipped, never overwritten.
    createNew: (list) => run(sb().from("units").upsert(list.map((u) => M.units.toRow(u)), { onConflict: "number", ignoreDuplicates: true }).select()).then((rows) => (rows || []).map(M.units.fromRow)),
  },

  content: {
    // kind: design | package | smart | ops | kitchen | ac | flooring | layout
    update(kind, id, patch) {
      const t = CONTENT_KINDS[kind];
      return upd(t[0], t[1], { id }, patch);
    },
    create(kind, obj) {
      const t = CONTENT_KINDS[kind];
      return ins(t[0], t[1], obj);
    },
    // Per-unit-type rows (flooring zones, cooling points): one row per (project, type), replaced wholesale.
    upsertForType(kind, obj) {
      const t = CONTENT_KINDS[kind];
      return run(sb().from(t[0]).upsert(t[1].toRow(obj), { onConflict: "project_id,type_id" }).select().single()).then((r) => t[1].fromRow(r));
    },
    remove(kind, id) {
      const t = CONTENT_KINDS[kind];
      return del(t[0], { id });
    },
  },

  milestones: {
    create: (obj) => ins("construction_milestones", M.constructionMilestones, obj),
    update: (id, patch) => upd("construction_milestones", M.constructionMilestones, { id }, patch),
    remove: (id) => del("construction_milestones", { id }),
  },
  paymentPlans: {
    create: (obj) => ins("payment_plans", M.paymentPlans, obj),
    update: (id, patch) => upd("payment_plans", M.paymentPlans, { id }, patch),
    remove: (id) => del("payment_plans", { id }),
  },
  contracts: {
    create: (obj) => ins("contract_templates", M.contractTemplates, obj),
    update: (id, patch) => upd("contract_templates", M.contractTemplates, { id }, patch),
    remove: (id) => del("contract_templates", { id }),
  },

  orders: {
    reserveId: () => run(sb().rpc("reserve_order_id")),
    create: (payload) => run(sb().rpc("create_order", { p: payload })).then(M.orders.fromRow),
    transition: (id, to) => run(sb().rpc("transition_order", { p_order: id, p_to: to })).then(M.orders.fromRow),
    cancel: (id, reason) => run(sb().rpc("cancel_order", { p_order: id, p_reason: reason })).then(M.orders.fromRow),
    reinstate: (id) => run(sb().rpc("reinstate_order", { p_order: id })).then(M.orders.fromRow),
    remove: (id) => run(sb().rpc("delete_order", { p_order: id })),
    attachDocument: (id, kind, doc) => run(sb().rpc("attach_document", { p_order: id, p_kind: kind, p_path: doc.storagePath, p_name: doc.name, p_mime: doc.mime || null, p_size: doc.size || null, p_milestone: doc.milestoneId || null })).then(M.documents.fromRow),
  },

  receivables: { setPaid: (orderId, milestoneId, paid, documentId) => run(sb().rpc("set_receivable_paid", { p_order: orderId, p_milestone: milestoneId, p_paid: !!paid, p_document: documentId || null })) },
  payouts:     { set: (orderId, userId, levelId, status) => run(sb().rpc("set_payout_status", { p_order: orderId, p_user: userId, p_level: levelId, p_status: status })) },

  users: {
    // Creates the auth account server-side, then the profile under the caller's RLS. Returns { profile, tempPassword }.
    create: (obj) => call("POST", "/api/users", obj),
    update: (id, patch) => upd("profiles", M.profiles, { id }, patch),
    setProjects: async (id, projectIds) => {
      await del("profile_projects", { profile_id: id });
      if (projectIds.length) await run(sb().from("profile_projects").insert(projectIds.map((project_id) => ({ profile_id: id, project_id }))));
    },
    remove: (id) => call("DELETE", "/api/users/" + id),
    resetPassword: (id) => call("POST", "/api/users/" + id + "/reset-password"),
  },

  tickets: {
    create: (t) => run(sb().from("support_tickets").insert({ type: t.type, subject: t.subject, body: t.body, page: t.page }).select().single()).then(M.supportTickets.fromRow),
    update: (id, patch) => upd("support_tickets", M.supportTickets, { id }, patch),
    reply: (id, text) => run(sb().from("ticket_replies").insert({ ticket_id: id, text }).select().single()),
  },

  leads: { update: (id, patch) => upd("leads", M.leads, { id }, patch) },

  notifications: { dispatch: (orderId) => call("POST", "/api/notifications/dispatch", { orderId }).catch(() => null) },

  // ---- v2: remote ordering (rep side, signed in) --------------------------
  remote: {
    createLink: (p) => run(sb().rpc("sale_link_create", { p })).then(M.saleLinks.fromRow),
    setLink: (code, action, hours) => run(sb().rpc("sale_link_set", { p_code: code, p_action: action, p_hours: hours || 48 })).then(M.saleLinks.fromRow),
    assignUnits: (id, units) => run(sb().rpc("submission_assign_units", { p_id: id, p_units: units })).then(M.submissions.fromRow),
    accept: (id, payload) => run(sb().rpc("submission_accept", { p_id: id, p: payload })),
    decline: (id, reason) => run(sb().rpc("submission_decline", { p_id: id, p_reason: reason || null })).then(M.submissions.fromRow),
    createSigningLink: (orderId, via) => run(sb().rpc("signing_link_create", { p_order: orderId, p_via: via || "qr" })).then(M.signingLinks.fromRow),
    updateCustomer: (orderId, patch) => run(sb().rpc("update_order_customer", { p_order: orderId, p: patch })).then(M.orders.fromRow),
    setSignatory: (devId, patch) => run(sb().rpc("set_signatory", { p_dev: devId, p: patch })).then(M.developers.fromRow),
    markRead: (ids) => run(sb().rpc("inbox_mark_read", { p_ids: ids && ids.length ? ids : null })),
    setLead: (id, action) => run(sb().rpc("lead_set", { p_id: id, p_action: action })).then(M.saleLeads.fromRow),
  },
  // ---- v2: the buyer's phone (no sign-in; the code is the key) -------------
  // An unknown code answers { status: "not_found" } rather than an error, so the server can count the miss.
  public: {
    linkView: (code, open) => run(sb().rpc("public_link_view", { p_code: code, p_open: open !== false })),
    linkStatus: (code, submissionId) => run(sb().rpc("public_link_status", { p_code: code, p_submission: submissionId || null })),
    leadStart: (code, p) => run(sb().rpc("public_lead_start", { p_code: code, p })).then(found),
    leadUpdate: (code, leadId, p) => run(sb().rpc("public_lead_update", { p_code: code, p_lead: leadId, p })),
    submit: (code, p) => run(sb().rpc("public_link_submit", { p_code: code, p })).then(found),
    signingView: (code, open) => run(sb().rpc("public_signing_view", { p_code: code, p_open: open !== false })),
    // the buyer is signed out: the signing code names the one order whose queued e-mails may go out now
    dispatch: (code) => call("POST", "/api/notifications/dispatch", { signingCode: code }).catch(() => null),
    signingRead: (code, section, sections, lang) => run(sb().rpc("public_signing_read", { p_code: code, p_section: section || null, p_sections: sections || null, p_lang: lang || null })),
    sign: (code, p) => run(sb().rpc("public_signing_sign", { p_code: code, p })).then(found),
  },
  // ---- v2: agreement composer + platform billing (Revnu HQ) ----------------
  agreements: {
    save: (layout) => run(sb().rpc("save_agreement_layout", { p: layout })).then(M.agreementLayouts.fromRow),
    reset: (devId) => run(sb().rpc("reset_agreement_layout", { p_dev: devId })),
  },
  billing: {
    setPriceBook: (p) => run(sb().rpc("set_billing_price_book", { p })).then(M.billingSettings.fromRow),
    setInvoice: (id, devId, patch) => run(sb().rpc("set_platform_invoice", { p_id: id, p_dev: devId, p: patch })).then(M.platformInvoices.fromRow),
  },

  storage: {
    /** Upload with explicit validation. Never silently drops a file (audit B-06). */
    async upload(bucket, path, file, { maxBytes = 25 * 1024 * 1024, accept } = {}) {
      if (file.size > maxBytes) throw new ApiError("FILE_TOO_LARGE", Math.round(maxBytes / 1024 / 1024) + " MB");
      if (accept && !accept.some((a) => (a.endsWith("/*") ? file.type.startsWith(a.slice(0, -1)) : file.type === a || file.name.toLowerCase().endsWith(a)))) throw new ApiError("FILE_TYPE");
      const { error } = await sb().storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw normaliseError(error);
      return path;
    },
    async signedUrl(bucket, path, seconds = 600) {
      const { data, error } = await sb().storage.from(bucket).createSignedUrl(path, seconds);
      if (error) throw normaliseError(error);
      return data.signedUrl;
    },
    publicUrl(bucket, path) { return sb().storage.from(bucket).getPublicUrl(path).data.publicUrl; },
  },
};

export default api;
