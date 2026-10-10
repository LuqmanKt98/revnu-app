// =====================================================================
//  REVNU_REMOTE — remote sale links, rep-confirmed submissions, signing
//  links & signatures (the client's remote.js), re-based on Supabase.
//
//  Same rules as the prototype:
//    • no unit hold — Accept creates the order (which locks its units) and
//      competing submissions decline automatically
//    • no SMS code — the rep's one-tap Accept is the trust step
//    • the developer block is always pre-signed (signature + stamp stored
//      once on the developer)
//    • the agreement is read on the phone; signing records time, IP,
//      device, the read log and a SHA-256 fingerprint of the deal
//
//  READS are synchronous against the store: the signed-in portals get the
//  rows from the snapshot (RLS-scoped), the buyer's phone from the
//  code-keyed public view. WRITES are server functions (supabase/migrations
//  …012_v2_remote_esign.sql): public_* for the buyer, the rest for reps.
// =====================================================================
"use client";
import D from "./store";
import api, { ApiError } from "./api";
import * as M from "./mappers";

const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = (n = 6) => { let s = ""; for (let i = 0; i < n; i++) s += CH[Math.floor(Math.random() * CH.length)]; return s; };
const slugOf = (project) => String((project && project.name) || "revnu").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const parseCode = (v) => { const parts = String(v || "").trim().split("-"); return (parts[parts.length - 1] || "").toUpperCase(); };
// Public URLs: /order/<project-slug>-<CODE> and /sign/<project-slug>-<CODE> (the prototype's ?c= still works).
const paramCode = () => {
  if (typeof window === "undefined") return "";
  const q = new URLSearchParams(window.location.search); const fromQuery = q.get("c") || q.get("code");
  if (fromQuery) return parseCode(fromQuery);
  const m = window.location.pathname.match(/\/(?:order|sign)\/([^/?#]+)/);
  return m ? parseCode(decodeURIComponent(m[1])) : "";
};
const findBy = (all, c) => { const k = parseCode(c); return all.find((x) => x.code === k || x.code === String(c || "").toUpperCase()) || null; };
const now = () => new Date().toISOString();
const origin = () => (typeof window !== "undefined" ? window.location.origin : "");
const settings = (project) => Object.assign({ validityHours: 48, maxValidityHours: 168, allowChanges: true, requireReadAll: true, signingDays: 7 }, (project && project.remoteSettings) || {});
const isOn = (project) => !!project && (!project.features || project.features.remote !== false);   // pilot default ON; HQ toggle sets it explicitly
// Colleagues who can take a deal: the developer's members holding the 'orders' permission (titles here can be free text).
const repsOf = (developerId) => D.USERS.filter((u) => u.developerId === developerId && !u.deletedAt && D.devHasPerm(u, "orders"));

// Validity is enforced by the server on every touch; reads only mirror it so screens never show a dead link as live.
function refreshLink(l) { if (l && l.status === "live" && new Date(l.validUntil) < new Date()) { l.status = "expired"; return true; } return false; }
function refreshSigning(g) { if (g && ["live", "viewed"].includes(g.status) && new Date(g.validUntil) < new Date()) { g.status = "expired"; return true; } return false; }

// ---------------------------------------------------------------------
// Reads (synchronous)
// ---------------------------------------------------------------------
const links = (repId) => D.SALE_LINKS.map((l) => { refreshLink(l); return l; }).filter((l) => !repId || l.repId === repId);
const getLink = (c) => { const l = findBy(D.SALE_LINKS, c); refreshLink(l); return l; };
const openLink = getLink;   // opening is counted by the public view when the phone loads the link
const linkUrl = (c) => { const l = typeof c === "object" ? c : getLink(c); return origin() + "/order/" + ((l && l.slug) ? l.slug + "-" : "") + (l ? l.code : c); };
const shortUrl = (c) => linkUrl(c).replace(/^https?:\/\/[^/]+\//, "").replace(/^(order|sign)\//, "");
const submissions = (repId) => D.SUBMISSIONS.filter((s) => !repId || s.repId === repId);
const submissionForLink = (c) => D.SUBMISSIONS.find((s) => s.linkCode === c) || null;
const submissionsForLink = (c) => D.SUBMISSIONS.filter((s) => s.linkCode === c);
const submissionById = (id) => D.SUBMISSIONS.find((s) => s.id === id) || null;
const leads = (repId) => D.SALE_LEADS.filter((x) => !repId || x.repId === repId);
const leadById = (id) => D.SALE_LEADS.find((x) => x.id === id) || null;
const signingLinks = (orderId) => D.SIGNING_LINKS.filter((g) => g.orderId === orderId).map((g) => { refreshSigning(g); return g; });
const liveSigningLink = (orderId) => signingLinks(orderId).find((g) => ["live", "viewed", "signed"].includes(g.status)) || null;
const getSigning = (c) => { const g = findBy(D.SIGNING_LINKS, c); refreshSigning(g); return g; };
const openSigning = getSigning;   // opening is counted by the public view when the phone loads the agreement
const signUrl = (c) => { const g = typeof c === "object" ? c : getSigning(c); return origin() + "/sign/" + ((g && g.slug) ? g.slug + "-" : "") + (g ? g.code : c); };
const signatureFor = (orderId) => D.SIGNATURES.find((s) => s.orderId === orderId) || null;
const notifications = (userId) => D.INBOX.filter((n) => n.userId === userId);

// ---------------------------------------------------------------------
// Rep side (signed in)
// ---------------------------------------------------------------------
async function createLink(p) {
  const project = D.projById(p.projectId); if (!project) throw new ApiError("GENERIC", "project");
  if (!isOn(project)) throw new ApiError("REMOTE_OFF");
  const l = await api.remote.createLink({
    projectId: p.projectId, mode: p.mode || "units", unitNumbers: p.unitNumbers || (p.unitNumber ? [p.unitNumber] : []), typeIds: p.typeIds || null,
    routing: p.routing || null, selections: p.selections || {}, perMode: !!p.perMode, perUnit: p.perUnit || null, locks: p.locks || {}, lang: p.lang || "en",
    title: p.title || null, customerHint: p.customerHint || null, hours: p.hours || null, validUntil: p.validUntil || null, days: p.days || null, sentVia: p.sentVia || null,
  });
  await D.refresh(["saleLinks"]);
  return getLink(l.code) || l;
}
async function setLink(c, action, hours) { await api.remote.setLink(c, action, hours); await D.refresh(["saleLinks"]); return getLink(c); }
/** Public-link inquiry → the rep picks the actual unit(s) after the call. */
async function assignUnits(subId, unitNumbers) { await api.remote.assignUnits(subId, (unitNumbers || []).filter(Boolean)); await D.refresh(["submissions"]); return submissionById(subId); }
/** Accept: the order for the submission's rep and buyer, agreement issued pre-signed, signing link ready; competing submissions auto-decline. */
async function accept(subId, by, orderPayload) {
  const r = await api.remote.accept(subId, orderPayload);
  await D.refresh(D.ORDER_KEYS.concat(["submissions", "saleLinks", "saleLeads", "inbox"]));
  api.notifications.dispatch(r.orderId);
  const order = D.ORDERS.find((o) => o.id === r.orderId) || { id: r.orderId };
  return { order, signing: getSigning(r.signingCode) || { code: r.signingCode, orderId: r.orderId, validUntil: r.validUntil, status: "live", sections: [], readLog: [] } };
}
async function decline(subId, reason) { await api.remote.decline(subId, reason); await D.refresh(["submissions"]); return submissionById(subId); }
async function createSigningLink(orderId, via) {
  const g = await api.remote.createSigningLink(orderId, via || "qr");
  await D.refresh(["signingLinks", "orderActivity"]);
  return getSigning(g.code) || g;
}
// ---- developer signatory & stamp: set once, every agreement is issued pre-signed ----
async function setSignatory(devId, patch) {
  const body = {};
  ["authorizedSigner", "authorizedSignerAr", "authorizedSignerTitle", "authorizedSignerTitleAr"].forEach((k) => { if (k in patch) body[k] = patch[k]; });
  if ("signatureData" in patch || "signature" in patch) body.signature = patch.signatureData !== undefined ? patch.signatureData : patch.signature;
  if ("stampData" in patch || "stamp" in patch) body.stamp = patch.stampData !== undefined ? patch.stampData : patch.stamp;
  await api.remote.setSignatory(devId, body);
  await D.refresh(["developers"]);
  return D.devById(devId);
}
async function markRead(ids) { await api.remote.markRead(ids); await D.refresh(["inbox"]); }

// ---------------------------------------------------------------------
// The buyer's phone (no sign-in; the code is the key)
// ---------------------------------------------------------------------
const many = (rows, m) => (rows || []).map((r) => m.fromRow(r));
function catalogueSnap(cat) {
  const c = cat || {};
  return {
    designStyles: many(c.designStyles, M.designStyles), packages: many(c.packages, M.packages), smartHome: many(c.smartHome, M.smartHome), opsModels: many(c.opsModels, M.opsModels),
    kitchens: many(c.kitchens, M.kitchens), acSystems: many(c.acSystems, M.acSystems), coolingPoints: many(c.coolingPoints, M.coolingPoints),
    flooringFinishes: many(c.flooringFinishes, M.flooringFinishes), flooringZones: many(c.flooringZones, M.flooringZones), layoutOptions: many(c.layoutOptions, M.layoutOptions),
    paymentPlans: many(c.paymentPlans, M.paymentPlans), constructionMilestones: many(c.constructionMilestones, M.constructionMilestones),
    contractTemplates: many(c.contractTemplates, M.contractTemplates), contractVars: many(c.contractVars, M.contractVars),
    agreementLayouts: many(c.agreementLayouts, M.agreementLayouts),
  };
}
function submissionSnap(row) {
  if (!row) return {};
  const s = M.submissions.fromRow(row);
  const snap = { submissions: [s] };
  if (row.signing) snap.signingLinks = [M.signingLinks.fromRow(row.signing)];
  return snap;
}
/** Load a sale link (and everything the wizard needs) into the store. Returns the link, or null if the code is unknown. */
async function loadLink(c, open = true) {
  const v = await api.public.linkView(c, open);
  if (!v || v.status === "not_found" || !v.link) return null;
  D.hydrate(Object.assign({
    developers: v.developer ? [M.developers.fromRow(v.developer)] : [], projects: v.project ? [M.projects.fromRow(v.project)] : [],
    unitTypes: many(v.unitTypes, M.unitTypes), units: many(v.units, M.units), profiles: v.rep ? [M.profiles.fromRow(v.rep)] : [],
    saleLinks: [M.saleLinks.fromRow(v.link)], submissions: [], signingLinks: [], saleLeads: [],
  }, catalogueSnap(v.catalogue), submissionSnap(v.submission)));
  return getLink(c);
}
/** Poll for the rep's decision ("Sent to <rep>" screen). */
async function pollLink(c, subId) {
  const r = await api.public.linkStatus(c, subId || null);
  if (!r || r.status === "not_found") return null;
  const l = getLink(c); if (l && r.status) l.status = r.status;
  D.hydrate(Object.assign({}, submissionSnap(r.submission), r.rep ? { profiles: [M.profiles.fromRow(r.rep)] } : {}));
  return r.submission ? submissionById(r.submission.id) : null;
}
/** A public-link visitor who gave name + mobile and pressed Start — routed to a rep at once. */
async function registerLead(c, p) {
  const r = await api.public.leadStart(c, { fullName: p.fullName, mobile: p.mobile, mobileCode: p.mobileCode || "+966", typeId: p.typeId || null });
  const lead = M.saleLeads.fromRow(r.lead);
  D.hydrate(Object.assign({ saleLeads: [lead] }, r.rep ? { profiles: [M.profiles.fromRow(r.rep)] } : {}));
  return lead;
}
/** Buyer: live type / step while browsing. Rep: dismiss or reopen an Interest row. */
async function updateLead(id, patch) {
  if (patch && patch.status) {
    await api.remote.setLead(id, patch.status === "dismissed" ? "dismiss" : "reopen");
    await D.refresh(["saleLeads"]);
    return leadById(id);
  }
  const c = paramCode(); if (!c) return leadById(id);
  try {
    const row = await api.public.leadUpdate(c, id, { typeId: patch.typeId, step: patch.step });
    const x = leadById(id); if (x && row) Object.assign(x, M.saleLeads.fromRow(row));
  } catch (e) { /* best effort: the lead is only a hint for the rep */ }
  return leadById(id);
}
/** The buyer submits. Prices are never taken from the phone — the rep's Accept recomputes them from the catalogue. */
async function submit(c, p) {
  const r = await api.public.submit(c, {
    customer: p.customer, selections: p.selections || {}, unitNumbers: p.unitNumbers || [], perMode: !!p.perMode, perUnit: p.perUnit || null,
    typeId: p.typeId || null, leadId: p.leadId || null, consent: !!p.consent, termsVersion: p.termsVersion || null,
  });
  const s = Object.assign(M.submissions.fromRow(r.submission), { customer: p.customer, selections: p.selections || {}, perUnit: p.perUnit || null });
  D.hydrate(Object.assign({ submissions: [s] }, r.rep ? { profiles: [M.profiles.fromRow(r.rep)] } : {}));
  const l = getLink(c); if (l && l.mode !== "type") l.status = "submitted";
  return s;
}

/** Load a signing link: the order as issued, everything the agreement prints, and the pre-signed developer block. */
async function loadSigning(c, open = true) {
  const v = await api.public.signingView(c, open);
  if (!v || v.status === "not_found" || !v.link || !v.order) return null;
  D.hydrate(Object.assign({
    developers: v.developer ? [M.developers.fromRow(v.developer)] : [], projects: v.project ? [M.projects.fromRow(v.project)] : [],
    unitTypes: many(v.unitTypes, M.unitTypes), units: many(v.units, M.units), profiles: v.rep ? [M.profiles.fromRow(v.rep)] : [],
    orders: [M.orders.fromRow(v.order)], orderActivity: many(v.activity, M.orderActivity),
    signingLinks: [M.signingLinks.fromRow(v.link)], signatures: v.signature ? [M.signatures.fromRow(v.signature)] : [],
  }, catalogueSnap(v.catalogue)));
  return getSigning(c);
}
async function markSectionRead(c, sectionId, sections) {
  const g = getSigning(c);
  // mirror locally at once (the button state depends on it); the server keeps the authoritative log
  if (g) {
    if (sections && sections.length) g.sections = sections.slice();   // the agreement paginates after first paint: keep the latest page list
    if (sectionId && !g.readLog.some((r) => r.id === sectionId)) g.readLog.push({ id: sectionId, at: now() });
  }
  try {
    const r = await api.public.signingRead(c, sectionId || null, sections && sections.length ? sections : null);
    if (g && r) { if (Array.isArray(r.sections)) g.sections = r.sections; if (Array.isArray(r.read_log)) g.readLog = r.read_log; }
  } catch (e) { /* retried with the next page */ }
  return g;
}
async function sign(c, p) {
  const r = await api.public.sign(c, { signatureData: p.signatureData || null, typedName: p.typedName || null, consent: !!p.consent, termsVersion: p.termsVersion || null });
  await loadSigning(c, false);
  return signatureFor(r.orderId) || M.signatures.fromRow(r.signature);
}
// Deterministic fingerprint of an order — informational only; the authoritative hash is taken by the server at signing.
async function fingerprint(order) {
  const o = Object.assign({}, order); ["status", "signedAt", "signature", "contractHash", "signedContractUrl", "paymentProofUrl", "paidAt", "_created", "cancelledAt", "cancelReason"].forEach((k) => delete o[k]);
  const s = JSON.stringify(o, Object.keys(o).sort());
  if (typeof crypto !== "undefined" && crypto.subtle) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------
// WhatsApp helpers (plain wa.me pre-filled links) — verbatim
// ---------------------------------------------------------------------
const wa = (mobile, text) => "https://wa.me/" + String(mobile || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(text || "");
const shareMessage = (ar, o) => {
  const multi = o.mode === "shortlist"; const unitTxt = ar ? (multi ? "رشحت لك الوحدات " + o.unit + " لتختار منها" : "جهزت لك الوحدة " + o.unit + (o.price ? " بسعر " + o.price : "")) : (multi ? "I've shortlisted " + o.unit + " for you to choose from" : "I've prepared unit " + o.unit + (o.price ? " (" + o.price + ")" : ""));
  return ar
    ? "السلام عليكم " + (o.customer || "") + "\nمعك " + o.rep + " من " + o.project + ". " + unitTxt + " حسب اتفاقنا. افتح الرابط من جوالك لمراجعة الخيارات وإرسال طلبك:\n" + o.url + "\nالرابط صالح حتى " + o.until + "."
    : "Hello " + (o.customer || "") + "\nThis is " + o.rep + " from " + o.project + ". " + unitTxt + " as we discussed. Open the link on your phone to review the choices and send your order:\n" + o.url + "\nValid until " + o.until + ".";
};
const publicMessage = (ar, o) => ar
  ? "السلام عليكم\nاختر نوع وحدتك في " + o.project + " وحدد خياراتك من جوالك في خمس دقائق:\n" + o.url + "\nوبعدها يتواصل معك فريق المبيعات لتحديد الوحدة المناسبة لك."
  : "Hello\nChoose your home type at " + o.project + " and set up your options from your phone — about five minutes:\n" + o.url + "\nOur sales team then calls you to pick the right unit.";
const signMessage = (ar, o) => ar
  ? "مرحبا " + (o.customer || "") + "\nتم تأكيد طلبك " + o.order + " لدى " + o.project + ". اقرأ الاتفاقية ووقعها من جوالك عبر هذا الرابط:\n" + o.url + "\n— " + o.rep
  : "Hello " + (o.customer || "") + "\nYour order " + o.order + " with " + o.project + " is confirmed. Please read and sign the agreement on your phone here:\n" + o.url + "\n— " + o.rep;
const fmtUntil = (iso, ar) => new Date(iso).toLocaleString(ar ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const R = {
  settings, isOn, code, slugOf, parseCode, paramCode, repsOf, registerLead, updateLead, leads, leadById, createLink, getLink, openLink, setLink, links, linkUrl, shortUrl,
  submit, submissions, submissionForLink, submissionsForLink, submissionById, assignUnits, accept, decline, publicMessage,
  createSigningLink, signingLinks, liveSigningLink, getSigning, openSigning, markSectionRead, signUrl, fingerprint, sign, signatureFor, setSignatory,
  notifications, markRead, wa, shareMessage, signMessage, fmtUntil,
  // public pages: load / poll the buyer's data by code
  loadLink, pollLink, loadSigning,
};
if (typeof window !== "undefined") window.REVNU_REMOTE = R;
export default R;
