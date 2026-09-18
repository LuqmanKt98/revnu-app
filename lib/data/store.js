// =====================================================================
//  REVNU_DATA (store) — the prototype's data.js, re-based on Supabase.
//
//  READS  are synchronous against an in-memory tenant snapshot (hydrated
//         by the portal page after the server verified the session).
//  WRITES call REVNU_API (RLS / RPC) and then refresh the affected
//         collections, so every screen sees the server's truth.
//
//  All pure business logic (economics, commission split, contract fill,
//  status helpers, validation) is copied verbatim from the prototype so
//  the approved numbers cannot drift.
// =====================================================================
"use client";
import api, { ApiError } from "./api";

// ---------------------------------------------------------------------
// Collections (mutated in place so every reference stays valid)
// ---------------------------------------------------------------------
const DEVELOPERS = [], PROJECTS = [], UNIT_TYPES = [], UNITS = [], DESIGN_STYLES = [], PACKAGES = [],
      SMART_HOME = [], PAYMENT_PLANS = [], OPS_MODELS = [], CONTRACTS = [], USERS = [], ORDERS = [],
      CONSTRUCTION_MILESTONES = [], DEV_PERMS = [], DEV_ROLES = [], REVNU_ROLES = [], REVNU_PERMS = [],
      CONTRACT_VARS = [], DOCUMENTS = [], TICKETS = [], LEADS = [], COMMISSION_LEVELS = [];
let ACTIVITY = {};        // orderId -> [{at, event, by, ...extra}]
let INVOICES = {};        // orderId -> { issuedAt }
let RECEIVABLE_PAID = {}; // orderId -> [milestoneId]
let RECEIVABLE_DOCS = {}; // orderId -> { milestoneId: documentId }
let PAYOUTS = {};         // payoutKey -> status
let ME = null;            // the signed-in profile (set by the portal boot)
let hydratedOnce = false;

const replace = (arr, items) => { arr.length = 0; arr.push(...(items || [])); };

// ---- change notification (React subscribes via useStoreVersion) -----
let version = 0;
const listeners = new Set();
function bump() { version++; listeners.forEach((fn) => { try { fn(version); } catch (e) {} }); }
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function getVersion() { return version; }

// ---------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------
function hydrate(snap) {
  if (!snap) return;
  if (snap.devPerms) replace(DEV_PERMS, snap.devPerms);
  if (snap.devRoles) replace(DEV_ROLES, snap.devRoles);
  if (snap.revnuPerms) replace(REVNU_PERMS, snap.revnuPerms);
  if (snap.revnuRoles) replace(REVNU_ROLES, snap.revnuRoles);
  if (snap.contractVars) replace(CONTRACT_VARS, snap.contractVars);
  if (snap.developers) replace(DEVELOPERS, snap.developers);
  if (snap.commissionLevels) replace(COMMISSION_LEVELS, snap.commissionLevels);
  if (snap.developers || snap.commissionLevels) {
    DEVELOPERS.forEach((d) => {
      const lvls = COMMISSION_LEVELS.filter((l) => l.developerId === d.id).sort((a, b) => a.sort - b.sort);
      d.commissionLadder = lvls.length ? lvls.map(({ id, name, nameAr, pct, scope }) => ({ id, name, nameAr, pct, scope })) : defaultCommissionLadder();
      if (!d.revnuTerms) d.revnuTerms = revnuTermsBase();
    });
  }
  if (snap.projects) { replace(PROJECTS, snap.projects); PROJECTS.forEach((p) => { p.optional = p.optional || {}; p.features = p.features || {}; p.commercials = p.commercials || {}; }); }
  if (snap.unitTypes) replace(UNIT_TYPES, snap.unitTypes);
  if (snap.units) replace(UNITS, snap.units);
  if (snap.designStyles) replace(DESIGN_STYLES, snap.designStyles);
  if (snap.packages) replace(PACKAGES, snap.packages);
  if (snap.smartHome) replace(SMART_HOME, snap.smartHome);
  if (snap.opsModels) replace(OPS_MODELS, snap.opsModels);
  if (snap.constructionMilestones) replace(CONSTRUCTION_MILESTONES, snap.constructionMilestones);
  if (snap.paymentPlans) { replace(PAYMENT_PLANS, snap.paymentPlans); PAYMENT_PLANS.forEach((p) => { if (!p.schedule) p.schedule = scheduleStr(p); }); }
  if (snap.contractTemplates) replace(CONTRACTS, snap.contractTemplates);
  if (snap.profiles) replace(USERS, snap.profiles);
  if (snap.orders) replace(ORDERS, snap.orders);
  if (snap.orderActivity) { ACTIVITY = {}; snap.orderActivity.forEach((a) => { (ACTIVITY[a.orderId] = ACTIVITY[a.orderId] || []).push(a); }); }
  if (snap.documents) replace(DOCUMENTS, snap.documents);
  if (snap.invoices) { INVOICES = {}; snap.invoices.forEach((i) => { INVOICES[i.orderId] = i; }); }
  if (snap.receivablePaid) { RECEIVABLE_PAID = {}; RECEIVABLE_DOCS = {}; snap.receivablePaid.forEach((r) => { (RECEIVABLE_PAID[r.orderId] = RECEIVABLE_PAID[r.orderId] || []).push(r.milestoneId); (RECEIVABLE_DOCS[r.orderId] = RECEIVABLE_DOCS[r.orderId] || {})[r.milestoneId] = r.documentId; }); }
  if (snap.payouts) { PAYOUTS = {}; snap.payouts.forEach((p) => { PAYOUTS[payoutKey(p.orderId, p.userId, p.levelId)] = p.status; }); }
  if (snap.supportTickets) replace(TICKETS, snap.supportTickets);
  if (snap.leads) replace(LEADS, snap.leads);
  hydratedOnce = true;
  bump();
}
function setMe(profile) { ME = profile; }
function me() { return ME; }
async function signOut() { await api.auth.signOut(); }

// Re-fetch some (or all) collections from the server and re-hydrate.
let refreshing = null;
async function refresh(keys) {
  const p = api.snapshot.fetch(keys).then((snap) => { hydrate(snap); return snap; });
  refreshing = p;
  try { return await p; } finally { if (refreshing === p) refreshing = null; }
}
const ORDER_KEYS = ["orders", "orderActivity", "documents", "invoices", "receivablePaid", "payouts", "units"];

// ---------------------------------------------------------------------
// Developer ↔ Revnu payment terms
// ---------------------------------------------------------------------
const revnuTermsBase = () => ({
  preHandoverMonths: 6,
  milestones: [
    { id: "sign", label: "On signing",                 pct: 30, trigger: "signing" },
    { id: "pre",  label: "6 months to handover",       pct: 60, trigger: "pre_handover" },
    { id: "ret",  label: "Retention · after handover", pct: 10, trigger: "retention" },
  ],
});
async function setRevnuTerms(devId, terms) {
  const d = DEVELOPERS.find((x) => x.id === devId);
  const row = await api.developers.update(devId, { revnuTerms: terms });
  if (d) d.revnuTerms = row.revnuTerms || terms;
  bump();
}
async function setRevnuTermsForProject(projectId, terms) {
  const p = PROJECTS.find((x) => x.id === projectId);
  const row = await api.projects.update(projectId, { revnuTerms: terms });
  if (p) p.revnuTerms = row.revnuTerms || terms;
  bump();
}
function revnuTermsForProject(projectId) {
  const p = PROJECTS.find((x) => x.id === projectId);
  if (p && p.revnuTerms) return p.revnuTerms;
  const d = p && DEVELOPERS.find((x) => x.id === p.developerId);
  return (d && d.revnuTerms) || revnuTermsBase();
}

// ---------------------------------------------------------------------
// Contract template variables + fill engine (pure, verbatim)
// ---------------------------------------------------------------------
function contractVarValues(order, ar) {
  const dev = devById(order && order.developerId);
  const proj = projById(order && order.projectId);
  const unit = order && unitByNumber(order.unitNumber);
  const type = unit && unitTypeById(unit.typeId);
  const pkg = order && order.packageId && pkgById(order.packageId);
  const design = order && order.designId && designById(order.designId);
  const smart = order && order.smartId && smartById(order.smartId);
  const ops = order && order.opsId && opsById(order.opsId);
  const nm = (o, k) => (ar && o && o[k + "Ar"]) ? o[k + "Ar"] : (o ? o[k] : "");
  const today = new Date().toLocaleDateString(ar ? "ar-SA-u-ca-islamic" : "en-GB", { day: "2-digit", month: "long", year: "numeric" });
  return {
    buyer_name: order ? order.customerName : "", buyer_id: order ? order.customerId : "",
    buyer_email: order ? order.customerEmail : "", buyer_mobile: (order && order.customer && order.customer.mobile) || "",
    developer_name: dev ? nm(dev, "name") : "", project_name: proj ? nm(proj, "name") : "",
    authorized_signer: dev ? (ar ? (dev.authorizedSignerAr || dev.authorizedSigner || dev.primaryContact) : (dev.authorizedSigner || dev.primaryContact)) : "",
    authorized_signer_title: dev ? (ar ? (dev.authorizedSignerTitleAr || dev.authorizedSignerTitle || "") : (dev.authorizedSignerTitle || "")) : "",
    project_city: proj ? proj.city : "", unit_number: order ? order.unitNumber : "",
    unit_type: type ? nm(type, "name") : "", unit_area: type ? type.area + " m²" : "",
    unit_price: order ? fmtSAR(order.unitPrice) + " SAR" : "",
    package_name: pkg ? nm(pkg, "name") : "", design_name: design ? nm(design, "name") : "",
    palette_name: (() => { if (!design) return ""; const p = designPaletteById(design, order && order.paletteId); return p ? (ar ? (p.nameAr || p.name) : p.name) : ""; })(),
    smart_name: smart ? nm(smart, "name") : "", ops_name: ops ? nm(ops, "name") : "",
    furnish_cost: order && order.furnishCost ? fmtSAR(order.furnishCost) + " SAR" : "",
    total_price: order ? fmtSAR((order.unitPrice || 0) + (order.furnishCost || 0)) + " SAR" : "",
    today,
  };
}
function fillContract(body, order, ar) {
  const vals = contractVarValues(order, ar);
  let out = body || "";
  const flags = { has_ops: !!(order && order.opsId), has_smart: !!(order && order.smartId), has_fitout: !!(order && order.fitout) };
  for (const k in flags) {
    const re = new RegExp("\\{\\{#" + k + "\\}\\}([\\s\\S]*?)\\{\\{\\/" + k + "\\}\\}", "g");
    out = out.replace(re, flags[k] ? "$1" : "");
  }
  return out.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, code) => { const v = vals[code]; return (v !== undefined && v !== "") ? v : "[" + code + "]"; });
}
async function createContract(payload) {
  const id = payload.id || ("ct-" + Date.now().toString(36).slice(-5));
  const c = await api.contracts.create(Object.assign({ id, kind: "sale", lang: "both", version: "v1.0", required: false, updated: new Date().toISOString().slice(0, 10) }, payload));
  CONTRACTS.push(c); bump(); return c;
}
async function setContract(id, patch) {
  const row = await api.contracts.update(id, Object.assign({}, patch, { updated: new Date().toISOString().slice(0, 10) }));
  const c = CONTRACTS.find((x) => x.id === id); if (c) Object.assign(c, row);
  bump(); return c;
}
async function removeContract(id) { await api.contracts.remove(id); const i = CONTRACTS.findIndex((c) => c.id === id); if (i >= 0) CONTRACTS.splice(i, 1); bump(); }

// ---------------------------------------------------------------------
// Roles + permissions (defaults come from the DB reference tables)
// ---------------------------------------------------------------------
const devRoleById = (id) => DEV_ROLES.find((r) => r.id === id) || DEV_ROLES[DEV_ROLES.length - 1] || { id: "viewer", perms: [] };
const devPermsFor = (u) => (u && u.perms) ? u.perms : (u && u.effectivePerms) ? u.effectivePerms : devRoleById(u && u.role).perms;
const devHasPerm = (u, perm) => devPermsFor(u).includes(perm);

// ---------------------------------------------------------------------
// Order status vocabulary (single source of truth) — verbatim
// ---------------------------------------------------------------------
const ORDER_STATUS_FLOW = ["active", "issued", "signed", "paid"];
const ORDER_STATUS_META = {
  review:    { en: "Submitted",    ar: "مُقدَّمة" },
  draft:     { en: "Submitted",    ar: "مُقدَّمة" },
  active:    { en: "Submitted",    ar: "مُقدَّمة",    nextEn: "Issue contract",   nextAr: "إصدار العقد" },
  issued:    { en: "Contract issued", ar: "صدر العقد", nextEn: "Mark signed",      nextAr: "تأكيد التوقيع", needsUpload: true },
  signed:    { en: "Signed",       ar: "موقّع",        nextEn: "Mark customer paid", nextAr: "تأكيد دفع العميل" },
  paid:      { en: "Customer paid", ar: "دفع العميل",  final: true },
  completed: { en: "Completed",     ar: "مكتملة" },
  cancelled: { en: "Cancelled",     ar: "مُلغى",       final: true },
};
const _norm = (st) => (st === "draft" || st === "review") ? "active" : st;
const isLive         = (o) => !!o && !["cancelled"].includes(o.status);
const isContractOut  = (o) => !!o && _norm(o.status) === "issued";
const isSigned       = (o) => !!o && ["signed", "paid", "completed"].includes(o.status);
const isCustomerPaid = (o) => !!o && ["paid", "completed"].includes(o.status);
const isOperating    = (o) => isCustomerPaid(o) && (!!o.opsId || !!(o.perUnit && Object.values(o.perUnit).some((c) => c && c.opsId)));
const isSubmitted    = (o) => !!o && _norm(o.status) === "active";
function firstPaymentReceived(o) { return isCustomerPaid(o); }
function activityFor(orderId) { return ACTIVITY[orderId] || []; }
function logActivity() { /* activity is written server-side by the order RPCs */ }
const NOTIFY_TEMPLATES = {
  issued: { en: "Your agreement is ready to sign", ar: "اتفاقيتك جاهزة للتوقيع" },
  signed: { en: "Signed agreement received",       ar: "تم استلام الاتفاقية الموقّعة" },
  paid:   { en: "Payment confirmed — welcome aboard", ar: "تم تأكيد الدفع — أهلاً بك" },
};
function queueNotification() { /* queued server-side by transition_order() */ }

// ---- Validation helpers (verbatim) ----
const VALID = {
  nationalId: (v) => /^[12]\d{9}$/.test(String(v || "").replace(/\s/g, "")),
  mobile:     (v) => /^(\+?966|0)?5\d{8}$/.test(String(v || "").replace(/[\s-]/g, "")),
  email:      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim()),
  iban:       (v) => /^SA\d{22}$/.test(String(v || "").replace(/\s/g, "").toUpperCase()),
  cr:         (v) => /^\d{10}$/.test(String(v || "").replace(/\D/g, "")),
  vat:        (v) => /^3\d{14}$/.test(String(v || "").replace(/\D/g, "")),
};
// ---- CSV helpers (verbatim) ----
function toCSV(rows, cols) {
  const esc = (v) => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return [cols.map((c) => esc(c.label || c.key)).join(",")].concat(rows.map((r) => cols.map((c) => esc(typeof c.get === "function" ? c.get(r) : r[c.key])).join(","))).join("\n");
}
function downloadCSV(filename, rows, cols) {
  const csv = "﻿" + toCSV(rows, cols);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function parseCSV(text) {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((l) => { const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()); const o = {}; head.forEach((h, i) => o[h] = cells[i]); return o; });
}

// ---------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------
function takenUnitNumbers() {
  const taken = new Set();
  ORDERS.forEach((o) => {
    if (["draft", "review", "cancelled"].includes(o.status)) return;
    (o.unitNumbers && o.unitNumbers.length ? o.unitNumbers : [o.unitNumber]).forEach((n) => n && taken.add(n));
  });
  return taken;
}
const isUnitTaken = (number) => takenUnitNumbers().has(number);
async function setUnitStatus(number, status) {
  const row = await api.units.update(number, { status });
  const u = UNITS.find((x) => x.number === number); if (u) Object.assign(u, row);
  bump();
}
async function updateUnit(number, patch) {
  const allowed = {}; ["typeId", "tower", "floor", "priceAdj", "priceBen", "area", "baths", "block", "status"].forEach((k) => { if (patch[k] !== undefined) allowed[k] = patch[k]; });
  const row = await api.units.update(number, allowed);
  const u = UNITS.find((x) => x.number === number); if (u) Object.assign(u, row);
  bump(); return u;
}
async function addUnit(payload) {
  if (!payload.number || UNITS.some((x) => x.number === payload.number)) return null;
  const u = await api.units.create(Object.assign({ status: "available", priceAdj: 0 }, payload));
  UNITS.push(u); bump(); return u;
}
async function addUnits(list) {
  const fresh = list.filter((u) => u.number && !UNITS.some((x) => x.number === u.number)).map((u) => Object.assign({ status: "available", priceAdj: 0 }, u));
  if (!fresh.length) return [];
  const rows = await api.units.createMany(fresh);
  UNITS.push(...rows); bump(); return rows;
}
async function removeUnit(number) { await api.units.remove(number); const i = UNITS.findIndex((u) => u.number === number); if (i >= 0) UNITS.splice(i, 1); bump(); }

// ---------------------------------------------------------------------
// Orders — every transition is a server RPC (atomic, permission-checked, gated)
// ---------------------------------------------------------------------
async function reserveOrderId() { return api.orders.reserveId(); }
function nextOrderId() { return null; } // kept for call-site compatibility; use reserveOrderId()
async function createOrder(payload) {
  const units = payload.unitNumbers && payload.unitNumbers.length ? payload.unitNumbers : (payload.unitNumber ? [payload.unitNumber] : []);
  const order = await api.orders.create(Object.assign({}, payload, { unitNumbers: units }));
  order.unitNumbers = units;
  await refresh(ORDER_KEYS);
  api.notifications.dispatch(order.id);   // fire-and-forget: e-mail the customer (log mode in development)
  return ORDERS.find((o) => o.id === order.id) || order;
}
async function transitionOrder(id, to) {
  const row = await api.orders.transition(id, to);
  await refresh(ORDER_KEYS);
  api.notifications.dispatch(id);
  return ORDERS.find((o) => o.id === row.id) || row;
}
async function advanceOrderStatus(id) {
  const o = ORDERS.find((x) => x.id === id);
  if (!o) return null;
  const i = ORDER_STATUS_FLOW.indexOf(_norm(o.status));
  if (i < 0 || i >= ORDER_STATUS_FLOW.length - 1) return o;
  return transitionOrder(id, ORDER_STATUS_FLOW[i + 1]);
}
// updateOrder is kept for the few residual call sites; only a status change is meaningful server-side.
async function updateOrder(id, patch) {
  if (patch && patch.status) return transitionOrder(id, patch.status);
  return ORDERS.find((o) => o.id === id) || null;
}
async function cancelOrder(id, reason) {
  await api.orders.cancel(id, reason || "");
  await refresh(ORDER_KEYS);
  return ORDERS.find((o) => o.id === id);
}
async function reinstateOrder(id) {
  try { await api.orders.reinstate(id); }
  catch (e) { if (e instanceof ApiError && (e.code === "UNIT_TAKEN" || e.code === "DUPLICATE")) return null; throw e; }
  await refresh(ORDER_KEYS);
  return ORDERS.find((o) => o.id === id);
}
async function deleteOrder(id) { await api.orders.remove(id); await refresh(ORDER_KEYS); }
/** Upload a document for an order (signed contract / proof of payment / transfer proof) and index it. */
async function uploadOrderDocument(order, kind, file, milestoneId) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  const rnd = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36);
  const path = order.developerId + "/" + order.id + "/" + kind + (milestoneId ? "-" + milestoneId : "") + "-" + rnd + "." + ext;
  await api.storage.upload("documents", path, file, { accept: [".pdf", "image/*", ".doc", ".docx"] });
  const doc = await api.orders.attachDocument(order.id, kind, { storagePath: path, name: file.name, mime: file.type, size: file.size, milestoneId });
  await refresh(["orders", "orderActivity", "documents"]);
  return doc;
}
function documentFor(orderId, kind, milestoneId) {
  const list = DOCUMENTS.filter((d) => d.orderId === orderId && d.kind === kind && (milestoneId ? d.milestoneId === milestoneId : true));
  return list.length ? list[list.length - 1] : null;
}
async function openDocument(doc) {
  if (!doc) return;
  const url = await api.storage.signedUrl("documents", doc.storagePath, 600);
  window.open(url, "_blank", "noopener");
}
function setOrderSignedContract() { /* superseded by uploadOrderDocument(order, "signed_contract", file) */ }

// ---------------------------------------------------------------------
// Recurring operations revenue (verbatim)
// ---------------------------------------------------------------------
function opsRevenueForOrder(o) {
  const proj = projById(o.projectId);
  const ops = opsById(o.opsId);
  const hasAnyOps = !!ops || !!(o.perUnit && Object.values(o.perUnit).some((c) => c && c.opsId));
  if (!hasAnyOps || !isCustomerPaid(o)) return { gross: 0, ownerNet: 0, feeTotal: 0, devShare: 0, revnuShare: 0, mgmtFee: 0 };
  const ben = !!(o.customer && o.customer.beneficiary);
  const units = (o.unitNumbers && o.unitNumbers.length ? o.unitNumbers : [o.unitNumber]).map((n) => unitByNumber(n, ben)).filter(Boolean);
  let gross = 0, feeAnnual = 0;
  units.forEach((u) => { const m = (o.perUnitMode && o.perUnit && o.perUnit[u.number] && o.perUnit[u.number].opsId) ? opsById(o.perUnit[u.number].opsId) : ops; if (!m) return; const e = opsEconomics(m, u, u.price); gross += e.annualGross; feeAnnual += e.annualGross * ((m.mgmtFee || 0) / 100); });
  const monthlyGross = gross / 12;
  const mgmtFee = gross ? Math.round((feeAnnual / gross) * 1000) / 10 : (ops ? ops.mgmtFee || 0 : 0);
  const feeTotal = feeAnnual / 12;
  const devSharePct = (proj?.commercials?.developerOpsSharePct) || 0;
  const devShare = monthlyGross * (devSharePct / 100);
  const revnuShare = Math.max(0, feeTotal - devShare);
  const ownerNet = monthlyGross - feeTotal;
  return { gross: monthlyGross, ownerNet, feeTotal, devShare, revnuShare, mgmtFee, devSharePct };
}
function opsRevenueRollup(orders) {
  return orders.reduce((acc, o) => {
    const r = opsRevenueForOrder(o);
    acc.gross += r.gross; acc.ownerNet += r.ownerNet; acc.feeTotal += r.feeTotal;
    acc.devShare += r.devShare; acc.revnuShare += r.revnuShare;
    if (r.gross > 0) acc.activeUnits += 1;
    return acc;
  }, { gross: 0, ownerNet: 0, feeTotal: 0, devShare: 0, revnuShare: 0, activeUnits: 0 });
}

// ---------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------
const devById     = (id) => DEVELOPERS.find((d) => d.id === id);
const projById    = (id) => PROJECTS.find((p) => p.id === id);
const unitTypeById= (id) => UNIT_TYPES.find((t) => t.id === id);
const pkgById     = (id) => PACKAGES.find((p) => p.id === id);
const opsById     = (id) => OPS_MODELS.find((o) => o.id === id);
const designById  = (id) => DESIGN_STYLES.find((d) => d.id === id);
const smartById   = (id) => SMART_HOME.find((s) => s.id === id);
const payById     = (id) => PAYMENT_PLANS.find((p) => p.id === id);
const userById    = (id) => USERS.find((u) => u.id === id);
const mileById    = (id) => CONSTRUCTION_MILESTONES.find((m) => m.id === id);
const milesByProject = (projectId) => CONSTRUCTION_MILESTONES.filter((m) => m.projectId === projectId).sort((a, b) => a.order - b.order);

// ---------------------------------------------------------------------
// Projects / packages / flags / info
// ---------------------------------------------------------------------
async function createProject(payload) {
  const p = await api.projects.create(Object.assign({ optional: {} }, payload));
  p.optional = p.optional || {}; PROJECTS.push(p); bump(); return p;
}
async function createPackage(payload) {
  const id = payload.id && payload.id !== "new" ? payload.id : (payload.projectId + "-pkg-" + Date.now().toString(36).slice(-5));
  const p = await api.content.create("package", Object.assign({}, payload, { id }));
  PACKAGES.push(p); bump(); return p;
}
async function setProjectInfo(projectId, patch) {
  const row = await api.projects.update(projectId, patch);
  const p = projById(projectId); if (p) Object.assign(p, row);
  bump(); return p;
}
async function setProjectFlags(projectId, patch) {
  const p = projById(projectId);
  const features = Object.assign({}, p ? p.features : {}, patch.features || {});
  const optional = Object.assign({}, p ? p.optional : {}, patch.optional || {});
  const row = await api.projects.update(projectId, { features, optional });
  if (p) { p.features = row.features; p.optional = row.optional || {}; }
  bump();
}
async function removeProject(id) { await api.projects.remove(id); const i = PROJECTS.findIndex((p) => p.id === id); if (i >= 0) PROJECTS.splice(i, 1); bump(); }

// ---------------------------------------------------------------------
// Bilingual content (designs / packages / smart / ops)
// ---------------------------------------------------------------------
function _contentCollection(kind) {
  return kind === "design" ? DESIGN_STYLES : kind === "package" ? PACKAGES : kind === "smart" ? SMART_HOME : kind === "ops" ? OPS_MODELS : null;
}
async function setContentField(kind, id, patch) {
  const coll = _contentCollection(kind);
  const row = await api.content.update(kind, id, patch);
  const item = coll && coll.find((x) => x.id === id); if (item) Object.assign(item, row);
  bump(); return item;
}
async function createContent(kind, payload) {
  const coll = _contentCollection(kind);
  const row = await api.content.create(kind, payload);
  coll.push(row); bump(); return row;
}
async function setOpsAssumption(opsId, typeId, patch) {
  const o = opsById(opsId);
  const assume = Object.assign({}, o ? o.assume : {}); assume[typeId] = Object.assign({}, assume[typeId], patch);
  const row = await api.content.update("ops", opsId, { assume });
  if (o) o.assume = row.assume;
  bump();
}
function opsAssumption(ops, typeId) {
  if (!ops) return { rate: 0, occ: 0, risk: "medium" };
  const rate = (ops.defaultRate && ops.defaultRate[typeId]) || 0;
  const a = ops.assume && ops.assume[typeId];
  const occ = (a && a.occ != null) ? a.occ : Math.round((ops.occLow + ops.occHigh) / 2);
  const risk = (a && a.risk) || (ops.kind === "daily" ? "high" : /long/i.test(ops.name) ? "low" : "medium");
  return { rate, occ, risk };
}
function opsEconomics(ops, unit, totalPrice) {
  const a = opsAssumption(ops, unit ? unit.typeId : null);
  const { occ, risk } = a;
  const isDaily = ops && ops.kind === "daily";
  const fee = ops ? ops.mgmtFee : 0;
  const periods = isDaily ? 365 : 12;
  let rate = a.rate;
  if (ops && ops.targetRoi && unit && unit.price && occ && fee < 100) {
    rate = (ops.targetRoi / 100) * unit.price / (periods * (occ / 100) * (1 - fee / 100));
    rate = isDaily ? Math.round(rate) : Math.round(rate / 10) * 10;
  }
  const annualGross = rate * periods * (occ / 100);
  const annualNet = annualGross * (1 - fee / 100);
  const grossYield = unit && unit.price ? (annualGross / unit.price) * 100 : 0;
  const base = (unit && unit.price) || totalPrice;
  const roi = base ? (annualNet / base) * 100 : 0;
  const roiTotal = totalPrice ? (annualNet / totalPrice) * 100 : 0;
  return { rate, occ, risk, isDaily, annualGross, annualNet, operatorFee: fee, grossYield, roi, roiTotal };
}
function dealEconomics(rows) {
  const all = (rows || []).filter((r) => r && r.unit).map((r) => ({ unit: r.unit, ops: r.ops || null, ec: r.ops ? (r.ec || opsEconomics(r.ops, r.unit, r.unit.price)) : null }));
  const on = all.filter((r) => r.ec);
  if (!on.length) return { rate: 0, occ: 0, risk: "medium", isDaily: false, annualGross: 0, annualNet: 0, operatorFee: 0, grossYield: 0, roi: 0, mixed: false, rows: all, opsUnitsPrice: 0, opsUnitCount: 0 };
  let ag = 0, an = 0, feeAmt = 0, base = 0;
  const RISK_ORDER = { low: 0, medium: 1, high: 2 };
  let worst = "low";
  on.forEach((r) => { ag += r.ec.annualGross; an += r.ec.annualNet; feeAmt += r.ec.annualGross - r.ec.annualNet; base += r.unit.price || 0; if (RISK_ORDER[r.ec.risk] > RISK_ORDER[worst]) worst = r.ec.risk; });
  const prim = on[0];
  return { rate: prim.ec.rate, occ: prim.ec.occ, risk: worst, isDaily: prim.ops.kind === "daily",
           annualGross: ag, annualNet: an,
           operatorFee: ag ? Math.round((feeAmt / ag) * 1000) / 10 : (prim.ops.mgmtFee || 0),
           grossYield: base ? (ag / base) * 100 : 0, roi: base ? (an / base) * 100 : 0,
           mixed: on.some((r) => r.ops.id !== prim.ops.id), rows: all, opsUnitsPrice: base, opsUnitCount: on.length };
}
const RISK_META = {
  low:    { label: "Low risk",    color: "#1f8a5b", soft: "rgba(31,138,91,0.12)" },
  medium: { label: "Medium risk", color: "#b8860b", soft: "rgba(184,134,11,0.14)" },
  high:   { label: "High risk",   color: "#c0492f", soft: "rgba(192,73,47,0.13)" },
};
function designPalettes(design) {
  if (!design) return [];
  if (Array.isArray(design.palettes) && design.palettes.length) return design.palettes;
  return [{ id: design.id + "-p0", name: "Signature", nameAr: "أساسي", colors: design.palette || ["#FFFFFF", "#EEEEEF", "#1D1D1F", "#5EC4D4"] }];
}
function designPaletteById(design, paletteId) {
  const list = designPalettes(design);
  return list.find((p) => p.id === paletteId) || list[0];
}

// ---------------------------------------------------------------------
// Team / users (auth accounts are created by /api/users)
// ---------------------------------------------------------------------
async function createDevUser(payload) {
  const res = await api.users.create(payload);
  await refresh(["profiles"]);
  return Object.assign({}, USERS.find((u) => u.id === res.profile.id) || res.profile, { _tempPassword: res.tempPassword });
}
async function setDevUser(id, patch) {
  const { assignedProjectIds, _tempPassword, effectivePerms, ...rest } = patch;
  if (Object.keys(rest).length) await api.users.update(id, rest);
  if (assignedProjectIds) await api.users.setProjects(id, assignedProjectIds);
  await refresh(["profiles"]);
  return userById(id);
}
async function removeDevUser(id) { await api.users.remove(id); await refresh(["profiles"]); return true; }
async function resetUserPassword(id) { return api.users.resetPassword(id); }

async function patchDeveloper(devId, patch) {
  const row = await api.developers.update(devId, patch);
  const d = devById(devId); if (d) Object.assign(d, row);
  bump(); return d;
}
const setDevLogo = patchDeveloper;
async function createDeveloper(payload) {
  const d = await api.developers.create(payload);
  d.commissionLadder = defaultCommissionLadder(); d.revnuTerms = d.revnuTerms || revnuTermsBase();
  await api.developers.setLadder(d.id, d.commissionLadder);
  DEVELOPERS.push(d); bump(); return d;
}

// ---------------------------------------------------------------------
// Universal delete (super admin) — RLS decides, we mirror in memory
// ---------------------------------------------------------------------
const _DEL = {
  developer: [DEVELOPERS, "id", (id) => api.developers.remove(id)],
  project:   [PROJECTS, "id", (id) => api.projects.remove(id)],
  unitType:  [UNIT_TYPES, "id", (id) => api.unitTypes.remove(id)],
  unit:      [UNITS, "number", (id) => api.units.remove(id)],
  design:    [DESIGN_STYLES, "id", (id) => api.content.remove("design", id)],
  package:   [PACKAGES, "id", (id) => api.content.remove("package", id)],
  smart:     [SMART_HOME, "id", (id) => api.content.remove("smart", id)],
  ops:       [OPS_MODELS, "id", (id) => api.content.remove("ops", id)],
  contract:  [CONTRACTS, "id", (id) => api.contracts.remove(id)],
  user:      [USERS, "id", (id) => api.users.remove(id)],
  order:     [ORDERS, "id", (id) => api.orders.remove(id)],
  milestone: [CONSTRUCTION_MILESTONES, "id", (id) => api.milestones.remove(id)],
  payment:   [PAYMENT_PLANS, "id", (id) => api.paymentPlans.remove(id)],
};
async function removeEntity(kind, id) {
  const e = _DEL[kind]; if (!e) return false;
  const [coll, key, fn] = e;
  await fn(id);
  const i = coll.findIndex((x) => x[key] === id); if (i >= 0) coll.splice(i, 1);
  if (kind === "order") await refresh(ORDER_KEYS); else bump();
  return true;
}

// ---------------------------------------------------------------------
// Developer → Revnu receivables (verbatim math; state from the server)
// ---------------------------------------------------------------------
function revnuPayableForOrder(o) {
  const gross = Number(o.furnishCost) || 0;
  const net = gross / 1.15;
  const proj = projById(o.projectId);
  const m = proj?.commercials?.contractMarkup;
  const devCut = m?.kind === "pct" ? net * ((Number(m.value) || 0) / 100) : m?.kind === "amt" ? (Number(m.value) || 0) : 0;
  return Math.round(Math.max(0, net - devCut) * 1.15);
}
function invoiceFor(o) {
  if (!o || !isCustomerPaid(o)) return null;
  const sch = revnuScheduleForOrder(o);
  const total = revnuPayableForOrder(o);
  const paid = sch.filter((m) => m.paid).reduce((a, m) => a + m.amount, 0);
  const meta = INVOICES[o.id] || {};
  return { id: "INV-" + o.id.replace("REV-", ""), orderId: o.id, developerId: o.developerId, projectId: o.projectId,
           issuedAt: meta.issuedAt || o.paidAt || o.createdAt, total, paid, outstanding: total - paid,
           status: paid <= 0 ? "open" : paid >= total - 1 ? "settled" : "partial", milestones: sch };
}
function ensureInvoice() { /* created server-side when the customer pays */ }
function revnuPaidDefault(o) { return (RECEIVABLE_PAID[o.id] || []).slice(); }
async function setOrderPaid(orderId, paidIds, proofDocByMilestone) {
  const cur = RECEIVABLE_PAID[orderId] || [];
  const add = paidIds.filter((m) => !cur.includes(m));
  const rem = cur.filter((m) => !paidIds.includes(m));
  for (const m of add) await api.receivables.setPaid(orderId, m, true, proofDocByMilestone && proofDocByMilestone[m]);
  for (const m of rem) await api.receivables.setPaid(orderId, m, false);
  await refresh(["receivablePaid", "orderActivity", "documents"]);
}
function transferProofFor(orderId, milestoneId) {
  const id = RECEIVABLE_DOCS[orderId] && RECEIVABLE_DOCS[orderId][milestoneId];
  return (id && DOCUMENTS.find((d) => d.id === id)) || documentFor(orderId, "transfer_proof", milestoneId);
}
function revnuScheduleForOrder(o, paidOverride) {
  const terms = revnuTermsForProject(o.projectId) || { milestones: [] };
  const payable = revnuPayableForOrder(o);
  const paid = paidOverride || revnuPaidDefault(o);
  return (terms.milestones || []).map((m) => ({
    id: m.id, label: ((typeof window !== "undefined" && window.I18N && window.I18N.isAR && m.labelAr) ? m.labelAr : (m.label || m.labelAr || "")), trigger: m.trigger, pct: m.pct,
    amount: payable * (m.pct / 100),
    paid: paid.includes(m.id),
  }));
}
function scheduleStr(plan) {
  if (!plan) return "";
  if (Array.isArray(plan.milestones) && plan.milestones.length) {
    return plan.milestones.map((m) => { const cm = mileById(m.mileId); const label = m.label || cm?.name || "—"; return `${m.pct}% · ${label}`; }).join("  ·  ");
  }
  return plan.schedule || "";
}
function unitByNumber(n, beneficiary) {
  const u = UNITS.find((x) => x.number === n);
  if (!u) return null;
  const t = unitTypeById(u.typeId);
  const list = (t?.basePrice || 0) + (u.priceAdj || 0);
  const ben  = (u.priceBen != null && u.priceBen !== "") ? Number(u.priceBen) : list;
  return { ...u, type: t, priceList: list, priceBen: ben, price: beneficiary ? ben : list };
}
function unitPriceFor(u, beneficiary) { if (!u) return 0; const t = unitTypeById(u.typeId); const list = (t?.basePrice || 0) + (u.priceAdj || 0); const ben = (u.priceBen != null && u.priceBen !== "") ? Number(u.priceBen) : list; return beneficiary ? ben : list; }
function fmtSAR(n) { if (n == null || isNaN(n)) return "—"; return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n)); }
function fmtDate(s){ if (!s) return "—"; var ar = (typeof window !== "undefined" && window.I18N && window.I18N.isAR); return new Date(s).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
function boqFor(pkg, typeId) { if (!pkg) return []; return (pkg.boqByType && typeId && pkg.boqByType[typeId]) || pkg.boq || []; }
function floorPlansOf(t) { if (!t) return []; if (t.floorPlans && t.floorPlans.length) return t.floorPlans; return t.floorPlanImg ? [{ label: "", src: t.floorPlanImg }] : []; }
function legalNameOf(dev, ar) { if (!dev) return ""; return ar ? (dev.legalNameAr || dev.legalName || dev.nameAr || dev.name) : (dev.legalName || dev.name); }
function boqTotal(boq){ return (boq || []).reduce((acc, l) => acc + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0); }

function getInterested() { return LEADS.slice(); }
async function setLeadStatus(id, status) { const row = await api.leads.update(id, { status }); const l = LEADS.find((x) => x.id === id); if (l) Object.assign(l, row); bump(); }

// ---- unit-type media + types ----
async function setTypeMedia(typeId, patch) {
  const row = await api.unitTypes.update(typeId, patch);
  const t = unitTypeById(typeId); if (t) Object.assign(t, row);
  bump();
}
async function createUnitType(payload) {
  const base = (payload.projectId || "T").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "T";
  let id = payload.id || (base + "-" + Date.now().toString(36).slice(-4).toUpperCase());
  while (UNIT_TYPES.find((x) => x.id === id)) id += "X";
  const t = await api.unitTypes.create(Object.assign({ id, bedrooms: 1, baths: 1, area: 0, basePrice: 0 }, payload));
  UNIT_TYPES.push(t); bump(); return t;
}
async function setUnitType(id, patch) {
  const row = await api.unitTypes.update(id, patch);
  const t = unitTypeById(id); if (t) Object.assign(t, row);
  bump(); return t;
}

// ---- project-scoped / developer-scoped views (verbatim) ----
function scopedToProject(projectId) {
  const project = projById(projectId);
  if (!project) return null;
  return {
    project,
    developer: devById(project.developerId),
    unitTypes: UNIT_TYPES.filter((t) => t.projectId === projectId),
    units:     UNITS.filter((u) => u.projectId === projectId),
    designs:   DESIGN_STYLES.filter((d) => d.projectId === projectId),
    packages:  PACKAGES.filter((p) => p.projectId === projectId),
    smart:     SMART_HOME.filter((s) => s.projectId === projectId),
    payments:  PAYMENT_PLANS.filter((p) => p.projectId === projectId),
    ops:       OPS_MODELS.filter((o) => o.projectId === projectId),
    contracts: CONTRACTS.filter((c) => c.projectId === projectId),
    orders:    ORDERS.filter((o) => o.projectId === projectId),
    constructionMilestones: milesByProject(projectId),
  };
}
function scopedTo(devId) {
  const dev      = devById(devId);
  const projects = PROJECTS.filter((p) => p.developerId === devId);
  const pids     = projects.map((p) => p.id);
  return {
    developer: dev,
    projects,
    unitTypes: UNIT_TYPES.filter((t) => pids.includes(t.projectId)),
    units:     UNITS.filter((u) => pids.includes(u.projectId)),
    designs:   DESIGN_STYLES.filter((d) => pids.includes(d.projectId)),
    packages:  PACKAGES.filter((p) => pids.includes(p.projectId)),
    smart:     SMART_HOME.filter((s) => pids.includes(s.projectId)),
    payments:  PAYMENT_PLANS.filter((p) => pids.includes(p.projectId)),
    ops:       OPS_MODELS.filter((o) => pids.includes(o.projectId)),
    constructionMilestones: CONSTRUCTION_MILESTONES.filter((m) => pids.includes(m.projectId)),
    contracts: CONTRACTS.filter((c) => pids.includes(c.projectId)),
    users:     USERS.filter((u) => u.developerId === devId),
    orders:    ORDERS.filter((o) => o.developerId === devId),
  };
}
function projectsForUser(user) {
  if (!user) return [];
  if (user.role === "revnu_admin") return PROJECTS;
  const dev = user.developerId;
  if (!dev) return [];
  const all = PROJECTS.filter((p) => p.developerId === dev);
  if (user.role === "developer_admin") return all;
  if (user.role === "sales_rep") {
    if (!user.assignedProjectIds || user.assignedProjectIds.length === 0) return all;
    return all.filter((p) => user.assignedProjectIds.includes(p.id));
  }
  return all;
}

// =====================================================================
//  SALES COMMISSION — flexible ladder + split engine (verbatim)
// =====================================================================
const COMMISSION_SCOPES = ["own", "team", "all"];
function defaultCommissionLadder() {
  return [
    { id: "lvl-rep",      name: "Sales Rep",      nameAr: "مندوب المبيعات",  pct: 80, scope: "own"  },
    { id: "lvl-manager",  name: "Sales Manager",  nameAr: "مدير المبيعات",   pct: 15, scope: "team" },
    { id: "lvl-director", name: "Sales Director", nameAr: "مدير عام المبيعات", pct: 5,  scope: "all"  },
  ];
}
function commissionLadderFor(devId) { const d = devById(devId); return (d && d.commissionLadder) || defaultCommissionLadder(); }
async function setCommissionLadder(devId, ladder) {
  await api.developers.setLadder(devId, ladder);
  const d = devById(devId); if (d) d.commissionLadder = ladder;
  bump();
}
function commissionPoolFor(order) {
  if (!order) return 0;
  const proj = projById(order.projectId);
  const c = proj && proj.commercials && proj.commercials.salesCommission ? proj.commercials.salesCommission : { kind: "pct", value: 0 };
  const extras = (Number(order.furnishCost) || 0) / 1.15;
  return c.kind === "pct" ? extras * ((Number(c.value) || 0) / 100) : (Number(c.value) || 0);
}
function reportsChain(userId) {
  const chain = []; const seen = {};
  let u = userById(userId);
  while (u && u.reportsTo && !seen[u.reportsTo]) {
    seen[u.reportsTo] = 1;
    const mgr = userById(u.reportsTo);
    if (!mgr) break;
    chain.push(mgr); u = mgr;
  }
  return chain;
}
function commissionSplit(order) {
  if (!order) return [];
  const pool = commissionPoolFor(order);
  const ladder = commissionLadderFor(order.developerId);
  const rep = userById(order.repId);
  const chain = rep ? reportsChain(rep.id) : [];
  const out = [];
  ladder.forEach((lvl) => {
    const amt = pool * ((Number(lvl.pct) || 0) / 100);
    let payees = [];
    if (lvl.scope === "own") { if (rep) payees = [rep]; }
    else if (lvl.scope === "team") { const mgr = chain.find((m) => m.commissionLevelId === lvl.id); if (mgr) payees = [mgr]; }
    else { payees = USERS.filter((u) => u.developerId === order.developerId && u.commissionLevelId === lvl.id); }
    if (payees.length === 0) {
      out.push({ levelId: lvl.id, levelName: lvl.name, levelNameAr: lvl.nameAr, scope: lvl.scope, userId: null, userName: null, pct: lvl.pct, amount: amt });
    } else {
      const each = amt / payees.length;
      payees.forEach((p) => out.push({ levelId: lvl.id, levelName: lvl.name, levelNameAr: lvl.nameAr, scope: lvl.scope, userId: p.id, userName: p.name, userNameAr: p.nameAr, pct: lvl.pct, amount: each }));
    }
  });
  return out;
}
function payoutKey(orderId, userId, levelId) { return orderId + "::" + (userId || "_") + "::" + levelId; }
function payoutStatus(orderId, userId, levelId) { return PAYOUTS[payoutKey(orderId, userId, levelId)] || "pending"; }
async function setPayoutStatus(orderId, userId, levelId, status) {
  await api.payouts.set(orderId, userId, levelId, status);
  PAYOUTS[payoutKey(orderId, userId, levelId)] = status; bump();
}
function payoutLinesForDeveloper(devId) {
  const orders = ORDERS.filter((o) => o.developerId === devId && isLive(o));
  const lines = [];
  orders.forEach((o) => {
    const payable = isCustomerPaid(o);
    commissionSplit(o).forEach((s) => {
      if (!s.userId) return;
      lines.push(Object.assign({}, s, { orderId: o.id, projectId: o.projectId, customerName: o.customerName, status: o.status, payable, paid: payoutStatus(o.id, s.userId, s.levelId) === "paid" }));
    });
  });
  return lines;
}

// ---- support tickets (read side; writes in support.js) ----
function tickets() { return TICKETS; }

const D = {
  DEVELOPERS, PROJECTS, UNIT_TYPES, UNITS, DESIGN_STYLES, PACKAGES, SMART_HOME, PAYMENT_PLANS, OPS_MODELS, CONTRACTS, USERS, ORDERS, CONSTRUCTION_MILESTONES, DOCUMENTS, TICKETS, LEADS,
  DEV_ROLES, DEV_PERMS, REVNU_ROLES, REVNU_PERMS, CONTRACT_VARS,
  hydrate, refresh, subscribe, getVersion, setMe, me, signOut, ORDER_KEYS, isHydrated: () => hydratedOnce,
  devById, projById, unitTypeById, pkgById, opsById, designById, designPalettes, designPaletteById, smartById, payById, userById, mileById, milesByProject, scheduleStr,
  commissionLadderFor, setCommissionLadder, commissionPoolFor, commissionSplit, defaultCommissionLadder, COMMISSION_SCOPES,
  payoutKey, payoutStatus, setPayoutStatus, payoutLinesForDeveloper, reportsChain,
  unitByNumber, unitPriceFor, updateUnit, fmtSAR, fmtDate, boqTotal, boqFor, floorPlansOf, legalNameOf, scopedTo, scopedToProject, projectsForUser, getInterested, setLeadStatus, createProject, createPackage, removeProject,
  revnuPayableForOrder, revnuPaidDefault, revnuScheduleForOrder, transferProofFor, setTypeMedia, ORDER_STATUS_META, firstPaymentReceived, setOrderSignedContract,
  opsAssumption, opsEconomics, setOpsAssumption, RISK_META, setProjectFlags, setProjectInfo,
  createUnitType, setUnitType, createDevUser, setDevUser, removeDevUser, resetUserPassword, removeEntity, setDevLogo, patchDeveloper, createDeveloper,
  devRoleById, devPermsFor, devHasPerm,
  contractVarValues, fillContract, createContract, setContract, removeContract,
  setUnitStatus, createOrder, updateOrder, advanceOrderStatus, transitionOrder, takenUnitNumbers, ORDER_STATUS_FLOW, uploadOrderDocument, documentFor, openDocument, deleteOrder,
  setRevnuTerms, setRevnuTermsForProject, revnuTermsForProject, setOrderPaid, addUnit, addUnits, removeUnit, opsRevenueForOrder, opsRevenueRollup, setContentField, createContent,
  isLive, isContractOut, isSigned, isCustomerPaid, isOperating, isSubmitted, isUnitTaken, nextOrderId, reserveOrderId, cancelOrder, reinstateOrder,
  activityFor, logActivity, queueNotification, NOTIFY_TEMPLATES, VALID, toCSV, downloadCSV, parseCSV, invoiceFor, ensureInvoice, dealEconomics, tickets,
  ApiError,
};
if (typeof window !== "undefined") window.REVNU_DATA = D;
export default D;
