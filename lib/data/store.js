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
import AGREEMENT_MASTER from "./agreement-master.json";

// ---------------------------------------------------------------------
// Collections (mutated in place so every reference stays valid)
// ---------------------------------------------------------------------
const DEVELOPERS = [], PROJECTS = [], UNIT_TYPES = [], UNITS = [], DESIGN_STYLES = [], PACKAGES = [],
      SMART_HOME = [], PAYMENT_PLANS = [], OPS_MODELS = [], CONTRACTS = [], USERS = [], ORDERS = [],
      CONSTRUCTION_MILESTONES = [], DEV_PERMS = [], DEV_ROLES = [], REVNU_ROLES = [], REVNU_PERMS = [],
      CONTRACT_VARS = [], DOCUMENTS = [], TICKETS = [], LEADS = [], COMMISSION_LEVELS = [],
      FLOORING_FINISHES = [], FLOORING_ZONES = [], KITCHENS = [], AC_SYSTEMS = [], COOLING_POINTS = [], LAYOUT_OPTIONS = [],
      // v2: remote ordering + e-signature (read by lib/data/remote.js), agreement composer, platform billing
      SALE_LINKS = [], SALE_LEADS = [], SUBMISSIONS = [], SIGNING_LINKS = [], SIGNATURES = [], INBOX = [],
      AGREEMENT_LAYOUTS = [], AGREEMENT_VERSIONS = [], PLATFORM_INVOICES = [],
      SIGNATORIES = [];     // signatory versions issued orders are pinned to (order.signatoryId)
let PRICE_BOOK = null;    // billing_settings.price_book (null until loaded -> defaults)
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
  if (snap.flooringFinishes) replace(FLOORING_FINISHES, snap.flooringFinishes);
  if (snap.flooringZones) replace(FLOORING_ZONES, snap.flooringZones);
  if (snap.kitchens) replace(KITCHENS, snap.kitchens);
  if (snap.acSystems) replace(AC_SYSTEMS, snap.acSystems);
  if (snap.coolingPoints) replace(COOLING_POINTS, snap.coolingPoints);
  if (snap.layoutOptions) replace(LAYOUT_OPTIONS, snap.layoutOptions);
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
  if (snap.saleLinks) replace(SALE_LINKS, snap.saleLinks);
  if (snap.saleLeads) replace(SALE_LEADS, snap.saleLeads);
  if (snap.submissions) replace(SUBMISSIONS, snap.submissions);
  if (snap.signingLinks) replace(SIGNING_LINKS, snap.signingLinks);
  if (snap.signatures) replace(SIGNATURES, snap.signatures);
  if (snap.inbox) replace(INBOX, snap.inbox);
  if (snap.signatories) replace(SIGNATORIES, snap.signatories);
  if (snap.agreementLayouts) replace(AGREEMENT_LAYOUTS, snap.agreementLayouts);
  if (snap.agreementVersions) replace(AGREEMENT_VERSIONS, snap.agreementVersions);
  if (snap.billingSettings) PRICE_BOOK = (snap.billingSettings[0] && snap.billingSettings[0].priceBook) || PRICE_BOOK;
  if (snap.platformInvoices) replace(PLATFORM_INVOICES, snap.platformInvoices);
  // The prototype keeps the e-signature on the order itself (o.signature); mirror it from signatures.
  if (snap.orders || snap.signatures) ORDERS.forEach((o) => {
    const g = SIGNATURES.find((x) => x.orderId === o.id);
    o.signature = g ? { id: g.id, signerName: g.signerName, signedAt: g.signedAt, ip: g.ip, userAgent: g.userAgent, documentHash: g.documentHash } : null;
  });
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
const ORDER_KEYS = ["orders", "orderActivity", "documents", "invoices", "receivablePaid", "payouts", "units", "signingLinks", "signatures", "signatories"];
const REMOTE_KEYS = ["saleLinks", "saleLeads", "submissions", "signingLinks", "signatures", "inbox"];

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
  const dev = signerOf(devById(order && order.developerId), order);
  const proj = projById(order && order.projectId);
  const _nums = order ? ((order.unitNumbers && order.unitNumbers.length) ? order.unitNumbers : (order.unitNumber ? [order.unitNumber] : [])) : [];
  const unit = _nums.length ? unitByNumber(_nums[0]) : null;
  const type = unit && unitTypeById(unit.typeId);
  const pkg = order && order.packageId && pkgById(order.packageId);
  const design = order && order.designId && designById(order.designId);
  const smart = order && order.smartId && smartById(order.smartId);
  const kitchen = order && order.kitchenId && kitchenById(order.kitchenId);
  const ac = order && order.acId && acById(order.acId);
  const flLines = (order && order.flooring && unit) ? flooringLines(order.projectId, unit.typeId, order.flooring) : [];
  const fmtDl = (key) => { const d = deadlineFor(proj, key); return d ? d.toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "2-digit", month: "long", year: "numeric" }) : ""; };
  const ops = order && order.opsId && opsById(order.opsId);
  const nm = (o, k) => (ar && o && o[k + "Ar"]) ? o[k + "Ar"] : (o ? o[k] : "");
  const today = new Date().toLocaleDateString(ar ? "ar-SA-u-ca-islamic" : "en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const vals = {
    buyer_name: order ? order.customerName : "", buyer_id: order ? order.customerId : "",
    buyer_email: order ? order.customerEmail : "", buyer_mobile: fmtMobile(order && order.customer),
    developer_name: dev ? nm(dev, "name") : "", project_name: proj ? nm(proj, "name") : "",
    authorized_signer: dev ? (ar ? (dev.authorizedSignerAr || dev.authorizedSigner || dev.primaryContact) : (dev.authorizedSigner || dev.primaryContact)) : "",
    authorized_signer_title: dev ? (ar ? (dev.authorizedSignerTitleAr || dev.authorizedSignerTitle || "") : (dev.authorizedSignerTitle || "")) : "",
    project_city: proj ? proj.city : "", unit_number: _nums.join(", "),
    developer_legal_name: legalNameOf(dev, ar), developer_cr: dev ? (dev.crNumber || "") : "", developer_vat: dev ? (dev.vat || "") : "",
    n_units: String(_nums.length || ""), units_list: _nums.join(", "),
    warranty_years: pkg ? String(pkg.warranty || 2) : "2", fitout_warranty_years: (pkg && pkg.fitout && pkg.fitout.warranty) ? String(pkg.fitout.warranty) : "",
    addendum_value: order && order.furnishCost ? fmtSAR(order.furnishCost) + " SAR" : "",
    agreement_ref: "AGR-" + (order && order.id ? String(order.id).replace(/[^0-9]/g, "") : ""),
    sec_parties: "1", sec_property: "2", sec_investment: "3", sec_payment: "4",
    unit_type: type ? nm(type, "name") : "", unit_area: type ? type.area + " m²" : "",
    unit_price: order ? fmtSAR(order.unitPrice) + " SAR" : "",
    package_name: pkg ? nm(pkg, "name") : "", design_name: design ? nm(design, "name") : "",
    palette_name: (() => { if (!design) return ""; const p = designPaletteById(design, order && order.paletteId); return p ? (ar ? (p.nameAr || p.name) : p.name) : ""; })(),
    smart_name: smart ? nm(smart, "name") : "", ops_name: ops ? nm(ops, "name") : "",
    kitchen_name: kitchen ? nm(kitchen, "name") : "",
    kitchen_palette: (() => { const p = kitchen && kitchenPaletteById(kitchen, order.kitchenPaletteId); return p ? (ar ? (p.nameAr || p.name) : p.name) : ""; })(),
    kitchen_scope: kitchen ? nm(kitchenScopeById(order.kitchenScope), "name") : "",
    kitchen_cost: order && order.kitchenCost ? fmtSAR(order.kitchenCost) + " SAR" : "",
    kitchen_addons: kitchen ? kitchenAddonsChosen(kitchen, order.kitchenScope, order.kitchenAddons).map((a) => nm(a, "name")).join(ar ? "، " : ", ") : "",
    ac_name: ac ? nm(ac, "name") : "", ac_brand: ac ? (ar ? (ac.brandAr || ac.brand) : ac.brand) : "", ac_cost: order && order.acCost ? fmtSAR(order.acCost) + " SAR" : "",
    flooring_cost: order && order.flooringCost ? fmtSAR(order.flooringCost) + " SAR" : "",
    flooring_summary: (order && unit) ? flooringSummary(order.projectId, unit.typeId, order.flooring, ar) : "",
    flooring_zones: flLines.filter((l) => l.finish).map((l) => ar ? l.meta.ar : l.meta.en).join(ar ? "، " : ", "),
    layout_summary: (order && unit) ? layoutSummary(order.projectId, unit.typeId, order.layoutIds, ar) : "",
    layout_cost: order && order.layoutCost ? fmtSAR(order.layoutCost) + " SAR" : "",
    layout_rooms: (order && unit) ? layoutRoomsAfter(order.projectId, unit.typeId, order.layoutIds, ar) : "",
    layout_deadline: fmtDl("layout"), flooring_deadline: fmtDl("flooring"),
    furnish_cost: order && order.furnishCost ? fmtSAR(order.furnishCost) + " SAR" : "",
    total_price: order ? fmtSAR((order.unitPrice || 0) + (order.furnishCost || 0)) + " SAR" : "",
    today,
  };
  // Developer custom fields → {{dev.key}}
  ((dev && dev.customFields) || []).forEach((f) => { if (f && f.key) vals["dev." + f.key] = (ar && f.valueAr) ? f.valueAr : (f.value || ""); });
  return vals;
}
// Replace {{code}} tokens with values; unknown/empty → bracketed placeholder.
function fillContract(body, order, ar, extra) {
  extra = extra || {};
  const vals = Object.assign(contractVarValues(order, ar), extra.vals || {});
  let out = body || "";
  // Conditional blocks: {{#has_ops}}...{{/has_ops}} kept only when the choice exists.
  const flags = Object.assign({
    has_ops: !!(order && order.opsId), has_smart: !!(order && order.smartId), has_kitchen: !!(order && order.kitchenId), has_ac: !!(order && order.acId), has_flooring: !!(order && order.flooring && Object.keys(order.flooring).length), has_layout: !!(order && order.layoutIds && order.layoutIds.length),
    has_fitout: !!(order && order.fitout), has_furnishing: !!(order && order.packageId),
    has_multi: !!(order && order.unitNumbers && order.unitNumbers.length > 1),
  }, extra.flags || {});
  for (const k in flags) {
    const re = new RegExp("\\{\\{#" + k + "\\}\\}([\\s\\S]*?)\\{\\{\\/" + k + "\\}\\}", "g");
    out = out.replace(re, flags[k] ? "$1" : "");
  }
  return out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, code) => {
    const v = vals[code];
    return (v !== undefined && v !== "") ? v : "[" + code + "]";
  });
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
  review:    { en: "Submitted",    ar: "مقدمة" },
  draft:     { en: "Submitted",    ar: "مقدمة" },
  active:    { en: "Submitted",    ar: "مقدمة",    nextEn: "Issue contract",   nextAr: "إصدار العقد" },
  issued:    { en: "Contract issued", ar: "صدر العقد", nextEn: "Mark signed",      nextAr: "تأكيد التوقيع", needsUpload: true },
  signed:    { en: "Signed",       ar: "موقع",        nextEn: "Mark customer paid", nextAr: "تأكيد دفع العميل" },
  paid:      { en: "Customer paid", ar: "دفع العميل",  final: true },
  completed: { en: "Completed",     ar: "مكتملة" },
  cancelled: { en: "Cancelled",     ar: "ملغى",       final: true },
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
/** Extras are shown and stored VAT-inclusive in whole riyals, rounded per line (n × 115 / 100 keeps x.5 exact), and a
 *  total is the sum of its rounded lines — so the agreement's lines always add up to its total. */
function withVat(net) { return Math.round((Number(net) || 0) * 115 / 100); }
function withVatSum(...nets) { return nets.reduce((a, n) => a + withVat(n), 0); }
/** The developer as an issued order shows it: the signatory, signature and stamp pinned when it was issued.
 *  Orders that are not issued yet (or were issued before versions existed) show the developer's current block. */
function signerOf(developer, order) {
  const s = developer && order && order.signatoryId ? SIGNATORIES.find((x) => x.id === order.signatoryId) : null;
  if (!s) return developer;
  return Object.assign({}, developer, {
    authorizedSigner: s.authorizedSigner, authorizedSignerAr: s.authorizedSignerAr, authorizedSignerTitle: s.authorizedSignerTitle,
    authorizedSignerTitleAr: s.authorizedSignerTitleAr, signature: s.signature, stamp: s.stamp, signatureData: null, stampData: null,
  });
}
function logActivity() { /* activity is written server-side by the order RPCs */ }
const NOTIFY_TEMPLATES = {
  issued: { en: "Your agreement is ready to sign", ar: "اتفاقيتك جاهزة للتوقيع" },
  signed: { en: "Signed agreement received",       ar: "تم استلام الاتفاقية الموقعة" },
  paid:   { en: "Payment confirmed — welcome aboard", ar: "تم تأكيد الدفع — أهلا بك" },
};
function queueNotification() { /* queued server-side by transition_order() */ }

// ---- Validation helpers (verbatim) ----
const VALID = {
  nationalId: (v) => /^[12]\d{9}$/.test(String(v || "").replace(/\s/g, "")),
  mobile:     (v) => /^(\+?966|0)?5\d{8}$/.test(String(v || "").replace(/[\s-]/g, "")),
  mobileIntl: (code, v) => { const n = String(v || "").replace(/[\s-]/g, ""); if (!n) return true; return (code || "+966") === "+966" && !n.startsWith("+") ? /^(966|0)?5\d{8}$/.test(n) : /^\+?\d{6,13}$/.test(n); },
  email:      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim()),
  // Uploads: raster images only (SVG can carry scripts), max 10 MB.
  imageFile:  (f) => !!f && /^image\/(png|jpeg|webp)$/.test(f.type) && f.size <= 10 * 1024 * 1024,
  docFile:    (f) => !!f && /^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type) && f.size <= 10 * 1024 * 1024,
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
const isUnitTaken = (number) => takenUnitNumbers().has(number) || ((UNITS.find((u) => u.number === number) || {}).status === "sold");
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
/** Edit the buyer on an order (rep/admin) until it is signed. The server keeps the flat customer* mirrors in sync,
 *  logs the change and re-issues the agreement, so an open signing link shows the corrected details. */
async function updateOrderCustomer(id, cust) {
  const o = ORDERS.find((x) => x.id === id);
  if (o && (["signed", "paid", "operating", "completed"].includes(o.status) || o.signature)) throw new ApiError("BUYER_LOCKED");
  await api.remote.updateCustomer(id, cust);
  api.notifications.dispatch(id);   // a new or corrected e-mail on an issued agreement queues "ready to sign" again
  await refresh(["orders", "orderActivity"]);
  return ORDERS.find((x) => x.id === id) || null;
}
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
  return kind === "design" ? DESIGN_STYLES : kind === "package" ? PACKAGES
       : kind === "smart" ? SMART_HOME : kind === "kitchen" ? KITCHENS : kind === "ac" ? AC_SYSTEMS : kind === "flooring" ? FLOORING_FINISHES : kind === "layout" ? LAYOUT_OPTIONS : kind === "ops" ? OPS_MODELS : null;
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
  // e-mail is the sign-in identity (auth.users) — it is never changed from a profile edit
  const { assignedProjectIds, _tempPassword, effectivePerms, email, ...rest } = patch;
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
  kitchen:   [KITCHENS, "id", (id) => api.content.remove("kitchen", id)],
  ac:        [AC_SYSTEMS, "id", (id) => api.content.remove("ac", id)],
  flooring:  [FLOORING_FINISHES, "id", (id) => api.content.remove("flooring", id)],
  layout:    [LAYOUT_OPTIONS, "id", (id) => api.content.remove("layout", id)],
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

async function createPaymentPlan(plan) { const row = await api.paymentPlans.create(plan); PAYMENT_PLANS.push(row); bump(); return row; }
/** Upload a catalogue image (logo / render / floor plan) to the public media bucket; returns its public URL. */
async function uploadMedia(file, path) {
  await api.storage.upload("media", path, file, { accept: ["image/*", ".pdf", ".svg"], maxBytes: 15 * 1024 * 1024 });
  return api.storage.publicUrl("media", path);
}
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
    kitchens:  KITCHENS.filter((k) => k.projectId === projectId),
    ac:        AC_SYSTEMS.filter((a) => a.projectId === projectId),
    coolingPoints: COOLING_POINTS.filter((c) => c.projectId === projectId),
    flooring:  FLOORING_FINISHES.filter((f) => f.projectId === projectId),
    flooringZones: FLOORING_ZONES.filter((z) => z.projectId === projectId),
    layout:    LAYOUT_OPTIONS.filter((o) => o.projectId === projectId),
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
    kitchens:  KITCHENS.filter((k) => pids.includes(k.projectId)),
    ac:        AC_SYSTEMS.filter((a) => pids.includes(a.projectId)),
    flooring:  FLOORING_FINISHES.filter((f) => pids.includes(f.projectId)),
    layout:    LAYOUT_OPTIONS.filter((o) => pids.includes(o.projectId)),
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
  if (user.role === "developer_admin" || devHasPerm(user, "team") || devHasPerm(user, "projects")) return all;
  if (!user.assignedProjectIds || user.assignedProjectIds.length === 0) return all;
  return all.filter((p) => user.assignedProjectIds.includes(p.id));
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

// ---------------------------------------------------------------------
// v2 catalogues: kitchens / cooling / flooring / layout + deadlines.
// Pure logic copied verbatim from the client's v2 data.js; the seed arrays
// now come from the snapshot and creates/updates go through REVNU_API.
// ---------------------------------------------------------------------
const KITCHEN_SCOPES = [
  { id: "cabinets", name: "Kitchen only", nameAr: "المطبخ فقط", hint: "Cabinetry, drawers, worktop, sink & tap", hintAr: "الخزائن والأدراج والسطح والحوض والخلاط" },
  { id: "full",     name: "Full kitchen", nameAr: "مطبخ كامل",  hint: "Cabinetry + fridge, oven, hob, dishwasher, washing machine", hintAr: "الخزائن + ثلاجة وفرن وموقد وغسالة صحون وغسالة ملابس" },
];
const kitchenById = (id) => KITCHENS.find((k) => k.id === id);
const kitchenPaletteById = (k, pid) => { const l = (k && k.palettes) || []; return l.find((p) => p.id === pid) || l[0] || null; };
const kitchenScopeById = (id) => KITCHEN_SCOPES.find((s) => s.id === id) || KITCHEN_SCOPES[0];
// SAR ex-VAT for a kitchen choice on a given unit type (0 = not offered for that type)
const kitchenPrice = (k, scope, typeId) => { if (!k || !k.scopes) return 0; const s = k.scopes[scope || "cabinets"]; return s && s.pricing ? (s.pricing[typeId] || 0) : 0; };
// Optional items (e.g. washing machine): each has a flat SAR price and the scopes it is offered under.
const kitchenAddonsFor = (k, scope) => ((k && k.addons) || []).filter((a) => !a.scopes || !a.scopes.length || a.scopes.includes(scope || "cabinets"));
const kitchenAddonsChosen = (k, scope, ids) => { const ok = kitchenAddonsFor(k, scope); return (ids || []).map((id) => ok.find((a) => a.id === id)).filter(Boolean); };
const kitchenAddonsPrice = (k, scope, ids) => kitchenAddonsChosen(k, scope, ids).reduce((a, x) => a + (Number(x.price) || 0), 0);
// Full ex-VAT kitchen price for a unit type: base scope price + chosen optional items.
const kitchenTotalPrice = (k, scope, typeId, ids) => { const base = kitchenPrice(k, scope, typeId); return base > 0 ? base + kitchenAddonsPrice(k, scope, ids) : 0; };

// ---------- Cooling / AC (per project, toggled by features.cooling) ----------
// Whole-unit only. Each unit type declares its COOLING POINTS (room → capacity in BTU). An AC SYSTEM is a
// brand + model with a price per capacity tier and an installation fee per point; price for a unit =
// Σ tier price of every point + install × points (+ chosen optional items). Systems list which unit types they fit.
const AC_TYPES = [
  { id: "split",  en: "Split · wall-mounted",     ar: "سبليت · حائطي" },
  { id: "ducted", en: "Ducted split · concealed", ar: "سبليت مخفي · دكت" },
  { id: "vrf",    en: "Central VRF / VRV",        ar: "مركزي VRF" },
  { id: "window", en: "Window unit",              ar: "وحدة شباك" },
];
const coolingPointsFor = (projectId, typeId) => { const c = COOLING_POINTS.find((x) => x.projectId === projectId && x.typeId === typeId); return c ? (c.points || []) : []; };
const acById = (id) => AC_SYSTEMS.find((a) => a.id === id);
const acTypeById = (id) => AC_TYPES.find((t) => t.id === id) || AC_TYPES[0];
const acFits = (a, typeId) => !!a && (!a.fits || !a.fits.length || a.fits.includes(typeId));
// Price at the smallest tier that covers the required capacity (falls back to the largest tier).
const acTierPrice = (a, btu) => { const keys = a && a.tiers ? Object.keys(a.tiers).map(Number).filter((k) => Number(a.tiers[k]) > 0).sort((x, y) => x - y) : []; if (!keys.length) return 0; const hit = keys.find((k) => k >= (Number(btu) || 0)); return Number(a.tiers[hit != null ? hit : keys[keys.length - 1]]) || 0; };
const acPrice = (a, projectId, typeId) => { if (!a || !acFits(a, typeId)) return 0; const pts = coolingPointsFor(projectId, typeId); if (!pts.length) return 0; return pts.reduce((s, p) => s + acTierPrice(a, p.btu), 0) + (Number(a.install) || 0) * pts.length; };
const acAddonsChosen = (a, ids) => ((a && a.addons) || []).filter((x) => (ids || []).includes(x.id));
const acAddonsPrice = (a, ids) => acAddonsChosen(a, ids).reduce((s, x) => s + (Number(x.price) || 0), 0);
const acTotalPrice = (a, projectId, typeId, ids) => { const base = acPrice(a, projectId, typeId); return base > 0 ? base + acAddonsPrice(a, ids) : 0; };

// ---------- Flooring (per project, toggled by features.flooring) ----------
// Two HQ-owned lists. (1) FLOORING_ZONES — per unit type: which zones exist (fixed Revnu vocabulary), the area
// in m² and the STANDARD finish delivered at no cost. (2) FLOORING_FINISHES — the project's catalogue: material
// family, sizes each with an UPLIFT per m² (supply & lay, ex-VAT) and the zones a finish may go in.
// Upgrade price = Σ over upgraded zones (zone m² × uplift of the chosen size). Untouched zones stay standard at 0.
// HQ always enters SAR/m²; whether the CUSTOMER sees the rate on screen is project.flooringShowRate
// (the agreement's Appendix F-5 always prints zone · m² · rate · amount).
const FLOORING_ZONE_TYPES = [
  { id: "majlis",    en: "Majlis",                    ar: "المجلس",                  tags: ["reception", "ground"] },
  { id: "living",    en: "Living & dining",           ar: "المعيشة والطعام",         tags: ["reception", "ground"] },
  { id: "kitchen",   en: "Kitchen",                   ar: "المطبخ",                  tags: ["ground"] },
  { id: "corridors", en: "Corridors & stairs",        ar: "الممرات والدرج",          tags: ["ground"] },
  { id: "master",    en: "Master bedroom",            ar: "غرفة النوم الرئيسية",      tags: ["bedrooms"] },
  { id: "bedrooms",  en: "Other bedrooms",            ar: "غرف النوم الأخرى",         tags: ["bedrooms"] },
  { id: "bathrooms", en: "Bathrooms · floor & walls", ar: "الحمامات · أرضية وجدران", tags: [], walls: true },
];
const FLOORING_FAMILIES = [
  { id: "tile",    en: "Porcelain tile", ar: "بورسلين" },
  { id: "marble",  en: "Marble",         ar: "رخام" },
  { id: "parquet", en: "Parquet",        ar: "باركيه" },
];
// One-tap shortcuts in the sales step — they only pre-tick zones. "Ground floor" is offered for multi-level types only.
const FLOORING_PRESETS = [
  { id: "reception", en: "Reception",    ar: "الاستقبال",    hint: "Majlis + living & dining",           hintAr: "المجلس والمعيشة والطعام",        tag: "reception" },
  { id: "ground",    en: "Ground floor", ar: "الدور الأرضي", hint: "Majlis, living, kitchen, corridors", hintAr: "المجلس والمعيشة والمطبخ والممرات", tag: "ground", multiLevelOnly: true },
  { id: "bedrooms",  en: "Bedrooms",     ar: "غرف النوم",    hint: "Master + other bedrooms",           hintAr: "الرئيسية وبقية الغرف",           tag: "bedrooms" },
  { id: "whole",     en: "Whole home",   ar: "كامل المنزل",  hint: "Every zone",                        hintAr: "كل المناطق",                     tag: "*" },
];
const flooringZoneMeta = (id) => FLOORING_ZONE_TYPES.find((z) => z.id === id) || { id, en: id, ar: id, tags: [] };
const flooringFamilyById = (id) => FLOORING_FAMILIES.find((f) => f.id === id) || FLOORING_FAMILIES[0];
const flooringZonesFor = (projectId, typeId) => { const e = FLOORING_ZONES.find((z) => z.projectId === projectId && z.typeId === typeId); return e ? (e.zones || []) : []; };
const flooringById = (id) => FLOORING_FINISHES.find((f) => f.id === id);
const flooringFits = (f, zoneId) => !!f && (!f.zones || !f.zones.length || f.zones.includes(zoneId));
const flooringSizeOf = (f, sizeId) => { const l = (f && f.sizes) || []; return l.find((x) => x.id === sizeId) || l[0] || null; };
const flooringRate = (f, sizeId) => { const x = flooringSizeOf(f, sizeId); return x ? (Number(x.uplift) || 0) : 0; };
// Zones a preset pre-ticks for a unit type ("*" = every zone). Presets never pick finishes — only zones.
const flooringPresetZones = (preset, projectId, typeId) => flooringZonesFor(projectId, typeId).map((z) => z.zone).filter((id) => preset.tag === "*" || (flooringZoneMeta(id).tags || []).includes(preset.tag));
// Resolve a selection map { zoneId: { finishId, sizeId } } against the unit type's zones → one priced line per zone.
function flooringLines(projectId, typeId, sel) {
  sel = sel || {};
  return flooringZonesFor(projectId, typeId).map((z) => {
    const meta = flooringZoneMeta(z.zone); const std = flooringById(z.standardId) || null;
    const pick = sel[z.zone]; const f = pick && pick.finishId ? flooringById(pick.finishId) : null;
    const up = !!(f && !f.standard && flooringFits(f, z.zone));
    const size = up ? flooringSizeOf(f, pick.sizeId) : null; const rate = up ? flooringRate(f, pick.sizeId) : 0; const area = Number(z.area) || 0;
    return { zone: z.zone, meta, area, standard: std, finish: up ? f : null, size, rate, amount: up ? Math.round(area * rate) : 0 };
  });
}
const flooringPrice = (projectId, typeId, sel) => flooringLines(projectId, typeId, sel).reduce((s, l) => s + l.amount, 0);
const flooringUpgraded = (projectId, typeId, sel) => flooringLines(projectId, typeId, sel).filter((l) => l.finish);
// "Majlis, Living & dining: Carrara White marble 120 × 60 cm · Master bedroom: Engineered oak Plank" — for lists and {{flooring_summary}}.
function flooringSummary(projectId, typeId, sel, ar) {
  const up = flooringUpgraded(projectId, typeId, sel); if (!up.length) return "";
  const groups = []; const gi = {};
  up.forEach((l) => { const k = l.finish.id + "|" + (l.size ? l.size.id : ""); if (gi[k] == null) { gi[k] = groups.length; groups.push({ f: l.finish, size: l.size, zones: [] }); } groups[gi[k]].zones.push(ar ? l.meta.ar : l.meta.en); });
  return groups.map((g) => g.zones.join(ar ? "، " : ", ") + ": " + (ar ? (g.f.nameAr || g.f.name) : g.f.name) + (g.size ? " " + (ar ? (g.size.labelAr || g.size.label) : g.size.label) : "")).join(" · ");
}

// ---------- Layout changes (per project, toggled by features.layout) ----------
// Pre-approved, curated per UNIT TYPE: each option switches one AREA of the plan between "as designed" and an
// alternative (close the kitchen, separate the majlis, merge a bedroom into a family living…). Options sharing an
// `area` are mutually exclusive; "as designed" is always the free default. Price = flat override when set, else
// wallM × project.layoutRates.wallPerM + doors × project.layoutRates.doorPrice (ex-VAT, never below 0).
// Changes close on project.layoutDeadline (flooring on project.flooringDeadline) — the step locks after that date.
const LAYOUT_DEFAULT_RATES = { wallPerM: 950, doorPrice: 1800 };
const layoutRatesFor = (project) => Object.assign({}, LAYOUT_DEFAULT_RATES, (project && project.layoutRates) || {});
const layoutOptionsFor = (projectId, typeId) => LAYOUT_OPTIONS.filter((o) => o.projectId === projectId && o.typeId === typeId);
const layoutById = (id) => LAYOUT_OPTIONS.find((o) => o.id === id);
// Auto price unless HQ set a flat override. Never negative (no credits).
const layoutPrice = (o, project) => { if (!o) return 0; if (o.flatPrice != null && o.flatPrice !== "") return Math.max(0, Number(o.flatPrice) || 0); const r = layoutRatesFor(project); return Math.max(0, Math.round((Number(o.wallM) || 0) * r.wallPerM + (Number(o.doors) || 0) * r.doorPrice)); };
// Areas of a unit type, each with its options — the sales step renders one radio group per area ("as designed" + alternatives).
function layoutAreas(projectId, typeId) {
  const areas = []; const idx = {};
  layoutOptionsFor(projectId, typeId).forEach((o) => { const k = o.area || o.id; if (idx[k] == null) { idx[k] = areas.length; areas.push({ key: k, name: o.areaName || o.name, nameAr: o.areaNameAr || o.nameAr || o.areaName || o.name, asDesigned: o.asDesigned || "As designed", asDesignedAr: o.asDesignedAr || "كما في التصميم", options: [] }); } areas[idx[k]].options.push(o); });
  return areas;
}
// Normalise a selection: at most one option per area, only options that belong to this unit type.
const layoutChosen = (projectId, typeId, ids) => { const seen = {}; return layoutOptionsFor(projectId, typeId).filter((o) => (ids || []).includes(o.id)).filter((o) => { const k = o.area || o.id; if (seen[k]) return false; seen[k] = true; return true; }); };
const layoutTotal = (project, typeId, ids) => layoutChosen(project ? project.id : null, typeId, ids).reduce((s, o) => s + layoutPrice(o, project), 0);
const layoutSummary = (projectId, typeId, ids, ar) => layoutChosen(projectId, typeId, ids).map((o) => (ar ? (o.areaNameAr || o.areaName || "") : (o.areaName || "")) + (o.areaName ? ": " : "") + (ar ? (o.nameAr || o.name) : o.name)).join(" · ");
const layoutRoomsAfter = (projectId, typeId, ids, ar) => layoutChosen(projectId, typeId, ids).map((o) => ar ? (o.roomsAfterAr || o.roomsAfter) : o.roomsAfter).filter(Boolean).join(" · ");
// ---------- Customisation deadlines (layout / flooring) ----------
const CUSTOM_DEADLINE_KEYS = { layout: "layoutDeadline", flooring: "flooringDeadline" };
const deadlineFor = (project, key) => { const v = project && project[CUSTOM_DEADLINE_KEYS[key] || key]; if (!v) return null; const d = new Date(v + (String(v).length <= 10 ? "T23:59:59" : "")); return isNaN(d.getTime()) ? null : d; };
// null = no deadline set (always open); otherwise ms remaining (negative = closed)
const deadlineLeftMs = (project, key, now) => { const d = deadlineFor(project, key); return d ? d.getTime() - (now || Date.now()) : null; };
const deadlineOpen = (project, key, now) => { const ms = deadlineLeftMs(project, key, now); return ms == null || ms > 0; };


// ---- v2 catalogue writes (server-backed) ----
async function createKitchen(payload) {
  return createContent("kitchen", Object.assign({ id: "kit-" + Date.now().toString(36), palettes: [], images: [], addons: [], scopes: { cabinets: { includes: [], includesAr: [], pricing: {} }, full: { includes: [], includesAr: [], pricing: {} } } }, payload));
}
async function createAC(payload) {
  return createContent("ac", Object.assign({ id: "ac-" + Date.now().toString(36), tiers: {}, fits: [], addons: [], images: [], logo: "", install: 0 }, payload));
}
async function createFlooring(payload) {
  return createContent("flooring", Object.assign({ id: "fl-" + Date.now().toString(36), family: "tile", standard: false, swatch: "#DDD8CC", image: "", sizes: [], zones: [] }, payload));
}
async function createLayoutOption(payload) {
  return createContent("layout", Object.assign({ id: "lay-" + Date.now().toString(36), kind: "add", wallM: 0, doors: 0, flatPrice: null, works: [], worksAr: [], before: "", after: "", roomsAfter: "", roomsAfterAr: "" }, payload));
}
// Per-unit-type rows are replaced wholesale; an existing row keeps its id.
async function _setForType(coll, kind, prefix, projectId, typeId, field, value) {
  const e = coll.find((x) => x.projectId === projectId && x.typeId === typeId);
  const row = await api.content.upsertForType(kind, { id: e ? e.id : prefix + projectId + "-" + typeId, projectId, typeId, [field]: value });
  if (e) Object.assign(e, row); else coll.push(row);
  bump(); return row;
}
const setCoolingPoints = (projectId, typeId, points) => _setForType(COOLING_POINTS, "coolingPoints", "cp-", projectId, typeId, "points", points);
const setFlooringZones = (projectId, typeId, zones) => _setForType(FLOORING_ZONES, "flooringZones", "fz-", projectId, typeId, "zones", zones);

// Every dial code for the buyer's mobile. The first 22 entries are the Gulf & Arab neighbours (shown first, Saudi default);
// the rest follow A–Z. Parsed from a compact "ISO|English|Arabic|+code" string so the list stays one line per region.
const MOBILE_CODES = (function () {
  const rows = "SA|Saudi Arabia|السعودية|+966,AE|United Arab Emirates|الإمارات|+971,KW|Kuwait|الكويت|+965,QA|Qatar|قطر|+974,BH|Bahrain|البحرين|+973,OM|Oman|عمان|+968,JO|Jordan|الأردن|+962,EG|Egypt|مصر|+20,IQ|Iraq|العراق|+964,LB|Lebanon|لبنان|+961,SY|Syria|سوريا|+963,PS|Palestine|فلسطين|+970,YE|Yemen|اليمن|+967,SD|Sudan|السودان|+249,LY|Libya|ليبيا|+218,TN|Tunisia|تونس|+216,DZ|Algeria|الجزائر|+213,MA|Morocco|المغرب|+212,MR|Mauritania|موريتانيا|+222,SO|Somalia|الصومال|+252,DJ|Djibouti|جيبوتي|+253,KM|Comoros|جزر القمر|+269,AF|Afghanistan|أفغانستان|+93,AL|Albania|ألبانيا|+355,AD|Andorra|أندورا|+376,AO|Angola|أنغولا|+244,AG|Antigua and Barbuda|أنتيغوا وباربودا|+1268,AR|Argentina|الأرجنتين|+54,AM|Armenia|أرمينيا|+374,AU|Australia|أستراليا|+61,AT|Austria|النمسا|+43,AZ|Azerbaijan|أذربيجان|+994,BS|Bahamas|الباهاما|+1242,BD|Bangladesh|بنغلاديش|+880,BB|Barbados|باربادوس|+1246,BY|Belarus|بيلاروسيا|+375,BE|Belgium|بلجيكا|+32,BZ|Belize|بليز|+501,BJ|Benin|بنين|+229,BT|Bhutan|بوتان|+975,BO|Bolivia|بوليفيا|+591,BA|Bosnia and Herzegovina|البوسنة والهرسك|+387,BW|Botswana|بوتسوانا|+267,BR|Brazil|البرازيل|+55,BN|Brunei|بروناي|+673,BG|Bulgaria|بلغاريا|+359,BF|Burkina Faso|بوركينا فاسو|+226,BI|Burundi|بوروندي|+257,KH|Cambodia|كمبوديا|+855,CM|Cameroon|الكاميرون|+237,CA|Canada|كندا|+1,CV|Cape Verde|الرأس الأخضر|+238,CF|Central African Republic|جمهورية أفريقيا الوسطى|+236,TD|Chad|تشاد|+235,CL|Chile|تشيلي|+56,CN|China|الصين|+86,CO|Colombia|كولومبيا|+57,CG|Congo|الكونغو|+242,CD|Congo (DRC)|الكونغو الديمقراطية|+243,CR|Costa Rica|كوستاريكا|+506,CI|Côte d'Ivoire|ساحل العاج|+225,HR|Croatia|كرواتيا|+385,CU|Cuba|كوبا|+53,CY|Cyprus|قبرص|+357,CZ|Czechia|التشيك|+420,DK|Denmark|الدنمارك|+45,DM|Dominica|دومينيكا|+1767,DO|Dominican Republic|جمهورية الدومينيكان|+1809,EC|Ecuador|الإكوادور|+593,SV|El Salvador|السلفادور|+503,GQ|Equatorial Guinea|غينيا الاستوائية|+240,ER|Eritrea|إريتريا|+291,EE|Estonia|إستونيا|+372,SZ|Eswatini|إسواتيني|+268,ET|Ethiopia|إثيوبيا|+251,FJ|Fiji|فيجي|+679,FI|Finland|فنلندا|+358,FR|France|فرنسا|+33,GA|Gabon|الغابون|+241,GM|Gambia|غامبيا|+220,GE|Georgia|جورجيا|+995,DE|Germany|ألمانيا|+49,GH|Ghana|غانا|+233,GR|Greece|اليونان|+30,GD|Grenada|غرينادا|+1473,GT|Guatemala|غواتيمالا|+502,GN|Guinea|غينيا|+224,GW|Guinea-Bissau|غينيا بيساو|+245,GY|Guyana|غيانا|+592,HT|Haiti|هايتي|+509,HN|Honduras|هندوراس|+504,HK|Hong Kong|هونغ كونغ|+852,HU|Hungary|المجر|+36,IS|Iceland|آيسلندا|+354,IN|India|الهند|+91,ID|Indonesia|إندونيسيا|+62,IR|Iran|إيران|+98,IE|Ireland|أيرلندا|+353,IT|Italy|إيطاليا|+39,JM|Jamaica|جامايكا|+1876,JP|Japan|اليابان|+81,KZ|Kazakhstan|كازاخستان|+7,KE|Kenya|كينيا|+254,KI|Kiribati|كيريباتي|+686,KR|South Korea|كوريا الجنوبية|+82,XK|Kosovo|كوسوفو|+383,KG|Kyrgyzstan|قيرغيزستان|+996,LA|Laos|لاوس|+856,LV|Latvia|لاتفيا|+371,LS|Lesotho|ليسوتو|+266,LR|Liberia|ليبيريا|+231,LI|Liechtenstein|ليختنشتاين|+423,LT|Lithuania|ليتوانيا|+370,LU|Luxembourg|لوكسمبورغ|+352,MO|Macau|ماكاو|+853,MG|Madagascar|مدغشقر|+261,MW|Malawi|مالاوي|+265,MY|Malaysia|ماليزيا|+60,MV|Maldives|المالديف|+960,ML|Mali|مالي|+223,MT|Malta|مالطا|+356,MH|Marshall Islands|جزر مارشال|+692,MX|Mexico|المكسيك|+52,FM|Micronesia|ميكرونيزيا|+691,MD|Moldova|مولدوفا|+373,MC|Monaco|موناكو|+377,MN|Mongolia|منغوليا|+976,ME|Montenegro|الجبل الأسود|+382,MZ|Mozambique|موزمبيق|+258,MM|Myanmar|ميانمار|+95,NA|Namibia|ناميبيا|+264,NR|Nauru|ناورو|+674,NP|Nepal|نيبال|+977,NL|Netherlands|هولندا|+31,NZ|New Zealand|نيوزيلندا|+64,NI|Nicaragua|نيكاراغوا|+505,NE|Niger|النيجر|+227,NG|Nigeria|نيجيريا|+234,MK|North Macedonia|مقدونيا الشمالية|+389,NO|Norway|النرويج|+47,PK|Pakistan|باكستان|+92,PW|Palau|بالاو|+680,PA|Panama|بنما|+507,PG|Papua New Guinea|بابوا غينيا الجديدة|+675,PY|Paraguay|باراغواي|+595,PE|Peru|بيرو|+51,PH|Philippines|الفلبين|+63,PL|Poland|بولندا|+48,PT|Portugal|البرتغال|+351,PR|Puerto Rico|بورتوريكو|+1787,RO|Romania|رومانيا|+40,RU|Russia|روسيا|+7,RW|Rwanda|رواندا|+250,KN|Saint Kitts and Nevis|سانت كيتس ونيفيس|+1869,LC|Saint Lucia|سانت لوسيا|+1758,VC|Saint Vincent and the Grenadines|سانت فينسنت والغرينادين|+1784,WS|Samoa|ساموا|+685,SM|San Marino|سان مارينو|+378,ST|São Tomé and Príncipe|ساو تومي وبرينسيب|+239,SN|Senegal|السنغال|+221,RS|Serbia|صربيا|+381,SC|Seychelles|سيشل|+248,SL|Sierra Leone|سيراليون|+232,SG|Singapore|سنغافورة|+65,SK|Slovakia|سلوفاكيا|+421,SI|Slovenia|سلوفينيا|+386,SB|Solomon Islands|جزر سليمان|+677,ZA|South Africa|جنوب أفريقيا|+27,SS|South Sudan|جنوب السودان|+211,ES|Spain|إسبانيا|+34,LK|Sri Lanka|سريلانكا|+94,SR|Suriname|سورينام|+597,SE|Sweden|السويد|+46,CH|Switzerland|سويسرا|+41,TW|Taiwan|تايوان|+886,TJ|Tajikistan|طاجيكستان|+992,TZ|Tanzania|تنزانيا|+255,TH|Thailand|تايلاند|+66,TL|Timor-Leste|تيمور الشرقية|+670,TG|Togo|توغو|+228,TO|Tonga|تونغا|+676,TT|Trinidad and Tobago|ترينيداد وتوباغو|+1868,TR|Türkiye|تركيا|+90,TM|Turkmenistan|تركمانستان|+993,TV|Tuvalu|توفالو|+688,UG|Uganda|أوغندا|+256,UA|Ukraine|أوكرانيا|+380,GB|United Kingdom|المملكة المتحدة|+44,US|United States|الولايات المتحدة|+1,UY|Uruguay|الأوروغواي|+598,UZ|Uzbekistan|أوزبكستان|+998,VU|Vanuatu|فانواتو|+678,VA|Vatican City|الفاتيكان|+379,VE|Venezuela|فنزويلا|+58,VN|Vietnam|فيتنام|+84,ZM|Zambia|زامبيا|+260,ZW|Zimbabwe|زيمبابوي|+263".split(",").map((r) => { const [iso, en, ar, code] = r.split("|"); return { iso, en, ar, code }; });
  const near = ["SA","AE","KW","QA","BH","OM","JO","EG","IQ","LB","SY","PS","YE","SD","LY","TN","DZ","MA","MR","SO","DJ","KM"];
  const first = near.map((iso) => rows.find((r) => r.iso === iso)).filter(Boolean).map((r) => Object.assign({}, r, { near: true }));
  const rest = rows.filter((r) => !near.includes(r.iso)).sort((a, b) => a.en.localeCompare(b.en));
  return first.concat(rest);
})();
const mobileCodeByValue = (code) => MOBILE_CODES.find((c) => c.code === code) || MOBILE_CODES[0];
// Popular mailbox domains offered as one-tap completions on the buyer's e-mail.
const EMAIL_DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "icloud.com", "yahoo.com"];
// Display form: "+966 5xxxxxxxx" — strips a Saudi leading 0 and never doubles the code.
const fmtMobile = (c) => { if (!c) return ""; let n = String(c.mobile || "").replace(/[\s-]/g, ""); if (!n) return ""; if (n.startsWith("+")) return n; if (n.startsWith("00")) return "+" + n.slice(2); const code = c.mobileCode || "+966"; if (code === "+966") { if (n.startsWith("966")) n = n.slice(3); if (n.startsWith("0")) n = n.slice(1); } return code + " " + n; };

// =====================================================================
//  AGREEMENT COMPOSER — one layout per developer, built from blocks.
//  · "data" blocks are system-rendered (cover, parties, unit pages, investment, schedules, execution)
//    and always read the live deal; they can be reordered / toggled, never edited.
//  · "clause" blocks are the legal wording (EN + AR) HQ edits; they support {{variables}} and
//    {{#has_x}}…{{/has_x}} conditionals. Each block has a "showWhen" rule tied to the feature toggles.
//  Developers without a custom layout use the Revnu master. Orders pin a snapshot at issue time.
//  Layouts + version history live in agreement_layouts / agreement_versions (save = new version).
// =====================================================================
const AGREEMENT_DATA_BLOCKS = [
  { id: "cover",      en: "Cover page",                               ar: "صفحة الغلاف" },
  { id: "parties",    en: "Parties & Property",                       ar: "الأطراف والعقار" },
  { id: "unit_pages", en: "Unit pages — plan · 3D · specification",   ar: "صفحات الوحدات — المخطط · 3D · المواصفات" },
  { id: "investment", en: "Investment summary & Payment",             ar: "ملخص الاستثمار والدفعات" },
  { id: "schedule_a", en: "Schedule A — Furnishing, kitchen, cooling, flooring, layout & fit-out (F-1 … F-6)", ar: "الملحق أ — التأثيث والمطبخ والتكييف والأرضيات والمخطط والتجهيز", showWhen: "furnishing" },
  { id: "schedule_b", en: "Schedule B — Operations & rental management", ar: "الملحق ب — التشغيل وإدارة الإيجار", showWhen: "ops" },
  { id: "execution",  en: "Execution & signatures",                   ar: "التوقيع والإبرام" },
];
const AGREEMENT_SHOW_WHEN = [
  { id: "always",     en: "Always",                        ar: "دائما" },
  { id: "furnishing", en: "Only if furnishing / kitchen / fit-out chosen", ar: "فقط مع التأثيث أو المطبخ أو التجهيز" },
  { id: "smart",      en: "Only if smart home chosen",     ar: "فقط مع المنزل الذكي" },
  { id: "kitchen",    en: "Only if kitchen chosen",        ar: "فقط مع المطبخ" },
  { id: "cooling",    en: "Only if cooling / AC chosen",   ar: "فقط مع التكييف" },
  { id: "flooring",   en: "Only if flooring upgrade chosen", ar: "فقط مع ترقية الأرضيات" },
  { id: "layout",     en: "Only if layout changes chosen",  ar: "فقط مع تعديلات المخطط" },
  { id: "fitout",     en: "Only if fit-out chosen",        ar: "فقط مع التجهيز" },
  { id: "ops",        en: "Only if operations chosen",     ar: "فقط مع التشغيل" },
  { id: "multi",      en: "Only for multi-unit deals",     ar: "فقط للصفقات متعددة الوحدات" },
];
const _agrKey = (devId) => devId || "master";
const _agrClone = (x) => JSON.parse(JSON.stringify(x));
const _agrRow = (key) => AGREEMENT_LAYOUTS.find((l) => l.key === key) || null;
function agreementMaster() { return _agrRow("master") || AGREEMENT_MASTER; }
function agreementHasCustom(devId) { return !!(devId && _agrRow(devId)); }
function agreementLayoutFor(devId) { return (devId && _agrRow(devId)) || agreementMaster(); }
function agreementHistory(devId) {
  const key = _agrKey(devId);
  return AGREEMENT_VERSIONS.filter((v) => v.key === key).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
    .map((v) => ({ version: v.version, updated: v.updated, blocks: v.blocks, savedAt: v.savedAt }));
}
async function saveAgreementLayout(layout) {
  const row = await api.agreements.save({ developerId: layout.developerId || null, name: layout.name || null, nameAr: layout.nameAr || null, basedOn: layout.basedOn != null ? layout.basedOn : null, blocks: layout.blocks || [] });
  await refresh(["agreementLayouts", "agreementVersions"]);
  return _agrRow(row.key) || row;
}
async function cloneAgreementForDeveloper(devId) {
  const dev = devById(devId); const m = agreementMaster();
  const l = _agrClone(m); l.developerId = devId; l.name = (dev ? dev.name : devId) + " agreement"; l.nameAr = "اتفاقية " + (dev ? (dev.nameAr || dev.name) : devId); l.basedOn = m.version;
  return saveAgreementLayout(l);
}
async function resetAgreementForDeveloper(devId) { if (devId && _agrRow(devId)) { await api.agreements.reset(devId); await refresh(["agreementLayouts", "agreementVersions"]); } }
async function restoreAgreementVersion(devId, idx) {
  const h = agreementHistory(devId)[idx]; if (!h) return null;
  const cur = agreementLayoutFor(devId);
  return saveAgreementLayout(Object.assign(_agrClone(cur), { developerId: devId || null, blocks: _agrClone(h.blocks) }));
}
// Snapshot pinned on an order when it is issued — signed agreements never change under later edits.
function agreementSnapshot(devId) { const l = agreementLayoutFor(devId); return { layoutId: l.id, version: l.version, developerId: l.developerId || null, name: l.name, blocks: _agrClone(l.blocks) }; }
// Split pasted contract text into clauses: numbered / ALL-CAPS / "المادة" / short colon lines start a clause.
function splitClausesFromText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const numRe = /^(\d{1,2}|[٠-٩]{1,2}|[A-Z]|[IVX]{1,4})[\.\)\-–:]\s*\S/;
  const isHead = (t) => {
    if (!t || t.length > 90) return false;
    if (numRe.test(t)) return true;
    if (/^(المادة|البند|الفصل|القسم)\s/.test(t)) return true;
    if (/[A-Za-z]/.test(t) && t === t.toUpperCase() && t.replace(/[^A-Za-z]/g, "").length >= 4) return true;
    if (/[:：]$/.test(t) && t.split(/\s+/).length <= 8) return true;
    return false;
  };
  const out = []; let cur = null;
  lines.forEach((ln) => {
    const t = ln.trim();
    if (isHead(t)) { if (cur) out.push(cur); cur = { title: t.replace(/^(\d{1,2}|[٠-٩]{1,2}|[A-Z]|[IVX]{1,4})[\.\)\-–:]\s*/, "").replace(/^(المادة|البند|الفصل|القسم)\s+\S+\s*[:\-–]?\s*/, "").replace(/[:：]$/, "").trim(), body: "" }; }
    else if (cur) cur.body += (cur.body ? "\n" : "") + ln;
    else if (t) cur = { title: "", body: ln };
  });
  if (cur) out.push(cur);
  return out.map((c) => ({ title: c.title, body: c.body.replace(/\n{3,}/g, "\n\n").trim() })).filter((c) => c.title || c.body);
}
// Pre-flight checks shown in the composer.
function lintAgreementLayout(layout, dev) {
  const issues = [];
  const known = new Set(CONTRACT_VARS.map((v) => v.code));
  ((dev && dev.customFields) || []).forEach((f) => { if (f && f.key) known.add("dev." + f.key); });
  const blocks = (layout && layout.blocks) || [];
  if (!blocks.some((b) => b.kind === "data" && b.ref === "execution" && b.enabled !== false)) issues.push({ level: "error", en: "No signature block — add or enable “Execution & signatures”.", ar: "لا يوجد بند توقيع — أضف أو فعل «التوقيع والإبرام»." });
  if (!blocks.some((b) => b.kind === "data" && b.ref === "parties" && b.enabled !== false)) issues.push({ level: "warn", en: "“Parties & Property” is off — the buyer and unit will not be identified.", ar: "بند «الأطراف والعقار» غير مفعل — لن يعرف المشتري والوحدة." });
  blocks.filter((b) => b.kind === "clause" && b.enabled !== false).forEach((b) => {
    const t = b.title || b.titleAr || "(untitled)";
    if (!(b.body || "").trim() && !(b.bodyAr || "").trim()) issues.push({ level: "error", en: "Clause “" + t + "” is empty.", ar: "البند «" + t + "» فارغ." });
    else if (!(b.bodyAr || "").trim()) issues.push({ level: "warn", en: "Clause “" + t + "” has no Arabic text — the English will print in Arabic agreements.", ar: "البند «" + t + "» بلا نص عربي — سيطبع الإنجليزي في النسخة العربية." });
    else if (!(b.body || "").trim()) issues.push({ level: "warn", en: "Clause “" + t + "” has no English text.", ar: "البند «" + t + "» بلا نص إنجليزي." });
    const re = /\{\{\s*[#\/]?([\w.]+)\s*\}\}/g; let m; const bad = new Set(); const src = (b.body || "") + " " + (b.bodyAr || "");
    while ((m = re.exec(src))) { if (!known.has(m[1])) bad.add(m[1]); }
    bad.forEach((v) => issues.push({ level: "error", en: "Clause “" + t + "” uses an unknown variable {{" + v + "}}.", ar: "البند «" + t + "» يستخدم متغيرا غير معروف {{" + v + "}}." }));
  });
  return issues;
}
// Synthetic order for previewing a layout when the project has no real orders yet.
function sampleOrderFor(projectId) {
  const proj = projById(projectId); if (!proj) return null;
  const f = proj.features || {};
  const units = UNITS.filter((u) => u.projectId === projectId);
  const u = units.find((x) => x.status === "available") || units[0]; if (!u) return null;
  const pkgs = PACKAGES.filter((p) => p.projectId === projectId || p.developerId === proj.developerId);
  const pkg = f.furnishing !== false ? (pkgs.find((p) => ((p.pricing || {})[u.typeId] || 0) > 0) || pkgs[0] || null) : null;
  const designs = DESIGN_STYLES.filter((x) => x.projectId === projectId);
  const design = pkg ? (designs.find((x) => x.id === pkg.designId) || designs[0] || null) : null;
  const smart = f.smartHome ? (SMART_HOME.find((s) => s.projectId === projectId) || null) : null;
  const kitchen = f.kitchens ? (KITCHENS.find((k) => k.projectId === projectId && kitchenPrice(k, "full", u.typeId) > 0) || null) : null;
  const ac = f.cooling ? (AC_SYSTEMS.find((a) => a.projectId === projectId && acPrice(a, projectId, u.typeId) > 0) || null) : null;
  const ops = f.operations ? (OPS_MODELS.find((o) => o.projectId === projectId) || null) : null;
  const unitPrice = unitPriceFor(u, false);
  // Flooring sample: the first upgrade finish that fits, applied to the reception zones.
  const flZones = f.flooring ? flooringZonesFor(projectId, u.typeId) : [];
  const flFinish = f.flooring ? (FLOORING_FINISHES.find((x) => x.projectId === projectId && !x.standard && flZones.some((z) => (flooringZoneMeta(z.zone).tags || []).includes("reception") && flooringFits(x, z.zone))) || null) : null;
  const flSel = {}; if (flFinish) flZones.filter((z) => (flooringZoneMeta(z.zone).tags || []).includes("reception") && flooringFits(flFinish, z.zone)).forEach((z) => { flSel[z.zone] = { finishId: flFinish.id, sizeId: (flFinish.sizes[0] || {}).id }; });
  const flCost = flooringPrice(projectId, u.typeId, flSel);
  const layFirst = f.layout ? (layoutOptionsFor(projectId, u.typeId)[0] || null) : null; const layIds = layFirst ? [layFirst.id] : []; const layCost = layoutTotal(proj, u.typeId, layIds);
  const pre = (pkg ? ((pkg.pricing || {})[u.typeId] || 0) : 0) + (smart ? (smart.price || 0) : 0) + (kitchen ? kitchenTotalPrice(kitchen, "full", u.typeId, []) : 0) + (ac ? acTotalPrice(ac, projectId, u.typeId, []) : 0) + flCost + layCost;
  return {
    id: "REV-SAMPLE", _sample: true, developerId: proj.developerId, projectId, unitNumber: u.number, unitNumbers: [u.number], status: "issued", createdAt: new Date().toISOString().slice(0, 10),
    customerName: "Abdullah Al-Sample", customerId: "1000000000", customerEmail: "buyer@example.com",
    customer: { fullName: "Abdullah Al-Sample", fullNameAr: "عبدالله النموذجي", nationalId: "1000000000", mobile: "0500000000", email: "buyer@example.com", city: proj.city, beneficiary: false },
    packageId: pkg ? pkg.id : null, designId: design ? design.id : null, paletteId: design && design.palettes && design.palettes[0] ? design.palettes[0].id : null,
    smartId: smart ? smart.id : null, kitchenId: kitchen ? kitchen.id : null, kitchenPaletteId: kitchen && kitchen.palettes[0] ? kitchen.palettes[0].id : null, kitchenScope: "full", kitchenAddons: [], kitchenCost: kitchen ? withVat(kitchenTotalPrice(kitchen, "full", u.typeId, [])) : 0,
    acId: ac ? ac.id : null, acAddons: [], acCost: ac ? withVat(acTotalPrice(ac, projectId, u.typeId, [])) : 0,
    flooring: flSel, flooringCost: withVat(flCost), layoutIds: layIds, layoutCost: withVat(layCost),
    opsId: ops ? ops.id : null, fitout: false, fitoutCost: 0, unitPrice, furnishCost: withVatSum((pkg ? ((pkg.pricing || {})[u.typeId] || 0) : 0) + (smart ? (smart.price || 0) : 0), kitchen ? kitchenTotalPrice(kitchen, "full", u.typeId, []) : 0, ac ? acTotalPrice(ac, projectId, u.typeId, []) : 0, flCost, layCost), operatorFee: ops ? ops.mgmtFee : 0,
  };
}

// =====================================================================
//  PLATFORM BILLING — what developers pay Revnu for the SYSTEM (separate from order receivables).
//  · Price book (global, HQ): onboarding fee · project setup fee · annual platform fee by total-unit band.
//  · Plan (per developer): each fee line is list / custom / waived, optional % discount, reason.
//  · Invoices are DERIVED from events (developer onboarded, project created, subscription anniversary);
//    only their status (paid / note) is stored. Band is recalculated at each renewal from live units.
// =====================================================================
const BILLING_DEFAULTS = {
  onboardingFee: 65000, projectSetupFee: 35000, vatPct: 15, dueDays: 30,
  bands: [
    { upTo: 100,  fee: 15000 },
    { upTo: 300,  fee: 36000 },
    { upTo: 750,  fee: 72000 },
    { upTo: 1500, fee: 120000 },
    { upTo: null, fee: 180000 },
  ],
};
function billingPriceBook() { return Object.assign({}, BILLING_DEFAULTS, PRICE_BOOK || {}); }
async function setBillingPriceBook(patch) {
  const row = await api.billing.setPriceBook(patch);
  PRICE_BOOK = row.priceBook; bump();
  return billingPriceBook();
}
function billingUnitsFor(devId) {
  return PROJECTS.filter((p) => p.developerId === devId).reduce((a, p) => a + (Number(p.totalUnits) || UNITS.filter((u) => u.projectId === p.id).length), 0);
}
function billingBandFor(units) {
  const bands = billingPriceBook().bands || []; let lo = 1;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (b.upTo == null || units <= Number(b.upTo)) return Object.assign({ index: i, lo, label: b.upTo == null ? fmtSAR(lo) + "+" : fmtSAR(lo) + "–" + fmtSAR(b.upTo) }, b);
    lo = Number(b.upTo) + 1;
  }
  return Object.assign({ index: bands.length - 1, lo, label: fmtSAR(lo) + "+" }, bands[bands.length - 1] || { fee: 0 });
}
const BILLING_KINDS = [
  { id: "onboarding",   en: "Onboarding & implementation", ar: "رسوم التأسيس والتنفيذ", cadence: "once", cadenceEn: "One-time · when the developer joins · includes the first project", cadenceAr: "مرة واحدة · عند الانضمام · تشمل المشروع الأول" },
  { id: "projectSetup", en: "Project setup",               ar: "تأسيس مشروع",           cadence: "perProject", cadenceEn: "One-time · each additional project (the first is in onboarding)", cadenceAr: "مرة واحدة · لكل مشروع إضافي (الأول ضمن التأسيس)" },
  { id: "annual",       en: "Annual platform fee",         ar: "رسوم المنصة السنوية",  cadence: "yearly", cadenceEn: "Yearly · band by total units, set at renewal", cadenceAr: "سنويا · حسب شريحة الوحدات عند التجديد" },
];
function planFor(dev) {
  const p = (dev && dev.plan) || {}; const out = {};
  BILLING_KINDS.forEach((k) => { out[k.id] = Object.assign({ mode: "list", amount: null, discountPct: 0, reason: "", waiveYears: null }, p[k.id] || {}); });
  out.startDate = p.startDate || (dev && dev.onboarded) || new Date().toISOString().slice(0, 10);
  out.notes = p.notes || "";
  return out;
}
function setDeveloperPlan(devId, plan) { return patchDeveloper(devId, { plan }); }
// Effective amount for one fee line: list → custom → discount → waiver (annual waiver can be limited to the first N years).
function billingLineAmount(dev, kind, listAmount, yearIdx) {
  const line = planFor(dev)[kind];
  let base = (line.mode === "custom" && line.amount != null && line.amount !== "") ? Number(line.amount) : (Number(listAmount) || 0);
  if (line.discountPct) base = base * (1 - (Number(line.discountPct) || 0) / 100);
  let waived = line.mode === "waived";
  if (waived && kind === "annual" && line.waiveYears != null && line.waiveYears !== "" && yearIdx != null) waived = yearIdx < Number(line.waiveYears);
  return { amount: waived ? 0 : Math.round(base), list: Number(listAmount) || 0, waived, mode: line.mode, discountPct: Number(line.discountPct) || 0, reason: line.reason || "" };
}
function _invStates() { const m = {}; PLATFORM_INVOICES.forEach((r) => { m[r.id] = { status: r.status, paidAt: r.paidAt, paidRef: r.paidRef, note: r.note }; }); return m; }
async function setBillingInvoice(id, patch) {
  const dev = DEVELOPERS.find((d) => billingInvoicesFor(d.id).some((i) => i.id === id));
  if (!dev) throw new ApiError("GENERIC", "invoice " + id);
  const body = {};
  if ("status" in patch) { body.status = patch.status || null; body.paidAt = patch.paidAt || null; body.paidRef = patch.paidRef || ""; }
  if ("note" in patch) body.note = patch.note || "";
  const row = await api.billing.setInvoice(id, dev.id, body);
  const i = PLATFORM_INVOICES.findIndex((r) => r.id === id); if (i >= 0) PLATFORM_INVOICES[i] = row; else PLATFORM_INVOICES.push(row);
  bump(); return _invStates()[id];
}
function _addYears(dt, n) { const x = new Date(dt); x.setFullYear(x.getFullYear() + n); return x; }
const _iso = (dt) => { const x = new Date(dt); return isNaN(x) ? "" : x.toISOString().slice(0, 10); };
function billingYearIndex(dev) { const start = new Date(planFor(dev).startDate); const now = new Date(); let k = 0; while (k < 50 && _addYears(start, k + 1) <= now) k++; return k; }
// Every platform-fee invoice for a developer — derived from events, stored status overlaid.
function billingInvoicesFor(devId) {
  const dev = devById(devId); if (!dev) return [];
  const pb = billingPriceBook(); const plan = planFor(dev); const start = new Date(plan.startDate); const now = new Date();
  const tag = String(dev.initials || dev.id.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, "") || "DEV";
  const list = []; const states = _invStates();
  const push = (id, kind, title, titleAr, date, line, extra) => {
    const st = states[id] || {};
    const due = new Date(date); due.setDate(due.getDate() + (Number(pb.dueDays) || 30));
    const issued = new Date(date) <= now;
    const status = line.waived ? "waived" : st.status === "paid" ? "paid" : !issued ? "scheduled" : now > due ? "overdue" : "issued";
    const vat = Math.round(line.amount * (Number(pb.vatPct) || 0) / 100);
    list.push(Object.assign({ id, kind, title, titleAr, date: _iso(date), due: _iso(due), amount: line.amount, list: line.list, vat, total: line.amount + vat,
      waived: line.waived, mode: line.mode, discountPct: line.discountPct, reason: line.reason, status, paidAt: st.paidAt || null, paidRef: st.paidRef || "", note: st.note || "", developerId: devId }, extra || {}));
  };
  // Onboarding covers implementation AND the first project; every project after that carries a setup fee.
  const projs = PROJECTS.filter((p) => p.developerId === devId).map((p) => { const c = p.created || p.createdAt; let dt = c ? new Date(c) : start; if (isNaN(dt) || dt < start) dt = start; return { p, dt }; }).sort((a, b) => a.dt - b.dt);
  const first = projs[0];
  push("PF-" + tag + "-ONB", "onboarding", "Onboarding & implementation" + (first ? " · incl. first project: " + first.p.name : ""), "رسوم التأسيس والتنفيذ" + (first ? " · تشمل المشروع الأول: " + (first.p.nameAr || first.p.name) : ""), start, billingLineAmount(dev, "onboarding", pb.onboardingFee), first ? { projectId: first.p.id } : {});
  projs.slice(1).forEach(({ p, dt }, i) => {
    push("PF-" + tag + "-SET-" + (i + 1), "projectSetup", "Project setup · " + p.name, "تأسيس مشروع · " + (p.nameAr || p.name), dt, billingLineAmount(dev, "projectSetup", pb.projectSetupFee), { projectId: p.id });
  });
  const units = billingUnitsFor(devId); const band = billingBandFor(units); const yi = billingYearIndex(dev);
  for (let k = 0; k <= yi; k++) {
    const dt = _addYears(start, k);
    push("PF-" + tag + "-Y" + (k + 1), "annual", "Annual platform fee · year " + (k + 1), "رسوم المنصة السنوية · السنة " + (k + 1), dt, billingLineAmount(dev, "annual", band.fee, k),
      { period: _iso(dt) + " → " + _iso(_addYears(dt, 1)), units, bandLabel: band.label, yearIdx: k });
  }
  return list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
function billingNextRenewal(devId) {
  const dev = devById(devId); if (!dev) return null;
  const start = new Date(planFor(dev).startDate); const k = billingYearIndex(dev) + 1; const dt = _addYears(start, k);
  const units = billingUnitsFor(devId); const band = billingBandFor(units); const line = billingLineAmount(dev, "annual", band.fee, k);
  return { date: _iso(dt), daysAway: Math.ceil((dt - new Date()) / 864e5), yearIdx: k, units, band, amount: line.amount, waived: line.waived, total: Math.round(line.amount * (1 + (Number(billingPriceBook().vatPct) || 0) / 100)) };
}
function billingSummary(devId) {
  const inv = billingInvoicesFor(devId); const vat = 1 + (Number(billingPriceBook().vatPct) || 0) / 100;
  const sum = (f) => inv.filter(f).reduce((a, i) => a + i.total, 0);
  return { invoiced: sum((i) => i.status !== "scheduled" && i.status !== "waived"), paid: sum((i) => i.status === "paid"), outstanding: sum((i) => i.status === "issued" || i.status === "overdue"),
    overdue: sum((i) => i.status === "overdue"), waived: inv.filter((i) => i.waived).reduce((a, i) => a + Math.round(i.list * vat), 0), count: inv.length, hasOverdue: inv.some((i) => i.status === "overdue") };
}
// Printable invoice (EN or AR) — the portals open it in a new window and print.
function billingInvoiceHTML(inv, ar) {
  const dev = devById(inv.developerId) || {}; const pb = billingPriceBook();
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const L = (en, a) => (ar ? a : en);
  const legal = ar ? (dev.legalNameAr || dev.legalName || dev.nameAr || dev.name) : (dev.legalName || dev.name);
  const statusTxt = { paid: L("PAID", "مدفوعة"), issued: L("DUE", "مستحقة"), overdue: L("OVERDUE", "متأخرة"), scheduled: L("SCHEDULED", "مجدولة"), waived: L("WAIVED", "معفاة") }[inv.status] || inv.status;
  const row = (k, v) => '<tr><td style="padding:6px 0;color:#555F73">' + esc(k) + '</td><td style="padding:6px 0;text-align:' + (ar ? "left" : "right") + '">' + esc(v) + '</td></tr>';
  return '<!DOCTYPE html><html dir="' + (ar ? "rtl" : "ltr") + '"><head><meta charset="utf-8"><title>' + esc(inv.id) + '</title>' +
    '<style>@page{margin:20mm}body{font-family:' + (ar ? "Almarai, sans-serif" : "Outfit, Helvetica, Arial, sans-serif") + ';color:#080B14;font-size:13px;line-height:1.6;max-width:720px;margin:0 auto}' +
    'h1{font-size:26px;margin:0}table{width:100%;border-collapse:collapse}.mono{font-family:"JetBrains Mono",Menlo,monospace}.tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em;background:#F3EFE6}</style></head><body>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #080B14;padding-bottom:16px;margin-bottom:22px">' +
      '<div><div style="font-size:22px;font-weight:600">Revnu</div><div class="mono" style="font-size:11px;color:#555F73">admin.revnu.sa · Riyadh</div></div>' +
      '<div style="text-align:' + (ar ? "left" : "right") + '"><h1>' + L("Invoice", "فاتورة") + '</h1><div class="mono">' + esc(inv.id) + '</div><span class="tag">' + statusTxt + '</span></div></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:22px">' +
      '<div><div class="mono" style="font-size:10px;letter-spacing:.1em;color:#555F73">' + L("BILL TO", "الفاتورة إلى") + '</div><div style="font-weight:600;margin-top:4px">' + esc(legal) + '</div>' + (dev.crNumber ? '<div>' + L("CR ", "س.ت ") + esc(dev.crNumber) + '</div>' : '') + (dev.vat ? '<div>' + L("VAT ", "الرقم الضريبي ") + esc(dev.vat) + '</div>' : '') + '</div>' +
      '<div><table>' + row(L("Issue date", "تاريخ الإصدار"), inv.date) + row(L("Due date", "تاريخ الاستحقاق"), inv.due) + (inv.period ? row(L("Period", "الفترة"), inv.period) : '') + (inv.bandLabel ? row(L("Units under management", "الوحدات تحت الإدارة"), fmtSAR(inv.units) + " · " + L("band ", "شريحة ") + inv.bandLabel) : '') + '</table></div></div>' +
    '<table style="margin-bottom:18px"><thead><tr style="border-bottom:1px solid #080B14;text-align:' + (ar ? "right" : "left") + '"><th style="padding:8px 0">' + L("Description", "الوصف") + '</th><th style="padding:8px 0;text-align:' + (ar ? "left" : "right") + '">' + L("Amount (SAR)", "المبلغ (ريال)") + '</th></tr></thead><tbody>' +
      '<tr><td style="padding:10px 0;border-bottom:1px dotted #ccc">' + esc(ar ? inv.titleAr : inv.title) + (inv.reason ? '<div style="color:#555F73;font-size:12px">' + esc(inv.reason) + '</div>' : '') + '</td><td class="mono" style="padding:10px 0;border-bottom:1px dotted #ccc;text-align:' + (ar ? "left" : "right") + '">' + fmtSAR(inv.list) + '</td></tr>' +
      (inv.list !== inv.amount ? '<tr><td style="padding:6px 0;color:#555F73">' + (inv.waived ? L("Waived", "إعفاء") : inv.discountPct ? L("Discount ", "خصم ") + inv.discountPct + "%" : L("Negotiated price adjustment", "تعديل السعر المتفق عليه")) + '</td><td class="mono" style="padding:6px 0;text-align:' + (ar ? "left" : "right") + '">−' + fmtSAR(inv.list - inv.amount) + '</td></tr>' : '') +
      '</tbody></table>' +
    '<table style="max-width:320px;margin-' + (ar ? "right" : "left") + ':auto">' + row(L("Subtotal", "المجموع الفرعي"), fmtSAR(inv.amount) + " SAR") + row(L("VAT " + (pb.vatPct || 0) + "%", "ضريبة القيمة المضافة " + (pb.vatPct || 0) + "%"), fmtSAR(inv.vat) + " SAR") +
      '<tr style="border-top:2px solid #080B14;font-weight:700"><td style="padding:8px 0">' + L("Total", "الإجمالي") + '</td><td class="mono" style="padding:8px 0;text-align:' + (ar ? "left" : "right") + '">' + fmtSAR(inv.total) + ' SAR</td></tr></table>' +
    '<p style="color:#555F73;font-size:12px;margin-top:28px">' + L("Payable by bank transfer within " + (pb.dueDays || 30) + " days of the issue date. Platform fees are charged under the Revnu partner agreement and are separate from order settlements.", "تدفع بالتحويل البنكي خلال " + (pb.dueDays || 30) + " يوما من تاريخ الإصدار. رسوم المنصة تحصل بموجب اتفاقية الشراكة مع Revnu وهي منفصلة عن تسويات الطلبات.") + '</p>' +
    '</body></html>';
}

// Security: the OTP / demo shortcuts of the prototype are off — real auth comes from Supabase.
const DEMO_MODE = false;

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
  createUnitType, setUnitType, createPaymentPlan, uploadMedia, createDevUser, setDevUser, removeDevUser, resetUserPassword, removeEntity, setDevLogo, patchDeveloper, createDeveloper,
  devRoleById, devPermsFor, devHasPerm,
  contractVarValues, fillContract, createContract, setContract, removeContract,
  setUnitStatus, createOrder, updateOrder, advanceOrderStatus, transitionOrder, takenUnitNumbers, ORDER_STATUS_FLOW, uploadOrderDocument, documentFor, openDocument, deleteOrder,
  setRevnuTerms, setRevnuTermsForProject, revnuTermsForProject, setOrderPaid, addUnit, addUnits, removeUnit, opsRevenueForOrder, opsRevenueRollup, setContentField, createContent,
  isLive, isContractOut, isSigned, isCustomerPaid, isOperating, isSubmitted, isUnitTaken, nextOrderId, reserveOrderId, cancelOrder, reinstateOrder,
  activityFor, logActivity, queueNotification, NOTIFY_TEMPLATES, VALID, toCSV, downloadCSV, parseCSV, invoiceFor, ensureInvoice, dealEconomics, tickets,
  // ---- v2 catalogues: kitchens / cooling / flooring / layout + deadlines ----
  KITCHENS, KITCHEN_SCOPES, kitchenById, kitchenPaletteById, kitchenScopeById, kitchenPrice, kitchenAddonsFor, kitchenAddonsChosen, kitchenAddonsPrice, kitchenTotalPrice, createKitchen,
  AC_TYPES, AC_SYSTEMS, COOLING_POINTS, coolingPointsFor, setCoolingPoints, acById, acTypeById, acFits, acTierPrice, acPrice, acAddonsChosen, acAddonsPrice, acTotalPrice, createAC,
  LAYOUT_OPTIONS, LAYOUT_DEFAULT_RATES, layoutRatesFor, layoutOptionsFor, layoutById, layoutPrice, layoutAreas, layoutChosen, layoutTotal, layoutSummary, layoutRoomsAfter, createLayoutOption, deadlineFor, deadlineLeftMs, deadlineOpen, CUSTOM_DEADLINE_KEYS,
  FLOORING_ZONE_TYPES, FLOORING_FAMILIES, FLOORING_PRESETS, FLOORING_ZONES, FLOORING_FINISHES, flooringZoneMeta, flooringFamilyById, flooringZonesFor, setFlooringZones, flooringById, flooringFits, flooringSizeOf, flooringRate, flooringPresetZones, flooringLines, flooringPrice, flooringUpgraded, flooringSummary, createFlooring,
  // ---- v2 platform billing + agreement composer ----
  BILLING_KINDS, billingPriceBook, setBillingPriceBook, billingUnitsFor, billingBandFor, planFor, setDeveloperPlan, billingLineAmount, billingInvoicesFor, billingNextRenewal, billingSummary, setBillingInvoice, billingInvoiceHTML,
  AGREEMENT_DATA_BLOCKS, AGREEMENT_SHOW_WHEN, agreementMaster, agreementHasCustom, agreementLayoutFor, agreementHistory, saveAgreementLayout, cloneAgreementForDeveloper, resetAgreementForDeveloper, restoreAgreementVersion, agreementSnapshot, splitClausesFromText, lintAgreementLayout, sampleOrderFor,
  // ---- v2 buyer details: international mobiles, e-mail completions, edits before signing ----
  DEMO_MODE, MOBILE_CODES, mobileCodeByValue, EMAIL_DOMAINS, fmtMobile, updateOrderCustomer,
  // ---- v2 remote ordering + e-signature (state for lib/data/remote.js) ----
  SALE_LINKS, SALE_LEADS, SUBMISSIONS, SIGNING_LINKS, SIGNATURES, INBOX, REMOTE_KEYS, SIGNATORIES, signerOf, withVat, withVatSum,
  ApiError,
};
if (typeof window !== "undefined") window.REVNU_DATA = D;
export default D;
