"use client";
// Sales Portal — 9-step white-labelled order flow.
//
// Steps (dynamic per project — toggled off via project.features):
//   Customer → Unit → Design → Package → Smart home → Payment plan
//   → Operating model → Investment calculator → Review & sign
//
// White-labelled via ?dev=<id>. Logged-in rep from sessionStorage.
// When the rep can work on more than one project, an upfront chooser
// pins the project for the rest of the session.
//
// All buyer-facing contracts are buyer ↔ developer. Revnu sits behind
// via a back-to-back operating agreement, surfaced as a small footnote.

import React, { useState, useEffect, useMemo } from "react";
import D from "@/lib/data/store";
import { useStoreVersion } from "@/lib/data/useStore";
import { createPortal } from "react-dom";
import { FullAgreement, AppendixKyc } from "@/portals/shared/contract";
import { downloadAgreementWord } from "@/portals/shared/wordexport";
import { FloorPlan, unitLevels, unitLevelName } from "@/portals/shared/floorplan";
const TT = (s) => (window.I18N ? window.I18N.t(s) : s);
const TX = (o, b) => (window.I18N ? window.I18N.tx(o, b) : (o ? (o[b] || "") : ""));

const params = new URLSearchParams(window.location.search);
const devId  = params.get("dev") || (D.DEVELOPERS[0] && D.DEVELOPERS[0].id);
const T      = D.scopedTo(devId);
const developer = T.developer;
if (!developer) {
  document.getElementById("root").innerHTML = '<div style="padding:40px;text-align:center">Developer not found.</div>';
  throw new Error("dev not found");
}

document.documentElement.style.setProperty("--brand",      developer.brand.primary);
document.documentElement.style.setProperty("--brand-deep", developer.brand.deep);
document.documentElement.style.setProperty("--brand-soft", developer.brand.soft);
document.documentElement.style.setProperty("--brand-text", developer.brand.text);
document.title = "Sales — " + developer.name;

let session = null;
try { session = JSON.parse(sessionStorage.getItem("revnu_session") || localStorage.getItem("revnu_session") || "null"); } catch (e) {}
const urlUser = params.get("u") && D.userById(params.get("u"));
const sessionUser = session && D.userById(session.id);
const isRevnuStaff = !!(session && session.role === "revnu_admin");
const viewingOrder = !!params.get("order");
// Strict accounts: a developer's staff sign in with their own account. Revnu staff may only OPEN A RECORDED
// AGREEMENT here (read-only viewer) — never run the sales flow under someone else's name.
if (!session || (!isRevnuStaff && !(sessionUser && sessionUser.developerId === developer.id)) || (isRevnuStaff && !viewingOrder && !(sessionUser && sessionUser.developerId === developer.id))) {
  location.replace(isRevnuStaff ? "/revnu" : "/login");
  throw new Error("redirecting");
}
const me = (sessionUser && sessionUser.developerId === developer.id)
  ? sessionUser
  : (isRevnuStaff && urlUser && urlUser.developerId === developer.id)
    ? urlUser
    : T.users.find((u) => u.role === "sales_rep") || T.users[0];

const usableProjects = D.projectsForUser(me).filter((p) => p.developerId === developer.id);

const I = {
  arrowL: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M11 6l-6 6 6 6"/></svg>,
  arrowR: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  check:  (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12l4.5 4.5L19 7"/></svg>,
  search: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></svg>,
  down:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 4v12M6 12l6 6 6-6M4 20h16"/></svg>,
  pen:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 4l6 6L8 22H2v-6L14 4z"/></svg>,
  out:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg>,
};

// Step catalogue. Keys map to project.features flags.
const ALL_STEPS = [
  { id: "customer", title: "Customer",        short: "Customer" },
  { id: "unit",     title: "Unit",            short: "Unit" },
  { id: "design",   title: "Design style",    short: "Design",  needs: "furnishing" },
  { id: "package",  title: "Furnishing",      short: "Package", needs: "furnishing" },
  { id: "smart",    title: "Smart home",      short: "Smart",   needs: "smartHome" },
  { id: "operate",  title: "Operating model", short: "Operate", needs: "operations" },
  { id: "calc",     title: "Calculator",      short: "Calc",    needs: "operations" },
  { id: "sign",     title: "Review & sign",   short: "Sign" },
];

function buildSteps(project) {
  if (!project) return ALL_STEPS.filter((s) => !s.needs);
  const f = project.features || { furnishing: true, smartHome: true, operations: true, paymentPlans: true };
  return ALL_STEPS
    .filter((s) => !s.needs || f[s.needs])
    .map((s, i) => ({ ...s, n: String(i + 1).padStart(2, "0") }));
}

function signOut() {
  try { sessionStorage.removeItem("revnu_session"); localStorage.removeItem("revnu_session"); } catch (e) {}
  location.href = "/login";
}

/* =================================================================
   Top-level App — handles project picker, then OrderFlow
================================================================= */
function App() {
  // A rep's real home is the developer admin ("My deals"). The sales portal IS the
  // order wizard. If the rep can only work one project, go straight in; otherwise
  // show a lean project picker. "Back" always returns to the deals home.
  const viewOrder = params.get("order") ? D.ORDERS.find((o) => o.id === params.get("order") && o.developerId === developer.id) : null;
  const [projectId, setProjectId] = useState(viewOrder ? viewOrder.projectId : (usableProjects.length === 1 ? usableProjects[0].id : null));
  const homeHref = isRevnuStaff && !(sessionUser && sessionUser.developerId === developer.id)
    ? "/revnu"
    : "/developer?dev=" + developer.id + (me && D.devHasPerm(me, "orders") && !D.devHasPerm(me, "team") ? "&as=rep&u=" + me.id : "");
  const dealsHref = "/developer?dev=" + developer.id + "&as=rep" + (me ? "&u=" + me.id : "");

  if (params.get("order") && !viewOrder) {
    return <div className="sales-shell"><main className="step-area"><div className="card card-pad-lg" style={{ maxWidth: 520, margin: "60px auto", textAlign: "center" }}>{window.I18N && window.I18N.isAR ? "لم يُعثر على هذا الطلب." : "This order could not be found."}<div style={{ marginTop: 14 }}><a className="btn btn-secondary" href={homeHref}>{window.I18N && window.I18N.isAR ? "رجوع" : "Back"}</a></div></div></main></div>;
  }
  if (viewOrder) return <OrderFlow projectId={viewOrder.projectId} homeHref={homeHref} dealsHref={dealsHref} viewOrder={viewOrder} />;
  if (!projectId) {
    return <ProjectChooser onPick={(p) => setProjectId(p.id)} homeHref={homeHref} />;
  }
  return <OrderFlow projectId={projectId} homeHref={homeHref} dealsHref={dealsHref}
                    onSwitch={usableProjects.length > 1 ? () => setProjectId(null) : null} />;
}

/* =================================================================
   Project chooser — lean "which project?" step (only when a rep
   works more than one project). Not a home screen.
================================================================= */
function ProjectChooser({ onPick, homeHref }) {
  return (
    <div className="sales-shell">
      <TopBarShell title="Start a new sale" sub="Which project is this customer here for?" homeHref={homeHref} />
      <main className="step-area">
        <div className="step-eye">{window.I18N && window.I18N.isAR ? "بيع جديد · المشروع" : "NEW SALE · PROJECT"}</div>
        <h1 className="step-title">{window.I18N && window.I18N.isAR ? "لأي مشروع هذا البيع؟" : "Which project is this for?"}</h1>
        <p className="step-kicker">
          {window.I18N && window.I18N.isAR
            ? "اختر المشروع الذي حضر العميل لأجله — الأسعار ومكتبة التصاميم والباقات والعقود كلّها مرتبطة بالمشروع الذي تختاره."
            : "Pick the project this customer is here for — pricing, the design library, packages and contracts are all scoped to the project you choose."}
        </p>

        <div className="opt-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {usableProjects.map((p) => {
            const units = T.units.filter((u) => u.projectId === p.id);
            const avail = units.filter((u) => u.status === "available").length;
            const f = p.features || {};
            const AR = window.I18N && window.I18N.isAR;
            const featList = [
              f.furnishing  ? (AR ? "التأثيث" : "Furnishing") : null,
              f.fitout      ? (AR ? "التجهيز الداخلي" : "Fit-out") : null,
              f.smartHome   ? (AR ? "المنزل الذكي" : "Smart home") : null,
              f.operations  ? (AR ? "التشغيل" : "Operations") : null,
            ].filter(Boolean);
            return (
              <div key={p.id} className="opt" onClick={() => onPick(p)}>
                <div className="opt-head">
                  <div>
                    <div className="soft" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      // {p.city} · {AR ? "التسليم" : "DELIVERS"} {p.delivery}
                    </div>
                    <h3>{p.name}</h3>
                  </div>
                  <div className="right">
                    <div className="soft" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>// {AR ? "وحدات" : "UNITS"}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 22 }}>{avail}<span className="muted" style={{ fontFamily: "var(--font)", fontSize: 12, fontWeight: 400 }}>/{units.length}</span></div>
                  </div>
                </div>
                <div className="opt-body">
                  {AR ? `مُهيّأ من Revnu لهذا المشروع: ${featList.join(" · ") || "لا طبقات إضافية"}.` : `Configured by Revnu for this project: ${featList.join(" · ") || "no extra layers"}.`}
                </div>
                <div className="opt-meta">
                  {featList.map((f, i) => <span key={i} className="chip chip-cyan" style={{ height: 20, fontSize: 10.5, padding: "0 8px" }}>{f}</span>)}
                  {featList.length === 0 && <span className="chip chip-soft">{AR ? "بيع فقط" : "Sale only"}</span>}
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={(e) => { e.stopPropagation(); onPick(p); }}>{window.I18N && window.I18N.isAR ? "بدء عملية بيع جديدة" : "Start new sale"}</button>
              </div>
            );
          })}
          {usableProjects.length === 0 && (
            <div className="card card-pad-lg" style={{ textAlign: "center", color: "var(--text-muted)" }}>
              You have no projects assigned. Ask your manager to grant access.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TopBarShell({ title, sub, homeHref }) {
  return (
    <header className="sales-top">
      <div className="row" style={{ gap: 14, alignItems: "center" }}>
        {homeHref && <a className="btn btn-ghost btn-sm" href={homeHref}>{homeHref === "/revnu" ? (window.I18N && window.I18N.isAR ? "→ إدارة Revnu" : "← Revnu admin") : (window.I18N && window.I18N.isAR ? "→ صفقاتي" : "← My deals")}</a>}
        <DevMark />
      </div>
      <div className="row" style={{ gap: 14 }}>
        <UserMenu />
      </div>
    </header>
  );
}

function DevMark() {
  if (developer.logo) {
    return (
      <div className="dev-mark">
        <div className="col" style={{ gap: 5 }}>
          <span style={{ display: "inline-flex", alignItems: "center", background: "var(--brand)", borderRadius: 8, padding: "8px 14px" }}>
            <img src={developer.logoDark || developer.logo} alt={developer.name} style={{ height: 24, display: "block" }} />
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-soft)", letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 2 }}>{developer.domain}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="dev-mark">
      <span className="glyph">{developer.initials}</span>
      <div className="col" style={{ lineHeight: 1.15 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>{developer.name}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{developer.domain}</span>
      </div>
    </div>
  );
}

function LangToggle({ block }) {
  const ar = window.I18N && window.I18N.isAR;
  const set = (l) => window.I18N && window.I18N.setLang(l);
  return (
    <div style={{ display: block ? "flex" : "inline-flex", width: block ? "100%" : undefined, border: "1px solid var(--line-strong)", borderRadius: 8, overflow: "hidden" }}>
      <button type="button" onClick={() => set("en")} style={{ flex: block ? 1 : undefined, height: 30, padding: "0 11px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: !ar ? "var(--brand)" : "transparent", color: !ar ? "var(--brand-text)" : "var(--text-muted)" }}>EN</button>
      <button type="button" onClick={() => set("ar")} style={{ flex: block ? 1 : undefined, height: 30, padding: "0 11px", border: "none", borderInlineStart: "1px solid var(--line-strong)", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "var(--font-ar)", background: ar ? "var(--brand)" : "transparent", color: ar ? "var(--brand-text)" : "var(--text-muted)" }}>عربي</button>
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  if (!me) return null;
  const initials = me.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const TL = (en, ar) => (window.I18N && window.I18N.isAR ? ar : en);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 8px 5px 6px", border: "1px solid " + (open ? "var(--line-strong)" : "transparent"), borderRadius: 999, background: open ? "var(--bg-tint)" : "transparent", cursor: "pointer" }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{initials}</span>
        <span className="col hide-mobile" style={{ lineHeight: 1.2, textAlign: "start" }}>
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{me.name}</span>
          <span style={{ display: "block", fontSize: 10.5, color: "var(--text-soft)", whiteSpace: "nowrap" }}>{me.role === "sales_rep" ? TL("Sales Rep", "مندوب مبيعات") : TL("Developer Admin", "مدير المطوّر")}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-soft)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", insetInlineEnd: 0, top: "calc(100% + 8px)", width: 240, background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.14)", padding: 8, zIndex: 300 }}>
          <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--line)", marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{me.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 1 }}>{me.email || developer.name}</div>
          </div>
          <div style={{ padding: "4px 10px 8px" }}>
            <div style={{ fontSize: 10.5, color: "var(--text-soft)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{TL("Language", "اللغة")}</div>
            <LangToggle block />
          </div>
          <a href={"/developer?dev=" + developer.id + "&as=rep" + (me.role === "sales_rep" ? "&u=" + me.id : "")}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 8, background: "transparent", textDecoration: "none", color: "var(--text)", fontSize: 13, fontWeight: 500 }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-tint)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6"/></svg>
            {TL("My deals", "صفقاتي")}
          </a>
          <button type="button" onClick={signOut}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--text)", fontSize: 13, fontWeight: 500, textAlign: "start" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-tint)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg>
            {TL("Sign out", "تسجيل الخروج")}
          </button>
        </div>
      )}
    </div>
  );
}

function PoweredBy() {
  return (
    <span className="powered" title="Powered by Revnu" style={{ marginRight: 4 }}>
      <span style={{ letterSpacing: "0.14em" }}>Powered by</span>
      <span className="rev">
        <span className="nd">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="42" fill="none" stroke="#080B14" strokeWidth="14"/>
            <circle cx="100" cy="100" r="18" fill="#080B14"/>
          </svg>
        </span>
        <span>Revnu</span>
      </span>
    </span>
  );
}

/* =================================================================
   OrderFlow — the actual 9-step session, scoped to one project
================================================================= */
function OrderFlow({ projectId, onSwitch, homeHref, dealsHref, viewOrder }) {
  const readOnly = !!viewOrder;
  const project = T.projects.find((p) => p.id === projectId);
  const P = D.scopedToProject(projectId); // project-scoped configs
  const STEPS = useMemo(() => buildSteps(project), [project]);

  const [order, setOrder] = useState(() => viewOrder ? {
    id: viewOrder.id, projectId: viewOrder.projectId, repId: viewOrder.repId,
    perUnitMode: !!viewOrder.perUnitMode, perUnit: viewOrder.perUnit || {}, editUnit: null,
    customer: Object.assign({ fullName: viewOrder.customerName || "", fullNameAr: "", nationalId: viewOrder.customerId || "", dob: "", mobile: "", email: viewOrder.customerEmail || "", city: "Riyadh", marital: "Married", funding: "mixed" }, viewOrder.customer || {}),
    unitNumbers: (viewOrder.unitNumbers && viewOrder.unitNumbers.length) ? viewOrder.unitNumbers : [viewOrder.unitNumber].filter(Boolean),
    designId: viewOrder.designId || null, paletteId: viewOrder.paletteId || null, packageId: viewOrder.packageId || null,
    fitout: !!viewOrder.fitout, smartId: viewOrder.smartId || null, opsId: viewOrder.opsId || null,
    rate: null, occ: null, years: 5,
    skip: { furnishing: !viewOrder.packageId, smartHome: !viewOrder.smartId, operations: !viewOrder.opsId },
  } : {
    id: D.nextOrderId(),          // reserved up-front so the agreement carries the real reference
    projectId: project.id,
    perUnitMode: false,           // multi-unit: one configuration for all, or one per unit
    perUnit: {},                  // { [unitNumber]: { designId, paletteId, packageId, smartId, fitout } }
    editUnit: null,
    repId: me?.id,
    customer: { fullName: "", fullNameAr: "", nationalId: "", mobile: "", email: "", city: "Riyadh", funding: "mixed", beneficiary: false },
    unitNumbers: [],
    designId: null,
    paletteId: null,
    packageId: null,
    fitout: false,
    smartId: null,
    opsId: null,
    rate: null,
    occ: null,
    years: 5,
    skip: {},  // per-feature skip choices (only honored where project.optional allows)
  });
  const [stepIdx, setStepIdx] = useState(() => viewOrder ? Math.max(0, buildSteps(project).length - 1) : 0);
  React.useEffect(() => { if (!viewOrder && window.RevnuSupport) window.RevnuSupport.firstRun("sales"); }, []);

  const upd     = (patch) => setOrder((o) => ({ ...o, ...patch }));
  const updCust = (patch) => setOrder((o) => ({ ...o, customer: { ...o.customer, ...patch } }));
  const opt     = project.optional || {};
  const skip    = order.skip || {};
  const skipFurnishing = !!((opt.furnishing || readOnly) && skip.furnishing);
  const skipSmart      = !!((opt.smartHome  || readOnly) && skip.smartHome);
  const skipOps        = !!((opt.operations || readOnly) && skip.operations);
  const setSkip = (feature, val) => setOrder((o) => ({ ...o, skip: { ...o.skip, [feature]: val } }));

  const isBen   = !!(order.customer && order.customer.beneficiary);
  const units   = (order.unitNumbers || []).map((n) => D.unitByNumber(n, isBen)).filter(Boolean);
  const unit    = units[0] || null; // primary — drives floor plan, calculator
  const nUnits  = units.length;
  // ---- per-unit configuration (multi-unit deals) ----
  const perMode  = nUnits > 1 && !!order.perUnitMode;
  const baseCfg  = { designId: order.designId, paletteId: order.paletteId, packageId: order.packageId, smartId: order.smartId, fitout: order.fitout, opsId: order.opsId };
  const cfgFor   = (n) => perMode ? Object.assign({}, baseCfg, (order.perUnit || {})[n] || {}) : baseCfg;
  const editUnit = perMode ? ((order.editUnit && (order.unitNumbers || []).includes(order.editUnit)) ? order.editUnit : (order.unitNumbers || [])[0]) : ((order.unitNumbers || [])[0] || null);
  const editUnitObj = editUnit ? D.unitByNumber(editUnit) : unit;
  const view     = cfgFor(editUnit);                     // what the Design / Package / Smart steps display
  const setCfg   = (patch) => perMode
    ? setOrder((o) => ({ ...o, perUnit: { ...(o.perUnit || {}), [editUnit]: { ...((o.perUnit || {})[editUnit] || {}), ...patch } } }))
    : upd(patch);
  const setEditUnit = (n) => upd({ editUnit: n });
  const setPerMode  = (on) => setOrder((o) => {
    if (!on) return { ...o, perUnitMode: false };
    const seeded = {}; (o.unitNumbers || []).forEach((n) => { seeded[n] = Object.assign({ designId: o.designId, paletteId: o.paletteId, packageId: o.packageId, smartId: o.smartId, fitout: o.fitout, opsId: o.opsId }, (o.perUnit || {})[n] || {}); });
    return { ...o, perUnitMode: true, perUnit: seeded, editUnit: (o.unitNumbers || [])[0] || null };
  });
  const unitCfgs = units.map((u) => ({ u, c: cfgFor(u.number) }));
  const primaryCfg = cfgFor(unit ? unit.number : null);
  const design  = skipFurnishing ? null : P.designs.find((d) => d.id === primaryCfg.designId);
  const pkg     = skipFurnishing ? null : P.packages.find((p) => p.id === primaryCfg.packageId);
  const smart   = skipSmart ? null : P.smart.find((s) => s.id === primaryCfg.smartId);
  const ops     = skipOps ? null : P.ops.find((o) => o.id === primaryCfg.opsId);
  const opsView = skipOps ? null : P.ops.find((o) => o.id === view.opsId);
  // per-unit operating rows (unit · model · our economics on that unit's price)
  const opsRows = skipOps ? [] : unitCfgs.map(({ u, c }) => { const m = P.ops.find((o) => o.id === c.opsId) || null; const e = m ? D.opsEconomics(m, u, u.price) : null; return { unit: u, ops: m, ec: e }; });
  const opsMixed = opsRows.length > 1 && opsRows.some((r) => (r.ops && r.ops.id) !== (opsRows[0].ops && opsRows[0].ops.id));
  const opsAny   = opsRows.some((r) => !!r.ops);
  const pkgView = skipFurnishing ? null : P.packages.find((p) => p.id === view.packageId);

  const baseFurnish   = skipFurnishing ? 0 : unitCfgs.reduce((a, { u, c }) => { const pk = P.packages.find((p) => p.id === c.packageId); return a + (pk ? (pk.pricing[u.typeId] || 0) : 0); }, 0);
  const smartUplift   = skipSmart ? 0 : unitCfgs.reduce((a, { u, c }) => { const sm = P.smart.find((x) => x.id === c.smartId); return a + (sm ? (sm.price || 0) : 0); }, 0);
  const fitoutAvail   = !!(project.features?.fitout && pkgView?.fitout && nUnits);
  const fitoutPerUnit = fitoutAvail ? D.boqTotal(pkgView.fitout.boq) : 0;
  const fitoutPrice   = perMode ? fitoutPerUnit : fitoutPerUnit * nUnits;   // the offer shown on the package step
  const fitoutPriceOn = !project.features?.fitout ? 0 : unitCfgs.reduce((a, { u, c }) => { const pk = P.packages.find((p) => p.id === c.packageId); return a + ((pk && pk.fitout && c.fitout) ? D.boqTotal(pk.fitout.boq) : 0); }, 0);
  const fitoutOn      = fitoutPriceOn > 0;
  const furnishPretax = baseFurnish + smartUplift + fitoutPriceOn;
  const furnishTotal  = furnishPretax * 1.15;
  const fitoutTotal   = fitoutOn ? fitoutPriceOn * 1.15 : 0;
  // per-unit rows for the agreement (package / design / smart / fit-out per unit, incl. VAT)
  const perUnitRows   = unitCfgs.map(({ u, c }) => { const pk = skipFurnishing ? null : P.packages.find((p) => p.id === c.packageId); const ds = skipFurnishing ? null : P.designs.find((d) => d.id === c.designId); const sm = skipSmart ? null : P.smart.find((x) => x.id === c.smartId); const fo = !!(project.features?.fitout && pk && pk.fitout && c.fitout); const pre = (pk ? (pk.pricing[u.typeId] || 0) : 0) + (sm ? (sm.price || 0) : 0) + (fo ? D.boqTotal(pk.fitout.boq) : 0); return { unit: u, pkg: pk, design: ds, palette: ds ? D.designPaletteById(ds, c.paletteId) : null, smart: sm, fitout: fo, furnish: pre * 1.15, ops: skipOps ? null : (P.ops.find((o) => o.id === c.opsId) || null) }; });
  const furnishOnlyTotal = furnishTotal - fitoutTotal;
  const unitsPrice    = units.reduce((a, u) => a + (u.price || 0), 0);
  const totalPrice    = unitsPrice + furnishTotal;

  const opsUnits = opsRows.filter((r) => r.ops);
  const opsUnitsPrice = opsUnits.reduce((a, r) => a + (r.unit.price || 0), 0);
  // OUR (admin-set) assumption — canonical, goes in the contract. ONE shared function (D.dealEconomics)
  // feeds the operate cards, the calculator baseline and the agreement, so their figures can never disagree.
  const our = D.dealEconomics(opsRows);
  const econFor = (rows) => D.dealEconomics(rows);
  const isDaily = our.isDaily;
  const operatorFee = our.operatorFee;
  // What-if inputs default to OUR assumption (null = untouched) so the calculator opens on the contract figures.
  const rate = (order.rate == null || order.rate === "") ? our.rate : Number(order.rate);
  const occ  = (order.occ  == null || order.occ  === "") ? our.occ  : Number(order.occ);

  // Calculator (what-if): the sliders move the PRIMARY unit's rate & occupancy, and the whole
  // deal scales proportionally. With sliders untouched the scenario EQUALS our assumption —
  // so the figure here always matches the contract figure until the rep plays with it.
  const _scale      = (our.rate > 0 && our.occ > 0) ? (rate * occ) / (our.rate * our.occ) : 0;
  const annualGross = our.annualGross * _scale;
  const annualNet   = our.annualNet * _scale;
  const grossYield  = (our.opsUnitsPrice || unitsPrice) ? (annualGross / (our.opsUnitsPrice || unitsPrice)) * 100 : 0;
  const roi         = (our.opsUnitsPrice || unitsPrice) ? (annualNet / (our.opsUnitsPrice || unitsPrice)) * 100 : 0;

  useEffect(() => {
    // Model set changed → the what-if goes back to OUR assumption (null = untouched).
    upd({ rate: null, occ: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(unitCfgs.map(({ u, c }) => u.number + ":" + (c.opsId || "")))]);

  const ctx = { T, P, developer, project, order, upd, updCust, unit, units, nUnits, design, pkg, smart, ops, me, isBen,
                perMode, setPerMode, editUnit, setEditUnit, editUnitObj, view, setCfg, unitCfgs, perUnitRows, pkgView, readOnly, viewOrder, opsView, opsRows, opsMixed, opsAny, econFor,
                baseFurnish, smartUplift, furnishPretax, furnishTotal, totalPrice, unitsPrice,
                fitoutAvail, fitoutPrice, fitoutOn, fitoutTotal, furnishOnlyTotal,
                isDaily, rate, occ, annualGross, annualNet, operatorFee, grossYield, roi, our,
                opt, skip, skipFurnishing, skipSmart, skipOps, setSkip };

  const currentStep = STEPS[stepIdx];
  const canAdvance = (() => {
    const id = currentStep.id;
    if (id === "customer") { const c = order.customer; return !!c.fullName.trim() && (!c.nationalId || D.VALID.nationalId(c.nationalId)) && (!c.mobile || D.VALID.mobile(c.mobile)) && (!c.email || D.VALID.email(c.email)); }
    if (id === "unit")     return (order.unitNumbers || []).length > 0;
    if (id === "design")   return skipFurnishing || unitCfgs.every(({ c }) => !!c.designId);
    if (id === "package")  return skipFurnishing || unitCfgs.every(({ u, c }) => { const pk = P.packages.find((p) => p.id === c.packageId); return !!(pk && (pk.pricing[u.typeId] || 0) > 0); });
    if (id === "smart")    return skipSmart || unitCfgs.every(({ c }) => !!c.smartId);
    if (id === "operate")  return skipOps || unitCfgs.every(({ c }) => !!c.opsId);
    return true;
  })();

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitOrder = () => {
    if (submitted || submitting) return;
    setSubmitting(true);
    const AR = window.I18N && window.I18N.isAR;
    let created = null;
    try {
      created = D.createOrder({
        id: order.id,
        perUnitMode: perMode, perUnit: perMode ? order.perUnit : null,
        developerId: developer.id, projectId: project.id,
        unitNumbers: order.unitNumbers,
        customerName: order.customer.fullName,
        customerId: order.customer.nationalId,
        customerEmail: order.customer.email,
        packageId: skipFurnishing ? null : primaryCfg.packageId, designId: skipFurnishing ? null : primaryCfg.designId, paletteId: skipFurnishing ? null : primaryCfg.paletteId, smartId: skipSmart ? null : primaryCfg.smartId,
        opsId: skipOps ? null : primaryCfg.opsId,
        fitout: !!fitoutOn, fitoutCost: fitoutTotal,
        customer: order.customer, repId: me?.id,
        unitPrice: unitsPrice, furnishCost: furnishTotal,
        operatorFee: ops ? ops.mgmtFee : 0,
        monthlyNet: our && our.annualNet ? Math.round(our.annualNet / 12) : 0,
        status: "issued",
      });
    } catch (e) { created = null; }
    setSubmitting(false);
    if (!created) { alert(AR ? "تعذّر إنشاء الطلب: إحدى الوحدات دخلت في صفقة أخرى أو أن الطلب أُرسل مسبقًا." : "Could not create the order: a unit was just taken by another deal, or this order was already submitted."); return; }
    setSubmitted(true);
  };

  const goBack = () => setStepIdx(Math.max(0, stepIdx - 1));
  const goNext = () => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1));

  const renderStep = () => {
    switch (currentStep.id) {
      case "customer": return <StepCustomer {...ctx} />;
      case "unit":     return <StepUnit     {...ctx} />;
      case "design":   return <StepDesign   {...ctx} />;
      case "package":  return <StepPackage  {...ctx} />;
      case "smart":    return <StepSmart    {...ctx} />;
      case "operate":  return <StepOperate  {...ctx} />;
      case "calc":     return <StepCalc     {...ctx} />;
      case "sign":     return <StepSign     {...ctx} />;
      default: return null;
    }
  };

  return (
    <div className="sales-shell">

      <header className="sales-top">
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          <a className="btn btn-ghost btn-sm" href={homeHref}>{homeHref === "/revnu" ? (window.I18N && window.I18N.isAR ? "→ إدارة Revnu" : "← Revnu admin") : (window.I18N && window.I18N.isAR ? "→ صفقاتي" : "← My deals")}</a>
          <DevMark />
        </div>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <span className="chip chip-mono">{window.I18N && window.I18N.isAR ? "طلب" : "ORDER"} #{order.id}</span>
          {onSwitch && <button className="btn btn-ghost btn-sm" onClick={onSwitch} title={window.I18N && window.I18N.isAR ? "تبديل المشروع" : "Switch project"}>{window.I18N && window.I18N.isAR ? "تبديل المشروع" : "Switch project"}</button>}
          {!readOnly && window.RevnuSupport && <window.RevnuSupport.SupportButtons portal="sales" />}
          {readOnly ? <span className="chip">{isRevnuStaff && !(sessionUser && sessionUser.developerId === developer.id) ? (window.I18N && window.I18N.isAR ? "معاينة · إدارة Revnu" : "Preview · Revnu admin") : (window.I18N && window.I18N.isAR ? "معاينة" : "Preview")}</span> : <UserMenu />}
        </div>
      </header>

      {readOnly && (
        <div style={{ background: "var(--brand-soft)", borderBottom: "1px solid var(--line)", padding: "8px 18px", fontSize: 12.5, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip">{window.I18N && window.I18N.isAR ? (D.ORDER_STATUS_META[viewOrder.status]?.ar || viewOrder.status) : (D.ORDER_STATUS_META[viewOrder.status]?.en || viewOrder.status)}</span>
          <strong>{window.I18N && window.I18N.isAR ? "عرض الاتفاقية لطلب مُسجَّل" : "Viewing the agreement of a recorded order"}</strong>
          <span className="soft">{window.I18N && window.I18N.isAR ? "للقراءة فقط — استخدم أزرار Word أو PDF أدناه للتنزيل." : "Read-only — use the Word / PDF buttons below to download."}</span>
          {viewOrder.signedContractUrl && <span className="chip chip-positive">{window.I18N && window.I18N.isAR ? "✓ العقد الموقّع: " : "✓ Signed: "}{viewOrder.signedContractUrl}</span>}
        </div>
      )}
      {!readOnly && <div className="progress-strip">
        {STEPS.map((s, i) => (
          <div key={s.id} className={"pstep " + (i < stepIdx ? "done" : i === stepIdx ? "active" : "")}
               onClick={() => !readOnly && i <= stepIdx && setStepIdx(i)}>
            <span className="pn">
              <span className="b">{i < stepIdx ? <I.check width={11} height={11} /> : s.n}</span>
            </span>
            <span className="pt">{TT(s.short)}</span>
          </div>
        ))}
      </div>}

      {!readOnly && <div className="ctx-bar">
        <span className="ctx-tag"><span className="k">{TT("Project")}</span><span className="v">{TX(project, "name")}</span></span>
        {unit && nUnits <= 1 && <span className="ctx-tag brand"><span className="k">{TT("Unit")}</span><span className="v mono">{unit.number}</span><span style={{ opacity: 0.6 }}>·</span><span>{TX(unit.type, "name")}</span></span>}
        {nUnits > 1 && <span className="ctx-tag brand"><span className="k">{window.I18N && window.I18N.isAR ? "الوحدات" : "Units"}</span><span className="v mono">{order.unitNumbers.join(" · ")}</span></span>}
        {unit && <span className="ctx-tag"><span className="k">{nUnits > 1 ? (window.I18N && window.I18N.isAR ? "سعر الوحدات" : "Units price") : (window.I18N && window.I18N.isAR ? "سعر الوحدة" : "Unit price")}</span><span className="v">{D.fmtSAR(unitsPrice)} SAR</span></span>}
        {perMode && <span className="ctx-tag"><span className="k">{window.I18N && window.I18N.isAR ? "التجهيز" : "Config"}</span><span className="v">{window.I18N && window.I18N.isAR ? "لكل وحدة" : "Per unit"}</span></span>}
        {design && <span className="ctx-tag"><span className="k">{TT("Design")}</span><span className="v">{TX(design, "name")}</span></span>}
        {design && order.paletteId && (() => { const p = D.designPaletteById(design, order.paletteId); return p ? <span className="ctx-tag"><span className="k">{window.I18N && window.I18N.isAR ? "الألوان" : "Palette"}</span><span className="v"><span style={{ display: "inline-flex", verticalAlign: "middle", marginInlineEnd: 5, borderRadius: 3, overflow: "hidden", height: 11 }}>{p.colors.map((c, i) => <span key={i} style={{ width: 8, height: 11, background: c, display: "inline-block" }} />)}</span>{window.I18N && window.I18N.isAR ? (p.nameAr || p.name) : p.name}</span></span> : null; })()}
        {pkg && <span className="ctx-tag"><span className="k">{TT("Furnishing")}</span><span className="v">{TX(pkg, "name")}</span></span>}
        {fitoutOn && <span className="ctx-tag"><span className="k">{TT("Fit-out")}</span><span className="v">{window.I18N && window.I18N.isAR ? "مضاف" : "Added"}</span></span>}
        {smart && <span className="ctx-tag"><span className="k">{window.I18N && window.I18N.isAR ? "الذكي" : "Smart"}</span><span className="v">{TX(smart, "name")}</span></span>}
        {ops && <span className="ctx-tag"><span className="k">{window.I18N && window.I18N.isAR ? "التشغيل" : "Operate"}</span><span className="v">{TX(ops, "name")}</span></span>}
      </div>}

      <main className="step-area">
        {submitted ? (
          <div className="card card-pad-lg" style={{ maxWidth: 640, margin: "40px auto", textAlign: "center", padding: "56px 28px" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(76,175,136,0.14)", color: "var(--positive)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4.5 4.5L19 7"/></svg>
            </div>
            <div className="display-md" style={{ marginBottom: 8 }}>{window.I18N && window.I18N.isAR ? "تم إرسال الطلب" : "Order submitted"}</div>
            <div className="chip chip-mono" style={{ marginBottom: 12 }}>{order.id}</div>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 440, margin: "0 auto" }}>
              {window.I18N && window.I18N.isAR ? ("جُهّزت حزمة العقد وهي جاهزة لتوقيع " + (order.customer.fullName || "المشتري") + ". تم إشعار مكتب " + developer.name + " بالطلب.") : ("The contract pack has been generated and is ready for " + (order.customer.fullName || "the buyer") + " to sign. " + developer.name + "'s back-office has been notified.")}
            </p>
            <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 22 }}>
              <a className="btn btn-primary" href={dealsHref || homeHref}>{window.I18N && window.I18N.isAR ? "افتح صفقاتي ←" : "Open my deals →"}</a>
              <button className="btn btn-secondary" onClick={() => location.reload()}>{window.I18N && window.I18N.isAR ? "بدء طلب جديد" : "Start a new order"}</button>
            </div>
          </div>
        ) : renderStep()}
      </main>

      {readOnly ? (
        <div className="action-bar">
          <a className="btn btn-ghost" href={homeHref}>{window.I18N && window.I18N.isAR ? "رجوع" : "Back"}</a>
          <span className="progress-mini">{order.id} · {order.customer.fullName}</span>
          <span />
        </div>
      ) : (
      <div className="action-bar">
        <button className="btn btn-ghost" onClick={goBack} disabled={stepIdx === 0 || submitted}>
          <I.arrowL width={14} height={14} /> {TT("Back")}
        </button>
        <span className="progress-mini">{window.I18N && window.I18N.isAR ? "الخطوة" : "Step"} {stepIdx + 1} {window.I18N && window.I18N.isAR ? "من" : "of"} {STEPS.length} · {TT(currentStep.title)}</span>
        {stepIdx < STEPS.length - 1 ? (
          <button className="btn btn-primary" onClick={goNext} disabled={!canAdvance}>
            {TT("Continue")} <span style={{ display: "inline-flex", transform: (window.I18N && window.I18N.isAR) ? "scaleX(-1)" : "none" }}><I.arrowR width={14} height={14} /></span>
          </button>
        ) : (
          <button className="btn btn-primary" onClick={submitOrder} disabled={submitted || submitting}><I.pen width={14} height={14} /> {submitted ? (window.I18N && window.I18N.isAR ? "تم الإرسال ✓" : "Submitted ✓") : (window.I18N && window.I18N.isAR ? "إرسال الطلب" : "Submit order")}</button>
        )}
      </div>
      )}
    </div>
  );
}

/* =================================================================
   Steps
================================================================= */
function StepCustomer({ order, updCust }) {
  const c = order.customer;
  const AR = window.I18N && window.I18N.isAR;
  return (
    <>
      <StepHead n="01" eye={AR ? "المشتري" : "BUYER"} title={AR ? "من هو المشتري؟" : "Who is the buyer?"}
        kicker={AR ? `تُلتقط مرة واحدة وتُطبع في اتفاقية الشراء والاستثمار — وهي بين المشتري و${developer.name}.` : `Captured once and printed into the Purchase & Investment Agreement — which is between the buyer and ${developer.name}.`} />
      <div className="card card-pad-lg" style={{ maxWidth: 920 }}>
        <div className="field-grid">
          <Field label={AR ? "الاسم الكامل · كما في الهوية *" : "Full name · as in ID *"}  value={c.fullName}     onChange={(v) => updCust({ fullName: v })}     placeholder={AR ? "فيصل المنصوري" : "Faisal Al-Mansouri"} />
          <Field label={AR ? "الاسم الكامل · بالعربية" : "Full name · Arabic"}      value={c.fullNameAr}   onChange={(v) => updCust({ fullNameAr: v })}   placeholder="فيصل المنصوري" />
          <Field label={AR ? "الهوية الوطنية / الإقامة" : "National ID / Iqama"}   value={c.nationalId}   onChange={(v) => updCust({ nationalId: v })}   placeholder="1078412884" mono error={c.nationalId && !D.VALID.nationalId(c.nationalId) ? (AR ? "10 أرقام تبدأ بـ 1 أو 2" : "10 digits, starting with 1 or 2") : ""} />
          <Field label={AR ? "الجوال" : "Mobile"}                value={c.mobile}       onChange={(v) => updCust({ mobile: v })}       placeholder="+966 5x xxx xxxx" mono error={c.mobile && !D.VALID.mobile(c.mobile) ? (AR ? "رقم سعودي: 05xxxxxxxx أو +9665xxxxxxxx" : "Saudi mobile: 05xxxxxxxx or +9665xxxxxxxx") : ""} />
          <Field label={AR ? "البريد الإلكتروني" : "Email"} type="email"      value={c.email}        onChange={(v) => updCust({ email: v })}        placeholder="name@domain.com" error={c.email && !D.VALID.email(c.email) ? (AR ? "بريد غير صحيح" : "Invalid email") : ""} />
          <Field label={AR ? "المدينة" : "City"}                    value={c.city}         onChange={(v) => updCust({ city: v })} />
          <FieldChips label={AR ? "مصدر التمويل" : "Source of funds"} full value={c.funding} onChange={(v) => updCust({ funding: v })}
            options={[{ id: "cash", label: AR ? "نقد" : "Cash" }, { id: "mortgage", label: AR ? "تمويل عقاري" : "Mortgage" }, { id: "mixed", label: AR ? "مختلط" : "Mixed" }, { id: "company", label: AR ? "شركة / كيان" : "Corporate / SPV" }]} />
          <div className="field full">
            <label>{AR ? "فئة المشتري · تحدّد سعر الوحدة المعتمد في دراسة العائد" : "Buyer category · sets the unit price used in the return study"}</label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {[{ v: false, t: AR ? "غير مستفيد" : "Non-beneficiary", sub: AR ? "سعر السوق" : "market price" }, { v: true, t: AR ? "مستفيد" : "Beneficiary", sub: AR ? "سعر المستفيد (سكني / الدعم)" : "subsidised price (Sakani / support)" }].map((o) => (
                <button key={String(o.v)} type="button" className={"btn " + (!!c.beneficiary === o.v ? "btn-primary" : "btn-secondary")} onClick={() => updCust({ beneficiary: o.v })} style={{ flexDirection: "column", alignItems: "flex-start", height: "auto", padding: "10px 16px", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{o.t}</span><span style={{ fontSize: 11, opacity: 0.75 }}>{o.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <hr className="hr-thin" style={{ margin: "22px 0" }} />
        <div className="row" style={{ gap: 10, fontSize: 12, color: "var(--text-muted)" }}>
          <I.check width={14} height={14} style={{ color: "var(--brand)" }} />
          <span>{AR ? `تبقى بيانات المشتري داخل حساب ${developer.name} ولا تُشارك مع أطراف أخرى.` : `Buyer data stays inside ${developer.name}'s tenant. Saudi PDPL compliant.`}</span>
        </div>
      </div>
    </>
  );
}

function StepUnit({ order, upd, project, P, isBen }) {
  const allUnits = P.units;
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTower, setFilterTower] = useState("all");
  const [hideTaken, setHideTaken] = useState(true);
  const [planUnit, setPlanUnit] = useState(null);

  const types  = P.unitTypes;
  const towers = Array.from(new Set(allUnits.map((u) => u.tower)));

  const q = query.trim().toLowerCase();
  const filtered = allUnits.filter((u) => {
    if (q && ![u.number, u.tower, (D.unitTypeById(u.typeId) || {}).name || ""].some((x) => (x || "").toLowerCase().includes(q))) return false;
    if (filterType !== "all" && u.typeId !== filterType) return false;
    if (filterTower !== "all" && u.tower !== filterTower) return false;
    if (hideTaken && (u.status !== "available" || D.isUnitTaken(u.number))) return false;
    return true;
  });

  const statusChip = (s) => s === "available" ? "chip chip-positive" : s === "reserved" ? "chip chip-warning" : "chip";

  return (
    <>
      <StepHead n="02" eye={(window.I18N && window.I18N.isAR ? "المخزون · " : "INVENTORY · ") + (project?.name || "")} title="Pick units"
        kicker={window.I18N && window.I18N.isAR ? "مخزون مباشر. انقر على أي وحدة متاحة لإضافتها إلى الصفقة — أضف بقدر ما يرغب العميل بشرائه. التأثيث والمنزل الذكي والتشغيل تنطبق على كل وحدة في الصفقة." : "Live inventory. Tap any available row to add it to this deal — add as many as the customer is buying. Furnishing, smart and operations apply to every unit in the deal."} />

      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row" style={{ gap: 14 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
            <I.search width={14} height={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-soft)" }} />
            <input className="input" placeholder={window.I18N && window.I18N.isAR ? "ابحث برقم الوحدة أو البرج أو الإطلالة…" : "Search unit number, tower, or view…"} value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 34 }} />
            {query && <button onClick={() => setQuery("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, border: 0, background: "var(--bg-tint)", borderRadius: "50%", padding: 0 }}>×</button>}
          </div>
          <span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>
            {window.I18N && window.I18N.isAR
              ? <>عرض <strong>{filtered.length}</strong> من {allUnits.length} وحدة</>
              : <>Showing <strong>{filtered.length}</strong> of {allUnits.length} units</>}
          </span>
        </div>
        <div className="row" style={{ gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="muted">{TT("Type")}</span>
            <button className={"btn btn-sm " + (filterType === "all" ? "btn-primary" : "btn-secondary")} onClick={() => setFilterType("all")}>{TT("All")}</button>
            {types.map((t) => (
              <button key={t.id} className={"btn btn-sm " + (filterType === t.id ? "btn-primary" : "btn-secondary")} onClick={() => setFilterType(t.id)}>{TX(t, "name").split("·")[0].trim()}</button>
            ))}
          </div>
          <span className="divider-v" style={{ height: 22 }} />
          <div className="row" style={{ gap: 6 }}>
            <span className="muted">{TT("Tower")}</span>
            <button className={"btn btn-sm " + (filterTower === "all" ? "btn-primary" : "btn-secondary")} onClick={() => setFilterTower("all")}>{TT("All")}</button>
            {towers.map((t) => (
              <button key={t} className={"btn btn-sm " + (filterTower === t ? "btn-primary" : "btn-secondary")} onClick={() => setFilterTower(t)}>{t}</button>
            ))}
          </div>
          <span className="divider-v" style={{ height: 22 }} />
          <label className="row" style={{ gap: 8, color: "var(--text-muted)" }}>
            <input type="checkbox" checked={hideTaken} onChange={(e) => setHideTaken(e.target.checked)} />
            {window.I18N && window.I18N.isAR ? "إخفاء المحجوزة والمباعة" : "Hide reserved & sold"}
          </label>
        </div>
      </div>

      <div className="card card-flush">
        <table className="tbl tbl-clickable">
          <thead>
            <tr>
              <th style={{ width: 120 }}>{TT("Unit")} #</th>
              <th>{TT("Type")}</th>
              <th>{TT("Tower")}</th>
              <th style={{ width: 60 }}>{TT("Floor")}</th>
              <th style={{ width: 80 }}>{TT("Area")}</th>
              <th style={{ width: 150 }}>{TT("Price")} (SAR) <span className="soft" style={{ fontWeight: 400, fontSize: 10, display: "block" }}>{isBen ? (window.I18N && window.I18N.isAR ? "سعر المستفيد" : "beneficiary price") : (window.I18N && window.I18N.isAR ? "سعر السوق" : "market price")}</span></th>
              <th style={{ width: 110 }}>{window.I18N && window.I18N.isAR ? "المخطط" : "Floor plan"}</th>
              <th style={{ width: 110, textAlign: "right" }}>{TT("Status")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const t = D.unitTypeById(u.typeId);
              const sel    = order.unitNumbers || [];
              const active = sel.includes(u.number);
              const avail  = u.status === "available" && !D.isUnitTaken(u.number);
              const price  = D.unitPriceFor(u, isBen);
              return (
                <tr key={u.number} className={active ? "tbl-active" : ""}
                    style={{ opacity: avail ? 1 : 0.5, cursor: avail ? "default" : "not-allowed" }}
                    onClick={() => avail && upd({ unitNumbers: active ? sel.filter((n) => n !== u.number) : [...sel, u.number] })}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: 5,
                        border: "1.5px solid " + (active ? "var(--brand)" : "var(--line-strong)"),
                        background: active ? "var(--brand)" : "transparent",
                        color: "#fff", fontSize: 11, lineHeight: "13px", textAlign: "center",
                      }}>{active ? "✓" : ""}</span>
                      <span className="mono" style={{ fontWeight: 600 }}>{u.number}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{TX(t, "name")}</div>
                    <div className="soft" style={{ fontSize: 11 }}>{t?.bedrooms} {window.I18N && window.I18N.isAR ? "غرفة ·" : "bed ·"} {t?.baths} {window.I18N && window.I18N.isAR ? "حمّام" : "bath"}</div>
                  </td>
                  <td>{u.tower}</td>
                  <td className="mono">{u.floorSpan || (u.floor === -1 ? (window.I18N && window.I18N.isAR ? "أرضي" : "G") : u.floor)}</td>
                  <td className="mono">{u.area || t?.area} m²{window.unitLevels && window.unitLevels(t) > 1 ? <span className="soft" style={{ fontSize: 10, display: "block" }}>{window.unitLevels(t)} {window.I18N && window.I18N.isAR ? "طوابق" : "floors"}</span> : null}</td>
                  <td className="mono" style={{ fontWeight: 500 }}>{D.fmtSAR(price)}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setPlanUnit({ u, t }); }}>{window.I18N && window.I18N.isAR ? "عرض الوحدة" : "View unit"}</button>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className={statusChip(D.isUnitTaken(u.number) ? "sold" : u.status)} style={{ textTransform: "capitalize" }}>{TT(D.isUnitTaken(u.number) ? "sold" : u.status)}</span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 36, color: "var(--text-soft)" }}>{window.I18N && window.I18N.isAR ? "لا توجد وحدات مطابقة. وسّع الفلاتر." : "No units match. Widen the filters."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {planUnit && <FloorPlanModal planUnit={planUnit} onClose={() => setPlanUnit(null)} />}

      {(order.unitNumbers || []).length > 0 && (
        <div className="card card-pad" style={{ position: "fixed", left: "50%", right: "auto", transform: "translateX(-50%)", bottom: 18, zIndex: 90, width: "min(900px, calc(100% - 48px))", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", boxShadow: "0 10px 36px rgba(0,0,0,0.18)", border: "1px solid var(--brand)", background: "var(--bg-card)" }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <strong style={{ fontSize: 14 }}>{order.unitNumbers.length} {window.I18N && window.I18N.isAR ? "وحدة في هذه الصفقة" : "unit" + (order.unitNumbers.length > 1 ? "s" : "") + " in this deal"}</strong>
            {order.unitNumbers.map((n) => (
              <span key={n} className="chip" style={{ background: "var(--brand-soft)" }}>
                {n}
                <span onClick={(e) => { e.stopPropagation(); upd({ unitNumbers: order.unitNumbers.filter((x) => x !== n) }); }}
                      style={{ marginLeft: 6, cursor: "pointer", fontWeight: 700 }}>×</span>
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: 16, alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div className="soft" style={{ fontSize: 10, letterSpacing: "0.05em" }}>{window.I18N && window.I18N.isAR ? "إجمالي الوحدات" : "UNITS SUBTOTAL"}</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{D.fmtSAR(order.unitNumbers.reduce((a, n) => { const u = D.unitByNumber(n, isBen); return a + (u ? u.price : 0); }, 0))} <span className="soft" style={{ fontSize: 10 }}>SAR</span></div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => upd({ unitNumbers: [] })}>{window.I18N && window.I18N.isAR ? "مسح" : "Clear"}</button>
          </div>
        </div>
      )}
    </>
  );
}

function FloorPlanModal({ planUnit, onClose }) {
  const { u, t } = planUnit;
  const levels = window.unitLevels ? window.unitLevels(t) : 1;
  const [lvl, setLvl] = useState(0);
  const plans = D.floorPlansOf(t);
  const [planIdx, setPlanIdx] = useState(0);
  const views = [
    t.render3dImg ? { id: "3d", label: "3D render" } : null,
    { id: "plan", label: "Floor plan" },
    t.masterplanImg ? { id: "map", label: "Masterplan" } : null,
  ].filter(Boolean);
  const [view, setView] = useState(views[0].id);
  const _fl = (u.floor === -1 || u.floor === "(-1)") ? (window.I18N && window.I18N.isAR ? "الدور الأرضي" : "Ground") : (u.floor == null ? "—" : u.floor);
  const floorLabel = u.floorSpan ? (window.I18N && window.I18N.isAR ? "الطوابق " + u.floorSpan : "Floors " + u.floorSpan) : (window.I18N && window.I18N.isAR ? "الطابق " + _fl : "Floor " + _fl);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "var(--r-lg)", maxWidth: 760, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div className="row-between" style={{ padding: "16px 22px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--brand-deep)" }}>// {window.I18N && window.I18N.isAR ? "الوحدة" : "UNIT"}{levels > 1 ? (window.I18N && window.I18N.isAR ? " · دوبلكس" : " · DUPLEX") : ""}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500, marginTop: 2 }}>{u.number} · {TX(t, "name")}</div>
            <div className="soft" style={{ fontSize: 12, marginTop: 2 }}>{t?.bedrooms} {window.I18N && window.I18N.isAR ? "غرفة ·" : "bed ·"} {t?.baths} {window.I18N && window.I18N.isAR ? "حمّام" : "bath"} · {u.area || t?.area} m² · {u.tower}, {floorLabel}{u.view ? " · " + u.view : ""}</div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>{window.I18N && window.I18N.isAR ? "إغلاق ×" : "Close ×"}</button>
        </div>

        <div className="tabs" style={{ padding: "12px 22px 0", flexWrap: "wrap" }}>
          {views.map((v) => (
            <button key={v.id} className={"tab " + (view === v.id ? "active" : "")} onClick={() => setView(v.id)}>{v.label}</button>
          ))}
        </div>

        <div style={{ padding: 22, background: "var(--bg-sunken)", overflow: "auto" }}>
          {view === "3d" && (
            <>
              <img src={t.render3dImg} alt="3D render" style={{ width: "100%", borderRadius: "var(--r-sm)", display: "block" }} />
              <div className="soft" style={{ fontSize: 11, marginTop: 10, textAlign: "center" }}>Indicative 3D render of the {t.name} type.</div>
            </>
          )}
          {view === "plan" && (
            <>
              {levels > 1 && !t.floorPlanImg && (
                <div className="tabs" style={{ justifyContent: "center", marginBottom: 12 }}>
                  {Array.from({ length: levels }).map((_, i) => (
                    <button key={i} className={"tab " + (lvl === i ? "active" : "")} onClick={() => setLvl(i)}>
                      <span className="mono soft" style={{ fontSize: 10, marginRight: 7 }}>{String(i + 1).padStart(2, "0")}</span>
                      {window.unitLevelName ? window.unitLevelName(t, i) : "Floor " + (i + 1)}
                    </button>
                  ))}
                </div>
              )}
              {plans.length > 1 && (
                <div className="tabs" style={{ justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
                  {plans.map((p, i) => (
                    <button key={i} className={"tab " + (planIdx === i ? "active" : "")} onClick={() => setPlanIdx(i)}>{window.I18N && window.I18N.isAR ? (p.labelAr || p.label) : p.label}</button>
                  ))}
                </div>
              )}
              <div style={{ maxWidth: plans.length ? 720 : 480, margin: "0 auto" }}>
                {plans.length
                  ? <img src={plans[Math.min(planIdx, plans.length - 1)].src} alt={plans[Math.min(planIdx, plans.length - 1)].label || "Floor plan"} style={{ width: "100%", borderRadius: "var(--r-sm)", display: "block", background: "#fff" }} />
                  : (window.FloorPlan ? window.FloorPlan({ type: t, view: u.view, level: lvl }) : <div className="muted">Floor plan unavailable.</div>)}
              </div>
              <div className="soft" style={{ fontSize: 11, marginTop: 10, textAlign: "center" }}>
                {window.I18N && window.I18N.isAR
                  ? ((levels > 1 ? "منزل من طابقين — يربط بينهما درج داخلي. " : (plans.length > 1 ? "عدة موديلات لهذا النوع — يُحدَّد الموديل النهائي عند التعاقد. " : "")) + (plans.length ? "مخطط استرشادي — يُرجى الرجوع إلى الرسومات المعمارية النهائية." : "مخطط تخطيطي · استرشادي فقط · ليس بمقياس البناء.") + " يُشكّل الملحق (أ) من الاتفاقية.")
                  : ((levels > 1 ? "Two-storey home — internal stair links both floors. " : (plans.length > 1 ? "Several layouts exist for this type — the final model is confirmed at contracting. " : "")) + (plans.length ? "Indicative layout — refer to the final architectural drawings." : "Schematic layout · indicative only · not to construction scale.") + " Forms Appendix A of the agreement.")}
              </div>
            </>
          )}
          {view === "map" && (
            <>
              <img src={t.masterplanImg} alt="Masterplan" style={{ width: "100%", borderRadius: "var(--r-sm)", display: "block" }} />
              <div className="soft" style={{ fontSize: 11, marginTop: 10, textAlign: "center" }}>Masterplan — location of Unit {u.number} within the development.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDesign(ctx) {
  const { order, P, opt, skipFurnishing, setSkip, view, setCfg } = ctx;
  return (
    <>
      <StepHead n="03" eye={window.I18N && window.I18N.isAR ? "الطابع الجمالي" : "AESTHETIC"} title={window.I18N && window.I18N.isAR ? "اختر نمط التصميم" : "Choose a design style"}
        kicker={window.I18N && window.I18N.isAR ? `منسّقة من ${developer.name} لهذا المشروع. السعر نفسه — الأمر يتعلّق بالإحساس والطابع فقط.` : `Curated by ${developer.name} for this project. Pricing is the same; this is purely about feel.`} />
      {opt.furnishing && <OptionalBanner feature="furnishing" label="Furnishing" skipped={skipFurnishing} setSkip={setSkip} />}
      {!skipFurnishing && <UnitConfigBar {...ctx} doneKey="designId" />}
      {skipFurnishing ? <SkippedBody label="Furnishing" /> : (
      <div className="opt-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {P.designs.map((d) => {
          const selected = view.designId === d.id;
          const pals = D.designPalettes(d);
          const chosenPid = view.paletteId && pals.find((p) => p.id === view.paletteId) ? view.paletteId : pals[0].id;
          const AR = window.I18N && window.I18N.isAR;
          return (
            <div key={d.id} className={"opt " + (selected ? "selected" : "")} onClick={() => { const match = P.packages.find((p) => p.designId === d.id); setCfg(Object.assign({ designId: d.id, paletteId: pals[0].id }, match ? { packageId: match.id } : {})); }} style={{ padding: 0, overflow: "hidden" }}>
              <DesignCarousel design={d} palette={selected ? (pals.find((p) => p.id === chosenPid) || pals[0]).colors : pals[0].colors} />
              <div style={{ padding: "16px 18px" }}>
                <div className="opt-head">
                  <h3>{TX(d, "name")}</h3>
                </div>
                <div className="opt-body">{TX(d, "mood")}</div>
                <div className="opt-meta" style={{ marginTop: 6 }}>
                  {((window.I18N && window.I18N.isAR && d.materialsAr) || d.materials || []).slice(0, 3).map((m, i) => <span key={i}>· {m}</span>)}
                </div>
                {selected && pals.length > 1 ? (
                  <div style={{ marginTop: 14 }}>
                    <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>{AR ? "اختر لوحة الألوان" : "Choose a colour palette"}</div>
                    <div className="soft" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>{AR ? (d.paletteNoteAr || d.paletteNote || "لوحة الألوان تغيّر الإكسسوارات والمخدات والسجاد والمفارش واللوحات — ويبقى الأثاث كما هو.") : (d.paletteNote || "The palette changes the accessories, cushions, rugs, bedding and wall art — the furniture stays the same.")}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {pals.map((pal) => {
                        const on = pal.id === chosenPid;
                        return (
                          <div key={pal.id} onClick={(e) => { e.stopPropagation(); setCfg({ paletteId: pal.id }); }}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", borderRadius: 8, cursor: "pointer",
                                     border: "1.5px solid " + (on ? "var(--brand)" : "var(--line)"), background: on ? "var(--brand-tint, rgba(94,196,212,0.08))" : "transparent" }}>
                            <div style={{ display: "flex", height: 20, width: 76, borderRadius: 4, overflow: "hidden", flexShrink: 0, border: "1px solid var(--line)" }}>
                              {pal.colors.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
                            </div>
                            <span style={{ fontSize: 12.5, fontWeight: on ? 600 : 400, flex: 1 }}>{AR ? (pal.nameAr || pal.name) : pal.name}</span>
                            <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, border: "1.5px solid " + (on ? "var(--brand)" : "var(--line-strong)"), background: on ? "var(--brand)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10 }}>{on ? "✓" : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
                    {pals[0].colors.map((c, i) => <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: c }} />)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}

function DesignCarousel({ design, palette }) {
  const pal = (palette && palette.length) ? palette : (design.palette || ["#EEE", "#CCC"]);
  const imgs = design.images && design.images.length
    ? design.images
    : [{ id: "i1", label: "Preview" }];
  const [i, setI] = useState(0);
  const next = (e) => { e.stopPropagation(); setI((x) => (x + 1) % imgs.length); };
  const prev = (e) => { e.stopPropagation(); setI((x) => (x - 1 + imgs.length) % imgs.length); };
  const img = imgs[i];
  const [failed, setFailed] = useState({});
  const [zoom, setZoom] = useState(false);
  const showImg = img.src && !failed[i];
  const openZoom = (e) => { e.stopPropagation(); if (showImg) setZoom(true); };
  return (
    <div style={{ position: "relative", aspectRatio: "16/10", overflow: "hidden", background: pal[i % pal.length] }}>
      {showImg ? (
        <img src={img.src} alt={img.label} onError={() => setFailed((f) => ({ ...f, [i]: true }))}
             onClick={openZoom} title={window.I18N && window.I18N.isAR ? "تكبير" : "Enlarge"}
             style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "zoom-in" }} />
      ) : (
        <div style={{ width: "100%", height: "100%",
          background: "linear-gradient(135deg, " + pal[i % pal.length] + " 0%, " + pal[(i + 1) % pal.length] + " 100%)" }} />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 42%)", pointerEvents: "none" }} />
      <div className="mono" style={{ position: "absolute", left: 14, bottom: 12, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>// {img.label}</div>
      {imgs.length > 1 && (
        <>
          <button onClick={prev} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 30, height: 30, borderRadius: "50%", border: 0, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 14, cursor: "pointer" }}>‹</button>
          <button onClick={next} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 30, height: 30, borderRadius: "50%", border: 0, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 14, cursor: "pointer" }}>›</button>
          <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4 }}>
            {imgs.map((_, ix) => (
              <span key={ix} onClick={(e) => { e.stopPropagation(); setI(ix); }} style={{ width: ix === i ? 18 : 6, height: 6, borderRadius: 3, background: ix === i ? "#fff" : "rgba(255,255,255,0.5)", transition: "width 0.2s", cursor: "pointer" }} />
            ))}
          </div>
        </>
      )}
      {showImg && (
        <button onClick={openZoom} title={window.I18N && window.I18N.isAR ? "تكبير" : "Enlarge"}
          style={{ position: "absolute", top: 8, insetInlineEnd: 8, width: 30, height: 30, borderRadius: "50%", border: 0, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 14, cursor: "zoom-in" }}>⤢</button>
      )}
      {zoom && <DesignLightbox imgs={imgs} start={i} onClose={() => setZoom(false)} />}
    </div>
  );
}

// Fullscreen image viewer with prev/next + keyboard nav.
function DesignLightbox({ imgs, start, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const real = imgs.filter((x) => x.src);
  const startIdx = Math.max(0, real.findIndex((x) => x === imgs[start]));
  const [i, setI] = useState(startIdx < 0 ? 0 : startIdx);
  const go = (d) => setI((x) => (x + d + real.length) % real.length);
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(AR ? -1 : 1);
      else if (e.key === "ArrowLeft") go(AR ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [real.length]);
  if (!real.length) return null;
  const img = real[i];
  return (
    <div onClick={onClose} dir={AR ? "rtl" : "ltr"}
      style={{ position: "fixed", inset: 0, background: "rgba(12,11,10,0.92)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "5vh 4vw" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 18, insetInlineEnd: 22, width: 40, height: 40, borderRadius: "50%", border: 0, background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
      {real.length > 1 && (
        <button onClick={(e) => { e.stopPropagation(); go(AR ? 1 : -1); }} style={{ position: "absolute", insetInlineStart: 16, top: "50%", transform: "translateY(-50%)", width: 48, height: 48, borderRadius: "50%", border: 0, background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 24, cursor: "pointer" }}>‹</button>
      )}
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <img src={img.src} alt={img.label} style={{ maxWidth: "92vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          <span className="mono" style={{ color: "#fff", fontSize: 12, letterSpacing: "0.08em" }}>{(AR && img.labelAr) ? img.labelAr : img.label}</span>
          {real.length > 1 && <span className="mono" style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{i + 1} / {real.length}</span>}
        </div>
      </div>
      {real.length > 1 && (
        <button onClick={(e) => { e.stopPropagation(); go(AR ? -1 : 1); }} style={{ position: "absolute", insetInlineEnd: 16, top: "50%", transform: "translateY(-50%)", width: 48, height: 48, borderRadius: "50%", border: 0, background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 24, cursor: "pointer" }}>›</button>
      )}
    </div>
  );
}

function StepPackage(ctx) {
  const { order, P, project, fitoutAvail, fitoutPrice, opt, skipFurnishing, setSkip, view, setCfg, perMode, editUnitObj, units, nUnits, pkgView } = ctx;
  const matched = P.packages.filter((p) => p.designId && p.designId === view.designId);
  const pkgs = matched.length ? matched : P.packages;   // a theme's own package follows the chosen design
  const unit = editUnitObj || ctx.unit;
  const pkg = pkgView;
  const AR = window.I18N && window.I18N.isAR;
  const priceFor = (p) => perMode ? (unit ? (p.pricing[unit.typeId] || 0) : 0) : units.reduce((a, u) => a + (p.pricing[u.typeId] || 0), 0);
  const pricedForAll = (p) => perMode ? (unit && (p.pricing[unit.typeId] || 0) > 0) : units.every((u) => (p.pricing[u.typeId] || 0) > 0);
  return (
    <>
      <StepHead n="04" eye={AR ? "التأثيث" : "FURNISHING"} title={AR ? "اختر الباقة" : "Choose a package"}
        kicker={AR ? (nUnits > 1 && !perMode ? "كل فئة حزمة متكاملة. الأسعار أدناه لكل الوحدات (" + nUnits + ") حسب نوع كل وحدة، وتشمل ضمان " + developer.name + "." : "كل فئة حزمة متكاملة. الأسعار أدناه تشمل " + (unit ? (unit.type.nameAr || unit.type.name) : "") + " في الطابق " + (unit ? unit.floor : "") + " وضمان " + developer.name + ".") : (nUnits > 1 && !perMode ? "Each tier is a complete kit. Prices below cover all " + nUnits + " units, priced per unit type, and include " + developer.name + "'s warranty." : "Each tier is a complete kit. Prices below already include this " + (unit ? unit.type.name : "") + " on floor " + (unit ? unit.floor : "") + " and " + developer.name + "'s warranty.")} />
      {opt.furnishing && <OptionalBanner feature="furnishing" label="Furnishing" skipped={skipFurnishing} setSkip={setSkip} />}
      {!skipFurnishing && <UnitConfigBar {...ctx} doneKey="packageId" />}
      {skipFurnishing ? <SkippedBody label="Furnishing" /> : (
      <div className="opt-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
        {pkgs.map((p) => {
          const price = priceFor(p);
          const selected = view.packageId === p.id;
          const available = pricedForAll(p);
          const rooms = Array.from(new Set((p.boq || []).map((b) => b.room))).filter((r) => r !== "Notes").map((r) => TT(r));
          const boq = D.boqFor(p, unit ? unit.typeId : null);
          return (
            <div key={p.id} className={"opt " + (selected ? "selected" : "") + (p.signature ? " pkg-signature" : "")}
                 style={{ opacity: available ? 1 : 0.45, cursor: available ? "default" : "not-allowed" }}
                 onClick={() => available && setCfg({ packageId: p.id })}>
              {p.signature && (
                <div className="row-between" style={{ marginBottom: 10, alignItems: "center" }}>
                  <span className="sig-chip">✦ {AR ? "إصدار موقّع" : "Signature edition"}</span>
                  {p.brandLogo
                    ? <img className="sig-brandlogo" src={p.brandLogo} alt={p.brandName || ""} />
                    : (p.brandName ? <span className="sig-brandname">{AR && p.brandNameAr ? p.brandNameAr : p.brandName}</span> : null)}
                </div>
              )}
              <div className="opt-head">
                <div>
                  <div className="soft" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{TX(p, "tier")}</div>
                  <h3>{TX(p, "name")}</h3>
                </div>
                <div className="price">{available ? D.fmtSAR(price) : "—"} <span className="u">SAR</span></div>
              </div>
              <div className="opt-body">{TX(p, "summary")}</div>
              <ul style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <KvBullet label={TT("Pieces")}   value={p.pieces} />
                <KvBullet label={AR ? "الضمان" : "Warranty"} value={p.warranty + (AR ? " سنوات" : "-year")} />
                <KvBullet label={AR ? "الغرف" : "Rooms"}    value={rooms.length ? rooms.join(" · ") : (AR ? "الكل" : "All")} />
                <KvBullet label="BOQ"      value={boq.length + (AR ? " بند" : " lines")} />
              </ul>
              {boq.length > 0 && (
                <details style={{ marginTop: 10, padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }} onClick={(e) => e.stopPropagation()}>
                  <summary style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-soft)", cursor: "pointer" }}>{AR ? "// جدول الكميات · الملحق F-1" : "// Itemised BOQ · Appendix F-1"}</summary>
                  <table style={{ width: "100%", marginTop: 6, fontSize: 11, borderCollapse: "collapse" }}>
                    <tbody>
                      {boq.filter((b) => b.room !== "Notes").map((b, i) => (
                        <tr key={i} style={{ borderTop: i ? "1px dotted var(--line)" : "none" }}><td style={{ padding: "3px 0", color: "var(--text-muted)", width: "28%" }}>{AR && b.roomAr ? b.roomAr : TT(b.room)}</td><td>{window.I18N ? window.I18N.tx(b, "item") : b.item}</td><td align="right" className="mono">×{b.qty}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          );
        })}
      </div>
      )}

      {fitoutAvail && pkg && pkg.fitout && (
        <div className="card card-pad-lg" style={{ marginTop: 18, border: "1px solid " + (view.fitout ? "var(--brand)" : "var(--line)"), background: view.fitout ? "var(--brand-soft)" : "var(--bg-card)" }}>
          <div className="row-between" style={{ gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="soft" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand-deep)" }}>{AR ? "// إضافة اختيارية" : "// OPTIONAL ADD-ON"}{perMode && unit ? " · " + unit.number : ""}</div>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 20, margin: "4px 0 0" }}>{TX(pkg.fitout, "name") || (AR ? "التشطيب" : "Fit-out")}</h3>
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "8px 0 0", maxWidth: 560, lineHeight: 1.55 }}>{TX(pkg.fitout, "summary")}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 24 }}>+{D.fmtSAR(fitoutPrice)} <span className="soft" style={{ fontSize: 12 }}>SAR</span></div>
              <button className={"btn btn-sm " + (view.fitout ? "btn-primary" : "btn-secondary")} style={{ marginTop: 10 }}
                      onClick={() => setCfg({ fitout: !view.fitout })}>
                {view.fitout ? (AR ? "✓ أُضيف إلى الباقة" : "✓ Added to package") : (AR ? "+ إضافة التجهيز" : "+ Add fit-out")}
              </button>
            </div>
          </div>
          <div className="row" style={{ gap: 18, marginTop: 14, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span>{(pkg.fitout.boq || []).length} {AR ? "بند جدول كميات" : "BOQ lines"}</span>
            {pkg.fitout.warranty ? <span>{AR ? "ضمان " + pkg.fitout.warranty + " سنوات على التشطيبات" : pkg.fitout.warranty + "-year warranty on finishes"}</span> : null}
            <span>{AR ? "يُسلّم قبل الأثاث · جزء من جدول التأثيث" : "Delivered before furniture · part of the Furnishing Schedule"}</span>
          </div>
          {(pkg.fitout.boq || []).length > 0 && (
            <details style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
              <summary style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-soft)", cursor: "default" }}>{AR ? "// معاينة جدول كميات التشطيب · الملحق F-2 · مفصّل" : "// Preview fit-out BOQ · Appendix F-2 · itemised"}</summary>
              <table style={{ width: "100%", marginTop: 8, fontSize: 11.5, borderCollapse: "collapse" }}>
                <thead><tr style={{ color: "var(--text-soft)" }}><th align="left" style={{ fontWeight: 500, padding: "4px 0" }}>{TT("Scope")}</th><th align="left" style={{ fontWeight: 500 }}>{TT("Item")}</th><th align="right" style={{ fontWeight: 500 }}>{TT("Qty")}</th><th align="right" style={{ fontWeight: 500 }}>{TT("Unit price")}</th><th align="right" style={{ fontWeight: 500 }}>{TT("Line total")}</th></tr></thead>
                <tbody>
                  {(pkg.fitout.boq || []).map((b, i) => (
                    <tr key={i}><td style={{ padding: "3px 0", color: "var(--text-muted)" }}>{AR && b.roomAr ? b.roomAr : b.room}</td><td>{AR && b.itemAr ? b.itemAr : b.item}</td><td align="right" className="mono">{b.qty}</td><td align="right" className="mono">{D.fmtSAR(b.unitPrice)}</td><td align="right" className="mono">{D.fmtSAR((b.qty || 0) * (b.unitPrice || 0))}</td></tr>
                  ))}
                  <tr style={{ borderTop: "1px solid var(--line)" }}><td colSpan={4} style={{ paddingTop: 6, fontWeight: 600 }}>{AR ? "إجمالي التشطيب (بدون ضريبة)" : "Fit-out total (excl. VAT)"}</td><td align="right" className="mono" style={{ paddingTop: 6, fontWeight: 600 }}>{D.fmtSAR(D.boqTotal(pkg.fitout.boq))}</td></tr>
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </>
  );
}

function KvBullet({ label, value }) {
  return (
    <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: "var(--bg-sunken)", borderRadius: 4, fontSize: 12 }}>
      <span className="soft" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </li>
  );
}

function StepSmart(ctx) {
  const { order, P, opt, skipSmart, setSkip, view, setCfg } = ctx;
  const tiers = P.smart;
  const AR = window.I18N && window.I18N.isAR;
  const tierTag = (s) => { const lv = s.level || (s.price === 0 ? 0 : s.price < 7500 ? 1 : s.price < 12000 ? 2 : 3); return lv === 0 ? "" : lv === 1 ? (AR ? "المستوى ١" : "Level 1") : lv === 2 ? (AR ? "المستوى ٢" : "Level 2") : (AR ? "المستوى ٣" : "Level 3"); };
  const inc = (s) => (AR && s.includesAr && s.includesAr.length) ? s.includesAr : (s.includes || []);
  return (
    <>
      <StepHead n="05" eye={AR ? "المنزل الذكي" : "SMART HOME"} title={AR ? "طبقة المنزل الذكي" : "Smart-home layer"}
        kicker={AR ? "أضف أقفالاً ذكية وتحكّمًا بالمناخ والإضاءة والصوت. كل باقة حزمة بسعر ثابت، مُركّبة بالكامل ومضمونة." : "Add smart locks, climate, lighting and audio. Each tier is a fixed-price kit, fully wrapped and warrantied."} />
      {opt.smartHome && <OptionalBanner feature="smartHome" label="Smart home" skipped={skipSmart} setSkip={setSkip} />}
      {!skipSmart && <UnitConfigBar {...ctx} doneKey="smartId" />}
      {skipSmart ? <SkippedBody label="Smart home" /> : (
      <div className="opt-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {tiers.map((s) => {
          const selected = view.smartId === s.id;
          const hasImgs = s.images && s.images.length > 0;
          return (
            <div key={s.id} className={"opt " + (selected ? "selected" : "")} onClick={() => setCfg({ smartId: s.id })} style={hasImgs ? { padding: 0, overflow: "hidden" } : undefined}>
              {hasImgs && <DesignCarousel design={{ images: s.images }} palette={["#1b2a32", "#33525e", "#9fb4bc", "#eef3f4"]} />}
              <div style={hasImgs ? { padding: "16px 18px" } : undefined}>
              <div className="opt-head">
                <div>
                  <h3>{TX(s, "name")}</h3>
                  {tierTag(s) ? <span className="chip chip-soft">{tierTag(s)}</span> : null}
                </div>
                <div className="price">{s.price === 0 ? (AR ? "مضمّن" : "Included") : "+" + D.fmtSAR(s.price)}{s.price !== 0 && <span className="u"> SAR</span>}</div>
              </div>
              <div className="opt-body">
                {TX(s, "summary") ? <p style={{ margin: "0 0 8px", color: "var(--text-muted)" }}>{TX(s, "summary")}</p> : null}
                <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                  {inc(s).map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{it}</li>)}
                </ul>
              </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}

function StepOperate(ctx) {
  const { order, P, opt, skipOps, setSkip, view, setCfg, perMode, editUnitObj, units, opsRows, econFor } = ctx;
  const AR = window.I18N && window.I18N.isAR;
  const unit = editUnitObj || ctx.unit;
  const scopeUnits = perMode ? (unit ? [unit] : []) : units;
  return (
    <>
      <StepHead n="06" eye={AR ? "التشغيل" : "OPERATIONS"} title={AR ? "اختر طريقة التشغيل" : "Choose how it'll be operated"}
        kicker={unit
          ? (AR
              ? "كل نموذج يعرض عائدنا المتوقّع لـ" + (scopeUnits.length > 1 ? "الوحدات المختارة (" + scopeUnits.length + ")" : "وحدة " + (unit.type.nameAr || unit.type.name)) + " — بناءً على الافتراضات المحدّدة لهذا المشروع. هذه الأرقام نفسها تدخل في الاتفاقية. الخطوة التالية أداة محاكاة لاستكشاف سيناريوهات أخرى مع العميل."
              : "Each model shows our projected return for " + (scopeUnits.length > 1 ? "the selected units (" + scopeUnits.length + ")" : "a " + unit.type.name) + " — based on the assumptions set for this project. These exact figures go into the agreement. The next step is a what-if tool to explore other scenarios with the customer.")
          : (AR ? "اختر نموذج التشغيل. الخطوة التالية تحوّله إلى عائد متوقّع." : "Pick the operating model. The next step turns this into a projected return.")} />
      {opt.operations && <OptionalBanner feature="operations" label="Operations" skipped={skipOps} setSkip={setSkip} />}
      {!skipOps && <UnitConfigBar {...ctx} doneKey="opsId" />}
      {!skipOps && perMode && opsRows && opsRows.some((r) => r.ops) && (
        <div className="card card-pad" style={{ marginBottom: 14, fontSize: 12 }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{AR ? "// ملخص التشغيل لكل وحدة" : "// OPERATING SUMMARY PER UNIT"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {opsRows.map((r) => (
              <div key={r.unit.number} className="row-between" style={{ padding: "6px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
                <span className="mono" style={{ fontWeight: 600 }}>{r.unit.number}</span>
                <span>{r.ops ? TX(r.ops, "name") : <span className="soft">{AR ? "لم يُحدَّد" : "not set"}</span>}{r.ec ? <span className="soft"> · {r.ec.roi.toFixed(1)}%</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {skipOps ? <SkippedBody label="Operations" /> : (
      <div className="opt-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {P.ops.map((o) => {
          const selected = view.opsId === o.id;
          // Same function that prices the agreement — the card can never disagree with the contract.
          const ec = (unit && scopeUnits.length) ? econFor(scopeUnits.map((u) => ({ unit: u, ops: o }))) : null;
          const rm = ec ? D.RISK_META[ec.risk] : null;
          return (
            <div key={o.id} className={"opt " + (selected ? "selected" : "")} onClick={() => setCfg({ opsId: o.id })} style={{ display: "flex", flexDirection: "column" }}>
              <div className="opt-head">
                <h3>{TX(o, "name")}</h3>
                <span className="chip chip-soft">{o.kind === "daily" ? (AR ? "ليلي" : "Nightly") : (AR ? "شهري+" : "Monthly+")}</span>
              </div>
              <div className="opt-body">{TX(o, "summary")}</div>
              {ec ? (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                  <div className="row-between" style={{ marginBottom: 10 }}>
                    <span className="soft" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em" }}>{AR ? "افتراضنا · " + (scopeUnits.length > 1 ? scopeUnits.length + " وحدات" : TX(unit.type, "name")) : "OUR ASSUMPTION · " + (scopeUnits.length > 1 ? scopeUnits.length + " UNITS" : unit.type.name.toUpperCase())}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: rm.color, background: rm.soft, borderRadius: 20, padding: "2px 9px" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: rm.color }} />{AR ? ({ low: "مخاطر منخفضة", medium: "مخاطر متوسطة", high: "مخاطر عالية" }[ec.risk] || rm.label) : rm.label}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
                    <OpsFig k={ec.isDaily ? (AR ? "السعر الليلي" : "Nightly rate") : (AR ? "الإيجار الشهري" : "Monthly rent")} v={D.fmtSAR(ec.rate) + " SAR" + (scopeUnits.length > 1 ? (AR ? " · الوحدة الأولى" : " · first unit") : "")} />
                    <OpsFig k={AR ? "الإشغال" : "Occupancy"} v={ec.occ + "%"} />
                    <OpsFig k={AR ? "الصافي السنوي" : "Annual net"} v={D.fmtSAR(ec.annualNet) + " SAR"} />
                    <OpsFig k={AR ? "العائد الصافي / سنة" : "Net ROI / yr"} v={ec.roi.toFixed(1) + "%"} accent />
                  </div>
                  <div className="soft" style={{ fontSize: 10, marginTop: 9 }}>{AR ? ("رسوم المشغّل " + o.mgmtFee + "% · نطاق الإشغال " + o.occLow + "–" + o.occHigh + "%") : ("Operator fee " + o.mgmtFee + "% · occupancy band " + o.occLow + "–" + o.occHigh + "%")}</div>
                </div>
              ) : (
                <div className="opt-meta">
                  <span>{AR ? "رسوم المشغّل " : "Operator fee "}{o.mgmtFee}%</span>
                  <span>{AR ? "الإشغال " : "Occupancy "}{o.occLow}–{o.occHigh}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}

function OpsFig({ k, v, accent }) {
  return (
    <div>
      <div className="soft" style={{ fontSize: 10, letterSpacing: "0.03em" }}>{k}</div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 1, color: accent ? "var(--brand)" : "var(--text)" }}>{v}</div>
    </div>
  );
}

function StepCalc(ctx) {
  const { order, upd, unit, ops, isDaily, rate, occ, annualGross, annualNet, operatorFee, grossYield, roi, totalPrice, unitsPrice, nUnits, furnishTotal, fitoutOn, fitoutTotal, furnishOnlyTotal, our, skipOps, opsAny } = ctx;
  const AR = window.I18N && window.I18N.isAR;
  if (skipOps) return (
    <>
      <StepHead n="07" eye={AR ? "أداة المحاكاة" : "WHAT-IF TOOL"} title={AR ? "حاسبة الاستثمار" : "Investment calculator"} kicker={AR ? "تمّ تخطّي التشغيل في هذه الصفقة، لذا لا يوجد إسقاط إيجاري للنمذجة." : "Operations was skipped for this sale, so there's no rental projection to model."} />
      <SkippedBody label="Operations" />
    </>
  );
  if (!opsAny || !unit) return <EmptyHint title={AR ? "اختر نموذج التشغيل أولاً" : "Choose an operating model first"} sub={AR ? "ارجع إلى الخطوة 06 لتحديد نموذج التشغيل." : "Go back to step 06 to set the operating model."} />;
  const firstOps = (our.rows || []).find((r) => r.ops);
  const model = firstOps ? firstOps.ops : ops;
  const rm = D.RISK_META[our.risk];
  const riskLabel = AR ? ({ low: "مخاطر منخفضة", medium: "مخاطر متوسطة", high: "مخاطر عالية" }[our.risk] || rm.label) : rm.label;
  const isOurs = Math.abs(rate - our.rate) < 0.5 && Math.abs(occ - our.occ) < 0.5;
  const reset = () => upd({ rate: null, occ: null });
  const modelName = our.mixed ? (AR ? "نماذج لكل وحدة" : "per-unit models") : (model ? TX(model, "name") : "");
  const base = our.opsUnitsPrice || unitsPrice;
  return (
    <>
      <StepHead n="07" eye={AR ? "أداة المحاكاة" : "WHAT-IF TOOL"} title={AR ? "حاسبة الاستثمار" : "Investment calculator"}
        kicker={AR ? "مساحة تجريبية لاستكشاف السيناريوهات مع العميل. حرّك السعر والإشغال لرؤية تغيّر العوائد — هذا لا يغيّر الاتفاقية. يعتمد العقد دائماً على افتراضنا الرسمي الموضّح أدناه." : "A scratchpad to explore scenarios with the customer. Slide the rate and occupancy to see how returns move — this does NOT change the agreement. The contract always uses our official assumption shown below."} />

      <div className="card card-pad-lg" style={{ marginBottom: 16, background: "var(--brand-soft)", border: "1px solid var(--line)" }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div>
            <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 4 }}>
              <span className="soft" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{AR ? "افتراضنا · يُدرج في العقد" : "OUR ASSUMPTION · GOES IN THE CONTRACT"}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: rm.color, background: rm.soft, borderRadius: 20, padding: "2px 9px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: rm.color }} />{riskLabel}
              </span>
            </div>
            <div className="soft" style={{ fontSize: 12 }}>
              {modelName} · {D.fmtSAR(our.rate) + (isDaily ? (AR ? " ريال/ليلة" : " SAR/night") : (AR ? " ريال/شهر" : " SAR/month"))}{our.mixed || nUnits > 1 ? (AR ? " (الوحدة الأولى)" : " (first unit)") : ""} · {our.occ}% {AR ? "إشغال" : "occupancy"} {AR ? "←" : "→"} <strong style={{ color: "var(--text)" }}>{our.roi.toFixed(1)}% {AR ? "عائد صافٍ" : "net ROI"}</strong> ({D.fmtSAR(our.annualNet)} {AR ? "ريال/سنة" : "SAR/yr"})
            </div>
          </div>
          {!isOurs && <button className="btn btn-sm btn-secondary" onClick={reset}>{AR ? "إعادة إلى افتراضنا" : "Reset to our assumption"}</button>}
        </div>
      </div>

      <div className="calc-grid">
        <div className="card card-pad-lg">
          <div className="row-between">
            <div>
              <div className="soft" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{AR ? "سيناريو · محاكاة" : "SCENARIO · WHAT-IF"}</div>
              <h3 style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 600 }}>
                {isDaily ? (AR ? "السعر اليومي × الإشغال" : "Daily rate × occupancy") : (AR ? "الإيجار الشهري × الإشغال" : "Monthly rent × occupancy")}
              </h3>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={reset}>{AR ? "إعادة إلى افتراضنا" : "Reset to our assumption"}</button>
          </div>
          <hr className="hr-thin" style={{ margin: "18px 0" }} />
          <RateInput label={isDaily ? (AR ? "متوسّط السعر اليومي" : "Average daily rate (ADR)") : (AR ? "الإيجار الشهري" : "Monthly rent")}
                     unit={isDaily ? (AR ? "ريال / ليلة" : "SAR / night") : (AR ? "ريال / شهر" : "SAR / month")}
                     value={rate} min={Math.max(1, Math.round(our.rate * 0.4))} max={Math.round(our.rate * 2) || (isDaily ? 5000 : 60000)} step={isDaily ? 5 : 50}
                     onChange={(v) => upd({ rate: v })}
                     hint={(isDaily ? (AR ? "الإجمالي السنوي = السعر × 365 × الإشغال" : "Annual gross = rate × 365 × occupancy") : (AR ? "الإجمالي السنوي = السعر × 12 × الإشغال" : "Annual gross = rate × 12 × occupancy")) + (nUnits > 1 ? (AR ? " · باقي الوحدات تتغيّر بنفس النسبة" : " · other units scale by the same ratio") : "")} />
          <hr className="hr-thin" style={{ margin: "18px 0" }} />
          <Slider label={AR ? "الإشغال" : "Occupancy"} value={occ} min={30} max={100} step={1} unit="%"
                  onChange={(v) => upd({ occ: v })}
                  hint={model ? (AR ? ("افتراضنا " + our.occ + "% · المعتاد " + model.occLow + "%–" + model.occHigh + "% لـ " + TX(model, "name")) : ("Our assumption " + our.occ + "% · typical " + model.occLow + "%–" + model.occHigh + "% for " + model.name)) : ""} />
          <hr className="hr-thin" style={{ margin: "18px 0" }} />
          <Slider label={AR ? "أفق الاستثمار" : "Investment horizon"} value={order.years} min={1} max={10} step={1} unit={AR ? " سنة" : " yrs"}
                  onChange={(v) => upd({ years: v })}
                  hint={AR ? "عدد سنوات الإسقاط" : "Years the projection runs for"} />
        </div>

        <div className="stack-md">
          <div className="card card-pad-lg">
            <div className="row-between" style={{ marginBottom: 12 }}>
              <div className="soft" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{AR ? "الدخل السنوي · سيناريو" : "ANNUAL INCOME · SCENARIO"}</div>
              {!isOurs && <span className="chip chip-warning" style={{ fontSize: 10 }}>{AR ? "محاكاة — ليست العقد" : "What-if — not the contract"}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Stat label={AR ? "الإجمالي" : "Gross"}        value={D.fmtSAR(annualGross)} unit="SAR" />
              <Stat label={AR ? "رسوم المشغّل" : "Operator fee"} value={D.fmtSAR(annualGross - annualNet)} unit={"SAR · " + operatorFee + "%"} />
              <Stat label={AR ? "الصافي للمالك" : "Net to owner"} value={D.fmtSAR(annualNet)} unit="SAR" big />
              <Stat label={AR ? "الصافي الشهري" : "Monthly net"}  value={D.fmtSAR(annualNet / 12)} unit="SAR" />
            </div>
          </div>
          <div className="card card-pad-lg">
            <div className="soft" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", marginBottom: 12 }}>{AR ? "الأداء · سيناريو" : "PERFORMANCE · SCENARIO"}</div>
            <Stat label={AR ? "العائد الصافي / سنة" : "Net ROI / year"} value={roi.toFixed(1)} unit="%" big />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
              <Stat label={AR ? "العائد الإجمالي" : "Gross yield"} value={grossYield.toFixed(2)} unit={AR ? "% (مشتق)" : "% (derived)"} />
              <Stat label={AR ? "فترة الاسترداد" : "Payback"}     value={annualNet > 0 ? (base / annualNet).toFixed(1) : "—"} unit={AR ? "سنوات" : "years"} />
            </div>
            <div className="soft" style={{ fontSize: 10.5, marginTop: 12, lineHeight: 1.5 }}>
              {AR
                ? ("يسجّل العقد افتراضنا (" + our.roi.toFixed(1) + "% عائد صافٍ)، وليس هذا السيناريو. استخدم هذه الأداة لمناقشة العميل في الاحتمالات الصاعدة والهابطة.")
                : (<>The agreement records <strong>our assumption</strong> ({our.roi.toFixed(1)}% net ROI), not this scenario. Use this to talk the customer through upside and downside.</>)}
            </div>
          </div>
          <div className="card card-pad-lg">
            <div className="soft" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", marginBottom: 8 }}>{AR ? "إجمالي الاستثمار" : "TOTAL INVESTMENT"}</div>
            <div className="kv"><span className="k">{nUnits > 1 ? ((AR ? "الوحدات (" : "Units (") + nUnits + ")") : (AR ? "سعر الوحدة" : "Unit price")}</span><span className="v">{D.fmtSAR(unitsPrice)} SAR</span></div>
            <div className="kv"><span className="k">{AR ? "التأثيث (شامل الضريبة)" : "Furnishing (incl. VAT)"}</span><span className="v">{D.fmtSAR(fitoutOn ? furnishOnlyTotal : furnishTotal)} SAR</span></div>
            {fitoutOn && <div className="kv"><span className="k">{AR ? "التجهيز (شامل الضريبة)" : "Fit-out (incl. VAT)"}</span><span className="v">{D.fmtSAR(fitoutTotal)} SAR</span></div>}
            <hr className="hr-dotted" style={{ margin: "6px 0" }} />
            <div className="kv"><span className="k" style={{ fontWeight: 600, color: "var(--text)" }}>{AR ? "الإجمالي" : "Total"}</span><span className="v" style={{ fontSize: 16 }}>{D.fmtSAR(totalPrice)} SAR</span></div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =================================================================
   STEP 08 — Review & Sign  (Buyer ↔ Developer only)
================================================================= */
function StepSign(ctx) {
  const { order, project, unit, furnishTotal, unitsPrice, readOnly } = ctx;
  const c = order.customer;
  const AR = window.I18N && window.I18N.isAR;
  const hasKyc = (ctx.P.contracts || []).some((d) => d.kind === "kyc");
  // Custom admin-authored templates (with a body) for this project — surfaced as extra tabs.
  const customTpls = (ctx.P.contracts || []).filter((d) => (d.body && d.body.trim()) || (d.bodyAr && d.bodyAr.trim()));
  const tabs = [
    { id: "agreement", tab: AR ? "اتفاقية الشراء والاستثمار" : "Purchase & Investment Agreement" },
    ...customTpls.map((d) => ({ id: "tpl-" + d.id, tab: (AR && d.nameAr) ? d.nameAr : d.name, tpl: d })),
    ...(hasKyc ? [{ id: "kyc", tab: AR ? "إقرار اعرف عميلك وحماية البيانات" : "KYC & PDPL Acknowledgement" }] : []),
  ];
  const [active, setActive] = useState("agreement");
  const [printing, setPrinting] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [lang, setLang] = useState(AR ? "ar" : "en");
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const ref = "AGR-" + (order.id ? order.id.replace(/[^0-9]/g, "") : "26212");
  const brand = developer.brand.primary;

  const kycPaper = (
    <div className="doc-paper">
      <div className="doc-page ag-page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottom: "1px solid #E2E0DA" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {developer.logo
              ? <span style={{ display: "inline-flex", alignItems: "center", background: brand, borderRadius: 7, padding: "6px 11px" }}><img src={developer.logoDark || developer.logo} alt={developer.name} style={{ height: 18, display: "block" }} /></span>
              : <span style={{ width: 30, height: 30, borderRadius: 7, background: brand, color: developer.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Playfair Display', serif", fontWeight: 600 }}>{developer.initials}</span>}
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600 }}>{developer.name}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 9.5, color: "#8A8A90", fontFamily: "'JetBrains Mono', monospace" }}>
            <div style={{ color: "#1D1D1F", fontWeight: 600 }}>{ref}-KYC</div>
            <div>{today} · Appendix</div>
          </div>
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 600, letterSpacing: "-0.012em", margin: "24px 0 4px" }}>KYC &amp; PDPL Acknowledgement</h1>
        <div style={{ fontSize: 12, color: "#6E6E73", marginBottom: 22 }}>Appendix to {ref}</div>
        {hasKyc && window.AppendixKyc ? window.AppendixKyc({ c, developer }) : null}
        <div style={{ marginTop: 40, paddingTop: 22, borderTop: "1px solid #E2E0DA", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
          <SigBlock role="The Buyer"  name={c.fullName || "—"} sub="Beneficiary" />
          <SigBlock role="The Seller" name={developer.name}    sub={developer.primaryContact + ", authorised signatory"} />
        </div>
      </div>
    </div>
  );

  const doDownload = () => {
    const after = () => { setPrinting(false); window.removeEventListener("afterprint", after); };
    window.addEventListener("afterprint", after);
    setPrinting(true);
    // wait for every image in the print copy (renders, plans, logos) before opening the print dialog
    setTimeout(async () => {
      const imgs = [...document.querySelectorAll(".print-doc img")];
      await Promise.race([Promise.all(imgs.map((i) => (i.complete && i.naturalWidth > 0) ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = r; }))), new Promise((r) => setTimeout(r, 8000))]);
      window.print();
    }, 350);
  };

  const doWord = async () => {
    if (wordBusy || !window.downloadAgreementWord) return;
    setWordBusy(true);
    try { await window.downloadAgreementWord({ ...ctx, lang }); }
    catch (e) { console.error("Word export failed", e); }
    setWordBusy(false);
  };

  return (
    <>
      {/* Print-only container: full pack, portaled to <body> so it is a SIBLING of the app —
          the print CSS hides the app via display:none without also hiding this. */}
      {printing && ReactDOM.createPortal(
        <div className="print-doc">
          {window.FullAgreement ? window.FullAgreement({ ...ctx, lang }) : null}
          {hasKyc ? kycPaper : null}
        </div>,
        document.body
      )}

      <StepHead n="08" eye={readOnly ? (AR ? "الاتفاقية" : "AGREEMENT") : (AR ? "المراجعة والتوقيع" : "REVIEW & SIGN")}
        title={readOnly ? (AR ? "اتفاقية الطلب " + order.id : "Agreement · " + order.id) : (AR ? "راجع ووقّع الاتفاقية" : "Review & sign the agreement")}
        kicker={readOnly
          ? (AR ? "النسخة المُسجَّلة من الاتفاقية بين " + (c.fullName || "المشتري") + " و" + developer.name + " كما أُصدرت مع الطلب. نزّلها بصيغة Word أو PDF، أو بدّل لغة المستند من الأعلى." : "The recorded agreement between " + (c.fullName || "the buyer") + " and " + developer.name + " exactly as issued with the order. Download it as Word or PDF, or switch the document language above.")
          : (AR
            ? "اتفاقية واحدة كاملة بين " + (c.fullName || "المشتري") + " و" + developer.name + " — العقار، والتشطيب المختار، وأرقام الاستثمار، والشروط الكاملة. يُسوّى التأثيث كملحق لعقد شراء الوحدة. " + developer.name + " هو الطرف الوحيد؛ وتعمل Revnu من الخلف عبر اتفاقية تشغيل ظهر‑لظهر."
            : "One full agreement between " + (c.fullName || "the buyer") + " and " + developer.name + " — the property, the interior they chose, the investment numbers they ran, and the full terms. The furnishing is settled as an addendum to the buyer's unit purchase contract. " + developer.name + " is the sole counterparty; Revnu sits behind via a back-to-back operating agreement.")} />

      <div className="row-between screen-only" style={{ marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div className="tabs" style={{ flexWrap: "wrap" }}>
          {tabs.map((d, i) => (
            <button key={d.id} className={"tab " + (active === d.id ? "active" : "")} onClick={() => setActive(d.id)}>
              <span className="mono soft" style={{ fontSize: 10, marginRight: 8 }}>{String(i + 1).padStart(2, "0")}</span>
              {d.tab}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div style={{ display: "inline-flex", border: "1px solid var(--line-strong)", borderRadius: 8, overflow: "hidden" }}>
            <button type="button" onClick={() => setLang("en")} style={{ padding: "0 13px", height: 38, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none", background: lang === "en" ? "var(--brand)" : "transparent", color: lang === "en" ? "var(--brand-text)" : "var(--text-muted)" }}>EN</button>
            <button type="button" onClick={() => setLang("ar")} style={{ padding: "0 13px", height: 38, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", borderLeft: "1px solid var(--line-strong)", fontFamily: "var(--font-ar)", background: lang === "ar" ? "var(--brand)" : "transparent", color: lang === "ar" ? "var(--brand-text)" : "var(--text-muted)" }}>عربي</button>
          </div>
          <button className="btn btn-primary" onClick={doWord} disabled={wordBusy}>
            <I.down width={14} height={14} /> {wordBusy ? (AR ? "جارٍ التجهيز…" : "Preparing…") : (AR ? "تنزيل Word" : "Download Word (.doc)")}
          </button>
          <button className="btn btn-secondary" onClick={doDownload}>{AR ? "طباعة / PDF" : "Print / PDF"}</button>
        </div>
      </div>

      <div className="screen-only">
        {active === "agreement"
          ? (window.FullAgreement ? window.FullAgreement({ ...ctx, lang }) : <div className="muted">Loading agreement…</div>)
          : active === "kyc"
            ? kycPaper
            : (() => {
                const tab = tabs.find((x) => x.id === active);
                if (!tab || !tab.tpl) return kycPaper;
                const ar = lang === "ar";
                const body = ar ? (tab.tpl.bodyAr || tab.tpl.body) : (tab.tpl.body || tab.tpl.bodyAr);
                const fillOrder = {
                  developerId: developer.id, projectId: project.id,
                  unitNumber: unit ? unit.number : (order.unitNumbers && order.unitNumbers[0]) || "",
                  customerName: c.fullName, customerId: c.nationalId, customerEmail: c.email,
                  customer: c, unitPrice: unitsPrice, furnishCost: furnishTotal,
                };
                const filled = window.REVNU_DATA.fillContract(body, fillOrder, ar);
                return (
                  <div className="doc-paper">
                    <div className="doc-page ag-page">
                      <pre dir={ar ? "rtl" : "ltr"} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: ar ? "var(--font-ar)" : "Georgia, serif", fontSize: 13.5, lineHeight: 1.9, margin: 0, color: "#1a1a1a" }}>{filled}</pre>
                    </div>
                  </div>
                );
              })()}
      </div>
    </>
  );
}

function Row({ k, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 14, padding: "8px 0", borderBottom: "1px dotted #D2D2D7" }}>
      <div style={{ color: "#6E6E73", fontSize: 11 }}>{k}</div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{children}</div>
    </div>
  );
}
function SigBlock({ role, name, sub }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#86868B", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>{role}</div>
      <div style={{ height: 32, borderBottom: "1px solid #1D1D1F", marginTop: 18 }} />
      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6 }}>{name}</div>
      <div style={{ fontSize: 10, color: "#6E6E73" }}>{sub}</div>
    </div>
  );
}

/* =================================================================
   Shared primitives
================================================================= */
function StepHead({ n, eye, title, kicker }) {
  const ar = window.I18N && window.I18N.isAR;
  return (
    <>
      <div className="step-eye">{ar ? "الخطوة" : "STEP"} {n} · {TT(eye)}</div>
      <h1 className="step-title">{TT(title)}</h1>
      <p className="step-kicker">{kicker}</p>
    </>
  );
}
function Field({ label, value, onChange, placeholder, type, mono, full, error }) {
  return (
    <div className={"field" + (full ? " full" : "")}>
      <label>{label}</label>
      <input className={"input" + (mono ? " mono" : "")} type={type || "text"} value={value || ""} placeholder={placeholder || ""} style={error ? { borderColor: "#c0492f" } : undefined}
             onChange={(e) => onChange(e.target.value)} />
      {error ? <span style={{ fontSize: 11, color: "#c0492f", marginTop: 4 }}>{error}</span> : null}
    </div>
  );
}
function FieldChips({ label, value, onChange, options, full }) {
  return (
    <div className={"field" + (full ? " full" : "")}>
      <label>{label}</label>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {(options || []).map((o) => (
          <button key={o.id} type="button" className={"btn btn-sm " + (value === o.id ? "btn-primary" : "btn-secondary")} onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}
// Multi-unit deals: one configuration for all units, or a separate one per unit.
function UnitConfigBar({ nUnits, units, perMode, setPerMode, editUnit, setEditUnit, unitCfgs, doneKey }) {
  if (!nUnits || nUnits < 2) return null;
  const AR = window.I18N && window.I18N.isAR;
  return (
    <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", border: "1px solid " + (perMode ? "var(--brand)" : "var(--line)") }}>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{AR ? nUnits + " وحدات في هذه الصفقة" : nUnits + " units in this deal"}</span>
      <div style={{ display: "inline-flex", border: "1px solid var(--line-strong)", borderRadius: 8, overflow: "hidden" }}>
        <button type="button" className="btn btn-sm" style={{ border: 0, borderRadius: 0, background: !perMode ? "var(--brand)" : "transparent", color: !perMode ? "var(--brand-text)" : "var(--text-muted)" }} onClick={() => setPerMode(false)}>{AR ? "نفس التجهيز لكل الوحدات" : "Same for all units"}</button>
        <button type="button" className="btn btn-sm" style={{ border: 0, borderRadius: 0, background: perMode ? "var(--brand)" : "transparent", color: perMode ? "var(--brand-text)" : "var(--text-muted)" }} onClick={() => setPerMode(true)}>{AR ? "تجهيز مختلف لكل وحدة" : "Configure per unit"}</button>
      </div>
      {perMode && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {units.map((u) => { const cfg = (unitCfgs.find((x) => x.u.number === u.number) || {}).c || {}; const done = !!cfg[doneKey]; const on = u.number === editUnit; return (
            <button key={u.number} type="button" className={"btn btn-sm " + (on ? "btn-primary" : "btn-secondary")} onClick={() => setEditUnit(u.number)}>
              <span className="mono">{u.number}</span><span style={{ opacity: 0.7, marginInlineStart: 6, fontSize: 11 }}>{window.I18N ? window.I18N.tx(u.type, "name") : u.type.name}</span>{done ? <span style={{ marginInlineStart: 6 }}>✓</span> : null}
            </button>); })}
          <span className="soft" style={{ fontSize: 11.5 }}>{AR ? "اختر وحدة ثم اختر لها من الخيارات أدناه" : "Pick a unit, then choose its option below"}</span>
        </div>
      )}
    </div>
  );
}
// Project-level optional feature: include or skip it for this sale.
function OptionalBanner({ feature, label, skipped, setSkip }) {
  const AR = window.I18N && window.I18N.isAR;
  const name = TT(label);
  return (
    <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: skipped ? "var(--bg-sunken)" : "var(--brand-soft)", border: "1px solid var(--line)" }}>
      <span className="chip chip-soft">{AR ? "اختياري في هذا المشروع" : "Optional in this project"}</span>
      <span style={{ fontSize: 12.5, flex: 1, minWidth: 200 }}>{skipped ? (AR ? "تم تخطّي " + name + " في هذه الصفقة." : name + " is skipped for this sale.") : (AR ? name + " مُضمَّن في هذه الصفقة — يمكن تخطّيه إذا لم يرغب العميل." : name + " is included in this sale — skip it if the customer doesn't want it.")}</span>
      <div style={{ display: "inline-flex", border: "1px solid var(--line-strong)", borderRadius: 8, overflow: "hidden" }}>
        <button type="button" className="btn btn-sm" style={{ border: 0, borderRadius: 0, background: !skipped ? "var(--brand)" : "transparent", color: !skipped ? "var(--brand-text)" : "var(--text-muted)" }} onClick={() => setSkip(feature, false)}>{AR ? "تضمين" : "Include"}</button>
        <button type="button" className="btn btn-sm" style={{ border: 0, borderRadius: 0, background: skipped ? "var(--brand)" : "transparent", color: skipped ? "var(--brand-text)" : "var(--text-muted)" }} onClick={() => setSkip(feature, true)}>{AR ? "تخطّي" : "Skip"}</button>
      </div>
    </div>
  );
}
function SkippedBody({ label }) {
  const AR = window.I18N && window.I18N.isAR;
  const name = TT(label);
  return (
    <div className="card card-pad-lg" style={{ textAlign: "center", color: "var(--text-soft)", padding: "44px 24px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{AR ? "تم تخطّي " + name : name + " skipped"}</div>
      <div style={{ fontSize: 12.5 }}>{AR ? "لا شيء لاختياره هنا — تابع إلى الخطوة التالية، أو اضغط «تضمين» أعلاه لإعادته." : "Nothing to choose here — continue to the next step, or press “Include” above to bring it back."}</div>
    </div>
  );
}
function EmptyHint({ title, sub }) {
  return (
    <div className="card card-pad-lg" style={{ textAlign: "center", padding: "44px 24px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div className="soft" style={{ fontSize: 12.5 }}>{sub}</div>
    </div>
  );
}
// Free-typed number + slider. Local text state so the user can clear and retype without the value snapping back.
function RateInput({ label, unit, value, min, max, step, onChange, hint }) {
  const [txt, setTxt] = useState(String(Math.round(value || 0)));
  const [focus, setFocus] = useState(false);
  React.useEffect(() => { if (!focus) setTxt(String(Math.round(value || 0))); }, [value, focus]);
  const commit = (s) => { const n = parseFloat(String(s).replace(/[^\d.]/g, "")); if (!isNaN(n) && n > 0) onChange(n); };
  const lo = Math.min(min, value || min), hi = Math.max(max, value || max);
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <div className="soft" style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
        <span className="soft" style={{ fontSize: 11 }}>{unit}</span>
      </div>
      <div className="row" style={{ gap: 14, alignItems: "center" }}>
        <input className="mono" type="text" inputMode="decimal" value={txt} dir="ltr"
               onFocus={() => setFocus(true)}
               onBlur={() => { setFocus(false); commit(txt); }}
               onChange={(e) => { const s = e.target.value.replace(/[^\d.]/g, ""); setTxt(s); commit(s); }}
               style={{ width: 130, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, padding: "6px 10px", border: "1px solid var(--line-strong)", borderRadius: "var(--r-sm)", background: "var(--bg-card)", color: "var(--text)" }} />
        <div style={{ flex: 1 }}>
          <input type="range" min={lo} max={hi} step={step} value={value || lo}
                 onChange={(e) => onChange(parseFloat(e.target.value))}
                 style={{ width: "100%", accentColor: "var(--brand)" }} />
        </div>
      </div>
      {hint ? <div className="soft" style={{ fontSize: 11, marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}
function Slider({ label, value, min, max, step, unit, onChange, hint }) {
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <div className="soft" style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{value}<span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{unit}</span></div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(parseFloat(e.target.value))}
             style={{ width: "100%", accentColor: "var(--brand)" }} />
      {hint ? <div className="soft" style={{ fontSize: 11, marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}
function Stat({ label, value, unit, big }) {
  return (
    <div>
      <div className="soft" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: big ? 30 : 20, marginTop: 2, lineHeight: 1.1 }}>{value}<span className="muted" style={{ fontWeight: 400, fontSize: 12, marginInlineStart: 4 }}>{unit}</span></div>
    </div>
  );
}

