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
    return (ar ? T.ar : T.en).replace("{detail}", this.detail || "");
  }
}

const MESSAGES = {
  GENERIC:               { en: "Something went wrong. Please try again — if it keeps happening, raise a support ticket.", ar: "حدث خطأ ما. حاول مرة أخرى — وإذا تكرّر، أرسل بلاغًا للدعم." },
  NETWORK:               { en: "You appear to be offline. Check your connection and try again.", ar: "يبدو أنك غير متصل بالإنترنت. تحقّق من الاتصال وحاول مجددًا." },
  SESSION_EXPIRED:       { en: "Your session has expired. Please sign in again.", ar: "انتهت جلستك. يرجى تسجيل الدخول مجددًا." },
  NOT_ALLOWED:           { en: "You don't have permission to do this. Ask your admin if you think you should.", ar: "ليست لديك صلاحية لهذا الإجراء. راجع مديرك إذا كنت تعتقد أنه يجب أن تملكها." },
  UNIT_TAKEN:            { en: "Unit {detail} was just taken by another deal. Please choose a different unit.", ar: "الوحدة {detail} دخلت للتو في صفقة أخرى. يرجى اختيار وحدة أخرى." },
  NEEDS_SIGNED_CONTRACT: { en: "Upload the signed agreement first — the deal can't move to Signed without it.", ar: "ارفع الاتفاقية الموقّعة أولًا — لا يمكن نقل الصفقة إلى «موقّع» بدونها." },
  NEEDS_PAYMENT_PROOF:   { en: "Upload the customer's proof of payment first.", ar: "ارفع إثبات دفع العميل أولًا." },
  ORDER_CANCELLED:       { en: "This order is cancelled. Reinstate it before changing its status.", ar: "هذا الطلب مُلغى. استعده أولًا قبل تغيير حالته." },
  INVALID_TRANSITION:    { en: "The deal can only move one step forward at a time.", ar: "يمكن نقل الصفقة خطوة واحدة للأمام فقط في كل مرة." },
  REASON_REQUIRED:       { en: "A reason is required.", ar: "السبب إلزامي." },
  ALREADY_SUBMITTED:     { en: "This order was already submitted.", ar: "هذا الطلب أُرسل مسبقًا." },
  DUPLICATE:             { en: "This already exists — use a different reference.", ar: "هذا موجود مسبقًا — استخدم مرجعًا مختلفًا." },
  FILE_TOO_LARGE:        { en: "That file is too large. The limit is {detail}.", ar: "حجم الملف كبير جدًا. الحد الأقصى {detail}." },
  FILE_TYPE:             { en: "That file type isn't supported. Please upload a PDF or an image.", ar: "نوع الملف غير مدعوم. يرجى رفع ملف PDF أو صورة." },
  EMAIL_IN_USE:          { en: "An account with this email already exists.", ar: "يوجد حساب بهذا البريد مسبقًا." },
  SERVICE_ROLE_MISSING:  { en: "Account management isn't configured on this server yet. Please contact Revnu support.", ar: "إدارة الحسابات غير مهيّأة على هذا الخادم بعد. يرجى التواصل مع دعم Revnu." },
};

/** Convert a Supabase/PostgREST/fetch error into an ApiError. */
export function normaliseError(e) {
  if (e instanceof ApiError) return e;
  const msg = String(e?.message || e || "");
  const code = e?.code || "";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return new ApiError("NETWORK", null, e);
  if (/JWT|expired|refresh_token|not authenticated/i.test(msg) || e?.status === 401) return new ApiError("SESSION_EXPIRED", null, e);
  const m = msg.match(/^(UNIT_TAKEN|NEEDS_SIGNED_CONTRACT|NEEDS_PAYMENT_PROOF|ORDER_CANCELLED|INVALID_TRANSITION|REASON_REQUIRED)(?::(.*))?/);
  if (m) return new ApiError(m[1], m[2] || null, e);
  if (/already submitted/i.test(msg)) return new ApiError("ALREADY_SUBMITTED", null, e);
  if (code === "42501" || /not allowed|permission denied|insufficient_privilege|violates row-level security/i.test(msg)) return new ApiError("NOT_ALLOWED", null, e);
  if (code === "23505" || /duplicate key/i.test(msg)) return new ApiError("DUPLICATE", null, e);
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
    remove: (id) => del("developers", { id }),
    async setLadder(developerId, ladder) {
      await del("commission_levels", { developer_id: developerId });
      if (ladder.length) await run(sb().from("commission_levels").insert(ladder.map((l, i) => M.commissionLevels.toRow({ ...l, developerId, sort: i }))));
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
  },

  content: {
    // kind: design | package | smart | ops
    update(kind, id, patch) {
      const t = { design: ["design_styles", M.designStyles], package: ["packages", M.packages], smart: ["smart_home", M.smartHome], ops: ["ops_models", M.opsModels] }[kind];
      return upd(t[0], t[1], { id }, patch);
    },
    create(kind, obj) {
      const t = { design: ["design_styles", M.designStyles], package: ["packages", M.packages], smart: ["smart_home", M.smartHome], ops: ["ops_models", M.opsModels] }[kind];
      return ins(t[0], t[1], obj);
    },
    remove(kind, id) {
      const t = { design: "design_styles", package: "packages", smart: "smart_home", ops: "ops_models" }[kind];
      return del(t, { id });
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
