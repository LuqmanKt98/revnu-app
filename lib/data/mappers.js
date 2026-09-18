// =====================================================================
//  DB row  <->  prototype object shapes.
//  The ported UI code keeps using the exact field names from data.js
//  (nameAr, priceAdj, furnishCost …). This module is the only place that
//  knows the Postgres column names. Used by the app AND scripts/export-seed.mjs.
// =====================================================================

/** @typedef {Record<string, any>} Row */

// ---- generic helpers ---------------------------------------------------
const snake = (k) => k.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase());
const camel = (k) => k.replace(/_([a-z0-9])/g, (m, c) => c.toUpperCase());

/** Build a bidirectional mapper from an explicit column list. Each entry is
 *  either "sameKey" (camel <-> snake by convention) or ["jsKey", "db_col"]. */
function mapper(cols, opts = {}) {
  const pairs = cols.map((c) => (Array.isArray(c) ? c : [c, snake(c)]));
  const js2db = Object.fromEntries(pairs);
  const db2js = Object.fromEntries(pairs.map(([j, d]) => [d, j]));
  return {
    js2db, db2js,
    fromRow(row) {
      if (!row) return null;
      const o = {};
      for (const [d, j] of Object.entries(db2js)) if (row[d] !== undefined) o[j] = row[d];
      return opts.after ? opts.after(o, row) : o;
    },
    toRow(obj, { partial = false } = {}) {
      if (!obj) return null;
      const r = {};
      for (const [j, d] of Object.entries(js2db)) {
        if (obj[j] === undefined) { if (!partial) continue; else continue; }
        r[d] = obj[j];
      }
      return opts.before ? opts.before(r, obj) : r;
    },
  };
}

// ---- developers ---------------------------------------------------------
export const developers = mapper([
  "id", "name", "nameAr", "legalName", "legalNameAr", "initials", "domain", "crNumber", "vat",
  "primaryContact", "primaryEmail", "authorizedSigner", "authorizedSignerAr", "authorizedSignerTitle", "authorizedSignerTitleAr",
  "brand", "logo", "logoDark", "tagline", "taglineAr", "city", "onboarded", "masterAgreement", "revnuTerms", "createdAt", "updatedAt",
]);

export const commissionLevels = mapper(["developerId", "id", "name", "nameAr", "pct", "scope", "sort"], {
  after: (o) => ({ ...o, pct: Number(o.pct) }),
});

// ---- projects + catalogue ----------------------------------------------
export const projects = mapper([
  "id", "developerId", "name", "nameAr", "city", "cityAr", "delivery", "totalUnits",
  "heroImg", "aerialImg", "masterplanImg", "locatorImg", "tagline", "taglineAr", "blocks",
  "features", "optional", "commercials", "revnuTerms", "createdAt", "updatedAt",
]);

export const unitTypes = mapper([
  "id", "projectId", "name", "nameAr", "bedrooms", "baths", "area", "basePrice", "units", "levels",
  "levelNames", "levelNamesAr", "floorPlanImg", "floorPlans", "masterplanImg", ["render3dImg", "render_3d_img"], "createdAt", "updatedAt",
], { after: (o) => ({ ...o, area: num(o.area), basePrice: num(o.basePrice) }) });

export const units = mapper([
  "number", "projectId", "typeId", "block", "tower", "floor", "view", "status", "priceAdj", "priceBen", "area", "baths", "createdAt", "updatedAt",
], { after: (o) => ({ ...o, area: o.area == null ? o.area : num(o.area), priceAdj: num(o.priceAdj), priceBen: o.priceBen == null ? o.priceBen : num(o.priceBen) }) });

export const designStyles = mapper([
  "id", "projectId", "name", "nameAr", "materials", "materialsAr", "mood", "moodAr", "palette", "palettes",
  "paletteNote", "paletteNoteAr", "images", "createdAt", "updatedAt",
]);

export const packages = mapper([
  "id", "projectId", "designId", "name", "nameAr", "tier", "tierAr", "summary", "summaryAr", "pieces", "warranty",
  "priced", "pricing", "boq", "boqByType", "fitout", "createdAt", "updatedAt",
]);

export const smartHome = mapper([
  "id", "projectId", "name", "nameAr", "price", "level", "summary", "summaryAr", "includes", "includesAr", "createdAt", "updatedAt",
], { after: (o) => ({ ...o, price: num(o.price) }) });

export const opsModels = mapper([
  "id", "projectId", "name", "nameAr", "kind", "mgmtFee", "targetRoi", "occLow", "occHigh", "summary", "summaryAr",
  "defaultRate", "assume", "createdAt", "updatedAt",
], { after: (o) => ({ ...o, mgmtFee: num(o.mgmtFee), targetRoi: o.targetRoi == null ? o.targetRoi : num(o.targetRoi) }) });

export const constructionMilestones = mapper([
  "id", "projectId", ["order", "sort"], "name", "nameAr", "when", "date",
]);

export const paymentPlans = mapper(["id", "projectId", "name", "nameAr", "milestones", "schedule"]);

export const contractTemplates = mapper([
  "id", "projectId", "kind", "lang", "version", "required", "name", "nameAr", "body", "bodyAr", "updated", "createdAt", "updatedAt",
]);

// ---- people ---------------------------------------------------------------
// Prototype shape: Revnu staff have role:"revnu_admin" + roleId:<level>; developer members have developerId + role/perms.
export const profiles = mapper([
  "id", "legacyId", "developerId", "name", "nameAr", "email", "role", "roleAr", ["roleId", "revnu_role_id"], "perms",
  "commissionLevelId", "reportsTo", "bank", "mustChangePassword", "deletedAt", "createdAt", "updatedAt",
], {
  after: (o, row) => {
    if (o.developerId == null) o.role = "revnu_admin";
    if (row.assigned_project_ids !== undefined) o.assignedProjectIds = row.assigned_project_ids || [];
    if (!o.assignedProjectIds) o.assignedProjectIds = [];
    return o;
  },
  before: (r, obj) => {
    if (obj.role === "revnu_admin") { r.developer_id = null; r.role = null; }
    return r;
  },
});

// ---- orders ---------------------------------------------------------------
export const orders = mapper([
  "id", "developerId", "projectId", "repId", "status", "unitNumber",
  "customerName", ["customerId", "customer_national_id"], "customerEmail", "customer",
  "perUnitMode", "perUnit", "packageId", "designId", "paletteId", "smartId", "opsId",
  "fitout", "fitoutCost", "unitPrice", "furnishCost", "operatorFee", "monthlyNet",
  "signedContractUrl", "paymentProofUrl", "signedAt", "paidAt",
  "cancelledAt", "cancelReason", "cancelledBy", "statusBeforeCancel", "reinstatedAt", "createdAt", "updatedAt",
], {
  after: (o, row) => {
    o.unitNumbers = row.unit_numbers || (o.unitNumber ? [o.unitNumber] : []);
    ["fitoutCost", "unitPrice", "furnishCost", "monthlyNet"].forEach((k) => { o[k] = num(o[k]); });
    o.operatorFee = num(o.operatorFee);
    return o;
  },
});

export const orderActivity = mapper(["id", "orderId", "at", "event", "byUserId", ["by", "by_name"], "extra"], {
  after: (o) => Object.assign({ at: o.at, event: o.event, by: o.by }, o.extra || {}),
});

export const documents = mapper(["id", "orderId", "kind", "milestoneId", "storagePath", ["name", "file_name"], "mime", "size", "uploadedBy", "createdAt"]);
export const invoices = mapper(["orderId", "issuedAt"]);
export const receivablePaid = mapper(["orderId", "milestoneId", "paidAt", "documentId", "markedBy"]);
export const payouts = mapper(["orderId", "userId", "levelId", "status", "updatedAt"]);
export const notifications = mapper(["id", "orderId", "kind", "channel", "toEmail", "subject", "subjectAr", "payload", "status", "error", "createdAt", "sentAt"]);

export const supportTickets = mapper([
  "id", "type", "subject", "body", "status", "byUserId", ["by", "by_name"], "byEmail", "developerId", "page", "createdAt", "updatedAt",
], { after: (o, row) => ({ ...o, replies: (row.replies || []).map((r) => ({ at: r.at, by: r.by_name, text: r.text })) }) });

export const leads = mapper(["id", "createdAt", "name", "role", "company", "email", "phone", "city", "units", "notes", "status"]);

export const devPerms = mapper(["id", "en", "ar", "sort"]);
export const devRoles = mapper(["id", "en", "ar", "perms", "sort"]);
export const revnuPerms = mapper(["id", "en", "ar", "sort"]);
export const revnuRoles = mapper(["id", "en", "ar", "perms", "sort"]);
export const contractVars = mapper(["code", "en", "ar", ["block", "is_block"], "sort"]);

// ---- helpers ----------------------------------------------------------------
function num(v) { return v == null || v === "" ? 0 : Number(v); }

/** Static asset paths in the prototype are relative ("images/noor/x.jpg"); the app serves them from "/". */
export function normaliseAssetPath(v) {
  if (typeof v !== "string") return v;
  if (/^(images|brand)\//.test(v)) return "/" + v;
  return v;
}
export function normaliseAssetsDeep(x) {
  if (Array.isArray(x)) return x.map(normaliseAssetsDeep);
  if (x && typeof x === "object") { const o = {}; for (const k in x) o[k] = normaliseAssetsDeep(x[k]); return o; }
  return normaliseAssetPath(x);
}

export const TABLES = {
  developers: { table: "developers", m: developers },
  commissionLevels: { table: "commission_levels", m: commissionLevels },
  projects: { table: "projects", m: projects },
  unitTypes: { table: "unit_types", m: unitTypes },
  units: { table: "units", m: units },
  designStyles: { table: "design_styles", m: designStyles },
  packages: { table: "packages", m: packages },
  smartHome: { table: "smart_home", m: smartHome },
  opsModels: { table: "ops_models", m: opsModels },
  constructionMilestones: { table: "construction_milestones", m: constructionMilestones },
  paymentPlans: { table: "payment_plans", m: paymentPlans },
  contractTemplates: { table: "contract_templates", m: contractTemplates },
  profiles: { table: "profiles", m: profiles },
  orders: { table: "orders", m: orders },
  orderActivity: { table: "order_activity", m: orderActivity },
  documents: { table: "documents", m: documents },
  invoices: { table: "invoices", m: invoices },
  receivablePaid: { table: "receivable_paid", m: receivablePaid },
  payouts: { table: "payouts", m: payouts },
  notifications: { table: "notifications", m: notifications },
  supportTickets: { table: "support_tickets", m: supportTickets },
  leads: { table: "leads", m: leads },
  devPerms: { table: "dev_perms", m: devPerms },
  devRoles: { table: "dev_roles", m: devRoles },
  revnuPerms: { table: "revnu_perms", m: revnuPerms },
  revnuRoles: { table: "revnu_roles", m: revnuRoles },
  contractVars: { table: "contract_vars", m: contractVars },
};

export { snake, camel };
