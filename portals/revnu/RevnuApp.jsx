"use client";
// Revnu Admin — platform back office.
// Manage all developers, their projects/units, packages, operations,
// and watch all orders across the platform.

import React, { useState, useMemo } from "react";
import D from "@/lib/data/store";
import { useStoreVersion } from "@/lib/data/useStore";
import "@/portals/shared/contract";   // window.FullAgreement / agreementCtxFromOrder for the agreement composer preview

const ICONS = {
  dash:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="14" width="7.5" height="7" rx="1.5"/></svg>,
  leads:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/></svg>,
  devs:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M6 21V8l6-3 6 3v13"/><path d="M9 21v-5h6v5"/></svg>,
  units:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  pkg:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></svg>,
  pay:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 11h18M7 16h3"/></svg>,
  ops:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  doc:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>,
  orders:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,
};

const NAV = [
  { section: "Pipeline" },
  { id: "dash",     label: "Dashboard",     icon: ICONS.dash },
  { id: "tickets",  label: "Support tickets", icon: ICONS.team || ICONS.dash },
  { id: "leads",    label: "Interested",    icon: ICONS.leads,  badge: true },
  { id: "orders",   label: "All orders",    icon: ICONS.orders, requires: "orders" },
  { id: "receivables", label: "Developer payments", icon: ICONS.orders, requires: "orders" },
  { id: "billing",  label: "Subscriptions & fees", icon: ICONS.orders, requires: "financials" },
  { section: "Partners" },
  { id: "devs",     label: "Developers",    icon: ICONS.devs, requires: "developers" },
  { section: "Organisation" },
  { id: "team",     label: "My team",       icon: ICONS.perf || ICONS.devs, requires: "team" },
];

const STATUS_CHIP = {
  draft: "chip", review: "chip chip-warning", issued: "chip chip-warning", signed: "chip chip-brand",
  active: "chip chip-positive", paid: "chip chip-positive", completed: "chip", cancelled: "chip chip-negative",
};

// ---- bootstrap: identity comes from the server-verified session (never from browser storage) ----
let params, session, me;
function boot(p) {
  params = new URLSearchParams(p || {});
  session = D.me();
  me = session ? (D.userById(session.id) || session) : null;
  if (!me || me.role !== "revnu_admin") { location.replace(me ? "/developer" : "/login"); return false; }
  document.title = (window.I18N && window.I18N.isAR) ? "إدارة Revnu" : "Revnu admin";
  return true;
}
const CAN_DELETE_FN = () => !!me && (me.roleId === "super_admin" || (me.role === "revnu_admin" && !me.roleId));
function revnuPerms() {
  if (!me) return [];
  if (me.perms) return me.perms;
  const r = REVNU_ROLES.find((x) => x.id === me.roleId) || REVNU_ROLES[REVNU_ROLES.length - 1];
  return r ? r.perms : [];
}
const revnuHasPerm = (perm) => revnuPerms().includes(perm);
// NAV filtered to what this signed-in staff member's permissions unlock; drops a section header
// entirely if every item under it is hidden.
function visibleNav() {
  const out = [];
  for (let i = 0; i < NAV.length; i++) {
    const n = NAV[i];
    if (n.section) {
      let hasVisible = false;
      for (let j = i + 1; j < NAV.length && !NAV[j].section; j++) {
        if (!NAV[j].requires || revnuHasPerm(NAV[j].requires)) { hasVisible = true; break; }
      }
      if (hasVisible) out.push(n);
    } else if (!n.requires || revnuHasPerm(n.requires)) {
      out.push(n);
    }
  }
  return out;
}

function roleLabel(r) {
  const TT = (s) => (window.I18N ? window.I18N.t(s) : s);
  if (r === "revnu_admin")     return TT("Revnu Admin");
  if (window.REVNU_DATA && window.REVNU_DATA.DEV_ROLES) {
    const dr = window.REVNU_DATA.DEV_ROLES.find((x) => x.id === r);
    if (dr) return (window.I18N && window.I18N.isAR) ? dr.ar : dr.en;
  }
  if (r === "developer_admin") return TT("Developer Admin");
  if (r === "sales_rep")       return TT("Sales Rep");
  return r;
}
// Display a user's role: free-typed text wins (bilingual), else known-id label.
function roleDisplay(u) {
  if (!u) return "";
  const AR = window.I18N && window.I18N.isAR;
  const known = window.REVNU_DATA && window.REVNU_DATA.DEV_ROLES.find((x) => x.id === u.role);
  if (!known && u.role && u.role !== "revnu_admin") return AR ? (u.roleAr || u.role) : (u.role || u.roleAr || "");
  if (AR && u.roleAr) return u.roleAr;
  return roleLabel(u.role);
}
const TT = (s) => (window.I18N ? window.I18N.t(s) : s);

function LangToggle({ block }) {
  const ar = window.I18N && window.I18N.isAR;
  const set = (l) => window.I18N && window.I18N.setLang(l);
  return (
    <div style={{ display: block ? "flex" : "inline-flex", width: block ? "100%" : undefined, border: "1px solid var(--line-strong)", borderRadius: 8, overflow: "hidden" }}>
      <button type="button" onClick={() => set("en")} style={{ flex: block ? 1 : undefined, height: 30, padding: "0 12px", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, background: !ar ? "var(--brand)" : "transparent", color: !ar ? "var(--brand-text)" : "var(--text-muted)" }}>EN</button>
      <button type="button" onClick={() => set("ar")} style={{ flex: block ? 1 : undefined, height: 30, padding: "0 12px", border: "none", borderInlineStart: "1px solid var(--line-strong)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-ar)", background: ar ? "var(--brand)" : "transparent", color: ar ? "var(--brand-text)" : "var(--text-muted)" }}>عربي</button>
    </div>
  );
}

function UserMenu({ me, roleLabel, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const initials = me.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const TL = (en, ar) => (window.I18N && window.I18N.isAR ? ar : en);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 8px 5px 6px", border: "1px solid " + (open ? "var(--line-strong)" : "transparent"), borderRadius: 999, background: open ? "var(--bg-tint)" : "transparent", cursor: "pointer" }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{initials}</span>
        <span className="col hide-mobile" style={{ lineHeight: 1.2, textAlign: "start" }}>
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{me.name}</span>
          <span style={{ display: "block", fontSize: 10.5, color: "var(--text-soft)", whiteSpace: "nowrap" }}>{roleLabel(me.role)}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-soft)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", insetInlineEnd: 0, top: "calc(100% + 8px)", width: 240, background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.14)", padding: 8, zIndex: 100 }}>
          <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--line)", marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{me.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 1 }}>{me.email || roleLabel(me.role)}</div>
          </div>
          <div style={{ padding: "4px 10px 8px" }}>
            <div style={{ fontSize: 10.5, color: "var(--text-soft)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{TL("Language", "اللغة")}</div>
            <LangToggle block />
          </div>
          <a href={"/login?set-password=1&next=" + encodeURIComponent(location.pathname + location.search)}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 8, background: "transparent", textDecoration: "none", color: "var(--text)", fontSize: 13, fontWeight: 500 }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-tint)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            {TL("Change password", "تغيير كلمة المرور")}
          </a>
          <button type="button" onClick={onSignOut}
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

function Tickets() {
  const AR = window.I18N && window.I18N.isAR;
  const RS = window.RevnuSupport;
  const [, tick] = useState(0);
  const [reply, setReply] = useState({});
  const list = RS ? RS.list() : [];
  const STATUS = { open: [AR ? "جديدة" : "Open", "chip-warning"], in_progress: [AR ? "قيد المعالجة" : "In progress", "chip-brand"], resolved: [AR ? "محلولة" : "Resolved", "chip-positive"] };
  const TYPE = { bug: AR ? "خلل" : "Bug", question: AR ? "سؤال" : "Question", request: AR ? "طلب تعديل" : "Request", billing: AR ? "مدفوعات" : "Billing" };
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{AR ? "تذاكر الدعم" : "Support tickets"}</h1>
          <p className="page-sub">{AR ? "كل ما يبلغ عنه المطورون وفرق المبيعات من داخل بواباتهم. رد وغير الحالة هنا." : "Everything developers and sales teams report from inside their portals. Reply and change the status here."}</p>
        </div>
        <span className="chip">{list.filter((t) => t.status !== "resolved").length} {AR ? "مفتوحة" : "open"}</span>
      </div>
      {list.length === 0 && <div className="card card-pad-lg muted" style={{ textAlign: "center" }}>{AR ? "لا توجد تذاكر بعد — يظهر هنا كل بلاغ يرسل من زر «الدعم» في بوابات المطورين والمبيعات." : "No tickets yet — anything sent from the “Support” button in the developer and sales portals appears here."}</div>}
      <div className="stack-md">
        {list.map((t) => (
          <div key={t.id} className="card card-pad-lg">
            <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="chip chip-mono">{t.id}</span>
                <span className={"chip " + STATUS[t.status][1]}>{STATUS[t.status][0]}</span>
                <span className="chip chip-soft">{TYPE[t.type] || t.type}</span>
                <strong style={{ fontSize: 14 }}>{t.subject}</strong>
              </div>
              <select className="select" style={{ height: 30, width: 160 }} value={t.status} onChange={(e) => { RS.act(() => RS.updateTicket(t.id, { status: e.target.value })).then(() => tick((x) => x + 1)); }}>
                {Object.keys(STATUS).map((k) => <option key={k} value={k}>{STATUS[k][0]}</option>)}
              </select>
            </div>
            <div className="soft" style={{ fontSize: 12, marginTop: 6 }}>{t.by}{t.byEmail ? " · " + t.byEmail : ""}{t.developerId ? " · " + ((D.devById(t.developerId) || {}).name || t.developerId) : " · Revnu"} · {D.fmtDate(t.createdAt)} · <span className="mono">{t.page}</span></div>
            {t.body ? <p style={{ fontSize: 13, margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{t.body}</p> : null}
            {(t.replies || []).length > 0 && (
              <div style={{ marginTop: 12, borderInlineStart: "3px solid var(--line)", paddingInlineStart: 12 }}>
                {t.replies.map((rp, i) => <div key={i} style={{ fontSize: 12.5, marginBottom: 6 }}><span className="soft">{rp.by} · {D.fmtDate(rp.at)}</span><br />{rp.text}</div>)}
              </div>
            )}
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <input className="input" placeholder={AR ? "اكتب ردا…" : "Write a reply…"} value={reply[t.id] || ""} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} />
              <button className="btn btn-secondary" onClick={() => { if (!(reply[t.id] || "").trim()) return; const txt = reply[t.id].trim(); RS.act(() => RS.addReply(t.id, txt), { pending: AR ? "جار الإرسال…" : "Sending…", done: AR ? "أرسل الرد." : "Reply sent." }).then(() => { setReply({ ...reply, [t.id]: "" }); tick((x) => x + 1); }); }}>{AR ? "رد" : "Reply"}</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function App() {
  const [page, setPage] = useState("dash");
  const [gOrder, setGOrder] = useState(null);
  window.__revnuOpenOrder = (id) => setGOrder(D.ORDERS.find((o) => o.id === id) || null);
  React.useEffect(() => { if (window.RevnuSupport) window.RevnuSupport.firstRun("revnu"); }, []);
  const [workspace, setWorkspace] = useState(null); // developer id when in workspace
  const signOut = () => { D.signOut().finally(() => { location.href = "/login"; }); };
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <span className="node" style={{ width: 26, height: 26 }}>
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="100" r="42" fill="none" stroke="#080B14" strokeWidth="14"/>
              <circle cx="100" cy="100" r="18" fill="#080B14"/>
            </svg>
          </span>
          <div className="col" style={{ lineHeight: 1.1 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 19, letterSpacing: "-0.005em" }}>Revnu Admin</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>admin.revnu.sa</span>
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          {window.RevnuSupport && <window.RevnuSupport.SupportButtons portal="revnu" noTicket />}
          {me && <UserMenu me={me} roleLabel={roleLabel} onSignOut={signOut} />}
        </div>
      </header>
      {gOrder && <OrderDrawer order={gOrder} onClose={() => setGOrder(null)} />}

      <div className="app-body">
        <aside className="sidebar">
          {visibleNav().map((n, i) => {
            if (n.section) return <div key={"s" + i} className="side-section">{TT(n.section)}</div>;
            const badge = n.id === "leads" ? D.getInterested().filter((l) => l.status === "new").length : null;
            return (
              <div key={n.id} className={"side-link " + (page === n.id && (!workspace || n.id === "devs") ? "active" : "")} onClick={() => { setWorkspace(null); setPage(n.id); }}>
                {n.icon}<span>{TT(n.label)}</span>
                {badge ? <span className="chip chip-cyan" style={{ marginLeft: "auto", height: 18, fontSize: 10 }}>{badge}</span> : null}
              </div>
            );
          })}
          <div style={{ flex: 1 }} />
        </aside>
        <main>
          <div className="page-body">
            {workspace ? (
              <DeveloperWorkspace devId={workspace} onBack={() => setWorkspace(null)} />
            ) : (<>
              {page === "dash"   && <Dashboard />}
              {page === "tickets" && <Tickets />}
              {page === "leads"  && <Interested />}
              {page === "orders" && <AllOrders />}
              {page === "receivables" && <Receivables />}
              {page === "billing" && <Billing onOpenDev={(id) => { setWorkspace(id); setPage("devs"); }} />}
              {page === "devs"   && <Developers onOpen={setWorkspace} />}
              {page === "team"   && <RevnuTeam />}
            </>)}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ============================================================
   Dashboard
============================================================ */
function Dashboard() {
  const orders = D.ORDERS;
  const closed = orders.filter(D.isCustomerPaid);                                        // invoiceable
  const signedAll = orders.filter(D.isSigned);
  const live = orders.filter((o) => D.isLive(o) && !D.isCustomerPaid(o));               // in progress
  const active = live;

  // --------- Extras revenue (one-time per deal) ---------
  let extrasGross = 0, extrasDevMarkup = 0;
  closed.forEach((o) => {
    const extras = Number(o.furnishCost) || 0;
    const proj   = D.projById(o.projectId);
    const markup = proj?.commercials?.contractMarkup;
    const devCut = markup?.kind === "pct"
      ? extras * ((Number(markup.value) || 0) / 100)
      : (markup?.kind === "amt" ? Number(markup.value) || 0 : 0);
    extrasGross    += extras;
    extrasDevMarkup += devCut;
  });
  const extrasRevnu = extrasGross - extrasDevMarkup; // Revnu's gross from extras (before COGS)

  // --------- Revnu income (what developers pay us, after customers pay them) ---------
  // Income = collected developer→Revnu milestones across orders. NOT profit
  // (supplier margins with furnishing/smart companies are handled outside the system).
  let incomeCollected = 0, incomeOutstanding = 0;
  closed.forEach((o) => {
    const payable = D.revnuPayableForOrder(o);
    const sched = D.revnuScheduleForOrder(o);
    const got = sched.filter((m) => m.paid).reduce((s, m) => s + m.amount, 0);
    incomeCollected += got;
    incomeOutstanding += (payable - got);
  });
  // --------- Operations: units locked in (tracked only — income handled off-system) ---------
  const opsLocked = orders.filter(D.isOperating).length;
  const projectedIncome = live.reduce((a, o) => a + D.revnuPayableForOrder(o), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{TT("Dashboard")}</h1>
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "صحة المنصة عبر جميع المطورين." : "Cross-developer platform health."}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
        <Stat label="Developers"          value={D.DEVELOPERS.length} />
        <Stat label="Projects"            value={D.PROJECTS.length}   />
        <Stat label="Units in inventory"  value={D.UNITS.length} />
        <Stat label={window.I18N && window.I18N.isAR ? "صفقات قيد التنفيذ" : "Deals in progress"} value={active.length} delta={window.I18N && window.I18N.isAR ? (closed.length + " دفع عميلها · " + orders.length + " إجمالا") : `${closed.length} customer-paid · ${orders.length} total`} />
      </div>

      {/* ============== Revnu money flow ============== */}
      <div className="card card-pad-lg" style={{ marginBottom: 18, background: "linear-gradient(135deg, var(--brand-soft), transparent 70%)" }}>
        <div className="row-between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="eyebrow">{TT("// REVNU MONEY FLOW")}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>{window.I18N && window.I18N.isAR ? "دخلنا — ما يدفعه لنا المطورون" : "Our income — what developers pay us"}</div>
          </div>
          <span className="soft" style={{ fontSize: 11.5 }}>{window.I18N && window.I18N.isAR ? (closed.length + " صفقة مغلقة · " + active.length + " وحدة نشطة") : (closed.length + " closed deal" + (closed.length === 1 ? "" : "s") + " · " + active.length + " active unit" + (active.length === 1 ? "" : "s"))}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Income (what developers pay Revnu) */}
          <div className="card card-pad" style={{ background: "var(--bg-card)" }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>{window.I18N && window.I18N.isAR ? "دخلنا من المطورين" : "Income from developers"}</strong>
              <span className="chip">{window.I18N && window.I18N.isAR ? "تأثيث + منزل ذكي" : "furnishing + smart"}</span>
            </div>
            <FlowRow k={window.I18N && window.I18N.isAR ? "المحصل حتى الآن" : "Collected so far"} v={D.fmtSAR(incomeCollected)} sub={window.I18N && window.I18N.isAR ? "دفعات المطورين المستلمة" : "developer payments received"} positive />
            <FlowRow k={window.I18N && window.I18N.isAR ? "المتبقي" : "Outstanding"} v={D.fmtSAR(incomeOutstanding)} sub={window.I18N && window.I18N.isAR ? "مستحق على المطورين" : "due from developers"} emphasized />
            <div className="soft" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.5 }}>{window.I18N && window.I18N.isAR ? "هذا دخلنا — وليس الربح. نسدد منه لشركات التأثيث والمنزل الذكي (الهوامش خارج النظام)." : "This is income, not profit — we pay the furnishing & smart-home suppliers out of it (margins handled off-system)."}</div>
          </div>

          {/* Operations — locked units only (no income tracked here) */}
          <div className="card card-pad" style={{ background: "var(--bg-card)" }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>{window.I18N && window.I18N.isAR ? "التشغيل — وحدات مسجلة" : "Operations — locked units"}</strong>
              <span className="chip">{window.I18N && window.I18N.isAR ? "يدار خارج النظام" : "tracked off-system"}</span>
            </div>
            <FlowRow k={window.I18N && window.I18N.isAR ? "وحدات مرتبطة بالتشغيل" : "Units locked for operations"} v={String(opsLocked)} unit={window.I18N && window.I18N.isAR ? "وحدة" : "units"} sub={window.I18N && window.I18N.isAR ? "أبلغت شركة التشغيل بها" : "operator company notified"} positive />
            <div className="soft" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.5 }}>{window.I18N && window.I18N.isAR ? "لا نتتبع دخل التشغيل هنا — فقط الوحدات المسجلة. يرى المطور رقم الوحدة ونسبته المتفق عليها فقط." : "We don't track operating income here — only which units are locked in. The developer sees just the unit and their agreed % cut."}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row-between" style={{ padding: "16px 20px 8px" }}>
          <div>
            <div className="eyebrow">{window.I18N && window.I18N.isAR ? "المطورون" : "Developers"}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>{window.I18N && window.I18N.isAR ? "النشاط حسب المطور" : "Activity by developer"}</div>
          </div>
        </div>
        <table className="tbl tbl-flush">
          <thead><tr><th>{TT("Developer")}</th><th>{TT("Projects")}</th><th>{TT("Units")}</th><th>{TT("Orders")}</th><th className="right">{TT("Extras sold")}</th></tr></thead>
          <tbody>
            {D.DEVELOPERS.map((dv) => {
              const projects = D.PROJECTS.filter((p) => p.developerId === dv.id);
              const units    = D.UNITS.filter((u) => projects.some((p) => p.id === u.projectId));
              const devOrders = orders.filter((o) => o.developerId === dv.id);
              const gmv = devOrders.filter(D.isSigned).reduce((s, o) => s + (Number(o.furnishCost) || 0), 0);
              return (
                <tr key={dv.id}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: dv.brand.primary, color: dv.brand.text,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700,
                      }}>{dv.initials}</span>
                      <div>
                        <div style={{ fontWeight: 500 }}>{dv.name}</div>
                        <div className="soft" style={{ fontSize: 11 }}>{window.I18N && window.I18N.isAR ? "انضم " : "onboarded "}{D.fmtDate(dv.onboarded)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{projects.length}</td>
                  <td className="mono">{units.length}</td>
                  <td className="mono">{devOrders.length}</td>
                  <td className="right mono">{D.fmtSAR(gmv)} SAR</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FlowRow({ k, v, sub, emphasized, negative, positive, unit }) {
  const color = negative ? "var(--warning)" : positive ? "var(--positive)" : "var(--text)";
  const suffix = unit === undefined ? "SAR" : unit;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: "1px dotted var(--line)" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: emphasized || positive ? 600 : 400 }}>{k}</div>
        {sub && <div className="soft" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
      <div className="mono" style={{ fontSize: emphasized || positive ? 18 : 15, fontFamily: "var(--font-display)", fontWeight: emphasized || positive ? 500 : 400, color, letterSpacing: "-0.005em" }}>
        {v} {suffix ? <span className="soft" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>{suffix}</span> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, delta }) {
  return (
    <div className="stat">
      <div className="stat-label">{TT(label)}</div>
      <div className="stat-value">{value} <span className="muted" style={{ fontSize: 13, fontFamily: "var(--font)", fontWeight: 400 }}>{unit}</span></div>
      {delta && <div className="stat-delta">{delta}</div>}
    </div>
  );
}

/* ============================================================
   Revnu's own team — members + roles + permissions (صلاحيات)
============================================================ */
const REVNU_ROLES = [
  { id: "super_admin", en: "Super Admin", ar: "مدير عام",    perms: ["developers","financials","orders","team","settings"] },
  { id: "admin",       en: "Admin",       ar: "مدير",        perms: ["developers","financials","orders"] },
  { id: "team",        en: "Team",        ar: "عضو فريق",     perms: ["orders"] },
];
const REVNU_PERMS = [
  { id: "developers", en: "Manage developers",   ar: "إدارة المطورين" },
  { id: "orders",     en: "View orders & payments", ar: "عرض الطلبات والمدفوعات" },
  { id: "financials", en: "View financials",     ar: "عرض البيانات المالية" },
  { id: "team",       en: "Manage team",         ar: "إدارة الفريق" },
  { id: "settings",   en: "Platform settings",   ar: "إعدادات المنصة" },
];
function loadRevnuTeam() {
  return D.USERS.filter((u) => u.role === "revnu_admin").map((u) => ({ id: u.id, name: u.name, nameAr: u.nameAr || "", email: u.email, roleId: u.roleId || "team", perms: u.perms || null }));
}

function RevnuTeam() {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  useStoreVersion();
  const team = loadRevnuTeam();
  const [editing, setEditing] = useState(null); // member or {new:true}
  const roleById = (id) => REVNU_ROLES.find((r) => r.id === id) || REVNU_ROLES[REVNU_ROLES.length - 1];
  const permsFor = (m) => m.perms || roleById(m.roleId).perms;

  const save = (m) => {
    const RS = window.RevnuSupport;
    if (m.id) {
      RS.act(() => D.setDevUser(m.id, { name: m.name, nameAr: m.nameAr || null, roleId: m.roleId, perms: m.perms || null }), { pending: TL("Saving…", "جارٍ الحفظ…"), done: TL("Saved.", "تم الحفظ.") }).then((u) => { if (u) setEditing(null); });
    } else {
      RS.act(() => D.createDevUser({ name: m.name, nameAr: m.nameAr || null, email: m.email, role: "revnu_admin", roleId: m.roleId, perms: m.perms || null }), { pending: TL("Creating the account…", "جارٍ إنشاء الحساب…") })
        .then((u) => { if (!u) return; setEditing(null); RS.showCredentials({ name: u.name, email: u.email, password: u._tempPassword }); });
    }
  };
  const remove = (id) => { window.RevnuSupport.act(() => D.removeDevUser(id), { pending: TL("Removing…", "جارٍ الإزالة…"), done: TL("Removed.", "تمت الإزالة.") }); };
  const resetPw = (m) => { const RS = window.RevnuSupport; RS.act(() => D.resetUserPassword(m.id), { pending: TL("Issuing a temporary password…", "جارٍ إصدار كلمة مرور مؤقتة…") }).then((r) => { if (r) RS.showCredentials({ name: m.name, email: r.email || m.email, password: r.tempPassword, reset: true }); }); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{TL("My team", "فريقي")}</h1>
          <p className="page-sub">{TL("Revnu staff who can access this platform. Assign each member a role and fine-tune their permissions.", "موظفو Revnu الذين يمكنهم الوصول إلى المنصة. عين لكل عضو دورا واضبط صلاحياته.")}</p>
        </div>
        {revnuHasPerm("team") && <button className="btn btn-primary" onClick={() => setEditing({ _new: true, name: "", email: "", roleId: "team" })}>{TL("+ Add member", "+ إضافة عضو")}</button>}
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr>
            <th>{TL("Name", "الاسم")}</th><th>{TL("Email", "البريد")}</th><th>{TL("Role", "الدور")}</th>
            <th>{TL("Permissions", "الصلاحيات")}</th><th className="right">{TL("Actions", "إجراءات")}</th>
          </tr></thead>
          <tbody>
            {team.map((m) => {
              const r = roleById(m.roleId);
              const perms = permsFor(m);
              return (
                <tr key={m.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{(m.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                      <span style={{ fontWeight: 500 }}>{m.name}{me && m.id === me.id && <span className="soft" style={{ fontSize: 10.5, marginInlineStart: 6 }}>{TL("(you)", "(أنت)")}</span>}</span>
                    </div>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{m.email}</td>
                  <td><span className="chip chip-brand">{AR ? r.ar : r.en}</span></td>
                  <td>
                    {perms.length === 0
                      ? <span className="soft" style={{ fontSize: 12 }}>{TL("Read-only", "قراءة فقط")}</span>
                      : <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>{perms.map((p) => { const pm = REVNU_PERMS.find((x) => x.id === p); return <span key={p} className="chip" style={{ fontSize: 10.5 }}>{pm ? (AR ? pm.ar : pm.en) : p}</span>; })}</div>}
                  </td>
                  <td className="right">
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      {(CAN_DELETE_FN() || (me && m.id === me.id)) && <button className="btn btn-sm btn-ghost" onClick={() => setEditing(m)}>{TL("Edit", "تعديل")}</button>}
                      {CAN_DELETE_FN() && <button className="btn btn-sm btn-ghost" onClick={() => resetPw(m)}>{TL("Reset password", "إعادة تعيين كلمة المرور")}</button>}
                      {CAN_DELETE_FN() && !(me && m.id === me.id) && <button className="btn btn-sm btn-ghost" onClick={() => { if (confirm(TL("Remove " + m.name + " from the Revnu team? They will lose access immediately.", "إزالة " + (m.nameAr || m.name) + " من فريق Revnu؟ سيفقد الوصول فورًا.")) ) remove(m.id); }} style={{ color: "var(--negative, #c0492f)" }}>{TL("Remove", "إزالة")}</button>}
                      {!CAN_DELETE_FN() && !(me && m.id === me.id) && <span className="soft" style={{ fontSize: 11 }}>—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <RevnuMemberDrawer member={editing} onSave={save} onClose={() => setEditing(null)} />}
    </>
  );
}

function RevnuMemberDrawer({ member, onSave, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const baseRole = REVNU_ROLES.find((r) => r.id === member.roleId) || REVNU_ROLES[1];
  const [name, setName] = useState(member.name || "");
  const [nameAr, setNameAr] = useState(member.nameAr || "");
  const [email, setEmail] = useState(member.email || "");
  const [roleId, setRoleId] = useState(member.roleId || "ops");
  const [perms, setPerms] = useState(member.perms || baseRole.perms);
  const onRole = (id) => { setRoleId(id); setPerms((REVNU_ROLES.find((r) => r.id === id) || {}).perms || []); };
  const toggle = (p) => setPerms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  const valid = name.trim() && /@/.test(email);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.4)", zIndex: 300, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "100%", height: "100%", background: "var(--bg-card)", borderInlineStart: "1px solid var(--line)", overflowY: "auto", padding: 24 }}>
        <div className="row-between" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{member._new ? TL("Add team member", "إضافة عضو للفريق") : TL("Edit member", "تعديل العضو")}</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        <BiField label={TL("Full name", "الاسم الكامل")} en={name} ar={nameAr}
          onEn={setName} onAr={setNameAr} placeholder="e.g. Sara Al-Qahtani" placeholderAr="مثال: سارة القحطاني" />

        <label className="field-label">{TL("Email", "البريد الإلكتروني")}</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@revnu.sa" style={{ marginBottom: 14, direction: "ltr", textAlign: AR ? "right" : "left" }} />

        <label className="field-label">{TL("Role", "الدور")}</label>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {REVNU_ROLES.filter((r) => r.id !== "super_admin").map((r) => (
            <button key={r.id} type="button" onClick={() => onRole(r.id)}
              style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                       border: "1px solid " + (roleId === r.id ? "var(--brand)" : "var(--line-strong)"),
                       background: roleId === r.id ? "var(--brand)" : "transparent",
                       color: roleId === r.id ? "var(--brand-text)" : "var(--text-muted)" }}>{AR ? r.ar : r.en}</button>
          ))}
        </div>

        <label className="field-label">{TL("Permissions (صلاحيات)", "الصلاحيات")}</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, marginBottom: 24 }}>
          {REVNU_PERMS.map((p) => {
            const on = perms.includes(p.id);
            return (
              <label key={p.id} className="row" style={{ gap: 10, padding: "9px 11px", borderRadius: 8, cursor: "pointer", background: on ? "var(--brand-soft)" : "var(--bg-sunken)" }}>
                <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                <span style={{ fontSize: 13, fontWeight: on ? 600 : 400 }}>{AR ? p.ar : p.en}</span>
              </label>
            );
          })}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary grow" disabled={!valid} onClick={() => onSave({ ...member, _new: undefined, id: member.id, name: name.trim(), nameAr: nameAr.trim(), email: email.trim(), roleId, perms })}>{member._new ? TL("Add member", "إضافة العضو") : TL("Save changes", "حفظ التغييرات")}</button>
          <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
        </div>
        {!valid && <div className="soft" style={{ fontSize: 11.5, marginTop: 8 }}>{TL("Enter a name and a valid email.", "أدخل اسما وبريدا إلكترونيا صحيحا.")}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   Developers — list + drawer
============================================================ */
function Developers({ onOpen }) {
  const [open, setOpen] = useState(null);
  const [onboarding, setOnboarding] = useState(false);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{TT("Developers")}</h1>
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "مطورون بعلامتهم الخاصة على المنصة. لكل مساحة عمل مستقلة — الهوية والمشاريع والوحدات والتصاميم والباقات والتشغيل والمدفوعات والعقود." : "White-label tenants on the platform. Each has its own workspace — brand, projects, units, designs, packages, ops, payments and contracts, all isolated."}</p>
        </div>
        {revnuHasPerm("developers") && <button className="btn btn-primary" onClick={() => setOnboarding(true)}>+ Onboard developer</button>}
      </div>

      <div className="card card-flush">
        <table className="tbl tbl-clickable">
          <thead><tr>
            <th>{TT("Developer")}</th><th>{TT("Primary contact")}</th><th>{TT("Brand")}</th><th>{TT("Projects")}</th><th>{TT("Orders")}</th><th>{TT("Onboarded")}</th><th className="right">{TT("Actions")}</th>
          </tr></thead>
          <tbody>
            {D.DEVELOPERS.map((dv) => {
              const projects = D.PROJECTS.filter((p) => p.developerId === dv.id);
              const orders   = D.ORDERS.filter((o) => o.developerId === dv.id);
              return (
                <tr key={dv.id} onClick={() => onOpen(dv.id)}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 6, background: dv.brand.primary, color: dv.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{dv.initials}</span>
                      <div>
                        <div style={{ fontWeight: 500 }}>{dv.name}</div>
                        <div className="soft mono" style={{ fontSize: 11 }}>{dv.domain}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{dv.primaryContact}</div>
                    <div className="soft" style={{ fontSize: 11 }}>{dv.primaryEmail}</div>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, background: dv.brand.primary }} />
                      <span className="mono" style={{ fontSize: 11 }}>{dv.brand.primary}</span>
                    </div>
                  </td>
                  <td className="mono">{projects.length}</td>
                  <td className="mono">{orders.length}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{D.fmtDate(dv.onboarded)}</td>
                  <td className="right">
                    <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); onOpen(dv.id); }}>Open workspace</button>
                    <DelBtn kind="developer" id={dv.id} name={dv.name} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {onboarding && <OnboardWizard onClose={() => setOnboarding(false)} onCreated={(id) => { setOnboarding(false); onOpen(id); }} />}
    </>
  );
}

/* Per-project feature toggle card — used inside DevDrawer */
function FeatureToggleCard({ project }) {
  const [f, setF] = useState(project.features || { furnishing: true, smartHome: true, operations: true, fitout: false });
  const toggle = (k) => setF((prev) => ({ ...prev, [k]: !prev[k] }));
  const opts = [
    { id: "furnishing",   label: "Furnishing",     hint: "Design + package + smart-home steps" },
    { id: "fitout",       label: "Fit-out",        hint: "Optional turnkey fit-out add-on per package" },
    { id: "smartHome",    label: "Smart home",     hint: "Sub-step under furnishing" },
    { id: "kitchens",     label: "Kitchens",       hint: "3 designs × 3 palettes · cabinets-only or full with appliances" },
    { id: "cooling",      label: "Cooling / AC",   hint: "AC systems by brand · priced per room from each unit type's cooling points" },
    { id: "flooring",     label: "Flooring",       hint: "Floor & wall finishes by zone · priced per m² from each unit type's zone areas" },
    { id: "layout",       label: "Layout changes", hint: "Pre-approved wall & door changes per unit type · auto-priced per metre + door, flat override" },
    { id: "remote",       label: "Remote ordering", hint: "“Send to customer” link · buyer completes on the phone · rep confirms with one tap · e-signature on the buyer's phone" },
    { id: "operations",   label: "Operations",     hint: "Ops model + calculator + PM contract" },
  ];
  return (
    <div className="card card-pad">
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div>
          <strong>{project.name}</strong>
          <div className="soft" style={{ fontSize: 11 }}>{project.city} · {window.I18N && window.I18N.isAR ? "التسليم" : "delivers"} {project.delivery} · {project.totalUnits} {window.I18N && window.I18N.isAR ? "وحدة" : "units"}</div>
        </div>
      </div>
      <div className="stack-sm">
        {opts.map((o) => (
          <label key={o.id} className="row" style={{
            justifyContent: "space-between", gap: 12,
            padding: "8px 10px",
            background: f[o.id] ? "var(--bg-sunken)" : "transparent",
            border: "1px solid " + (f[o.id] ? "var(--line)" : "transparent"),
            borderRadius: "var(--r-sm)",
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{o.label}</div>
              <div className="soft" style={{ fontSize: 11 }}>{o.hint}</div>
            </div>
            <FeatureSwitch on={!!f[o.id]} onClick={() => toggle(o.id)} />
          </label>
        ))}
      </div>
    </div>
  );
}
function FeatureSwitch({ on, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 36, height: 22, padding: 0,
      borderRadius: 999,
      background: on ? "var(--brand)" : "var(--bg-strong)",
      border: 0, position: "relative",
      transition: "background 0.15s",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 16 : 2,
        width: 18, height: 18, borderRadius: "50%",
        background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        transition: "left 0.15s",
      }} />
    </button>
  );
}

function RevnuTermsEditor({ project, dev }) {
  const AR = window.I18N && window.I18N.isAR;
  const baseTerms = project ? D.revnuTermsForProject(project.id) : (dev && dev.revnuTerms);
  const [terms, setTerms] = useState(() => JSON.parse(JSON.stringify(baseTerms || { milestones: [] })));
  const [saved, setSaved] = useState(false);
  const sum = terms.milestones.reduce((a, m) => a + (Number(m.pct) || 0), 0);
  const ok = sum === 100 && terms.milestones.length > 0 && terms.milestones.every((m) => (m.label || "").trim() || (m.labelAr || "").trim());
  const touch = (fn) => { setSaved(false); setTerms(fn); };
  const setField = (id, patch) => touch((t) => ({ ...t, milestones: t.milestones.map((m) => m.id === id ? { ...m, ...patch } : m) }));
  const addLine = () => touch((t) => ({ ...t, milestones: [...t.milestones, { id: "m" + Date.now(), label: "", labelAr: "", pct: 0, trigger: "custom" }] }));
  const rmLine  = (id) => touch((t) => ({ ...t, milestones: t.milestones.filter((m) => m.id !== id) }));
  const save = () => {
    if (!ok) return;
    const clean = JSON.parse(JSON.stringify(terms));
    window.RevnuSupport.act(() => project ? D.setRevnuTermsForProject(project.id, clean) : D.setRevnuTerms(dev.id, clean), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ شروط الدفع." : "Payment terms saved." }).then((r) => { if (r !== undefined) setSaved(true); });
  };
  return (
    <div style={{ marginTop: 22, padding: "16px 16px 14px", border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--bg-sunken)" }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{AR ? "// شروط الدفع ل REVNU" : "// REVNU PAYMENT TERMS"}</div>
      <p className="soft" style={{ fontSize: 11.5, margin: "0 0 12px", lineHeight: 1.5 }}>
        {AR
          ? "كيف يسدد هذا المشروع ل Revnu قيمة التأثيث / الذكي / التشغيل لكل طلب. أضف ما تشاء من الدفعات — الأسماء والنسب حرة، ويجب أن يكون مجموعها 100%."
          : "How this project settles each order's furnishing / smart / operations addendum with Revnu. Add as many milestones as you need — labels and percentages are free-form, and must total 100%."}
      </p>
      <div className="stack-sm">
        {terms.milestones.map((m, i) => (
          <div key={m.id} className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="mono soft" style={{ fontSize: 11, width: 18 }}>{String(i + 1).padStart(2, "0")}</span>
            <div style={{ flex: 1 }}>
              <BiField en={m.label} ar={m.labelAr}
                onEn={(v) => setField(m.id, { label: v })} onAr={(v) => setField(m.id, { labelAr: v })}
                placeholder="e.g. On signing" placeholderAr="مثال: عند التوقيع" />
            </div>
            <input className="input mono" type="number" min="0" max="100" value={m.pct}
                   onChange={(e) => setField(m.id, { pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                   style={{ width: 64, height: 32, textAlign: "right" }} />
            <span className="soft" style={{ fontSize: 12 }}>%</span>
            <button className="btn btn-sm btn-ghost" title={AR ? "حذف الدفعة" : "Remove milestone"} onClick={() => rmLine(m.id)} style={{ padding: "0 8px" }}>×</button>
          </div>
        ))}
        {terms.milestones.length === 0 && <div className="soft" style={{ fontSize: 12, padding: "6px 0" }}>{AR ? "لا توجد دفعات بعد — أضف واحدة أدناه." : "No milestones yet — add one below."}</div>}
      </div>
      <div className="row-between" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
        <button className="btn btn-secondary btn-sm" onClick={addLine}>{AR ? "+ إضافة دفعة" : "+ Add milestone"}</button>
        <span className={"chip " + (sum === 100 ? "chip-positive" : "chip-warning")}>Σ {sum}%</span>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12, alignItems: "center" }}>
        <button className="btn btn-primary btn-sm" disabled={!ok} onClick={save}>{AR ? "حفظ الشروط" : "Save terms"}</button>
        {saved && <span className="soft" style={{ fontSize: 12, color: "var(--positive, #1f8a5b)" }}>{AR ? "✓ تم الحفظ لهذه الجلسة" : "✓ Saved for this session"}</span>}
        {!ok && sum !== 100 && <span className="soft" style={{ fontSize: 12, color: "var(--warning, #b8860b)" }}>{AR ? "يجب أن يكون المجموع 100%" : "Must total 100%"}</span>}
        {!ok && sum === 100 && <span className="soft" style={{ fontSize: 12, color: "var(--warning, #b8860b)" }}>{AR ? "كل دفعة تحتاج اسما" : "Every milestone needs a name"}</span>}
      </div>
    </div>
  );
}

function DevDrawer({ dev, onClose }) {
  const projects = D.PROJECTS.filter((p) => p.developerId === dev.id);
  const packages = D.PACKAGES.filter((p) => p.developerId === dev.id);
  const ops      = D.OPS_MODELS.filter((o) => o.developerId === dev.id);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 100, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 540, background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div className="row" style={{ gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, background: dev.brand.primary, color: dev.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>{dev.initials}</span>
            <div>
              <div className="display-sm">{dev.name}</div>
              <div className="mono soft" style={{ fontSize: 11 }}>{dev.crNumber}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>

        <div style={{ padding: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>Brand</h3>
          <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label style={{ fontSize: 11, color: "var(--text-soft)" }}>Primary color</label>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 6, background: dev.brand.primary, border: "1px solid var(--line)" }} />
                <input className="input mono" defaultValue={dev.brand.primary} />
              </div>
            </div>
            <div className="field">
              <label style={{ fontSize: 11, color: "var(--text-soft)" }}>Deep / hover</label>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 6, background: dev.brand.deep, border: "1px solid var(--line)" }} />
                <input className="input mono" defaultValue={dev.brand.deep} />
              </div>
            </div>
          </div>

          <RevnuTermsEditor dev={dev} />

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "22px 0 8px" }}>Projects · feature toggles</h3>
          <div className="stack-md">
            {projects.map((p) => (
              <FeatureToggleCard key={p.id} project={p} />
            ))}
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "22px 0 8px" }}>Packages · {packages.length}</h3>
          <div className="stack-sm">
            {packages.map((p) => (
              <div key={p.id} className="card card-pad">
                <strong>{p.name}</strong> <span className="soft">· {p.tier}</span>
                <div className="muted" style={{ fontSize: 12 }}>{p.summary}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "22px 0 8px" }}>Operations · {ops.length}</h3>
          <div className="stack-sm">
            {ops.map((o) => (
              <div key={o.id} className="card card-pad">
                <strong>{o.name}</strong> <span className="soft">· fee {o.mgmtFee}%</span>
                <div className="muted" style={{ fontSize: 12 }}>{o.summary}</div>
              </div>
            ))}
          </div>

          <div className="soft" style={{ fontSize: 11.5, marginTop: 18 }}>{window.I18N && window.I18N.isAR ? "بوابات المطور تفتح بحسابات فريقه فقط — من صفحة الدخول الخاصة به." : "The developer's portals open only with their own team accounts — from their sign-in page."}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Projects & inventory
============================================================ */
function Inventory() {
  const [devF, setDevF] = useState("all");
  const [stat, setStat] = useState("all");

  const projects = D.PROJECTS.filter((p) => devF === "all" || p.developerId === devF);
  const all = D.UNITS.filter((u) => projects.some((p) => p.id === u.projectId));
  const filtered = all.filter((u) => stat === "all" || u.status === stat);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Projects & units</h1>
          <p className="page-sub">Inventory across the whole platform. This is what Revnu sets up for each developer.</p>
        </div>
        <button className="btn btn-primary">{window.I18N?window.I18N.t("+ Add unit"):"+ Add unit"}</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select className="select" style={{ width: "auto" }} value={devF} onChange={(e) => setDevF(e.target.value)}>
          <option value="all">All developers</option>
          {D.DEVELOPERS.map((dv) => <option key={dv.id} value={dv.id}>{dv.name}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={stat} onChange={(e) => setStat(e.target.value)}>
          <option value="all">Any status</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </select>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-soft)" }}>{filtered.length} {window.I18N && window.I18N.isAR ? "وحدة" : "units"}</span>
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr><th>{TT("Unit #")}</th><th>{TT("Developer")}</th><th>{TT("Project")}</th><th>{TT("Type")}</th><th>{TT("Tower / Floor")}</th><th>{TT("Area")}</th><th>{TT("Base price")}</th><th className="right">{TT("Status")}</th></tr></thead>
          <tbody>
            {filtered.map((u) => {
              const t = D.unitTypeById(u.typeId);
              const p = D.projById(u.projectId);
              const dv = D.devById(p?.developerId);
              const price = (t?.basePrice || 0) + (u.priceAdj || 0);
              const cls = u.status === "available" ? "chip chip-positive"
                        : u.status === "reserved"  ? "chip chip-warning"
                        : "chip";
              return (
                <tr key={u.number}>
                  <td className="mono" style={{ fontWeight: 600 }}>{u.number}</td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, background: dv?.brand.primary, color: dv?.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{dv?.initials}</span>
                      <span>{dv?.name}</span>
                    </div>
                  </td>
                  <td>{p?.name}</td>
                  <td>{t?.name}</td>
                  <td>{u.tower} · {u.floor}</td>
                  <td className="mono">{t?.area} m²</td>
                  <td className="mono">{D.fmtSAR(price)}</td>
                  <td className="right"><span className={cls} style={{ textTransform: "capitalize" }}>{window.I18N ? window.I18N.t(u.status) : u.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ============================================================
   Packages
============================================================ */
function Packages() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Furnishing packages</h1>
          <p className="page-sub">One row per package. Pricing is per unit type.</p>
        </div>
        <button className="btn btn-primary">+ New package</button>
      </div>

      <div className="stack-md">
        {D.PACKAGES.map((p) => {
          const dv = D.devById(p.developerId);
          return (
            <div key={p.id} className="card card-pad-lg">
              <div className="row-between">
                <div className="row" style={{ gap: 14 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 8, background: dv?.brand.primary, color: dv?.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{dv?.initials}</span>
                  <div>
                    <div className="row" style={{ gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{p.name}</h3>
                      <span className="chip">{p.tier}</span>
                      <span className="soft" style={{ fontSize: 12 }}>· {dv?.name}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{p.summary}</div>
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-sm btn-secondary">Edit</button>
                  <button className="btn btn-sm btn-ghost">⋯</button>
                </div>
              </div>

              <hr className="hr-thin" style={{ margin: "16px 0" }} />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {Object.entries(p.pricing).map(([typeId, price]) => {
                  const t = D.unitTypeById(typeId);
                  return (
                    <div key={typeId} className="card card-pad" style={{ background: "var(--bg-sunken)", boxShadow: "none" }}>
                      <div className="soft" style={{ fontSize: 11, fontWeight: 600 }}>{t?.name}</div>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{D.fmtSAR(price)}<span className="soft" style={{ fontSize: 10, marginLeft: 4 }}>SAR</span></div>
                    </div>
                  );
                })}
              </div>

              <div className="row" style={{ gap: 18, marginTop: 14, fontSize: 12, color: "var(--text-muted)" }}>
                <span>{p.pieces} pieces</span>
                <span>{p.warranty}-year warranty</span>
                <span>{p.designs.length} design styles · {p.designs.join(", ")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ============================================================
   Operating models
============================================================ */
function OpsModels() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Operating models</h1>
          <p className="page-sub">The rental modes Revnu offers each developer's units. Fee, occupancy band, default rate per unit type.</p>
        </div>
        <button className="btn btn-primary">+ New model</button>
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr><th>{TT("Developer")}</th><th>{TT("Model")}</th><th>{TT("Kind")}</th><th>{TT("Operator fee")}</th><th>{TT("Occupancy band")}</th><th className="right">{TT("Actions")}</th></tr></thead>
          <tbody>
            {D.OPS_MODELS.map((o) => {
              const dv = D.devById(o.developerId);
              return (
                <tr key={o.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, background: dv?.brand.primary, color: dv?.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{dv?.initials}</span>
                      <span>{dv?.name}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{o.name}</div>
                    <div className="soft" style={{ fontSize: 11 }}>{o.summary}</div>
                  </td>
                  <td><span className="chip">{o.kind === "daily" ? "Nightly" : "Monthly+"}</span></td>
                  <td className="mono">{o.mgmtFee}%</td>
                  <td className="mono">{o.occLow}% – {o.occHigh}%</td>
                  <td className="right"><button className="btn btn-sm btn-secondary">Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ============================================================
   All orders
============================================================ */
function AllOrders() {
  const [openOrder, setOpenOrder] = useState(null);
  const [devF, setDevF] = useState("all");
  const [statF, setStatF] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = D.ORDERS.filter((o) => {
    if (devF !== "all" && o.developerId !== devF) return false;
    if (statF === "all" ? o.status === "cancelled" : o.status !== statF) return false;
    const q = query.trim().toLowerCase();
    if (q && ![o.id, o.customerName, ...(o.unitNumbers || [o.unitNumber])].some((x) => (x || "").toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{TT("All orders")}</h1>
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "كل الطلبات عبر جميع المطورين." : "Every order across every developer."}</p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" style={{ width: "auto" }} value={devF} onChange={(e) => setDevF(e.target.value)}>
          <option value="all">All developers</option>
          {D.DEVELOPERS.map((dv) => <option key={dv.id} value={dv.id}>{dv.name}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={statF} onChange={(e) => setStatF(e.target.value)}>
          <option value="all">{window.I18N && window.I18N.isAR ? "أي حالة" : "Any status"}</option>
          {["active", "issued", "signed", "paid", "cancelled"].map((st) => <option key={st} value={st}>{window.I18N && window.I18N.isAR ? D.ORDER_STATUS_META[st].ar : D.ORDER_STATUS_META[st].en}</option>)}
        </select>
        <input className="input" style={{ width: 240 }} placeholder={window.I18N && window.I18N.isAR ? "بحث: مرجع، عميل، وحدة…" : "Search ref, customer, unit…"} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span style={{ marginInlineStart: "auto", fontSize: 12, color: "var(--text-soft)" }}>{filtered.length} {window.I18N && window.I18N.isAR ? "طلب" : "orders"}</span>
        <button className="btn btn-sm btn-secondary" onClick={() => D.downloadCSV("all-orders.csv", filtered, [{ key: "id", label: "Ref" }, { label: "Developer", get: (o) => D.devById(o.developerId)?.name || "" }, { label: "Customer", get: (o) => o.customerName }, { label: "Units", get: (o) => (o.unitNumbers || [o.unitNumber]).join(" ") }, { key: "createdAt", label: "Date" }, { key: "furnishCost", label: "Extras (SAR)" }, { label: "Owed to Revnu (SAR)", get: (o) => D.isCustomerPaid(o) ? D.revnuPayableForOrder(o) : 0 }, { key: "status", label: "Status" }])}>{TT("Export CSV")}</button>
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr><th>{TT("Ref")}</th><th>{TT("Developer")}</th><th>{TT("Customer")}</th><th>{TT("Unit")}</th><th>{TT("Date")}</th><th className="right">{TT("Extras")}</th><th className="right">{TT("Status")}</th></tr></thead>
          <tbody>
            {filtered.map((o) => {
              const dv = D.devById(o.developerId);
              return (
                <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => setOpenOrder(o)}>
                  <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{o.id}</td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, background: dv?.brand.primary, color: dv?.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{dv?.initials}</span>
                      <span>{dv?.name}</span>
                    </div>
                  </td>
                  <td>{o.customerName}</td>
                  <td className="mono">{(o.unitNumbers && o.unitNumbers.length ? o.unitNumbers : [o.unitNumber]).join(" · ")}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{D.fmtDate(o.createdAt)}</td>
                  <td className="right mono">{D.fmtSAR(o.furnishCost)}</td>
                  <td className="right"><span className={STATUS_CHIP[o.status]} style={{ textTransform: "capitalize" }}>{window.I18N ? window.I18N.t(o.status) : o.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {openOrder && <OrderDrawer order={openOrder} onClose={() => setOpenOrder(null)} />}
    </>
  );
}

/* ============================================================
   Interested — leads from the marketing site
============================================================ */
function Interested() {
  useStoreVersion();
  const leads = D.getInterested();
  const [statF, setStatF] = useState("all");

  const statusOpts = [
    { id: "all",          label: "All" },
    { id: "new",          label: "New" },
    { id: "qualified",    label: "Qualified" },
    { id: "in_proposal",  label: "In proposal" },
    { id: "onboarded",    label: "Onboarded" },
    { id: "passed",       label: "Passed" },
  ];
  const chipFor = (s) => ({
    new: "chip chip-cyan",
    qualified: "chip chip-warning",
    in_proposal: "chip chip-brand",
    onboarded: "chip chip-positive",
    passed: "chip",
  }[s] || "chip");

  const filtered = leads.filter((l) => statF === "all" || l.status === statF);
  const counts = {
    all: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    qualified: leads.filter((l) => l.status === "qualified").length,
    in_proposal: leads.filter((l) => l.status === "in_proposal").length,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N && window.I18N.isAR ? "المطورون المهتمون" : "Interested developers"}</h1>
          <p className="page-sub">Leads from the marketing site and direct outreach. Move them through the pipeline.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => D.downloadCSV("interested-developers.csv", D.getInterested(), [{ key: "createdAt", label: "Submitted" }, { key: "name", label: "Name" }, { key: "role", label: "Role" }, { key: "company", label: "Company" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "city", label: "City" }, { key: "units", label: "Project size" }, { key: "status", label: "Status" }, { key: "notes", label: "Notes" }])}>{window.I18N?window.I18N.t("Export CSV"):"Export CSV"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <Stat label="Total leads"  value={counts.all} />
        <Stat label="New"          value={counts.new}        delta="not yet qualified" />
        <Stat label="Qualified"    value={counts.qualified}  delta="needs proposal" />
        <Stat label="In proposal"  value={counts.in_proposal} delta="closing window" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>Filter</span>
        {statusOpts.map((s) => (
          <button key={s.id} className={"btn btn-sm " + (statF === s.id ? "btn-primary" : "btn-secondary")} onClick={() => setStatF(s.id)}>{s.label}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-soft)" }}>{filtered.length} matching</span>
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr>
            <th>{TT("Contact")}</th><th>{TT("Phone")}</th><th>{TT("Company")}</th><th>{TT("City")}</th><th>{TT("Project size")}</th><th>{TT("Submitted")}</th><th>{TT("Notes")}</th><th className="right">{TT("Status")}</th>
          </tr></thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{l.name}</div>
                  <div className="soft" style={{ fontSize: 11 }}>{l.role || "—"} · {l.email}</div>
                </td>
                <td className="mono" style={{ fontSize: 12.5 }}>{l.phone || "—"}</td>
                <td><strong>{l.company}</strong></td>
                <td>{l.city || "—"}</td>
                <td className="mono">{l.units || "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>{D.fmtDate(l.createdAt)}</td>
                <td style={{ maxWidth: 240, fontSize: 12.5, color: "var(--text-muted)" }}>{l.notes || "—"}</td>
                <td className="right">
                  <select className="select" style={{ width: 130, height: 28, fontSize: 12 }} value={l.status}
                          onChange={(e) => { window.RevnuSupport.act(() => D.setLeadStatus(l.id, e.target.value)); }}>
                    <option value="new">New</option>
                    <option value="qualified">Qualified</option>
                    <option value="in_proposal">In proposal</option>
                    <option value="onboarded">Onboarded</option>
                    <option value="passed">Passed</option>
                  </select>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", padding: 36, color: "var(--text-soft)" }}>No leads match.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>
        New leads come from the request-access form on the marketing site.
      </p>
    </>
  );
}

/* ============================================================
   Payment plans — per developer, fully customisable
============================================================ */
function PaymentPlansAdmin() {
  const [devF, setDevF] = useState("all");
  const filtered = D.PAYMENT_PLANS.filter((p) => devF === "all" || p.developerId === devF);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Payment plans</h1>
          <p className="page-sub">Fully customisable per developer. Add discounts for upfront, surcharges for instalments.</p>
        </div>
        <button className="btn btn-primary">+ New plan</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>Developer</span>
        <button className={"btn btn-sm " + (devF === "all" ? "btn-primary" : "btn-secondary")} onClick={() => setDevF("all")}>All</button>
        {D.DEVELOPERS.map((dv) => (
          <button key={dv.id} className={"btn btn-sm " + (devF === dv.id ? "btn-primary" : "btn-secondary")} onClick={() => setDevF(dv.id)}>{dv.name}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-soft)" }}>{filtered.length} plans</span>
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr>
            <th>{TT("Developer")}</th><th>{TT("Name")}</th><th>Schedule</th><th className="right">Discount / surcharge</th><th>{TT("Notes")}</th><th className="right">{TT("Actions")}</th>
          </tr></thead>
          <tbody>
            {filtered.map((p) => {
              const dv = D.devById(p.developerId);
              const delta = (p.disc * 100).toFixed(0);
              const deltaCls = p.disc < 0 ? "chip chip-positive" : p.disc > 0 ? "chip chip-warning" : "chip";
              return (
                <tr key={p.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, background: dv?.brand.primary, color: dv?.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{dv?.initials}</span>
                      <span>{dv?.name}</span>
                    </div>
                  </td>
                  <td><strong>{p.name}</strong></td>
                  <td style={{ fontSize: 12.5 }}>{p.schedule}</td>
                  <td className="right"><span className={deltaCls}>{p.disc < 0 ? delta + "% off" : p.disc > 0 ? "+" + delta + "%" : "Flat"}</span></td>
                  <td className="muted" style={{ fontSize: 12 }}>{p.note}</td>
                  <td className="right"><button className="btn btn-sm btn-secondary">Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ============================================================
   Contracts — auto-fill templates per developer
============================================================ */
function ContractsAdmin() {
  const [devF, setDevF] = useState("all");
  const filtered = D.CONTRACTS.filter((c) => devF === "all" || c.developerId === devF);
  const kindLabel = (k) => ({ sale: "Sale", furnish: "Furnishing", ops: "Operations", kyc: "KYC" }[k] || k);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Contract templates</h1>
          <p className="page-sub">Each developer's own templates, kept current by Revnu. Auto-filled from the order data — buyer signs with the developer.</p>
        </div>
        <button className="btn btn-primary">+ Upload template</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>Developer</span>
        <button className={"btn btn-sm " + (devF === "all" ? "btn-primary" : "btn-secondary")} onClick={() => setDevF("all")}>All</button>
        {D.DEVELOPERS.map((dv) => (
          <button key={dv.id} className={"btn btn-sm " + (devF === dv.id ? "btn-primary" : "btn-secondary")} onClick={() => setDevF(dv.id)}>{dv.name}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-soft)" }}>{filtered.length} templates</span>
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr>
            <th>{TT("Developer")}</th><th>{TT("Template")}</th><th>{TT("Kind")}</th><th>{TT("Parties")}</th><th>{TT("Version")}</th><th>{TT("Updated")}</th><th className="right">{TT("Actions")}</th>
          </tr></thead>
          <tbody>
            {filtered.map((c) => {
              const dv = D.devById(c.developerId);
              return (
                <tr key={c.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, background: dv?.brand.primary, color: dv?.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{dv?.initials}</span>
                      <span>{dv?.name}</span>
                    </div>
                  </td>
                  <td><strong>{c.name}</strong></td>
                  <td><span className="chip">{kindLabel(c.kind)}</span></td>
                  <td className="muted" style={{ fontSize: 12 }}>{window.I18N && window.I18N.isAR ? "المشتري ↔ " : "Buyer ↔ "}{dv?.name}</td>
                  <td className="mono">{c.version}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{D.fmtDate(c.updated)}</td>
                  <td className="right">
                    <button className="btn btn-sm btn-secondary">Preview</button>
                    <button className="btn btn-sm btn-ghost">Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ============================================================
   Developer Workspace — full per-tenant configuration
   Tabs: Brand · Projects · Designs · Packages · Smart · Payments · Operations · Contracts · Team · Orders
============================================================ */
function DeveloperWorkspace({ devId, onBack }) {
  const dv = D.devById(devId);
  const [tab, setTab] = useState("brand");
  const [projectId, setProjectId] = useState(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const T  = useMemo(() => D.scopedTo(devId), [devId, version]);

  if (!dv) return <div className="card card-pad">Developer not found.</div>;

  const TABS = [
    { id: "brand",     label: "Brand & onboarding" },
    { id: "revnuterms", label: "Revnu payment terms" },
    { id: "commissions", label: "Sales commissions" },
    { id: "plan",      label: "Plan & billing" },
    { id: "projects",  label: "Projects" },
    { id: "team",      label: "Team" },
    { id: "orders",    label: "Orders" },
  ];

  if (projectId) {
    return <ProjectWorkspace dv={dv} projectId={projectId} onBackToDev={() => setProjectId(null)} onBackToList={onBack} />;
  }

  return (
    <>
      {/* Workspace header */}
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← All developers</button>
      </div>
      <div className="card card-pad-lg" style={{ marginBottom: 16, background: "linear-gradient(135deg, " + dv.brand.primary + " 0%, " + dv.brand.deep + " 100%)", color: "#fff", border: 0 }}>
        <div className="row-between" style={{ alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div className="row" style={{ gap: 14 }}>
            <span style={{
              width: 52, height: 52, borderRadius: 12,
              background: "rgba(255,255,255,0.18)", color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22,
            }}>{dv.initials}</span>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.012em" }}>{dv.name}</div>
              <div className="mono" style={{ fontSize: 11, opacity: 0.85, letterSpacing: "0.06em" }}>{dv.domain} · {window.I18N && window.I18N.isAR ? "انضم " : "onboarded "}{D.fmtDate(dv.onboarded)}</div>
            </div>
          </div>
          <div className="mono" style={{ fontSize: 11, opacity: 0.75 }}>{dv.domain}</div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} className={"tab " + (tab === t.id ? "active" : "")} onClick={() => setTab(t.id)}>{TT(t.label)}</button>
        ))}
      </div>

      {tab === "brand"    && <WsBrand    dv={dv} />}
      {tab === "revnuterms" && (
        <div className="card card-pad-lg">
          <WsCardHead eye="// REVNU ↔ DEVELOPER" title={window.I18N && window.I18N.isAR ? "ما يدفعه هذا المطور ل Revnu" : "What this developer pays Revnu"}
            sub={window.I18N && window.I18N.isAR ? "يحصل المطور قيمة التأثيث من المشتري ضمن سعر الوحدة، ثم يسويها مع Revnu وفق الشروط أدناه — لكل مشروع شروطه الخاصة." : "The developer collects the furnishing value inside the unit price, then settles it with Revnu on the terms below. Each project has its own terms."} />
          {D.PROJECTS.filter((p) => p.developerId === dv.id).map((p) => (
            <div key={p.id} style={{ marginTop: 8 }}>
              <div className="row" style={{ gap: 8, alignItems: "baseline", marginTop: 14 }}>
                <strong style={{ fontSize: 14 }}>{(window.I18N && window.I18N.isAR && p.nameAr) ? p.nameAr : p.name}</strong>
                <span className="mono soft" style={{ fontSize: 11 }}>{p.city}</span>
              </div>
              <div style={{ maxWidth: 560 }}>
                <RevnuTermsEditor project={p} />
              </div>
            </div>
          ))}
          {D.PROJECTS.filter((p) => p.developerId === dv.id).length === 0 && (
            <div className="soft" style={{ fontSize: 13, marginTop: 12 }}>{window.I18N && window.I18N.isAR ? "لا توجد مشاريع بعد." : "No projects yet."}</div>
          )}
        </div>
      )}
      {tab === "projects" && <WsProjects dv={dv} T={T} onOpenProject={setProjectId} onChange={bump} />}
      {tab === "team"     && <WsTeam     T={T} />}
      {tab === "commissions" && <WsCommissions dv={dv} />}
      {tab === "plan"     && <WsPlan dv={dv} />}
      {tab === "orders"   && <WsOrders   T={T} onChange={bump} />}
    </>
  );
}

const WS_AR = {
  // eyebrows
  "// REVNU ↔ DEVELOPER": "// Revnu ↔ المطور", "// BRAND": "// الهوية", "// PROJECTS": "// المشاريع",
  "// DESIGNS": "// التصاميم", "// FURNISHING PACKAGES": "// باقات التأثيث", "// SMART HOME": "// المنزل الذكي",
  "// OPERATIONS": "// التشغيل", "// CONTRACTS": "// العقود", "// TEAM": "// الفريق", "// ORDERS": "// الطلبات",
  "// PROJECT SETTINGS": "// إعدادات المشروع", "// UNIT TYPES": "// أنواع الوحدات", "// UNITS": "// الوحدات",
  // titles
  "What this developer pays Revnu": "ما يدفعه هذا المطور ل Revnu",
  "Brand & onboarding details": "تفاصيل الهوية والإعداد",
  "Projects · each fully configurable": "المشاريع · كل قابل للتهيئة بالكامل",
  "Design library": "مكتبة التصاميم",
  "Packages · per-type pricing · BOQ": "الباقات · تسعير حسب النوع · جدول الكميات",
  "Smart-home tiers": "باقات المنزل الذكي",
  "Operating models": "نماذج التشغيل",
  "Contract templates": "نماذج العقود",
  "Users & roles": "المستخدمون والأدوار",
  "Project details, commercials & features": "تفاصيل المشروع والشروط التجارية والميزات",
  "Type media — floor plan, 3D render & masterplan": "وسائط النوع — المخطط، الرندر ثلاثي الأبعاد والمخطط العام",
  // subs
  "The developer collects the furnishing value from the buyer inside the unit price, then settles it with Revnu on the terms below. Applied to every order under this developer.": "يحصل المطور قيمة التأثيث من المشتري ضمن سعر الوحدة، ثم يسويها مع Revnu وفق الشروط أدناه. تنطبق على كل طلب لدى هذا المطور.",
  "Logo, colors, legal entity and primary contact. This is what the sales portal will look like to their customers.": "الشعار والألوان والكيان القانوني وجهة الاتصال. هكذا ستبدو بوابة المبيعات لعملائهم.",
  "Design library": "مكتبة التصاميم",
  "Add, edit, change status. Status changes show up live for the developer's sales team.": "أضف وعدل وغير الحالة. تظهر تغييرات الحالة مباشرة لفريق مبيعات المطور.",
};

function WsCardHead({ eye, title, sub, action }) {
  const ar = window.I18N && window.I18N.isAR;
  const tr = (s) => (ar && s && WS_AR[s]) ? WS_AR[s] : s;
  eye = tr(eye); title = tr(title); sub = tr(sub);
  return (
    <div className="row-between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
      <div>
        <div className="eyebrow">{eye}</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 22, letterSpacing: "-0.008em", margin: "2px 0 4px" }}>{title}</h2>
        {sub && <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: 640 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ----- Brand & onboarding ----- */
function WsBrand({ dv }) {
  const [primary, setPrimary] = useState(dv.brand.primary);
  const [deep, setDeep]       = useState(dv.brand.deep);
  const [name, setName]       = useState(dv.name || "");
  const [nameAr, setNameAr]   = useState(dv.nameAr || "");
  const [signer, setSigner]   = useState(dv.authorizedSigner || "");
  const [signerAr, setSignerAr] = useState(dv.authorizedSignerAr || "");
  const [signerTitle, setSignerTitle]     = useState(dv.authorizedSignerTitle || "");
  const [signerTitleAr, setSignerTitleAr] = useState(dv.authorizedSignerTitleAr || "");
  const AR = window.I18N && window.I18N.isAR;
  const [legalName, setLegalName]     = useState(dv.legalName || "");
  const [legalNameAr, setLegalNameAr] = useState(dv.legalNameAr || "");
  // QA: these fields were rendered but never saved (uncontrolled inputs); the colours were state only.
  const [tagline, setTagline]   = useState(dv.tagline || "");
  const [crNumber, setCrNumber] = useState(dv.crNumber || "");
  const [vat, setVat]           = useState(dv.vat || "");
  const [contact, setContact]   = useState(dv.primaryContact || "");
  const [email, setEmail]       = useState(dv.primaryEmail || "");
  const [domain, setDomain]     = useState(dv.domain || "");
  const soft = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ""); return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},0.10)` : dv.brand.soft; };
  const saveName = () => {
    const hexOk = (v) => /^#[0-9a-f]{6}$/i.test(v.trim());
    const brand = { ...dv.brand, primary: hexOk(primary) ? primary.trim() : dv.brand.primary, deep: hexOk(deep) ? deep.trim() : dv.brand.deep };
    brand.soft = soft(brand.primary);
    window.RevnuSupport.act(() => D.patchDeveloper(dv.id, { name, nameAr, legalName: legalName.trim() || null, legalNameAr: legalNameAr.trim() || null, authorizedSigner: signer, authorizedSignerAr: signerAr, authorizedSignerTitle: signerTitle, authorizedSignerTitleAr: signerTitleAr,
      tagline: tagline.trim() || null, crNumber: crNumber.trim() || null, vat: vat.trim() || null, primaryContact: contact.trim() || null, primaryEmail: email.trim().toLowerCase() || null, domain: domain.trim() || null, brand }), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ بيانات المطوّر." : "Developer details saved." });
  };
  return (
    <>
      <WsCardHead eye="// BRAND" title="Brand & onboarding details" sub="Logo, colors, legal entity and primary contact. This is what the sales portal will look like to their customers." />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
        <div className="card card-pad-lg">
          <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("LEGAL ENTITY")}</div>
          <BiField label={AR ? "اسم المطور (الهوية في المنصة)" : "Developer name (brand shown across the platform)"} en={name} ar={nameAr}
            onEn={setName} onAr={setNameAr} placeholder="Developer name" placeholderAr="اسم المطور بالعربية" />
          <BiField label={AR ? "الاسم القانوني (يظهر في العقود فقط)" : "Legal entity name (contracts only)"} en={legalName} ar={legalNameAr}
            onEn={setLegalName} onAr={setLegalNameAr} placeholder="e.g. Grova Tilal Real Estate Development Company" placeholderAr="مثال: شركة جروفا تلال للتطوير العقاري" />
          <BiField label={AR ? "المفوض بالتوقيع (يظهر في العقد)" : "Authorised signatory (appears on the contract)"} en={signer} ar={signerAr}
            onEn={setSigner} onAr={setSignerAr} placeholder="e.g. Abdullah Najjar" placeholderAr="مثال: عبدالله النجار" />
          <BiField label={AR ? "المنصب / الصفة (يظهر تحت التوقيع)" : "Signatory title (appears under the signature)"} en={signerTitle} ar={signerTitleAr}
            onEn={setSignerTitle} onAr={setSignerTitleAr} placeholder="e.g. Chief Executive Officer" placeholderAr="مثال: الرئيس التنفيذي" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Tagline"><input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} /></Labeled>
            <Labeled label="CR Number"><input className="input mono" value={crNumber} onChange={(e) => setCrNumber(e.target.value)} /></Labeled>
            <Labeled label="VAT"><input className="input mono" value={vat} onChange={(e) => setVat(e.target.value)} /></Labeled>
            <Labeled label="Primary contact"><input className="input" value={contact} onChange={(e) => setContact(e.target.value)} /></Labeled>
            <Labeled label="Email"><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Labeled>
            <Labeled label="Subdomain"><input className="input mono" value={domain} onChange={(e) => setDomain(e.target.value)} /></Labeled>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn btn-primary" onClick={saveName}>Save</button>
            <button className="btn btn-ghost">{window.I18N?window.I18N.t("Discard"):"Discard"}</button>
          </div>
        </div>
        <div className="card card-pad-lg">
          <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("BRAND COLORS")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label="Primary">
              <div className="row" style={{ gap: 8 }}>
                <span style={{ width: 32, height: 32, borderRadius: 6, background: primary, border: "1px solid var(--line)" }} />
                <input className="input mono" value={primary} onChange={(e) => setPrimary(e.target.value)} />
              </div>
            </Labeled>
            <Labeled label="Deep / hover">
              <div className="row" style={{ gap: 8 }}>
                <span style={{ width: 32, height: 32, borderRadius: 6, background: deep, border: "1px solid var(--line)" }} />
                <input className="input mono" value={deep} onChange={(e) => setDeep(e.target.value)} />
              </div>
            </Labeled>
          </div>
          <hr className="hr-thin" style={{ margin: "14px 0" }} />
          <div className="eyebrow" style={{ marginBottom: 10 }}>{AR ? "الشعار" : "LOGO"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <DevLogoSlot dv={dv} field="logo" label={AR ? "ملون (خلفية فاتحة)" : "Full-color (light bg)"} darkPreview={false} />
            <DevLogoSlot dv={dv} field="logoDark" label={AR ? "للوضع الداكن (خلفية داكنة)" : "Dark-mode (dark bg)"} darkPreview={true} />
          </div>
          <div className="soft" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>{AR ? "يستخدم الشعار الملون على الخلفيات الفاتحة (الترويسات)، والنسخة الداكنة على الخلفيات الداكنة (غلاف العقد)." : "Full-color shows on light backgrounds (letterheads); the dark-mode logo shows on dark backgrounds (e.g. the contract cover)."}</div>
          <div style={{ marginTop: 14, padding: 14, borderRadius: "var(--r-md)", background: primary, color: "#fff" }}>
            <div className="row" style={{ gap: 10 }}>
              <span style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.2)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{dv.initials}</span>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 500 }}>{dv.name}</div>
            </div>
            <div className="mono" style={{ fontSize: 10, opacity: 0.85, marginTop: 6, letterSpacing: "0.08em" }}>// {window.I18N && window.I18N.isAR ? "معاينة · الشريط العلوي" : "PREVIEW · TOPBAR"}</div>
          </div>
        </div>
      </div>
    </>
  );
}
function Labeled({ label, children }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{TT(label)}</div>
      {children}
    </div>
  );
}

/* ----- Projects ----- */
function WsProjects({ dv, T, onOpenProject, onChange }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <WsCardHead eye="// PROJECTS" title="Projects · each fully configurable"
        sub="Every project under this developer carries its own designs, packages, smart-home tiers, payment plans, operating models and contract templates. Click into a project to manage everything."
        action={<button className="btn btn-primary" onClick={() => setAdding(true)}>{window.I18N?window.I18N.t("+ New project"):"+ New project"}</button>} />

      <div className="stack-md">
        {T.projects.map((p) => {
          const units = T.units.filter((u) => u.projectId === p.id);
          const designsN = T.designs.filter((d) => d.projectId === p.id).length;
          const pkgsN    = T.packages.filter((x) => x.projectId === p.id).length;
          const opsN     = T.ops.filter((x) => x.projectId === p.id).length;
          const docsN    = T.contracts.filter((x) => x.projectId === p.id).length;
          return (
            <div key={p.id} className="card card-pad-lg" style={{ cursor: "default" }}>
              <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div className="row" style={{ gap: 10 }}>
                    <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 20 }}>{p.name}</h3>
                    <span className="chip">{p.city}</span>
                    <span className="chip">{window.I18N && window.I18N.isAR ? "التسليم " : "Delivers "}{p.delivery}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{units.length} {window.I18N && window.I18N.isAR ? "وحدة" : "units"} · {units.filter((u) => u.status === "available").length} {window.I18N && window.I18N.isAR ? "متاحة" : "available"}</div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => onOpenProject(p.id)}>{window.I18N && window.I18N.isAR ? "فتح مساحة المشروع ←" : "Open project workspace →"}</button>
                  <DelBtn kind="project" id={p.id} name={p.name} after={() => { onChange && onChange(); }} />
                </div>
              </div>
              <hr className="hr-thin" style={{ margin: "16px 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
                <MetricChip k="Units"     v={units.length} />
                <MetricChip k="Designs"   v={designsN} />
                <MetricChip k="Packages"  v={pkgsN} />
                <MetricChip k={window.I18N && window.I18N.isAR ? "نماذج التشغيل" : "Ops models"} v={opsN} />
                <MetricChip k="Contracts" v={docsN} />
              </div>
              <hr className="hr-thin" style={{ margin: "16px 0" }} />
              <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("FEATURE TOGGLES · PER PROJECT")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { id: "furnishing",   label: "Furnishing",     hint: "Design + package + smart-home" },
                  { id: "fitout",       label: "Fit-out",        hint: "Turnkey fit-out add-on per package" },
                  { id: "smartHome",    label: "Smart home",     hint: "Sub-step under furnishing" },
                  { id: "kitchens",     label: "Kitchens",       hint: "3 designs × 3 palettes · cabinets or full kitchen" },
                  { id: "cooling",      label: "Cooling / AC",   hint: "AC by brand · priced per cooling point" },
                  { id: "flooring",     label: "Flooring",       hint: "Finishes by zone · priced per m²" },
                  { id: "layout",       label: "Layout changes", hint: "Walls & doors · pre-approved per unit type" },
                  { id: "remote",       label: "Remote ordering", hint: "WhatsApp link · rep confirms · e-sign on the buyer's phone" },
                  { id: "operations",   label: "Operations",     hint: "Ops + calculator + PM contract" },
                ].map((opt) => <FeatureRow key={opt.id} project={p} opt={opt} />)}
              </div>
            </div>
          );
        })}
      </div>
      {adding && <NewProjectDrawer dv={dv} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); onChange && onChange(); }} />}
    </>
  );
}

function NewProjectDrawer({ dv, onClose, onCreated }) {
  const id = useMemo(() => dv.id + "-" + Date.now().toString(36).slice(-5), [dv.id]);
  const [p, setP] = useState({
    id,
    developerId: dv.id,
    name: "",
    city: "Riyadh",
    deliveryQ: "Q4",
    deliveryY: "2027",
    totalUnits: 100,
    features: Object.assign({ furnishing: true, smartHome: true, operations: true, fitout: false, kitchens: false, cooling: false, flooring: false, layout: false }, (dv.masterAgreement && dv.masterAgreement.defaultFeatures) || {}),
    custFee: 22,
    devShare: 6,
    salesPct: 1.0,
    markupPct: 8.0,
  });
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const toggleFeat = (k) => setP((x) => ({ ...x, features: { ...x.features, [k]: !x.features[k] } }));
  const valid = p.name.trim() && p.city.trim() && p.totalUnits > 0;

  const save = () => {
    if (!valid) return;
    // Create through the data layer so it persists (and can be deleted).
    const payload = {
      id: p.id,
      developerId: p.developerId,
      name: p.name.trim(),
      nameAr: (p.nameAr || "").trim(),
      city: p.city.trim(),
      delivery: `${p.deliveryQ} ${p.deliveryY}`,
      totalUnits: Number(p.totalUnits) || 0,
      features: { ...p.features },
      commercials: {
        customerOpsFeePct:   Number(p.custFee)  || 0,
        developerOpsSharePct:Number(p.devShare) || 0,
        salesCommission: { kind: "pct", value: Number(p.salesPct)  || 0 },
        contractMarkup:  { kind: "pct", value: Number(p.markupPct) || 0 },
      },
    };
    // Seed one default 3-instalment payment plan so the project is usable end-to-end.
    const plan = {
      id: p.id + "-3x", projectId: p.id, name: "3 instalments",
      milestones: [
        { pct: 40, mileId: null, label: "On signature" },
        { pct: 30, mileId: null, label: "Mid construction" },
        { pct: 30, mileId: null, label: "Handover" },
      ],
      schedule: "40% On signature  ·  30% Mid construction  ·  30% Handover",
    };
    window.RevnuSupport.act(async () => { await D.createProject(payload); await D.createPaymentPlan(plan); }, { pending: (window.I18N && window.I18N.isAR) ? "جارٍ إنشاء المشروع…" : "Creating the project…", done: (window.I18N && window.I18N.isAR) ? "أُنشئ المشروع." : "Project created." })
      .then((r) => { if (r !== undefined) onCreated(); });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 520, background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">{TT("// NEW PROJECT")}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>Add project under {dv.name}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label="Project name *">
              <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Marsa Cove Residences" />
            </Labeled>
            <Labeled label="اسم المشروع (عربي)">
              <input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={p.nameAr || ""} onChange={(e) => set({ nameAr: e.target.value })} placeholder="مرسى كوف ريزيدنسز" />
            </Labeled>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10 }}>
            <Labeled label="City *">
              <select className="select" value={p.city} onChange={(e) => set({ city: e.target.value })}>
                {["Riyadh","Jeddah","Dammam","Khobar","Madinah","Makkah","NEOM","Tabuk","AlUla","Other"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Labeled>
            <Labeled label="Delivery (qtr)">
              <select className="select" value={p.deliveryQ} onChange={(e) => set({ deliveryQ: e.target.value })}>
                {["Q1","Q2","Q3","Q4"].map((q) => <option key={q}>{q}</option>)}
              </select>
            </Labeled>
            <Labeled label="Delivery (year)">
              <input className="input mono" type="number" min="2026" max="2035" value={p.deliveryY} onChange={(e) => set({ deliveryY: e.target.value })} />
            </Labeled>
          </div>
          <Labeled label="Total units in development *">
            <input className="input mono" type="number" min="1" value={p.totalUnits} onChange={(e) => set({ totalUnits: Number(e.target.value) || 0 })} />
          </Labeled>

          <hr className="hr-thin" />
          <div className="eyebrow">{TT("// FEATURE TOGGLES")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { id: "furnishing",   label: "Furnishing" },
              { id: "fitout",       label: "Fit-out" },
              { id: "smartHome",    label: "Smart home" },
              { id: "kitchens",     label: "Kitchens" },
              { id: "cooling",      label: "Cooling / AC" },
              { id: "flooring",     label: "Flooring" },
              { id: "layout",       label: "Layout changes" },
              { id: "remote",       label: "Remote ordering" },
              { id: "operations",   label: "Operations" },
            ].map((f) => (
              <label key={f.id} style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 6, background: p.features[f.id] ? "var(--bg-sunken)" : "var(--bg-card)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <span style={{ fontSize: 13 }}>{f.label}</span>
                <input type="checkbox" checked={p.features[f.id]} onChange={() => toggleFeat(f.id)} />
              </label>
            ))}
          </div>

          <hr className="hr-thin" />
          <div className="eyebrow">{TT("// COMMERCIALS")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label="Customer ops fee (%)">
              <input className="input mono" type="number" step="0.5" value={p.custFee} onChange={(e) => set({ custFee: e.target.value })} />
            </Labeled>
            <Labeled label="Developer share of ops fee (%)">
              <input className="input mono" type="number" step="0.5" value={p.devShare} onChange={(e) => set({ devShare: e.target.value })} />
            </Labeled>
            <Labeled label={window.I18N && window.I18N.isAR ? "عمولة المبيعات (% من الإضافات بدون الضريبة)" : "Sales commission (% of ex-VAT extras)"}>
              <input className="input mono" type="number" step="0.1" value={p.salesPct} onChange={(e) => set({ salesPct: e.target.value })} />
            </Labeled>
            <Labeled label="Developer markup on extras (%)">
              <input className="input mono" type="number" step="0.5" value={p.markupPct} onChange={(e) => set({ markupPct: e.target.value })} />
            </Labeled>
          </div>

          <div className="soft" style={{ fontSize: 11.5, marginTop: 4, padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: 6 }}>
            {window.I18N && window.I18N.isAR ? "ينشأ مشروع فارغ بدون تصاميم / باقات / منزل ذكي / تشغيل / عقود. أكمل إعداد كل منها في مساحة المشروع." : "A blank project is created with empty designs / packages / smart / ops / contracts. Configure each in the project workspace afterwards."}
          </div>

          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!valid} onClick={save}>Create project</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DevLogoSlot({ dv, field, label, darkPreview }) {
  const inputRef = React.useRef(null);
  const [, bump] = useState(0);
  const img = dv[field];
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    await window.RevnuSupport.act(async () => { const url = await uploadScaled(f, 600, "developers/" + dv.id); await D.setDevLogo(dv.id, { [field]: url }); }, { pending: (window.I18N && window.I18N.isAR) ? "جارٍ رفع الشعار…" : "Uploading logo…" });
    bump((x) => x + 1);
    e.target.value = "";
  };
  const remove = () => { window.RevnuSupport.act(() => D.setDevLogo(dv.id, { [field]: "" })).then(() => bump((x) => x + 1)); };
  return (
    <div>
      <div className="soft" style={{ fontSize: 10.5, marginBottom: 5 }}>{label}</div>
      <div onClick={() => inputRef.current && inputRef.current.click()} title="Upload"
        style={{ cursor: "pointer", border: "1px dashed var(--line-strong)", borderRadius: "var(--r-sm)", height: 84, background: darkPreview ? "#1d1c1a" : "var(--bg-sunken)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 8 }}>
        {img ? <img src={img} alt={label} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
             : <span style={{ fontSize: 11, color: darkPreview ? "rgba(255,255,255,0.6)" : "var(--text-soft)" }}>{window.I18N && window.I18N.isAR ? "انقر للرفع" : "Click to upload"}</span>}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 5 }}>
        <button className="btn btn-sm btn-secondary" onClick={() => inputRef.current && inputRef.current.click()}>{img ? (window.I18N && window.I18N.isAR ? "استبدال" : "Replace") : (window.I18N && window.I18N.isAR ? "رفع" : "Upload")}</button>
        {img && <button className="btn btn-sm btn-ghost" onClick={remove}>✕</button>}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
      </div>
    </div>
  );
}

// Only the Revnu Super Admin may delete. Seed Revnu admins (no roleId) are owners.
// Deletion is restricted to the Revnu Super Admin only.
// (Seed Revnu admins have no roleId and are treated as the platform owner = super admin.)

function DelBtn({ kind, id, name, after }) {
  if (!CAN_DELETE_FN()) return null;
  const AR = window.I18N && window.I18N.isAR;
  const onDel = (e) => {
    e.stopPropagation();
    const msg = AR ? ("حذف \"" + (name || "") + "\"؟ لا يمكن التراجع.") : ("Delete \"" + (name || "") + "\"? This cannot be undone.");
    if (!window.confirm(msg)) return;
    window.RevnuSupport.act(() => D.removeEntity(kind, id), { pending: AR ? "جارٍ الحذف…" : "Deleting…", done: AR ? "تم الحذف." : "Deleted." }).then((r) => { if (r && after) after(); });
  };
  return (
    <button className="btn btn-sm btn-ghost" title={AR ? "حذف" : "Delete"} onClick={onDel}
      style={{ color: "var(--negative, #c0492f)" }}>✕</button>
  );
}

function MetricChip({ k, v }) {
  return (
    <div style={{ padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
      <div className="soft" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k}</div>
      <div className="mono" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, marginTop: 2 }}>{v}</div>
    </div>
  );
}

function FeatureRow({ project, opt }) {
  const SKIPPABLE = { furnishing: true, smartHome: true, operations: true, kitchens: true, cooling: true, flooring: true, layout: true }; // fit-out is already optional by nature
  const [, force] = useState(0);
  const on = opt.id === "remote" ? !!project.features && project.features.remote !== false : !!(project.features && project.features[opt.id]);
  const canSkip = !!(project.optional && project.optional[opt.id]);
  const toggleOn = () => { window.RevnuSupport.act(() => D.setProjectFlags(project.id, { features: { [opt.id]: !on } })).then(() => force((x) => x + 1)); };
  const toggleSkip = () => { window.RevnuSupport.act(() => D.setProjectFlags(project.id, { optional: { [opt.id]: !canSkip } })).then(() => force((x) => x + 1)); };
  return (
    <div style={{ padding: "11px 12px", background: on ? "var(--bg-sunken)" : "var(--bg-card)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
          <div className="soft" style={{ fontSize: 11 }}>{opt.hint}</div>
        </div>
        <FeatureSwitch on={on} onClick={toggleOn} />
      </div>
      {on && SKIPPABLE[opt.id] && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dotted var(--line)" }}>
          <div style={{ fontSize: 12 }}>Developer may skip this</div>
          <div style={{ display: "flex", marginTop: 7, border: "1px solid var(--line-strong)", borderRadius: 7, overflow: "hidden" }}>
            <button type="button" onClick={() => { if (canSkip) toggleSkip(); }}
              style={{ flex: 1, padding: "6px 4px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
                       background: !canSkip ? "var(--brand)" : "transparent", color: !canSkip ? "var(--brand-text)" : "var(--text-muted)" }}>Mandatory</button>
            <button type="button" onClick={() => { if (!canSkip) toggleSkip(); }}
              style={{ flex: 1, padding: "6px 4px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", borderLeft: "1px solid var(--line-strong)",
                       background: canSkip ? "var(--brand)" : "transparent", color: canSkip ? "var(--brand-text)" : "var(--text-muted)" }}>Optional</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UnitsDrawer({ project, onClose }) {
  const initialUnits = D.UNITS.filter((u) => u.projectId === project.id);
  const [units, setUnits] = useState(initialUnits);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 100, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 720, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">// UNITS · {project.name}</div>
            <div className="display-sm">{units.length} {window.I18N && window.I18N.isAR ? "وحدة" : "units"}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>{window.I18N && window.I18N.isAR ? "إغلاق ×" : "Close ×"}</button>
          </div>
        </div>
        <div style={{ padding: 12 }}>
          <table className="tbl tbl-flush">
            <thead><tr>
              <th>{TT("Unit #")}</th><th>{TT("Type")}</th><th>{TT("Tower")}</th><th>{TT("Floor")}</th><th>{TT("Price")} (SAR)</th><th className="right">{TT("Status")}</th>
            </tr></thead>
            <tbody>
              {units.map((u, i) => {
                const t = D.unitTypeById(u.typeId);
                return (
                  <tr key={u.number}>
                    <td className="mono" style={{ fontWeight: 600 }}>{u.number}</td>
                    <td>{t ? (window.I18N ? window.I18N.tx(t, "name") : t.name) : <span className="soft">—</span>}</td>
                    <td>{u.tower}</td>
                    <td className="mono">{u.floor}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{D.fmtSAR((t?.basePrice || 0) + (u.priceAdj || 0))}</td>
                    <td className="right">
                      <select className="select" style={{ width: 110, height: 26, fontSize: 11 }} value={u.status}
                              onChange={(e) => {
                                const next = units.map((x, ix) => ix === i ? { ...x, status: e.target.value } : x);
                                setUnits(next);
                              }}>
                        <option value="available">Available</option>
                        <option value="reserved">Reserved</option>
                        <option value="sold">Sold</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ----- Designs / Packages / Smart / Payments / Ops / Contracts / Team / Orders ----- */
function AmountOrPct({ kind, value, onKind, onValue }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <input className="input mono" type="number" step={kind === "pct" ? 0.1 : 100} value={value} onChange={(e) => onValue(Number(e.target.value))} />
      <div className="tabs" style={{ padding: 2 }}>
        <button className={"tab " + (kind === "pct" ? "active" : "")} style={{ padding: "4px 10px", fontSize: 11.5 }} onClick={() => onKind("pct")}>%</button>
        <button className={"tab " + (kind === "amt" ? "active" : "")} style={{ padding: "4px 10px", fontSize: 11.5 }} onClick={() => onKind("amt")}>SAR</button>
      </div>
    </div>
  );
}

function WsDesigns({ T }) {
  const designs = T.designs || [];
  const [editing, setEditing] = useState(null);
  const [adding, setAdding]   = useState(false);
  return (
    <>
      <WsCardHead eye="// DESIGNS" title="Design library" sub={window.I18N && window.I18N.isAR ? "لكل تصميم لوحات ألوان ومواد رئيسية وصور داخلية ثلاثية الأبعاد. العميل يختار الإحساس واللوحة — والسعر واحد لكل التصاميم." : "Each design has colour palettes, key materials, and 3D interior pictures. Customer picks the feeling — price is identical across designs."}
        action={<button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add design style</button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        {designs.map((d) => {
          const pals = D.designPalettes(d);
          const AR = window.I18N && window.I18N.isAR;
          return (
          <div key={d.id} className="card card-pad">
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
              {pals.map((pal) => (
                <div key={pal.id} className="row" style={{ gap: 8, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 0, height: 22, width: 92, borderRadius: 5, overflow: "hidden", flexShrink: 0, border: "1px solid var(--line)" }}>
                    {pal.colors.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
                  </div>
                  <span className="soft" style={{ fontSize: 11 }}>{AR ? (pal.nameAr || pal.name) : pal.name}</span>
                </div>
              ))}
            </div>
            <div className="row-between">
              <strong>{d.name}</strong>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(d)}>Edit</button>
                <DelBtn kind="design" id={d.id} name={d.name} />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{d.mood}</div>
            <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {(d.materials || []).map((m, i) => <span key={i} className="chip">{m}</span>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 12 }}>
              {(d.images || []).slice(0, 3).map((img, i) => (
                <div key={i} style={{ aspectRatio: "4/3", backgroundImage: img.src ? "url('" + img.src + "')" : "linear-gradient(135deg, " + d.palette[i % d.palette.length] + " 0%, " + d.palette[(i + 1) % d.palette.length] + " 100%)", backgroundSize: "cover", backgroundPosition: "center", borderRadius: 6, display: "flex", alignItems: "flex-end", padding: 6, color: "#fff", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>{img.label}</div>
              ))}
              {(d.images || []).length === 0 && (
                <div style={{ gridColumn: "span 3", aspectRatio: "6/2", border: "1px dashed var(--line-strong)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-soft)", fontSize: 12 }}>
                  No 3D pictures yet — click Edit to upload.
                </div>
              )}
            </div>
            <div className="soft" style={{ fontSize: 10.5, marginTop: 8, fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>// {pals.length} {AR ? "لوحة ألوان" : ("PALETTE" + (pals.length === 1 ? "" : "S"))} · {(d.images || []).length} 3D</div>
          </div>
          );
        })}
        {designs.length === 0 && <div className="card card-pad muted">No designs yet. Add one to get started.</div>}
      </div>
      {editing && <DesignDrawer design={editing} onClose={() => setEditing(null)} />}
      {adding  && <DesignDrawer projectId={T.project && T.project.id} design={{ id: "new", name: "New design", mood: "", palette: ["#FFFFFF","#EEEEEF","#1D1D1F","#5EC4D4"], palettes: [{ id: "pal-1", name: "Palette 1", nameAr: "", colors: ["#EFE9DF","#C9B89A","#8C7A5E","#FFFFFF"] }], materials: [], images: [] }} onClose={() => setAdding(false)} />}
    </>
  );
}

function DesignDrawer({ design, onClose, projectId }) {
  const [d, setD] = useState({ ...design, palettes: D.designPalettes(design).map((p) => ({ ...p, colors: [...p.colors] })), materials: [...(design.materials || [])], images: [...(design.images || [])] });
  const set = (patch) => setD((p) => ({ ...p, ...patch }));
  const AR = window.I18N && window.I18N.isAR;
  const designImgInput = React.useRef(null);
  const [imgBusy, setImgBusy] = useState(false);
  const onUploadDesignImg = async (e) => {
    const files = [...(e.target.files || [])]; if (!files.length) return;
    setImgBusy(true);
    try {
      const added = [];
      for (const f of files) { const url = await uploadScaled(f, 1400, "designs/" + (d.projectId || projectId || "misc")); added.push({ id: "i" + Date.now().toString(36) + added.length, label: f.name.replace(/\.[^.]+$/, ""), labelAr: "", src: url }); }
      set({ images: [...d.images, ...added] });
    } catch (err) { window.RevnuSupport.fail(err); }
    setImgBusy(false); e.target.value = "";
  };
  const onReplaceDesignImg = async (e, i) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { const url = await uploadScaled(f, 1400, "designs/" + (d.projectId || projectId || "misc")); set({ images: d.images.map((x, ix) => ix === i ? { ...x, src: url } : x) }); } catch (err) { window.RevnuSupport.fail(err); }
    e.target.value = "";
  };
  const setPalettes = (fn) => setD((p) => ({ ...p, palettes: fn(p.palettes) }));
  const firstColors = (d.palettes[0] && d.palettes[0].colors) || ["#EEE", "#CCC", "#888", "#FFF"];
  const [matInput, setMatInput] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div><div className="eyebrow">{TT("// EDIT DESIGN")}</div><div className="display-sm" style={{ marginTop: 2 }}>{d.name}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <Labeled label="Name (English)"><input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} /></Labeled>
          <Labeled label="الاسم (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={d.nameAr || ""} onChange={(e) => set({ nameAr: e.target.value })} placeholder="اكتب الاسم بالعربية" /></Labeled>
          <Labeled label="Mood / description (English)"><textarea className="textarea" rows={2} value={d.mood} onChange={(e) => set({ mood: e.target.value })} /></Labeled>
          <Labeled label="الوصف (عربي)"><textarea className="textarea" rows={2} dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={d.moodAr || ""} onChange={(e) => set({ moodAr: e.target.value })} placeholder="اكتب الوصف بالعربية" /></Labeled>
          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div className="eyebrow">{TT("COLOUR PALETTES")}</div>
              <button className="btn btn-sm btn-secondary" onClick={() => setPalettes((ps) => [...ps, { id: "pal-" + Date.now().toString(36).slice(-5), name: "New palette", nameAr: "", colors: ["#EFE9DF", "#C9B89A", "#8C7A5E", "#FFFFFF"] }])}>{window.I18N && window.I18N.isAR ? "+ إضافة لوحة" : "+ Add palette"}</button>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-soft)", marginBottom: 10 }}>{window.I18N && window.I18N.isAR ? "أضف عدة لوحات ألوان لهذا التصميم — يختار العميل واحدة في المبيعات وتظهر في العقد." : "Add several colourways for this design — the customer picks one in the sales flow and it appears in the contract."}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <Labeled label={AR ? "ماذا تغير اللوحة؟ (إنجليزي)" : "What the palette changes (English)"}><textarea className="input" rows={2} style={{ resize: "vertical", fontSize: 12 }} value={d.paletteNote || ""} onChange={(e) => set({ paletteNote: e.target.value })} placeholder="Accessories, cushions, rugs, bedding, wall art…" /></Labeled>
              <Labeled label="ماذا تغير اللوحة؟ (عربي)"><textarea className="input" dir="rtl" rows={2} style={{ resize: "vertical", fontSize: 12, fontFamily: "var(--font-ar)" }} value={d.paletteNoteAr || ""} onChange={(e) => set({ paletteNoteAr: e.target.value })} placeholder="الإكسسوارات والمخدات والسجاد والمفارش واللوحات…" /></Labeled>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {d.palettes.map((pal, pi) => (
                <div key={pal.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 12, background: "var(--bg-sunken)" }}>
                  <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 24, width: 64, flexShrink: 0, border: "1px solid var(--line)" }}>
                      {pal.colors.map((c, ci) => <div key={ci} style={{ flex: 1, background: c }} />)}
                    </div>
                    <input className="input" style={{ height: 30, flex: 1 }} value={pal.name} placeholder="Palette name (English)" onChange={(e) => setPalettes((ps) => ps.map((x, ix) => ix === pi ? { ...x, name: e.target.value } : x))} />
                    <input className="input" dir="rtl" style={{ height: 30, flex: 1, fontFamily: "var(--font-ar)" }} value={pal.nameAr || ""} placeholder="الاسم (عربي)" onChange={(e) => setPalettes((ps) => ps.map((x, ix) => ix === pi ? { ...x, nameAr: e.target.value } : x))} />
                    {d.palettes.length > 1 && <button className="btn btn-sm btn-ghost" title="Remove palette" onClick={() => setPalettes((ps) => ps.filter((_, ix) => ix !== pi))}>✕</button>}
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {pal.colors.map((c, ci) => (
                      <div key={ci} className="row" style={{ gap: 5, padding: 5, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--bg-card)" }}>
                        <input type="color" value={c} onChange={(e) => setPalettes((ps) => ps.map((x, ix) => ix === pi ? { ...x, colors: x.colors.map((cc, ccx) => ccx === ci ? e.target.value : cc) } : x))} style={{ width: 28, height: 28, padding: 0, border: 0, background: "none" }} />
                        <input className="input mono" style={{ width: 84, height: 26, fontSize: 11 }} value={c} onChange={(e) => setPalettes((ps) => ps.map((x, ix) => ix === pi ? { ...x, colors: x.colors.map((cc, ccx) => ccx === ci ? e.target.value : cc) } : x))} />
                        {pal.colors.length > 2 && <button className="btn btn-sm btn-ghost" onClick={() => setPalettes((ps) => ps.map((x, ix) => ix === pi ? { ...x, colors: x.colors.filter((_, ccx) => ccx !== ci) } : x))}>×</button>}
                      </div>
                    ))}
                    <button className="btn btn-sm btn-ghost" onClick={() => setPalettes((ps) => ps.map((x, ix) => ix === pi ? { ...x, colors: [...x.colors, "#CCCCCC"] } : x))}>{window.I18N && window.I18N.isAR ? "+ لون" : "+ Color"}</button>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" style={{ width: "100%", marginTop: 12, justifyContent: "center", borderStyle: "dashed" }}
              onClick={() => setPalettes((ps) => [...ps, { id: "pal-" + Date.now().toString(36).slice(-5), name: "New palette", nameAr: "", colors: ["#EFE9DF", "#C9B89A", "#8C7A5E", "#FFFFFF"] }])}>
              {window.I18N && window.I18N.isAR ? "＋ إضافة لوحة ألوان أخرى" : "＋ Add another colour palette"}
            </button>
          </div>
          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div className="eyebrow">{TT("3D INTERIOR PICTURES")}</div>
              <button className="btn btn-sm btn-secondary" onClick={() => designImgInput.current && designImgInput.current.click()}>{imgBusy ? (AR ? "جار الرفع…" : "Uploading…") : (AR ? "+ رفع صورة" : "+ Upload image")}</button>
              <input ref={designImgInput} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onUploadDesignImg} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-soft)", marginBottom: 10 }}>{AR ? "لقطات ثلاثية الأبعاد للثيم — يراها العميل في مرحلة المبيعات وتطبع في الاتفاقية. النسبة المثلى 4:3." : "3D renders of the theme — the customer sees these in the sales flow and they print into the agreement. Best ratio 4:3."}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {d.images.map((img, i) => (
                <div key={img.id || i} style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "var(--bg-sunken)" }}>
                  {img.src
                    ? <img src={img.src} alt={img.label || ""} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }} />
                    : <div style={{ aspectRatio: "4/3", background: "linear-gradient(135deg, " + firstColors[i % firstColors.length] + " 0%, " + firstColors[(i + 1) % firstColors.length] + " 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,0.45)", fontSize: 11 }}>{AR ? "بدون صورة" : "No image"}</div>}
                  <div style={{ padding: 6 }}>
                    <BiField en={img.label || ""} ar={img.labelAr || ""} onEn={(v) => set({ images: d.images.map((x, ix) => ix === i ? { ...x, label: v } : x) })} onAr={(v) => set({ images: d.images.map((x, ix) => ix === i ? { ...x, labelAr: v } : x) })} placeholder="Shot label" placeholderAr="وصف اللقطة" />
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      <label className="btn btn-sm btn-ghost" style={{ flex: 1, cursor: "pointer", justifyContent: "center" }}>{AR ? "استبدال" : "Replace"}<input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onReplaceDesignImg(e, i)} /></label>
                      <button className="btn btn-sm btn-ghost" style={{ flex: 1 }} onClick={() => set({ images: d.images.filter((_, ix) => ix !== i) })}>{AR ? "إزالة" : "Remove"}</button>
                    </div>
                  </div>
                </div>
              ))}
              {d.images.length === 0 && (
                <div style={{ gridColumn: "span 3", padding: 24, border: "1px dashed var(--line-strong)", borderRadius: 6, textAlign: "center", color: "var(--text-soft)", fontSize: 12 }}>
                  {AR ? "لا توجد صور بعد — ارفع لقطات الثيم ثلاثية الأبعاد." : "No images yet — upload the theme's 3D renders."}
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{TT("MATERIALS")}</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {d.materials.map((m, i) => (
                <span key={i} className="chip" style={{ paddingRight: 4 }}>
                  {m}
                  <button onClick={() => set({ materials: d.materials.filter((_, ix) => ix !== i) })} style={{ marginLeft: 4, background: "transparent", border: 0, cursor: "default" }}>×</button>
                </span>
              ))}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" value={matInput} onChange={(e) => setMatInput(e.target.value)} placeholder="e.g. Bleached oak" />
              <button className="btn btn-secondary" onClick={() => { if (matInput.trim()) { set({ materials: [...d.materials, matInput.trim()] }); setMatInput(""); } }}>Add</button>
            </div>
          </div>
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" onClick={() => { const fields = { name: d.name, nameAr: d.nameAr, mood: d.mood, moodAr: d.moodAr, palettes: d.palettes, palette: firstColors, materials: d.materials, materialsAr: d.materialsAr || [], paletteNote: d.paletteNote || "", paletteNoteAr: d.paletteNoteAr || "", images: d.images }; window.RevnuSupport.act(() => d.id === "new" ? D.createContent("design", Object.assign({ id: newId(projectId, "design"), projectId }, fields)) : D.setContentField("design", d.id, fields), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ التصميم." : "Design saved." }).then((r) => { if (r !== undefined) onClose(); }); }}>{window.I18N?window.I18N.t("Save design"):"Save design"}</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WsPackages({ T }) {
  const [openBoq, setOpenBoq] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding]   = useState(false);
  const [v, setV] = useState(0); // bump after create/edit so the list refreshes
  const pkgs = (T.project ? D.PACKAGES.filter((x) => x.projectId === T.project.id) : T.packages);
  return (
    <>
      <WsCardHead eye="// FURNISHING PACKAGES" title="Packages · per-type pricing · BOQ"
        sub={window.I18N && window.I18N.isAR ? "لكل باقة تسعير حسب نوع الوحدة وجدول كميات. يطبع جدول الكميات في ملحق التأثيث (F-1) ضمن اتفاقية المشتري." : "Each package has pricing per unit-type and a Bill of Quantities. The BOQ is printed into the buyer's Furnishing Schedule as Appendix F-1."}
        action={<button className="btn btn-primary" onClick={() => setAdding(true)}>{window.I18N && window.I18N.isAR ? "+ باقة جديدة" : "+ New package"}</button>} />
      <div className="stack-md">
        {pkgs.map((p) => (
          <div key={p.id} className={"card card-pad-lg" + (p.signature ? " pkg-signature" : "")}>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div>
                <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 18 }}>{p.name}</h3>
                  {p.signature
                    ? <span className="sig-chip">✦ {p.tier || "Signature"}</span>
                    : <span className="chip">{p.tier}</span>}
                  {p.signature && (p.brandLogo
                    ? <img className="sig-brandlogo" src={p.brandLogo} alt={p.brandName || ""} />
                    : (p.brandName ? <span className="sig-brandname">{p.brandName}</span> : null))}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{p.summary}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setOpenBoq({ name: p.name, boq: p.boq || [], priced: false, parent: p, field: "boq" })}>BOQ · {(p.boq || []).length} lines</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(p)}>Edit</button>
                <DelBtn kind="package" id={p.id} name={p.name} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              {Object.entries(p.pricing).map(([typeId, price]) => {
                const t = D.unitTypeById(typeId);
                return (
                  <div key={typeId} style={{ padding: 12, background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
                    <div className="soft" style={{ fontSize: 10.5, fontWeight: 600 }}>{t?.name || typeId}</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{D.fmtSAR(price)} <span className="soft" style={{ fontSize: 10 }}>SAR</span></div>
                  </div>
                );
              })}
            </div>
            <div className="row" style={{ gap: 18, marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
              <span>{p.pieces} pieces</span>
              <span>{p.warranty}-year warranty</span>
              <span>{(p.boq || []).length} BOQ lines</span>
            </div>
            {p.fitout && (
              <div style={{ marginTop: 14, padding: "12px 14px", border: "1px dashed var(--brand)", borderRadius: "var(--r-sm)", background: "var(--brand-soft)" }}>
                <div className="row-between" style={{ alignItems: "center" }}>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <span className="eyebrow" style={{ color: "var(--brand-deep)" }}>// FIT-OUT ADD-ON</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>Fit-out</span>
                    {p.fitout.warranty ? <span className="chip">{p.fitout.warranty}-yr finishes</span> : null}
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={() => setOpenBoq({ name: p.name + " · Fit-out", boq: p.fitout.boq || [], priced: true, parent: p, field: "fitout" })}>Fit-out BOQ · {(p.fitout.boq || []).length} lines</button>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{p.fitout.summary}</div>
                <div className="row" style={{ gap: 20, marginTop: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <div>
                    <div className="soft" style={{ fontSize: 10, fontWeight: 600 }}>FIT-OUT PRICE · FROM BOQ</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>+{D.fmtSAR(D.boqTotal(p.fitout.boq))} <span className="soft" style={{ fontSize: 10 }}>SAR</span></div>
                  </div>
                  <div className="soft" style={{ fontSize: 11.5, maxWidth: 320 }}>{window.I18N && window.I18N.isAR ? ((p.fitout.boq || []).length + " بندا مسعرا — مجموعها هو سعر إضافة التشطيب الذي يضاف إلى إضافات المشتري.") : ((p.fitout.boq || []).length + " priced line items — their sum is the fit-out add-on price added to the buyer's extras.")}</div>
                </div>
              </div>
            )}
          </div>
        ))}
        {pkgs.length === 0 && <div className="card card-pad muted">No packages configured.</div>}
      </div>
      {openBoq && <BoqDrawer pkg={openBoq} onClose={() => { setOpenBoq(null); setV(v + 1); }} />}
      {editing && <PackageDrawer pkg={editing} unitTypes={T.unitTypes} projectId={T.project && T.project.id} onClose={() => { setEditing(null); setV(v + 1); }} />}
      {adding  && <PackageDrawer pkg={{ id: "new", name: "", tier: "", summary: "", pieces: 0, warranty: 5, pricing: {}, boq: [] }} unitTypes={T.unitTypes} projectId={T.project && T.project.id} onClose={() => { setAdding(false); setV(v + 1); }} />}
    </>
  );
}

function PackageDrawer({ pkg, unitTypes, projectId, onClose }) {
  const [p, setP] = useState({ ...pkg, pricing: { ...pkg.pricing }, fitout: pkg.fitout ? { ...pkg.fitout, pricing: { ...pkg.fitout.pricing } } : null });
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const setPrice = (typeId, val) => setP((x) => ({ ...x, pricing: { ...x.pricing, [typeId]: Number(val) || 0 } }));
  const FITOUT_DEFAULT = { warranty: 10, summary: "Full interior fit-out — flooring, ceilings, joinery, paint and lighting, delivered before the furniture goes in.", pricing: {}, boq: [] };
  const toggleFitout = () => setP((x) => x.fitout ? { ...x, fitout: null } : { ...x, fitout: { ...FITOUT_DEFAULT } });
  const setFitout = (patch) => setP((x) => ({ ...x, fitout: { ...(x.fitout || FITOUT_DEFAULT), ...patch } }));
  const setFitoutPrice = (typeId, val) => setP((x) => ({ ...x, fitout: { ...(x.fitout || FITOUT_DEFAULT), pricing: { ...((x.fitout && x.fitout.pricing) || {}), [typeId]: Number(val) || 0 } } }));
  const nameOk = (p.name || "").trim() || (p.nameAr || "").trim();
  const pricingOk = Object.values(p.pricing || {}).every((v) => (Number(v) || 0) >= 0)
    && (!p.fitout || Object.values(p.fitout.pricing || {}).every((v) => (Number(v) || 0) >= 0));
  const pkgValid = nameOk && pricingOk;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div><div className="eyebrow">{TT("// PACKAGE")}</div><div className="display-sm" style={{ marginTop: 2 }}>{p.name || "New package"}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Name (English)"><input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} /></Labeled>
            <Labeled label="الاسم (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={p.nameAr || ""} onChange={(e) => set({ nameAr: e.target.value })} placeholder="اسم الباقة" /></Labeled>
          </div>
          {!nameOk && <div className="soft" style={{ fontSize: 11, color: "var(--negative, #b91c1c)", marginTop: -6 }}>{window.I18N && window.I18N.isAR ? "الاسم مطلوب (إنجليزي أو عربي)." : "A name is required (English or Arabic)."}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Tier (free text — any number of tiers)"><input className="input" list="tier-suggestions" value={p.tier || ""} onChange={(e) => set({ tier: e.target.value })} placeholder="e.g. Tier IV · Penthouse Collection" /></Labeled>
            <Labeled label="الفئة (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={p.tierAr || ""} onChange={(e) => set({ tierAr: e.target.value })} placeholder="مثال: الفئة الرابعة" /></Labeled>
            <datalist id="tier-suggestions">
              <option value="Tier I" /><option value="Tier II" /><option value="Tier III" /><option value="Tier IV" /><option value="Signature" />
            </datalist>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: "var(--r-sm)", border: "1px solid " + (p.signature ? "#c9a869" : "var(--line)"), background: p.signature ? "linear-gradient(150deg, #14161d, #232838)" : "var(--bg-sunken)", color: p.signature ? "#f2eee6" : "inherit" }}>
            <div className="row-between" style={{ alignItems: "center" }}>
              <div>
                <div className="eyebrow" style={{ color: p.signature ? "#d6b87c" : undefined }}>{TT("SIGNATURE EDITION")}</div>
                <div style={{ fontSize: 11.5, marginTop: 2, opacity: 0.85 }}>{window.I18N && window.I18N.isAR ? "باقة موقعة من علامة تجارية — تظهر ببطاقة مميزة مع شعار العلامة في بوابة المبيعات والعقد" : "A branded, co-signed package — gets a stand-out card with the brand's logo in the sales portal and the contract."}</div>
              </div>
              <label className="row" style={{ gap: 8, fontSize: 13, whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={!!p.signature} onChange={() => set({ signature: !p.signature })} /> {window.I18N && window.I18N.isAR ? "باقة موقعة" : "Signature"}
              </label>
            </div>
            {p.signature && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Labeled label="Brand name"><input className="input" value={p.brandName || ""} onChange={(e) => set({ brandName: e.target.value })} placeholder="e.g. Bentley Home" /></Labeled>
                <Labeled label="اسم العلامة (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={p.brandNameAr || ""} onChange={(e) => set({ brandNameAr: e.target.value })} placeholder="مثال: بنتلي هوم" /></Labeled>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="eyebrow" style={{ marginBottom: 6, color: "#d6b87c" }}>{TT("BRAND LOGO")}</div>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    {p.brandLogo ? <img src={p.brandLogo} alt="" style={{ height: 34, maxWidth: 130, objectFit: "contain", filter: "brightness(0) invert(1)" }} /> : <span style={{ fontSize: 11.5, opacity: 0.6 }}>{window.I18N && window.I18N.isAR ? "لم يرفع شعار" : "No logo yet"}</span>}
                    <label className="btn btn-sm btn-secondary" style={{ cursor: "pointer" }}>
                      {window.I18N && window.I18N.isAR ? "رفع الشعار" : "Upload logo"}
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                        const f = e.target.files && e.target.files[0]; if (!f) return;
                        const fr = new FileReader();
                        fr.onload = () => set({ brandLogo: fr.result });
                        fr.readAsDataURL(f); e.target.value = "";
                      }} />
                    </label>
                    {p.brandLogo && <button className="btn btn-sm btn-ghost" style={{ color: "#f2eee6" }} onClick={() => set({ brandLogo: null })}>×</button>}
                  </div>
                </div>
              </div>
            )}
          </div>
          <Labeled label="Summary (English)"><textarea className="textarea" rows={2} value={p.summary} onChange={(e) => set({ summary: e.target.value })} /></Labeled>
          <Labeled label="الوصف (عربي)"><textarea className="textarea" rows={2} dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={p.summaryAr || ""} onChange={(e) => set({ summaryAr: e.target.value })} placeholder="وصف الباقة بالعربية" /></Labeled>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Pieces"><input className="input mono" type="number" value={p.pieces} onChange={(e) => set({ pieces: Number(e.target.value) })} /></Labeled>
            <Labeled label="Warranty (years)"><input className="input mono" type="number" value={p.warranty} onChange={(e) => set({ warranty: Number(e.target.value) })} /></Labeled>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{TT("PRICING · PER UNIT TYPE")}</div>
            <div className="stack-sm">
              {unitTypes.map((t) => (
                <div key={t.id} className="row-between" style={{ padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
                  <div style={{ fontSize: 13 }}>{t.name}</div>
                  <div className="row" style={{ gap: 6 }}>
                    <input className="input mono" style={{ width: 130, height: 30 }} type="number" value={p.pricing[t.id] || 0} onChange={(e) => setPrice(t.id, e.target.value)} />
                    <span className="muted" style={{ fontSize: 11 }}>SAR</span>
                  </div>
                </div>
              ))}
            </div>
            {!pricingOk && <div className="soft" style={{ fontSize: 11, color: "var(--negative, #b91c1c)", marginTop: 8 }}>{window.I18N && window.I18N.isAR ? "لا يمكن أن تكون الأسعار سالبة." : "Prices can't be negative."}</div>}
          </div>
          <hr className="hr-thin" />
          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div>
                <div className="eyebrow">{TT("FIT-OUT ADD-ON")}</div>
                <div className="soft" style={{ fontSize: 11.5, marginTop: 2 }}>Optional interior fit-out, offered when the buyer picks this package. Its own price (from the BOQ) and its own BOQ.</div>
              </div>
              <label className="row" style={{ gap: 8, fontSize: 13, whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={!!p.fitout} onChange={toggleFitout} /> Offer fit-out
              </label>
            </div>
            {p.fitout && (
              <div style={{ padding: 14, border: "1px dashed var(--brand)", borderRadius: "var(--r-sm)", background: "var(--brand-soft)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "120px", gap: 10 }}>
                  <Labeled label="Warranty (yrs)"><input className="input mono" type="number" value={p.fitout.warranty || 0} onChange={(e) => setFitout({ warranty: Number(e.target.value) })} /></Labeled>
                </div>
                <Labeled label="Summary"><textarea className="textarea" rows={2} value={p.fitout.summary} onChange={(e) => setFitout({ summary: e.target.value })} /></Labeled>
                <div className="row-between" style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg-card)", borderRadius: "var(--r-sm)" }}>
                  <div>
                    <div className="eyebrow">{TT("FIT-OUT PRICE · FROM BOQ")}</div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>+{D.fmtSAR(D.boqTotal(p.fitout.boq))} SAR</div>
                  </div>
                  <span className="chip">{(p.fitout.boq || []).length} priced lines</span>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>The fit-out price is the sum of its priced BOQ lines (Appendix F-2). Add or edit lines and their unit prices from the package card's "Fit-out BOQ" button — the total updates automatically.</div>
              </div>
            )}
          </div>
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!pkgValid} onClick={() => {
              const fields = { name: p.name, nameAr: p.nameAr, tier: p.tier, tierAr: p.tierAr, summary: p.summary, summaryAr: p.summaryAr,
                               pieces: Number(p.pieces) || 0, warranty: Number(p.warranty) || 0, pricing: { ...p.pricing },
                               signature: !!p.signature, brandName: p.brandName || "", brandNameAr: p.brandNameAr || "", brandLogo: p.brandLogo || null,
                               fitout: p.fitout ? { ...p.fitout } : null };
              window.RevnuSupport.act(() => p.id === "new" ? D.createPackage(Object.assign({ projectId, boq: p.boq || [] }, fields)) : D.setContentField("package", p.id, fields), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ الباقة." : "Package saved." }).then((r) => { if (r !== undefined) onClose(); });
            }}>{window.I18N?window.I18N.t("Save package"):"Save package"}</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoqDrawer({ pkg, onClose }) {
  const priced = !!pkg.priced;
  const [boq, setBoq] = useState([...(pkg.boq || [])]);
  const addLine = () => setBoq((b) => [...b, priced ? { room: "Flooring", item: "", qty: 1, unitPrice: 0, supplier: "", notes: "" } : { room: "Living", item: "", qty: 1, supplier: "", notes: "" }]);
  const setLine = (i, patch) => setBoq((b) => b.map((x, ix) => ix === i ? { ...x, ...patch } : x));
  const rmLine  = (i) => setBoq((b) => b.filter((_, ix) => ix !== i));
  const grand = D.boqTotal(boq);
  const [saved, setSaved] = useState(true);
  React.useEffect(() => { setSaved(false); }, [boq]);
  const canSave = pkg.parent && pkg.parent.id && pkg.parent.id !== "new";
  // CSV upload: the template's columns (Room, Item, Qty, [Unit price,] Supplier, Notes) in English or Arabic, or a sheet saved
  // from Excel with its own headings (e.g. Category, Item, Specification / Notes, Qty) — title, section and subtotal rows are skipped.
  const csvInput = React.useRef(null);
  const onCsv = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    const RS = window.RevnuSupport, AR = window.I18N && window.I18N.isAR;
    let rows;
    try { rows = await D.readTableFile(f); } catch (err) { RS.toast(err.message, "err"); return; }
    const plan = D.planBoqImport(rows, { priced });
    if (plan.error || !plan.lines.length) { RS.toast(plan.error || (AR ? "لم يُعثر على أسطر — أضف البنود تحت عناوين القالب: الغرفة، البند، الكمية، المورد، ملاحظات." : "No lines found — add the items under the template headings: Room, Item, Qty, Supplier, Notes."), "err"); return; }
    setBoq((b) => [...b, ...plan.lines]);
    RS.toast(AR ? (plan.lines.length + " سطرًا أُضيف — اضغط حفظ.") : (plan.lines.length + " lines added — press Save."), "ok");
  };
  const printPdf = () => {
    const w = window.open("", "_blank"); if (!w) return;
    const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const head = (priced ? ["Scope", "Item", "Qty", "Unit price", "Total"] : ["Room", "Item", "Qty"]).concat(["Supplier", "Notes"]);
    const rows = boq.map((l) => (priced ? [l.room, l.item, l.qty, D.fmtSAR(l.unitPrice || 0), D.fmtSAR((l.qty || 0) * (l.unitPrice || 0))] : [l.room, l.item, l.qty]).concat([l.supplier, l.notes]));
    w.document.write('<html><head><meta charset="utf-8"><title>BOQ · ' + esc(pkg.name) + '</title><style>@page{margin:18mm}body{font-family:Georgia,serif;color:#1a1a1a;font-size:12px}h1{font-size:18px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:14px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#666}tfoot td{font-weight:700;border-top:2px solid #999}</style></head><body>' +
      '<h1>' + esc(pkg.name) + ' — ' + (priced ? 'Fit-out scope (Appendix F-2)' : 'Furnishing bill of quantities (Appendix F-1)') + '</h1><div style="color:#666">' + boq.length + ' lines' + (priced ? ' · ' + D.fmtSAR(grand) + ' SAR excl. VAT' : '') + '</div>' +
      '<table><thead><tr>' + head.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
      (priced ? '<tfoot><tr><td colspan="4">Fit-out total (excl. VAT)</td><td>' + D.fmtSAR(grand) + '</td><td colspan="2"></td></tr></tfoot>' : '') + '</table></body></html>');
    w.document.close(); setTimeout(() => w.print(), 300);
  };
  const save = () => {
    if (!canSave) return;
    const patch = pkg.field === "fitout" ? { fitout: Object.assign({}, pkg.parent.fitout, { boq }) } : { boq };
    window.RevnuSupport.act(() => D.setContentField("package", pkg.parent.id, patch), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ جدول الكميات." : "BOQ saved." }).then((r) => { if (r !== undefined) { if (pkg.field === "fitout") { if (pkg.parent.fitout) pkg.parent.fitout.boq = boq; } else pkg.parent.boq = boq; setSaved(true); } });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 940, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">// BOQ · {pkg.name.toUpperCase()}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>{boq.length} lines{priced ? " · " + D.fmtSAR(grand) + " SAR" : ""}</div>
            <div className="soft" style={{ fontSize: 11.5, marginTop: 4 }}>{priced ? "Priced fit-out scope — line totals sum to the fit-out add-on price. Prints as Appendix F-2." : "Lives as Appendix F-1 of the Furnishing Schedule — the buyer sees this list."}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => D.downloadBoqTemplate(priced)}>{(window.I18N && window.I18N.isAR) ? "تنزيل القالب" : "Download template"}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => csvInput.current && csvInput.current.click()}>Upload CSV</button>
            <input ref={csvInput} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCsv} />
            <button className="btn btn-secondary btn-sm" onClick={printPdf} disabled={!boq.length}>Download PDF</button>
            <button className="btn btn-secondary btn-sm" onClick={addLine}>+ Line</button>
            {canSave && <button className={"btn btn-sm " + (saved ? "btn-secondary" : "btn-primary")} onClick={save}>{saved ? (window.I18N && window.I18N.isAR ? "✓ محفوظ" : "✓ Saved") : (window.I18N && window.I18N.isAR ? "حفظ" : "Save")}</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => { if (canSave && !saved) save(); onClose(); }}>Close ×</button>
          </div>
        </div>
        <div style={{ padding: 12 }}>
          <table className="tbl tbl-flush">
            <thead><tr><th>{priced ? "Scope" : "Room"}</th><th>Item</th><th style={{ width: 56 }}>Qty</th>{priced ? <th style={{ width: 120 }}>Unit price</th> : null}{priced ? <th style={{ width: 120 }}>Line total</th> : null}<th>Supplier</th><th>{TT("Notes")}</th><th></th></tr></thead>
            <tbody>
              {boq.map((l, i) => (
                <tr key={i}>
                  <td><input className="input" style={{ height: 28, fontSize: 12 }} value={l.room} onChange={(e) => setLine(i, { room: e.target.value })} /></td>
                  <td><input className="input" style={{ height: 28, fontSize: 12 }} value={l.item} onChange={(e) => setLine(i, { item: e.target.value })} /></td>
                  <td><input className="input mono" style={{ height: 28, fontSize: 12 }} type="number" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                  {priced ? <td><input className="input mono" style={{ height: 28, fontSize: 12 }} type="number" value={l.unitPrice || 0} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} /></td> : null}
                  {priced ? <td className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{D.fmtSAR((l.qty || 0) * (l.unitPrice || 0))}</td> : null}
                  <td><input className="input" style={{ height: 28, fontSize: 12 }} value={l.supplier} onChange={(e) => setLine(i, { supplier: e.target.value })} /></td>
                  <td><input className="input" style={{ height: 28, fontSize: 12 }} value={l.notes} onChange={(e) => setLine(i, { notes: e.target.value })} /></td>
                  <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => rmLine(i)}>×</button></td>
                </tr>
              ))}
              {boq.length === 0 && (
                <tr><td colSpan={priced ? 8 : 6} style={{ textAlign: "center", padding: 36, color: "var(--text-soft)" }}>No BOQ lines yet. Add one or upload a CSV.</td></tr>
              )}
            </tbody>
            {priced && boq.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--line-strong)" }}>
                  <td colSpan={4} style={{ fontWeight: 700, padding: "10px 8px" }}>Fit-out total (excl. VAT)</td>
                  <td className="mono" style={{ fontWeight: 700 }}>{D.fmtSAR(grand)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
          <div className="row" style={{ marginTop: 14, padding: "10px 14px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", fontSize: 12, color: "var(--text-muted)", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em", color: "var(--cyan)" }}>// CUSTOMER VIEW</span>
            <span>{priced ? "This priced scope prints as Appendix F-2; its total is the fit-out price added to the buyer's extras." : "This BOQ is printed into the buyer's Furnishing Schedule as Appendix F-1, grouped by room."}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WsPayments({ T }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding]   = useState(false);
  const cms = T.constructionMilestones || [];
  return (
    <>
      <WsCardHead eye="// PAYMENT PLANS" title="Custom payment plans"
        sub="Each instalment is a % linked to a construction milestone — so the developer always knows when it falls due. Discounts apply for upfront, surcharges for instalments."
        action={<button className="btn btn-primary" onClick={() => setAdding(true)}>+ New plan</button>} />

      {/* Construction milestone reference strip */}
      <div className="card card-pad" style={{ marginBottom: 14, background: "var(--bg-sunken)" }}>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div className="eyebrow">{TT("// CONSTRUCTION MILESTONES FOR THIS PROJECT")}</div>
          <span className="soft" style={{ fontSize: 11.5 }}>{cms.length} milestones · payment %s link here</span>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {cms.map((m, i) => (
            <span key={m.id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-soft)" }}>{String(i + 1).padStart(2, "0")}</span>
              <strong style={{ fontSize: 12.5 }}>{m.name}</strong>
              <span className="soft" style={{ fontSize: 11 }}>· {m.when}</span>
            </span>
          ))}
          {cms.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No construction milestones defined yet.</span>}
        </div>
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr><th>{TT("Name")}</th><th>Milestones (% linked to construction)</th><th className="right">Discount / surcharge</th><th>{TT("Notes")}</th><th className="right">{TT("Actions")}</th></tr></thead>
          <tbody>
            {T.payments.map((p) => {
              const delta = (p.disc * 100).toFixed(0);
              const cls = p.disc < 0 ? "chip chip-positive" : p.disc > 0 ? "chip chip-warning" : "chip";
              const ms  = p.milestones || [];
              const sum = ms.reduce((s, m) => s + (+m.pct || 0), 0);
              return (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="soft" style={{ fontSize: 11, marginTop: 2 }}>{ms.length} instalment{ms.length === 1 ? "" : "s"} · totals {sum}%</div>
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
                      {ms.map((m, i) => {
                        const cm = D.mileById(m.mileId);
                        return (
                          <span key={i} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                            <strong style={{ color: "var(--brand)" }}>{m.pct}%</strong>
                            <span>{m.label || cm?.name || "—"}</span>
                          </span>
                        );
                      })}
                      {ms.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No milestones defined.</span>}
                    </div>
                  </td>
                  <td className="right"><span className={cls}>{p.disc < 0 ? delta + "% off" : p.disc > 0 ? "+" + delta + "%" : "Flat"}</span></td>
                  <td className="muted" style={{ fontSize: 12 }}>{p.note}</td>
                  <td className="right"><button className="btn btn-sm btn-secondary" onClick={() => setEditing(p)}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <PaymentDrawer plan={editing} cms={cms} onClose={() => setEditing(null)} />}
      {adding  && <PaymentDrawer plan={{ id: "new", name: "", disc: 0, milestones: [{ pct: 100, mileId: cms[0]?.id || "" }], note: "" }} cms={cms} onClose={() => setAdding(false)} />}
    </>
  );
}

function PaymentDrawer({ plan, cms, onClose }) {
  const [p, setP] = useState({ ...plan, milestones: (plan.milestones || []).map((m) => ({ ...m })) });
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const setMile = (i, patch) => setP((x) => {
    const ms = x.milestones.map((m, idx) => idx === i ? { ...m, ...patch } : m);
    return { ...x, milestones: ms };
  });
  const addMile = () => setP((x) => ({
    ...x,
    milestones: [...x.milestones, { pct: 0, mileId: (cms || [])[Math.min(x.milestones.length, (cms || []).length - 1)]?.id || "" }],
  }));
  const removeMile = (i) => setP((x) => ({ ...x, milestones: x.milestones.filter((_, idx) => idx !== i) }));
  const moveMile = (i, dir) => setP((x) => {
    const ms = [...x.milestones];
    const j = i + dir;
    if (j < 0 || j >= ms.length) return x;
    [ms[i], ms[j]] = [ms[j], ms[i]];
    return { ...x, milestones: ms };
  });

  const total = p.milestones.reduce((s, m) => s + (+m.pct || 0), 0);
  const totalOk = total === 100;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div><div className="eyebrow">{TT("// PAYMENT PLAN")}</div><div className="display-sm" style={{ marginTop: 2 }}>{p.name || "New plan"}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <Labeled label="Plan name"><input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="3 instalments" /></Labeled>

          {/* Structured milestone editor */}
          <div>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <label className="eyebrow">// MILESTONES · % LINKED TO CONSTRUCTION</label>
              <span className="soft" style={{ fontSize: 11 }}>Total must equal 100%</span>
            </div>
            <div className="card card-flush" style={{ background: "var(--bg-sunken)", padding: 10 }}>
              {p.milestones.length === 0 && (
                <div className="muted" style={{ fontSize: 12.5, padding: "6px 4px" }}>No milestones yet — add one to start.</div>
              )}
              {p.milestones.map((m, i) => {
                const cm = D.mileById(m.mileId);
                return (
                  <div key={i} className="row" style={{ gap: 8, padding: "8px 4px", borderBottom: i < p.milestones.length - 1 ? "1px solid var(--line)" : "0", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-soft)", width: 22 }}>{String(i + 1).padStart(2, "0")}</span>
                    <div className="row" style={{ alignItems: "center", gap: 4, width: 92 }}>
                      <input className="input mono" type="number" min="0" max="100" step="0.5" value={m.pct} onChange={(e) => setMile(i, { pct: Number(e.target.value) })} style={{ textAlign: "right", padding: "0 8px" }} />
                      <span className="muted" style={{ fontSize: 12 }}>%</span>
                    </div>
                    <select className="input" value={m.mileId} onChange={(e) => setMile(i, { mileId: e.target.value })} style={{ flex: 1, minWidth: 0 }}>
                      <option value="">— pick milestone —</option>
                      {(cms || []).map((c) => (
                        <option key={c.id} value={c.id}>{String(c.order).padStart(2, "0")} · {c.name} · {c.when}</option>
                      ))}
                    </select>
                    <div className="row" style={{ gap: 2 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => moveMile(i, -1)} disabled={i === 0} title="Move up" style={{ padding: "0 8px" }}>↑</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => moveMile(i, +1)} disabled={i === p.milestones.length - 1} title="Move down" style={{ padding: "0 8px" }}>↓</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeMile(i)} title="Remove" style={{ padding: "0 8px", color: "var(--warning)" }}>×</button>
                    </div>
                  </div>
                );
              })}
              <div className="row-between" style={{ padding: "10px 4px 4px", marginTop: 4, borderTop: "1px solid var(--line)" }}>
                <button className="btn btn-secondary btn-sm" onClick={addMile}>+ Add milestone</button>
                <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                  <span className="eyebrow" style={{ fontSize: 10.5 }}>// TOTAL</span>
                  <strong style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: totalOk ? "var(--positive)" : "var(--warning)" }}>
                    {total.toFixed(total % 1 ? 1 : 0)}%
                  </strong>
                  {!totalOk && <span style={{ fontSize: 11, color: "var(--warning)" }}>{total > 100 ? `−${(total - 100).toFixed(1)}` : `+${(100 - total).toFixed(1)}`} to balance</span>}
                </div>
              </div>
            </div>
          </div>

          <Labeled label="Discount (-) or surcharge (+) %">
            <div className="row" style={{ gap: 6 }}>
              <input className="input mono" type="number" step="0.5" value={(p.disc * 100).toFixed(1)} onChange={(e) => set({ disc: Number(e.target.value) / 100 })} />
              <span className="muted">%</span>
            </div>
            <div className="soft" style={{ fontSize: 11, marginTop: 4 }}>Negative discounts, positive surcharges.</div>
          </Labeled>
          <Labeled label="Customer-facing note"><input className="input" value={p.note} onChange={(e) => set({ note: e.target.value })} placeholder="+2% surcharge." /></Labeled>
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!totalOk}>{window.I18N?window.I18N.t("Save plan"):"Save plan"}</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WsKitchens({ T }) {
  const AR = window.I18N && window.I18N.isAR;
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [, bump] = useState(0);
  const on = !!(T.project && T.project.features && T.project.features.kitchens);
  const types = T.unitTypes || [];
  const list = T.kitchens || [];
  return (
    <>
      <WsCardHead eye="// KITCHENS" title="Kitchen designs" sub={AR ? "أضف أي عدد من التصاميم، ولكل تصميم لوحات ألوان وصور ثلاثية الأبعاد. نطاقان لكل تصميم: المطبخ فقط (خزائن) أو مطبخ كامل مع الأجهزة، بسعر لكل نوع وحدة. يفعل من مفاتيح المشروع." : "Add as many designs as you like; each has its own palettes, 3D shots and two scopes — kitchen only (cabinetry) or full kitchen with appliances — priced per unit type. Enabled per project from the feature toggles."}
        action={<div className="row" style={{ gap: 8 }}><span className={"chip " + (on ? "" : "chip-soft")}>{on ? (AR ? "مفعل في مسار البيع" : "ON in sales flow") : (AR ? "غير مفعل — فعله من المفاتيح" : "OFF — enable in feature toggles")}</span><button className="btn btn-primary" onClick={() => setAdding(true)}>{AR ? "+ إضافة مطبخ" : "+ Add kitchen"}</button></div>} />
      {editing && <KitchenDrawer kitchen={editing} types={types} onClose={() => { setEditing(null); bump((x) => x + 1); }} />}
      {adding && <KitchenDrawer kitchen={{ id: "new", projectId: T.project.id, name: "", nameAr: "", summary: "", summaryAr: "", images: [], palettes: [{ id: "p1", name: "", nameAr: "", colors: ["#E8DFD0", "#C9A87C", "#F4F1EA"] }], scopes: { cabinets: { includes: [], includesAr: [], pricing: {} }, full: { includes: [], includesAr: [], pricing: {} } } }} types={types} onClose={() => { setAdding(false); bump((x) => x + 1); }} />}
      {list.length === 0 ? <div className="card card-pad soft">{AR ? "لا توجد تصاميم مطابخ لهذا المشروع — اضغط «إضافة مطبخ»." : "No kitchen designs for this project yet — press “Add kitchen”."}</div> : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        {list.map((k) => (
          <div key={k.id} className="card card-pad">
            {k.images && k.images.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 10, borderRadius: 6, overflow: "hidden" }}>
                {k.images.slice(0, 3).map((img, i) => (
                  <div key={i} style={{ flex: 1, aspectRatio: "4/3", overflow: "hidden", background: "var(--bg-sunken)" }}>
                    <img src={img.src} alt={img.label || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ))}
              </div>
            )}
            <strong>{AR ? (k.nameAr || k.name) : k.name}</strong>
            <p style={{ margin: "4px 0 8px", fontSize: 12.5, color: "var(--text-muted)" }}>{AR ? (k.summaryAr || k.summary) : k.summary}</p>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {(k.palettes || []).map((p) => (
                <span key={p.id} className="chip chip-soft" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-flex", gap: 2 }}>{p.colors.slice(0, 3).map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}</span>{AR ? (p.nameAr || p.name) : p.name}
                </span>
              ))}
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead><tr className="soft" style={{ fontSize: 10.5, textAlign: "start" }}><th style={{ textAlign: "start", paddingBottom: 4 }}>{AR ? "النوع" : "Type"}</th><th style={{ textAlign: "end" }}>{AR ? "المطبخ فقط" : "Kitchen only"}</th><th style={{ textAlign: "end" }}>{AR ? "مطبخ كامل" : "Full kitchen"}</th></tr></thead>
              <tbody>{types.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px dotted var(--line)" }}>
                  <td style={{ padding: "4px 0" }}>{AR ? (t.nameAr || t.name) : t.name}</td>
                  <td className="mono" style={{ textAlign: "end" }}>{D.kitchenPrice(k, "cabinets", t.id) ? D.fmtSAR(D.kitchenPrice(k, "cabinets", t.id)) : "—"}</td>
                  <td className="mono" style={{ textAlign: "end" }}>{D.kitchenPrice(k, "full", t.id) ? D.fmtSAR(D.kitchenPrice(k, "full", t.id)) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="soft" style={{ fontSize: 10.5, marginTop: 6 }}>{AR ? "الأسعار بالريال قبل الضريبة" : "SAR, ex-VAT"}</div>
            {(k.addons || []).length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>{AR ? "// إضافات اختيارية" : "// OPTIONAL ITEMS"}</div>
                {k.addons.map((a) => <div key={a.id} className="row-between" style={{ padding: "3px 0", borderTop: "1px dotted var(--line)" }}><span>{AR ? (a.nameAr || a.name) : a.name}<span className="soft"> · {(a.scopes || []).map((s) => s === "full" ? (AR ? "كامل" : "full") : (AR ? "خزائن" : "cabinets")).join("/")}</span></span><span className="mono">+{D.fmtSAR(a.price)}</span></div>)}
              </div>
            )}
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(k)}>{AR ? "تعديل" : "Edit"}</button>
              <DelBtn kind="kitchen" id={k.id} name={k.name} after={() => bump((x) => x + 1)} />
            </div>
          </div>
        ))}
      </div>)}
    </>
  );
}

/* Kitchen editor — name, summary, palettes (any number), 3D shots, and per-scope includes + per-type prices. */
function KitchenDrawer({ kitchen, types, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const clone = (k) => ({ ...k, images: [...(k.images || [])], addons: (k.addons || []).map((a) => ({ ...a, scopes: [...(a.scopes || ["cabinets", "full"])] })), palettes: (k.palettes || []).map((p) => ({ ...p, colors: [...(p.colors || [])] })),
    scopes: { cabinets: { includes: [...((k.scopes && k.scopes.cabinets && k.scopes.cabinets.includes) || [])], includesAr: [...((k.scopes && k.scopes.cabinets && k.scopes.cabinets.includesAr) || [])], pricing: { ...((k.scopes && k.scopes.cabinets && k.scopes.cabinets.pricing) || {}) } },
              full:     { includes: [...((k.scopes && k.scopes.full && k.scopes.full.includes) || [])], includesAr: [...((k.scopes && k.scopes.full && k.scopes.full.includesAr) || [])], pricing: { ...((k.scopes && k.scopes.full && k.scopes.full.pricing) || {}) } } } });
  const [k, setK] = useState(() => clone(kitchen));
  const set = (patch) => setK((p) => ({ ...p, ...patch }));
  const setScope = (sc, patch) => setK((p) => ({ ...p, scopes: { ...p.scopes, [sc]: { ...p.scopes[sc], ...patch } } }));
  const [line, setLine] = useState({ cabinets: "", full: "" });
  const [busy, setBusy] = useState(false);
  const imgInput = React.useRef(null);
  const onUploadImg = async (e) => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    setBusy(true);
    try { const added = []; for (const f of files) { const url = await uploadScaled(f, 1400, "kitchens/" + (k.projectId || "misc")); added.push({ id: "ki" + Date.now().toString(36) + added.length, label: f.name.replace(/\.[^.]+$/, ""), labelAr: "", src: url }); } set({ images: [...k.images, ...added] }); }
    catch (err) { console.error(err); }
    setBusy(false); e.target.value = "";
  };
  const save = () => {
    if (!k.name.trim()) return;
    const payload = { name: k.name.trim(), nameAr: k.nameAr || "", summary: k.summary || "", summaryAr: k.summaryAr || "", images: k.images, palettes: k.palettes.filter((p) => (p.name || "").trim() || p.colors.length).map((p, i) => ({ ...p, id: p.id || ("p" + (i + 1)), name: p.name || ("Palette " + (i + 1)) })), scopes: k.scopes, addons: k.addons.filter((a) => (a.name || "").trim()).map((a, i) => ({ ...a, id: a.id || ("a" + (i + 1)), price: Number(a.price) || 0 })) };
    if (hasNegative(payload)) { window.RevnuSupport.toast(negMsg(), "err"); return; }
    window.RevnuSupport.act(() => (k.id === "new" ? D.createKitchen({ projectId: k.projectId, ...payload }) : D.setContentField("kitchen", k.id, payload)), { done: AR ? "تم حفظ المطبخ." : "Kitchen saved." }).then((r) => { if (r !== undefined) onClose(); });
  };
  const scopeLabel = { cabinets: AR ? "المطبخ فقط (خزائن)" : "Kitchen only (cabinetry)", full: AR ? "مطبخ كامل (مع الأجهزة)" : "Full kitchen (with appliances)" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
          <div><div className="eyebrow">{k.id === "new" ? (AR ? "// مطبخ جديد" : "// NEW KITCHEN") : (AR ? "// تعديل المطبخ" : "// EDIT KITCHEN")}</div><div className="display-sm" style={{ marginTop: 2 }}>{k.name || (AR ? "مطبخ جديد" : "New kitchen")}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{AR ? "إغلاق ×" : "Close ×"}</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label={AR ? "الاسم (إنجليزي)" : "Name (English)"}><input className="input" value={k.name} onChange={(e) => set({ name: e.target.value })} placeholder="Linear Oak" /></Labeled>
            <Labeled label="الاسم (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={k.nameAr || ""} onChange={(e) => set({ nameAr: e.target.value })} placeholder="لينير أوك" /></Labeled>
          </div>
          <Labeled label={AR ? "الوصف (إنجليزي)" : "Summary (English)"}><input className="input" value={k.summary || ""} onChange={(e) => set({ summary: e.target.value })} placeholder="One line shown under the name" /></Labeled>
          <Labeled label="الوصف (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={k.summaryAr || ""} onChange={(e) => set({ summaryAr: e.target.value })} /></Labeled>

          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div className="eyebrow">{AR ? "لوحات الألوان" : "COLOUR PALETTES"}</div>
              <button className="btn btn-sm btn-secondary" onClick={() => set({ palettes: [...k.palettes, { id: "p" + Date.now().toString(36).slice(-4), name: "", nameAr: "", colors: ["#DDDDDD", "#999999", "#F5F5F5"] }] })}>{AR ? "+ لوحة" : "+ Palette"}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {k.palettes.map((p, i) => (
                <div key={p.id || i} style={{ padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8, alignItems: "center" }}>
                  <input className="input" style={{ height: 30, fontSize: 12 }} value={p.name || ""} placeholder={AR ? "الاسم (إنجليزي)" : "Palette name"} onChange={(e) => set({ palettes: k.palettes.map((x, ix) => ix === i ? { ...x, name: e.target.value } : x) })} />
                  <input className="input" dir="rtl" style={{ height: 30, fontSize: 12, fontFamily: "var(--font-ar)" }} value={p.nameAr || ""} placeholder="الاسم بالعربية" onChange={(e) => set({ palettes: k.palettes.map((x, ix) => ix === i ? { ...x, nameAr: e.target.value } : x) })} />
                  <div className="row" style={{ gap: 4 }}>
                    {p.colors.map((c, ci) => (
                      <label key={ci} title={c} style={{ position: "relative", width: 24, height: 24, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.15)", cursor: "pointer", overflow: "hidden" }}>
                        <input type="color" value={c} onChange={(e) => set({ palettes: k.palettes.map((x, ix) => ix === i ? { ...x, colors: x.colors.map((cc, cci) => cci === ci ? e.target.value : cc) } : x) })} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                      </label>
                    ))}
                    {p.colors.length < 5 && <button className="btn btn-sm btn-ghost" style={{ height: 24, padding: "0 6px" }} onClick={() => set({ palettes: k.palettes.map((x, ix) => ix === i ? { ...x, colors: [...x.colors, "#CCCCCC"] } : x) })}>+</button>}
                    {p.colors.length > 1 && <button className="btn btn-sm btn-ghost" style={{ height: 24, padding: "0 6px" }} onClick={() => set({ palettes: k.palettes.map((x, ix) => ix === i ? { ...x, colors: x.colors.slice(0, -1) } : x) })}>−</button>}
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={() => set({ palettes: k.palettes.filter((_, ix) => ix !== i) })}>×</button>
                </div>
              ))}
              {k.palettes.length === 0 && <div className="soft" style={{ fontSize: 12 }}>{AR ? "أضف لوحة واحدة على الأقل." : "Add at least one palette."}</div>}
            </div>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div className="eyebrow">{AR ? "اللقطات ثلاثية الأبعاد" : "3D SHOTS"}</div>
              <button className="btn btn-sm btn-secondary" onClick={() => imgInput.current && imgInput.current.click()}>{busy ? (AR ? "جار الرفع…" : "Uploading…") : (AR ? "+ رفع صور" : "+ Upload images")}</button>
              <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: "none" }} onChange={onUploadImg} />
            </div>
            {k.images.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {k.images.map((img, i) => (
                  <div key={img.id || i} style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "var(--bg-sunken)" }}>
                    <div style={{ aspectRatio: "16/10", background: "var(--bg-tint)" }}><img src={img.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
                    <div style={{ padding: 6 }}>
                      <input className="input" style={{ height: 26, fontSize: 11 }} value={img.label || ""} placeholder={AR ? "وصف" : "Caption"} onChange={(e) => set({ images: k.images.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x) })} />
                      <div className="row" style={{ gap: 4, marginTop: 4 }}>
                        <button className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => { const a = [...k.images]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ images: a }); }}>‹</button>
                        <button className="btn btn-sm btn-ghost" disabled={i === k.images.length - 1} onClick={() => { const a = [...k.images]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; set({ images: a }); }}>›</button>
                        <button className="btn btn-sm btn-ghost grow" onClick={() => set({ images: k.images.filter((_, ix) => ix !== i) })}>{AR ? "حذف" : "Remove"}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div onClick={() => imgInput.current && imgInput.current.click()} style={{ cursor: "pointer", padding: 24, border: "1px dashed var(--line-strong)", borderRadius: 6, textAlign: "center", color: "var(--text-soft)", fontSize: 12 }}>
                {AR ? "لا توجد صور بعد — انقر لرفع لقطات المطبخ." : "No shots yet — click to upload kitchen renders."}
              </div>
            )}
          </div>

          {["cabinets", "full"].map((sc) => (
            <div key={sc} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>{scopeLabel[sc]}</div>
              <div className="soft" style={{ fontSize: 11, marginBottom: 6 }}>{AR ? "السعر لكل نوع وحدة (ريال، قبل الضريبة) — اترك 0 إذا لم يكن متاحا لهذا النوع" : "Price per unit type (SAR, ex-VAT) — leave 0 if not offered for that type"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginBottom: 12 }}>
                {types.map((t) => (
                  <Labeled key={t.id} label={AR ? (t.nameAr || t.name) : t.name}>
                    <input className="input mono" type="number" step="500" min="0" value={k.scopes[sc].pricing[t.id] || 0} onChange={(e) => setScope(sc, { pricing: { ...k.scopes[sc].pricing, [t.id]: Number(e.target.value) || 0 } })} />
                  </Labeled>
                ))}
              </div>
              <div className="soft" style={{ fontSize: 11, marginBottom: 6 }}>{AR ? "المحتويات (إنجليزي · عربي)" : "Includes (English · Arabic)"}</div>
              <ul style={{ padding: 0, margin: "0 0 8px", listStyle: "none" }}>
                {k.scopes[sc].includes.map((it, i) => (
                  <li key={i} className="row-between" style={{ padding: "6px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", marginBottom: 6, fontSize: 12.5, gap: 8 }}>
                    <span style={{ flex: 1 }}>{it}</span>
                    <input className="input" dir="rtl" style={{ flex: 1, height: 26, fontSize: 12, fontFamily: "var(--font-ar)" }} value={k.scopes[sc].includesAr[i] || ""} placeholder="الترجمة العربية" onChange={(e) => { const a = [...k.scopes[sc].includesAr]; a[i] = e.target.value; setScope(sc, { includesAr: a }); }} />
                    <button className="btn btn-sm btn-ghost" onClick={() => setScope(sc, { includes: k.scopes[sc].includes.filter((_, ix) => ix !== i), includesAr: k.scopes[sc].includesAr.filter((_, ix) => ix !== i) })}>×</button>
                  </li>
                ))}
              </ul>
              <div className="row" style={{ gap: 6 }}>
                <input className="input" value={line[sc]} onChange={(e) => setLine({ ...line, [sc]: e.target.value })} placeholder={sc === "full" ? "e.g. Fridge-freezer · integrated" : "e.g. Quartz worktop · 20 mm"} onKeyDown={(e) => { if (e.key === "Enter" && line[sc].trim()) { setScope(sc, { includes: [...k.scopes[sc].includes, line[sc].trim()], includesAr: [...k.scopes[sc].includesAr, ""] }); setLine({ ...line, [sc]: "" }); } }} />
                <button className="btn btn-secondary" onClick={() => { if (line[sc].trim()) { setScope(sc, { includes: [...k.scopes[sc].includes, line[sc].trim()], includesAr: [...k.scopes[sc].includesAr, ""] }); setLine({ ...line, [sc]: "" }); } }}>{AR ? "إضافة" : "Add"}</button>
              </div>
            </div>
          ))}

          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <div className="eyebrow">{AR ? "إضافات اختيارية" : "OPTIONAL ITEMS"}</div>
              <button className="btn btn-sm btn-secondary" onClick={() => set({ addons: [...k.addons, { id: "a" + Date.now().toString(36).slice(-4), name: "", nameAr: "", price: 0, scopes: ["full"] }] })}>{AR ? "+ إضافة" : "+ Item"}</button>
            </div>
            <div className="soft" style={{ fontSize: 11, marginBottom: 8 }}>{AR ? "عناصر يمكن للعميل إضافتها أو إزالتها (مثل غسالة الملابس). سعر ثابت لكل وحدة، قبل الضريبة. حدد النطاقات التي تعرض فيها." : "Items the customer can add or remove (e.g. washing machine). Flat price per unit, ex-VAT. Choose which scopes offer it."}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {k.addons.map((a, i) => {
                const upd = (patch) => set({ addons: k.addons.map((x, ix) => ix === i ? { ...x, ...patch } : x) });
                const tog = (sc) => upd({ scopes: a.scopes.includes(sc) ? a.scopes.filter((s) => s !== sc) : [...a.scopes, sc] });
                return (
                  <div key={a.id || i} style={{ padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", display: "grid", gridTemplateColumns: "1fr 1fr 110px auto auto", gap: 8, alignItems: "center" }}>
                    <input className="input" style={{ height: 30, fontSize: 12 }} value={a.name || ""} placeholder={AR ? "الاسم (إنجليزي)" : "e.g. Washing machine"} onChange={(e) => upd({ name: e.target.value })} />
                    <input className="input" dir="rtl" style={{ height: 30, fontSize: 12, fontFamily: "var(--font-ar)" }} value={a.nameAr || ""} placeholder="الاسم بالعربية" onChange={(e) => upd({ nameAr: e.target.value })} />
                    <input className="input mono" type="number" step="100" min="0" style={{ height: 30, fontSize: 12 }} value={a.price || 0} onChange={(e) => upd({ price: Number(e.target.value) || 0 })} />
                    <div style={{ display: "flex", border: "1px solid var(--line-strong)", borderRadius: 6, overflow: "hidden", fontSize: 10.5 }}>
                      {["cabinets", "full"].map((sc, si) => <button key={sc} type="button" onClick={() => tog(sc)} style={{ padding: "5px 8px", border: "none", borderLeft: si ? "1px solid var(--line-strong)" : "none", cursor: "pointer", fontWeight: 600, background: a.scopes.includes(sc) ? "var(--brand)" : "transparent", color: a.scopes.includes(sc) ? "var(--brand-text)" : "var(--text-muted)" }}>{sc === "full" ? (AR ? "كامل" : "Full") : (AR ? "خزائن" : "Only")}</button>)}
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => set({ addons: k.addons.filter((_, ix) => ix !== i) })}>×</button>
                  </div>
                );
              })}
              {k.addons.length === 0 && <div className="soft" style={{ fontSize: 12 }}>{AR ? "لا توجد إضافات." : "No optional items yet."}</div>}
            </div>
          </div>

          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!k.name.trim()} onClick={save}>{k.id === "new" ? (AR ? "إنشاء المطبخ" : "Create kitchen") : (AR ? "حفظ" : "Save kitchen")}</button>
            <button className="btn btn-ghost" onClick={onClose}>{AR ? "إلغاء" : "Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Cooling / AC — cooling points per unit type + AC systems (brand, tiers, install, fit, add-ons) */
function WsCooling({ T }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [, bump] = useState(0); const refresh = () => bump((x) => x + 1);
  const [editing, setEditing] = useState(null);
  const [editPts, setEditPts] = useState(null);
  const on = !!(T.project && T.project.features && T.project.features.cooling);
  const types = T.unitTypes || []; const list = T.ac || [];
  return (
    <>
      <WsCardHead eye="// COOLING" title={TL("Cooling points per unit type", "نقاط التبريد لكل نوع وحدة")}
        sub={TL("Each unit type lists the rooms that need an indoor unit and the capacity each needs. Every AC system prices itself from this table, so a 1-bedroom and a penthouse are priced correctly without extra rows.", "لكل نوع وحدة قائمة بالغرف التي تحتاج وحدة داخلية وسعة كل منها. كل نظام تكييف يسعر تلقائيا من هذا الجدول، فتسعر الغرفة الواحدة والبنتهاوس بشكل صحيح دون صفوف إضافية.")}
        action={<span className={"chip " + (on ? "" : "chip-soft")}>{on ? TL("ON in sales flow", "مفعل في مسار البيع") : TL("OFF — enable in feature toggles", "غير مفعل — فعله من المفاتيح")}</span>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 22 }}>
        {types.map((t) => { const pts = D.coolingPointsFor(T.project.id, t.id); const tot = pts.reduce((s, p) => s + (Number(p.btu) || 0), 0); return (
          <div key={t.id} className="card card-pad">
            <div className="row-between"><strong>{AR ? (t.nameAr || t.name) : t.name}</strong><span className="chip chip-soft">{pts.length} {TL("units", "وحدات")} · {D.fmtSAR(tot)} BTU</span></div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 8 }}><tbody>
              {pts.map((p, i) => <tr key={i} style={{ borderTop: i ? "1px dotted var(--line)" : "none" }}><td style={{ padding: "3px 0" }}>{AR ? (p.roomAr || p.room) : p.room}</td><td className="mono" style={{ textAlign: "end" }}>{D.fmtSAR(p.btu)} BTU</td></tr>)}
              {pts.length === 0 && <tr><td className="soft" style={{ padding: "4px 0" }}>{TL("No cooling points yet.", "لا توجد نقاط تبريد بعد.")}</td></tr>}
            </tbody></table>
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setEditPts({ type: t, points: pts.map((p) => ({ ...p })) })}>{TL("Edit rooms", "تعديل الغرف")}</button>
          </div>); })}
      </div>

      <WsCardHead eye="// AC SYSTEMS" title={TL("Air-conditioning systems", "أنظمة التكييف")}
        sub={TL("Brand + model with a price per capacity tier and an installation fee per indoor unit. Limit a system to the unit types it physically fits (central VRF for penthouses, ducted only where there is a false ceiling).", "ماركة وموديل بسعر لكل شريحة سعة ورسوم تركيب لكل وحدة داخلية. حدد لكل نظام أنواع الوحدات التي يناسبها فعليا (المركزي للبنتهاوس، والمخفي حيث يوجد سقف مستعار).")}
        action={<button className="btn btn-primary" onClick={() => setEditing({ id: "new", projectId: T.project.id, brand: "", brandAr: "", name: "", nameAr: "", type: "split", summary: "", summaryAr: "", energyClass: "A+", warrantyYears: 5, install: 350, tiers: { "18000": 0, "24000": 0, "30000": 0, "36000": 0 }, fits: [], addons: [], images: [], logo: "" })}>{TL("+ Add system", "+ إضافة نظام")}</button>} />
      {list.length === 0 ? <div className="card card-pad soft">{TL("No AC systems for this project yet — press “Add system”.", "لا توجد أنظمة تكييف لهذا المشروع بعد — اضغط «إضافة نظام».")}</div> : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        {list.map((a) => { const ty = D.acTypeById(a.type); const tiers = Object.keys(a.tiers || {}).map(Number).sort((x, y) => x - y); return (
          <div key={a.id} className="card card-pad">
            <div className="row-between" style={{ alignItems: "flex-start" }}>
              <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                {a.logo ? <span style={{ width: 66, height: 38, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: 5 }}><img src={a.logo} alt={a.brand} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></span> : null}
                <div><strong style={{ fontSize: 15 }}>{AR ? (a.brandAr || a.brand) : a.brand}</strong> <span>{AR ? (a.nameAr || a.name) : a.name}</span>
                <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}><span className="chip chip-soft">{AR ? ty.ar : ty.en}</span>{a.energyClass ? <span className="chip chip-soft">{a.energyClass}</span> : null}{a.warrantyYears ? <span className="chip chip-soft">{a.warrantyYears} {TL("yr", "سنة")}</span> : null}</div></div></div>
              <span className="chip">{(!a.fits || !a.fits.length) ? TL("Fits all types", "لكل الأنواع") : a.fits.map((id) => { const t = types.find((x) => x.id === id); return t ? (AR ? (t.nameAr || t.name) : t.name).split(" · ")[0] : id; }).join(", ")}</span>
            </div>
            <p style={{ margin: "8px 0", fontSize: 12.5, color: "var(--text-muted)" }}>{AR ? (a.summaryAr || a.summary) : a.summary}</p>
            {(a.images || []).length > 0 && <div style={{ display: "flex", gap: 4, marginBottom: 10, borderRadius: 6, overflow: "hidden" }}>{a.images.slice(0, 4).map((img, i) => <div key={img.id || i} style={{ flex: 1, aspectRatio: "4/3", overflow: "hidden", background: "var(--bg-sunken)" }}><img src={img.src} alt={img.label || ""} title={img.label || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>)}</div>}
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead><tr className="soft" style={{ fontSize: 10.5 }}><th style={{ textAlign: "start", paddingBottom: 4 }}>{TL("Capacity", "السعة")}</th><th style={{ textAlign: "end" }}>{TL("Price / unit", "السعر / وحدة")}</th></tr></thead>
              <tbody>{tiers.map((k) => <tr key={k} style={{ borderTop: "1px dotted var(--line)" }}><td style={{ padding: "3px 0" }} className="mono">{D.fmtSAR(k)} BTU</td><td className="mono" style={{ textAlign: "end" }}>{D.fmtSAR(a.tiers[k])}</td></tr>)}
                <tr style={{ borderTop: "1px dotted var(--line)" }}><td style={{ padding: "3px 0" }}>{TL("Installation / indoor unit", "التركيب / وحدة داخلية")}</td><td className="mono" style={{ textAlign: "end" }}>{D.fmtSAR(a.install)}</td></tr></tbody>
            </table>
            <div className="eyebrow" style={{ fontSize: 10, margin: "10px 0 4px" }}>{TL("// PRICE PER UNIT TYPE (EX-VAT)", "// السعر لكل نوع وحدة (قبل الضريبة)")}</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{types.map((t) => { const p = D.acPrice(a, T.project.id, t.id); return <span key={t.id} className="chip chip-soft" style={{ opacity: p ? 1 : 0.5 }}>{(AR ? (t.nameAr || t.name) : t.name).split(" · ")[0]}: <span className="mono" style={{ marginInlineStart: 4 }}>{p ? D.fmtSAR(p) : "—"}</span></span>; })}</div>
            {(a.addons || []).length > 0 && <div style={{ marginTop: 8, fontSize: 12 }}><div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>{TL("// OPTIONAL ITEMS", "// إضافات اختيارية")}</div>{a.addons.map((x) => <div key={x.id} className="row-between" style={{ padding: "3px 0", borderTop: "1px dotted var(--line)" }}><span>{AR ? (x.nameAr || x.name) : x.name}</span><span className="mono">+{D.fmtSAR(x.price)}</span></div>)}</div>}
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(a)}>{TL("Edit", "تعديل")}</button>
              <DelBtn kind="ac" id={a.id} name={a.brand + " " + a.name} after={refresh} />
            </div>
          </div>); })}
      </div>)}
      {editing && <ACDrawer ac={editing} types={types} onClose={() => { setEditing(null); refresh(); }} />}
      {editPts && <CoolingPointsDrawer projectId={T.project.id} type={editPts.type} initial={editPts.points} onClose={() => { setEditPts(null); refresh(); }} />}
    </>
  );
}
function CoolingPointsDrawer({ projectId, type, initial, onClose }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [pts, setPts] = useState(initial);
  const upd = (i, p) => setPts(pts.map((x, ix) => ix === i ? { ...x, ...p } : x));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 520, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div><div className="eyebrow">{TL("// COOLING POINTS", "// نقاط التبريد")}</div><div className="display-sm" style={{ marginTop: 2 }}>{AR ? (type.nameAr || type.name) : type.name}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{TL("Close ×", "إغلاق ×")}</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="soft" style={{ fontSize: 12 }}>{TL("One row per indoor unit: the room and the cooling capacity it needs. Systems price each row at the smallest tier that covers the capacity.", "صف لكل وحدة داخلية: الغرفة وسعة التبريد المطلوبة. تسعر كل غرفة بأصغر شريحة تغطي السعة.")}</div>
          {pts.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 110px auto", gap: 8, alignItems: "center", padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
              <input className="input" style={{ height: 30, fontSize: 12 }} value={p.room || ""} placeholder={TL("Room (EN)", "الغرفة (إنجليزي)")} onChange={(e) => upd(i, { room: e.target.value })} />
              <input className="input" dir="rtl" style={{ height: 30, fontSize: 12, fontFamily: "var(--font-ar)" }} value={p.roomAr || ""} placeholder="الغرفة (عربي)" onChange={(e) => upd(i, { roomAr: e.target.value })} />
              <select className="select" style={{ height: 30, fontSize: 12 }} value={p.btu} onChange={(e) => upd(i, { btu: Number(e.target.value) })}>{[9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000].map((b) => <option key={b} value={b}>{D.fmtSAR(b)} BTU</option>)}</select>
              <button className="btn btn-sm btn-ghost" onClick={() => setPts(pts.filter((_, ix) => ix !== i))}>×</button>
            </div>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setPts([...pts, { room: "", roomAr: "", btu: 18000 }])}>{TL("+ Room", "+ غرفة")}</button>
            <span className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
            <button className="btn btn-primary" onClick={() => { const list = pts.filter((p) => (p.room || p.roomAr || "").trim()).map((p) => ({ room: p.room || p.roomAr, roomAr: p.roomAr || "", btu: Number(p.btu) || 18000 })); if (hasNegative(list)) { window.RevnuSupport.toast(negMsg(), "err"); return; } window.RevnuSupport.act(() => D.setCoolingPoints(projectId, type.id, list), { done: TL("Cooling points saved.", "تم حفظ نقاط التكييف.") }).then((r) => { if (r !== undefined) onClose(); }); }}>{TL("Save", "حفظ")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function ACDrawer({ ac, types, onClose }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [a, setA] = useState(() => ({ ...ac, tiers: { ...(ac.tiers || {}) }, fits: [...(ac.fits || [])], addons: (ac.addons || []).map((x) => ({ ...x })), images: (ac.images || []).map((x) => ({ ...x })), logo: ac.logo || "" }));
  const set = (patch) => setA((p) => ({ ...p, ...patch }));
  const [busy, setBusy] = useState(false); const imgInput = React.useRef(null); const logoInput = React.useRef(null);
  const onLogo = async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; try { const url = await uploadScaled(f, 600, "ac/" + (a.projectId || "misc"), true); set({ logo: url }); } catch (err) { console.error(err); } e.target.value = ""; };
  const onUploadImg = async (e) => {
    const files = Array.from(e.target.files || []); if (!files.length) return; setBusy(true);
    try { const added = []; for (const f of files) { const url = await uploadScaled(f, 1400, "ac/" + (a.projectId || "misc")); added.push({ id: "aci" + Date.now().toString(36) + added.length, label: f.name.replace(/\.[^.]+$/, ""), src: url }); } setA((p) => ({ ...p, images: [...(p.images || []), ...added] })); }
    catch (err) { console.error(err); }
    setBusy(false); e.target.value = "";
  };
  const tierKeys = Object.keys(a.tiers).map(Number).sort((x, y) => x - y);
  const setTier = (k, v) => set({ tiers: { ...a.tiers, [k]: Number(v) || 0 } });
  const save = () => {
    if (!(a.brand || "").trim() || !(a.name || "").trim()) return;
    const payload = { brand: a.brand.trim(), brandAr: a.brandAr || "", name: a.name.trim(), nameAr: a.nameAr || "", type: a.type, summary: a.summary || "", summaryAr: a.summaryAr || "", energyClass: a.energyClass || "", warrantyYears: Number(a.warrantyYears) || 0, install: Number(a.install) || 0, logo: a.logo || "", images: a.images || [], tiers: a.tiers, fits: a.fits, addons: a.addons.filter((x) => (x.name || "").trim()).map((x, i) => ({ ...x, id: x.id || ("a" + (i + 1)), price: Number(x.price) || 0 })) };
    if (hasNegative(payload)) { window.RevnuSupport.toast(negMsg(), "err"); return; }
    window.RevnuSupport.act(() => (a.id === "new" ? D.createAC({ projectId: a.projectId, ...payload }) : D.setContentField("ac", a.id, payload)), { done: TL("AC system saved.", "تم حفظ نظام التكييف.") }).then((r) => { if (r !== undefined) onClose(); });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
          <div><div className="eyebrow">{a.id === "new" ? TL("// NEW AC SYSTEM", "// نظام تكييف جديد") : TL("// EDIT AC SYSTEM", "// تعديل نظام التكييف")}</div><div className="display-sm" style={{ marginTop: 2 }}>{(a.brand || "") + " " + (a.name || "")}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{TL("Close ×", "إغلاق ×")}</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label={TL("Brand (English)", "الماركة (إنجليزي)")}><input className="input" value={a.brand || ""} onChange={(e) => set({ brand: e.target.value })} placeholder="Daikin" /></Labeled>
            <Labeled label="الماركة (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={a.brandAr || ""} onChange={(e) => set({ brandAr: e.target.value })} placeholder="دايكن" /></Labeled>
            <Labeled label={TL("Model / range (English)", "الموديل (إنجليزي)")}><input className="input" value={a.name || ""} onChange={(e) => set({ name: e.target.value })} placeholder="Dual Inverter" /></Labeled>
            <Labeled label="الموديل (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={a.nameAr || ""} onChange={(e) => set({ nameAr: e.target.value })} /></Labeled>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Labeled label={TL("Type", "النوع")}><select className="select" value={a.type} onChange={(e) => set({ type: e.target.value })}>{D.AC_TYPES.map((t) => <option key={t.id} value={t.id}>{AR ? t.ar : t.en}</option>)}</select></Labeled>
            <Labeled label={TL("Energy class", "فئة الطاقة")}><input className="input" value={a.energyClass || ""} onChange={(e) => set({ energyClass: e.target.value })} placeholder="A++" /></Labeled>
            <Labeled label={TL("Warranty (years)", "الضمان (سنوات)")}><input className="input mono" type="number" min="0" value={a.warrantyYears || 0} onChange={(e) => set({ warrantyYears: Number(e.target.value) || 0 })} /></Labeled>
          </div>
          <Labeled label={TL("Summary (English)", "الوصف (إنجليزي)")}><input className="input" value={a.summary || ""} onChange={(e) => set({ summary: e.target.value })} /></Labeled>
          <Labeled label="الوصف (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={a.summaryAr || ""} onChange={(e) => set({ summaryAr: e.target.value })} /></Labeled>

          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{TL("BRAND LOGO & PRODUCT PHOTOS", "شعار الماركة وصور المنتج")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
              <div>
                <div className="soft" style={{ fontSize: 10.5, marginBottom: 5 }}>{TL("Brand logo · transparent PNG", "شعار الماركة · PNG شفاف")}</div>
                <div onClick={() => logoInput.current && logoInput.current.click()} title={TL("Upload logo", "رفع الشعار")} style={{ cursor: "pointer", border: "1px dashed var(--line-strong)", borderRadius: "var(--r-sm)", height: 74, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 8 }}>
                  {a.logo ? <img src={a.logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 11, color: "var(--text-soft)" }}>{TL("Click to upload", "انقر للرفع")}</span>}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 5 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => logoInput.current && logoInput.current.click()}>{a.logo ? TL("Replace", "استبدال") : TL("Upload", "رفع")}</button>
                  {a.logo && <button className="btn btn-sm btn-ghost" onClick={() => set({ logo: "" })}>✕</button>}
                  <input ref={logoInput} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" style={{ display: "none" }} onChange={onLogo} />
                </div>
              </div>
              <div>
                <div className="row-between" style={{ marginBottom: 5 }}>
                  <div className="soft" style={{ fontSize: 10.5 }}>{TL("Product photos · indoor unit, outdoor unit, controller", "صور المنتج · الوحدة الداخلية والخارجية وجهاز التحكم")}</div>
                  <button className="btn btn-sm btn-secondary" onClick={() => imgInput.current && imgInput.current.click()}>{busy ? TL("Uploading…", "جار الرفع…") : TL("+ Photos", "+ صور")}</button>
                  <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: "none" }} onChange={onUploadImg} />
                </div>
                {a.images.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {a.images.map((img, i) => (
                      <div key={img.id || i} style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "var(--bg-sunken)" }}>
                        <div style={{ aspectRatio: "4/3", background: "var(--bg-tint)" }}><img src={img.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
                        <div style={{ padding: 6 }}>
                          <input className="input" style={{ height: 26, fontSize: 11 }} value={img.label || ""} placeholder={TL("Caption", "وصف")} onChange={(e) => set({ images: a.images.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x) })} />
                          <div className="row" style={{ gap: 4, marginTop: 4 }}>
                            <button className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => { const arr = [...a.images]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; set({ images: arr }); }}>‹</button>
                            <button className="btn btn-sm btn-ghost" disabled={i === a.images.length - 1} onClick={() => { const arr = [...a.images]; [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; set({ images: arr }); }}>›</button>
                            <button className="btn btn-sm btn-ghost grow" onClick={() => set({ images: a.images.filter((_, ix) => ix !== i) })}>{TL("Remove", "حذف")}</button>
                          </div>
                        </div>
                      </div>))}
                  </div>
                ) : (
                  <div onClick={() => imgInput.current && imgInput.current.click()} style={{ cursor: "pointer", padding: 18, border: "1px dashed var(--line-strong)", borderRadius: 6, textAlign: "center", color: "var(--text-soft)", fontSize: 12 }}>{TL("No photos yet — click to upload product shots.", "لا توجد صور بعد — انقر لرفع صور المنتج.")}</div>
                )}
              </div>
            </div>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="row-between" style={{ marginBottom: 8 }}><div className="eyebrow">{TL("PRICE PER CAPACITY TIER (SAR, EX-VAT, PER INDOOR UNIT)", "السعر لكل شريحة سعة (ريال، قبل الضريبة، لكل وحدة داخلية)")}</div>
              <select className="select" style={{ height: 30, fontSize: 12, width: "auto" }} value="" onChange={(e) => { if (e.target.value) setTier(Number(e.target.value), 0); }}><option value="">{TL("+ tier…", "+ شريحة…")}</option>{[9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000].filter((k) => !(k in a.tiers)).map((k) => <option key={k} value={k}>{D.fmtSAR(k)} BTU</option>)}</select></div>
            <div className="soft" style={{ fontSize: 11, marginBottom: 8 }}>{TL("A room is priced at the smallest tier that covers its capacity. Leave 0 to skip a tier.", "تسعر الغرفة بأصغر شريحة تغطي سعتها. اترك 0 لتجاوز الشريحة.")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
              {tierKeys.map((k) => <Labeled key={k} label={D.fmtSAR(k) + " BTU"}><div className="row" style={{ gap: 4 }}><input className="input mono" type="number" step="100" min="0" value={a.tiers[k]} onChange={(e) => setTier(k, e.target.value)} /><button className="btn btn-sm btn-ghost" onClick={() => { const t = { ...a.tiers }; delete t[k]; set({ tiers: t }); }}>×</button></div></Labeled>)}
            </div>
            <div style={{ marginTop: 10, maxWidth: 220 }}><Labeled label={TL("Installation per indoor unit (SAR)", "التركيب لكل وحدة داخلية (ريال)")}><input className="input mono" type="number" step="50" min="0" value={a.install || 0} onChange={(e) => set({ install: Number(e.target.value) || 0 })} /></Labeled></div>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("FITS UNIT TYPES", "يناسب أنواع الوحدات")}</div>
            <div className="soft" style={{ fontSize: 11, marginBottom: 8 }}>{TL("Leave all unticked = fits every type. Tick to restrict (e.g. central only for penthouses).", "اترك الكل دون تحديد = يناسب كل الأنواع. حدد للتقييد (مثل المركزي للبنتهاوس فقط).")}</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{types.map((t) => { const on = a.fits.includes(t.id); return <button key={t.id} type="button" className={"btn btn-sm " + (on ? "btn-primary" : "btn-secondary")} onClick={() => set({ fits: on ? a.fits.filter((x) => x !== t.id) : [...a.fits, t.id] })}>{AR ? (t.nameAr || t.name) : t.name}</button>; })}</div>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="row-between" style={{ marginBottom: 6 }}><div className="eyebrow">{TL("OPTIONAL ITEMS", "إضافات اختيارية")}</div><button className="btn btn-sm btn-secondary" onClick={() => set({ addons: [...a.addons, { id: "a" + Date.now().toString(36).slice(-4), name: "", nameAr: "", price: 0 }] })}>{TL("+ Item", "+ إضافة")}</button></div>
            <div className="soft" style={{ fontSize: 11, marginBottom: 8 }}>{TL("Items the customer can add (smart thermostat, extended warranty…). Flat price per unit, ex-VAT.", "عناصر يمكن للعميل إضافتها (ثرموستات ذكي، ضمان ممتد…). سعر ثابت لكل وحدة، قبل الضريبة.")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {a.addons.map((x, i) => { const upd = (p) => set({ addons: a.addons.map((y, ix) => ix === i ? { ...y, ...p } : y) }); return (
                <div key={x.id || i} style={{ padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", display: "grid", gridTemplateColumns: "1fr 1fr 110px auto", gap: 8, alignItems: "center" }}>
                  <input className="input" style={{ height: 30, fontSize: 12 }} value={x.name || ""} placeholder={TL("Name (EN)", "الاسم (إنجليزي)")} onChange={(e) => upd({ name: e.target.value })} />
                  <input className="input" dir="rtl" style={{ height: 30, fontSize: 12, fontFamily: "var(--font-ar)" }} value={x.nameAr || ""} placeholder="الاسم بالعربية" onChange={(e) => upd({ nameAr: e.target.value })} />
                  <input className="input mono" type="number" step="50" min="0" style={{ height: 30, fontSize: 12 }} value={x.price || 0} onChange={(e) => upd({ price: Number(e.target.value) || 0 })} />
                  <button className="btn btn-sm btn-ghost" onClick={() => set({ addons: a.addons.filter((_, ix) => ix !== i) })}>×</button>
                </div>); })}
              {a.addons.length === 0 && <div className="soft" style={{ fontSize: 12 }}>{TL("No optional items.", "لا توجد إضافات.")}</div>}
            </div>
          </div>

          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!(a.brand || "").trim() || !(a.name || "").trim()} onClick={save}>{a.id === "new" ? TL("Create system", "إنشاء النظام") : TL("Save system", "حفظ النظام")}</button>
            <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Flooring — zones (m² + standard finish) per unit type + the finish catalogue (family · sizes · uplift per m² · zones allowed) */
function WsFlooring({ T }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [, bump] = useState(0); const refresh = () => bump((x) => x + 1);
  const [editing, setEditing] = useState(null);
  const [editZones, setEditZones] = useState(null);
  const on = !!(T.project && T.project.features && T.project.features.flooring);
  const showRate = !!(T.project && T.project.flooringShowRate);
  const types = T.unitTypes || []; const list = T.flooring || [];
  const standards = list.filter((f) => f.standard); const upgrades = list.filter((f) => !f.standard);
  const nm = (o, k) => (AR && o && o[k + "Ar"]) ? o[k + "Ar"] : (o ? (o[k] || "") : "");
  const Sw = ({ f, size }) => <span style={{ width: size || 22, height: size || 22, borderRadius: 5, flex: "none", display: "inline-block", verticalAlign: "middle", background: f && f.image ? "url(" + f.image + ") center/cover" : ((f && f.swatch) || "#DDD"), border: "1px solid rgba(0,0,0,0.12)" }} />;
  const blank = { id: "new", projectId: T.project.id, family: "tile", standard: false, name: "", nameAr: "", summary: "", summaryAr: "", swatch: "#DDD8CC", image: "", sizes: [{ id: "60x60", label: "60 × 60 cm", labelAr: "60 × 60 سم", uplift: 0 }], zones: [] };
  return (
    <>
      <WsCardHead eye="// FLOORING" title={TL("Zones & standard finish per unit type", "المناطق والتشطيب القياسي لكل نوع وحدة")}
        sub={TL("Each unit type lists its flooring zones with a nominal area and the standard finish delivered at no cost. Every upgrade prices itself as m² × the finish's uplift, so a 1-bedroom and a penthouse are priced correctly without extra rows.", "لكل نوع وحدة قائمة بمناطق الأرضيات مع مساحة اسمية والتشطيب القياسي المسلم دون تكلفة. كل ترقية تسعر تلقائيا (م² × فرق السعر)، فتسعر الغرفة الواحدة والبنتهاوس بشكل صحيح دون صفوف إضافية.")}
        action={<span className={"chip " + (on ? "" : "chip-soft")}>{on ? TL("ON in sales flow", "مفعل في مسار البيع") : TL("OFF — enable in feature toggles", "غير مفعل — فعله من المفاتيح")}</span>} />
      <DeadlinesCard T={T} highlight="flooring" onChange={refresh} />
      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", border: "1px solid " + (showRate ? "var(--brand)" : "var(--line)") }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{TL("Show the SAR/m² rate to customers on screen", "إظهار سعر المتر المربع للعميل على الشاشة")}</div>
          <div className="soft" style={{ fontSize: 11.5, marginTop: 2 }}>{TL("HQ always prices per m². When off, the sales screens show each zone's m² and amount only — the rate stays out of the conversation. Appendix F-5 in the agreement always prints zone · m² · rate · amount.", "تسعر الإدارة دائما بالمتر المربع. عند الإيقاف تعرض شاشات البيع مساحة كل منطقة والمبلغ فقط دون سعر المتر. أما الملحق F-5 في الاتفاقية فيطبع دائما المنطقة والمساحة والسعر والمبلغ.")}</div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}><span className="soft" style={{ fontSize: 11.5 }}>{showRate ? TL("Rate shown", "السعر ظاهر") : TL("Rate hidden", "السعر مخفي")}</span><FeatureSwitch on={showRate} onClick={() => { window.RevnuSupport.act(() => D.setProjectInfo(T.project.id, { flooringShowRate: !showRate })).then(refresh); }} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 22 }}>
        {types.map((t) => { const zs = D.flooringZonesFor(T.project.id, t.id); const tot = zs.reduce((a, z) => a + (Number(z.area) || 0), 0); return (
          <div key={t.id} className="card card-pad">
            <div className="row-between"><strong>{AR ? (t.nameAr || t.name) : t.name}</strong><span className="chip chip-soft">{zs.length} {TL("zones", "مناطق")} · {tot} m²</span></div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 8 }}><tbody>
              {zs.map((z, i) => { const meta = D.flooringZoneMeta(z.zone); const std = D.flooringById(z.standardId); return <tr key={i} style={{ borderTop: i ? "1px dotted var(--line)" : "none" }}><td style={{ padding: "4px 0" }}>{AR ? meta.ar : meta.en}</td><td className="mono soft" style={{ textAlign: "end", paddingInlineEnd: 10, whiteSpace: "nowrap" }}>{z.area} m²</td><td style={{ textAlign: "end", whiteSpace: "nowrap" }}>{std ? <span className="row" style={{ gap: 6, justifyContent: "flex-end", alignItems: "center" }}><Sw f={std} size={14} /><span style={{ fontSize: 11.5 }}>{nm(std, "name")}</span></span> : <span className="soft">{TL("no standard set", "بلا قياسي")}</span>}</td></tr>; })}
              {zs.length === 0 && <tr><td className="soft" style={{ padding: "4px 0" }}>{TL("No zones yet.", "لا توجد مناطق بعد.")}</td></tr>}
            </tbody></table>
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setEditZones({ type: t, zones: zs.map((z) => ({ ...z })) })}>{TL("Edit zones", "تعديل المناطق")}</button>
          </div>); })}
      </div>

      <WsCardHead eye="// FINISH CATALOGUE" title={TL("Floor & wall finishes", "تشطيبات الأرضيات والجدران")}
        sub={TL("Standard finishes are what the customer gets at no cost. Upgrade finishes carry up to three sizes, each with an uplift per m² (supply & lay, ex-VAT), and the zones they may go in — no parquet in bathrooms.", "التشطيبات القياسية هي ما يحصل عليه العميل دون تكلفة. ولكل تشطيب ترقية حتى ثلاثة مقاسات بفرق سعر للمتر المربع (توريد وتركيب، قبل الضريبة) والمناطق المسموح بها — لا باركيه في الحمامات.")}
        action={<button className="btn btn-primary" onClick={() => setEditing(blank)}>{TL("+ Add finish", "+ إضافة تشطيب")}</button>} />
      {list.length === 0 ? <div className="card card-pad soft">{TL("No finishes for this project yet — press “Add finish”.", "لا توجد تشطيبات لهذا المشروع بعد — اضغط «إضافة تشطيب».")}</div> : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        {standards.concat(upgrades).map((f) => { const fam = D.flooringFamilyById(f.family); return (
          <div key={f.id} className="card" style={{ overflow: "hidden" }}>
            <div style={{ height: 96, background: f.image ? "url(" + f.image + ") center/cover" : f.swatch }} />
            <div className="card-pad">
              <div className="row-between" style={{ alignItems: "flex-start", gap: 8 }}>
                <div><strong style={{ fontSize: 15 }}>{nm(f, "name")}</strong>
                  <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}><span className="chip chip-soft">{AR ? fam.ar : fam.en}</span>{f.standard ? <span className="chip">{TL("Standard · included", "قياسي · مضمن")}</span> : null}</div></div>
                <span className="chip chip-soft" style={{ flex: "none" }}>{(!f.zones || !f.zones.length) ? TL("All zones", "كل المناطق") : f.zones.length + TL(" zones", " مناطق")}</span>
              </div>
              {nm(f, "summary") ? <p style={{ margin: "8px 0", fontSize: 12.5, color: "var(--text-muted)" }}>{nm(f, "summary")}</p> : null}
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 6 }}>
                <thead><tr className="soft" style={{ fontSize: 10.5 }}><th style={{ textAlign: "start", paddingBottom: 4 }}>{TL("Size", "المقاس")}</th><th style={{ textAlign: "end" }}>{f.standard ? TL("Uplift", "الفرق") : TL("Uplift / m² (ex-VAT)", "الفرق / م² (قبل الضريبة)")}</th></tr></thead>
                <tbody>{(f.sizes || []).map((sz) => <tr key={sz.id} style={{ borderTop: "1px dotted var(--line)" }}><td style={{ padding: "3px 0" }}>{nm(sz, "label")}</td><td className="mono" style={{ textAlign: "end" }}>{f.standard || !sz.uplift ? TL("included", "مضمن") : "+" + D.fmtSAR(sz.uplift)}</td></tr>)}</tbody>
              </table>
              {(f.zones || []).length > 0 && <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 8 }}>{f.zones.map((z) => { const m = D.flooringZoneMeta(z); return <span key={z} className="chip chip-soft" style={{ fontSize: 10.5 }}>{AR ? m.ar : m.en}</span>; })}</div>}
              <div className="row" style={{ gap: 6, marginTop: 10 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(f)}>{TL("Edit", "تعديل")}</button>
                <DelBtn kind="flooring" id={f.id} name={f.name} after={refresh} />
              </div>
            </div>
          </div>); })}
      </div>)}
      {editing && <FlooringDrawer finish={editing} onClose={() => { setEditing(null); refresh(); }} />}
      {editZones && <FlooringZonesDrawer projectId={T.project.id} type={editZones.type} initial={editZones.zones} standards={standards} onClose={() => { setEditZones(null); refresh(); }} />}
    </>
  );
}
function FlooringZonesDrawer({ projectId, type, initial, standards, onClose }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [zs, setZs] = useState(initial);
  const upd = (i, p) => setZs(zs.map((x, ix) => ix === i ? { ...x, ...p } : x));
  const unused = D.FLOORING_ZONE_TYPES.filter((z) => !zs.some((x) => x.zone === z.id));
  const stdFor = (zoneId) => standards.filter((f) => D.flooringFits(f, zoneId));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div><div className="eyebrow">{TL("// FLOORING ZONES", "// مناطق الأرضيات")}</div><div className="display-sm" style={{ marginTop: 2 }}>{AR ? (type.nameAr || type.name) : type.name}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{TL("Close ×", "إغلاق ×")}</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="soft" style={{ fontSize: 12 }}>{TL("One row per zone from Revnu's fixed vocabulary: nominal area in m² (bathrooms = floor + walls) and the standard finish delivered at no cost. Upgrades price as m² × uplift.", "صف لكل منطقة من قائمة Revnu الثابتة: المساحة الاسمية بالمتر المربع (الحمامات = أرضية وجدران) والتشطيب القياسي المسلم دون تكلفة. تسعر الترقيات ب م² × فرق السعر.")}</div>
          {zs.map((z, i) => { const opts = stdFor(z.zone); return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 90px 1.3fr auto", gap: 8, alignItems: "center", padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
              <select className="select" style={{ height: 30, fontSize: 12 }} value={z.zone} onChange={(e) => upd(i, { zone: e.target.value })}>{D.FLOORING_ZONE_TYPES.filter((t) => t.id === z.zone || !zs.some((x) => x.zone === t.id)).map((t) => <option key={t.id} value={t.id}>{AR ? t.ar : t.en}</option>)}</select>
              <div className="row" style={{ gap: 4, alignItems: "center" }}><input className="input mono" type="number" min="0" step="1" style={{ height: 30, fontSize: 12 }} value={z.area} onChange={(e) => upd(i, { area: Number(e.target.value) || 0 })} /><span className="soft" style={{ fontSize: 11 }}>m²</span></div>
              <select className="select" style={{ height: 30, fontSize: 12 }} value={z.standardId || ""} onChange={(e) => upd(i, { standardId: e.target.value })}><option value="">{TL("Standard finish…", "التشطيب القياسي…")}</option>{opts.map((f) => <option key={f.id} value={f.id}>{AR ? (f.nameAr || f.name) : f.name}</option>)}</select>
              <button className="btn btn-sm btn-ghost" onClick={() => setZs(zs.filter((_, ix) => ix !== i))}>×</button>
            </div>); })}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm btn-secondary" disabled={!unused.length} onClick={() => setZs([...zs, { zone: unused[0].id, area: 20, standardId: (stdFor(unused[0].id)[0] || {}).id || "" }])}>{TL("+ Zone", "+ منطقة")}</button>
            <span className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
            <button className="btn btn-primary" onClick={() => { const list = zs.filter((z) => z.zone).map((z) => ({ zone: z.zone, area: Number(z.area) || 0, standardId: z.standardId || "" })); if (hasNegative(list)) { window.RevnuSupport.toast(negMsg(), "err"); return; } window.RevnuSupport.act(() => D.setFlooringZones(projectId, type.id, list), { done: TL("Flooring zones saved.", "تم حفظ مناطق الأرضيات.") }).then((r) => { if (r !== undefined) onClose(); }); }}>{TL("Save", "حفظ")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function FlooringDrawer({ finish, onClose }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [f, setF] = useState(() => ({ ...finish, sizes: (finish.sizes || []).map((x) => ({ ...x })), zones: [...(finish.zones || [])] }));
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const imgInput = React.useRef(null);
  const onImg = async (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; try { const url = await uploadScaled(file, 1200, "flooring/" + (f.projectId || "misc")); set({ image: url }); } catch (err) { console.error(err); } e.target.value = ""; };
  const updSize = (i, p) => set({ sizes: f.sizes.map((x, ix) => ix === i ? { ...x, ...p } : x) });
  const save = () => {
    if (!(f.name || "").trim()) return;
    const sizes = f.sizes.filter((x) => (x.label || x.labelAr || "").trim()).map((x, i) => ({ id: x.id || ("s" + (i + 1)), label: x.label || x.labelAr, labelAr: x.labelAr || "", uplift: f.standard ? 0 : (Number(x.uplift) || 0) }));
    const payload = { family: f.family, standard: !!f.standard, name: f.name.trim(), nameAr: f.nameAr || "", summary: f.summary || "", summaryAr: f.summaryAr || "", swatch: f.swatch || "#DDD8CC", image: f.image || "", sizes, zones: f.zones };
    if (hasNegative(payload)) { window.RevnuSupport.toast(negMsg(), "err"); return; }
    window.RevnuSupport.act(() => (f.id === "new" ? D.createFlooring({ projectId: f.projectId, ...payload }) : D.setContentField("flooring", f.id, payload)), { done: TL("Finish saved.", "تم حفظ التشطيب.") }).then((r) => { if (r !== undefined) onClose(); });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
          <div><div className="eyebrow">{f.id === "new" ? TL("// NEW FINISH", "// تشطيب جديد") : TL("// EDIT FINISH", "// تعديل التشطيب")}</div><div className="display-sm" style={{ marginTop: 2 }}>{f.name || TL("Untitled", "بلا اسم")}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{TL("Close ×", "إغلاق ×")}</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label={TL("Name (English)", "الاسم (إنجليزي)")}><input className="input" value={f.name || ""} onChange={(e) => set({ name: e.target.value })} placeholder="Carrara White marble" /></Labeled>
            <Labeled label="الاسم (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={f.nameAr || ""} onChange={(e) => set({ nameAr: e.target.value })} placeholder="رخام كرارا أبيض" /></Labeled>
            <Labeled label={TL("Material family", "نوع الخامة")}><select className="select" value={f.family} onChange={(e) => set({ family: e.target.value })}>{D.FLOORING_FAMILIES.map((x) => <option key={x.id} value={x.id}>{AR ? x.ar : x.en}</option>)}</select></Labeled>
            <Labeled label={TL("Role", "الدور")}>
              <div style={{ display: "flex", border: "1px solid var(--line-strong)", borderRadius: 7, overflow: "hidden", height: 38 }}>
                <button type="button" onClick={() => set({ standard: false })} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: "none", background: !f.standard ? "var(--brand)" : "transparent", color: !f.standard ? "var(--brand-text)" : "var(--text-muted)" }}>{TL("Upgrade", "ترقية")}</button>
                <button type="button" onClick={() => set({ standard: true })} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: "none", borderInlineStart: "1px solid var(--line-strong)", background: f.standard ? "var(--brand)" : "transparent", color: f.standard ? "var(--brand-text)" : "var(--text-muted)" }}>{TL("Standard · included", "قياسي · مضمن")}</button>
              </div>
            </Labeled>
          </div>
          <Labeled label={TL("Summary (English)", "الوصف (إنجليزي)")}><input className="input" value={f.summary || ""} onChange={(e) => set({ summary: e.target.value })} /></Labeled>
          <Labeled label="الوصف (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={f.summaryAr || ""} onChange={(e) => set({ summaryAr: e.target.value })} /></Labeled>

          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{TL("SWATCH & PHOTO", "العينة والصورة")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
              <div>
                <div className="soft" style={{ fontSize: 10.5, marginBottom: 5 }}>{TL("Fallback colour", "اللون البديل")}</div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}><input type="color" value={f.swatch || "#DDD8CC"} onChange={(e) => set({ swatch: e.target.value })} style={{ width: 44, height: 34, border: "1px solid var(--line)", borderRadius: 6, padding: 2, background: "#fff" }} /><span className="mono" style={{ fontSize: 12 }}>{f.swatch}</span></div>
              </div>
              <div>
                <div className="soft" style={{ fontSize: 10.5, marginBottom: 5 }}>{TL("Photo · close-up of the tile, slab or plank", "صورة · لقطة قريبة للبلاطة أو اللوح")}</div>
                <div onClick={() => imgInput.current && imgInput.current.click()} style={{ cursor: "pointer", border: "1px dashed var(--line-strong)", borderRadius: 6, height: 96, background: f.image ? "url(" + f.image + ") center/cover" : f.swatch, display: "flex", alignItems: "center", justifyContent: "center" }}>{!f.image && <span style={{ fontSize: 11, color: "var(--text-soft)", background: "rgba(255,255,255,0.7)", padding: "2px 8px", borderRadius: 4 }}>{TL("Click to upload", "انقر للرفع")}</span>}</div>
                <div className="row" style={{ gap: 6, marginTop: 5 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => imgInput.current && imgInput.current.click()}>{f.image ? TL("Replace", "استبدال") : TL("Upload", "رفع")}</button>
                  {f.image && <button className="btn btn-sm btn-ghost" onClick={() => set({ image: "" })}>✕</button>}
                  <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={onImg} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="row-between" style={{ marginBottom: 6 }}><div className="eyebrow">{f.standard ? TL("SIZE", "المقاس") : TL("SIZES & UPLIFT PER m² (SAR, EX-VAT, SUPPLY & LAY)", "المقاسات وفرق السعر للمتر المربع (ريال، قبل الضريبة، توريد وتركيب)")}</div><button className="btn btn-sm btn-secondary" disabled={f.sizes.length >= 3} onClick={() => set({ sizes: [...f.sizes, { id: "s" + Date.now().toString(36).slice(-4), label: "", labelAr: "", uplift: 0 }] })}>{TL("+ Size", "+ مقاس")}</button></div>
            <div className="soft" style={{ fontSize: 11, marginBottom: 8 }}>{f.standard ? TL("Standard finishes are included — no uplift.", "التشطيبات القياسية مضمنة — بلا فرق سعر.") : TL("Up to three sizes. The uplift is the difference the customer pays over the standard finish, per m² of the zones chosen.", "حتى ثلاثة مقاسات. فرق السعر هو ما يدفعه العميل فوق التشطيب القياسي لكل متر مربع من المناطق المختارة.")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {f.sizes.map((x, i) => (
                <div key={x.id || i} style={{ padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", display: "grid", gridTemplateColumns: f.standard ? "1fr 1fr auto" : "1fr 1fr 110px auto", gap: 8, alignItems: "center" }}>
                  <input className="input" style={{ height: 30, fontSize: 12 }} value={x.label || ""} placeholder={TL("Size (EN) · 120 × 60 cm", "المقاس (إنجليزي)")} onChange={(e) => updSize(i, { label: e.target.value })} />
                  <input className="input" dir="rtl" style={{ height: 30, fontSize: 12, fontFamily: "var(--font-ar)" }} value={x.labelAr || ""} placeholder="المقاس بالعربية" onChange={(e) => updSize(i, { labelAr: e.target.value })} />
                  {!f.standard && <div className="row" style={{ gap: 4, alignItems: "center" }}><input className="input mono" type="number" step="5" min="0" style={{ height: 30, fontSize: 12 }} value={x.uplift || 0} onChange={(e) => updSize(i, { uplift: Number(e.target.value) || 0 })} /><span className="soft" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>/m²</span></div>}
                  <button className="btn btn-sm btn-ghost" onClick={() => set({ sizes: f.sizes.filter((_, ix) => ix !== i) })}>×</button>
                </div>))}
              {f.sizes.length === 0 && <div className="soft" style={{ fontSize: 12 }}>{TL("Add at least one size.", "أضف مقاسا واحدا على الأقل.")}</div>}
            </div>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("ZONES ALLOWED", "المناطق المسموح بها")}</div>
            <div className="soft" style={{ fontSize: 11, marginBottom: 8 }}>{TL("Leave all unticked = any zone. Tick to restrict (e.g. no parquet in bathrooms).", "اترك الكل دون تحديد = كل المناطق. حدد للتقييد (مثل: لا باركيه في الحمامات).")}</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{D.FLOORING_ZONE_TYPES.map((z) => { const on = f.zones.includes(z.id); return <button key={z.id} type="button" className={"btn btn-sm " + (on ? "btn-primary" : "btn-secondary")} onClick={() => set({ zones: on ? f.zones.filter((x) => x !== z.id) : [...f.zones, z.id] })}>{AR ? z.ar : z.en}</button>; })}</div>
          </div>

          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!(f.name || "").trim() || !f.sizes.length} onClick={save}>{f.id === "new" ? TL("Create finish", "إنشاء التشطيب") : TL("Save finish", "حفظ التشطيب")}</button>
            <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Customisation windows — one date per feature; the sales step shows a live countdown and locks after it. Printed in the agreement. */
function DeadlinesCard({ T, highlight, onChange }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const p = T.project; const [, bump] = useState(0);
  const rows = [{ key: "layout", field: "layoutDeadline", en: "Layout changes", ar: "تعديلات المخطط" }, { key: "flooring", field: "flooringDeadline", en: "Flooring changes", ar: "تعديلات الأرضيات" }];
  const set = (field, v) => { window.RevnuSupport.act(() => D.setProjectInfo(p.id, { [field]: v || null })).then(() => { bump((x) => x + 1); if (onChange) onChange(); }); };
  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div className="row-between" style={{ marginBottom: 8, gap: 10, flexWrap: "wrap" }}><div className="eyebrow">{TL("// CUSTOMISATION DEADLINES", "// مواعيد إغلاق التعديلات")}</div><span className="soft" style={{ fontSize: 11.5 }}>{TL("Sales screens show a live countdown and lock the step after the date. The date is printed in the agreement.", "تعرض شاشات البيع عدا تنازليا وتقفل الخطوة بعد التاريخ. يطبع التاريخ في الاتفاقية.")}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        {rows.map((r) => { const ms = D.deadlineLeftMs(p, r.key); const open = ms == null || ms > 0; const days = ms == null ? null : Math.floor(Math.abs(ms) / 86400000); return (
          <div key={r.key} style={{ padding: "10px 12px", background: r.key === highlight ? "var(--brand-soft)" : "var(--bg-sunken)", borderRadius: "var(--r-sm)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 120 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{AR ? r.ar : r.en}</div><div style={{ fontSize: 11, color: ms != null && !open ? "#B23B3B" : "var(--text-soft)" }}>{ms == null ? TL("No deadline — always open", "بلا موعد — مفتوح دائما") : open ? TL(days + " days left", "متبق " + days + " يوما") : TL("Closed " + days + " days ago", "أغلق منذ " + days + " يوما")}</div></div>
            <input className="input mono" type="date" style={{ height: 32, fontSize: 12, width: 160 }} value={p[r.field] || ""} onChange={(e) => set(r.field, e.target.value)} />
            {p[r.field] ? <button className="btn btn-sm btn-ghost" onClick={() => set(r.field, "")}>×</button> : null}
          </div>); })}
      </div>
    </div>
  );
}
/* Layout changes — auto-price rates, deadlines, and the pre-approved wall/door options per unit type (grouped by area) */
function WsLayout({ T }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [, bump] = useState(0); const refresh = () => bump((x) => x + 1);
  const [editing, setEditing] = useState(null);
  const p = T.project; const on = !!(p && p.features && p.features.layout); const types = T.unitTypes || [];
  const rates = D.layoutRatesFor(p);
  // typed rates show at once and are saved once the typing stops
  const rateTimer = React.useRef(null);
  const setRate = (k, v) => { const n = Number(v) || 0; if (n < 0) return; p.layoutRates = { ...rates, [k]: n }; refresh(); clearTimeout(rateTimer.current); rateTimer.current = setTimeout(() => { window.RevnuSupport.act(() => D.setProjectInfo(p.id, { layoutRates: { ...D.layoutRatesFor(p) } })); }, 700); };
  const nm = (o, k) => (AR && o && o[k + "Ar"]) ? o[k + "Ar"] : (o ? (o[k] || "") : "");
  const blank = (typeId) => ({ id: "new", projectId: p.id, typeId, area: "", areaName: "", areaNameAr: "", asDesigned: "", asDesignedAr: "", name: "", nameAr: "", kind: "add", wallM: 3, doors: 1, flatPrice: null, roomsAfter: "", roomsAfterAr: "", summary: "", summaryAr: "", works: [], worksAr: [], before: "", after: "" });
  const Thumb = ({ src }) => <span style={{ width: 44, height: 33, borderRadius: 4, flex: "none", display: "inline-block", background: src ? "url(" + src + ") center/cover" : "repeating-linear-gradient(45deg, var(--bg-sunken) 0 6px, var(--bg-tint) 6px 12px)", border: "1px solid var(--line)" }} />;
  return (
    <>
      <WsCardHead eye="// LAYOUT CHANGES" title={TL("Pre-approved layout options per unit type", "خيارات المخطط المعتمدة لكل نوع وحدة")}
        sub={TL("Each option switches one area of the plan between “as designed” and an alternative — close the kitchen, separate the majlis, merge a bedroom into a family living. Options in the same area are mutually exclusive; “as designed” is always free. Non-load-bearing partitions and doors only.", "كل خيار يبدل منطقة واحدة من المخطط بين «كما في التصميم» وبديل — إغلاق المطبخ، فصل المجلس، دمج غرفة نوم مع صالة عائلية. الخيارات في المنطقة نفسها متنافية، و«كما في التصميم» مجاني دائما. جدران غير حاملة وأبواب فقط.")}
        action={<span className={"chip " + (on ? "" : "chip-soft")}>{on ? TL("ON in sales flow", "مفعل في مسار البيع") : TL("OFF — enable in feature toggles", "غير مفعل — فعله من المفاتيح")}</span>} />
      <DeadlinesCard T={T} highlight="layout" onChange={refresh} />
      <div className="card card-pad" style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("// AUTO-PRICE RATES (SAR, EX-VAT)", "// أسعار التسعير التلقائي (ريال، قبل الضريبة)")}</div>
        <div className="soft" style={{ fontSize: 12, marginBottom: 10 }}>{TL("Every option prices itself as wall metres × rate + doors × door price, unless a flat price is set on the option. Prices never go below zero — removals are free at most, never a credit.", "يسعر كل خيار تلقائيا: أمتار الجدار × السعر + الأبواب × سعر الباب، ما لم يحدد سعر ثابت للخيار. لا تقل الأسعار عن الصفر — الإزالة مجانية على الأكثر ولا تحتسب كرصيد.")}</div>
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <Labeled label={TL("Wall · per linear metre (supply, plaster, paint, MEP)", "الجدار · للمتر الطولي (توريد ولياسة ودهان وكهرباء)")}><input className="input mono" type="number" step="50" min="0" style={{ width: 160 }} value={rates.wallPerM} onChange={(e) => setRate("wallPerM", e.target.value)} /></Labeled>
          <Labeled label={TL("Door · each (leaf, frame, ironmongery)", "الباب · للوحدة (الضلفة والإطار والإكسسوارات)")}><input className="input mono" type="number" step="50" min="0" style={{ width: 160 }} value={rates.doorPrice} onChange={(e) => setRate("doorPrice", e.target.value)} /></Labeled>
        </div>
      </div>
      {types.map((t) => { const areas = D.layoutAreas(p.id, t.id); return (
        <div key={t.id} className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="row-between"><strong>{AR ? (t.nameAr || t.name) : t.name}</strong><button className="btn btn-sm btn-secondary" onClick={() => setEditing(blank(t.id))}>{TL("+ Option", "+ خيار")}</button></div>
          {areas.length === 0 ? <div className="soft" style={{ fontSize: 12, marginTop: 6 }}>{TL("No layout options for this type yet.", "لا توجد خيارات مخطط لهذا النوع بعد.")}</div> : areas.map((area) => (
            <div key={area.key} style={{ marginTop: 12 }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>// {AR ? area.nameAr : area.name} <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.8 }}>· {TL("as designed: ", "كما في التصميم: ")}{AR ? area.asDesignedAr : area.asDesigned}</span></div>
              {area.options.map((o) => { const price = D.layoutPrice(o, p); return (
                <div key={o.id} className="row-between" style={{ padding: "8px 0", borderTop: "1px dotted var(--line)", gap: 10, flexWrap: "wrap" }}>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <Thumb src={o.before} /><span className="soft">→</span><Thumb src={o.after} />
                    <div><div style={{ fontWeight: 600, fontSize: 13 }}>{nm(o, "name")}</div><div className="soft" style={{ fontSize: 11.5 }}>{o.kind === "remove" ? TL("Wall removed", "إزالة جدار") : TL("Wall added", "إضافة جدار")}{o.wallM ? " · " + o.wallM + " m" : ""}{o.doors ? " · " + o.doors + TL(" door(s)", " باب") : ""}{nm(o, "roomsAfter") ? " · → " + nm(o, "roomsAfter") : ""}</div></div>
                  </div>
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{price ? D.fmtSAR(price) : TL("no charge", "بدون تكلفة")}</span><span className="chip chip-soft" style={{ fontSize: 10.5 }}>{o.flatPrice != null && o.flatPrice !== "" ? TL("flat", "ثابت") : TL("auto", "تلقائي")}</span>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(o)}>{TL("Edit", "تعديل")}</button>
                    <DelBtn kind="layout" id={o.id} name={o.name} after={refresh} />
                  </div>
                </div>); })}
            </div>))}
        </div>); })}
      {editing && <LayoutDrawer opt={editing} project={p} types={types} onClose={() => { setEditing(null); refresh(); }} />}
    </>
  );
}
function LayoutDrawer({ opt, project, types, onClose }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [o, setO] = useState(() => ({ ...opt, works: [...(opt.works || [])], worksAr: [...(opt.worksAr || [])], flat: opt.flatPrice != null && opt.flatPrice !== "" }));
  const set = (patch) => setO((x) => ({ ...x, ...patch }));
  const beforeIn = React.useRef(null); const afterIn = React.useRef(null);
  const onImg = (key) => async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; try { const url = await uploadScaled(f, 1200, "layout/" + (o.projectId || "misc")); set({ [key]: url }); } catch (err) { console.error(err); } e.target.value = ""; };
  const existing = D.layoutAreas(project.id, o.typeId);
  const slug = (t) => (t || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "-").replace(/^-|-$/g, "") || ("area-" + Date.now().toString(36).slice(-4));
  const auto = Math.max(0, Math.round((Number(o.wallM) || 0) * D.layoutRatesFor(project).wallPerM + (Number(o.doors) || 0) * D.layoutRatesFor(project).doorPrice));
  const save = () => {
    if (!(o.name || "").trim() || !(o.areaName || "").trim()) return;
    const payload = { typeId: o.typeId, area: o.area || slug(o.areaName), areaName: o.areaName.trim(), areaNameAr: o.areaNameAr || "", asDesigned: o.asDesigned || "As designed", asDesignedAr: o.asDesignedAr || "", name: o.name.trim(), nameAr: o.nameAr || "", kind: o.kind, wallM: Number(o.wallM) || 0, doors: Number(o.doors) || 0, flatPrice: o.flat ? Math.max(0, Number(o.flatPrice) || 0) : null, roomsAfter: o.roomsAfter || "", roomsAfterAr: o.roomsAfterAr || "", summary: o.summary || "", summaryAr: o.summaryAr || "", works: o.works.filter((w) => w.trim()), worksAr: o.worksAr.filter((w) => w.trim()), before: o.before || "", after: o.after || "" };
    if (hasNegative(payload)) { window.RevnuSupport.toast(negMsg(), "err"); return; }
    window.RevnuSupport.act(() => (o.id === "new" ? D.createLayoutOption({ projectId: o.projectId, ...payload }) : D.setContentField("layout", o.id, payload)), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ خيار المخطط." : "Layout option saved." }).then((r) => { if (r !== undefined) onClose(); });
  };
  const ImgPick = ({ label, k, inputRef }) => (
    <div>
      <div className="soft" style={{ fontSize: 10.5, marginBottom: 5 }}>{label}</div>
      <div onClick={() => inputRef.current && inputRef.current.click()} style={{ cursor: "pointer", border: "1px dashed var(--line-strong)", borderRadius: 6, aspectRatio: "4/3", background: o[k] ? "url(" + o[k] + ") center/cover" : "var(--bg-sunken)", display: "flex", alignItems: "center", justifyContent: "center" }}>{!o[k] && <span style={{ fontSize: 11, color: "var(--text-soft)" }}>{TL("Click to upload plan crop", "انقر لرفع قصاصة المخطط")}</span>}</div>
      <div className="row" style={{ gap: 6, marginTop: 5 }}><button className="btn btn-sm btn-secondary" onClick={() => inputRef.current && inputRef.current.click()}>{o[k] ? TL("Replace", "استبدال") : TL("Upload", "رفع")}</button>{o[k] && <button className="btn btn-sm btn-ghost" onClick={() => set({ [k]: "" })}>✕</button>}<input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={onImg(k)} /></div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 600, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
          <div><div className="eyebrow">{o.id === "new" ? TL("// NEW LAYOUT OPTION", "// خيار مخطط جديد") : TL("// EDIT LAYOUT OPTION", "// تعديل خيار المخطط")}</div><div className="display-sm" style={{ marginTop: 2 }}>{o.name || TL("Untitled", "بلا اسم")}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{TL("Close ×", "إغلاق ×")}</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label={TL("Unit type", "نوع الوحدة")}><select className="select" value={o.typeId} onChange={(e) => set({ typeId: e.target.value })}>{types.map((t) => <option key={t.id} value={t.id}>{AR ? (t.nameAr || t.name) : t.name}</option>)}</select></Labeled>
            <Labeled label={TL("Area of the plan", "منطقة المخطط")}><select className="select" value={existing.some((a) => a.key === o.area) ? o.area : "__new"} onChange={(e) => { const a = existing.find((x) => x.key === e.target.value); if (a) set({ area: a.key, areaName: a.name, areaNameAr: a.nameAr, asDesigned: a.asDesigned, asDesignedAr: a.asDesignedAr }); else set({ area: "" }); }}><option value="__new">{TL("New area…", "منطقة جديدة…")}</option>{existing.map((a) => <option key={a.key} value={a.key}>{AR ? a.nameAr : a.name}</option>)}</select></Labeled>
            <Labeled label={TL("Area name (EN)", "اسم المنطقة (إنجليزي)")}><input className="input" value={o.areaName || ""} onChange={(e) => set({ areaName: e.target.value })} placeholder="Kitchen" /></Labeled>
            <Labeled label="اسم المنطقة (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={o.areaNameAr || ""} onChange={(e) => set({ areaNameAr: e.target.value })} placeholder="المطبخ" /></Labeled>
            <Labeled label={TL("As designed (EN)", "كما في التصميم (إنجليزي)")}><input className="input" value={o.asDesigned || ""} onChange={(e) => set({ asDesigned: e.target.value })} placeholder="Open kitchen" /></Labeled>
            <Labeled label="كما في التصميم (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={o.asDesignedAr || ""} onChange={(e) => set({ asDesignedAr: e.target.value })} placeholder="مطبخ مفتوح" /></Labeled>
            <Labeled label={TL("Option name (EN)", "اسم الخيار (إنجليزي)")}><input className="input" value={o.name || ""} onChange={(e) => set({ name: e.target.value })} placeholder="Closed kitchen · wall + door" /></Labeled>
            <Labeled label="اسم الخيار (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={o.nameAr || ""} onChange={(e) => set({ nameAr: e.target.value })} placeholder="مطبخ مغلق · جدار وباب" /></Labeled>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Labeled label={TL("Change", "نوع التعديل")}><select className="select" value={o.kind} onChange={(e) => set({ kind: e.target.value })}><option value="add">{TL("Add a wall", "إضافة جدار")}</option><option value="remove">{TL("Remove a wall", "إزالة جدار")}</option></select></Labeled>
            <Labeled label={TL("Wall length (m)", "طول الجدار (م)")}><input className="input mono" type="number" step="0.1" min="0" value={o.wallM} onChange={(e) => set({ wallM: e.target.value })} /></Labeled>
            <Labeled label={TL("Doors", "الأبواب")}><input className="input mono" type="number" step="1" min="0" value={o.doors} onChange={(e) => set({ doors: e.target.value })} /></Labeled>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="row-between" style={{ marginBottom: 8 }}><div className="eyebrow">{TL("PRICE (SAR, EX-VAT)", "السعر (ريال، قبل الضريبة)")}</div>
              <div style={{ display: "flex", border: "1px solid var(--line-strong)", borderRadius: 7, overflow: "hidden", height: 32 }}>
                <button type="button" onClick={() => set({ flat: false })} style={{ padding: "0 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: "none", background: !o.flat ? "var(--brand)" : "transparent", color: !o.flat ? "var(--brand-text)" : "var(--text-muted)" }}>{TL("Auto", "تلقائي")}</button>
                <button type="button" onClick={() => set({ flat: true, flatPrice: o.flatPrice != null && o.flatPrice !== "" ? o.flatPrice : auto })} style={{ padding: "0 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: "none", borderInlineStart: "1px solid var(--line-strong)", background: o.flat ? "var(--brand)" : "transparent", color: o.flat ? "var(--brand-text)" : "var(--text-muted)" }}>{TL("Flat", "ثابت")}</button>
              </div></div>
            {o.flat ? <div className="row" style={{ gap: 10, alignItems: "center" }}><input className="input mono" type="number" step="50" min="0" style={{ width: 160 }} value={o.flatPrice == null ? "" : o.flatPrice} onChange={(e) => set({ flatPrice: e.target.value })} /><span className="soft" style={{ fontSize: 12 }}>{TL("0 = no charge. Auto would be ", "0 = بدون تكلفة. التلقائي يساوي ") + D.fmtSAR(auto)}</span></div>
                    : <div style={{ fontSize: 13 }}><span className="mono" style={{ fontWeight: 700 }}>{D.fmtSAR(auto)}</span> <span className="soft" style={{ fontSize: 12 }}>= {o.wallM || 0} m × {D.fmtSAR(D.layoutRatesFor(project).wallPerM)} + {o.doors || 0} × {D.fmtSAR(D.layoutRatesFor(project).doorPrice)}</span></div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label={TL("Rooms after the change (EN) · optional", "الغرف بعد التعديل (إنجليزي) · اختياري")}><input className="input" value={o.roomsAfter || ""} onChange={(e) => set({ roomsAfter: e.target.value })} placeholder="2 bedrooms + family living" /></Labeled>
            <Labeled label="الغرف بعد التعديل (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={o.roomsAfterAr || ""} onChange={(e) => set({ roomsAfterAr: e.target.value })} /></Labeled>
            <Labeled label={TL("Summary (EN)", "الوصف (إنجليزي)")}><input className="input" value={o.summary || ""} onChange={(e) => set({ summary: e.target.value })} /></Labeled>
            <Labeled label="الوصف (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={o.summaryAr || ""} onChange={(e) => set({ summaryAr: e.target.value })} /></Labeled>
            <Labeled label={TL("Works included · one per line (EN)", "الأعمال المشمولة · سطر لكل بند (إنجليزي)")}><textarea className="input" rows={4} value={o.works.join("\n")} onChange={(e) => set({ works: e.target.value.split("\n") })} /></Labeled>
            <Labeled label="الأعمال المشمولة · سطر لكل بند (عربي)"><textarea className="input" dir="rtl" rows={4} style={{ fontFamily: "var(--font-ar)" }} value={o.worksAr.join("\n")} onChange={(e) => set({ worksAr: e.target.value.split("\n") })} /></Labeled>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{TL("PLAN CROPS · BEFORE / AFTER", "قصاصات المخطط · قبل / بعد")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><ImgPick label={TL("Before · as designed", "قبل · كما في التصميم")} k="before" inputRef={beforeIn} /><ImgPick label={TL("After · with this option", "بعد · مع هذا الخيار")} k="after" inputRef={afterIn} /></div>
          </div>
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!(o.name || "").trim() || !(o.areaName || "").trim()} onClick={save}>{o.id === "new" ? TL("Create option", "إنشاء الخيار") : TL("Save option", "حفظ الخيار")}</button>
            <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WsSmart({ T }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding]   = useState(false);
  return (
    <>
      <WsCardHead eye="// SMART HOME" title="Smart-home tiers" sub={window.I18N && window.I18N.isAR ? "طبقات اختيارية. كل فئة بسعر ثابت يضاف إلى باقة التأثيث." : "Optional layers. Each tier is a fixed-price kit added on top of the furnishing package."}
        action={<button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add tier</button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {T.smart.map((s) => (
          <div key={s.id} className="card card-pad">
            {s.images && s.images.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 10, borderRadius: 6, overflow: "hidden" }}>
                {s.images.slice(0, 3).map((img, i) => (
                  <div key={i} style={{ flex: 1, aspectRatio: "4/3", overflow: "hidden", background: "var(--bg-sunken)" }}>
                    <img src={img.src} alt={img.label || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ))}
              </div>
            )}
            <div className="row-between"><strong>{s.name}</strong>
              <span className="chip">{s.price === 0 ? "Included" : "+" + D.fmtSAR(s.price) + " SAR"}</span>
            </div>
            <ul style={{ margin: "8px 0 0", paddingInlineStart: 18, color: "var(--text-muted)", fontSize: 12.5 }}>
              {((window.I18N && window.I18N.isAR && s.includesAr && s.includesAr.length) ? s.includesAr : s.includes).map((it, i) => <li key={i} style={{ marginBottom: 2 }}>{it}</li>)}
            </ul>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(s)}>Edit</button>
              <DelBtn kind="smart" id={s.id} name={s.name} />
            </div>
          </div>
        ))}
        {T.smart.length === 0 && <div className="card card-pad muted">No smart-home tiers configured for this project.</div>}
      </div>
      {editing && <SmartDrawer tier={editing} onClose={() => setEditing(null)} />}
      {adding  && <SmartDrawer projectId={T.project && T.project.id} tier={{ id: "new", name: "", price: 12000, includes: [], images: [] }} onClose={() => setAdding(false)} />}
    </>
  );
}

function SmartDrawer({ tier, onClose, projectId }) {
  const [t, setT] = useState({ ...tier, includes: [...tier.includes], includesAr: [...(tier.includesAr || [])], images: [...(tier.images || [])] });
  const set = (patch) => setT((p) => ({ ...p, ...patch }));
  const [line, setLine] = useState("");
  const imgInput = React.useRef(null);
  const [busy, setBusy] = useState(false);
  const AR = window.I18N && window.I18N.isAR;
  const nameOk = (t.name || "").trim() || (t.nameAr || "").trim();
  const priceOk = (Number(t.price) || 0) >= 0;
  const tierValid = nameOk && priceOk;
  const onUploadImg = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    setBusy(true);
    try { const url = await uploadScaled(f, 1400, "smart/" + (t.projectId || projectId || "misc")); set({ images: [...t.images, { id: "si" + Date.now().toString(36).slice(-5), label: "", src: url }] }); }
    catch (err) { window.RevnuSupport.fail(err); }
    setBusy(false); e.target.value = "";
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 460, background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div><div className="eyebrow">{TT("// EDIT TIER")}</div><div className="display-sm" style={{ marginTop: 2 }}>{t.name || "New tier"}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <Labeled label="Tier name (English)"><input className="input" value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="Essential / Full Smart / Off" /></Labeled>
          <Labeled label="اسم الباقة (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={t.nameAr || ""} onChange={(e) => set({ nameAr: e.target.value })} placeholder="الأساسية / ذكي كامل / بدون" /></Labeled>
          <Labeled label="Set price (SAR)">
            <div className="row" style={{ gap: 6 }}>
              <span className="muted">+</span>
              <input className="input mono" type="number" step="500" min="0" value={t.price || 0} onChange={(e) => set({ price: Number(e.target.value) || 0 })} />
              <span className="muted">SAR</span>
            </div>
          </Labeled>
          {!nameOk && <div className="soft" style={{ fontSize: 11, color: "var(--negative, #b91c1c)", marginTop: -6 }}>{AR ? "الاسم مطلوب (إنجليزي أو عربي)." : "A name is required (English or Arabic)."}</div>}
          {!priceOk && <div className="soft" style={{ fontSize: 11, color: "var(--negative, #b91c1c)", marginTop: -6 }}>{AR ? "لا يمكن أن يكون السعر سالبًا." : "Price can't be negative."}</div>}
          <Labeled label={AR ? "الوصف (إنجليزي)" : "Summary (English)"}><input className="input" value={t.summary || ""} onChange={(e) => set({ summary: e.target.value })} placeholder="One line shown under the tier name" /></Labeled>
          <Labeled label="الوصف (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={t.summaryAr || ""} onChange={(e) => set({ summaryAr: e.target.value })} placeholder="سطر واحد يظهر تحت اسم الباقة" /></Labeled>
          <Labeled label={AR ? "المحتويات (إنجليزي · عربي)" : "Includes (English · Arabic)"}>
            <ul style={{ padding: 0, margin: "0 0 8px", listStyle: "none" }}>
              {t.includes.map((it, i) => (
                <li key={i} className="row-between" style={{ padding: "6px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", marginBottom: 6, fontSize: 12.5, gap: 8 }}>
                  <span style={{ flex: 1 }}>{it}</span>
                  <input className="input" dir="rtl" style={{ flex: 1, height: 26, fontSize: 12, fontFamily: "var(--font-ar)" }} value={t.includesAr[i] || ""} placeholder="الترجمة العربية" onChange={(e) => { const a = [...t.includesAr]; a[i] = e.target.value; set({ includesAr: a }); }} />
                  <button className="btn btn-sm btn-ghost" onClick={() => set({ includes: t.includes.filter((_, ix) => ix !== i), includesAr: t.includesAr.filter((_, ix) => ix !== i) })}>×</button>
                </li>
              ))}
            </ul>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" value={line} onChange={(e) => setLine(e.target.value)} placeholder="e.g. Smart thermostat" />
              <button className="btn btn-secondary" onClick={() => { if (line.trim()) { set({ includes: [...t.includes, line.trim()] }); setLine(""); } }}>Add</button>
            </div>
          </Labeled>
          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div className="eyebrow">{AR ? "صور المنزل الذكي" : "SMART-HOME PICTURES"}</div>
              <button className="btn btn-sm btn-secondary" onClick={() => imgInput.current && imgInput.current.click()}>{busy ? (AR ? "جار الرفع…" : "Uploading…") : (AR ? "+ رفع صورة" : "+ Upload image")}</button>
              <input ref={imgInput} type="file" accept="image/*" style={{ display: "none" }} onChange={onUploadImg} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-soft)", marginBottom: 10 }}>{AR ? "صور للأجهزة والتركيبات — يراها العميل في مرحلة المبيعات. النسبة المثلى 16:10." : "Pictures of the devices & install — the customer sees these in the sales flow. Best ratio 16:10."}</div>
            {t.images.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {t.images.map((img, i) => (
                  <div key={img.id} style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "var(--bg-sunken)" }}>
                    <div style={{ aspectRatio: "16/10", background: "var(--bg-tint)" }}>
                      <img src={img.src} alt={img.label || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    <div style={{ padding: 6 }}>
                      <input className="input" style={{ height: 26, fontSize: 11 }} value={img.label || ""} placeholder={AR ? "وصف (اختياري)" : "Caption (optional)"} onChange={(e) => set({ images: t.images.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x) })} />
                      <button className="btn btn-sm btn-ghost" style={{ marginTop: 4, width: "100%" }} onClick={() => set({ images: t.images.filter((_, ix) => ix !== i) })}>{AR ? "حذف" : "Remove"}</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div onClick={() => imgInput.current && imgInput.current.click()} style={{ cursor: "pointer", padding: 24, border: "1px dashed var(--line-strong)", borderRadius: 6, textAlign: "center", color: "var(--text-soft)", fontSize: 12 }}>
                {AR ? "لا توجد صور بعد — انقر لرفع صور المنزل الذكي." : "No pictures yet — click to upload smart-home images."}
              </div>
            )}
          </div>
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!tierValid} onClick={() => { const fields = { name: t.name, nameAr: t.nameAr, price: Number(t.price) || 0, summary: t.summary || "", summaryAr: t.summaryAr || "", includes: t.includes, includesAr: t.includesAr || [], images: t.images }; window.RevnuSupport.act(() => t.id === "new" ? D.createContent("smart", Object.assign({ id: newId(projectId, "smart"), projectId, level: (D.SMART_HOME.filter((x) => x.projectId === projectId).length + 1) }, fields)) : D.setContentField("smart", t.id, fields), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ الفئة." : "Tier saved." }).then((r) => { if (r !== undefined) onClose(); }); }}>{window.I18N?window.I18N.t("Save tier"):"Save tier"}</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WsOps({ T }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding]   = useState(false);
  return (
    <>
      <WsCardHead eye={window.I18N && window.I18N.isAR ? "// التشغيل" : "// OPERATIONS"} title={window.I18N && window.I18N.isAR ? "نماذج التشغيل" : "Operating models"} sub={window.I18N && window.I18N.isAR ? "يومي / شهري / إيجار طويل. لكل نموذج رسوم تشغيل ونطاق إشغال وأسعار افتراضية لكل نوع وحدة." : "Daily / Monthly / Long-lease. Each carries an operator fee, occupancy band, and default rates per unit type."}
        action={<button className="btn btn-primary" onClick={() => setAdding(true)}>{window.I18N && window.I18N.isAR ? "+ إضافة نموذج" : "+ Add model"}</button>} />
      <div className="stack-md">
        {T.ops.map((o) => (
          <div key={o.id} className="card card-pad-lg">
            <div className="row-between">
              <div>
                <div className="row" style={{ gap: 10 }}>
                  <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 18 }}>{o.name}</h3>
                  <span className="chip">{o.kind === "daily" ? "Nightly" : "Monthly+"}</span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{o.summary}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="chip-mono chip">Fee {o.mgmtFee}%</span>
                <span className="chip-mono chip">Occ {o.occLow}–{o.occHigh}%</span>
                <button className="btn btn-sm btn-secondary" onClick={() => setEditing(o)}>Edit</button>
                <DelBtn kind="ops" id={o.id} name={o.name} />
              </div>
            </div>
            <hr className="hr-thin" style={{ margin: "12px 0" }} />
            <div className="eyebrow" style={{ marginBottom: 8 }}>{TT("DEFAULT RATE · PER UNIT TYPE")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              {Object.entries(o.defaultRate).map(([typeId, rate]) => {
                const t = D.unitTypeById(typeId);
                return (
                  <div key={typeId} style={{ padding: 10, background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
                    <div className="soft" style={{ fontSize: 10.5, fontWeight: 600 }}>{t?.name || typeId}</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{D.fmtSAR(rate)}<span className="soft" style={{ fontSize: 10, marginLeft: 4 }}>{o.kind === "daily" ? "SAR/nt" : "SAR/mo"}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {editing && <OpsDrawer model={editing} unitTypes={T.unitTypes} onClose={() => setEditing(null)} />}
      {adding  && <OpsDrawer projectId={T.project && T.project.id} model={{ id: "new", name: "", kind: "daily", mgmtFee: 22, occLow: 60, occHigh: 80, summary: "", defaultRate: {} }} unitTypes={T.unitTypes} onClose={() => setAdding(false)} />}
    </>
  );
}

function OpsDrawer({ model, unitTypes, onClose, projectId }) {
  const [o, setO] = useState({ ...model, defaultRate: { ...model.defaultRate }, assume: JSON.parse(JSON.stringify(model.assume || {})) });
  const set = (patch) => setO((p) => ({ ...p, ...patch }));
  const setRate = (typeId, val) => setO((p) => ({ ...p, defaultRate: { ...p.defaultRate, [typeId]: Number(val) } }));
  const setAssume = (typeId, patch) => setO((p) => ({ ...p, assume: { ...p.assume, [typeId]: { ...(p.assume[typeId] || {}), ...patch } } }));
  const midOcc = Math.round((o.occLow + o.occHigh) / 2);
  const defaultRisk = o.kind === "daily" ? "high" : /long/i.test(o.name) ? "low" : "medium";
  const nameOk = (o.name || "").trim() || (o.nameAr || "").trim();
  const ratesOk = (Number(o.mgmtFee) || 0) >= 0 && Object.values(o.defaultRate || {}).every((v) => (Number(v) || 0) >= 0);
  const modelValid = nameOk && ratesOk;
  const save = () => {
    const assume = {};
    unitTypes.forEach((t) => { const a = o.assume[t.id]; if (a) assume[t.id] = { occ: a.occ != null ? Number(a.occ) : midOcc, risk: a.risk || defaultRisk }; });
    const fields = { name: o.name, nameAr: o.nameAr, summary: o.summary, summaryAr: o.summaryAr, kind: o.kind, mgmtFee: Number(o.mgmtFee) || 0, occLow: Number(o.occLow) || 0, occHigh: Number(o.occHigh) || 0, defaultRate: o.defaultRate || {}, assume: Object.assign({}, o.assume || {}, assume) };
    window.RevnuSupport.act(() => o.id === "new" ? D.createContent("ops", Object.assign({ id: newId(projectId, "ops"), projectId }, fields)) : D.setContentField("ops", o.id, fields), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ نموذج التشغيل." : "Operating model saved." }).then((r) => { if (r !== undefined) onClose(); });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div><div className="eyebrow">{TT("// EDIT OPERATING MODEL")}</div><div className="display-sm" style={{ marginTop: 2 }}>{o.name || "New model"}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <Labeled label="Name (English)"><input className="input" value={o.name} onChange={(e) => set({ name: e.target.value })} placeholder="Daily / Monthly Rental / Long Lease" /></Labeled>
          <Labeled label="الاسم (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={o.nameAr || ""} onChange={(e) => set({ nameAr: e.target.value })} placeholder="يومي / إيجار شهري / إيجار طويل" /></Labeled>
          {!nameOk && <div className="soft" style={{ fontSize: 11, color: "var(--negative, #b91c1c)" }}>{window.I18N && window.I18N.isAR ? "الاسم مطلوب (إنجليزي أو عربي)." : "A name is required (English or Arabic)."}</div>}
          <Labeled label="الوصف (عربي)"><textarea className="textarea" rows={2} dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={o.summaryAr || ""} onChange={(e) => set({ summaryAr: e.target.value })} placeholder="وصف نموذج التشغيل بالعربية" /></Labeled>
          <Labeled label="Kind">
            <div className="tabs">
              <button className={"tab " + (o.kind === "daily" ? "active" : "")} onClick={() => set({ kind: "daily" })}>Daily / Nightly</button>
              <button className={"tab " + (o.kind === "monthly" ? "active" : "")} onClick={() => set({ kind: "monthly" })}>Monthly+</button>
            </div>
          </Labeled>
          <Labeled label="Summary"><textarea className="textarea" rows={2} value={o.summary} onChange={(e) => set({ summary: e.target.value })} /></Labeled>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Labeled label="Operator fee %">
              <div className="row" style={{ gap: 6 }}><input className="input mono" type="number" step="0.5" min="0" value={o.mgmtFee} onChange={(e) => set({ mgmtFee: Number(e.target.value) })} /><span className="muted">%</span></div>
            </Labeled>
            <Labeled label="Occupancy low %">
              <div className="row" style={{ gap: 6 }}><input className="input mono" type="number" value={o.occLow} onChange={(e) => set({ occLow: Number(e.target.value) })} /><span className="muted">%</span></div>
            </Labeled>
            <Labeled label="Occupancy high %">
              <div className="row" style={{ gap: 6 }}><input className="input mono" type="number" value={o.occHigh} onChange={(e) => set({ occHigh: Number(e.target.value) })} /><span className="muted">%</span></div>
            </Labeled>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{TT("OUR ASSUMPTION · PER UNIT TYPE")}</div>
            <div className="soft" style={{ fontSize: 11.5, marginBottom: 10, lineHeight: 1.5 }}>
              Occupancy and risk rating per type — these are the figures that print in the buyer's agreement. The default rate above and the occupancy here drive the projected return.
            </div>
            <div className="stack-sm">
              {unitTypes.map((t) => {
                const a = o.assume[t.id] || {};
                const risk = a.risk || defaultRisk;
                return (
                  <div key={t.id} style={{ padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
                    <div className="row-between" style={{ marginBottom: 8 }}>
                      <strong style={{ fontSize: 13 }}>{t.name}</strong>
                      <span className="mono soft" style={{ fontSize: 11 }}>{D.fmtSAR(o.defaultRate[t.id] || 0)} {o.kind === "daily" ? (window.I18N && window.I18N.isAR ? "ريال/ليلة" : "SAR/nt") : (window.I18N && window.I18N.isAR ? "ريال/شهر" : "SAR/mo")}</span>
                    </div>
                    <div className="row" style={{ gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                      <label className="row" style={{ gap: 6, alignItems: "center", fontSize: 12 }}>
                        Occupancy
                        <input className="input mono" type="number" min="0" max="100" value={a.occ != null ? a.occ : midOcc}
                               onChange={(e) => setAssume(t.id, { occ: Number(e.target.value) })} style={{ width: 64, height: 30, textAlign: "right" }} />
                        <span className="soft">%</span>
                      </label>
                      <div className="row" style={{ gap: 5, alignItems: "center" }}>
                        {["low", "medium", "high"].map((rk) => {
                          const meta = D.RISK_META[rk];
                          const on = risk === rk;
                          return (
                            <button key={rk} onClick={() => setAssume(t.id, { risk: rk })}
                              style={{ cursor: "pointer", fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 10px",
                                       border: "1px solid " + (on ? meta.color : "var(--line-strong)"),
                                       background: on ? meta.soft : "transparent", color: on ? meta.color : "var(--text-muted)" }}>
                              {meta.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <hr className="hr-thin" />
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{TT("DEFAULT RATE · PER UNIT TYPE")}</div>
            <div className="stack-sm">
              {unitTypes.map((t) => (
                <div key={t.id} className="row-between" style={{ padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
                  <div style={{ fontSize: 13 }}>{t.name}</div>
                  <div className="row" style={{ gap: 6 }}>
                    <input className="input mono" style={{ width: 110, height: 30 }} type="number" min="0" value={o.defaultRate[t.id] || 0} onChange={(e) => setRate(t.id, e.target.value)} />
                    <span className="muted" style={{ fontSize: 11 }}>{o.kind === "daily" ? (window.I18N && window.I18N.isAR ? "ريال/ليلة" : "SAR/nt") : (window.I18N && window.I18N.isAR ? "ريال/شهر" : "SAR/mo")}</span>
                  </div>
                </div>
              ))}
            </div>
            {!ratesOk && <div className="soft" style={{ fontSize: 11, color: "var(--negative, #b91c1c)", marginTop: 8 }}>{window.I18N && window.I18N.isAR ? "لا يمكن أن تكون الرسوم أو الأسعار سالبة." : "Fees and rates can't be negative."}</div>}
          </div>
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!modelValid} onClick={save}>{window.I18N?window.I18N.t("Save model"):"Save model"}</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WsContracts({ dv, T }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [scope, setScopeRaw] = useState("dev");            // "dev" = this developer · "master" = Revnu master
  const [draft, setDraft] = useState(null);                 // working copy — null means no unsaved edits
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [fields, setFields] = useState(false);
  const [, bump] = useState(0);
  const refresh = () => bump((x) => x + 1);
  const setScope = (v) => { setScopeRaw(v); setDraft(null); setShowHist(false); };
  const devId = scope === "dev" ? dv.id : null;
  const custom = D.agreementHasCustom(dv.id);
  const stored = scope === "dev" ? D.agreementLayoutFor(dv.id) : D.agreementMaster();
  const layout = draft || stored;
  const dirty = !!draft;
  const editable = scope === "master" || custom;
  const update = (fn) => { const d = JSON.parse(JSON.stringify(layout)); fn(d); setDraft(d); };
  const move = (i, dir) => update((d) => { const j = i + dir; if (j < 0 || j >= d.blocks.length) return; const t = d.blocks[i]; d.blocks[i] = d.blocks[j]; d.blocks[j] = t; });
  const toggle = (i) => update((d) => { d.blocks[i].enabled = d.blocks[i].enabled === false; });
  const setWhen = (i, w) => update((d) => { d.blocks[i].showWhen = w; });
  const remove = (i) => update((d) => { d.blocks.splice(i, 1); });
  const insertBeforeExecution = (d, items) => { const ex = d.blocks.findIndex((x) => x.kind === "data" && x.ref === "execution"); const at = ex >= 0 ? ex : d.blocks.length; d.blocks.splice(at, 0, ...items); };
  const saveClause = (b) => { const nb = { ...b }; const isNew = !!nb._new; delete nb._new; update((d) => { if (isNew) insertBeforeExecution(d, [nb]); else { const i = d.blocks.findIndex((x) => x.id === nb.id); if (i >= 0) d.blocks[i] = nb; else insertBeforeExecution(d, [nb]); } }); setEditing(null); };
  const issues = D.lintAgreementLayout(layout, dv);
  const hasErrors = issues.some((i) => i.level === "error");
  const save = () => { if (!draft) return; if (hasErrors && !confirm(TL("There are unresolved checks. Save anyway?", "هناك فحوصات غير محلولة. حفظ على أي حال؟"))) return; window.RevnuSupport.act(() => D.saveAgreementLayout(draft), { done: TL("Agreement saved as a new version.", "تم حفظ الاتفاقية كنسخة جديدة.") }).then((r) => { if (r !== undefined) { setDraft(null); refresh(); } }); };
  const customise = () => { window.RevnuSupport.act(() => D.cloneAgreementForDeveloper(dv.id)).then((r) => { if (r !== undefined) { setDraft(null); refresh(); } }); };
  const reset = () => { if (confirm(TL("Remove " + dv.name + "'s custom agreement and go back to the Revnu master?", "إزالة اتفاقية " + dv.name + " المخصصة والعودة إلى نموذج Revnu الرئيسي؟"))) { window.RevnuSupport.act(() => D.resetAgreementForDeveloper(dv.id)).then(() => { setDraft(null); refresh(); }); } };
  const missingData = D.AGREEMENT_DATA_BLOCKS.filter((db) => !layout.blocks.some((b) => b.kind === "data" && b.ref === db.id));
  const addData = (ref) => update((d) => { const def = D.AGREEMENT_DATA_BLOCKS.find((x) => x.id === ref) || {}; const blk = { id: ref, kind: "data", ref, enabled: true, showWhen: def.showWhen || "always" }; if (ref === "execution") d.blocks.push(blk); else insertBeforeExecution(d, [blk]); });
  const whenLabel = (w) => { const x = D.AGREEMENT_SHOW_WHEN.find((s) => s.id === (w || "always")); return x ? (AR ? x.ar : x.en) : w; };
  const dataLabel = (ref) => { const x = D.AGREEMENT_DATA_BLOCKS.find((s) => s.id === ref); return x ? (AR ? x.ar : x.en) : ref; };
  const clauseTitle = (b) => (AR ? (b.titleAr || b.title) : (b.title || b.titleAr)) || TL("Untitled clause", "بند بلا عنوان");
  const sectionOf = (b) => (AR ? (b.sectionAr || b.section) : (b.section || b.sectionAr)) || "";
  const hist = D.agreementHistory(devId);
  const newClause = () => ({ id: "cl-" + Date.now().toString(36), kind: "clause", _new: true, enabled: true, showWhen: "always", section: "General Terms & Conditions", sectionAr: "الأحكام والشروط العامة", title: "", titleAr: "", body: "", bodyAr: "" });
  const nClauses = layout.blocks.filter((b) => b.kind === "clause").length;
  return (
    <>
      <WsCardHead eye="// AGREEMENT" title={TL("Agreement template", "نموذج الاتفاقية")}
        sub={TL("The legal wording lives in clause blocks you edit here — no code. Unit tables, schedules and totals are system blocks that always read the live deal. Switch a feature off and its blocks disappear on their own.", "الصياغة القانونية في بنود تحررها هنا — بدون برمجة. جداول الوحدات والملاحق والمجاميع بنود نظامية تقرأ الصفقة الحية دائما. عند إيقاف أي ميزة تختفي بنودها تلقائيا.")}
        action={<div className="row" style={{ gap: 8 }}>
          <div style={{ display: "inline-flex", border: "1px solid var(--line-strong)", borderRadius: 7, overflow: "hidden" }}>
            {[["dev", AR ? (dv.nameAr || dv.name) : dv.name], ["master", TL("Revnu master", "نموذج Revnu")]].map(([id, lbl], i) => (
              <button key={id} type="button" onClick={() => setScope(id)} style={{ padding: "6px 12px", border: "none", borderInlineStart: i ? "1px solid var(--line-strong)" : "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, background: scope === id ? "var(--brand)" : "transparent", color: scope === id ? "var(--brand-text)" : "var(--text-muted)" }}>{lbl}</button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={() => setPreview(true)}>{TL("Preview", "معاينة")}</button>
        </div>} />

      <div className="card card-pad" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          {scope === "dev" && !custom ? (
            <>
              <strong>{TL("Using the Revnu master agreement", "يستخدم نموذج Revnu الرئيسي")}</strong> <span className="chip chip-soft mono">v{layout.version}</span>
              <div className="soft" style={{ fontSize: 12, marginTop: 3 }}>{TL("Customise to give " + dv.name + " its own wording. System blocks stay identical to Revnu's.", "خصص النموذج لتمنح " + dv.name + " صياغته الخاصة. تبقى البنود النظامية مطابقة لنموذج Revnu.")}</div>
            </>
          ) : (
            <>
              <strong>{(AR ? (layout.nameAr || layout.name) : layout.name) || (scope === "master" ? TL("Revnu master agreement", "نموذج Revnu الرئيسي") : dv.name)}</strong>{" "}
              <span className="chip mono">v{layout.version}{dirty ? " · " + TL("unsaved", "غير محفوظ") : ""}</span>
              <div className="soft" style={{ fontSize: 12, marginTop: 3 }}>
                {TL("Updated ", "آخر تحديث ") + D.fmtDate(layout.updated)} · {layout.blocks.length} {TL("blocks", "بند")} · {nClauses} {TL("clauses", "بند نصي")}
                {layout.basedOn ? " · " + TL("based on master v" + layout.basedOn, "مبني على النموذج الرئيسي v" + layout.basedOn) : ""}
                {scope === "master" ? " · " + TL("applies to every developer without a custom agreement", "يسري على كل مطور بلا اتفاقية مخصصة") : ""}
              </div>
            </>
          )}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {scope === "dev" && !custom && <button className="btn btn-primary" onClick={customise}>{TL("Customise for " + dv.name, "تخصيص ل " + dv.name)}</button>}
          {editable && (
            <>
              <button className="btn btn-sm btn-secondary" onClick={() => setEditing(newClause())}>{TL("+ Clause", "+ بند")}</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setImporting(true)}>{TL("Import text / Word", "استيراد نص / Word")}</button>
              {missingData.length > 0 && (
                <select className="input" style={{ height: 30, fontSize: 12, width: "auto" }} value="" onChange={(e) => { if (e.target.value) addData(e.target.value); }}>
                  <option value="">{TL("+ System block…", "+ بند نظامي…")}</option>
                  {missingData.map((x) => <option key={x.id} value={x.id}>{AR ? x.ar : x.en}</option>)}
                </select>
              )}
              {scope === "dev" && <button className="btn btn-sm btn-ghost" onClick={() => setFields(true)}>{TL("Developer fields", "حقول المطور")}{(dv.customFields || []).length ? " (" + dv.customFields.length + ")" : ""}</button>}
              {hist.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setShowHist((v) => !v)}>{TL("History", "السجل")} ({hist.length})</button>}
              {scope === "dev" && custom && <button className="btn btn-sm btn-ghost" onClick={reset}>{TL("Reset to master", "العودة للنموذج الرئيسي")}</button>}
            </>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 12, borderColor: hasErrors ? "var(--negative, #c0492f)" : "var(--amber, #E8A74E)" }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("// CHECKS", "// الفحوصات")}</div>
          {issues.map((i, k) => <div key={k} style={{ fontSize: 12.5, padding: "3px 0", color: i.level === "error" ? "var(--negative, #c0492f)" : "var(--text)" }}>{i.level === "error" ? "✕ " : "⚠ "}{AR ? i.ar : i.en}</div>)}
        </div>
      )}
      {showHist && hist.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("// VERSION HISTORY", "// سجل النسخ")}</div>
          {hist.map((h, i) => (
            <div key={i} className="row-between" style={{ padding: "5px 0", borderTop: i ? "1px dotted var(--line)" : "none", fontSize: 12.5 }}>
              <span><span className="mono">v{h.version}</span> · {D.fmtDate(h.updated)} · {h.blocks.length} {TL("blocks", "بند")}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => { window.RevnuSupport.act(() => D.restoreAgreementVersion(devId, i)).then((r) => { if (r !== undefined) { setDraft(null); refresh(); } }); }}>{TL("Restore", "استعادة")}</button>
            </div>
          ))}
          <div className="soft" style={{ fontSize: 11, marginTop: 6 }}>{TL("Issued orders keep the version they were signed with — restoring never rewrites a signed agreement.", "تحتفظ الطلبات الصادرة بالنسخة التي وقعت بها — الاستعادة لا تعيد كتابة أي اتفاقية موقعة.")}</div>
        </div>
      )}

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr><th style={{ width: 76 }}></th><th style={{ width: 92 }}>{TL("Type", "النوع")}</th><th>{TL("Block", "البند")}</th><th style={{ width: 240 }}>{TL("Show when", "يظهر عند")}</th><th className="right" style={{ width: 190 }}></th></tr></thead>
          <tbody>
            {layout.blocks.map((b, i) => {
              const off = b.enabled === false;
              const isData = b.kind === "data";
              return (
                <tr key={b.id || i} style={{ opacity: off ? 0.5 : 1 }}>
                  <td>{editable && <div className="row" style={{ gap: 2 }}><button className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => move(i, -1)} title="Up">↑</button><button className="btn btn-sm btn-ghost" disabled={i === layout.blocks.length - 1} onClick={() => move(i, 1)} title="Down">↓</button></div>}</td>
                  <td><span className={"chip " + (isData ? "" : "chip-soft")}>{isData ? TL("System", "نظامي") : TL("Clause", "بند")}</span></td>
                  <td>
                    <strong style={{ textDecoration: off ? "line-through" : "none" }}>{isData ? dataLabel(b.ref) : clauseTitle(b)}</strong>
                    {!isData && <div className="soft" style={{ fontSize: 11.5, marginTop: 2, maxWidth: 560, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sectionOf(b) ? "§ " + sectionOf(b) + " · " : ""}{((AR ? (b.bodyAr || b.body) : (b.body || b.bodyAr)) || "").slice(0, 140)}</div>}
                    {isData && <div className="soft" style={{ fontSize: 11.5, marginTop: 2 }}>{TL("Generated from the deal — reads units, choices and prices live.", "يولد من الصفقة — يقرأ الوحدات والاختيارات والأسعار مباشرة.")}</div>}
                  </td>
                  <td>{editable ? <select className="input" style={{ height: 30, fontSize: 12 }} value={b.showWhen || "always"} onChange={(e) => setWhen(i, e.target.value)}>{D.AGREEMENT_SHOW_WHEN.map((w) => <option key={w.id} value={w.id}>{AR ? w.ar : w.en}</option>)}</select> : <span className="soft" style={{ fontSize: 12 }}>{whenLabel(b.showWhen)}</span>}</td>
                  <td className="right">{editable && (
                    <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(i)}>{off ? TL("Enable", "تفعيل") : TL("Disable", "إيقاف")}</button>
                      {!isData && <button className="btn btn-sm btn-secondary" onClick={() => setEditing({ ...b })}>{TL("Edit", "تعديل")}</button>}
                      {(!isData || b.ref !== "execution") && <button className="btn btn-sm btn-ghost" onClick={() => remove(i)} title={TL("Remove", "إزالة")}>×</button>}
                    </div>
                  )}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dirty && (
        <div style={{ position: "sticky", bottom: 12, marginTop: 12, display: "flex", gap: 8, alignItems: "center", background: "var(--bg-card)", padding: 12, borderRadius: "var(--r-md)", border: "1px solid var(--line)", boxShadow: "var(--shadow-md)" }}>
          <span className="soft" style={{ fontSize: 12, flex: 1 }}>{TL("Saving creates v" + (layout.version + 1) + ". New orders use it immediately; issued orders keep the version they were signed with.", "الحفظ ينشئ النسخة v" + (layout.version + 1) + ". تستخدمها الطلبات الجديدة فورا؛ وتحتفظ الطلبات الصادرة بنسختها.")}</span>
          <button className="btn btn-ghost" onClick={() => setDraft(null)}>{TL("Discard", "تجاهل")}</button>
          <button className="btn btn-primary" onClick={save}>{TL("Save version", "حفظ نسخة")}</button>
        </div>
      )}

      {editing && <ClauseDrawer clause={editing} layout={layout} dev={dv} onSave={saveClause} onClose={() => setEditing(null)} />}
      {importing && <ClauseImportDrawer onAdd={(list) => { update((d) => insertBeforeExecution(d, list)); setImporting(false); }} onClose={() => setImporting(false)} />}
      {fields && <DevFieldsDrawer dev={dv} onClose={() => { setFields(false); refresh(); }} />}
      {preview && <AgreementPreview layout={layout} dev={dv} project={T.project} onClose={() => setPreview(false)} />}
    </>
  );
}

/* Clause editor — EN/AR title + body, section, visibility rule, variable chips. */
function ClauseDrawer({ clause, layout, dev, onSave, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [c, setC] = useState({ ...clause });
  const set = (p) => setC((x) => ({ ...x, ...p }));
  const enRef = React.useRef(null), arRef = React.useRef(null);
  const sections = []; layout.blocks.forEach((b) => { if (b.kind === "clause" && b.section && !sections.some((s) => s.section === b.section)) sections.push({ section: b.section, sectionAr: b.sectionAr || "" }); });
  const vars = D.CONTRACT_VARS.concat(((dev && dev.customFields) || []).filter((f) => f.key).map((f) => ({ code: "dev." + f.key, en: f.label || f.key, ar: f.labelAr || f.label || f.key })));
  const insertVar = (field, ref, code) => {
    const v = vars.find((x) => x.code === code);
    const token = v && v.block ? "{{#" + code + "}} … {{/" + code + "}}" : "{{" + code + "}}";
    const el = ref.current; const cur = c[field] || "";
    if (el && typeof el.selectionStart === "number") { const s = el.selectionStart, e = el.selectionEnd; set({ [field]: cur.slice(0, s) + token + cur.slice(e) }); setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length; }, 0); }
    else set({ [field]: cur + token });
  };
  const VarChips = ({ field, refEl }) => (
    <div className="row" style={{ gap: 5, flexWrap: "wrap", margin: "6px 0 4px" }}>
      {vars.map((v) => <button key={v.code} type="button" onClick={() => insertVar(field, refEl, v.code)} title={"{{" + v.code + "}}"} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--line-strong)", background: v.block ? "var(--bg-sunken)" : "var(--bg-tint)", cursor: "pointer", fontFamily: AR ? "var(--font-ar)" : "inherit" }}>{AR ? v.ar : v.en}</button>)}
    </div>
  );
  const valid = ((c.title || c.titleAr || "").trim()) && (((c.body || "").trim()) || ((c.bodyAr || "").trim()));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.4)", zIndex: 300, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 760, maxWidth: "100%", height: "100%", background: "var(--bg-card)", borderInlineStart: "1px solid var(--line)", overflowY: "auto", padding: 26 }}>
        <div className="row-between" style={{ marginBottom: 18 }}>
          <div><div className="eyebrow">{c._new ? TL("// NEW CLAUSE", "// بند جديد") : TL("// EDIT CLAUSE", "// تعديل البند")}</div><h2 style={{ fontSize: 19, fontWeight: 600, margin: "2px 0 0" }}>{(AR ? (c.titleAr || c.title) : (c.title || c.titleAr)) || TL("Untitled clause", "بند بلا عنوان")}</h2></div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>
        <BiField label={TL("Clause title", "عنوان البند")} en={c.title || ""} ar={c.titleAr || ""} onEn={(v) => set({ title: v })} onAr={(v) => set({ titleAr: v })} placeholder="Warranties" placeholderAr="الضمانات" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("Section (EN)", "القسم (إنجليزي)")}</div>
            <input className="input" list="agr-sections" value={c.section || ""} onChange={(e) => { const hit = sections.find((s) => s.section === e.target.value); set(hit ? { section: hit.section, sectionAr: hit.sectionAr || c.sectionAr } : { section: e.target.value }); }} placeholder="General Terms & Conditions" />
            <datalist id="agr-sections">{sections.map((s) => <option key={s.section} value={s.section} />)}</datalist>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("Section (AR)", "القسم (عربي)")}</div>
            <input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={c.sectionAr || ""} onChange={(e) => set({ sectionAr: e.target.value })} placeholder="الأحكام والشروط العامة" />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("Show when", "يظهر عند")}</div>
            <select className="input" value={c.showWhen || "always"} onChange={(e) => set({ showWhen: e.target.value })}>{D.AGREEMENT_SHOW_WHEN.map((w) => <option key={w.id} value={w.id}>{AR ? w.ar : w.en}</option>)}</select>
          </div>
        </div>
        <div className="soft" style={{ fontSize: 11.5, marginBottom: 10 }}>{TL("Consecutive clauses with the same section print under one § heading and are numbered automatically. Grey chips are conditional wrappers: text inside prints only when that choice exists.", "البنود المتتالية بنفس القسم تطبع تحت عنوان § واحد وترقم تلقائيا. الأزرار الرمادية أغلفة شرطية: النص داخلها يطبع فقط عند وجود ذلك الاختيار.")}</div>
        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{TL("English text", "النص الإنجليزي")}</div>
          <VarChips field="body" refEl={enRef} />
          <textarea ref={enRef} className="input" dir="ltr" value={c.body || ""} onChange={(e) => set({ body: e.target.value })} style={{ minHeight: 170, fontSize: 12.5, lineHeight: 1.6 }} placeholder="Type the clause… blank line = new paragraph." />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{TL("Arabic text", "النص العربي")}</div>
          <VarChips field="bodyAr" refEl={arRef} />
          <textarea ref={arRef} className="input" dir="rtl" value={c.bodyAr || ""} onChange={(e) => set({ bodyAr: e.target.value })} style={{ minHeight: 170, fontFamily: "var(--font-ar)", fontSize: 13.5, lineHeight: 1.7 }} placeholder="اكتب نص البند… سطر فارغ = فقرة جديدة." />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary grow" disabled={!valid} onClick={() => onSave(c)}>{c._new ? TL("Add clause", "إضافة البند") : TL("Apply", "تطبيق")}</button>
          <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
        </div>
        <div className="soft" style={{ fontSize: 11, marginTop: 8 }}>{TL("Applies to the working copy — press “Save version” on the list to publish.", "يطبق على النسخة الجارية — اضغط «حفظ نسخة» في القائمة للنشر.")}</div>
      </div>
    </div>
  );
}

/* Paste (or upload) a developer's contract; headings become clauses, EN and AR paired by position. */
function ClauseImportDrawer({ onAdd, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [en, setEn] = useState(""); const [ar, setAr] = useState("");
  const [section, setSection] = useState("General Terms & Conditions"); const [sectionAr, setSectionAr] = useState("الأحكام والشروط العامة");
  const [skip, setSkip] = useState({});
  const enFile = React.useRef(null), arFile = React.useRef(null);
  const load = (setter) => (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return; e.target.value = "";
    if ((f.name || "").toLowerCase().endsWith(".docx")) docxToText(f).then(setter).catch(() => alert(TL("Could not read the .docx — paste the text instead.", "تعذر قراءة ملف .docx — الصق النص بدلا من ذلك.")));
    else { const fr = new FileReader(); fr.onload = () => setter(String(fr.result)); fr.readAsText(f); }
  };
  const enC = D.splitClausesFromText(en), arC = D.splitClausesFromText(ar);
  const n = Math.max(enC.length, arC.length);
  const stamp = Date.now().toString(36);
  const list = Array.from({ length: n }, (_, i) => ({ id: "cl-" + stamp + "-" + i, kind: "clause", enabled: true, showWhen: "always", section, sectionAr, title: (enC[i] || {}).title || "", titleAr: (arC[i] || {}).title || "", body: (enC[i] || {}).body || "", bodyAr: (arC[i] || {}).body || "" }));
  const kept = list.filter((_, i) => !skip[i]);
  const Col = ({ label, val, setVal, fileRef, dir }) => (
    <div>
      <div className="row-between" style={{ marginBottom: 4 }}><div className="eyebrow">{label}</div><button className="btn btn-sm btn-ghost" onClick={() => fileRef.current && fileRef.current.click()}>{TL("Upload .docx / .txt", "رفع .docx / .txt")}</button><input ref={fileRef} type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: "none" }} onChange={load(setVal)} /></div>
      <textarea className="input" dir={dir} value={val} onChange={(e) => setVal(e.target.value)} style={{ minHeight: 220, fontSize: 12.5, lineHeight: 1.6, fontFamily: dir === "rtl" ? "var(--font-ar)" : "inherit" }} placeholder={dir === "rtl" ? "الصق النص العربي هنا (اختياري)…" : "Paste the contract text here…\n\n1. DEFINITIONS\n…\n2. PAYMENT\n…"} />
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.4)", zIndex: 300, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 920, maxWidth: "100%", height: "100%", background: "var(--bg-card)", borderInlineStart: "1px solid var(--line)", overflowY: "auto", padding: 26 }}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <div><div className="eyebrow">{TL("// IMPORT", "// استيراد")}</div><h2 style={{ fontSize: 19, fontWeight: 600, margin: "2px 0 0" }}>{TL("Bring in the developer's contract", "استيراد عقد المطور")}</h2></div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="soft" style={{ fontSize: 12.5, marginBottom: 12 }}>{TL("Paste the lawyer's text. Numbered lines, ALL-CAPS lines or lines ending with “:” become clause titles; the text under each becomes its body. Arabic is paired with English by position. You can edit every clause afterwards.", "الصق نص المحامي. الأسطر المرقمة أو الكبيرة أو المنتهية ب«:» تصبح عناوين بنود، والنص تحتها يصبح متنها. يقرن العربي بالإنجليزي حسب الترتيب. يمكنك تعديل كل بند لاحقا.")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Col label={TL("English", "الإنجليزي")} val={en} setVal={setEn} fileRef={enFile} dir="ltr" />
          <Col label={TL("Arabic (optional)", "العربي (اختياري)")} val={ar} setVal={setAr} fileRef={arFile} dir="rtl" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "14px 0" }}>
          <div><div className="eyebrow" style={{ marginBottom: 6 }}>{TL("Put under section (EN)", "ضمن القسم (إنجليزي)")}</div><input className="input" value={section} onChange={(e) => setSection(e.target.value)} /></div>
          <div><div className="eyebrow" style={{ marginBottom: 6 }}>{TL("Section (AR)", "القسم (عربي)")}</div><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={sectionAr} onChange={(e) => setSectionAr(e.target.value)} /></div>
        </div>
        {n > 0 && (
          <div className="card card-flush" style={{ marginBottom: 14 }}>
            <table className="tbl">
              <thead><tr><th style={{ width: 36 }}></th><th style={{ width: 36 }}>#</th><th>{TL("Clause (EN)", "البند (إنجليزي)")}</th><th>{TL("Clause (AR)", "البند (عربي)")}</th></tr></thead>
              <tbody>{list.map((b, i) => (
                <tr key={b.id} style={{ opacity: skip[i] ? 0.45 : 1 }}>
                  <td><input type="checkbox" checked={!skip[i]} onChange={() => setSkip({ ...skip, [i]: !skip[i] })} /></td>
                  <td className="mono">{i + 1}</td>
                  <td><strong>{b.title || <span className="soft">{TL("(no title)", "(بلا عنوان)")}</span>}</strong><div className="soft" style={{ fontSize: 11.5, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.body.slice(0, 110) || "—"}</div></td>
                  <td dir="rtl" style={{ fontFamily: "var(--font-ar)" }}><strong>{b.titleAr || <span className="soft">—</span>}</strong><div className="soft" style={{ fontSize: 11.5, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.bodyAr.slice(0, 90) || "—"}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary grow" disabled={!kept.length} onClick={() => onAdd(kept)}>{TL("Add " + kept.length + " clause" + (kept.length === 1 ? "" : "s"), "إضافة " + kept.length + " بند")}</button>
          <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
        </div>
      </div>
    </div>
  );
}

/* Developer-specific values usable in any clause as {{dev.key}} (court, bank, licence no., …). */
function DevFieldsDrawer({ dev, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [rows, setRows] = useState(((dev && dev.customFields) || []).map((f) => ({ ...f })));
  const upd = (i, p) => setRows(rows.map((r, ix) => ix === i ? { ...r, ...p } : r));
  const keyOf = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  const save = () => { window.RevnuSupport.act(() => D.patchDeveloper(dev.id, { customFields: rows.map((r) => ({ ...r, key: keyOf(r.key || r.label) })).filter((r) => r.key) }), { done: TL("Developer fields saved.", "تم حفظ حقول المطور.") }).then((r) => { if (r !== undefined) onClose(); }); };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.4)", zIndex: 300, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "100%", height: "100%", background: "var(--bg-card)", borderInlineStart: "1px solid var(--line)", overflowY: "auto", padding: 26 }}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <div><div className="eyebrow">{TL("// DEVELOPER FIELDS", "// حقول المطور")}</div><h2 style={{ fontSize: 19, fontWeight: 600, margin: "2px 0 0" }}>{AR ? (dev.nameAr || dev.name) : dev.name}</h2></div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="soft" style={{ fontSize: 12.5, marginBottom: 12 }}>{TL("Values that differ per developer and appear in their wording — jurisdiction, bank, licence number, notice address. Use them in any clause as {{dev.key}}. Legal name, CR, VAT and signatory are already available as standard variables.", "قيم تختلف بين المطورين وتظهر في صياغتهم — الاختصاص القضائي، البنك، رقم الترخيص، عنوان الإشعارات. استخدمها في أي بند بصيغة {{dev.key}}. الاسم القانوني والسجل والرقم الضريبي والمفوض متاحة كمتغيرات قياسية.")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", display: "grid", gridTemplateColumns: "130px 1fr 1fr 1fr auto", gap: 8, alignItems: "center" }}>
              <input className="input mono" style={{ height: 30, fontSize: 12 }} value={r.key || ""} placeholder="court" onChange={(e) => upd(i, { key: keyOf(e.target.value) })} />
              <input className="input" style={{ height: 30, fontSize: 12 }} value={r.label || ""} placeholder={TL("Label (e.g. Competent court)", "التسمية")} onChange={(e) => upd(i, { label: e.target.value })} />
              <input className="input" style={{ height: 30, fontSize: 12 }} value={r.value || ""} placeholder={TL("Value (EN)", "القيمة (إنجليزي)")} onChange={(e) => upd(i, { value: e.target.value })} />
              <input className="input" dir="rtl" style={{ height: 30, fontSize: 12, fontFamily: "var(--font-ar)" }} value={r.valueAr || ""} placeholder="القيمة (عربي)" onChange={(e) => upd(i, { valueAr: e.target.value })} />
              <button className="btn btn-sm btn-ghost" onClick={() => setRows(rows.filter((_, ix) => ix !== i))}>×</button>
            </div>
          ))}
          {rows.length === 0 && <div className="soft" style={{ fontSize: 12 }}>{TL("No fields yet.", "لا توجد حقول بعد.")}</div>}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setRows([...rows, { key: "", label: "", value: "", valueAr: "" }])}>{TL("+ Field", "+ حقل")}</button>
          <span className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
          <button className="btn btn-primary" onClick={save}>{TL("Save fields", "حفظ الحقول")}</button>
        </div>
      </div>
    </div>
  );
}

/* Full-document preview of a layout against a real order (or a synthetic sample deal). */
function AgreementPreview({ layout, dev, project, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [lang, setLang] = useState(AR ? "ar" : "en");
  const real = D.ORDERS.find((o) => o.projectId === project.id && o.developerId === dev.id && o.status !== "cancelled");
  const order = real || D.sampleOrderFor(project.id);
  const ctx = order && window.agreementCtxFromOrder ? window.agreementCtxFromOrder(order, lang) : null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.5)", zIndex: 310, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 24, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 1000, maxWidth: "100%", background: "var(--bg-card)", borderRadius: 12, overflow: "hidden" }}>
        <div className="row-between" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
          <div>
            <div className="eyebrow">{TL("// PREVIEW · ", "// معاينة · ") + ((AR ? (layout.nameAr || layout.name) : layout.name) || "") + " v" + layout.version}</div>
            <strong>{real ? TL("Real order ", "طلب فعلي ") + real.id : TL("Sample deal — first available unit, default choices", "صفقة نموذجية — أول وحدة متاحة مع الاختيارات الافتراضية")}</strong>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ display: "inline-flex", border: "1px solid var(--line-strong)", borderRadius: 7, overflow: "hidden" }}>
              <button type="button" onClick={() => setLang("en")} style={{ padding: "5px 11px", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, background: lang === "en" ? "var(--brand)" : "transparent", color: lang === "en" ? "var(--brand-text)" : "var(--text-muted)" }}>EN</button>
              <button type="button" onClick={() => setLang("ar")} style={{ padding: "5px 11px", border: "none", borderInlineStart: "1px solid var(--line-strong)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-ar)", background: lang === "ar" ? "var(--brand)" : "transparent", color: lang === "ar" ? "var(--brand-text)" : "var(--text-muted)" }}>عربي</button>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ padding: 16, background: "var(--bg-sunken)" }}>
          {ctx && window.FullAgreement ? window.FullAgreement({ ...ctx, lang, layout }) : <div className="soft" style={{ padding: 40, textAlign: "center" }}>{TL("Nothing to preview — add a unit type and units to this project first.", "لا شيء للمعاينة — أضف نوع وحدة ووحدات لهذا المشروع أولا.")}</div>}
        </div>
      </div>
    </div>
  );
}

// Resolve a sample order for previewing variable fills (latest in this project, else any).
function _sampleOrder(projectId) {
  return D.ORDERS.find((o) => o.projectId === projectId) || D.ORDERS[0] || D.sampleOrderFor(projectId);
}

// Extract plain text from a .docx (zip → word/document.xml → strip tags).
async function docxToText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  // find End Of Central Directory (signature 0x06054b50), scan from tail
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error("not a zip");
  const cdOffset = dv.getUint32(eocd + 16, true);
  const cdCount = dv.getUint16(eocd + 10, true);
  let p = cdOffset, target = null;
  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === "word/document.xml") target = { method, compSize, localOff };
    p += 46 + nameLen + extraLen + commLen;
  }
  if (!target) throw new Error("no document.xml");
  // local header: 30 + nameLen + extraLen, then data
  const lh = target.localOff;
  const lNameLen = dv.getUint16(lh + 26, true);
  const lExtraLen = dv.getUint16(lh + 28, true);
  const dataStart = lh + 30 + lNameLen + lExtraLen;
  const comp = buf.subarray(dataStart, dataStart + target.compSize);
  let xmlBytes;
  if (target.method === 0) { xmlBytes = comp; }
  else {
    const ds = new DecompressionStream("deflate-raw");
    const ab = await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer();
    xmlBytes = new Uint8Array(ab);
  }
  const xml = new TextDecoder().decode(xmlBytes);
  // paragraphs → newlines; tabs; strip remaining tags; decode entities
  let txt = xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return txt.replace(/\n{3,}/g, "\n\n").trim();
}

function ContractEditDrawer({ tpl, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [t, setT] = useState({ ...tpl });
  const set = (patch) => setT((x) => ({ ...x, ...patch }));
  const enRef = React.useRef(null), arRef = React.useRef(null);
  const valid = ((t.name || "").trim() || (t.nameAr || "").trim());
  const fileRef = React.useRef(null);
  const onUpload = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const name = (f.name || "").toLowerCase();
    e.target.value = "";
    if (name.endsWith(".docx")) {
      docxToText(f).then((txt) => set({ body: txt })).catch((err) => { console.error(err); alert("Could not read .docx — try saving as .txt, or paste the text."); });
    } else {
      const fr = new FileReader();
      fr.onload = () => set({ body: String(fr.result) });
      fr.readAsText(f);
    }
  };
  const insertVar = (field, ref, code) => {
    const v = D.CONTRACT_VARS.find((x) => x.code === code);
    const token = v && v.block ? "{{#" + code + "}} ... {{/" + code + "}}" : "{{" + code + "}}";
    const el = ref.current;
    const cur = t[field] || "";
    if (el && typeof el.selectionStart === "number") {
      const s = el.selectionStart, en = el.selectionEnd;
      set({ [field]: cur.slice(0, s) + token + cur.slice(en) });
      setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length; }, 0);
    } else set({ [field]: cur + token });
  };
  const save = () => {
    const payload = { name: (t.name || t.nameAr).trim(), nameAr: (t.nameAr || "").trim(), kind: t.kind, lang: t.lang, body: t.body || "", bodyAr: t.bodyAr || "", projectId: t.projectId };
    window.RevnuSupport.act(() => t._new ? D.createContract(payload) : D.setContract(t.id, payload), { done: TL("Template saved.", "تم حفظ النموذج.") }).then((r) => { if (r !== undefined) onClose(); });
  };
  const del = () => { window.RevnuSupport.act(() => D.removeContract(t.id), { done: TL("Template deleted.", "حُذف النموذج.") }).then((r) => { if (r !== undefined) onClose(); }); };
  const showEn = t.lang !== "ar", showAr = t.lang !== "en";
  const VarChips = ({ field, refEl }) => (
    <div className="row" style={{ gap: 5, flexWrap: "wrap", margin: "6px 0 4px" }}>
      {D.CONTRACT_VARS.map((v) => (
        <button key={v.code} type="button" onClick={() => insertVar(field, refEl, v.code)}
          title={"{{" + v.code + "}}"}
          style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--line-strong)", background: "var(--bg-tint)", cursor: "pointer", fontFamily: AR ? "var(--font-ar)" : "inherit" }}>
          {AR ? v.ar : v.en}
        </button>
      ))}
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.4)", zIndex: 300, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "100%", height: "100%", background: "var(--bg-card)", borderInlineStart: "1px solid var(--line)", overflowY: "auto", padding: 26 }}>
        <div className="row-between" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 19, fontWeight: 600 }}>{t._new ? TL("New contract template", "نموذج عقد جديد") : TL("Edit template", "تعديل النموذج")}</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        <BiField label={TL("Template name", "اسم النموذج")} en={t.name} ar={t.nameAr}
          onEn={(v) => set({ name: v })} onAr={(v) => set({ nameAr: v })}
          placeholder="Unit Sale Agreement" placeholderAr="اتفاقية بيع وحدة" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("Kind", "النوع")}</div>
            <select className="input" value={t.kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="sale">{TL("Sale", "بيع")}</option>
              <option value="furnish">{TL("Furnishing", "تأثيث")}</option>
              <option value="ops">{TL("Operations", "تشغيل")}</option>
              <option value="kyc">{TL("KYC", "اعرف عميلك")}</option>
            </select>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("Available languages", "اللغات المتاحة")}</div>
            <div className="row" style={{ gap: 6 }}>
              {[["both", TL("AR + EN", "عربي + إنجليزي")], ["ar", TL("Arabic", "عربي")], ["en", TL("English", "إنجليزي")]].map(([id, lbl]) => (
                <button key={id} type="button" onClick={() => set({ lang: id })}
                  style={{ flex: 1, padding: "8px 4px", borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                           border: "1px solid " + (t.lang === id ? "var(--brand)" : "var(--line-strong)"),
                           background: t.lang === id ? "var(--brand)" : "transparent", color: t.lang === id ? "var(--brand-text)" : "var(--text-muted)" }}>{lbl}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 8, marginBottom: 14, alignItems: "center" }}>
          <button className="btn btn-sm btn-secondary" onClick={() => fileRef.current && fileRef.current.click()}>{TL("Upload Word (.docx) or .txt", "رفع ملف Word (.docx) أو .txt")}</button>
          <span className="soft" style={{ fontSize: 11 }}>{TL("Insert variable codes below; they auto-fill from the deal.", "أدرج أكواد المتغيرات أدناه؛ تعبأ تلقائيا من الصفقة.")}</span>
          <input ref={fileRef} type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: "none" }} onChange={onUpload} />
        </div>

        {showEn && (
          <div style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{TL("English body", "النص الإنجليزي")}</div>
            <VarChips field="body" refEl={enRef} />
            <textarea ref={enRef} className="input" dir="ltr" value={t.body || ""} onChange={(e) => set({ body: e.target.value })} style={{ minHeight: 200, fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, lineHeight: 1.6 }} placeholder="Type the contract… use the chips above to insert {{variables}}." />
          </div>
        )}
        {showAr && (
          <div style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{TL("Arabic body", "النص العربي")}</div>
            <VarChips field="bodyAr" refEl={arRef} />
            <textarea ref={arRef} className="input" dir="rtl" value={t.bodyAr || ""} onChange={(e) => set({ bodyAr: e.target.value })} style={{ minHeight: 200, fontFamily: "var(--font-ar)", fontSize: 13.5, lineHeight: 1.7 }} placeholder="اكتب نص العقد… استخدم الأزرار أعلاه لإدراج {{المتغيرات}}." />
          </div>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary grow" disabled={!valid} onClick={save}>{t._new ? TL("Create template", "إنشاء النموذج") : TL("Save", "حفظ")}</button>
          {!t._new && CAN_DELETE_FN() && <button className="btn btn-ghost" onClick={() => { if (confirm(TL("Delete \"" + (t.name || t.nameAr || "") + "\"? This cannot be undone.", "حذف \"" + (t.nameAr || t.name || "") + "\"؟ لا يمكن التراجع."))) del(); }} style={{ color: "var(--negative, #c0492f)" }}>{TL("Remove", "إزالة")}</button>}
          <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
        </div>
      </div>
    </div>
  );
}

function ContractPreview({ tpl, project, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [lang, setLang] = useState((tpl.lang === "ar" || AR) ? "ar" : "en");
  const order = _sampleOrder(project.id);
  const showAr = lang === "ar";
  const body = showAr ? (tpl.bodyAr || tpl.body) : (tpl.body || tpl.bodyAr);
  const filled = D.fillContract(body, order, showAr);
  const canAr = tpl.lang !== "en", canEn = tpl.lang !== "ar";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.45)", zIndex: 310, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 28, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "100%", background: "var(--bg-card)", borderRadius: 12, overflow: "hidden" }}>
        <div className="row-between" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">{TL("PREVIEW · auto-filled", "معاينة · معبأة تلقائيا")}</div>
            <strong>{showAr && tpl.nameAr ? tpl.nameAr : tpl.name}</strong>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {canEn && canAr && (
              <div style={{ display: "inline-flex", border: "1px solid var(--line-strong)", borderRadius: 7, overflow: "hidden" }}>
                <button type="button" onClick={() => setLang("en")} style={{ padding: "5px 11px", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, background: !showAr ? "var(--brand)" : "transparent", color: !showAr ? "var(--brand-text)" : "var(--text-muted)" }}>EN</button>
                <button type="button" onClick={() => setLang("ar")} style={{ padding: "5px 11px", border: "none", borderInlineStart: "1px solid var(--line-strong)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-ar)", background: showAr ? "var(--brand)" : "transparent", color: showAr ? "var(--brand-text)" : "var(--text-muted)" }}>عربي</button>
              </div>
            )}
            <button className="btn btn-sm btn-secondary" onClick={() => {
              const w = window.open("", "_blank");
              if (!w) return;
              const title = showAr && tpl.nameAr ? tpl.nameAr : tpl.name;
              w.document.write('<html dir="' + (showAr ? "rtl" : "ltr") + '"><head><meta charset="utf-8"><title>' + title + '</title>' +
                '<style>@page{margin:22mm}body{font-family:' + (showAr ? "Almarai, sans-serif" : "Georgia, serif") + ';font-size:13px;line-height:1.9;white-space:pre-wrap;color:#1a1a1a}</style></head><body>' +
                filled.replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</body></html>');
              w.document.close(); setTimeout(() => w.print(), 300);
            }}>{TL("Print / PDF", "طباعة / PDF")}</button>
            <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ padding: 28, maxHeight: "70vh", overflowY: "auto" }}>
          <pre dir={showAr ? "rtl" : "ltr"} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: showAr ? "var(--font-ar)" : "inherit", fontSize: 13.5, lineHeight: 1.8, margin: 0, color: "var(--text)" }}>{filled || TL("(empty template)", "(نموذج فارغ)")}</pre>
        </div>
        <div className="soft" style={{ padding: "10px 20px", borderTop: "1px solid var(--line)", fontSize: 11 }}>
          {order ? TL("Filled from order " + order.id, "معبأ من الطلب " + order.id) : TL("No sample order — codes shown as [placeholders].", "لا يوجد طلب نموذجي — تظهر الأكواد ك [عناصر نائبة].")}
        </div>
      </div>
    </div>
  );
}

function WsCommissions({ dv }) {
  const AR = window.I18N && window.I18N.isAR;
  const L = (en, ar) => (AR ? ar : en);
  const [ladder, setLadder] = useState(D.commissionLadderFor(dv.id).map((x) => ({ ...x })));
  const [, bump] = useState(0);
  const sum = ladder.reduce((s, l) => s + (Number(l.pct) || 0), 0);
  const valid = Math.round(sum) === 100;
  const scopeLabel = (sc) => sc === "own" ? L("Own deals", "صفقاته") : sc === "team" ? L("My team", "فريقه") : L("All deals", "كل الصفقات");
  const scopeHint = (sc) => sc === "own" ? L("the rep who closes the deal", "المندوب الذي يغلق الصفقة")
    : sc === "team" ? L("paid to their manager up the reporting chain", "تدفع لمديره في سلسلة الإدارة")
    : L("paid to this role across the whole developer", "تدفع لصاحب هذا الدور على مستوى المطور كله");
  const setLvl = (i, patch) => setLadder((ls) => ls.map((l, ix) => ix === i ? { ...l, ...patch } : l));
  const addLvl = () => setLadder((ls) => [...ls, { id: "lvl-" + Date.now().toString(36).slice(-5), name: "New level", nameAr: "", pct: 0, scope: "team" }]);
  const rmLvl = (i) => setLadder((ls) => ls.filter((_, ix) => ix !== i));
  const saveLadder = () => { if (valid) window.RevnuSupport.act(() => D.setCommissionLadder(dv.id, ladder), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ سلّم العمولة." : "Commission ladder saved." }).then(() => bump((x) => x + 1)); };

  // ---- payouts ----
  const lines = D.payoutLinesForDeveloper(dv.id);
  const byPerson = {};
  lines.forEach((l) => {
    if (!byPerson[l.userId]) byPerson[l.userId] = { user: D.userById(l.userId), payable: 0, paid: 0, pending: 0, lines: [] };
    const g = byPerson[l.userId];
    g.lines.push(l);
    if (l.payable) { g.payable += l.amount; if (l.paid) g.paid += l.amount; else g.pending += l.amount; }
  });
  const people = Object.values(byPerson).filter((g) => g.user).sort((a, b) => b.payable - a.payable);
  const totalPayable = lines.filter((l) => l.payable).reduce((s, l) => s + l.amount, 0);
  const totalPaid    = lines.filter((l) => l.payable && l.paid).reduce((s, l) => s + l.amount, 0);
  const totalPending = totalPayable - totalPaid;
  const markPaid = (l, paid) => { window.RevnuSupport.act(() => D.setPayoutStatus(l.orderId, l.userId, l.levelId, paid ? "paid" : "pending")).then(() => bump((x) => x + 1)); };
  const [openPerson, setOpenPerson] = useState(null);

  return (
    <>
      <WsCardHead eye={L("// SALES COMMISSIONS", "// عمولات المبيعات")} title={L("Sales commissions", "عمولات المبيعات")}
        sub={L("Set how each deal's commission pool splits across the sales org, then track Revnu's payouts. Revnu pays each person after the customer's first payment lands.",
                "حدد كيف تتوزع عمولة كل صفقة على فريق المبيعات، ثم تتبع تحويلات Revnu. تدفع Revnu لكل شخص بعد استلام الدفعة الأولى من العميل.")} />

      {/* ---- Ladder editor ---- */}
      <div className="card card-pad-lg" style={{ marginBottom: 20 }}>
        <div className="row-between" style={{ marginBottom: 6 }}>
          <div className="eyebrow">{L("// COMMISSION LADDER", "// سلم العمولة")}</div>
          <span className="chip" style={{ background: valid ? "var(--positive-soft, rgba(31,138,91,0.12))" : "var(--warning-soft, rgba(184,134,11,0.14))", color: valid ? "var(--positive, #1f8a5b)" : "var(--warning, #b8860b)" }}>
            {L("Total", "الإجمالي")}: {sum}%{valid ? " ✓" : L(" — must be 100%", " — يجب أن يساوي 100%")}
          </span>
        </div>
        <div className="soft" style={{ fontSize: 12, marginBottom: 14 }}>
          {L("The pool is the project's sales commission (% of the extras' ex-VAT value). Shares below split that pool.", "العمولة الإجمالية = عمولة مبيعات المشروع (% من الإضافات بدون الضريبة). النسب أدناه تقسم هذه العمولة.")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ladder.map((l, i) => (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 90px 1.1fr auto", gap: 10, alignItems: "center", padding: 10, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--bg-sunken)" }}>
              <input className="input" style={{ height: 32 }} value={l.name} placeholder={L("Level name (English)", "اسم المستوى (إنجليزي)")} onChange={(e) => setLvl(i, { name: e.target.value })} />
              <input className="input" dir="rtl" style={{ height: 32, fontFamily: "var(--font-ar)" }} value={l.nameAr || ""} placeholder="الاسم (عربي)" onChange={(e) => setLvl(i, { nameAr: e.target.value })} />
              <div className="row" style={{ gap: 4, alignItems: "center" }}>
                <input className="input mono" type="number" min="0" max="100" style={{ height: 32, width: 56, textAlign: "center" }} value={l.pct} onChange={(e) => setLvl(i, { pct: Number(e.target.value) })} />
                <span className="soft" style={{ fontSize: 12 }}>%</span>
              </div>
              <select className="select" style={{ height: 32 }} value={l.scope} onChange={(e) => setLvl(i, { scope: e.target.value })} title={scopeHint(l.scope)}>
                <option value="own">{L("Own deals", "صفقاته")}</option>
                <option value="team">{L("My team", "فريقه")}</option>
                <option value="all">{L("All deals", "كل الصفقات")}</option>
              </select>
              <button className="btn btn-sm btn-ghost" disabled={ladder.length <= 1} onClick={() => rmLvl(i)} title={L("Remove level", "حذف المستوى")}>✕</button>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn btn-secondary" onClick={addLvl}>＋ {L("Add level", "إضافة مستوى")}</button>
          <button className="btn btn-primary" disabled={!valid} onClick={saveLadder}>{L("Save ladder", "حفظ السلم")}</button>
        </div>
        <div className="soft" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.7 }}>
          <strong>{L("Own deals", "صفقاته")}</strong> — {scopeHint("own")}. &nbsp;
          <strong>{L("My team", "فريقه")}</strong> — {scopeHint("team")}. &nbsp;
          <strong>{L("All deals", "كل الصفقات")}</strong> — {scopeHint("all")}.
        </div>
      </div>

      {/* ---- Payouts ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 16 }}>
        <Stat label={L("Payable (customer paid)", "مستحقة (دفع العميل)")} value={D.fmtSAR(totalPayable)} unit="SAR" />
        <Stat label={L("Transferred", "حولت")}   value={D.fmtSAR(totalPaid)}    unit="SAR" delta={L("marked paid", "معلمة كمدفوعة")} />
        <Stat label={L("Pending transfer", "بانتظار التحويل")} value={D.fmtSAR(totalPending)} unit="SAR" delta={L("owed to the team", "مستحقة للفريق")} />
      </div>

      <div className="card card-flush">
        <div className="row-between" style={{ padding: "12px 16px" }}>
          <strong style={{ fontSize: 13 }}>{L("Payouts by person", "العمولات حسب الشخص")}</strong>
          <span className="soft" style={{ fontSize: 11 }}>{L("Commission becomes payable once the customer pays their first instalment.", "تصبح العمولة مستحقة بعد دفع العميل لأول قسط.")}</span>
        </div>
        <table className="tbl">
          <thead><tr>
            <th>{L("Name", "الاسم")}</th><th>{L("Role / level", "الدور / المستوى")}</th>
            <th>{L("Bank · IBAN", "البنك · الآيبان")}</th>
            <th className="right">{L("Payable", "المستحق")}</th>
            <th className="right">{L("Pending", "المعلق")}</th>
            <th className="right">{L("Detail", "التفاصيل")}</th>
          </tr></thead>
          <tbody>
            {people.map((g) => {
              const u = g.user;
              const lvl = D.commissionLadderFor(dv.id).find((x) => x.id === u.commissionLevelId);
              const bank = u.bank || {};
              return (
                <tr key={u.id}>
                  <td><span style={{ fontWeight: 500 }}>{(AR && u.nameAr) ? u.nameAr : u.name}</span></td>
                  <td><span className="chip">{lvl ? (AR ? (lvl.nameAr || lvl.name) : lvl.name) : roleLabel(u.role)}</span></td>
                  <td className="soft" style={{ fontSize: 11.5 }}>
                    {bank.iban ? <>{(AR && bank.bankNameAr) ? bank.bankNameAr : (bank.bankName || "—")}<div className="mono" style={{ fontSize: 10.5, direction: "ltr", textAlign: AR ? "right" : "left" }}>{bank.iban}</div></> : <span style={{ color: "var(--warning, #b8860b)" }}>{L("No bank details", "لا توجد بيانات بنكية")}</span>}
                  </td>
                  <td className="right mono" style={{ fontWeight: 600 }}>{D.fmtSAR(g.payable)}</td>
                  <td className="right mono" style={{ color: g.pending > 0 ? "var(--warning, #b8860b)" : "var(--text-soft)" }}>{D.fmtSAR(g.pending)}</td>
                  <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => setOpenPerson(openPerson === u.id ? null : u.id)}>{openPerson === u.id ? L("Hide", "إخفاء") : L("View", "عرض")}</button></td>
                </tr>
              );
            })}
            {people.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 26, color: "var(--text-soft)" }}>{L("No commissions yet.", "لا توجد عمولات بعد.")}</td></tr>}
          </tbody>
        </table>
      </div>

      {openPerson && (() => {
        const g = byPerson[openPerson]; if (!g) return null;
        return (
          <div className="card card-pad-lg" style={{ marginTop: 16 }}>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>{(AR && g.user.nameAr) ? g.user.nameAr : g.user.name} — {L("commission lines", "بنود العمولة")}</strong>
              <button className="btn btn-sm btn-ghost" onClick={() => setOpenPerson(null)}>✕</button>
            </div>
            <table className="tbl">
              <thead><tr><th>{L("Order", "الطلب")}</th><th>{L("Customer", "العميل")}</th><th>{L("Level", "المستوى")}</th><th className="right">{L("Amount", "المبلغ")}</th><th className="right">{L("Status", "الحالة")}</th></tr></thead>
              <tbody>
                {g.lines.sort((a, b) => (b.payable - a.payable)).map((l, i) => (
                  <tr key={i} style={{ opacity: l.payable ? 1 : 0.5, cursor: "pointer" }} onClick={() => window.__revnuOpenOrder && window.__revnuOpenOrder(l.orderId)}>
                    <td className="mono" style={{ fontSize: 11.5, textDecoration: "underline" }}>{l.orderId}</td>
                    <td style={{ fontSize: 12.5 }}>{l.customerName}</td>
                    <td><span className="chip chip-soft" style={{ fontSize: 10.5 }}>{AR ? (l.levelNameAr || l.levelName) : l.levelName}</span></td>
                    <td className="right mono" style={{ fontWeight: 600 }}>{D.fmtSAR(l.amount)}</td>
                    <td className="right">
                      {!l.payable
                        ? <span className="soft" style={{ fontSize: 11 }}>{L("Awaiting customer payment", "بانتظار دفع العميل")}</span>
                        : l.paid
                          ? <button className="btn btn-sm" style={{ background: "var(--positive-soft, rgba(31,138,91,0.12))", color: "var(--positive, #1f8a5b)" }} onClick={() => markPaid(l, false)}>✓ {L("Transferred", "حولت")}</button>
                          : <button className="btn btn-sm btn-primary" onClick={() => markPaid(l, true)}>{L("Mark transferred", "تعليم كمحولة")}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </>
  );
}

function WsTeam({ T }) {
  const AR = window.I18N && window.I18N.isAR;
  const [, bump] = useState(0);
  const [editing, setEditing] = useState(null);
  const projects = D.PROJECTS.filter((p) => p.developerId === T.developer.id);
  const users = D.USERS.filter((u) => u.developerId === T.developer.id);
  return (
    <>
      <WsCardHead eye="// TEAM" title={AR ? "المستخدمون والأدوار" : "Users & roles"} sub={AR ? "كل من يعمل لدى المطور — بأي مسمى — مع صلاحياته ومشاريعه. يمكن إسناد المندوبين لمشاريع محددة." : "Everyone who works for the developer — any title — with their permissions and project access."}
        action={<button className="btn btn-primary" onClick={() => setEditing({ _new: true, developerId: T.developer.id, name: "", nameAr: "", email: "", role: "", roleAr: "", perms: ["orders"], assignedProjectIds: [] })}>{AR ? "+ دعوة مستخدم" : "+ Invite user"}</button>} />
      <div className="card card-flush">
        <table className="tbl">
          <thead><tr><th>{TT("Name")}</th><th>{TT("Email")}</th><th>{TT("Role")}</th><th>{TT("Assigned projects")}</th><th className="right">{TT("Actions")}</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{u.name.split(" ").map((w) => w[0]).slice(0,2).join("")}</span>
                    <span>{(AR && u.nameAr) ? u.nameAr : u.name}</span>
                  </div>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{u.email}</td>
                <td><span className="chip">{roleDisplay(u)}</span></td>
                <td className="soft" style={{ fontSize: 12 }}>{D.devHasPerm(u, "orders") ? (u.assignedProjectIds.length === 0 ? (AR ? "كل المشاريع" : "All projects") : u.assignedProjectIds.map((id) => { const p = D.projById(id); return (AR && p?.nameAr) ? p.nameAr : p?.name; }).join("، ")) : "—"}</td>
                <td className="right">
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ ...u })}>{AR ? "تعديل" : "Edit"}</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--text-soft)" }}>{AR ? "لا يوجد مستخدمون بعد." : "No users yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <WsTeamDrawer member={editing} projects={projects} onClose={() => { setEditing(null); bump((x) => x + 1); }} />}
    </>
  );
}

function WsTeamDrawer({ member, projects, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const _known = D.DEV_ROLES.find((r) => r.id === member.role);
  const _initRole   = _known ? _known.en : (member.role || "");
  const _initRoleAr = _known ? _known.ar : (member.roleAr || "");
  const _initPerms  = member.perms ? member.perms.slice() : (member._new ? ["orders"] : D.devPermsFor(member).slice());
  const [m, setM] = useState({ ...member, role: _initRole, roleAr: _initRoleAr, perms: _initPerms, assignedProjectIds: [...(member.assignedProjectIds || [])] });
  const set = (patch) => setM((x) => ({ ...x, ...patch }));
  const toggleProj = (id) => setM((x) => ({ ...x, assignedProjectIds: x.assignedProjectIds.includes(id) ? x.assignedProjectIds.filter((p) => p !== id) : [...x.assignedProjectIds, id] }));
  const valid = ((m.name || "").trim() || (m.nameAr || "").trim()) && /@/.test(m.email || "");
  const save = () => {
    const payload = { name: (m.name || m.nameAr).trim(), nameAr: (m.nameAr || "").trim(), email: m.email.trim(), role: (m.role || "").trim(), roleAr: (m.roleAr || "").trim(), perms: m.perms, developerId: member.developerId, assignedProjectIds: D.devHasPerm(m, "orders") ? m.assignedProjectIds : [],
      commissionLevelId: m.commissionLevelId || null, reportsTo: m.reportsTo || null, bank: m.bank || null };
    const RS = window.RevnuSupport;
    if (m._new) {
      RS.act(() => D.createDevUser(payload), { pending: TL("Creating the account…", "جارٍ إنشاء الحساب…") }).then((u) => { if (!u) return; onClose(); RS.showCredentials({ name: u.name, email: u.email, password: u._tempPassword }); });
    } else {
      RS.act(() => D.setDevUser(m.id, payload), { pending: TL("Saving…", "جارٍ الحفظ…"), done: TL("Saved.", "تم الحفظ.") }).then((u) => { if (u) onClose(); });
    }
  };
  const del = () => { window.RevnuSupport.act(() => D.removeDevUser(m.id), { done: TL("Removed.", "تمت الإزالة.") }).then((ok) => { if (ok) onClose(); }); };
  const resetPw = () => { const RS = window.RevnuSupport; RS.act(() => D.resetUserPassword(m.id), { pending: TL("Issuing a temporary password…", "جارٍ إصدار كلمة مرور مؤقتة…") }).then((r) => { if (r) RS.showCredentials({ name: m.name || m.nameAr, email: r.email || m.email, password: r.tempPassword, reset: true }); }); };
  const perms = m.perms || [];
  const togglePerm = (p) => set({ perms: perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p] });
  const setBank = (patch) => set({ bank: Object.assign({}, m.bank, patch) });
  const ladder = D.commissionLadderFor(member.developerId);
  const managers = D.USERS.filter((u) => u.developerId === member.developerId && u.id !== m.id);
  const bank = m.bank || {};
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.4)", zIndex: 300, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", height: "100%", background: "var(--bg-card)", borderInlineStart: "1px solid var(--line)", overflowY: "auto", padding: 24 }}>
        <div className="row-between" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{m._new ? TL("Invite team member", "دعوة عضو للفريق") : TL("Manage member", "إدارة العضو")}</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>
        <BiField label={TL("Full name", "الاسم الكامل")} en={m.name} ar={m.nameAr}
          onEn={(v) => set({ name: v })} onAr={(v) => set({ nameAr: v })}
          placeholder="e.g. Sara Al-Qahtani" placeholderAr="مثال: سارة القحطاني" />
        <label className="field-label">{TL("Email", "البريد الإلكتروني")}</label>
        <input className="input" type="email" value={m.email || ""} onChange={(e) => set({ email: e.target.value })} placeholder="name@developer.sa" style={{ marginBottom: 16, direction: "ltr", textAlign: AR ? "right" : "left" }} />
        <label className="field-label">{TL("Role / title", "الدور / المسمى")}</label>
        <div className="soft" style={{ fontSize: 11, margin: "2px 0 8px" }}>{TL("Free text — a label only. Access is controlled by the permissions below, not the title.", "نص حر — مجرد مسمى. الوصول تتحكم به الصلاحيات أدناه وليس المسمى.")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <input className="input" value={m.role || ""} onChange={(e) => set({ role: e.target.value })} placeholder={TL("e.g. Sales Manager", "بالإنجليزية")} />
          <input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={m.roleAr || ""} onChange={(e) => set({ roleAr: e.target.value })} placeholder="مثال: مدير المبيعات" />
        </div>
        <label className="field-label">{TL("Permissions", "الصلاحيات")}</label>
        <div className="soft" style={{ fontSize: 11, margin: "2px 0 8px" }}>{TL("Tick exactly what this person can access — independent of their title.", "حدد بالضبط ما يمكن لهذا الشخص الوصول إليه — بصرف النظر عن مسماه.")}</div>
        <div className="stack-sm" style={{ marginBottom: 18 }}>
          {D.DEV_PERMS.map((p) => {
            const on = perms.includes(p.id);
            return (
              <label key={p.id} className="row-between" style={{ padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", cursor: "pointer" }}>
                <span style={{ fontSize: 13 }}>{AR ? p.ar : p.en}</span>
                <input type="checkbox" checked={on} onChange={() => togglePerm(p.id)} />
              </label>
            );
          })}
        </div>
        {perms.includes("orders") && (
          <div style={{ marginBottom: 18 }}>
            <label className="field-label">{TL("Project access", "صلاحية المشاريع")}</label>
            <div className="soft" style={{ fontSize: 11, margin: "2px 0 8px" }}>{TL("Leave all unchecked = access to every project.", "اترك الكل دون تحديد = الوصول إلى كل المشاريع.")}</div>
            <div className="stack-sm">
              {projects.map((p) => {
                const on = m.assignedProjectIds.includes(p.id);
                return (
                  <label key={p.id} className="row-between" style={{ padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", cursor: "pointer" }}>
                    <span style={{ fontSize: 13 }}>{(AR && p.nameAr) ? p.nameAr : p.name}</span>
                    <input type="checkbox" checked={on} onChange={() => toggleProj(p.id)} />
                  </label>
                );
              })}
              {projects.length === 0 && <div className="soft" style={{ fontSize: 12 }}>{TL("No projects yet.", "لا توجد مشاريع بعد.")}</div>}
            </div>
          </div>
        )}
        <div style={{ marginBottom: 18, padding: 14, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--bg-sunken)" }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{TL("// COMMISSION & PAYOUT", "// العمولة والتحويل")}</div>
            <label className="field-label">{TL("Commission level", "مستوى العمولة")}</label>
            <div className="soft" style={{ fontSize: 11, margin: "2px 0 6px" }}>{TL("Which rung of the ladder this person sits on.", "أي درجة في سلم العمولة يشغلها هذا الشخص.")}</div>
            <select className="select" style={{ marginBottom: 12 }} value={m.commissionLevelId || ""} onChange={(e) => set({ commissionLevelId: e.target.value || null })}>
              <option value="">{TL("— none —", "— لا شيء —")}</option>
              {ladder.map((l) => <option key={l.id} value={l.id}>{(AR ? (l.nameAr || l.name) : l.name) + " · " + l.pct + "%"}</option>)}
            </select>
            <label className="field-label">{TL("Reports to", "يتبع إداريا")}</label>
            <div className="soft" style={{ fontSize: 11, margin: "2px 0 6px" }}>{TL("Their manager — used to route the team override up the chain.", "مديره — يستخدم لتوجيه حصة الفريق للأعلى.")}</div>
            <select className="select" style={{ marginBottom: 12 }} value={m.reportsTo || ""} onChange={(e) => set({ reportsTo: e.target.value || null })}>
              <option value="">{TL("— nobody (top of chain) —", "— لا أحد (قمة الهرم) —")}</option>
              {managers.map((u) => <option key={u.id} value={u.id}>{((AR && u.nameAr) ? u.nameAr : u.name) + " · " + roleLabel(u.role)}</option>)}
            </select>
            <label className="field-label">{TL("Bank name", "اسم البنك")}</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <input className="input" value={bank.bankName || ""} placeholder="e.g. Al Rajhi Bank" onChange={(e) => setBank({ bankName: e.target.value })} />
              <input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={bank.bankNameAr || ""} placeholder="مثال: مصرف الراجحي" onChange={(e) => setBank({ bankNameAr: e.target.value })} />
            </div>
            <label className="field-label">{TL("IBAN", "رقم الآيبان")}</label>
            <input className="input mono" value={bank.iban || ""} placeholder="SA00 0000 0000 0000 0000 0000" onChange={(e) => setBank({ iban: e.target.value.toUpperCase() })} style={{ marginBottom: 10, direction: "ltr", textAlign: AR ? "right" : "left" }} />
            <label className="field-label">{TL("Account holder name", "اسم صاحب الحساب")}</label>
            <input className="input" value={bank.accountName || ""} placeholder={TL("As printed on the bank account", "كما هو في الحساب البنكي")} onChange={(e) => setBank({ accountName: e.target.value })} />
          </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary grow" disabled={!valid} onClick={save}>{m._new ? TL("Create account", "إنشاء الحساب") : TL("Save", "حفظ")}</button>
          {!m._new && <button className="btn btn-ghost" onClick={resetPw}>{TL("Reset password", "إعادة تعيين كلمة المرور")}</button>}
          {!m._new && CAN_DELETE_FN() && <button className="btn btn-ghost" onClick={() => { if (confirm(TL("Remove " + m.name + "? They will lose access immediately.", "إزالة " + (m.nameAr || m.name) + "؟ سيفقد الوصول فورا.")) ) del(); }} style={{ color: "var(--negative, #c0492f)" }}>{TL("Remove", "إزالة")}</button>}
          <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
        </div>
      </div>
    </div>
  );
}

function WsOrders({ T }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <WsCardHead eye="// ORDERS" title={T.orders.length + (window.I18N && window.I18N.isAR ? " طلب" : " orders")} sub="Every order created through the sales portal for this developer. Click a row to inspect and download the document pack." />
      <div className="card card-flush">
        <table className="tbl tbl-clickable">
          <thead><tr><th>{TT("Ref")}</th><th>{TT("Customer")}</th><th>{TT("Unit")}</th><th>{TT("Date")}</th><th className="right">{TT("Extras")}</th><th className="right">{TT("Status")}</th></tr></thead>
          <tbody>
            {T.orders.map((o) => (
              <tr key={o.id} onClick={() => setOpen(o)}>
                <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{o.id}</td>
                <td>{o.customerName}</td>
                <td className="mono">{o.unitNumber}</td>
                <td className="mono" style={{ fontSize: 12 }}>{D.fmtDate(o.createdAt)}</td>
                <td className="right mono">{D.fmtSAR(o.furnishCost)}</td>
                <td className="right"><span className={STATUS_CHIP[o.status]} style={{ textTransform: "capitalize" }}>{window.I18N ? window.I18N.t(o.status) : o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <OrderDrawer order={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Receivables() {
  const [open, setOpen] = useState(null);
  const [devF, setDevF] = useState("all");
  const orders = D.ORDERS.filter(D.isCustomerPaid);                                  // an invoice exists once the customer has paid
  const projectedRows = D.ORDERS.filter((o) => D.isLive(o) && !D.isCustomerPaid(o) && (devF === "all" || o.developerId === devF));
  const projected = projectedRows.reduce((a, o) => a + D.revnuPayableForOrder(o), 0);
  const rows = orders
    .filter((o) => devF === "all" || o.developerId === devF)
    .map((o) => {
      const sch = D.revnuScheduleForOrder(o);
      const payable = D.revnuPayableForOrder(o);
      const collected = sch.filter((m) => m.paid).reduce((a, m) => a + m.amount, 0);
      return { o, payable, collected, outstanding: payable - collected, nextDue: sch.find((m) => !m.paid) };
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  const totPayable = rows.reduce((a, r) => a + r.payable, 0);
  const totCollected = rows.reduce((a, r) => a + r.collected, 0);
  const totOutstanding = totPayable - totCollected;

  // per-developer rollup
  const byDev = {};
  rows.forEach((r) => {
    const id = r.o.developerId;
    byDev[id] = byDev[id] || { payable: 0, collected: 0, outstanding: 0 };
    byDev[id].payable += r.payable; byDev[id].collected += r.collected; byDev[id].outstanding += r.outstanding;
  });

  const recur = D.opsRevenueRollup(D.ORDERS.filter((o) => devF === "all" || o.developerId === devF));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{TT("Developer payments")}</h1>
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "ما يدفعه كل مطور ل Revnu مقابل ملحق التأثيث / الذكي / التشغيل، لكل طلب وفق شروط دفعه. التشغيل يتابع كوحدات مسجلة فقط — بلا مبالغ." : "What each developer owes Revnu for the furnishing / smart / operations addendum, per order — on their own payment terms. Operations is tracked as locked units only — no amounts."}</p>
        </div>
      </div>

      {recur.activeUnits > 0 && (
        <div className="card card-pad-lg" style={{ marginBottom: 18, background: "var(--brand-soft)", border: "1px solid var(--line)" }}>
          <div className="row-between" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div className="eyebrow">{window.I18N && window.I18N.isAR ? "// التشغيل · وحدات مسجلة" : "// OPERATIONS · LOCKED UNITS"}</div>
            <span className="chip">{window.I18N && window.I18N.isAR ? (recur.activeUnits + " وحدة") : (recur.activeUnits + " unit" + (recur.activeUnits !== 1 ? "s" : ""))}</span>
          </div>
          <div className="soft" style={{ fontSize: 12, lineHeight: 1.6 }}>
            {window.I18N && window.I18N.isAR
              ? "هذه الوحدات مسجلة في وحدة التشغيل وأبلغت بها شركة التشغيل. لا نتتبع دخل التشغيل داخل النظام — يدار خارجه. يرى المطور رقم الوحدة ونسبته المتفق عليها فقط، بلا مبالغ."
              : "These units are locked into the operations module and the operator company has been notified. We don't track operating income in the system — it's handled off-system. The developer sees only the unit and their agreed % cut, no amounts."}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
        <Stat label={window.I18N && window.I18N.isAR ? "مفوتر للمطورين" : "Invoiced to developers"} value={D.fmtSAR(totPayable) + " SAR"} delta={rows.length + (window.I18N && window.I18N.isAR ? " فاتورة · بعد دفع العميل" : " invoices · after customer payment")} />
        <Stat label={window.I18N && window.I18N.isAR ? "المحصل" : "Collected"} value={D.fmtSAR(totCollected) + " SAR"} />
        <Stat label={window.I18N && window.I18N.isAR ? "المتبقي" : "Outstanding"} value={D.fmtSAR(totOutstanding) + " SAR"} />
        <Stat label={window.I18N && window.I18N.isAR ? "متوقع" : "Projected"} value={D.fmtSAR(projected) + " SAR"} delta={projectedRows.length + (window.I18N && window.I18N.isAR ? " صفقة لم يدفع عميلها بعد" : " deals not yet paid by the customer")} />
      </div>

      <div className="card card-pad-lg" style={{ marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{TT("// BY DEVELOPER")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {Object.entries(byDev).map(([id, v]) => {
            const dv = D.devById(id);
            const terms = (dv?.revnuTerms?.milestones || []).map((m) => m.pct + "%").join(" · ");
            return (
              <div key={id} className="card card-pad" style={{ cursor: "pointer" }} onClick={() => setDevF(devF === id ? "all" : id)}>
                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <span style={{ width: 26, height: 26, borderRadius: 6, background: dv?.brand.primary, color: dv?.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>{dv?.initials}</span>
                  <strong style={{ fontSize: 13.5 }}>{dv?.name}</strong>
                </div>
                <div className="mono soft" style={{ fontSize: 10.5, marginTop: 6 }}>{window.I18N && window.I18N.isAR ? "الشروط" : "TERMS"} · {terms}</div>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="soft" style={{ fontSize: 12 }}>Outstanding</span>
                  <span className="mono" style={{ fontWeight: 700, color: v.outstanding > 0 ? "var(--warning, #b8860b)" : "var(--positive, #1f8a5b)" }}>{D.fmtSAR(v.outstanding)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row-between" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <strong>Orders {devF !== "all" ? "· " + D.devById(devF)?.name : ""}</strong>
          {devF !== "all" && <button className="btn btn-ghost btn-sm" onClick={() => setDevF("all")}>Clear filter</button>}
        </div>
        <table className="tbl">
          <thead><tr><th>{TT("Order")}</th><th>{TT("Developer")}</th><th>{TT("Unit")}</th><th className="right">{TT("Payable")}</th><th className="right">{TT("Collected")}</th><th className="right">{TT("Outstanding")}</th><th>{TT("Next due")}</th></tr></thead>
          <tbody>
            {rows.map(({ o, payable, collected, outstanding, nextDue }) => (
              <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => setOpen(o)}>
                <td className="mono" style={{ fontWeight: 600 }}>{o.id}</td>
                <td>{D.devById(o.developerId)?.name}</td>
                <td className="mono">{o.unitNumber}</td>
                <td className="right mono">{D.fmtSAR(payable)}</td>
                <td className="right mono">{D.fmtSAR(collected)}</td>
                <td className="right mono" style={{ fontWeight: 700, color: outstanding > 0 ? "var(--warning, #b8860b)" : "var(--positive, #1f8a5b)" }}>{D.fmtSAR(outstanding)}</td>
                <td>{nextDue ? <span className="chip chip-warning">{nextDue.label}</span> : <span className="chip chip-positive">Settled</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 36, color: "var(--text-soft)" }}>{window.I18N && window.I18N.isAR ? "لا توجد فواتير بعد — تنشأ عند دفع العميل الدفعة الأولى." : "No invoices yet — one is raised when a customer makes the first payment."}</td></tr>}
          </tbody>
        </table>
      </div>
      {open && <OrderDrawer order={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function OrderDrawer({ order, onClose }) {
  const u = D.unitByNumber(order.unitNumber);
  const pkg = D.pkgById(order.packageId);
  const ops = D.opsById(order.opsId);
  const dv  = D.devById(order.developerId);
  const [paidIds, setPaidIds] = useState(() => D.revnuPaidDefault(order));
  const schedule = D.revnuScheduleForOrder(order, paidIds);
  const payable  = D.revnuPayableForOrder(order);
  const paidTotal = schedule.filter((m) => m.paid).reduce((a, m) => a + m.amount, 0);
  const outstanding = payable - paidTotal;
  const togglePaid = async (id) => {
    const RS = window.RevnuSupport;
    if (paidIds.includes(id)) {
      if (!CAN_DELETE_FN()) return;
      const next = paidIds.filter((x) => x !== id);
      const r = await RS.act(() => D.setOrderPaid(order.id, next), { pending: AR ? "جارٍ التحديث…" : "Updating…" });
      if (r !== undefined) setPaidIds(next);
      return;
    }
    // Marking a milestone as received requires the developer's proof of transfer.
    const doc = await RS.uploadFor(order, "transfer_proof", id, ".pdf,image/*");
    if (!doc) return;
    const next = [...paidIds, id];
    const r = await RS.act(() => D.setOrderPaid(order.id, next, { [id]: doc.id }), { pending: AR ? "جارٍ تسجيل الدفعة…" : "Recording the payment…", done: AR ? "سُجّلت الدفعة مقابل إثبات التحويل." : "Payment recorded against the transfer proof." });
    if (r !== undefined) setPaidIds(next);
  };
  const [, tick] = useState(0);
  const live = D.ORDERS.find((x) => x.id === order.id) || order;
  const FLOW = ["active", "issued", "signed", "paid"];
  const flowIdx = FLOW.indexOf(live.status === "draft" || live.status === "review" ? "active" : (live.status === "completed" ? "paid" : live.status));
  const AR = window.I18N && window.I18N.isAR;
  const moveTo = async (st) => {
    const i = FLOW.indexOf(st); if (i !== flowIdx + 1) return;   // one step forward at a time
    const RS = window.RevnuSupport;
    if (st === "signed" && !D.documentFor(live.id, "signed_contract")) { const doc = await RS.uploadFor(live, "signed_contract", null, ".pdf,image/*,.doc,.docx"); if (!doc) return; }
    if (st === "paid" && !D.documentFor(live.id, "payment_proof")) { const doc = await RS.uploadFor(live, "payment_proof", null, ".pdf,image/*"); if (!doc) return; }
    await RS.act(() => D.transitionOrder(live.id, st), { pending: AR ? "جارٍ تحديث الطلب…" : "Updating the order…", done: AR ? "تم تحديث الطلب." : "Order updated." });
    tick((x) => x + 1);
  };
  const agreementHref = "/sales?dev=" + order.developerId + "&order=" + order.id;
  const RS = window.RevnuSupport;
  const signedFile = D.documentFor(live.id, "signed_contract");
  const proofFile  = D.documentFor(live.id, "payment_proof");
  const docs = [
    { name: AR ? "اتفاقية الشراء والاستثمار (مع الملاحق أ · ب)" : "Purchase & Investment Agreement (with Schedules A · B)", sub: AR ? "النسخة المصدرة — عرض · Word · PDF" : "Issued copy — view · Word · PDF", ref: "AGR-" + live.id.replace(/\D/g, ""), href: agreementHref, ok: true },
    { name: AR ? "الاتفاقية الموقعة" : "Signed agreement", sub: live.signedContractUrl ? live.signedContractUrl + (live.signedAt ? " · " + live.signedAt : "") : (AR ? "لم ترفع بعد" : "not uploaded yet"), ref: live.signedContractUrl ? "✓" : "—", ok: !!live.signedContractUrl, file: signedFile },
    { name: AR ? "إثبات دفع العميل" : "Customer proof of payment", sub: live.paymentProofUrl ? live.paymentProofUrl + (live.paidAt ? " · " + live.paidAt : "") : (AR ? "لم يرفع بعد" : "not uploaded yet"), ref: live.paymentProofUrl ? "✓" : "—", ok: !!live.paymentProofUrl, file: proofFile },
  ].concat(schedule.filter((m) => m.paid).map((m) => { const pf = D.transferProofFor(live.id, m.id); return { name: (AR ? "إثبات تحويل المطور — " : "Developer transfer proof — ") + m.label, sub: pf ? pf.name : (AR ? "معلمة كمدفوعة" : "marked as paid"), ref: "✓", ok: true, file: pf }; }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 560, maxWidth: "100vw", background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">// ORDER · {dv?.name?.toUpperCase()}</div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{order.id}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{AR ? "إغلاق ×" : "Close ×"}</button>
        </div>
        <div style={{ padding: 24 }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <span className={STATUS_CHIP[live.status]}>{AR ? (D.ORDER_STATUS_META[live.status]?.ar || live.status) : (D.ORDER_STATUS_META[live.status]?.en || live.status)}</span>
            <span className="soft" style={{ fontSize: 12 }}>{AR ? "أنشئ " : "created "}{D.fmtDate(live.createdAt)}</span>
          </div>
          {/* Process line — click the next stage to move the order (gated by the required document) */}
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            {FLOW.map((st, i) => (
              <React.Fragment key={st}>
                <button type="button" onClick={() => moveTo(st)} disabled={i !== flowIdx + 1}
                  title={i === flowIdx + 1 ? (st === "signed" ? (AR ? "يلزم رفع العقد الموقع" : "Requires the signed agreement") : st === "paid" ? (AR ? "يلزم إثبات الدفع" : "Requires proof of payment") : (AR ? "نقل الطلب إلى هذه المرحلة" : "Move the order to this stage")) : ""}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 14, cursor: i === flowIdx + 1 ? "pointer" : "default", background: i <= flowIdx ? "var(--brand)" : "transparent", color: i <= flowIdx ? "var(--brand-text)" : (i === flowIdx + 1 ? "var(--brand-deep)" : "var(--text-muted)"), borderWidth: 1, borderColor: (i <= flowIdx || i === flowIdx + 1 ? "var(--brand)" : "var(--line-strong)"), borderStyle: i === flowIdx + 1 ? "dashed" : "solid" }}>
                  {AR ? (D.ORDER_STATUS_META[st]?.ar || st) : (D.ORDER_STATUS_META[st]?.en || st)}
                </button>
                {i < FLOW.length - 1 && <span className="soft" style={{ fontSize: 11 }}>{AR ? "←" : "→"}</span>}
              </React.Fragment>
            ))}
          </div>

          <SecRow k={AR ? "العميل" : "Customer"} v={order.customerName + " · " + order.customerId} />
          <SecRow k={AR ? "البريد" : "Email"}    v={order.customerEmail} />
          <SecRow k={(order.unitNumbers || []).length > 1 ? (AR ? "الوحدات" : "Units") : (AR ? "الوحدة" : "Unit")} v={(order.unitNumbers && order.unitNumbers.length ? order.unitNumbers : [order.unitNumber]).join(" · ") + ((order.unitNumbers || []).length > 1 ? "" : " · " + (u ? (window.I18N ? window.I18N.tx(u.type, "name") : u.type.name) : ""))} />
          {(order.unitNumbers || []).length <= 1 && <SecRow k={AR ? "البرج / الدور" : "Tower / Floor"} v={(u?.tower || "") + " · " + (u?.floor || "")} />}
          <SecRow k={AR ? "الباقة" : "Package"}  v={pkg ? (pkg.tier + " — " + (window.I18N ? window.I18N.tx(pkg, "name") : pkg.name)) : (AR ? "بدون" : "Skipped")} />
          <SecRow k={AR ? "التشطيب" : "Fit-out"}  v={order.fitout ? (AR ? "مضمن" : "Included") : (AR ? "غير مضمن" : "Not included")} />
          <SecRow k={AR ? "التشغيل" : "Operations"} v={ops ? (window.I18N ? window.I18N.tx(ops, "name") : ops.name) : "—"} />

          <hr className="hr-thin" style={{ margin: "18px 0" }} />
          <div className="row-between">
            <strong>{AR ? "الإضافات شاملة الضريبة (تأثيث + ذكي + تشطيب)" : "Extras incl. VAT (furnishing + smart + fit-out)"}</strong>
            <strong className="mono" style={{ fontSize: 16 }}>{D.fmtSAR(order.furnishCost)} SAR</strong>
          </div>
          {order.fitout && order.fitoutCost ? (
            <div className="row-between" style={{ marginTop: 4, fontSize: 12, color: "var(--text-soft)" }}>
              <span>{AR ? "منها التشطيب" : "of which fit-out"}</span>
              <span className="mono">{D.fmtSAR(order.fitoutCost)} SAR</span>
            </div>
          ) : null}
          <div className="row-between" style={{ marginTop: 4, fontSize: 12, color: "var(--text-soft)" }}>
            <span>{AR ? "سعر الوحدة (يسوى بموجب عقد الشراء)" : "Unit price (settled under the purchase agreement)"}</span>
            <span className="mono">{D.fmtSAR(order.unitPrice)} SAR</span>
          </div>


          {/* ===== Developer → Revnu payment tracking ===== */}
          <hr className="hr-thin" style={{ margin: "22px 0 12px" }} />
          <div className="row-between" style={{ marginBottom: 4 }}>
            <div className="eyebrow">{TT("DEVELOPER → REVNU PAYMENT")}</div>
            <span className="mono soft" style={{ fontSize: 11 }}>{dv?.name}</span>
          </div>
          <p className="soft" style={{ fontSize: 11.5, margin: "0 0 12px", lineHeight: 1.5 }}>
            {AR ? ("ما يدين به " + (dv?.nameAr || dv?.name) + " ل Revnu عن هذا الطلب — قيمة الإضافات بعد خصم هامشه التعاقدي، وفق شروط دفعه." + (D.isCustomerPaid(order) ? "" : " تصدر الفاتورة عند دفع العميل الدفعة الأولى.")) : ("What " + dv?.name + " owes Revnu on this order — the extras value net of their contract markup, on their payment terms." + (D.isCustomerPaid(order) ? "" : " The invoice is raised once the customer makes the first payment."))}
          </p>
          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
            {schedule.map((m, i) => (
              <div key={m.id} className="row-between" style={{ padding: "10px 12px", borderBottom: i < schedule.length - 1 ? "1px solid var(--line)" : "none", background: m.paid ? "var(--positive-soft, rgba(34,160,90,0.07))" : "transparent" }}>
                <label className="row" style={{ gap: 10, cursor: "pointer", alignItems: "center" }}>
                  <input type="checkbox" checked={m.paid} onChange={() => togglePaid(m.id)} />
                  <span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{m.label}</span>
                    <span className="mono soft" style={{ fontSize: 11, marginLeft: 8 }}>{m.pct}%</span>
                  </span>
                </label>
                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 13 }}>{D.fmtSAR(m.amount)} SAR</span>
                  <span className={"chip " + (m.paid ? "chip-positive" : "chip-warning")} style={{ minWidth: 58, justifyContent: "center" }}>{m.paid ? (AR ? "مدفوعة" : "Paid") : (AR ? "مستحقة" : "Due")}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
            <MiniStat label={AR ? "مستحق ل Revnu" : "Payable to Revnu"} v={D.fmtSAR(payable)} />
            <MiniStat label={AR ? "المحصل" : "Collected"} v={D.fmtSAR(paidTotal)} tone="positive" />
            <MiniStat label={AR ? "المتبقي" : "Outstanding"} v={D.fmtSAR(outstanding)} tone={outstanding > 0 ? "warning" : "positive"} />
          </div>

          <hr className="hr-thin" style={{ margin: "22px 0 12px" }} />
          <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("DOCUMENT PACK")}</div>
          <div className="stack-sm">
            {docs.map((d, i) => (
              <div key={i} className="row-between" style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: d.ok ? "transparent" : "var(--bg-sunken)", opacity: d.ok ? 1 : 0.7 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</div>
                  <div className="mono soft" style={{ fontSize: 11 }}>{d.ref} · {d.sub}</div>
                </div>
                {d.href ? <a className="btn btn-sm btn-secondary" href={d.href}>{AR ? "عرض" : "Open"}</a>
                  : d.file && d.file.storagePath ? <button className="btn btn-sm btn-secondary" onClick={() => RS.openDocument(d.file)}>{AR ? "فتح" : "Open"}</button>
                  : d.file && d.file.data ? <a className="btn btn-sm btn-secondary" href={d.file.data} download={d.file.name}>{AR ? "تنزيل" : "Download"}</a>
                  : d.ok ? <span className="chip chip-positive">{AR ? "مسجل" : "on file"}</span> : <span className="chip">{AR ? "مفقود" : "missing"}</span>}
              </div>
            ))}
          </div>
          <a className="btn btn-primary" style={{ width: "100%", marginTop: 14, justifyContent: "center" }} href={agreementHref}>{AR ? "فتح الاتفاقية · تنزيل Word / PDF ←" : "Open agreement · download Word / PDF →"}</a>
          {order.status === "cancelled" && (
            <div className="card card-pad" style={{ marginTop: 14, background: "rgba(192,73,47,0.07)", border: "1px solid rgba(192,73,47,0.3)", fontSize: 12.5 }}>
              <strong style={{ color: "#c0492f" }}>{AR ? "ملغى" : "Cancelled"}</strong> · {order.cancelReason || (AR ? "بدون سبب مسجل" : "no reason recorded")}{order.cancelledBy ? " · " + order.cancelledBy : ""}
            </div>
          )}
          {CAN_DELETE_FN() && (
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {order.status !== "cancelled"
                ? <button className="btn btn-ghost btn-sm" style={{ color: "#c0492f" }} onClick={() => { const why = prompt(AR ? "سبب الإلغاء (إلزامي):" : "Reason for cancelling (required):"); if (why == null) return; if (!why.trim()) return alert(AR ? "السبب إلزامي." : "A reason is required."); window.RevnuSupport.act(() => D.cancelOrder(order.id, why.trim()), { pending: AR ? "جارٍ الإلغاء…" : "Cancelling…", done: AR ? "أُلغي الطلب." : "Order cancelled." }).then(() => onClose()); }}>{AR ? "إلغاء الطلب" : "Cancel order"}</button>
                : <button className="btn btn-ghost btn-sm" onClick={async () => { const r = await window.RevnuSupport.act(() => D.reinstateOrder(order.id), { pending: AR ? "جارٍ الاستعادة…" : "Reinstating…" }); if (r === null) window.RevnuSupport.toast(AR ? "لا يمكن الاستعادة — الوحدة في صفقة أخرى." : "Cannot reinstate — unit is in another live deal.", "err"); onClose(); }}>{AR ? "استعادة الطلب" : "Reinstate"}</button>}
              <DelBtn kind="order" id={order.id} name={order.id} after={onClose} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, v, tone }) {
  const color = tone === "positive" ? "var(--positive, #1f8a5b)" : tone === "warning" ? "var(--warning, #b8860b)" : "var(--text)";
  return (
    <div style={{ padding: "9px 11px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--bg-sunken)" }}>
      <div className="mono soft" style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, marginTop: 3, color }}>{v} <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-soft)" }}>SAR</span></div>
    </div>
  );
}

function SecRow({ k, v }) {
  return (
    <div className="row-between" style={{ padding: "6px 0", borderBottom: "1px dotted var(--line)", fontSize: 13 }}>      <span className="soft">{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}

/* ============================================================
   Platform billing — price book · per-developer plan · invoices
============================================================ */
const INV_STATUS = {
  paid:      { en: "Paid",      ar: "مدفوعة",  bg: "var(--positive-soft, rgba(31,138,91,0.12))", fg: "var(--positive, #1f8a5b)" },
  issued:    { en: "Due",       ar: "مستحقة",  bg: "var(--brand-soft)", fg: "var(--brand-deep, var(--brand))" },
  overdue:   { en: "Overdue",   ar: "متأخرة",  bg: "rgba(232,84,84,0.12)", fg: "#c0492f" },
  scheduled: { en: "Scheduled", ar: "مجدولة",  bg: "var(--bg-sunken)", fg: "var(--text-soft)" },
  waived:    { en: "Waived",    ar: "معفاة",   bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
};
function InvStatus({ s }) { const AR = window.I18N && window.I18N.isAR; const m = INV_STATUS[s] || INV_STATUS.issued; return <span className="chip" style={{ background: m.bg, color: m.fg }}>{AR ? m.ar : m.en}</span>; }
function printInvoice(inv) {
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(D.billingInvoiceHTML(inv, !!(window.I18N && window.I18N.isAR))); w.document.close(); setTimeout(() => w.print(), 300);
}
/* Invoice table shared by the Billing page and the developer Plan tab. */
function InvoiceTable({ invoices, showDev, onChange }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const mark = (inv, paid) => { let patch; if (paid) { const ref = prompt(TL("Transfer reference (optional):", "مرجع التحويل (اختياري):")) ; if (ref === null) return; patch = { status: "paid", paidAt: new Date().toISOString().slice(0, 10), paidRef: ref }; } else patch = { status: null, paidAt: null, paidRef: "" }; window.RevnuSupport.act(() => D.setBillingInvoice(inv.id, patch)).then(() => { if (onChange) onChange(); }); };
  return (
    <div className="card card-flush">
      <table className="tbl">
        <thead><tr><th>{TL("Invoice", "الفاتورة")}</th>{showDev && <th>{TL("Developer", "المطور")}</th>}<th>{TL("Fee", "الرسوم")}</th><th>{TL("Issued", "الإصدار")}</th><th>{TL("Due", "الاستحقاق")}</th><th className="right">{TL("List", "السعر")}</th><th className="right">{TL("Total incl. VAT", "الإجمالي شامل الضريبة")}</th><th>{TL("Status", "الحالة")}</th><th className="right"></th></tr></thead>
        <tbody>
          {invoices.map((inv) => { const dv = D.devById(inv.developerId); return (
            <tr key={inv.id} style={{ opacity: inv.status === "scheduled" ? 0.6 : 1 }}>
              <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{inv.id}</td>
              {showDev && <td>{dv ? (AR ? (dv.nameAr || dv.name) : dv.name) : inv.developerId}</td>}
              <td><div style={{ fontWeight: 500 }}>{AR ? inv.titleAr : inv.title}</div>{inv.bandLabel ? <div className="soft" style={{ fontSize: 11 }}>{D.fmtSAR(inv.units)} {TL("units · band", "وحدة · شريحة")} {inv.bandLabel}</div> : null}{inv.reason ? <div className="soft" style={{ fontSize: 11 }}>{inv.reason}</div> : null}</td>
              <td className="mono" style={{ fontSize: 12 }}>{D.fmtDate(inv.date)}</td>
              <td className="mono" style={{ fontSize: 12 }}>{D.fmtDate(inv.due)}</td>
              <td className="right mono soft" style={{ textDecoration: inv.list !== inv.amount ? "line-through" : "none" }}>{D.fmtSAR(inv.list)}</td>
              <td className="right mono" style={{ fontWeight: 600 }}>{inv.waived ? "0" : D.fmtSAR(inv.total)}</td>
              <td><InvStatus s={inv.status} />{inv.paidAt ? <div className="soft" style={{ fontSize: 10.5 }}>{D.fmtDate(inv.paidAt)}{inv.paidRef ? " · " + inv.paidRef : ""}</div> : null}</td>
              <td className="right"><div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                <button className="btn btn-sm btn-ghost" onClick={() => printInvoice(inv)}>{TL("PDF", "PDF")}</button>
                {(inv.status === "issued" || inv.status === "overdue") && <button className="btn btn-sm btn-primary" onClick={() => mark(inv, true)}>{TL("Mark paid", "تعليم كمدفوعة")}</button>}
                {inv.status === "paid" && <button className="btn btn-sm btn-ghost" onClick={() => mark(inv, false)}>{TL("Undo", "تراجع")}</button>}
              </div></td>
            </tr>); })}
          {invoices.length === 0 && <tr><td colSpan={showDev ? 9 : 8} style={{ textAlign: "center", padding: 26, color: "var(--text-soft)" }}>{TL("No platform invoices.", "لا توجد فواتير منصة.")}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
/* HQ page: price book + every developer's subscription + all invoices. */
function Billing({ onOpenDev }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [, bump] = useState(0); const refresh = () => bump((x) => x + 1);
  const [editBook, setEditBook] = useState(false);
  const [devF, setDevF] = useState("all");
  const [statF, setStatF] = useState("all");
  const pb = D.billingPriceBook();
  const devs = D.DEVELOPERS;
  const all = devs.flatMap((dv) => D.billingInvoicesFor(dv.id));
  const tot = (f) => all.filter(f).reduce((a, i) => a + i.total, 0);
  const rows = all.filter((i) => (devF === "all" || i.developerId === devF) && (statF === "all" || i.status === statF)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const soon = devs.map((dv) => ({ dv, r: D.billingNextRenewal(dv.id) })).filter((x) => x.r && x.r.daysAway <= 60);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{TL("Subscriptions & fees", "الاشتراكات والرسوم")}</h1>
          <p className="page-sub">{TL("What developers pay Revnu for the platform: a one-time onboarding fee that includes the first project, a setup fee for each additional project, and a yearly fee by total units. Order settlements live under Developer payments.", "ما يدفعه المطورون ل Revnu مقابل المنصة: رسوم تأسيس لمرة واحدة تشمل المشروع الأول، ورسوم لكل مشروع إضافي، ورسوم سنوية حسب إجمالي الوحدات. تسويات الطلبات في «مدفوعات المطورين».")}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setEditBook((v) => !v)}>{editBook ? TL("Close price book", "إغلاق قائمة الأسعار") : TL("Price book", "قائمة الأسعار")}</button>
      </div>

      {editBook && <PriceBookEditor onClose={() => { setEditBook(false); refresh(); }} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
        <Stat label={TL("Invoiced", "مفوتر")} value={D.fmtSAR(tot((i) => i.status !== "scheduled" && i.status !== "waived"))} unit="SAR" delta={TL("incl. VAT", "شامل الضريبة")} />
        <Stat label={TL("Collected", "المحصل")} value={D.fmtSAR(tot((i) => i.status === "paid"))} unit="SAR" />
        <Stat label={TL("Outstanding", "المتبقي")} value={D.fmtSAR(tot((i) => i.status === "issued" || i.status === "overdue"))} unit="SAR" delta={all.filter((i) => i.status === "overdue").length + TL(" overdue", " متأخرة")} />
        <Stat label={TL("Waived", "معفى")} value={D.fmtSAR(all.filter((i) => i.waived).reduce((a, i) => a + Math.round(i.list * (1 + (pb.vatPct || 0) / 100)), 0))} unit="SAR" delta={TL("pilots & discounts", "تجارب وخصومات")} />
      </div>

      <div className="card card-pad-lg" style={{ marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{TL("// BY DEVELOPER", "// حسب المطور")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {devs.map((dv) => {
            const s = D.billingSummary(dv.id); const nx = D.billingNextRenewal(dv.id); const units = D.billingUnitsFor(dv.id); const band = D.billingBandFor(units); const plan = D.planFor(dv);
            const waivedAny = ["onboarding", "projectSetup", "annual"].some((k) => plan[k].mode === "waived");
            return (
              <div key={dv.id} className="card card-pad" style={{ cursor: "pointer", outline: devF === dv.id ? "2px solid var(--brand)" : "none" }} onClick={() => setDevF(devF === dv.id ? "all" : dv.id)}>
                <div className="row-between">
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <span style={{ width: 26, height: 26, borderRadius: 6, background: dv.brand.primary, color: dv.brand.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>{dv.initials}</span>
                    <strong style={{ fontSize: 13.5 }}>{AR ? (dv.nameAr || dv.name) : dv.name}</strong>
                  </div>
                  {dv.suspended ? <span className="chip" style={{ background: "rgba(232,84,84,0.12)", color: "#c0492f" }}>{TL("Suspended", "موقوف")}</span> : waivedAny ? <span className="chip chip-soft">{TL("Pilot", "تجريبي")}</span> : null}
                </div>
                <div className="mono soft" style={{ fontSize: 10.5, marginTop: 6 }}>{D.fmtSAR(units)} {TL("UNITS · BAND", "وحدة · شريحة")} {band.label} · {D.fmtSAR(band.fee)}/{TL("yr", "سنة")}</div>
                <div className="row-between" style={{ marginTop: 8 }}><span className="soft" style={{ fontSize: 12 }}>{TL("Outstanding", "المتبقي")}</span><span className="mono" style={{ fontWeight: 700, color: s.overdue > 0 ? "#c0492f" : s.outstanding > 0 ? "var(--warning, #b8860b)" : "var(--positive, #1f8a5b)" }}>{D.fmtSAR(s.outstanding)}</span></div>
                <div className="row-between" style={{ marginTop: 4 }}><span className="soft" style={{ fontSize: 12 }}>{TL("Next renewal", "التجديد القادم")}</span><span className="mono" style={{ fontSize: 12 }}>{nx ? D.fmtDate(nx.date) + (nx.waived ? " · " + TL("waived", "معفى") : " · " + D.fmtSAR(nx.total)) : "—"}</span></div>
                <div className="row" style={{ gap: 6, marginTop: 10 }}><button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); onOpenDev && onOpenDev(dv.id); }}>{TL("Open plan", "فتح الخطة")}</button></div>
              </div>
            );
          })}
        </div>
      </div>

      {soon.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 18, background: "var(--brand-soft)", border: "1px solid var(--line)" }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{TL("// RENEWALS IN THE NEXT 60 DAYS", "// تجديدات خلال 60 يوما")}</div>
          {soon.map(({ dv, r: nx }) => <div key={dv.id} style={{ fontSize: 13, padding: "3px 0" }}><strong>{AR ? (dv.nameAr || dv.name) : dv.name}</strong> · {D.fmtDate(nx.date)} · {D.fmtSAR(nx.units)} {TL("units → band", "وحدة ← شريحة")} {nx.band.label} · {nx.waived ? TL("waived", "معفى") : D.fmtSAR(nx.total) + " SAR " + TL("incl. VAT", "شامل الضريبة")}</div>)}
          <div className="soft" style={{ fontSize: 11, marginTop: 6 }}>{TL("The renewal invoice is generated automatically on the anniversary, at the band the developer is in that day.", "تصدر فاتورة التجديد تلقائيا في الذكرى السنوية وفق الشريحة التي يكون فيها المطور ذلك اليوم.")}</div>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span className="muted" style={{ fontSize: 12 }}>{TL("Status", "الحالة")}</span>
        {["all", "overdue", "issued", "paid", "scheduled", "waived"].map((s) => <button key={s} className={"btn btn-sm " + (statF === s ? "btn-primary" : "btn-secondary")} onClick={() => setStatF(s)}>{s === "all" ? TL("All", "الكل") : (AR ? INV_STATUS[s].ar : INV_STATUS[s].en)}</button>)}
        {devF !== "all" && <button className="btn btn-sm btn-ghost" onClick={() => setDevF("all")}>{TL("Clear developer filter", "إزالة فلتر المطور")}</button>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-soft)" }}>{rows.length} {TL("invoices", "فاتورة")}</span>
      </div>
      <InvoiceTable invoices={rows} showDev onChange={refresh} />
    </>
  );
}
/* Global price book — the only place list prices live. */
function PriceBookEditor({ onClose }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [pb, setPb] = useState(() => JSON.parse(JSON.stringify(D.billingPriceBook())));
  const set = (patch) => setPb((p) => ({ ...p, ...patch }));
  const setBand = (i, patch) => set({ bands: pb.bands.map((b, ix) => ix === i ? { ...b, ...patch } : b) });
  const num = (v) => (v === "" || v == null ? null : Number(v));
  return (
    <div className="card card-pad-lg" style={{ marginBottom: 18 }}>
      <WsCardHead eye="// PRICE BOOK" title={TL("List prices", "الأسعار المعلنة")} sub={TL("Defaults for every developer. Override, discount or waive per developer on their Plan tab — never here.", "الأسعار الافتراضية لكل المطورين. التعديل أو الخصم أو الإعفاء يكون من تبويب «الخطة» لكل مطور — لا هنا.")} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
        <Labeled label={TL("Onboarding fee (SAR, one-time · includes first project)", "رسوم التأسيس (ريال، مرة واحدة · تشمل المشروع الأول)")}><input className="input mono" type="number" step="1000" value={pb.onboardingFee} onChange={(e) => set({ onboardingFee: Number(e.target.value) || 0 })} /></Labeled>
        <Labeled label={TL("Project setup fee (SAR, each additional project)", "رسوم تأسيس المشروع (ريال، لكل مشروع إضافي)")}><input className="input mono" type="number" step="1000" value={pb.projectSetupFee} onChange={(e) => set({ projectSetupFee: Number(e.target.value) || 0 })} /></Labeled>
        <Labeled label={TL("VAT %", "ضريبة القيمة المضافة %")}><input className="input mono" type="number" value={pb.vatPct} onChange={(e) => set({ vatPct: Number(e.target.value) || 0 })} /></Labeled>
        <Labeled label={TL("Payment terms (days)", "مدة السداد (يوم)")}><input className="input mono" type="number" value={pb.dueDays} onChange={(e) => set({ dueDays: Number(e.target.value) || 30 })} /></Labeled>
      </div>
      <div className="eyebrow" style={{ margin: "18px 0 8px" }}>{TL("// ANNUAL PLATFORM FEE · BY TOTAL UNITS", "// رسوم المنصة السنوية · حسب إجمالي الوحدات")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pb.bands.map((b, i) => {
          const lo = i === 0 ? 1 : (Number(pb.bands[i - 1].upTo) || 0) + 1;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr auto", gap: 10, alignItems: "center", padding: "8px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)" }}>
              <span className="mono soft" style={{ fontSize: 12 }}>{TL("from", "من")} {D.fmtSAR(lo)}</span>
              <div className="row" style={{ gap: 6, alignItems: "center" }}><span className="soft" style={{ fontSize: 12 }}>{TL("up to", "إلى")}</span><input className="input mono" style={{ height: 32 }} type="number" placeholder={TL("no limit", "بلا حد")} value={b.upTo == null ? "" : b.upTo} onChange={(e) => setBand(i, { upTo: num(e.target.value) })} disabled={i === pb.bands.length - 1} /></div>
              <div className="row" style={{ gap: 6, alignItems: "center" }}><input className="input mono" style={{ height: 32 }} type="number" step="1000" value={b.fee} onChange={(e) => setBand(i, { fee: Number(e.target.value) || 0 })} /><span className="soft" style={{ fontSize: 12 }}>SAR/{TL("yr", "سنة")}</span></div>
              <button className="btn btn-sm btn-ghost" disabled={pb.bands.length <= 2} onClick={() => set({ bands: pb.bands.filter((_, ix) => ix !== i) })}>✕</button>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button className="btn btn-secondary" onClick={() => { const last = pb.bands[pb.bands.length - 1]; const prev = pb.bands[pb.bands.length - 2]; const nu = { upTo: (Number(prev && prev.upTo) || 0) * 2 || 1000, fee: Math.round(last.fee * 0.8) }; set({ bands: [...pb.bands.slice(0, -1), nu, last] }); }}>＋ {TL("Add band", "إضافة شريحة")}</button>
        <span className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
        <button className="btn btn-primary" onClick={() => { if (hasNegative(pb)) { window.RevnuSupport.toast(negMsg(), "err"); return; } window.RevnuSupport.act(() => D.setBillingPriceBook(pb), { done: TL("Price book saved.", "تم حفظ قائمة الأسعار.") }).then((r) => { if (r !== undefined) onClose(); }); }}>{TL("Save price book", "حفظ الأسعار")}</button>
      </div>
      <div className="soft" style={{ fontSize: 11, marginTop: 8 }}>{TL("Changing list prices affects future invoices and any unpaid invoice that still follows the list price; paid invoices never change.", "تغيير الأسعار يؤثر على الفواتير القادمة وأي فاتورة غير مدفوعة تتبع السعر المعلن؛ الفواتير المدفوعة لا تتغير.")}</div>
    </div>
  );
}
/* Per-developer plan: one editable line per fee, next renewal, invoices, suspend. */
function WsPlan({ dv }) {
  const AR = window.I18N && window.I18N.isAR; const TL = (en, ar) => (AR ? ar : en);
  const [, bump] = useState(0); const refresh = () => bump((x) => x + 1);
  const [plan, setPlan] = useState(() => JSON.parse(JSON.stringify(D.planFor(dv))));
  const [dirty, setDirty] = useState(false);
  const setLine = (k, patch) => { setPlan((p) => ({ ...p, [k]: { ...p[k], ...patch } })); setDirty(true); };
  const pb = D.billingPriceBook(); const units = D.billingUnitsFor(dv.id); const band = D.billingBandFor(units);
  const listOf = { onboarding: pb.onboardingFee, projectSetup: pb.projectSetupFee, annual: band.fee };
  const preview = (k) => D.billingLineAmount({ plan }, k, listOf[k], k === "annual" ? 0 : null);
  const save = () => { const bad = ["onboarding", "projectSetup", "annual"].find((k) => plan[k].mode !== "list" && !(plan[k].reason || "").trim()); if (bad) { alert(TL("Add a reason for every override or waiver — it is logged.", "أضف سببا لكل تعديل أو إعفاء — يسجل.")); return; } if (hasNegative(plan) || ["onboarding", "projectSetup", "annual"].some((k) => Number(plan[k].discountPct) > 100)) { window.RevnuSupport.toast(negMsg(), "err"); return; } window.RevnuSupport.act(() => D.setDeveloperPlan(dv.id, plan), { done: TL("Plan saved.", "تم حفظ الخطة.") }).then((r) => { if (r !== undefined) { setDirty(false); refresh(); } }); };
  const inv = D.billingInvoicesFor(dv.id); const s = D.billingSummary(dv.id); const nx = D.billingNextRenewal(dv.id);
  const projects = D.PROJECTS.filter((p) => p.developerId === dv.id);
  return (
    <>
      <div className="card card-pad-lg" style={{ marginBottom: 16 }}>
        <WsCardHead eye="// PLAN" title={TL("Platform plan", "خطة المنصة")} sub={TL("Three fees, one card. Defaults come from the price book; change a number, add a discount, or waive with a reason. Nothing else is needed for pilots or negotiated deals.", "ثلاث رسوم في بطاقة واحدة. الافتراضي من قائمة الأسعار؛ غير الرقم أو أضف خصما أو أعف مع ذكر السبب. لا يلزم أكثر من ذلك للتجارب أو الصفقات الخاصة.")}
          action={<div className="row" style={{ gap: 8 }}>
            <span className="chip chip-soft">{D.fmtSAR(units)} {TL("units · band", "وحدة · شريحة")} {band.label}</span>
            <button className={"btn btn-sm " + (dv.suspended ? "btn-primary" : "btn-ghost")} onClick={() => { if (dv.suspended) { window.RevnuSupport.act(() => D.patchDeveloper(dv.id, { suspended: false, suspendedReason: "" })).then(refresh); return; } const why = prompt(TL("Reason for suspending portal access (shown to the developer):", "سبب تعليق الوصول (يظهر للمطور):")); if (why == null || !why.trim()) return; window.RevnuSupport.act(() => D.patchDeveloper(dv.id, { suspended: true, suspendedReason: why.trim() })).then(refresh); }}>{dv.suspended ? TL("Restore access", "استعادة الوصول") : TL("Suspend access", "تعليق الوصول")}</button>
          </div>} />
        {dv.suspended && <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: "var(--r-sm)", background: "rgba(232,84,84,0.10)", color: "#c0492f", fontSize: 13 }}>{TL("Portal access is suspended: ", "الوصول إلى البوابة معلق: ")}{dv.suspendedReason}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginTop: 14 }}>
          {D.BILLING_KINDS.map((k) => {
            const ln = plan[k.id]; const pv = preview(k.id);
            return (
              <div key={k.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14, background: ln.mode === "waived" ? "var(--bg-sunken)" : "var(--bg-card)" }}>
                <div className="row-between" style={{ alignItems: "flex-start" }}>
                  <div><div className="row" style={{ gap: 6, alignItems: "center" }}><strong style={{ fontSize: 14 }}>{AR ? k.ar : k.en}</strong><span className="chip chip-soft" style={{ fontSize: 10 }}>{k.cadence === "yearly" ? TL("Yearly", "سنوي") : TL("One-time", "مرة واحدة")}</span></div><div className="soft" style={{ fontSize: 11, marginTop: 2 }}>{AR ? k.cadenceAr : k.cadenceEn}</div></div>
                  <div style={{ textAlign: "end" }}><div className="mono" style={{ fontSize: 16, fontWeight: 700, textDecoration: pv.waived ? "line-through" : "none", color: pv.waived ? "var(--text-soft)" : "var(--text)" }}>{D.fmtSAR(pv.waived ? pv.list : pv.amount)}</div><div className="soft" style={{ fontSize: 10.5 }}>{pv.waived ? TL("waived", "معفى") : pv.amount !== pv.list ? TL("list ", "المعلن ") + D.fmtSAR(pv.list) : TL("list price", "السعر المعلن")}{k.id === "annual" ? " · " + TL("band", "شريحة") + " " + band.label : ""}</div></div>
                </div>
                <div style={{ display: "inline-flex", border: "1px solid var(--line-strong)", borderRadius: 7, overflow: "hidden", margin: "12px 0 10px" }}>
                  {[["list", TL("List", "المعلن")], ["custom", TL("Custom", "مخصص")], ["waived", TL("Waived", "معفى")]].map(([m, lbl], i) => (
                    <button key={m} type="button" onClick={() => setLine(k.id, { mode: m })} style={{ padding: "5px 12px", border: "none", borderInlineStart: i ? "1px solid var(--line-strong)" : "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, background: ln.mode === m ? "var(--brand)" : "transparent", color: ln.mode === m ? "var(--brand-text)" : "var(--text-muted)" }}>{lbl}</button>
                  ))}
                </div>
                {ln.mode === "custom" && <Labeled label={TL("Amount (SAR, ex-VAT)", "المبلغ (ريال، قبل الضريبة)")}><input className="input mono" type="number" step="1000" value={ln.amount == null ? "" : ln.amount} placeholder={String(listOf[k.id])} onChange={(e) => setLine(k.id, { amount: e.target.value === "" ? null : Number(e.target.value) })} /></Labeled>}
                {ln.mode !== "waived" && <div style={{ marginTop: 8 }}><Labeled label={TL("Discount %", "خصم %")}><input className="input mono" type="number" min="0" max="100" value={ln.discountPct || ""} placeholder="0" onChange={(e) => setLine(k.id, { discountPct: Number(e.target.value) || 0 })} /></Labeled></div>}
                {ln.mode === "waived" && k.id === "annual" && <Labeled label={TL("Waive for the first … years (blank = always)", "إعفاء لأول … سنوات (فارغ = دائما)")}><input className="input mono" type="number" min="1" value={ln.waiveYears == null ? "" : ln.waiveYears} placeholder="∞" onChange={(e) => setLine(k.id, { waiveYears: e.target.value === "" ? null : Number(e.target.value) })} /></Labeled>}
                {ln.mode !== "list" || ln.discountPct ? <div style={{ marginTop: 8 }}><Labeled label={TL("Reason (required, logged)", "السبب (إلزامي، يسجل)")}><input className="input" value={ln.reason || ""} placeholder={k.id === "annual" ? TL("e.g. Pilot partner — first-year platform fee waived", "مثال: شريك تجريبي — إعفاء رسوم السنة الأولى") : TL("e.g. Pilot partner — one-time fee waived", "مثال: شريك تجريبي — إعفاء الرسوم لمرة واحدة")} onChange={(e) => setLine(k.id, { reason: e.target.value })} /></Labeled></div> : null}
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <Labeled label={TL("Subscription start", "بداية الاشتراك")}><input className="input mono" type="date" value={plan.startDate || ""} onChange={(e) => { setPlan((p) => ({ ...p, startDate: e.target.value })); setDirty(true); }} /></Labeled>
          <Labeled label={TL("Notes", "ملاحظات")}><input className="input" value={plan.notes || ""} onChange={(e) => { setPlan((p) => ({ ...p, notes: e.target.value })); setDirty(true); }} placeholder={TL("Internal — not printed on invoices", "داخلي — لا يطبع على الفواتير")} /></Labeled>
        </div>
        {dirty && <div className="row" style={{ gap: 8, marginTop: 14 }}><button className="btn btn-primary" onClick={save}>{TL("Save plan", "حفظ الخطة")}</button><button className="btn btn-ghost" onClick={() => { setPlan(JSON.parse(JSON.stringify(D.planFor(dv)))); setDirty(false); }}>{TL("Discard", "تجاهل")}</button><span className="soft" style={{ fontSize: 11, alignSelf: "center" }}>{TL("Unpaid invoices recalculate immediately; paid ones never change.", "الفواتير غير المدفوعة تحدث فورا؛ المدفوعة لا تتغير.")}</span></div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
        <Stat label={TL("Invoiced", "مفوتر")} value={D.fmtSAR(s.invoiced)} unit="SAR" delta={inv.filter((i) => !i.waived && i.status !== "scheduled").length + TL(" invoices", " فاتورة")} />
        <Stat label={TL("Outstanding", "المتبقي")} value={D.fmtSAR(s.outstanding)} unit="SAR" delta={s.overdue ? D.fmtSAR(s.overdue) + TL(" overdue", " متأخرة") : TL("nothing overdue", "لا متأخرات")} />
        <Stat label={TL("Waived so far", "المعفى حتى الآن")} value={D.fmtSAR(s.waived)} unit="SAR" delta={TL("list value incl. VAT", "بالسعر المعلن شامل الضريبة")} />
        <Stat label={TL("Next renewal", "التجديد القادم")} value={nx ? D.fmtDate(nx.date) : "—"} unit="" delta={nx ? (nx.waived ? TL("waived", "معفى") : D.fmtSAR(nx.total) + " SAR · " + TL("band", "شريحة") + " " + nx.band.label) + " · " + projects.length + TL(" project(s)", " مشروع") : ""} />
      </div>
      <InvoiceTable invoices={[...inv].reverse()} onChange={refresh} />
    </>
  );
}

/* ============================================================
   Onboard Wizard — pop-over for adding a new developer tenant
============================================================ */
function OnboardWizard({ onClose, onCreated }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [step, setStep] = useState(0);
  const STEPS = [TL("Company", "الشركة"), TL("Brand", "الهوية"), TL("Subdomain", "النطاق الفرعي"), TL("Confirm", "تأكيد")];
  const slugOf = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const [f, setF] = useState({
    name: "", nameAr: "", legalName: "", legalNameAr: "", crNumber: "", vat: "", city: "Riyadh",
    primaryContact: "", primaryEmail: "",
    primary: "#0E7C66", deep: "#085A4B", tagline: "", taglineAr: "", logoFile: null, logoPreview: null,
    slug: "", slugTouched: false,
    features: { furnishing: true, smartHome: true, operations: true },
    inviteAdmin: true,
  });
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const slug = f.slugTouched ? f.slug : slugOf(f.name);
  const emailOk = !f.primaryEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.primaryEmail.trim());
  const step0Ok = (f.name.trim() || f.nameAr.trim()) && (f.legalName.trim() || f.legalNameAr.trim()) && emailOk && (!f.inviteAdmin || (f.primaryEmail.trim() && f.primaryContact.trim()));
  const slugOk = /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug) && !D.DEVELOPERS.some((d) => d.id === slug);
  const canContinue = step === 0 ? step0Ok : step === 2 ? slugOk : true;
  const soft = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ""); return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},0.10)` : "rgba(74,143,231,0.10)"; };
  const readable = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ""); if (!m) return "#FFFFFF"; const l = 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16); return l > 160 ? "#080B14" : "#FFFFFF"; };
  const onLogo = (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; set({ logoFile: file, logoPreview: URL.createObjectURL(file) }); e.target.value = ""; };

  const provision = () => {
    const RS = window.RevnuSupport;
    const name = (f.name || f.nameAr).trim();
    RS.act(async () => {
      let logo = null;
      if (f.logoFile) logo = await uploadScaled(f.logoFile, 600, "developers/" + slug);
      const dev = await D.createDeveloper({
        id: slug, name, nameAr: f.nameAr.trim() || null,
        legalName: f.legalName.trim() || null, legalNameAr: f.legalNameAr.trim() || null,
        initials: name.slice(0, 1).toUpperCase(), domain: slug + ".revnu.sa",
        crNumber: f.crNumber.trim() || null, vat: f.vat.trim() || null, city: f.city.trim() || null,
        primaryContact: f.primaryContact.trim() || null, primaryEmail: f.primaryEmail.trim().toLowerCase() || null,
        brand: { primary: f.primary, deep: f.deep, soft: soft(f.primary), text: readable(f.primary) },
        logo, logoDark: logo, tagline: f.tagline.trim() || null, taglineAr: f.taglineAr.trim() || null,
        onboarded: new Date().toISOString().slice(0, 10),
        masterAgreement: { defaultFeatures: { ...f.features, fitout: false } },
      });
      let admin = null;
      if (f.inviteAdmin && f.primaryEmail.trim()) {
        admin = await D.createDevUser({ name: f.primaryContact.trim(), email: f.primaryEmail.trim().toLowerCase(), role: "developer_admin", roleAr: "مدير المطوّر", perms: null, developerId: dev.id, assignedProjectIds: [] });
      }
      return { dev, admin };
    }, { pending: TL("Provisioning the partner…", "جارٍ تجهيز حساب الشريك…"), done: TL("Partner created.", "أُنشئ حساب الشريك.") }).then((r) => {
      if (!r) return;
      if (r.admin) RS.showCredentials({ name: r.admin.name, email: r.admin.email, password: r.admin._tempPassword });
      onCreated ? onCreated(r.dev.id) : onClose();
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.36)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "100vw", maxHeight: "94vh", overflow: "auto", background: "var(--bg-card)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-pop)" }}>
        <div style={{ padding: "20px 26px", borderBottom: "1px solid var(--line)" }}>
          <div className="eyebrow">{TT("// ONBOARD A NEW DEVELOPER")}</div>
          <div className="display-sm" style={{ marginTop: 2 }}>{STEPS[step]}</div>
          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            {STEPS.map((s, i) => (
              <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--brand)" : "var(--bg-tint)" }} />
            ))}
          </div>
        </div>
        <div style={{ padding: 26 }}>
          {step === 0 && (
            <div className="stack-md">
              <BiField label={TL("BRAND / DISPLAY NAME", "الاسم التجاري")} en={f.name} ar={f.nameAr} onEn={(v) => set({ name: v })} onAr={(v) => set({ nameAr: v })} placeholder="Aravan" placeholderAr="أرافان" />
              <BiField label={TT("LEGAL NAME")} en={f.legalName} ar={f.legalNameAr} onEn={(v) => set({ legalName: v })} onAr={(v) => set({ legalNameAr: v })} placeholder="Aravan Real Estate" placeholderAr="أرافان العقارية" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Labeled label={TL("CR Number", "رقم السجل التجاري")}><input className="input mono" placeholder="CR 10xxxxxxxx" value={f.crNumber} onChange={(e) => set({ crNumber: e.target.value })} /></Labeled>
                <Labeled label={TL("VAT", "الرقم الضريبي")}><input className="input mono" placeholder="3xxxxxxxxxxxxxx" value={f.vat} onChange={(e) => set({ vat: e.target.value })} /></Labeled>
              </div>
              <Labeled label={TL("City", "المدينة")}><input className="input" value={f.city} onChange={(e) => set({ city: e.target.value })} /></Labeled>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Labeled label={TL("Primary contact", "جهة الاتصال الرئيسية")}><input className="input" placeholder="Sami Al-Ghamdi" value={f.primaryContact} onChange={(e) => set({ primaryContact: e.target.value })} /></Labeled>
                <Labeled label={TL("Email", "البريد")}><input className="input" placeholder="sami@aravan.sa" value={f.primaryEmail} onChange={(e) => set({ primaryEmail: e.target.value })} style={{ direction: "ltr" }} /></Labeled>
              </div>
              <label className="row" style={{ gap: 8, fontSize: 13 }}><input type="checkbox" checked={f.inviteAdmin} onChange={(e) => set({ inviteAdmin: e.target.checked })} /> {TL("Create the primary contact's Developer Admin account now (you'll get a one-time temporary password to share).", "إنشاء حساب مدير المطوّر لجهة الاتصال الآن (ستحصل على كلمة مرور مؤقتة لمشاركتها).")}</label>
              {!emailOk && <div className="soft" style={{ fontSize: 11.5, color: "#c0492f" }}>{TL("Enter a valid email.", "أدخل بريدًا صحيحًا.")}</div>}
            </div>
          )}
          {step === 1 && (
            <div className="stack-md">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Labeled label={TL("Brand primary color", "اللون الأساسي")}><div className="row" style={{ gap: 8 }}><input type="color" value={f.primary} onChange={(e) => set({ primary: e.target.value })} style={{ width: 38, height: 38, border: "1px solid var(--line-strong)", borderRadius: 8, padding: 2, background: "transparent" }} /><input className="input mono" value={f.primary} onChange={(e) => set({ primary: e.target.value })} /></div></Labeled>
                <Labeled label={TL("Brand deep / hover", "اللون الداكن")}><div className="row" style={{ gap: 8 }}><input type="color" value={f.deep} onChange={(e) => set({ deep: e.target.value })} style={{ width: 38, height: 38, border: "1px solid var(--line-strong)", borderRadius: 8, padding: 2, background: "transparent" }} /><input className="input mono" value={f.deep} onChange={(e) => set({ deep: e.target.value })} /></div></Labeled>
              </div>
              <BiField label={TL("TAGLINE", "الشعار النصي")} en={f.tagline} ar={f.taglineAr} onEn={(v) => set({ tagline: v })} onAr={(v) => set({ taglineAr: v })} placeholder="A short brand line" placeholderAr="عبارة قصيرة" />
              <Labeled label={TL("Logo", "الشعار")}>
                <div style={{ padding: 18, border: "1px dashed var(--line-strong)", borderRadius: "var(--r-md)", textAlign: "center", color: "var(--text-soft)", fontSize: 12.5, background: f.logoPreview ? f.primary : "transparent" }}>
                  {f.logoPreview ? <img src={f.logoPreview} alt="" style={{ height: 34, display: "inline-block" }} /> : TL("SVG / PNG on a transparent background", "SVG / PNG بخلفية شفافة")}
                  <label className="btn btn-sm btn-secondary" style={{ marginInlineStart: 8, cursor: "pointer" }}>{f.logoPreview ? TL("Replace", "استبدال") : TL("Choose file", "اختيار ملف")}<input type="file" accept="image/*" style={{ display: "none" }} onChange={onLogo} /></label>
                </div>
              </Labeled>
              <div className="card card-pad" style={{ background: f.primary, color: readable(f.primary), borderRadius: "var(--r-md)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{f.name || f.nameAr || "Brand"}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{f.tagline || TL("Preview of the sidebar accent and sign-in page", "معاينة لون الواجهة وصفحة الدخول")}</div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="stack-md">
              <Labeled label={TL("Subdomain", "النطاق الفرعي")}>
                <div className="row" style={{ gap: 0, direction: "ltr" }}>
                  <input className="input mono" placeholder="aravan" value={slug} onChange={(e) => set({ slug: slugOf(e.target.value), slugTouched: true })} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }} />
                  <span className="mono" style={{ padding: "0 12px", height: 38, display: "inline-flex", alignItems: "center", background: "var(--bg-tint)", border: "1px solid var(--line-strong)", borderLeft: 0, borderTopRightRadius: "var(--r-sm)", borderBottomRightRadius: "var(--r-sm)", fontSize: 12 }}>.revnu.sa</span>
                </div>
                {!slugOk && <div className="soft" style={{ fontSize: 11.5, color: "#c0492f", marginTop: 6 }}>{D.DEVELOPERS.some((d) => d.id === slug) ? TL("This subdomain is already taken.", "هذا النطاق الفرعي مستخدم مسبقًا.") : TL("Letters, numbers and dashes only (2–40 characters).", "أحرف وأرقام وشرطات فقط (2–40 حرفًا).")}</div>}
              </Labeled>
              <Labeled label={TL("Default feature set", "الميزات الافتراضية")}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {[["furnishing", TL("Furnishing", "التأثيث")], ["smartHome", TL("Smart home", "المنزل الذكي")], ["operations", TL("Operations", "التشغيل")]].map(([k, label]) => (
                    <label key={k} className="row" style={{ gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={!!f.features[k]} onChange={(e) => set({ features: { ...f.features, [k]: e.target.checked } })} /> {label}
                    </label>
                  ))}
                </div>
              </Labeled>
              <p className="muted" style={{ fontSize: 12.5 }}>{TL("These become the defaults for the developer's new projects. You can override them per project after onboarding.", "تصبح هذه افتراضيات المشاريع الجديدة للمطوّر، ويمكن تعديلها لكل مشروع بعد التسجيل.")}</p>
            </div>
          )}
          {step === 3 && (
            <div className="stack-md">
              <p style={{ margin: 0 }}>{TL("Once you confirm, the partner is created with empty designs / packages / payments / operations / contracts. Configure them inside the developer's workspace.", "بعد التأكيد يُنشأ الشريك بكتالوج فارغ (تصاميم / باقات / مدفوعات / تشغيل / عقود). جهّزها من مساحة عمل المطوّر.")}</p>
              <div className="card card-pad" style={{ background: "var(--bg-sunken)" }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>{TT("READY TO PROVISION")}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                  <div><strong>{f.name || f.nameAr}</strong> · {f.legalName || f.legalNameAr}</div>
                  <div className="mono" style={{ fontSize: 12 }}>{slug}.revnu.sa</div>
                  {f.inviteAdmin && f.primaryEmail && <div>{TL("Developer Admin: ", "مدير المطوّر: ")}{f.primaryContact} · <span className="mono" style={{ fontSize: 12 }}>{f.primaryEmail}</span></div>}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="row-between" style={{ padding: "14px 26px", borderTop: "1px solid var(--line)" }}>
          <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          <div className="row" style={{ gap: 8 }}>
            {step > 0 && <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>{TL("Back", "رجوع")}</button>}
            {step < STEPS.length - 1 && <button className="btn btn-primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>{TL("Continue →", "متابعة ←")}</button>}
            {step === STEPS.length - 1 && <button className="btn btn-primary" disabled={!slugOk} onClick={provision}>{TL("Provision partner", "إنشاء الشريك")}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ProjectWorkspace — per-project configuration (designs, packages,
   smart, payments, ops, contracts, units, settings).
============================================================ */
function ProjectWorkspace({ dv, projectId, onBackToDev, onBackToList }) {
  const P = D.scopedToProject(projectId);
  const [tab, setTab] = useState("settings");
  const [, bumpWs] = useState(0);
  if (!P) return <div className="card card-pad">Project not found.</div>;

  const TABS = [
    { id: "settings",  label: "Settings" },
    { id: "units",     label: "Units" },
    { id: "types",     label: "Unit types" },
    { id: "designs",   label: "Designs" },
    { id: "packages",  label: "Packages" },
    { id: "smart",     label: "Smart home" },
    { id: "kitchens",  label: "Kitchens" },
    { id: "cooling",   label: "Cooling / AC" },
    { id: "flooring",  label: "Flooring" },
    { id: "layout",    label: "Layout" },
    { id: "ops",       label: "Operations" },
    { id: "contracts", label: "Agreement" },
  ];

  return (
    <>
      <div className="row" style={{ marginBottom: 14, gap: 6 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBackToList}>← All developers</button>
        <span className="soft">/</span>
        <button className="btn btn-ghost btn-sm" onClick={onBackToDev}>{dv.name}</button>
        <span className="soft">/</span>
        <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>{P.project.name}</span>
      </div>

      <div className="card card-pad-lg" style={{ marginBottom: 16, background: "linear-gradient(135deg, " + dv.brand.primary + " 0%, " + dv.brand.deep + " 100%)", color: "#fff", border: 0 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.12em", opacity: 0.8 }}>// {dv.name.toUpperCase()} · {window.I18N && window.I18N.isAR ? "مشروع" : "PROJECT"}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.012em", marginTop: 2 }}>{P.project.name}</div>
            <div className="mono" style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>{P.project.city} · {window.I18N && window.I18N.isAR ? "التسليم" : "delivers"} {P.project.delivery}</div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {Object.entries(P.project.features || {}).filter(([k, v]) => v && k !== "paymentPlans").map(([k]) => (
              <span key={k} className="chip" style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }}>{({ remote: ["Remote ordering", "الطلب عن بعد"], furnishing: ["Furnishing", "التأثيث"], smartHome: ["Smart home", "المنزل الذكي"], kitchens: ["Kitchens", "المطابخ"], cooling: ["Cooling / AC", "التكييف"], flooring: ["Flooring", "الأرضيات"], layout: ["Layout changes", "تعديلات المخطط"], operations: ["Operations", "التشغيل"], fitout: ["Fit-out", "التشطيب"], paymentPlans: ["Payment plans", "خطط الدفع"] }[k] || [k, k])[window.I18N && window.I18N.isAR ? 1 : 0]}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} className={"tab " + (tab === t.id ? "active" : "")} onClick={() => setTab(t.id)}>{TT(t.label)}</button>
        ))}
      </div>

      {tab === "settings"  && <PwSettings  P={P} onSaved={() => bumpWs((x) => x + 1)} />}
      {tab === "units"     && <PwUnits     P={P} />}
      {tab === "types"     && <PwUnitTypes P={P} />}
      {tab === "designs"   && <WsDesigns   T={P} />}
      {tab === "packages"  && <WsPackages  T={P} />}
      {tab === "smart"     && <WsSmart     T={P} />}
      {tab === "kitchens"  && <WsKitchens  T={P} />}
      {tab === "cooling"   && <WsCooling   T={P} />}
      {tab === "flooring"  && <WsFlooring  T={P} />}
      {tab === "layout"    && <WsLayout    T={P} />}
      {tab === "ops"       && <WsOps       T={P} />}
      {tab === "contracts" && <WsContracts dv={dv} T={P} />}
    </>
  );
}

function PwSettings({ P, onSaved }) {
  const AR = window.I18N && window.I18N.isAR;
  const [name, setName]         = useState(P.project.name);
  const [nameAr, setNameAr]     = useState(P.project.nameAr || "");
  const [city, setCity]         = useState(P.project.city);
  const [delivery, setDelivery] = useState(P.project.delivery);
  const [totalUnits, setTotalUnits] = useState(P.project.totalUnits || 0);
  const c = P.project.commercials || { customerOpsFeePct: 0, developerOpsSharePct: 0, salesCommission: { kind: "pct", value: 0 }, contractMarkup: { kind: "pct", value: 0 } };
  const [custFee, setCustFee]     = useState(c.customerOpsFeePct);
  const [devShare, setDevShare]   = useState(c.developerOpsSharePct);
  const [salesKind, setSalesKind] = useState(c.salesCommission.kind);
  const [salesVal,  setSalesVal]  = useState(c.salesCommission.value);
  const [markKind, setMarkKind]   = useState(c.contractMarkup.kind);
  const [markVal,  setMarkVal]    = useState(c.contractMarkup.value);
  const [saved, setSaved] = useState(true);
  const dirty = () => setSaved(false);
  const save = () => {
    window.RevnuSupport.act(() => D.setProjectInfo(P.project.id, {
      name: name.trim() || P.project.name,
      nameAr: nameAr.trim(),
      city, delivery,
      totalUnits: Number(totalUnits) || 0,
      commercials: {
        customerOpsFeePct: Number(custFee) || 0,
        developerOpsSharePct: Number(devShare) || 0,
        salesCommission: { kind: salesKind, value: Number(salesVal) || 0 },
        contractMarkup: { kind: markKind, value: Number(markVal) || 0 },
      },
    }), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ إعدادات المشروع." : "Project settings saved." }).then((r) => { if (r !== undefined) { setSaved(true); onSaved && onSaved(); } });
    setSaved(true);
    onSaved && onSaved();
  };
  const discard = () => {
    setName(P.project.name); setNameAr(P.project.nameAr || ""); setCity(P.project.city);
    setDelivery(P.project.delivery); setTotalUnits(P.project.totalUnits || 0);
    setCustFee(c.customerOpsFeePct); setDevShare(c.developerOpsSharePct);
    setSalesKind(c.salesCommission.kind); setSalesVal(c.salesCommission.value);
    setMarkKind(c.contractMarkup.kind); setMarkVal(c.contractMarkup.value);
    setSaved(true);
  };
  return (
    <>
      <WsCardHead eye="// PROJECT SETTINGS" title="Project details, commercials & features"
        sub="Per-project commercials — the two-part operating fee, the sales commission, and the contract markup." />
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }}>
        <div className="card card-pad-lg">
          <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("BASIC INFO")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Project name"><input className="input" value={name} onChange={(e) => { setName(e.target.value); dirty(); }} /></Labeled>
            <Labeled label="اسم المشروع (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={nameAr} placeholder="الاسم بالعربية" onChange={(e) => { setNameAr(e.target.value); dirty(); }} /></Labeled>
            <Labeled label="City"><input className="input" value={city} onChange={(e) => { setCity(e.target.value); dirty(); }} /></Labeled>
            <Labeled label="Delivery"><input className="input" value={delivery} onChange={(e) => { setDelivery(e.target.value); dirty(); }} /></Labeled>
            <Labeled label="Total units"><input className="input mono" type="number" value={totalUnits} onChange={(e) => { setTotalUnits(Number(e.target.value)); dirty(); }} /></Labeled>
          </div>
          <hr className="hr-thin" style={{ margin: "18px 0" }} />
          <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("OPERATING FEE · TWO-PART")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Operating cut from customer (Revnu, gross %)">
              <div className="row" style={{ gap: 6 }}>
                <input className="input mono" type="number" step="0.5" value={custFee} onChange={(e) => { setCustFee(Number(e.target.value)); dirty(); }} />
                <span className="muted">%</span>
              </div>
              <div className="soft" style={{ fontSize: 11, marginTop: 4 }}>Shown to the buyer in the PM contract.</div>
            </Labeled>
            <Labeled label="Operating cut back to developer (% of operator gross)">
              <div className="row" style={{ gap: 6 }}>
                <input className="input mono" type="number" step="0.5" value={devShare} onChange={(e) => { setDevShare(Number(e.target.value)); dirty(); }} />
                <span className="muted">%</span>
              </div>
              <div className="soft" style={{ fontSize: 11, marginTop: 4 }}>Developer's slice of the operator's gross. Not shown to the buyer.</div>
            </Labeled>
          </div>
          <hr className="hr-thin" style={{ margin: "18px 0" }} />
          <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("SALES COMMISSION & MARKUP")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Sales commission">
              <AmountOrPct kind={salesKind} value={salesVal} onKind={(k) => { setSalesKind(k); dirty(); }} onValue={(v) => { setSalesVal(v); dirty(); }} />
              <div className="soft" style={{ fontSize: 11, marginTop: 4 }}>{window.I18N && window.I18N.isAR ? "لكل صفقة — % من قيمة الإضافات بدون ضريبة القيمة المضافة، أو مبلغ ثابت. تقسم على الفريق حسب سلم العمولة." : "Per deal — % of the extras' ex-VAT value, or a flat amount. Split across the team by the commission ladder."}</div>
            </Labeled>
            <Labeled label="Contract markup (developer)">
              <AmountOrPct kind={markKind} value={markVal} onKind={(k) => { setMarkKind(k); dirty(); }} onValue={(v) => { setMarkVal(v); dirty(); }} />
              <div className="soft" style={{ fontSize: 11, marginTop: 4 }}>Added on top of the buyer's total — earned by the developer.</div>
            </Labeled>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 18, alignItems: "center" }}>
            <button className={"btn " + (saved ? "btn-secondary" : "btn-primary")} onClick={save}>{saved ? (AR ? "✓ محفوظ" : "✓ Saved") : (AR ? "حفظ" : "Save")}</button>
            <button className="btn btn-ghost" onClick={discard}>{window.I18N?window.I18N.t("Discard"):"Discard"}</button>
          </div>
        </div>
        <div className="card card-pad-lg">
          <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("FEATURES & SKIP RULES")}</div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: 12.5 }}>{window.I18N && window.I18N.isAR ? "أوقف ميزة لإزالتها من رحلة المشتري بالكامل. للميزات المفعلة، حدد ما إذا كان مندوب المطور يستطيع تخطيها لكل عملية بيع (اختياري) أو يجب تضمينها دائما (إلزامي)." : <>Toggle a feature off to remove it from the buyer journey entirely. For features that stay on, decide whether the developer's rep may <strong>skip</strong> it per sale (Optional) or must always include it (Mandatory).</>}</p>
          <div className="stack-sm">
            {[
              { id: "furnishing",   label: "Furnishing",    hint: "Design + package + smart steps" },
              { id: "fitout",       label: "Fit-out",       hint: "Turnkey fit-out add-on per package" },
              { id: "smartHome",    label: "Smart home",    hint: "Smart-home tier sub-step" },
              { id: "kitchens",     label: "Kitchens",      hint: "3 designs × 3 palettes · cabinets or full kitchen" },
              { id: "cooling",      label: "Cooling / AC",  hint: "AC by brand · priced per cooling point" },
              { id: "flooring",     label: "Flooring",      hint: "Finishes by zone · priced per m²" },
              { id: "layout",       label: "Layout changes", hint: "Walls & doors · pre-approved per unit type" },
                  { id: "remote",       label: "Remote ordering", hint: "WhatsApp link · rep confirms · e-sign on the buyer's phone" },
              { id: "operations",   label: "Operations",    hint: "Ops + calculator + PM contract" },
            ].map((opt) => <FeatureRow key={opt.id} project={P.project} opt={opt} />)}
          </div>
        </div>
      </div>
      <PwPayment P={P} />
    </>
  );
}

// Where the buyer pays after signing — shown on the buyer's signed screen, in the "signed" e-mail and in the rep's
// WhatsApp. Empty = no payment block (the buyer is told the rep sends the details).
function PwPayment({ P }) {
  const AR = window.I18N && window.I18N.isAR; const L = (en, ar) => (AR ? ar : en);
  const pd = P.project.paymentDetails || {};
  const initial = () => ({ bankName: pd.bankName || "", bankNameAr: pd.bankNameAr || "", accountName: pd.accountName || "", iban: pd.iban || "",
    firstPct: pd.firstPct != null ? String(pd.firstPct) : "", dueDays: pd.dueDays != null ? String(pd.dueDays) : "", note: pd.note || "", noteAr: pd.noteAr || "" });
  const [f, setF] = useState(initial); const [saved, setSaved] = useState(true); const [err, setErr] = useState(null);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setSaved(false); };
  const save = () => {
    setErr(null);
    const iban = f.iban.trim(); const any = Object.values(f).some((v) => String(v).trim());   // the IBAN / account number is kept as entered (any bank's format)
    const pct = f.firstPct.trim() === "" ? null : Number(f.firstPct); const days = f.dueDays.trim() === "" ? null : Number(f.dueDays);
    if (any) {
      if (!iban) return setErr(L("Enter the IBAN or account number.", "أدخل رقم الآيبان أو رقم الحساب."));
      if (!f.bankName.trim() && !f.bankNameAr.trim()) return setErr(L("Enter the bank's name.", "أدخل اسم البنك."));
      if (!f.accountName.trim()) return setErr(L("Enter the account holder's name.", "أدخل اسم صاحب الحساب."));
      if (pct != null && !(pct >= 0 && pct <= 100)) return setErr(L("The first payment is a percentage between 0 and 100.", "الدفعة الأولى نسبة بين 0 و100."));
      if (days != null && !(Number.isInteger(days) && days >= 1 && days <= 365)) return setErr(L("Days to pay: a whole number from 1 to 365.", "مدة السداد: عدد أيام صحيح من 1 إلى 365."));
    }
    const value = any ? { bankName: f.bankName.trim(), bankNameAr: f.bankNameAr.trim(), accountName: f.accountName.trim(), iban, firstPct: pct, dueDays: days, note: f.note.trim(), noteAr: f.noteAr.trim() } : null;
    window.RevnuSupport.act(() => D.setProjectInfo(P.project.id, { paymentDetails: value }), { done: L("Payment details saved.", "تم حفظ تفاصيل الدفع.") })
      .then((r) => { if (r !== undefined) setSaved(true); });
  };
  const pctN = Number(f.firstPct) || 0;
  return (
    <div className="card card-pad-lg" style={{ marginTop: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{L("PAYMENT AFTER SIGNING", "الدفع بعد التوقيع")}</div>
      <p className="muted" style={{ margin: "0 0 14px", fontSize: 12.5 }}>{L("Where buyers send the first payment. The moment a buyer signs, these details appear on their phone, go out in the \"signed\" e-mail, and fill the rep's one-tap WhatsApp message. The order number is the transfer reference.", "الحساب الذي يحول إليه المشتري الدفعة الأولى. بمجرد توقيع المشتري تظهر هذه التفاصيل على جواله، وترسل في بريد التوقيع، وتملأ رسالة واتساب التي يرسلها المندوب بضغطة واحدة. رقم الطلب هو مرجع التحويل.")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Labeled label={L("Bank name", "اسم البنك")}><input className="input" value={f.bankName} placeholder="e.g. Al Rajhi Bank" onChange={set("bankName")} /></Labeled>
        <Labeled label={L("Bank name (Arabic)", "اسم البنك (عربي)")}><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={f.bankNameAr} placeholder="مثال: مصرف الراجحي" onChange={set("bankNameAr")} /></Labeled>
        <Labeled label={L("Account holder", "اسم صاحب الحساب")}><input className="input" value={f.accountName} placeholder={L("As printed on the bank account", "كما يظهر في الحساب البنكي")} onChange={set("accountName")} /></Labeled>
        <Labeled label="IBAN"><input className="input mono" dir="ltr" value={f.iban} placeholder="SA00 0000 0000 0000 0000 0000" onChange={set("iban")} /></Labeled>
        <Labeled label={L("First payment (% of the order total)", "الدفعة الأولى (% من إجمالي الطلب)")}>
          <div className="row" style={{ gap: 6 }}><input className="input mono" type="number" min="0" max="100" step="0.5" value={f.firstPct} placeholder={L("optional", "اختياري")} onChange={set("firstPct")} /><span className="muted">%</span></div>
          <div className="soft" style={{ fontSize: 11, marginTop: 4 }}>{pctN > 0 ? L("On a SAR 1,000,000 order: SAR " + D.fmtSAR(Math.round(1000000 * pctN / 100)) + ".", "لطلب بقيمة 1,000,000 ريال: " + D.fmtSAR(Math.round(1000000 * pctN / 100)) + " ريال.") : L("Leave empty to show no amount.", "اتركه فارغا لعدم عرض مبلغ.")}</div>
        </Labeled>
        <Labeled label={L("Pay within (days)", "السداد خلال (أيام)")}><input className="input mono" type="number" min="1" max="365" step="1" value={f.dueDays} placeholder={L("optional", "اختياري")} onChange={set("dueDays")} /></Labeled>
        <Labeled label={L("Note to the buyer", "ملاحظة للمشتري")}><input className="input" value={f.note} placeholder="e.g. Send the transfer receipt to your sales rep." onChange={set("note")} /></Labeled>
        <Labeled label={L("Note to the buyer (Arabic)", "ملاحظة للمشتري (عربي)")}><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={f.noteAr} placeholder="مثال: أرسل إيصال التحويل إلى مندوب المبيعات." onChange={set("noteAr")} /></Labeled>
      </div>
      {err && <p style={{ color: "var(--negative, #c0492f)", fontSize: 12.5, margin: "12px 0 0" }}>{err}</p>}
      <div className="row" style={{ gap: 8, marginTop: 18, alignItems: "center" }}>
        <button className={"btn " + (saved ? "btn-secondary" : "btn-primary")} onClick={save}>{saved ? (AR ? "✓ محفوظ" : "✓ Saved") : (AR ? "حفظ" : "Save")}</button>
        <button className="btn btn-ghost" onClick={() => { setF(initial()); setSaved(true); setErr(null); }}>{window.I18N ? window.I18N.t("Discard") : "Discard"}</button>
      </div>
    </div>
  );
}

// Scale in the browser (as before), then store in the public media bucket instead of the row itself.
// No negative prices, sizes or rates anywhere in a catalogue payload (rows store the JSON as given).
const hasNegative = (x) => (Array.isArray(x) ? x.some(hasNegative) : (x && typeof x === "object") ? Object.values(x).some(hasNegative) : (typeof x === "number" && x < 0));
const negMsg = () => ((window.I18N && window.I18N.isAR) ? "لا يمكن أن تكون الأسعار أو القيم سالبة." : "Prices and values can't be negative.");
async function uploadScaled(file, maxW, folder, keepAlpha) {
  const dataUrl = await fileToScaledDataURL(file, maxW, keepAlpha);
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const name = (file.name || "image").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40);
  const path = folder + "/" + name + "-" + Date.now().toString(36) + "." + ext;
  return D.uploadMedia(new File([blob], name + "." + ext, { type: blob.type }), path);
}
const newId = (projectId, kind) => (projectId || "x") + "-" + kind + "-" + Date.now().toString(36).slice(-5);
function fileToScaledDataURL(file, maxW, keepAlpha) {
  maxW = maxW || 1400;
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        let w = im.naturalWidth, h = im.naturalHeight;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const cx = c.getContext("2d");
        if (!keepAlpha) { cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); }
        cx.drawImage(im, 0, 0, w, h);
        res(keepAlpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.85));
      };
      im.onerror = rej; im.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

function TypeMediaSlot({ typeId, field, label, hint, img, onChange, ratio, fit }) {
  const inputRef = React.useRef(null);
  const [busy, setBusy] = useState(false);
  const AR = window.I18N && window.I18N.isAR;
  const pick = () => inputRef.current && inputRef.current.click();
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setBusy(true);
    await window.RevnuSupport.act(async () => { const url = await uploadScaled(f, 1600, "unit-types/" + typeId); await D.setTypeMedia(typeId, { [field]: url }); }, { pending: (window.I18N && window.I18N.isAR) ? "جارٍ رفع الصورة…" : "Uploading image…" });
    onChange();
    setBusy(false);
    e.target.value = "";
  };
  const remove = () => { window.RevnuSupport.act(() => D.setTypeMedia(typeId, { [field]: "" })).then(() => onChange()); };
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div onClick={pick} title="Click to upload" style={{ cursor: "pointer", border: "1px dashed var(--line-strong)", borderRadius: "var(--r-sm)", aspectRatio: ratio || "16 / 10", background: "var(--bg-sunken)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {img ? <img src={img} alt={label} style={{ width: "100%", height: "100%", objectFit: fit || "cover" }} />
             : <span className="soft" style={{ fontSize: 11.5, textAlign: "center", padding: "0 12px", lineHeight: 1.5 }}>{busy ? "Uploading…" : hint}<br/>{!busy && (AR ? "نسبة " + (ratio || "16:10") : "ratio " + (ratio || "16:10"))}</span>}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button className="btn btn-sm btn-secondary" onClick={pick}>{img ? "Replace" : "Upload"}</button>
        {img && <button className="btn btn-sm btn-ghost" onClick={remove}>Remove</button>}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
      </div>
    </div>
  );
}

function PwUnitTypes({ P }) {
  const [, setV] = useState(0);
  const bump = () => setV((x) => x + 1);
  const [editing, setEditing] = useState(null);
  const AR = window.I18N && window.I18N.isAR;
  const types = P.unitTypes;
  return (
    <>
      <div className="row-between" style={{ marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <WsCardHead eye="// UNIT TYPES" title={AR ? "أنواع الوحدات — التعريف والوسائط" : "Unit types — definition & media"}
          sub={AR ? "عرف كل نوع (بالعربية والإنجليزية) وارفع وسائطه مرة واحدة. يرتبط بكل وحدة من هذا النوع ويظهر في اتفاقية المشتري." : "Define each type (Arabic + English) and upload its media once. It links to every unit of that type and prints into the buyer's agreement."} />
        <button className="btn btn-primary" onClick={() => setEditing({ _new: true, projectId: P.project.id, name: "", nameAr: "", bedrooms: 1, baths: 1, area: 0, basePrice: 0 })}>{AR ? "+ إضافة نوع وحدة" : "+ Add unit type"}</button>
      </div>
      <div className="stack-md">
        {types.map((t) => (
          <div key={t.id} className="card card-pad-lg">
            <div className="row-between" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ fontSize: 15 }}>{(AR && t.nameAr) ? t.nameAr : t.name}</strong>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {t.bedrooms} {AR ? "غرفة" : "bed"} · {t.baths} {AR ? "حمام" : "bath"} · {t.area} m²{window.unitLevels && window.unitLevels(t) > 1 ? " · " + window.unitLevels(t) + (AR ? " طوابق" : "-storey") : ""} · {AR ? "الأساس" : "base"} {D.fmtSAR(t.basePrice)} SAR
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="chip mono">{P.units.filter((u) => u.typeId === t.id).length} {AR ? "وحدة مرتبطة" : "units linked"}</span>
                <button className="btn btn-sm btn-secondary" onClick={() => setEditing({ ...t })}>{AR ? "تعديل" : "Edit"}</button>
                <DelBtn kind="unitType" id={t.id} name={t.name} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <TypeMediaSlot typeId={t.id} field="render3dImg"  label="3D RENDER"            hint="Visual of this unit type" img={t.render3dImg}  onChange={bump} ratio="16 / 10" fit="cover" />
              <TypeMediaSlot typeId={t.id} field="floorPlanImg" label="FLOOR PLAN"           hint="Replaces the auto-drawn plan" img={t.floorPlanImg} onChange={bump} ratio="4 / 3" fit="contain" />
              <TypeMediaSlot typeId={t.id} field="masterplanImg" label="MASTERPLAN · LOCATION" hint="Site plan marking this unit" img={t.masterplanImg} onChange={bump} ratio="16 / 9" fit="cover" />
            </div>
          </div>
        ))}
        {types.length === 0 && <div className="card card-pad muted" style={{ textAlign: "center" }}>{AR ? "لا توجد أنواع وحدات لهذا المشروع بعد. أضف أول نوع." : "No unit types yet. Add the first one."}</div>}
      </div>
      {editing && <TypeEditDrawer type={editing} onClose={() => { setEditing(null); bump(); }} />}
    </>
  );
}

// Single-field bilingual input with an in-field EN/ع toggle.
function BiField({ label, en, ar, onEn, onAr, placeholder, placeholderAr, textarea }) {
  const [lang, setLang] = useState(window.I18N && window.I18N.isAR ? "ar" : "en");
  const Tag = textarea ? "textarea" : "input";
  const isAr = lang === "ar";
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>}
      <div style={{ position: "relative" }} dir={isAr ? "rtl" : "ltr"}>
        <Tag className="input" dir={isAr ? "rtl" : "ltr"}
          value={(isAr ? ar : en) || ""}
          placeholder={isAr ? (placeholderAr || "") : (placeholder || "")}
          onChange={(e) => (isAr ? onAr : onEn)(e.target.value)}
          style={Object.assign({ fontFamily: isAr ? "var(--font-ar)" : "inherit", paddingInlineEnd: 54 }, textarea ? { minHeight: 56 } : {})} />
        <button type="button" onClick={() => setLang(isAr ? "en" : "ar")}
          title={isAr ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}
          style={{ position: "absolute", insetInlineEnd: 6, top: textarea ? 6 : "50%", transform: textarea ? "none" : "translateY(-50%)", height: 24, padding: "0 9px", borderRadius: 6, border: "1px solid var(--line-strong)", background: "var(--bg-tint)", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: isAr ? "var(--font-ar)" : "inherit", color: "var(--text)" }}>
          {isAr ? "عربي" : "EN"}
        </button>
      </div>
    </div>
  );
}

function TypeEditDrawer({ type, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [t, setT] = useState({ ...type });
  const set = (patch) => setT((x) => ({ ...x, ...patch }));
  const priceOk = (Number(t.basePrice) || 0) >= 0;
  const valid = ((t.name || "").trim() || (t.nameAr || "").trim()) && priceOk;
  const save = () => {
    const payload = {
      name: t.name || t.nameAr, nameAr: t.nameAr || "",
      bedrooms: Number(t.bedrooms) || 0, baths: Number(t.baths) || 0,
      area: Number(t.area) || 0, basePrice: Number(t.basePrice) || 0,
      projectId: t.projectId,
    };
    window.RevnuSupport.act(() => t._new ? D.createUnitType(payload) : D.setUnitType(t.id, payload), { done: TL("Unit type saved.", "تم حفظ نوع الوحدة.") }).then((r) => { if (r !== undefined) onClose(); });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-start" }} onClick={onClose}>
      <div style={{ width: 520, maxWidth: "94vw", height: "100%", background: "var(--bg)", overflowY: "auto", padding: "26px 28px" }} onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>// {t._new ? TL("NEW UNIT TYPE", "نوع وحدة جديد") : TL("EDIT UNIT TYPE", "تعديل نوع الوحدة")}</div>
        <h2 style={{ fontSize: 20, margin: "0 0 18px" }}>{(AR && t.nameAr) ? t.nameAr : (t.name || TL("Unit type", "نوع الوحدة"))}</h2>
        <BiField label={TL("Type name", "اسم النوع")} en={t.name} ar={t.nameAr}
          onEn={(v) => set({ name: v })} onAr={(v) => set({ nameAr: v })}
          placeholder="2 Bedroom · Garden" placeholderAr="غرفتا نوم · حديقة" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Labeled label={TL("Bedrooms", "غرف النوم")}><input className="input mono" type="number" min="0" value={t.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} /></Labeled>
          <Labeled label={TL("Bathrooms", "الحمامات")}><input className="input mono" type="number" min="0" value={t.baths} onChange={(e) => set({ baths: e.target.value })} /></Labeled>
          <Labeled label={TL("Area (m²)", "المساحة (م²)")}><input className="input mono" type="number" min="0" value={t.area} onChange={(e) => set({ area: e.target.value })} /></Labeled>
          <Labeled label={TL("Base price (SAR)", "السعر الأساسي (ريال)")}><input className="input mono" type="number" min="0" value={t.basePrice} onChange={(e) => set({ basePrice: e.target.value })} /></Labeled>
        </div>
        {!priceOk && <div className="soft" style={{ fontSize: 11, color: "var(--negative, #b91c1c)" }}>{TL("Prices can't be negative.", "لا يمكن أن تكون الأسعار سالبة.")}</div>}
        <div className="soft" style={{ fontSize: 11.5, margin: "8px 0 18px", lineHeight: 1.5 }}>{TL("Units of this type inherit the base price; each unit can add a price adjustment. Floor plan, 3D render and masterplan are uploaded per type on the cards.", "ترث وحدات هذا النوع السعر الأساسي، ويمكن لكل وحدة إضافة تعديل سعري. ترفع المخططات والصور لكل نوع من البطاقات.")}</div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary grow" disabled={!valid} onClick={save}>{t._new ? TL("Create type", "إنشاء النوع") : TL("Save", "حفظ")}</button>
          <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
        </div>
      </div>
    </div>
  );
}

function PwUnits({ P }) {
  const [units, setUnits] = useState(P.units);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding]   = useState(false);
  const RS = window.RevnuSupport;
  const setStatus = (number, status) => { RS.act(() => D.setUnitStatus(number, status)).then((r) => { if (r !== undefined) setUnits((arr) => arr.map((u) => u.number === number ? { ...u, status } : u)); }); };
  const saveEdit  = (next) => { RS.act(() => D.updateUnit(next.number, next), { done: (window.I18N && window.I18N.isAR) ? "تم حفظ الوحدة." : "Unit saved." }).then((r) => { if (r) { setUnits((arr) => arr.map((u) => u.number === next.number ? { ...u, ...r } : u)); setEditing(null); } }); };
  const addUnit   = (u) => { RS.act(() => D.addUnit({ ...u, projectId: P.project.id, priceAdj: Number(u.priceAdj) || 0, floor: Number(u.floor) || 0 }), { done: (window.I18N && window.I18N.isAR) ? "أُضيفت الوحدة." : "Unit added." }).then((created) => { if (created) { setUnits((arr) => [created, ...arr]); setAdding(false); } else if (created === null) RS.toast((window.I18N && window.I18N.isAR) ? "رقم الوحدة موجود مسبقًا." : "That unit number already exists.", "err"); }); };

  return (
    <>
      <WsCardHead eye="// UNITS" title={units.length + (window.I18N && window.I18N.isAR ? " وحدة" : " units")} sub={window.I18N && window.I18N.isAR ? "أضف وعدل وغير الحالة. تظهر التغييرات مباشرة لفريق مبيعات المطور. الوحدات المرتبطة بصفقة حية مقفلة." : "Add, edit, change status. Status changes show up live for the developer's sales team. Units in a live deal are locked."}
        action={<div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => D.downloadCSV("units-" + P.project.id + ".csv", units, [{ key: "number", label: "number" }, { key: "projectId", label: "projectId" }, { key: "typeId", label: "typeId" }, { key: "tower", label: "tower" }, { key: "floor", label: "floor" }, { key: "view", label: "view" }, { key: "priceAdj", label: "priceAdj" }, { key: "priceBen", label: "priceBen" }, { key: "status", label: "status" }])}>{TT("Export CSV")}</button>
          {/* A ready-to-fill sheet (headings + one example row per unit type), then the upload that reports every row it can't add. */}
          <button className="btn btn-secondary" title={(window.I18N && window.I18N.isAR) ? "ملف CSV جاهز للتعبئة بعناوين الأعمدة وأنواع وحدات هذا المشروع" : "A ready-to-fill CSV with the right headings and this project's unit types"} onClick={() => D.downloadUnitTemplate("units-template-" + P.project.id + ".csv", [P.project], { withBen: true })}>{(window.I18N && window.I18N.isAR) ? "تنزيل القالب" : "Download template"}</button>
          <label className="btn btn-secondary" style={{ cursor: "pointer" }}>{window.I18N?window.I18N.t("Bulk upload CSV"):"Bulk upload CSV"}<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return; RS.importUnits(f, { projects: [P.project], withBen: true }).then((added) => { if (added && added.length) setUnits(D.UNITS.filter((u) => u.projectId === P.project.id)); }); }} /></label>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>{window.I18N?window.I18N.t("+ Add unit"):"+ Add unit"}</button>
        </div>} />
      <div className="card card-flush">
        <table className="tbl tbl-clickable">
          <thead><tr><th>{TT("Unit #")}</th><th>{TT("Type")}</th><th>{TT("Tower")}</th><th>{TT("Floor")}</th><th>{window.I18N && window.I18N.isAR ? "سعر السوق" : "Market price"} (SAR)</th><th>{window.I18N && window.I18N.isAR ? "سعر المستفيد" : "Beneficiary price"} (SAR)</th><th>{TT("Status")}</th><th className="right">{TT("Actions")}</th></tr></thead>
          <tbody>
            {units.map((u) => {
              const t = D.unitTypeById(u.typeId);
              return (
                <tr key={u.number}>
                  <td className="mono" style={{ fontWeight: 600 }}>{u.number}</td>
                  <td>{t ? (window.I18N ? window.I18N.tx(t, "name") : t.name) : <span className="soft">—</span>}</td>
                  <td>{u.tower}</td>
                  <td className="mono">{u.floor}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{D.fmtSAR((t?.basePrice || 0) + (u.priceAdj || 0))}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{u.priceBen != null && u.priceBen !== "" ? D.fmtSAR(u.priceBen) : <span className="soft">{window.I18N && window.I18N.isAR ? "= السوق" : "= market"}</span>}</td>
                  <td>
                    <select className="select" style={{ width: 110, height: 26, fontSize: 11 }} value={u.status} onChange={(e) => setStatus(u.number, e.target.value)}>
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                      <option value="sold">Sold</option>
                    </select>
                  </td>
                  <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => setEditing(u)}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <PwUnitEditDrawer unit={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}
      {adding && <PwUnitAddDrawer project={P.project} types={P.unitTypes} onClose={() => setAdding(false)} onAdd={addUnit} />}
    </>
  );
}

function PwUnitEditDrawer({ unit, onClose, onSave }) {
  const TL = (en, ar) => (window.I18N && window.I18N.isAR ? ar : en);
  const [u, setU] = useState({ ...unit });
  const set = (patch) => setU((p) => ({ ...p, ...patch }));
  const marketPrice = (D.unitTypeById(u.typeId)?.basePrice || 0) + (u.priceAdj || 0);
  const valid = marketPrice >= 0 && (u.priceBen == null || u.priceBen === "" || Number(u.priceBen) >= 0);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 440, background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div><div className="eyebrow">{TT("// EDIT UNIT")}</div><div className="display-sm mono" style={{ marginTop: 2 }}>{u.number}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <Labeled label="Tower"><input className="input" value={u.tower} onChange={(e) => set({ tower: e.target.value })} /></Labeled>
          <Labeled label="Floor"><input className="input mono" type="number" value={u.floor} onChange={(e) => set({ floor: Number(e.target.value) })} /></Labeled>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label={TL("Market price (SAR)", "سعر السوق (ريال)")}><input className="input mono" type="number" value={(D.unitTypeById(u.typeId)?.basePrice || 0) + (u.priceAdj || 0)} onChange={(e) => set({ priceAdj: Number(e.target.value) - (D.unitTypeById(u.typeId)?.basePrice || 0) })} /></Labeled>
            <Labeled label={TL("Beneficiary price (SAR)", "سعر المستفيد (ريال)")}><input className="input mono" type="number" placeholder={TL("= market", "= السوق")} value={u.priceBen != null && u.priceBen !== "" ? u.priceBen : ""} onChange={(e) => set({ priceBen: e.target.value === "" ? undefined : Number(e.target.value) })} /></Labeled>
          </div>
          <div className="soft" style={{ fontSize: 11, marginTop: -6 }}>{TL("Non-beneficiary buyers pay the market price; beneficiaries (Sakani / housing support) pay the beneficiary price. Both feed the return study.", "غير المستفيد يدفع سعر السوق، والمستفيد (سكني / الدعم) يدفع سعر المستفيد. كلاهما يستخدم في دراسة العائد.")}</div>
          <Labeled label="Status">
            <select className="select" value={u.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>
            </select>
          </Labeled>
          {!valid && <div className="soft" style={{ fontSize: 11, color: "var(--negative, #b91c1c)" }}>{TL("Prices can't be negative.", "لا يمكن أن تكون الأسعار سالبة.")}</div>}
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!valid} onClick={() => onSave(u)}>Save</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PwUnitAddDrawer({ project, types, onClose, onAdd }) {
  const TL = (en, ar) => (window.I18N && window.I18N.isAR ? ar : en);
  const [u, setU] = useState({ number: "", projectId: project.id, typeId: types[0]?.id || "", tower: "", floor: 1, view: "", priceAdj: 0, status: "available" });
  const set = (patch) => setU((p) => ({ ...p, ...patch }));
  const marketPrice = (D.unitTypeById(u.typeId)?.basePrice || 0) + (u.priceAdj || 0);
  const valid = u.number.trim() && u.typeId && u.tower.trim() && marketPrice >= 0 && (u.priceBen == null || u.priceBen === "" || Number(u.priceBen) >= 0);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 460, background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div><div className="eyebrow">{TT("// ADD UNIT")}</div><div className="display-sm" style={{ marginTop: 2 }}>{project.name}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <Labeled label="Unit number *"><input className="input mono" value={u.number} onChange={(e) => set({ number: e.target.value })} placeholder="A-0512" /></Labeled>
          <Labeled label="Unit type *">
            <select className="select" value={u.typeId} onChange={(e) => set({ typeId: e.target.value })}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Labeled>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Tower"><input className="input" value={u.tower} onChange={(e) => set({ tower: e.target.value })} placeholder="Cove A" /></Labeled>
            <Labeled label="Floor"><input className="input mono" type="number" value={u.floor} onChange={(e) => set({ floor: Number(e.target.value) })} /></Labeled>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Labeled label={TL("Market price (SAR)", "سعر السوق (ريال)")}><input className="input mono" type="number" value={(D.unitTypeById(u.typeId)?.basePrice || 0) + (u.priceAdj || 0)} onChange={(e) => set({ priceAdj: Number(e.target.value) - (D.unitTypeById(u.typeId)?.basePrice || 0) })} /></Labeled>
            <Labeled label={TL("Beneficiary price (SAR)", "سعر المستفيد (ريال)")}><input className="input mono" type="number" placeholder={TL("= market", "= السوق")} value={u.priceBen != null && u.priceBen !== "" ? u.priceBen : ""} onChange={(e) => set({ priceBen: e.target.value === "" ? undefined : Number(e.target.value) })} /></Labeled>
          </div>
          <div className="soft" style={{ fontSize: 11, marginTop: -6 }}>{TL("Non-beneficiary buyers pay the market price; beneficiaries (Sakani / housing support) pay the beneficiary price. Both feed the return study.", "غير المستفيد يدفع سعر السوق، والمستفيد (سكني / الدعم) يدفع سعر المستفيد. كلاهما يستخدم في دراسة العائد.")}</div>
          <Labeled label="Status">
            <select className="select" value={u.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>
            </select>
          </Labeled>
          {(marketPrice < 0 || (u.priceBen != null && u.priceBen !== "" && Number(u.priceBen) < 0)) && <div className="soft" style={{ fontSize: 11, color: "var(--negative, #b91c1c)" }}>{TL("Prices can't be negative.", "لا يمكن أن تكون الأسعار سالبة.")}</div>}
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!valid} onClick={() => onAdd(u)}>Add unit</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================================================================
   Module entry — booted by components/PortalBoot after the server
   verified the session and the store was hydrated.
================================================================= */
export default function RevnuPortal({ params: p }) {
  const [ok] = useState(() => boot(p));
  useStoreVersion();
  if (!ok) return <div className="rv-fullscreen"><div className="rv-spinner" /></div>;
  return <App />;
}
