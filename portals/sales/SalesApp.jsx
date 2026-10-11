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
import R from "@/lib/data/remote";
import { MobileSaleApp, SigningCard } from "@/portals/shared/mobile-wizard";
const TT = (s) => (window.I18N ? window.I18N.t(s) : s);
const TX = (o, b) => (window.I18N ? window.I18N.tx(o, b) : (o ? (o[b] || "") : ""));

// ---- bootstrap: identity comes from the server-verified session (never from browser storage) ----
let params, devId, T, developer, session, urlUser, sessionUser, isRevnuStaff, viewingOrder, me, usableProjects;
function boot(p) {
  params = new URLSearchParams(p || {});
  session = D.me();
  devId  = params.get("dev") || (session && session.developerId) || (D.DEVELOPERS[0] && D.DEVELOPERS[0].id);
  T      = D.scopedTo(devId);
  developer = T.developer;
  if (!developer || !session) return false;

  document.documentElement.style.setProperty("--brand",      developer.brand.primary);
  document.documentElement.style.setProperty("--brand-deep", developer.brand.deep);
  document.documentElement.style.setProperty("--brand-soft", developer.brand.soft);
  document.documentElement.style.setProperty("--brand-text", developer.brand.text);
  document.title = "Sales — " + developer.name;

  urlUser = params.get("u") && D.userById(params.get("u"));
  sessionUser = D.userById(session.id) || session;
  isRevnuStaff = !session.developerId;
  viewingOrder = !!params.get("order");
  // Strict accounts: a developer's staff sign in with their own account. Revnu staff may only OPEN A RECORDED
  // AGREEMENT here (read-only viewer) — never run the sales flow under someone else's name. (Also enforced server-side.)
  if ((!isRevnuStaff && sessionUser.developerId !== developer.id) || (isRevnuStaff && !viewingOrder)) {
    location.replace(isRevnuStaff ? "/revnu" : "/login");
    return false;
  }
  me = (sessionUser.developerId === developer.id)
    ? sessionUser
    : (isRevnuStaff && urlUser && urlUser.developerId === developer.id)
      ? urlUser
      : T.users.find((u) => u.role === "sales_rep") || T.users[0];
  usableProjects = D.projectsForUser(me).filter((p) => p.developerId === developer.id);
  return true;
}

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
  { id: "layout",   title: "Layout",          short: "Layout",  needs: "layout" },
  { id: "flooring", title: "Flooring",        short: "Floors",  needs: "flooring" },
  { id: "kitchen",  title: "Kitchen",         short: "Kitchen", needs: "kitchens" },
  { id: "cooling",  title: "Cooling",         short: "AC",      needs: "cooling" },
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
  D.signOut().finally(() => { location.href = "/login"; });
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
  // ONE wizard (mobile-wizard.jsx). The classic OrderFlow below only renders a recorded order read-only (developer.html → Download contract).
  if (!viewOrder && !usableProjects.length) return <div className="sales-shell"><main className="step-area"><div className="card card-pad-lg" style={{ maxWidth: 520, margin: "60px auto", textAlign: "center" }}>{window.I18N && window.I18N.isAR ? "لا يوجد مشروع مسند إليك بعد. اطلب من مديرك إضافتك إلى مشروع." : "No project is assigned to you yet. Ask your manager to add you to a project."}<div style={{ marginTop: 14 }}><a className="btn btn-secondary" href={homeHref}>{window.I18N && window.I18N.isAR ? "رجوع" : "Back"}</a></div></div></main></div>;
  if (!viewOrder) return <MobileSaleApp developer={developer} me={me} projects={usableProjects} homeHref={homeHref} />;

  if (params.get("order") && !viewOrder) {
    return <div className="sales-shell"><main className="step-area"><div className="card card-pad-lg" style={{ maxWidth: 520, margin: "60px auto", textAlign: "center" }}>{window.I18N && window.I18N.isAR ? "لم يعثر على هذا الطلب." : "This order could not be found."}<div style={{ marginTop: 14 }}><a className="btn btn-secondary" href={homeHref}>{window.I18N && window.I18N.isAR ? "رجوع" : "Back"}</a></div></div></main></div>;
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
            ? "اختر المشروع الذي حضر العميل لأجله — الأسعار ومكتبة التصاميم والباقات والعقود كلها مرتبطة بالمشروع الذي تختاره."
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
                  {AR ? `مهيأ من Revnu لهذا المشروع: ${featList.join(" · ") || "لا طبقات إضافية"}.` : `Configured by Revnu for this project: ${featList.join(" · ") || "no extra layers"}.`}
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
          <span style={{ display: "block", fontSize: 10.5, color: "var(--text-soft)", whiteSpace: "nowrap" }}>{me.role === "developer_admin" ? TL("Developer Admin", "مدير المطور") : me.role === "sales_rep" ? TL("Sales Rep", "مندوب مبيعات") : ((window.I18N && window.I18N.isAR ? me.roleAr : me.role) || me.role) || TL("Sales Rep", "مندوب مبيعات")}</span>
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
          <a href={"/developer?dev=" + developer.id + "&as=rep" + (D.devHasPerm(me, "orders") && !D.devHasPerm(me, "team") ? "&u=" + me.id : "")}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 8, background: "transparent", textDecoration: "none", color: "var(--text)", fontSize: 13, fontWeight: 500 }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-tint)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6"/></svg>
            {TL("My deals", "صفقاتي")}
          </a>
          <a href={"/login?set-password=1&next=" + encodeURIComponent(location.pathname + location.search)}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 8, background: "transparent", textDecoration: "none", color: "var(--text)", fontSize: 13, fontWeight: 500 }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-tint)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            {TL("Change password", "تغيير كلمة المرور")}
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
    <span className="powered" title="Powered by Revnu.sa" style={{ marginRight: 4 }}>
      <span style={{ letterSpacing: "0.14em" }}>Powered by</span>
      <span className="rev">
        <span className="nd">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="42" fill="none" stroke="#080B14" strokeWidth="14"/>
            <circle cx="100" cy="100" r="18" fill="#080B14"/>
          </svg>
        </span>
        <span>Revnu.sa</span>
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
    kitchenId: viewOrder.kitchenId || null, kitchenPaletteId: viewOrder.kitchenPaletteId || null, kitchenScope: viewOrder.kitchenScope || "cabinets", kitchenAddons: viewOrder.kitchenAddons || [], acId: viewOrder.acId || null, acAddons: viewOrder.acAddons || [], flooring: viewOrder.flooring || {}, layoutIds: viewOrder.layoutIds || [],
    rate: null, occ: null, years: 5,
    skip: { furnishing: !viewOrder.packageId, smartHome: !viewOrder.smartId, operations: !viewOrder.opsId, kitchens: !viewOrder.kitchenId, cooling: !viewOrder.acId, flooring: !(viewOrder.flooring && Object.keys(viewOrder.flooring).length), layout: !(viewOrder.layoutIds && viewOrder.layoutIds.length) },
  } : {
    id: null,                     // reserved from the server below so the agreement carries the real reference
    projectId: project.id,
    perUnitMode: false,           // multi-unit: one configuration for all, or one per unit
    perUnit: {},                  // { [unitNumber]: { designId, paletteId, packageId, smartId, fitout } }
    editUnit: null,
    repId: me?.id,
    customer: { fullName: "", fullNameAr: "", nationalId: "", mobileCode: "+966", mobile: "", email: "", city: "Riyadh", funding: "mixed", beneficiary: false },
    unitNumbers: [],
    designId: null,
    paletteId: null,
    packageId: null,
    fitout: false,
    smartId: null,
    kitchenId: null, kitchenPaletteId: null, kitchenScope: "cabinets", kitchenAddons: [],
    acId: null, acAddons: [], flooring: {},   // { zoneId: { finishId, sizeId } } — empty = all standard
    layoutIds: [],                            // chosen layout options (one per area) — empty = as designed
    opsId: null,
    rate: null,
    occ: null,
    years: 5,
    skip: {},  // per-feature skip choices (only honored where project.optional allows)
  });
  const [stepIdx, setStepIdx] = useState(() => viewOrder ? Math.max(0, buildSteps(project).length - 1) : 0);
  React.useEffect(() => { if (!viewOrder && window.RevnuSupport) window.RevnuSupport.firstRun("sales"); }, []);
  // The order reference is issued by the server (monotonic, never reused) as soon as the wizard opens.
  React.useEffect(() => {
    if (viewOrder) return;
    let alive = true;
    D.reserveOrderId().then((id) => { if (alive) setOrder((o) => (o.id ? o : { ...o, id })); }).catch((e) => { if (window.RevnuSupport) window.RevnuSupport.fail(e); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upd     = (patch) => setOrder((o) => ({ ...o, ...patch }));
  // Browser autofill can hand us non-string values; normalise everything except booleans so .trim()/regex never throw.
  const updCust = (patch) => setOrder((o) => ({ ...o, customer: { ...o.customer, ...Object.fromEntries(Object.entries(patch || {}).map(([k, v]) => [k, typeof v === "boolean" ? v : (v == null ? "" : String(v))])) } }));
  const opt     = project.optional || {};
  const skip    = order.skip || {};
  const skipFurnishing = !!((opt.furnishing || readOnly) && skip.furnishing);
  const skipSmart      = !!((opt.smartHome  || readOnly) && skip.smartHome);
  const skipOps        = !!((opt.operations || readOnly) && skip.operations);
  const kitchensOn     = !!(project.features && project.features.kitchens);
  const skipKitchen    = !kitchensOn || !!((opt.kitchens || readOnly) && skip.kitchens);
  const coolingOn      = !!(project.features && project.features.cooling);
  const skipCooling    = !coolingOn || !!((opt.cooling || readOnly) && skip.cooling);
  const flooringOn     = !!(project.features && project.features.flooring);
  const skipFlooring   = !flooringOn || !!((opt.flooring || readOnly) && skip.flooring);
  const layoutOn       = !!(project.features && project.features.layout);
  const skipLayout     = !layoutOn || !!((opt.layout || readOnly) && skip.layout);
  const setSkip = (feature, val) => setOrder((o) => ({ ...o, skip: { ...o.skip, [feature]: val } }));

  const isBen   = !!(order.customer && order.customer.beneficiary);
  const units   = (order.unitNumbers || []).map((n) => D.unitByNumber(n, isBen)).filter(Boolean);
  const unit    = units[0] || null; // primary — drives floor plan, calculator
  const nUnits  = units.length;
  // ---- per-unit configuration (multi-unit deals) ----
  const perMode  = nUnits > 1 && !!order.perUnitMode;
  const baseCfg  = { designId: order.designId, paletteId: order.paletteId, packageId: order.packageId, smartId: order.smartId, fitout: order.fitout, opsId: order.opsId, kitchenId: order.kitchenId, kitchenPaletteId: order.kitchenPaletteId, kitchenScope: order.kitchenScope || "cabinets", kitchenAddons: order.kitchenAddons || [], acId: order.acId, acAddons: order.acAddons || [], flooring: order.flooring || {}, layoutIds: order.layoutIds || [] };
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
  const kitchen = skipKitchen ? null : (P.kitchens || []).find((k) => k.id === primaryCfg.kitchenId);
  const ac      = skipCooling ? null : (P.ac || []).find((a) => a.id === primaryCfg.acId);
  const ops     = skipOps ? null : P.ops.find((o) => o.id === primaryCfg.opsId);
  const opsView = skipOps ? null : P.ops.find((o) => o.id === view.opsId);
  // per-unit operating rows (unit · model · our economics on that unit's price)
  const opsRows = skipOps ? [] : unitCfgs.map(({ u, c }) => { const m = P.ops.find((o) => o.id === c.opsId) || null; const e = m ? D.opsEconomics(m, u, u.price) : null; return { unit: u, ops: m, ec: e }; });
  const opsMixed = opsRows.length > 1 && opsRows.some((r) => (r.ops && r.ops.id) !== (opsRows[0].ops && opsRows[0].ops.id));
  const opsAny   = opsRows.some((r) => !!r.ops);
  const pkgView = skipFurnishing ? null : P.packages.find((p) => p.id === view.packageId);

  const baseFurnish   = skipFurnishing ? 0 : unitCfgs.reduce((a, { u, c }) => { const pk = P.packages.find((p) => p.id === c.packageId); return a + (pk ? (pk.pricing[u.typeId] || 0) : 0); }, 0);
  const smartUplift   = skipSmart ? 0 : unitCfgs.reduce((a, { u, c }) => { const sm = P.smart.find((x) => x.id === c.smartId); return a + (sm ? (sm.price || 0) : 0); }, 0);
  const kitchenUplift = skipKitchen ? 0 : unitCfgs.reduce((a, { u, c }) => { const k = (P.kitchens || []).find((x) => x.id === c.kitchenId); return a + D.kitchenTotalPrice(k, c.kitchenScope, u.typeId, c.kitchenAddons); }, 0);
  const kitchenTotal  = D.withVat(kitchenUplift);
  const acUplift      = skipCooling ? 0 : unitCfgs.reduce((a, { u, c }) => { const x = (P.ac || []).find((y) => y.id === c.acId); return a + D.acTotalPrice(x, project.id, u.typeId, c.acAddons); }, 0);
  const acTotal       = D.withVat(acUplift);
  const flooringUplift = skipFlooring ? 0 : unitCfgs.reduce((a, { u, c }) => a + D.flooringPrice(project.id, u.typeId, c.flooring), 0);
  const flooringTotal  = D.withVat(flooringUplift);
  const flooringN      = skipFlooring ? 0 : unitCfgs.reduce((a, { u, c }) => a + D.flooringUpgraded(project.id, u.typeId, c.flooring).length, 0);
  const layoutUplift   = skipLayout ? 0 : unitCfgs.reduce((a, { u, c }) => a + D.layoutTotal(project, u.typeId, c.layoutIds), 0);
  const layoutTotal    = D.withVat(layoutUplift);
  const layoutN        = skipLayout ? 0 : unitCfgs.reduce((a, { u, c }) => a + D.layoutChosen(project.id, u.typeId, c.layoutIds).length, 0);
  const fitoutAvail   = !!(project.features?.fitout && pkgView?.fitout && nUnits);
  const fitoutPerUnit = fitoutAvail ? D.boqTotal(pkgView.fitout.boq) : 0;
  const fitoutPrice   = perMode ? fitoutPerUnit : fitoutPerUnit * nUnits;   // the offer shown on the package step
  const fitoutPriceOn = !project.features?.fitout ? 0 : unitCfgs.reduce((a, { u, c }) => { const pk = P.packages.find((p) => p.id === c.packageId); return a + ((pk && pk.fitout && c.fitout) ? D.boqTotal(pk.fitout.boq) : 0); }, 0);
  const fitoutOn      = fitoutPriceOn > 0;
  const furnishPretax = baseFurnish + smartUplift + fitoutPriceOn + kitchenUplift + acUplift + flooringUplift + layoutUplift;
  const fitoutTotal   = fitoutOn ? D.withVat(fitoutPriceOn) : 0;
  const furnishTotal  = D.withVat(baseFurnish + smartUplift) + fitoutTotal + kitchenTotal + acTotal + flooringTotal + layoutTotal;   // VAT per line; = furnishPretax incl. VAT
  // per-unit rows for the agreement (package / design / smart / fit-out per unit, incl. VAT)
  const perUnitRows   = unitCfgs.map(({ u, c }) => { const pk = skipFurnishing ? null : P.packages.find((p) => p.id === c.packageId); const ds = skipFurnishing ? null : P.designs.find((d) => d.id === c.designId); const sm = skipSmart ? null : P.smart.find((x) => x.id === c.smartId); const kt = skipKitchen ? null : ((P.kitchens || []).find((x) => x.id === c.kitchenId) || null); const ktPrice = kt ? D.kitchenTotalPrice(kt, c.kitchenScope, u.typeId, c.kitchenAddons) : 0; const acS = skipCooling ? null : ((P.ac || []).find((x) => x.id === c.acId) || null); const acP = acS ? D.acTotalPrice(acS, project.id, u.typeId, c.acAddons) : 0; const flL = skipFlooring ? [] : D.flooringLines(project.id, u.typeId, c.flooring); const flP = flL.reduce((s2, l) => s2 + l.amount, 0); const layC = skipLayout ? [] : D.layoutChosen(project.id, u.typeId, c.layoutIds); const layP = layC.reduce((s2, o) => s2 + D.layoutPrice(o, project), 0); const fo = !!(project.features?.fitout && pk && pk.fitout && c.fitout); const pre = (pk ? (pk.pricing[u.typeId] || 0) : 0) + (sm ? (sm.price || 0) : 0) + (fo ? D.boqTotal(pk.fitout.boq) : 0) + ktPrice + acP + flP + layP; return { unit: u, pkg: pk, design: ds, palette: ds ? D.designPaletteById(ds, c.paletteId) : null, smart: sm, kitchen: kt, kitchenPalette: kt ? D.kitchenPaletteById(kt, c.kitchenPaletteId) : null, kitchenScope: kt ? D.kitchenScopeById(c.kitchenScope) : null, kitchenAddons: kt ? D.kitchenAddonsChosen(kt, c.kitchenScope, c.kitchenAddons) : [], kitchenPrice: D.withVat(ktPrice), ac: acS, acAddons: acS ? D.acAddonsChosen(acS, c.acAddons) : [], acPrice: D.withVat(acP), acPoints: acS ? D.coolingPointsFor(project.id, u.typeId) : [], flooring: flL, flooringUp: flL.filter((l) => l.finish), flooringPrice: D.withVat(flP), layout: layC, layoutPrice: D.withVat(layP), fitout: fo, furnish: D.withVatSum(pre - ktPrice - acP - flP - layP - (fo ? D.boqTotal(pk.fitout.boq) : 0), fo ? D.boqTotal(pk.fitout.boq) : 0, ktPrice, acP, flP, layP), ops: skipOps ? null : (P.ops.find((o) => o.id === c.opsId) || null) }; });
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

  const ctx = { T, P, developer, project, order, upd, updCust, unit, units, nUnits, design, pkg, smart, kitchen, kitchenUplift, kitchenTotal, skipKitchen, ac, acUplift, acTotal, skipCooling, flooringUplift, flooringTotal, flooringN, skipFlooring, layoutUplift, layoutTotal, layoutN, skipLayout, stepNo: STEPS[stepIdx] ? STEPS[stepIdx].n : "", ops, me, isBen,
                perMode, setPerMode, editUnit, setEditUnit, editUnitObj, view, setCfg, unitCfgs, perUnitRows, pkgView, readOnly, viewOrder, opsView, opsRows, opsMixed, opsAny, econFor,
                baseFurnish, smartUplift, furnishPretax, furnishTotal, totalPrice, unitsPrice,
                fitoutAvail, fitoutPrice, fitoutOn, fitoutTotal, furnishOnlyTotal,
                isDaily, rate, occ, annualGross, annualNet, operatorFee, grossYield, roi, our,
                opt, skip, skipFurnishing, skipSmart, skipOps, setSkip };

  const currentStep = STEPS[stepIdx];
  const canAdvance = (() => {
    const id = currentStep.id;
    if (id === "customer") { const c = order.customer || {}; return !!String(c.fullName || "").trim() && (!c.nationalId || D.VALID.nationalId(c.nationalId)) && (!c.mobile || D.VALID.mobileIntl(c.mobileCode, c.mobile)) && (!c.email || D.VALID.email(c.email)); }
    if (id === "unit")     return (order.unitNumbers || []).length > 0;
    if (id === "design")   return skipFurnishing || unitCfgs.every(({ c }) => !!c.designId);
    if (id === "package")  return skipFurnishing || unitCfgs.every(({ u, c }) => { const pk = P.packages.find((p) => p.id === c.packageId); return !!(pk && (pk.pricing[u.typeId] || 0) > 0); });
    if (id === "smart")    return skipSmart || unitCfgs.every(({ c }) => !!c.smartId);
    if (id === "kitchen")  return skipKitchen || unitCfgs.every(({ u, c }) => { const k = (P.kitchens || []).find((x) => x.id === c.kitchenId); return !!k && D.kitchenPrice(k, c.kitchenScope, u.typeId) > 0; });
    if (id === "cooling")  return skipCooling || unitCfgs.every(({ u, c }) => { const a = (P.ac || []).find((x) => x.id === c.acId); return !!a && D.acPrice(a, project.id, u.typeId) > 0; });
    if (id === "flooring") return true; // keeping the standard finish is a valid choice
    if (id === "layout")   return true; // "as designed" is a valid choice
    if (id === "operate")  return skipOps || unitCfgs.every(({ c }) => !!c.opsId);
    return true;
  })();

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signing, setSigning] = useState(null);   // signing link + QR shown after the order is issued (the buyer signs on their own phone)
  const submitOrder = async () => {
    if (submitted || submitting || !order.id) return;
    setSubmitting(true);
    const AR = window.I18N && window.I18N.isAR;
    try {
      const created = await D.createOrder({
        id: order.id,
        perUnitMode: perMode, perUnit: perMode ? order.perUnit : null,
        developerId: developer.id, projectId: project.id,
        unitNumbers: order.unitNumbers,
        customerName: order.customer.fullName,
        customerId: order.customer.nationalId,
        customerEmail: order.customer.email,
        packageId: skipFurnishing ? null : primaryCfg.packageId, designId: skipFurnishing ? null : primaryCfg.designId, paletteId: skipFurnishing ? null : primaryCfg.paletteId, smartId: skipSmart ? null : primaryCfg.smartId,
        opsId: skipOps ? null : primaryCfg.opsId,
        kitchenId: skipKitchen ? null : primaryCfg.kitchenId, kitchenPaletteId: skipKitchen ? null : primaryCfg.kitchenPaletteId, kitchenScope: skipKitchen ? null : (primaryCfg.kitchenScope || "cabinets"), kitchenAddons: skipKitchen ? [] : (primaryCfg.kitchenAddons || []), kitchenCost: kitchenTotal,
        acId: skipCooling ? null : primaryCfg.acId, acAddons: skipCooling ? [] : (primaryCfg.acAddons || []), acCost: acTotal,
        flooring: skipFlooring ? null : (primaryCfg.flooring || {}), flooringCost: flooringTotal,
        layoutIds: skipLayout ? [] : (primaryCfg.layoutIds || []), layoutCost: layoutTotal,
        fitout: !!fitoutOn, fitoutCost: fitoutTotal,
        customer: order.customer, repId: me?.id,
        unitPrice: unitsPrice, furnishCost: furnishTotal,
        operatorFee: ops ? ops.mgmtFee : 0,
        monthlyNet: our && our.annualNet ? Math.round(our.annualNet / 12) : 0,
        agreement: D.agreementSnapshot(developer.id),
        status: "issued",
      });
      try { setSigning(await R.createSigningLink(created.id, "qr", me)); } catch (e2) { /* the order exists; the signing link can be created from the deal */ }
      setSubmitted(true);
    } catch (e) {
      const msg = e && e.friendly ? e.friendly(AR) : (AR ? "تعذر إنشاء الطلب. حاول مرة أخرى." : "Could not create the order. Please try again.");
      if (window.RevnuSupport) window.RevnuSupport.toast(msg, "err"); else alert(msg);
      if (e && e.code === "UNIT_TAKEN") { await D.refresh(D.ORDER_KEYS).catch(() => {}); setStepIdx(STEPS.findIndex((st) => st.id === "unit")); }
    } finally {
      setSubmitting(false);
    }
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
      case "layout":   return <StepLayout   {...ctx} />;
      case "flooring": return <StepFlooring {...ctx} />;
      case "kitchen":  return <StepKitchen  {...ctx} />;
      case "cooling":  return <StepCooling  {...ctx} />;
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
          <span className="chip chip-mono">{window.I18N && window.I18N.isAR ? "طلب" : "ORDER"} #{order.id || "…"}</span>
          {onSwitch && <button className="btn btn-ghost btn-sm" onClick={onSwitch} title={window.I18N && window.I18N.isAR ? "تبديل المشروع" : "Switch project"}>{window.I18N && window.I18N.isAR ? "تبديل المشروع" : "Switch project"}</button>}
          {!readOnly && window.RevnuSupport && <window.RevnuSupport.SupportButtons portal="sales" />}
          {readOnly ? <span className="chip">{isRevnuStaff && !(sessionUser && sessionUser.developerId === developer.id) ? (window.I18N && window.I18N.isAR ? "معاينة · إدارة Revnu" : "Preview · Revnu admin") : (window.I18N && window.I18N.isAR ? "معاينة" : "Preview")}</span> : <UserMenu />}
        </div>
      </header>

      {readOnly && (
        <div style={{ background: "var(--brand-soft)", borderBottom: "1px solid var(--line)", padding: "8px 18px", fontSize: 12.5, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip">{window.I18N && window.I18N.isAR ? (D.ORDER_STATUS_META[viewOrder.status]?.ar || viewOrder.status) : (D.ORDER_STATUS_META[viewOrder.status]?.en || viewOrder.status)}</span>
          <strong>{window.I18N && window.I18N.isAR ? "عرض الاتفاقية لطلب مسجل" : "Viewing the agreement of a recorded order"}</strong>
          <span className="soft">{window.I18N && window.I18N.isAR ? "للقراءة فقط — استخدم أزرار Word أو PDF أدناه للتنزيل." : "Read-only — use the Word / PDF buttons below to download."}</span>
          {viewOrder.signedContractUrl && <span className="chip chip-positive">{window.I18N && window.I18N.isAR ? "✓ العقد الموقع: " : "✓ Signed: "}{viewOrder.signedContractUrl}</span>}
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
        {layoutN > 0 && <span className="ctx-tag"><span className="k">{window.I18N && window.I18N.isAR ? "المخطط" : "Layout"}</span><span className="v">{layoutN} {window.I18N && window.I18N.isAR ? "تعديلات" : (layoutN === 1 ? "change" : "changes")}</span></span>}
        {flooringN > 0 && <span className="ctx-tag"><span className="k">{window.I18N && window.I18N.isAR ? "الأرضيات" : "Floors"}</span><span className="v">{flooringN} {window.I18N && window.I18N.isAR ? "مناطق مرقاة" : (flooringN === 1 ? "zone upgraded" : "zones upgraded")}</span></span>}
        {kitchen && <span className="ctx-tag"><span className="k">{window.I18N && window.I18N.isAR ? "المطبخ" : "Kitchen"}</span><span className="v">{TX(kitchen, "name")}</span></span>}
        {ac && <span className="ctx-tag"><span className="k">{window.I18N && window.I18N.isAR ? "التكييف" : "AC"}</span><span className="v">{ac.brand} {TX(ac, "name")}</span></span>}
        {ops && <span className="ctx-tag"><span className="k">{window.I18N && window.I18N.isAR ? "التشغيل" : "Operate"}</span><span className="v">{TX(ops, "name")}</span></span>}
      </div>}

      <main className="step-area">
        {submitted ? (
          <div className="card card-pad-lg" style={{ maxWidth: 640, margin: "40px auto", textAlign: "center", padding: "56px 28px" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(76,175,136,0.14)", color: "var(--positive)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4.5 4.5L19 7"/></svg>
            </div>
            <div className="display-md" style={{ marginBottom: 8 }}>{window.I18N && window.I18N.isAR ? "صدرت الاتفاقية — بانتظار توقيع المشتري" : "Agreement issued — awaiting the buyer's signature"}</div>
            <div className="chip chip-mono" style={{ marginBottom: 12 }}>{order.id}</div>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 440, margin: "0 auto" }}>
              {window.I18N && window.I18N.isAR ? ("صدرت الاتفاقية موقعة ومختومة مسبقا من " + developer.name + ". يقرأها " + (order.customer.fullName || "المشتري") + " ويوقعها على جواله — اعرض الرمز أو أرسل الرابط.") : ("The agreement was issued, pre-signed and stamped by " + developer.name + ". " + (order.customer.fullName || "The buyer") + " reads and signs it on their own phone — show the QR or send the link.")}
            </p>
            {signing && <div style={{ textAlign: "start", marginTop: 18 }}><SigningCard order={D.ORDERS.find((o) => o.id === order.id) || order} link={signing} developer={developer} project={project} rep={me} onRegenerate={() => R.createSigningLink(order.id, "qr", me).then(setSigning, (e) => alert(e && e.friendly ? e.friendly(!!(window.I18N && window.I18N.isAR)) : String(e && e.message)))} /></div>}
            <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 22 }}>
              <a className="btn btn-primary" href={dealsHref || homeHref}>{window.I18N && window.I18N.isAR ? "افتح صفقاتي ←" : "Open my deals →"}</a>
              <button className="btn btn-secondary" onClick={() => location.reload()}>{window.I18N && window.I18N.isAR ? "بدء طلب جديد" : "Start a new order"}</button>
            </div>
          </div>
        ) : <StepBoundary key={currentStep.id}>{renderStep()}</StepBoundary>}
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
          <button className={"btn btn-primary" + (submitting ? " is-busy" : "")} onClick={submitOrder} disabled={submitted || submitting || !order.id}><I.pen width={14} height={14} /> {submitted ? (window.I18N && window.I18N.isAR ? "صدرت ✓" : "Issued ✓") : (window.I18N && window.I18N.isAR ? "إصدار الاتفاقية ورابط التوقيع" : "Issue agreement & signing link")}</button>
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
        kicker={AR ? `تلتقط مرة واحدة وتطبع في اتفاقية الشراء والاستثمار — وهي بين المشتري و${developer.name}.` : `Captured once and printed into the Purchase & Investment Agreement — which is between the buyer and ${developer.name}.`} />
      <div className="card card-pad-lg" style={{ maxWidth: 920 }}>
        <div className="field-grid">
          <Field label={AR ? "الاسم الكامل · كما في الهوية" : "Full name · as in ID"} name="name" autoComplete="name" value={c.fullName} onChange={(v) => updCust({ fullName: v })} placeholder={AR ? "فيصل المنصوري" : "Faisal Al-Mansouri"} />
          <Field label={AR ? "الهوية الوطنية / الإقامة" : "National ID / Iqama"} name="national-id" autoComplete="off" value={c.nationalId} onChange={(v) => updCust({ nationalId: v })} placeholder="1078412884" mono error={c.nationalId && !D.VALID.nationalId(c.nationalId) ? (AR ? "10 أرقام تبدأ ب 1 أو 2" : "10 digits, starting with 1 or 2") : ""} />
          <PhoneField code={c.mobileCode || "+966"} value={c.mobile || ""} onCode={(v) => updCust({ mobileCode: v })} onChange={(v) => updCust({ mobile: v })} />
          <EmailField value={c.email || ""} onChange={(v) => updCust({ email: v })} />
          <Field label={AR ? "المدينة" : "City"} name="city" autoComplete="address-level2" value={c.city} onChange={(v) => updCust({ city: v })} />
          <FieldChips label={AR ? "مصدر التمويل" : "Source of funds"} full value={c.funding} onChange={(v) => updCust({ funding: v })}
            options={[{ id: "cash", label: AR ? "نقد" : "Cash" }, { id: "mortgage", label: AR ? "تمويل عقاري" : "Mortgage" }, { id: "mixed", label: AR ? "مختلط" : "Mixed" }, { id: "company", label: AR ? "شركة / كيان" : "Corporate / SPV" }]} />
          <div className="field full">
            <label>{AR ? "فئة المشتري · تحدد سعر الوحدة المعتمد في دراسة العائد" : "Buyer category · sets the unit price used in the return study"}</label>
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
          <span>{AR ? `تبقى بيانات المشتري داخل حساب ${developer.name} ولا تشارك مع أطراف أخرى.` : `Buyer data stays inside ${developer.name}'s tenant. Saudi PDPL compliant.`}</span>
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
                    <div className="soft" style={{ fontSize: 11 }}>{t?.bedrooms} {window.I18N && window.I18N.isAR ? "غرفة ·" : "bed ·"} {t?.baths} {window.I18N && window.I18N.isAR ? "حمام" : "bath"}</div>
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
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 36, color: "var(--text-soft)" }}>{window.I18N && window.I18N.isAR ? "لا توجد وحدات مطابقة. وسع الفلاتر." : "No units match. Widen the filters."}</td></tr>
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
            <div className="soft" style={{ fontSize: 12, marginTop: 2 }}>{t?.bedrooms} {window.I18N && window.I18N.isAR ? "غرفة ·" : "bed ·"} {t?.baths} {window.I18N && window.I18N.isAR ? "حمام" : "bath"} · {u.area || t?.area} m² · {u.tower}, {floorLabel}{u.view ? " · " + u.view : ""}</div>
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
                  ? ((levels > 1 ? "منزل من طابقين — يربط بينهما درج داخلي. " : (plans.length > 1 ? "عدة موديلات لهذا النوع — يحدد الموديل النهائي عند التعاقد. " : "")) + (plans.length ? "مخطط استرشادي — يرجى الرجوع إلى الرسومات المعمارية النهائية." : "مخطط تخطيطي · استرشادي فقط · ليس بمقياس البناء.") + " يشكل الملحق (أ) من الاتفاقية.")
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
        kicker={window.I18N && window.I18N.isAR ? `منسقة من ${developer.name} لهذا المشروع. السعر نفسه — الأمر يتعلق بالإحساس والطابع فقط.` : `Curated by ${developer.name} for this project. Pricing is the same; this is purely about feel.`} />
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
                    <div className="soft" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>{AR ? (d.paletteNoteAr || d.paletteNote || "لوحة الألوان تغير الإكسسوارات والمخدات والسجاد والمفارش واللوحات — ويبقى الأثاث كما هو.") : (d.paletteNote || "The palette changes the accessories, cushions, rugs, bedding and wall art — the furniture stays the same.")}</div>
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
                  <span className="sig-chip">✦ {AR ? "إصدار موقع" : "Signature edition"}</span>
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
                {view.fitout ? (AR ? "✓ أضيف إلى الباقة" : "✓ Added to package") : (AR ? "+ إضافة التجهيز" : "+ Add fit-out")}
              </button>
            </div>
          </div>
          <div className="row" style={{ gap: 18, marginTop: 14, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span>{(pkg.fitout.boq || []).length} {AR ? "بند جدول كميات" : "BOQ lines"}</span>
            {pkg.fitout.warranty ? <span>{AR ? "ضمان " + pkg.fitout.warranty + " سنوات على التشطيبات" : pkg.fitout.warranty + "-year warranty on finishes"}</span> : null}
            <span>{AR ? "يسلم قبل الأثاث · جزء من جدول التأثيث" : "Delivered before furniture · part of the Furnishing Schedule"}</span>
          </div>
          {(pkg.fitout.boq || []).length > 0 && (
            <details style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
              <summary style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-soft)", cursor: "default" }}>{AR ? "// معاينة جدول كميات التشطيب · الملحق F-2 · مفصل" : "// Preview fit-out BOQ · Appendix F-2 · itemised"}</summary>
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
        kicker={AR ? "أضف أقفالا ذكية وتحكما بالمناخ والإضاءة والصوت. كل باقة حزمة بسعر ثابت، مركبة بالكامل ومضمونة." : "Add smart locks, climate, lighting and audio. Each tier is a fixed-price kit, fully wrapped and warrantied."} />
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
                <div className="price">{s.price === 0 ? (AR ? "مضمن" : "Included") : "+" + D.fmtSAR(s.price)}{s.price !== 0 && <span className="u"> SAR</span>}</div>
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

/* =================================================================
   STEP — Layout changes (project.features.layout)
   Curated, pre-approved options per unit type; one choice per area ("as designed" is always free).
   Price = flat override or wall m × rate + doors × door price. Locked after project.layoutDeadline.
================================================================= */
function StepLayout(ctx) {
  const { P, project, opt, skipLayout, setSkip, view, setCfg: setCfgRaw, editUnitObj, unit, perMode, units, stepNo, readOnly } = ctx;
  const AR = window.I18N && window.I18N.isAR;
  const u = editUnitObj || unit;
  const single = perMode || !units || units.length < 2;
  const scope = single ? (u ? [u] : []) : units;
  const locked = !readOnly && !D.deadlineOpen(project, "layout");
  const setCfg = (patch) => { if (!locked) setCfgRaw(patch); };
  const ids = view.layoutIds || [];
  const areas = u ? D.layoutAreas(project.id, u.typeId) : [];
  const nm = (o, k) => (AR && o && o[k + "Ar"]) ? o[k + "Ar"] : (o ? (o[k] || "") : "");
  const chosenIn = (area) => area.options.find((o) => ids.includes(o.id)) || null;
  const pick = (area, o) => { const rest = ids.filter((id) => !area.options.some((x) => x.id === id)); setCfg({ layoutIds: o ? [...rest, o.id] : rest }); };
  const total = scope.reduce((sum, x) => sum + D.layoutTotal(project, x.typeId, ids), 0);
  const chosen = u ? D.layoutChosen(project.id, u.typeId, ids) : [];
  const rooms = u ? D.layoutRoomsAfter(project.id, u.typeId, ids, AR) : "";
  const Img = ({ src, label }) => <div style={{ aspectRatio: "4/3", borderRadius: 8, background: src ? "url(" + src + ") center/cover" : "repeating-linear-gradient(45deg, var(--bg-sunken) 0 8px, var(--bg-tint) 8px 16px)", border: "1px solid var(--line)", display: "flex", alignItems: "flex-end", padding: 6 }}><span className="chip chip-soft" style={{ fontSize: 10 }}>{label}</span></div>;
  return (
    <>
      <StepHead n={stepNo || "05"} eye={AR ? "المخطط" : "LAYOUT"} title={AR ? "عدل المخطط الداخلي" : "Adjust the internal layout"}
        kicker={AR ? "خيارات معتمدة مسبقا لكل نوع وحدة: أغلق المطبخ، افصل المجلس، أو حول غرفة إلى صالة عائلية. «كما في التصميم» مجاني دائما، وكل تعديل مسعر ويطبع في الاتفاقية."
                   : "Pre-approved options for this unit type: close the kitchen, separate the majlis, or turn a bedroom into a family living. “As designed” is always free; every change is priced and printed in the agreement."} />
      <DeadlineBar project={project} feature="layout" />
      {opt.layout && !locked && <OptionalBanner feature="layout" label="Layout" skipped={skipLayout} setSkip={setSkip} />}
      {!skipLayout && <UnitConfigBar {...ctx} doneKey="layoutIds" />}
      {skipLayout ? <SkippedBody label="Layout" /> : areas.length === 0 ? (
        <div className="card card-pad soft" style={{ fontSize: 12.5 }}>{AR ? "لا توجد خيارات مخطط لهذا النوع بعد — يضيفها مسؤول Revnu من مساحة عمل المشروع." : "No layout options for this unit type yet — Revnu admin adds them in the project workspace."}</div>
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {areas.map((area) => { const cur = chosenIn(area); return (
            <div key={area.key} className="card card-pad" style={{ opacity: locked ? 0.75 : 1 }}>
              <div className="row-between" style={{ marginBottom: 10 }}><div className="eyebrow" style={{ fontSize: 10 }}>// {AR ? area.nameAr : area.name}</div>{cur ? <span className="chip">{AR ? "معدل" : "Changed"}</span> : <span className="chip chip-soft">{AR ? "كما في التصميم" : "As designed"}</span>}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                <div className={"opt " + (!cur ? "selected" : "")} style={{ padding: 12, cursor: locked ? "not-allowed" : "pointer" }} onClick={() => pick(area, null)}>
                  <Img src={area.options[0].before} label={AR ? "قبل" : "BEFORE"} />
                  <div className="opt-head" style={{ marginTop: 10 }}><h3 style={{ fontSize: 14 }}>{AR ? area.asDesignedAr : area.asDesigned}</h3><div className="price" style={{ fontSize: 13 }}>{AR ? "مضمن" : "Included"}</div></div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{AR ? "المخطط كما هو معتمد — دون تكلفة." : "The plan as approved — no charge."}</div>
                </div>
                {area.options.map((o) => { const on = !!(cur && cur.id === o.id); const price = D.layoutPrice(o, project); const works = (AR && o.worksAr && o.worksAr.length) ? o.worksAr : (o.works || []); return (
                  <div key={o.id} className={"opt " + (on ? "selected" : "")} style={{ padding: 12, cursor: locked ? "not-allowed" : "pointer" }} onClick={() => pick(area, on ? null : o)}>
                    <Img src={o.after} label={AR ? "بعد" : "AFTER"} />
                    <div className="opt-head" style={{ marginTop: 10 }}><h3 style={{ fontSize: 14 }}>{nm(o, "name")}</h3><div className="price" style={{ fontSize: 13 }}>{price ? "+" + D.fmtSAR(price) : (AR ? "بدون تكلفة" : "No charge")}{price ? <span className="u"> SAR</span> : null}</div></div>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 6 }}><span className="chip chip-soft" style={{ fontSize: 10.5 }}>{o.kind === "remove" ? (AR ? "إزالة جدار" : "Wall removed") : (AR ? "إضافة جدار" : "Wall added")}{o.wallM ? " · " + o.wallM + " m" : ""}{o.doors ? " · " + o.doors + (AR ? " باب" : (o.doors > 1 ? " doors" : " door")) : ""}</span>{nm(o, "roomsAfter") ? <span className="chip chip-soft" style={{ fontSize: 10.5 }}>→ {nm(o, "roomsAfter")}</span> : null}</div>
                    {nm(o, "summary") ? <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-muted)" }}>{nm(o, "summary")}</p> : null}
                    <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12 }}>{works.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  </div>); })}
              </div>
            </div>); })}
        </div>
        <div className="card card-pad" style={{ position: "sticky", top: 12 }}>
          <div className="row-between" style={{ marginBottom: 8, gap: 8 }}><div className="eyebrow" style={{ fontSize: 10 }}>{AR ? "// مخطط الوحدة" : "// YOUR LAYOUT"}</div><span className="chip chip-soft">{chosen.length ? chosen.length + (AR ? " تعديلات" : (chosen.length === 1 ? " change" : " changes")) : (AR ? "كما في التصميم" : "As designed")}</span></div>
          {chosen.length === 0 ? <div className="soft" style={{ fontSize: 12.5 }}>{AR ? "لم يختر أي تعديل — تسلم الوحدة كما في التصميم." : "No changes selected — the unit is delivered as designed."}</div> : (
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}><tbody>
              {chosen.map((o, i) => <tr key={o.id} style={{ borderTop: i ? "1px dotted var(--line)" : "none" }}><td style={{ padding: "7px 0" }}><div style={{ fontWeight: 600 }}>{nm(o, "name")}</div><div className="soft" style={{ fontSize: 11.5 }}>{AR ? (o.areaNameAr || o.areaName) : o.areaName}{nm(o, "roomsAfter") ? " · → " + nm(o, "roomsAfter") : ""}</div></td><td className="mono" style={{ textAlign: "end", whiteSpace: "nowrap", fontWeight: 600 }}>{D.layoutPrice(o, project) ? "+" + D.fmtSAR(D.layoutPrice(o, project)) : (AR ? "بدون تكلفة" : "No charge")}</td><td style={{ width: 24, textAlign: "end" }}>{!locked && <button type="button" className="btn btn-sm btn-ghost" style={{ padding: "0 6px", height: 22, minWidth: 0 }} onClick={() => setCfg({ layoutIds: ids.filter((id) => id !== o.id) })}>×</button>}</td></tr>)}
            </tbody></table>)}
          <div className="row-between" style={{ borderTop: "1.5px solid var(--text)", marginTop: 8, paddingTop: 8 }}>
            <strong>{AR ? "تعديلات المخطط" : "Layout changes"} <span className="soft" style={{ fontWeight: 400, fontSize: 11.5 }}>{AR ? "قبل الضريبة" : "excl. VAT"}{!single ? (AR ? " · كل الوحدات" : " · all units") : ""}</span></strong>
            <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{total ? "+" + D.fmtSAR(total) : "0"} <span className="u" style={{ fontSize: 11 }}>SAR</span></span>
          </div>
          {rooms ? <div style={{ fontSize: 12, marginTop: 8 }}><span className="soft">{AR ? "الغرف بعد التعديل: " : "Rooms after changes: "}</span><strong>{rooms}</strong></div> : null}
          <div className="soft" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>{AR ? "تعديلات معتمدة مسبقا على الجدران غير الحاملة فقط. تصبح نهائية بعد الموعد المحدد أعلاه." : "Pre-approved changes to non-load-bearing partitions only. Final after the deadline shown above."}</div>
        </div>
      </div>)}
    </>
  );
}
// Live countdown to a project's customisation deadline (layout / flooring). Nothing rendered when no date is set.
function DeadlineBar({ project, feature }) {
  const AR = window.I18N && window.I18N.isAR;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  const d = D.deadlineFor(project, feature); if (!d) return null;
  const ms = d.getTime() - now; const open = ms > 0; const abs = Math.abs(ms);
  const days = Math.floor(abs / 86400000), hrs = Math.floor((abs % 86400000) / 3600000), mins = Math.floor((abs % 3600000) / 60000);
  const urgent = open && ms < 7 * 86400000;
  const color = !open ? "#B23B3B" : urgent ? "#8A5A12" : "var(--brand-deep)";
  const label = feature === "layout" ? (AR ? "تعديلات المخطط" : "Layout changes") : (AR ? "تعديلات الأرضيات" : "Flooring changes");
  const dateTxt = d.toLocaleDateString(AR ? "ar-SA" : "en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const pad = (x) => String(x).padStart(2, "0");
  return (
    <div className="card" style={{ marginBottom: 14, padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: !open ? "rgba(232,84,84,0.10)" : urgent ? "rgba(232,167,78,0.16)" : "var(--brand-soft)", border: "1px solid var(--line)" }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color }}>{open ? (AR ? label + " تغلق خلال" : label + " close in") : (AR ? label + " أغلقت" : label + " closed")}</span>
      <span className="mono" style={{ fontSize: 15, fontWeight: 700, color, letterSpacing: "0.02em", direction: "ltr" }}>{open ? days + "d " + pad(hrs) + "h " + pad(mins) + "m" : days + "d"}</span>
      <span className="soft" style={{ fontSize: 12 }}>{open ? (AR ? "آخر موعد: " : "Deadline: ") : (AR ? "انتهى في: " : "Ended: ")}{dateTxt}</span>
      {!open && <span className="soft" style={{ fontSize: 12 }}>{AR ? "— الخيارات للعرض فقط؛ لا يمكن إضافة تعديلات بعد الآن." : "— options shown for reference only; no further changes can be made."}</span>}
    </div>
  );
}

/* =================================================================
   STEP — Flooring (project.features.flooring)
   Zones per unit type (m² + standard finish) × finish catalogue (family · size · uplift per m²).
   Pick a finish → tap zones (or a one-tap preset). Untouched zones stay standard at no cost.
   HQ enters SAR/m²; the rate is shown on screen only when project.flooringShowRate is on.
================================================================= */
function StepFlooring(ctx) {
  const { P, project, opt, skipFlooring, setSkip, view, setCfg: setCfgRaw, editUnitObj, unit, perMode, units, stepNo, readOnly } = ctx;
  const locked = !readOnly && !D.deadlineOpen(project, "flooring");   // after the project's flooring deadline the step is read-only
  const setCfg = (patch) => { if (!locked) setCfgRaw(patch); };
  const AR = window.I18N && window.I18N.isAR;
  const u = editUnitObj || unit;
  const single = perMode || !units || units.length < 2;
  const scope = single ? (u ? [u] : []) : units;
  const showRate = !!project.flooringShowRate;
  const sel = view.flooring || {};
  const finishes = (P.flooring || []).filter((f) => !f.standard);
  const families = D.FLOORING_FAMILIES.filter((fa) => finishes.some((f) => f.family === fa.id));
  const [family, setFamily] = useState(() => (families[0] ? families[0].id : "tile"));
  const [pick, setPick] = useState(() => { const f = finishes[0]; return { finishId: f ? f.id : null, sizeId: (f && f.sizes && f.sizes[0]) ? f.sizes[0].id : null }; });
  const picked = pick.finishId ? D.flooringById(pick.finishId) : null;
  const pickedSize = picked ? D.flooringSizeOf(picked, pick.sizeId) : null;
  const nm = (o, k) => (AR && o && o[k + "Ar"]) ? o[k + "Ar"] : (o ? (o[k] || "") : "");
  const zn = (meta) => (AR ? meta.ar : meta.en);
  // Zone rows = union across the units in scope (areas and amounts summed) so a mixed multi-unit deal prices correctly.
  const rows = (() => { const map = {}; scope.forEach((x) => D.flooringLines(project.id, x.typeId, sel).forEach((l) => { if (!map[l.zone]) map[l.zone] = Object.assign({}, l, { area: 0, amount: 0 }); map[l.zone].area += l.area; map[l.zone].amount += l.amount; })); return D.FLOORING_ZONE_TYPES.map((z) => map[z.id]).filter(Boolean); })();
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const upgradedN = rows.filter((r) => r.finish).length;
  const multiLevel = scope.some((x) => ((x.type || D.unitTypeById(x.typeId) || {}).levels || 1) > 1);
  const presets = D.FLOORING_PRESETS.filter((p) => !p.multiLevelOnly || multiLevel);
  const fits = (zoneId) => !!picked && D.flooringFits(picked, zoneId);
  const isOn = (zoneId) => { const x = sel[zoneId]; return !!(picked && x && x.finishId === picked.id && (x.sizeId || null) === (pick.sizeId || null)); };
  const setZones = (ids, on) => { const next = Object.assign({}, sel); ids.forEach((z) => { if (on) { if (picked && fits(z)) next[z] = { finishId: picked.id, sizeId: pick.sizeId }; } else delete next[z]; }); setCfg({ flooring: next }); };
  const toggleZone = (z) => setZones([z], !isOn(z));
  const applyPreset = (p) => setZones(rows.map((r) => r.zone).filter((z) => p.tag === "*" || (D.flooringZoneMeta(z).tags || []).includes(p.tag)), true);
  const choose = (f) => setPick({ finishId: f.id, sizeId: (f.sizes && f.sizes[0]) ? f.sizes[0].id : null });
  const Swatch = ({ f, size }) => <span style={{ width: size || 28, height: size || 28, borderRadius: 6, flex: "none", display: "inline-block", verticalAlign: "middle", background: f && f.image ? "url(" + f.image + ") center/cover" : ((f && f.swatch) || "#DDD"), border: "1px solid rgba(0,0,0,0.1)" }} />;
  const zonesTxt = (k) => AR ? k + " مناطق" : (k === 1 ? "1 zone" : k + " zones");
  return (
    <>
      <StepHead n={stepNo || "05"} eye={AR ? "الأرضيات" : "FLOORING"} title={AR ? "اختر الأرضيات" : "Choose the floors"}
        kicker={AR ? "تسلم الوحدة بالتشطيب القياسي دون أي تكلفة. لترقية منطقة، اختر خامة ومقاسا ثم انقر على المناطق أو استخدم اختصارا. ما لم تلمسه يبقى قياسيا، ويضاف السعر إلى الملحق ويطبع في الاتفاقية."
                   : "The unit comes with the standard finish at no cost. To upgrade a zone, pick a material and size, then tap the zones — or use a shortcut. Anything you don't touch stays standard; the price is added to the addendum and printed in the agreement."} />
      <DeadlineBar project={project} feature="flooring" />
      {opt.flooring && !locked && <OptionalBanner feature="flooring" label="Flooring" skipped={skipFlooring} setSkip={setSkip} />}
      {!skipFlooring && <UnitConfigBar {...ctx} doneKey="flooring" />}
      {skipFlooring ? <SkippedBody label="Flooring" /> : rows.length === 0 ? (
        <div className="card card-pad soft" style={{ fontSize: 12.5 }}>{AR ? "لم تحدد مناطق أرضيات لهذا النوع بعد — يضيفها مسؤول Revnu من مساحة عمل المشروع." : "No flooring zones defined for this unit type yet — Revnu admin adds them in the project workspace."}</div>
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, alignItems: "start" }}>
        <div className="card card-pad">
          <div className="row-between" style={{ marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>{AR ? "// ١ · اختر الخامة" : "// 1 · PICK A FINISH"}</div>
            {families.length > 1 && <div style={{ display: "inline-flex", border: "1px solid var(--line-strong)", borderRadius: 8, overflow: "hidden" }}>
              {families.map((fa) => <button key={fa.id} type="button" className="btn btn-sm" style={{ border: 0, borderRadius: 0, background: family === fa.id ? "var(--brand)" : "transparent", color: family === fa.id ? "var(--brand-text)" : "var(--text-muted)" }} onClick={() => setFamily(fa.id)}>{AR ? fa.ar : fa.en}</button>)}
            </div>}
          </div>
          {finishes.length === 0 ? <div className="soft" style={{ fontSize: 12.5 }}>{AR ? "لا توجد خامات ترقية لهذا المشروع بعد." : "No upgrade finishes for this project yet."}</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
            {finishes.filter((f) => f.family === family).map((f) => { const on = !!(picked && picked.id === f.id); const usedN = Object.keys(sel).filter((z) => sel[z] && sel[z].finishId === f.id && rows.some((r) => r.zone === z)).length; return (
              <div key={f.id} className={"opt " + (on ? "selected" : "")} style={{ padding: 0, overflow: "hidden" }} onClick={() => choose(f)}>
                <div style={{ height: 84, background: f.image ? "url(" + f.image + ") center/cover" : f.swatch }} />
                <div style={{ padding: "10px 12px" }}>
                  <div className="row-between" style={{ alignItems: "flex-start", gap: 8 }}><strong style={{ fontSize: 13.5, lineHeight: 1.3 }}>{nm(f, "name")}</strong>{usedN ? <span className="chip" style={{ fontSize: 10.5, flex: "none" }}>{zonesTxt(usedN)}</span> : null}</div>
                  {nm(f, "summary") ? <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 }}>{nm(f, "summary")}</div> : null}
                  <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {(f.sizes || []).map((sz) => { const szOn = on && pick.sizeId === sz.id; return (
                      <button key={sz.id} type="button" onClick={(e) => { e.stopPropagation(); setPick({ finishId: f.id, sizeId: sz.id }); }}
                        style={{ padding: "4px 9px", borderRadius: 999, fontSize: 11.5, cursor: "pointer", border: "1px solid " + (szOn ? "var(--brand)" : "var(--line-strong)"), background: szOn ? "var(--brand-soft)" : "var(--bg-card)", color: "var(--text)", fontWeight: szOn ? 600 : 500 }}>
                        {nm(sz, "label")}{showRate ? <span className="mono soft" style={{ marginInlineStart: 6 }}>+{D.fmtSAR(sz.uplift)}/m²</span> : null}
                      </button>); })}
                  </div>
                </div>
              </div>); })}
          </div>)}

          <div className="eyebrow" style={{ fontSize: 10, margin: "18px 0 8px" }}>{AR ? "// ٢ · طبق على المناطق" : "// 2 · APPLY TO ZONES"}</div>
          {picked ? <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8, fontSize: 12.5 }}><Swatch f={picked} size={18} /><span><strong>{nm(picked, "name")}</strong>{pickedSize ? " · " + nm(pickedSize, "label") : ""}</span><span className="soft">{AR ? "— انقر على المناطق أو اختصارا" : "— tap zones or a shortcut"}</span></div> : null}
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {presets.map((p) => <button key={p.id} type="button" className="btn btn-sm btn-secondary" disabled={!picked} title={AR ? p.hintAr : p.hint} onClick={() => applyPreset(p)}>{AR ? p.ar : p.en}</button>)}
            {upgradedN > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCfg({ flooring: {} })}>{AR ? "إعادة الكل إلى القياسي" : "Reset all to standard"}</button>}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {rows.map((r) => { const ok = fits(r.zone); const on = isOn(r.zone); const other = !!(r.finish && !on); return (
              <button key={r.zone} type="button" disabled={!ok} onClick={() => toggleZone(r.zone)} title={!ok ? (AR ? "غير متاح لهذه المنطقة" : "Not offered in this zone") : (AR ? zn(r.meta) : r.meta.en)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 999, whiteSpace: "nowrap", cursor: ok ? "pointer" : "not-allowed", opacity: ok ? 1 : 0.45, fontSize: 12, fontWeight: on ? 600 : 500, color: "var(--text)", border: "1px solid " + (on ? "var(--brand)" : "var(--line-strong)"), background: on ? "var(--brand-soft)" : "var(--bg-card)" }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, border: "1px solid " + (on ? "var(--brand)" : "var(--line-strong)"), background: on ? "var(--brand)" : "transparent", color: "var(--brand-text)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, lineHeight: 1 }}>{on ? "✓" : ""}</span>
                {zn(r.meta)} <span className="mono soft">{r.area} m²</span>{other ? <Swatch f={r.finish} size={12} /> : null}
              </button>); })}
          </div>
        </div>

        <div className="card card-pad" style={{ position: "sticky", top: 12 }}>
          <div className="row-between" style={{ marginBottom: 8, gap: 8 }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>{AR ? "// أرضيات الوحدة" : "// YOUR FLOORS"}</div>
            <span className="chip chip-soft">{upgradedN ? (AR ? upgradedN + " مناطق مرقاة" : (upgradedN === 1 ? "1 zone upgraded" : upgradedN + " zones upgraded")) : (AR ? "قياسي بالكامل · مضمن" : "All standard · included")}</span>
          </div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.zone} style={{ borderTop: i ? "1px dotted var(--line)" : "none" }}>
                  <td style={{ padding: "7px 0", width: 34 }}><Swatch f={r.finish || r.standard} size={26} /></td>
                  <td style={{ padding: "7px 6px" }}>
                    <div style={{ fontWeight: 600 }}>{zn(r.meta)} <span className="mono soft" style={{ fontWeight: 400 }}>{r.area} m²</span></div>
                    <div style={{ fontSize: 11.5, color: r.finish ? "var(--text)" : "var(--text-muted)" }}>{r.finish ? nm(r.finish, "name") + (r.size ? " · " + nm(r.size, "label") : "") : (r.standard ? nm(r.standard, "name") + " · " + nm(D.flooringSizeOf(r.standard) || {}, "label") : (AR ? "قياسي" : "Standard"))}{showRate && r.finish ? <span className="mono soft"> · +{D.fmtSAR(r.rate)}/m²</span> : null}</div>
                  </td>
                  <td className="mono" style={{ textAlign: "end", padding: "7px 0", whiteSpace: "nowrap", fontWeight: r.finish ? 600 : 400, color: r.finish ? "var(--text)" : "var(--text-soft)" }}>{r.finish ? "+" + D.fmtSAR(r.amount) : (AR ? "مضمن" : "Included")}</td>
                  <td style={{ width: 24, textAlign: "end" }}>{r.finish ? <button type="button" className="btn btn-sm btn-ghost" title={AR ? "العودة إلى القياسي" : "Back to standard"} onClick={() => setZones([r.zone], false)} style={{ padding: "0 6px", height: 22, minWidth: 0 }}>×</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row-between" style={{ borderTop: "1.5px solid var(--text)", marginTop: 8, paddingTop: 8 }}>
            <strong>{AR ? "ترقية الأرضيات" : "Flooring upgrade"} <span className="soft" style={{ fontWeight: 400, fontSize: 11.5 }}>{AR ? "قبل الضريبة" : "excl. VAT"}{!single ? (AR ? " · كل الوحدات" : " · all units") : ""}</span></strong>
            <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{total ? "+" + D.fmtSAR(total) : "0"} <span className="u" style={{ fontSize: 11 }}>SAR</span></span>
          </div>
          <div className="soft" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>{AR ? "المساحات اسمية حسب نوع الوحدة. تصبح الاختيارات نهائية بعد بدء أعمال الأرضيات في الوحدة." : "Areas are nominal per unit type. Selections are final once flooring works for the unit begin."}</div>
        </div>
      </div>
      )}
    </>
  );
}

/* =================================================================
   STEP — Kitchen (project.features.kitchens)
   3 designs × 3 palettes × scope (cabinets only | full with appliances)
================================================================= */
function StepKitchen(ctx) {
  const { P, opt, skipKitchen, setSkip, view, setCfg, editUnitObj, unit, perMode, units } = ctx;
  const AR = window.I18N && window.I18N.isAR;
  const list = P.kitchens || [];
  const u = editUnitObj || unit;
  const scope = view.kitchenScope || "cabinets";
  const priceFor = (k, sc) => perMode || !units || units.length < 2
    ? D.kitchenPrice(k, sc, u ? u.typeId : null)
    : units.reduce((a, x) => a + D.kitchenPrice(k, sc, x.typeId), 0);
  const nUnitsPriced = (perMode || !units || units.length < 2) ? 1 : units.length;
  const chosenAddons = view.kitchenAddons || [];
  const toggleAddon = (id) => setCfg({ kitchenAddons: chosenAddons.includes(id) ? chosenAddons.filter((x) => x !== id) : [...chosenAddons, id] });
  const inc = (k) => { const s = k.scopes && k.scopes[scope]; return s ? ((AR && s.includesAr && s.includesAr.length) ? s.includesAr : (s.includes || [])) : []; };
  return (
    <>
      <StepHead n="05" eye={AR ? "المطبخ" : "KITCHEN"} title={AR ? "اختر المطبخ" : "Choose the kitchen"}
        kicker={AR ? "ثلاثة تصاميم بلقطات ثلاثية الأبعاد وثلاث لوحات ألوان لكل تصميم. اختر «المطبخ فقط» للخزائن والأدراج، أو «مطبخ كامل» مع الثلاجة والفرن والموقد وغسالة الصحون وغسالة الملابس. السعر يضاف إلى الملحق ويظهر في الاتفاقية."
                   : "Three designs with 3D shots and three palettes each. Pick “Kitchen only” for cabinetry and drawers, or “Full kitchen” with fridge, oven, hob, dishwasher and washing machine. The price is added to the addendum and printed in the agreement."} />
      {opt.kitchens && <OptionalBanner feature="kitchens" label="Kitchen" skipped={skipKitchen} setSkip={setSkip} />}
      {!skipKitchen && <UnitConfigBar {...ctx} doneKey="kitchenId" />}
      {skipKitchen ? <SkippedBody label="Kitchen" /> : (
      <>
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>{AR ? "// النطاق" : "// SCOPE"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {D.KITCHEN_SCOPES.map((s) => {
              const on = scope === s.id;
              return (
                <div key={s.id} className={"opt " + (on ? "selected" : "")} onClick={() => setCfg({ kitchenScope: s.id })} style={{ padding: "12px 14px" }}>
                  <div className="opt-head" style={{ marginBottom: 2 }}><h3 style={{ fontSize: 14 }}>{AR ? s.nameAr : s.name}</h3></div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{AR ? s.hintAr : s.hint}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="opt-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          {list.map((k) => {
            const selected = view.kitchenId === k.id;
            const pal = D.kitchenPaletteById(k, selected ? view.kitchenPaletteId : null);
            const price = priceFor(k, scope);
            const na = price <= 0;
            const addons = D.kitchenAddonsFor(k, scope);
            const addonSum = selected ? D.kitchenAddonsPrice(k, scope, chosenAddons) * nUnitsPriced : 0;
            return (
              <div key={k.id} className={"opt " + (selected ? "selected" : "")} style={{ padding: 0, overflow: "hidden", opacity: na ? 0.55 : 1, cursor: na ? "not-allowed" : "pointer" }}
                   onClick={() => { if (!na) setCfg({ kitchenId: k.id, kitchenPaletteId: view.kitchenId === k.id ? view.kitchenPaletteId : ((k.palettes || [])[0] && k.palettes[0].id) || null }); }}>
                <DesignCarousel design={{ images: k.images }} palette={(pal && pal.colors) || ["#DDD", "#BBB"]} />
                <div style={{ padding: "16px 18px" }}>
                  <div className="opt-head">
                    <div><h3>{TX(k, "name")}</h3>{(k.palettes || []).length > 1 ? <span className="chip chip-soft">{(AR ? "لوحات ألوان: " : "Palettes: ") + k.palettes.length}</span> : null}</div>
                    <div className="price">{na ? (AR ? "غير متاح لهذا النوع" : "N/A for this type") : "+" + D.fmtSAR(price + addonSum)}{!na && <span className="u"> SAR</span>}</div>
                  </div>
                  <div className="opt-body">
                    {TX(k, "summary") ? <p style={{ margin: "0 0 10px", color: "var(--text-muted)" }}>{TX(k, "summary")}</p> : null}
                    <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                      {(k.palettes || []).map((p) => {
                        const on = selected && pal && pal.id === p.id;
                        return (
                          <button key={p.id} type="button" title={AR ? (p.nameAr || p.name) : p.name}
                            onClick={(e) => { e.stopPropagation(); if (!na) setCfg({ kitchenId: k.id, kitchenPaletteId: p.id }); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 9px 5px 5px", borderRadius: 999, cursor: na ? "not-allowed" : "pointer",
                                     border: "1px solid " + (on ? "var(--brand)" : "var(--line-strong)"), background: on ? "var(--brand-soft)" : "var(--bg-card)", fontSize: 11.5, fontWeight: on ? 600 : 500, color: "var(--text)" }}>
                            <span style={{ display: "inline-flex", gap: 2 }}>{(p.colors || []).slice(0, 3).map((c, i) => <span key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.08)" }} />)}</span>
                            {AR ? (p.nameAr || p.name) : p.name}
                          </button>
                        );
                      })}
                    </div>
                    <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                      {inc(k).map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{it}</li>)}
                    </ul>
                    {addons.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dotted var(--line)" }}>
                        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{AR ? "// إضافات اختيارية" : "// OPTIONAL ITEMS"}</div>
                        {addons.map((a) => {
                          const on = selected && chosenAddons.includes(a.id);
                          return (
                            <label key={a.id} onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--r-sm)", background: on ? "var(--brand-soft)" : "transparent", cursor: na ? "not-allowed" : "pointer", fontSize: 12.5, opacity: (!selected && !na) ? 0.7 : 1 }}>
                              <input type="checkbox" checked={on} disabled={na} onChange={() => { if (!selected) setCfg({ kitchenId: k.id, kitchenPaletteId: ((k.palettes || [])[0] && k.palettes[0].id) || null, kitchenAddons: [a.id] }); else toggleAddon(a.id); }} />
                              <span style={{ flex: 1 }}>{TX(a, "name")}</span>
                              <span className="mono" style={{ fontWeight: 600 }}>+{D.fmtSAR(a.price)}{nUnitsPriced > 1 ? <span className="soft"> ×{nUnitsPriced}</span> : null}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
      )}
    </>
  );
}

/* =================================================================
   STEP — Cooling / AC (project.features.cooling) — whole unit only
   Unit type → cooling points (room · BTU); system price = Σ tier prices + install × points
================================================================= */
function StepCooling(ctx) {
  const { P, project, opt, skipCooling, setSkip, view, setCfg, editUnitObj, unit, perMode, units } = ctx;
  const AR = window.I18N && window.I18N.isAR;
  const list = P.ac || [];
  const u = editUnitObj || unit;
  const single = perMode || !units || units.length < 2;
  const scope = single ? (u ? [u] : []) : units;
  const pts = u ? D.coolingPointsFor(project.id, u.typeId) : [];
  const fitsAll = (a) => scope.every((x) => D.acFits(a, x.typeId));
  const priceFor = (a) => scope.reduce((s, x) => s + D.acPrice(a, project.id, x.typeId), 0);
  const nUnitsPriced = scope.length || 1;
  const chosen = view.acAddons || [];
  const toggleAddon = (id) => setCfg({ acAddons: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id] });
  const typeName = (t) => { const ty = (P.unitTypes || []).find((x) => x.id === t); return ty ? TX(ty, "name") : t; };
  return (
    <>
      <StepHead n="06" eye={AR ? "التكييف" : "COOLING"} title={AR ? "اختر نظام التكييف" : "Choose the air-conditioning"}
        kicker={AR ? "تكييف الوحدة كاملة. لكل نوع وحدة نقاط تبريد محددة (غرفة وسعة)، والسعر يحسب تلقائيا من سعر كل سعة زائد التركيب. تظهر فقط الأنظمة المناسبة لهذه الوحدة."
                   : "Whole-unit cooling. Every unit type has defined cooling points (room and capacity); the price is computed from each system's capacity tiers plus installation. Only systems that fit this unit are shown."} />
      {opt.cooling && <OptionalBanner feature="cooling" label="Cooling" skipped={skipCooling} setSkip={setSkip} />}
      {!skipCooling && <UnitConfigBar {...ctx} doneKey="acId" />}
      {skipCooling ? <SkippedBody label="Cooling" /> : (
      <>
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>{AR ? "// نقاط التبريد · الوحدة كاملة" : "// COOLING POINTS · WHOLE UNIT"}</div>
            <span className="chip chip-soft">{u ? typeName(u.typeId) + " · " + pts.length + (AR ? " وحدات تكييف" : " indoor units") : ""}</span>
          </div>
          {pts.length === 0 ? <div className="soft" style={{ fontSize: 12.5 }}>{AR ? "لم تحدد نقاط تبريد لهذا النوع بعد — يضيفها مسؤول Revnu من مساحة عمل المشروع." : "No cooling points defined for this unit type yet — Revnu admin adds them in the project workspace."}</div> : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pts.map((p, i) => <span key={i} className="chip" style={{ fontSize: 12 }}>{AR ? (p.roomAr || p.room) : p.room} <span className="mono soft" style={{ marginInlineStart: 6 }}>{D.fmtSAR(p.btu)} BTU</span></span>)}
            </div>
          )}
        </div>
        <div className="opt-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          {list.filter(fitsAll).map((a) => {
            const selected = view.acId === a.id;
            const price = priceFor(a);
            const na = price <= 0;
            const addonSum = selected ? D.acAddonsPrice(a, chosen) * nUnitsPriced : 0;
            const ty = D.acTypeById(a.type);
            return (
              <div key={a.id} className={"opt " + (selected ? "selected" : "")} style={{ padding: 0, overflow: "hidden", opacity: na ? 0.55 : 1, cursor: na ? "not-allowed" : "pointer" }} onClick={() => { if (!na) setCfg({ acId: a.id }); }}>
                {(a.images || []).length > 0 && <DesignCarousel design={{ images: a.images }} palette={["#E9EDF2", "#CBD3DC"]} />}
                <div style={{ padding: "16px 18px" }}>
                <div className="opt-head">
                  <div>
                    <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {a.logo ? <img src={a.logo} alt={a.brand} title={a.brand} style={{ height: 26, maxWidth: 96, objectFit: "contain", display: "block" }} /> : null}
                      <h3 style={{ margin: 0 }}>{a.logo ? null : <>{AR ? (a.brandAr || a.brand) : a.brand} </>}<span style={{ fontWeight: a.logo ? 600 : 400 }}>{TX(a, "name")}</span></h3>
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}><span className="chip chip-soft">{AR ? ty.ar : ty.en}</span>{a.energyClass ? <span className="chip chip-soft">{a.energyClass}</span> : null}{a.warrantyYears ? <span className="chip chip-soft">{a.warrantyYears} {AR ? "سنوات ضمان" : "yr warranty"}</span> : null}</div>
                  </div>
                  <div className="price">{na ? (AR ? "غير متاح" : "N/A") : "+" + D.fmtSAR(price + addonSum)}{!na && <span className="u"> SAR</span>}</div>
                </div>
                <div className="opt-body">
                  {TX(a, "summary") ? <p style={{ margin: "0 0 10px", color: "var(--text-muted)" }}>{TX(a, "summary")}</p> : null}
                  {single && pts.length > 0 && (
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginBottom: 8 }}>
                      <tbody>
                        {pts.map((p, i) => <tr key={i} style={{ borderTop: i ? "1px dotted var(--line)" : "none" }}><td style={{ padding: "3px 0" }}>{AR ? (p.roomAr || p.room) : p.room}</td><td className="mono soft" style={{ textAlign: "end" }}>{D.fmtSAR(p.btu)} BTU</td><td className="mono" style={{ textAlign: "end", paddingInlineStart: 12 }}>{D.fmtSAR(D.acTierPrice(a, p.btu))}</td></tr>)}
                        <tr style={{ borderTop: "1px dotted var(--line)" }}><td style={{ padding: "3px 0" }}>{AR ? "التركيب" : "Installation"}</td><td className="mono soft" style={{ textAlign: "end" }}>× {pts.length}</td><td className="mono" style={{ textAlign: "end" }}>{D.fmtSAR((Number(a.install) || 0) * pts.length)}</td></tr>
                      </tbody>
                    </table>
                  )}
                  {!single && <div className="soft" style={{ fontSize: 11.5, marginBottom: 8 }}>{AR ? "السعر لكل الوحدات المختارة حسب نقاط تبريد كل نوع." : "Priced across all selected units, per each type's cooling points."}</div>}
                  {(a.addons || []).length > 0 && (
                    <div style={{ marginTop: 6, paddingTop: 8, borderTop: "1px dotted var(--line)" }}>
                      <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{AR ? "// إضافات اختيارية" : "// OPTIONAL ITEMS"}</div>
                      {a.addons.map((x) => { const on = selected && chosen.includes(x.id); return (
                        <label key={x.id} onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--r-sm)", background: on ? "var(--brand-soft)" : "transparent", cursor: na ? "not-allowed" : "pointer", fontSize: 12.5, opacity: (!selected && !na) ? 0.7 : 1 }}>
                          <input type="checkbox" checked={on} disabled={na} onChange={() => { if (!selected) setCfg({ acId: a.id, acAddons: [x.id] }); else toggleAddon(x.id); }} />
                          <span style={{ flex: 1 }}>{TX(x, "name")}</span>
                          <span className="mono" style={{ fontWeight: 600 }}>+{D.fmtSAR(x.price)}{nUnitsPriced > 1 ? <span className="soft"> ×{nUnitsPriced}</span> : null}</span>
                        </label>); })}
                    </div>
                  )}
                </div>
                </div>
              </div>
            );
          })}
          {list.filter(fitsAll).length === 0 && <div className="card card-pad soft">{AR ? "لا يوجد نظام تكييف مناسب لهذا النوع من الوحدات." : "No cooling system fits this unit type."}</div>}
        </div>
      </>
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
              ? "كل نموذج يعرض عائدنا المتوقع ل" + (scopeUnits.length > 1 ? "الوحدات المختارة (" + scopeUnits.length + ")" : "وحدة " + (unit.type.nameAr || unit.type.name)) + " — بناء على الافتراضات المحددة لهذا المشروع. هذه الأرقام نفسها تدخل في الاتفاقية. الخطوة التالية أداة محاكاة لاستكشاف سيناريوهات أخرى مع العميل."
              : "Each model shows our projected return for " + (scopeUnits.length > 1 ? "the selected units (" + scopeUnits.length + ")" : "a " + unit.type.name) + " — based on the assumptions set for this project. These exact figures go into the agreement. The next step is a what-if tool to explore other scenarios with the customer.")
          : (AR ? "اختر نموذج التشغيل. الخطوة التالية تحوله إلى عائد متوقع." : "Pick the operating model. The next step turns this into a projected return.")} />
      {opt.operations && <OptionalBanner feature="operations" label="Operations" skipped={skipOps} setSkip={setSkip} />}
      {!skipOps && <UnitConfigBar {...ctx} doneKey="opsId" />}
      {!skipOps && perMode && opsRows && opsRows.some((r) => r.ops) && (
        <div className="card card-pad" style={{ marginBottom: 14, fontSize: 12 }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{AR ? "// ملخص التشغيل لكل وحدة" : "// OPERATING SUMMARY PER UNIT"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {opsRows.map((r) => (
              <div key={r.unit.number} className="row-between" style={{ padding: "6px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
                <span className="mono" style={{ fontWeight: 600 }}>{r.unit.number}</span>
                <span>{r.ops ? TX(r.ops, "name") : <span className="soft">{AR ? "لم يحدد" : "not set"}</span>}{r.ec ? <span className="soft"> · {r.ec.roi.toFixed(1)}%</span> : null}</span>
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
                  <div className="soft" style={{ fontSize: 10, marginTop: 9 }}>{AR ? ("رسوم المشغل " + o.mgmtFee + "% · نطاق الإشغال " + o.occLow + "–" + o.occHigh + "%") : ("Operator fee " + o.mgmtFee + "% · occupancy band " + o.occLow + "–" + o.occHigh + "%")}</div>
                </div>
              ) : (
                <div className="opt-meta">
                  <span>{AR ? "رسوم المشغل " : "Operator fee "}{o.mgmtFee}%</span>
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
      <StepHead n="07" eye={AR ? "أداة المحاكاة" : "WHAT-IF TOOL"} title={AR ? "حاسبة الاستثمار" : "Investment calculator"} kicker={AR ? "تم تخطي التشغيل في هذه الصفقة، لذا لا يوجد إسقاط إيجاري للنمذجة." : "Operations was skipped for this sale, so there's no rental projection to model."} />
      <SkippedBody label="Operations" />
    </>
  );
  if (!opsAny || !unit) return <EmptyHint title={AR ? "اختر نموذج التشغيل أولا" : "Choose an operating model first"} sub={AR ? "ارجع إلى الخطوة 06 لتحديد نموذج التشغيل." : "Go back to step 06 to set the operating model."} />;
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
        kicker={AR ? "مساحة تجريبية لاستكشاف السيناريوهات مع العميل. حرك السعر والإشغال لرؤية تغير العوائد — هذا لا يغير الاتفاقية. يعتمد العقد دائما على افتراضنا الرسمي الموضح أدناه." : "A scratchpad to explore scenarios with the customer. Slide the rate and occupancy to see how returns move — this does NOT change the agreement. The contract always uses our official assumption shown below."} />

      <div className="card card-pad-lg" style={{ marginBottom: 16, background: "var(--brand-soft)", border: "1px solid var(--line)" }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div>
            <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 4 }}>
              <span className="soft" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{AR ? "افتراضنا · يدرج في العقد" : "OUR ASSUMPTION · GOES IN THE CONTRACT"}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: rm.color, background: rm.soft, borderRadius: 20, padding: "2px 9px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: rm.color }} />{riskLabel}
              </span>
            </div>
            <div className="soft" style={{ fontSize: 12 }}>
              {modelName} · {D.fmtSAR(our.rate) + (isDaily ? (AR ? " ريال/ليلة" : " SAR/night") : (AR ? " ريال/شهر" : " SAR/month"))}{our.mixed || nUnits > 1 ? (AR ? " (الوحدة الأولى)" : " (first unit)") : ""} · {our.occ}% {AR ? "إشغال" : "occupancy"} {AR ? "←" : "→"} <strong style={{ color: "var(--text)" }}>{our.roi.toFixed(1)}% {AR ? "عائد صاف" : "net ROI"}</strong> ({D.fmtSAR(our.annualNet)} {AR ? "ريال/سنة" : "SAR/yr"})
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
          <RateInput label={isDaily ? (AR ? "متوسط السعر اليومي" : "Average daily rate (ADR)") : (AR ? "الإيجار الشهري" : "Monthly rent")}
                     unit={isDaily ? (AR ? "ريال / ليلة" : "SAR / night") : (AR ? "ريال / شهر" : "SAR / month")}
                     value={rate} min={Math.max(1, Math.round(our.rate * 0.4))} max={Math.round(our.rate * 2) || (isDaily ? 5000 : 60000)} step={isDaily ? 5 : 50}
                     onChange={(v) => upd({ rate: v })}
                     hint={(isDaily ? (AR ? "الإجمالي السنوي = السعر × 365 × الإشغال" : "Annual gross = rate × 365 × occupancy") : (AR ? "الإجمالي السنوي = السعر × 12 × الإشغال" : "Annual gross = rate × 12 × occupancy")) + (nUnits > 1 ? (AR ? " · باقي الوحدات تتغير بنفس النسبة" : " · other units scale by the same ratio") : "")} />
          <hr className="hr-thin" style={{ margin: "18px 0" }} />
          <Slider label={AR ? "الإشغال" : "Occupancy"} value={occ} min={30} max={100} step={1} unit="%"
                  onChange={(v) => upd({ occ: v })}
                  hint={model ? (AR ? ("افتراضنا " + our.occ + "% · المعتاد " + model.occLow + "%–" + model.occHigh + "% ل " + TX(model, "name")) : ("Our assumption " + our.occ + "% · typical " + model.occLow + "%–" + model.occHigh + "% for " + model.name)) : ""} />
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
              <Stat label={AR ? "رسوم المشغل" : "Operator fee"} value={D.fmtSAR(annualGross - annualNet)} unit={"SAR · " + operatorFee + "%"} />
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
                ? ("يسجل العقد افتراضنا (" + our.roi.toFixed(1) + "% عائد صاف)، وليس هذا السيناريو. استخدم هذه الأداة لمناقشة العميل في الاحتمالات الصاعدة والهابطة.")
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
      {printing && createPortal(
        <div className="print-doc">
          {window.FullAgreement ? window.FullAgreement({ ...ctx, lang }) : null}
          {hasKyc ? kycPaper : null}
        </div>,
        document.body
      )}

      <StepHead n="08" eye={readOnly ? (AR ? "الاتفاقية" : "AGREEMENT") : (AR ? "المراجعة والإصدار" : "REVIEW & ISSUE")}
        title={readOnly ? (AR ? "اتفاقية الطلب " + order.id : "Agreement · " + order.id) : (AR ? "راجع الاتفاقية ثم أصدرها للتوقيع" : "Review, then issue for signature")}
        kicker={readOnly
          ? (AR ? "النسخة المسجلة من الاتفاقية بين " + (c.fullName || "المشتري") + " و" + developer.name + " كما أصدرت مع الطلب. نزلها بصيغة Word أو PDF، أو بدل لغة المستند من الأعلى." : "The recorded agreement between " + (c.fullName || "the buyer") + " and " + developer.name + " exactly as issued with the order. Download it as Word or PDF, or switch the document language above.")
          : (AR
            ? "راجع الاتفاقية مع " + (c.fullName || "المشتري") + ". عند إرسال الطلب تصدر موقعة ومختومة مسبقا من " + developer.name + " ويحصل المشتري على رابط ورمز QR ليقرأها ويوقعها على جواله — لا يوقع شيء على هذه الشاشة. "
            : "Review the agreement with " + (c.fullName || "the buyer") + ". Submitting issues it pre-signed and stamped by " + developer.name + " and gives the buyer a link + QR to read and sign on their own phone — nothing is signed on this screen. ")
            + (AR
            ? "اتفاقية واحدة كاملة بين " + (c.fullName || "المشتري") + " و" + developer.name + " — العقار، والتشطيب المختار، وأرقام الاستثمار، والشروط الكاملة. يسوى التأثيث كملحق لعقد شراء الوحدة. " + developer.name + " هو الطرف الوحيد؛ وتعمل Revnu من الخلف عبر اتفاقية تشغيل ظهر‑لظهر."
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
            <I.down width={14} height={14} /> {wordBusy ? (AR ? "جار التجهيز…" : "Preparing…") : (AR ? "تنزيل Word" : "Download Word (.doc)")}
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
function Field({ label, value, onChange, placeholder, type, mono, full, error, name, autoComplete }) {
  return (
    <div className={"field" + (full ? " full" : "")}>
      <label>{label}</label>
      <input className={"input" + (mono ? " mono" : "")} type={type || "text"} name={name} autoComplete={autoComplete} value={value == null ? "" : String(value)} placeholder={placeholder || ""} style={error ? { borderColor: "#c0492f" } : undefined}
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
// Mobile with a searchable country-code picker: Gulf & Arab neighbours first (Saudi default), then every country A–Z.
function PhoneField({ code, value, onCode, onChange }) {
  const AR = window.I18N && window.I18N.isAR;
  const [open, setOpen] = useState(false); const [q, setQ] = useState("");
  const wrap = React.useRef(null); const search = React.useRef(null);
  useEffect(() => { if (!open) return; const off = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", off); const t = setTimeout(() => search.current && search.current.focus(), 30); return () => { document.removeEventListener("mousedown", off); clearTimeout(t); }; }, [open]);
  const cur = D.mobileCodeByValue(code);
  const ql = q.trim().toLowerCase();
  const match = (x) => !ql || x.en.toLowerCase().includes(ql) || (x.ar || "").includes(q.trim()) || x.code.includes(ql.replace(/^\+?/, "+")) || x.code.slice(1).startsWith(ql) || x.iso.toLowerCase() === ql;
  const near = D.MOBILE_CODES.filter((x) => x.near && match(x)); const rest = D.MOBILE_CODES.filter((x) => !x.near && match(x));
  const bad = value && !D.VALID.mobileIntl(code, value);
  const pick = (x) => { onCode(x.code); setOpen(false); setQ(""); };
  const Row = ({ x }) => <div onMouseDown={(e) => { e.preventDefault(); pick(x); }} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 10px", cursor: "pointer", borderRadius: 6, background: x.code === code && x.iso === cur.iso ? "var(--brand-soft)" : "transparent", fontSize: 12.5 }}
    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-sunken)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = x.code === code && x.iso === cur.iso ? "var(--brand-soft)" : "transparent"; }}>
    <span className="mono" style={{ width: 54, flex: "none", color: "var(--text-muted)", direction: "ltr", textAlign: "left" }}>{x.code}</span><span>{AR ? x.ar : x.en}</span></div>;
  return (
    <div className="field" ref={wrap} style={{ position: "relative" }}>
      <label>{AR ? "الجوال" : "Mobile"}</label>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <button type="button" className="input" onClick={() => setOpen((o) => !o)} style={{ width: 132, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, cursor: "pointer", textAlign: "start" }} title={AR ? cur.ar : cur.en}>
          <span className="mono" style={{ direction: "ltr" }}>{cur.code}</span><span style={{ fontSize: 11.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur.iso}</span><span style={{ fontSize: 10, color: "var(--text-soft)" }}>▾</span>
        </button>
        <input className="input mono" name="tel-national" type="tel" inputMode="tel" autoComplete="tel-national" dir="ltr" value={value} placeholder={code === "+966" ? "5x xxx xxxx" : (AR ? "رقم الجوال" : "mobile number")} onChange={(e) => onChange(e.target.value)} style={bad ? { borderColor: "#c0492f" } : undefined} />
      </div>
      {bad ? <span style={{ fontSize: 11, color: "#c0492f", marginTop: 4 }}>{code === "+966" ? (AR ? "رقم سعودي: 5xxxxxxxx (9 أرقام)" : "Saudi mobile: 5xxxxxxxx (9 digits)") : (AR ? "6 إلى 13 رقما" : "6 to 13 digits")}</span> : null}
      {open && (
        <div style={{ position: "absolute", top: "100%", insetInlineStart: 0, zIndex: 40, width: 320, maxWidth: "90vw", marginTop: 4, background: "var(--bg-card)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", boxShadow: "var(--sh-lg)", padding: 8 }}>
          <input ref={search} className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={AR ? "ابحث بالدولة أو الرمز…" : "Search country or code…"} style={{ height: 34, fontSize: 12.5, marginBottom: 6 }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter") { const first = near[0] || rest[0]; if (first) pick(first); } }} />
          <div style={{ maxHeight: 260, overflow: "auto" }}>
            {near.length > 0 && <div className="eyebrow" style={{ fontSize: 9.5, padding: "4px 10px" }}>{AR ? "// الخليج والدول العربية" : "// GULF & ARAB COUNTRIES"}</div>}
            {near.map((x) => <Row key={x.iso} x={x} />)}
            {rest.length > 0 && <div className="eyebrow" style={{ fontSize: 9.5, padding: "8px 10px 4px" }}>{AR ? "// كل الدول" : "// ALL COUNTRIES"}</div>}
            {rest.map((x) => <Row key={x.iso} x={x} />)}
            {!near.length && !rest.length && <div className="soft" style={{ padding: 10, fontSize: 12 }}>{AR ? "لا نتائج" : "No matches"}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
// E-mail with one-tap domain completion: type the mailbox name, tap gmail / hotmail / outlook / icloud / yahoo — or type any custom domain.
function EmailField({ value, onChange }) {
  const AR = window.I18N && window.I18N.isAR;
  const v = value || ""; const at = v.indexOf("@"); const local = at >= 0 ? v.slice(0, at) : v; const dom = at >= 0 ? v.slice(at + 1) : "";
  const showChips = !!local.trim() && (at < 0 || !dom.includes("."));
  const chips = D.EMAIL_DOMAINS.filter((x) => !dom || x.startsWith(dom.toLowerCase()));
  const bad = v && !D.VALID.email(v);
  return (
    <div className="field">
      <label>{AR ? "البريد الإلكتروني" : "Email"}</label>
      <input className="input" type="email" name="email" autoComplete="email" dir="ltr" value={v} placeholder="name@domain.com" onChange={(e) => onChange(e.target.value)} style={bad && !showChips ? { borderColor: "#c0492f" } : undefined} />
      {showChips && chips.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {chips.map((x) => <button key={x} type="button" className="btn btn-sm btn-secondary" style={{ height: 26, fontSize: 11.5, padding: "0 10px" }} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(local.trim() + "@" + x)}>@{x}</button>)}
          <span className="soft" style={{ fontSize: 11, alignSelf: "center" }}>{AR ? "أو اكتب نطاقا آخر" : "or type any other domain"}</span>
        </div>
      )}
      {bad && !showChips ? <span style={{ fontSize: 11, color: "#c0492f", marginTop: 4 }}>{AR ? "بريد غير صحيح" : "Invalid email"}</span> : null}
    </div>
  );
}
// Catches a render error inside one step so the whole wizard never goes blank (the order state is untouched).
class StepBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.error("step render error", err, info && info.componentStack); } catch (e) {} }
  render() {
    if (!this.state.err) return this.props.children;
    const AR = window.I18N && window.I18N.isAR;
    return (
      <div className="card card-pad-lg" style={{ maxWidth: 640, margin: "24px auto", textAlign: "center" }}>
        <div className="display-sm" style={{ marginBottom: 8 }}>{AR ? "تعذر عرض هذه الخطوة" : "This step could not be displayed"}</div>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>{AR ? "بياناتك محفوظة. حاول مرة أخرى أو عد خطوة إلى الوراء." : "Your entries are safe. Try again or go back one step."}</p>
        <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 14 }}><button className="btn btn-primary" onClick={() => this.setState({ err: null })}>{AR ? "إعادة المحاولة" : "Try again"}</button></div>
        <div className="mono soft" style={{ fontSize: 10.5, marginTop: 12, wordBreak: "break-all" }}>{String(this.state.err && this.state.err.message || this.state.err)}</div>
      </div>
    );
  }
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
      <span style={{ fontSize: 12.5, flex: 1, minWidth: 200 }}>{skipped ? (AR ? "تم تخطي " + name + " في هذه الصفقة." : name + " is skipped for this sale.") : (AR ? name + " مضمن في هذه الصفقة — يمكن تخطيه إذا لم يرغب العميل." : name + " is included in this sale — skip it if the customer doesn't want it.")}</span>
      <div style={{ display: "inline-flex", border: "1px solid var(--line-strong)", borderRadius: 8, overflow: "hidden" }}>
        <button type="button" className="btn btn-sm" style={{ border: 0, borderRadius: 0, background: !skipped ? "var(--brand)" : "transparent", color: !skipped ? "var(--brand-text)" : "var(--text-muted)" }} onClick={() => setSkip(feature, false)}>{AR ? "تضمين" : "Include"}</button>
        <button type="button" className="btn btn-sm" style={{ border: 0, borderRadius: 0, background: skipped ? "var(--brand)" : "transparent", color: skipped ? "var(--brand-text)" : "var(--text-muted)" }} onClick={() => setSkip(feature, true)}>{AR ? "تخطي" : "Skip"}</button>
      </div>
    </div>
  );
}
function SkippedBody({ label }) {
  const AR = window.I18N && window.I18N.isAR;
  const name = TT(label);
  return (
    <div className="card card-pad-lg" style={{ textAlign: "center", color: "var(--text-soft)", padding: "44px 24px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{AR ? "تم تخطي " + name : name + " skipped"}</div>
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

/* =================================================================
   Module entry — booted by components/PortalBoot after the server
   verified the session and the store was hydrated.
================================================================= */
function NotHere() {
  const AR = window.I18N && window.I18N.isAR;
  return <div className="rv-fullscreen"><div className="card card-pad-lg"><div className="display-sm" style={{ marginBottom: 8 }}>{AR ? "لم يُعثر على المطوّر" : "Developer not found"}</div><a className="btn btn-primary" href="/login">{AR ? "تسجيل الدخول" : "Sign in"}</a></div></div>;
}
export default function SalesPortal({ params: p }) {
  const [ok] = useState(() => boot(p));
  useStoreVersion();
  if (!ok) return <NotHere />;
  return <App />;
}
