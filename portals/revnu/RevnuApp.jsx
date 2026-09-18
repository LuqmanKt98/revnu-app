"use client";
// Revnu Admin — platform back office.
// Manage all developers, their projects/units, packages, operations,
// and watch all orders across the platform.

import React, { useState, useMemo } from "react";
import D from "@/lib/data/store";
import { useStoreVersion } from "@/lib/data/useStore";

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
  { id: "orders",   label: "All orders",    icon: ICONS.orders },
  { id: "receivables", label: "Developer payments", icon: ICONS.orders },
  { section: "Partners" },
  { id: "devs",     label: "Developers",    icon: ICONS.devs },
  { section: "Organisation" },
  { id: "team",     label: "My team",       icon: ICONS.perf || ICONS.devs },
];

const STATUS_CHIP = {
  draft: "chip", review: "chip chip-warning", signed: "chip chip-brand",
  active: "chip chip-positive", completed: "chip", cancelled: "chip chip-negative",
};

// Logged-in user. Resolves seed USERS, OR a Revnu team member added via "My team"
// (persisted in localStorage and not present in the seed array).
let session = null;
try { session = JSON.parse(sessionStorage.getItem("revnu_session") || localStorage.getItem("revnu_session") || "null"); } catch (e) {}
function revnuTeamMembers() {
  try { return JSON.parse(localStorage.getItem("revnu_team") || "[]"); } catch (e) { return []; }
}
let me = (session && D.userById(session.id)) || null;
if (!me && session && session.id) {
  const tm = revnuTeamMembers().find((m) => m.id === session.id);
  if (tm) me = { id: tm.id, name: tm.name, email: tm.email, role: "revnu_admin", roleId: tm.roleId, perms: tm.perms };
}
if (me && me.role !== "revnu_admin") {
  // A developer-side session has no business in Revnu HQ.
  location.replace("/login");
  throw new Error("redirecting to login");
}
if (!me) { location.replace("/login"); throw new Error("redirecting to login"); }
// seed Revnu admins carry the super_admin level (a stored override may change it)
try { const _tp = JSON.parse(localStorage.getItem("revnu_team_patches") || "{}"); if (_tp[me.id]) me = Object.assign({}, me, _tp[me.id]); } catch (e) {}

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
          <p className="page-sub">{AR ? "كل ما يبلّغ عنه المطوّرون وفرق المبيعات من داخل بواباتهم. ردّ وغيّر الحالة هنا." : "Everything developers and sales teams report from inside their portals. Reply and change the status here."}</p>
        </div>
        <span className="chip">{list.filter((t) => t.status !== "resolved").length} {AR ? "مفتوحة" : "open"}</span>
      </div>
      {list.length === 0 && <div className="card card-pad-lg muted" style={{ textAlign: "center" }}>{AR ? "لا توجد تذاكر بعد — يظهر هنا كل بلاغ يُرسل من زر «الدعم» في بوابات المطوّرين والمبيعات." : "No tickets yet — anything sent from the “Support” button in the developer and sales portals appears here."}</div>}
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
              <select className="select" style={{ height: 30, width: 160 }} value={t.status} onChange={(e) => { RS.updateTicket(t.id, { status: e.target.value }); tick((x) => x + 1); }}>
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
              <input className="input" placeholder={AR ? "اكتب ردًّا…" : "Write a reply…"} value={reply[t.id] || ""} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} />
              <button className="btn btn-secondary" onClick={() => { if (!(reply[t.id] || "").trim()) return; RS.addReply(t.id, reply[t.id].trim()); setReply({ ...reply, [t.id]: "" }); tick((x) => x + 1); }}>{AR ? "ردّ" : "Reply"}</button>
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
  const signOut = () => {
    try { sessionStorage.removeItem("revnu_session"); localStorage.removeItem("revnu_session"); } catch (e) {}
    location.href = "/login";
  };
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
          {NAV.map((n, i) => {
            if (n.section) return <div key={"s" + i} className="side-section">{TT(n.section)}</div>;
            const badge = n.id === "leads" ? D.getInterested().filter((l) => l.status === "new").length : null;
            return (
              <div key={n.id} className={"side-link " + (page === n.id ? "active" : "")} onClick={() => setPage(n.id)}>
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
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "صحّة المنصّة عبر جميع المطوّرين." : "Cross-developer platform health."}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
        <Stat label="Developers"          value={D.DEVELOPERS.length} />
        <Stat label="Projects"            value={D.PROJECTS.length}   />
        <Stat label="Units in inventory"  value={D.UNITS.length} />
        <Stat label={window.I18N && window.I18N.isAR ? "صفقات قيد التنفيذ" : "Deals in progress"} value={active.length} delta={window.I18N && window.I18N.isAR ? (closed.length + " دفع عميلها · " + orders.length + " إجمالاً") : `${closed.length} customer-paid · ${orders.length} total`} />
      </div>

      {/* ============== Revnu money flow ============== */}
      <div className="card card-pad-lg" style={{ marginBottom: 18, background: "linear-gradient(135deg, var(--brand-soft), transparent 70%)" }}>
        <div className="row-between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="eyebrow">{TT("// REVNU MONEY FLOW")}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>{window.I18N && window.I18N.isAR ? "دخلنا — ما يدفعه لنا المطوّرون" : "Our income — what developers pay us"}</div>
          </div>
          <span className="soft" style={{ fontSize: 11.5 }}>{window.I18N && window.I18N.isAR ? (closed.length + " صفقة مغلقة · " + active.length + " وحدة نشطة") : (closed.length + " closed deal" + (closed.length === 1 ? "" : "s") + " · " + active.length + " active unit" + (active.length === 1 ? "" : "s"))}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Income (what developers pay Revnu) */}
          <div className="card card-pad" style={{ background: "var(--bg-card)" }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>{window.I18N && window.I18N.isAR ? "دخلنا من المطوّرين" : "Income from developers"}</strong>
              <span className="chip">{window.I18N && window.I18N.isAR ? "تأثيث + منزل ذكي" : "furnishing + smart"}</span>
            </div>
            <FlowRow k={window.I18N && window.I18N.isAR ? "المُحصّل حتى الآن" : "Collected so far"} v={D.fmtSAR(incomeCollected)} sub={window.I18N && window.I18N.isAR ? "دفعات المطوّرين المستلمة" : "developer payments received"} positive />
            <FlowRow k={window.I18N && window.I18N.isAR ? "المتبقّي" : "Outstanding"} v={D.fmtSAR(incomeOutstanding)} sub={window.I18N && window.I18N.isAR ? "مستحق على المطوّرين" : "due from developers"} emphasized />
            <div className="soft" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.5 }}>{window.I18N && window.I18N.isAR ? "هذا دخلنا — وليس الربح. نُسدّد منه لشركات التأثيث والمنزل الذكي (الهوامش خارج النظام)." : "This is income, not profit — we pay the furnishing & smart-home suppliers out of it (margins handled off-system)."}</div>
          </div>

          {/* Operations — locked units only (no income tracked here) */}
          <div className="card card-pad" style={{ background: "var(--bg-card)" }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>{window.I18N && window.I18N.isAR ? "التشغيل — وحدات مُسجّلة" : "Operations — locked units"}</strong>
              <span className="chip">{window.I18N && window.I18N.isAR ? "يُدار خارج النظام" : "tracked off-system"}</span>
            </div>
            <FlowRow k={window.I18N && window.I18N.isAR ? "وحدات مرتبطة بالتشغيل" : "Units locked for operations"} v={String(opsLocked)} unit={window.I18N && window.I18N.isAR ? "وحدة" : "units"} sub={window.I18N && window.I18N.isAR ? "أُبلغت شركة التشغيل بها" : "operator company notified"} positive />
            <div className="soft" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.5 }}>{window.I18N && window.I18N.isAR ? "لا نتتبّع دخل التشغيل هنا — فقط الوحدات المُسجّلة. يرى المطوّر رقم الوحدة ونسبته المتفق عليها فقط." : "We don't track operating income here — only which units are locked in. The developer sees just the unit and their agreed % cut."}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row-between" style={{ padding: "16px 20px 8px" }}>
          <div>
            <div className="eyebrow">{window.I18N && window.I18N.isAR ? "المطوّرون" : "Developers"}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>{window.I18N && window.I18N.isAR ? "النشاط حسب المطوّر" : "Activity by developer"}</div>
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
  { id: "developers", en: "Manage developers",   ar: "إدارة المطوّرين" },
  { id: "orders",     en: "View orders & payments", ar: "عرض الطلبات والمدفوعات" },
  { id: "financials", en: "View financials",     ar: "عرض البيانات المالية" },
  { id: "team",       en: "Manage team",         ar: "إدارة الفريق" },
  { id: "settings",   en: "Platform settings",   ar: "إعدادات المنصّة" },
];
function loadRevnuTeam() {
  let extra = [];
  try { extra = JSON.parse(localStorage.getItem("revnu_team") || "[]"); } catch (e) {}
  let patches = {}; try { patches = JSON.parse(localStorage.getItem("revnu_team_patches") || "{}"); } catch (e) {}
  const seed = D.USERS.filter((u) => u.role === "revnu_admin").map((u) => Object.assign({
    id: u.id, name: u.name, email: u.email, roleId: "super_admin", _seed: true,
  }, patches[u.id] || {}));
  return [...seed, ...extra];
}
function saveRevnuTeam(list) {
  try {
    localStorage.setItem("revnu_team", JSON.stringify(list.filter((m) => !m._seed)));
    const patches = {}; list.filter((m) => m._seed).forEach((m) => { patches[m.id] = { roleId: m.roleId, perms: m.perms || null, name: m.name }; });
    localStorage.setItem("revnu_team_patches", JSON.stringify(patches));
  } catch (e) {}
}

function RevnuTeam() {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  const [team, setTeam] = useState(loadRevnuTeam);
  const [editing, setEditing] = useState(null); // member or {new:true}
  const roleById = (id) => REVNU_ROLES.find((r) => r.id === id) || REVNU_ROLES[REVNU_ROLES.length - 1];
  const permsFor = (m) => m.perms || roleById(m.roleId).perms;

  const save = (m) => {
    setTeam((cur) => {
      let next;
      if (m.id && cur.some((x) => x.id === m.id)) next = cur.map((x) => x.id === m.id ? m : x);
      else next = [...cur, { ...m, id: m.id || ("rt-" + Date.now()) }];
      saveRevnuTeam(next);
      return next;
    });
    setEditing(null);
  };
  const remove = (id) => { setTeam((cur) => { const n = cur.filter((x) => x.id !== id); saveRevnuTeam(n); return n; }); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{TL("My team", "فريقي")}</h1>
          <p className="page-sub">{TL("Revnu staff who can access this platform. Assign each member a role and fine-tune their permissions.", "موظفو Revnu الذين يمكنهم الوصول إلى المنصّة. عيّن لكل عضو دوراً واضبط صلاحياته.")}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ _new: true, name: "", email: "", roleId: "team" })}>{TL("+ Add member", "+ إضافة عضو")}</button>
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
                      {(CAN_DELETE || (me && m.id === me.id)) && <button className="btn btn-sm btn-ghost" onClick={() => setEditing(m)}>{TL("Edit", "تعديل")}</button>}
                      {CAN_DELETE && !m._seed && <button className="btn btn-sm btn-ghost" onClick={() => remove(m.id)} style={{ color: "var(--negative, #c0492f)" }}>{TL("Remove", "إزالة")}</button>}
                      {!CAN_DELETE && !(me && m.id === me.id) && <span className="soft" style={{ fontSize: 11 }}>—</span>}
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
        {!valid && <div className="soft" style={{ fontSize: 11.5, marginTop: 8 }}>{TL("Enter a name and a valid email.", "أدخل اسماً وبريداً إلكترونياً صحيحاً.")}</div>}
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
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "مطوّرون بعلامتهم الخاصة على المنصّة. لكلٍّ مساحة عمل مستقلّة — الهوية والمشاريع والوحدات والتصاميم والباقات والتشغيل والمدفوعات والعقود." : "White-label tenants on the platform. Each has its own workspace — brand, projects, units, designs, packages, ops, payments and contracts, all isolated."}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOnboarding(true)}>+ Onboard developer</button>
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

      {onboarding && <OnboardWizard onClose={() => setOnboarding(false)} />}
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
    if (project) D.setRevnuTermsForProject(project.id, clean);
    else if (dev) D.setRevnuTerms(dev.id, clean);
    setSaved(true);
  };
  return (
    <div style={{ marginTop: 22, padding: "16px 16px 14px", border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--bg-sunken)" }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{AR ? "// شروط الدفع لـ REVNU" : "// REVNU PAYMENT TERMS"}</div>
      <p className="soft" style={{ fontSize: 11.5, margin: "0 0 12px", lineHeight: 1.5 }}>
        {AR
          ? "كيف يُسدّد هذا المشروع لـ Revnu قيمة التأثيث / الذكي / التشغيل لكل طلب. أضف ما تشاء من الدفعات — الأسماء والنِسب حرة، ويجب أن يكون مجموعها 100%."
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
        {!ok && sum === 100 && <span className="soft" style={{ fontSize: 12, color: "var(--warning, #b8860b)" }}>{AR ? "كل دفعة تحتاج اسماً" : "Every milestone needs a name"}</span>}
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

          <div className="soft" style={{ fontSize: 11.5, marginTop: 18 }}>{window.I18N && window.I18N.isAR ? "بوابات المطوّر تُفتح بحسابات فريقه فقط — من صفحة الدخول الخاصة به." : "The developer's portals open only with their own team accounts — from their sign-in page."}</div>
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
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "كل الطلبات عبر جميع المطوّرين." : "Every order across every developer."}</p>
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
  const [leads, setLeads] = useState(D.getInterested());
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
          <h1 className="page-title">{window.I18N && window.I18N.isAR ? "المطوّرون المهتمّون" : "Interested developers"}</h1>
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
                          onChange={(e) => {
                            const next = leads.map((x) => x.id === l.id ? { ...x, status: e.target.value } : x);
                            setLeads(next);
                          }}>
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
        New leads come from the request-access form on the marketing site. Status changes are stored client-side in this demo.
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
          <WsCardHead eye="// REVNU ↔ DEVELOPER" title={window.I18N && window.I18N.isAR ? "ما يدفعه هذا المطوّر لـ Revnu" : "What this developer pays Revnu"}
            sub={window.I18N && window.I18N.isAR ? "يُحصّل المطوّر قيمة التأثيث من المشتري ضمن سعر الوحدة، ثم يُسوّيها مع Revnu وفق الشروط أدناه — لكل مشروع شروطه الخاصة." : "The developer collects the furnishing value inside the unit price, then settles it with Revnu on the terms below. Each project has its own terms."} />
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
      {tab === "orders"   && <WsOrders   T={T} onChange={bump} />}
    </>
  );
}

const WS_AR = {
  // eyebrows
  "// REVNU ↔ DEVELOPER": "// Revnu ↔ المطوّر", "// BRAND": "// الهوية", "// PROJECTS": "// المشاريع",
  "// DESIGNS": "// التصاميم", "// FURNISHING PACKAGES": "// باقات التأثيث", "// SMART HOME": "// المنزل الذكي",
  "// OPERATIONS": "// التشغيل", "// CONTRACTS": "// العقود", "// TEAM": "// الفريق", "// ORDERS": "// الطلبات",
  "// PROJECT SETTINGS": "// إعدادات المشروع", "// UNIT TYPES": "// أنواع الوحدات", "// UNITS": "// الوحدات",
  // titles
  "What this developer pays Revnu": "ما يدفعه هذا المطوّر لـ Revnu",
  "Brand & onboarding details": "تفاصيل الهوية والإعداد",
  "Projects · each fully configurable": "المشاريع · كلٌّ قابل للتهيئة بالكامل",
  "Design library": "مكتبة التصاميم",
  "Packages · per-type pricing · BOQ": "الباقات · تسعير حسب النوع · جدول الكميات",
  "Smart-home tiers": "باقات المنزل الذكي",
  "Operating models": "نماذج التشغيل",
  "Contract templates": "نماذج العقود",
  "Users & roles": "المستخدمون والأدوار",
  "Project details, commercials & features": "تفاصيل المشروع والشروط التجارية والميزات",
  "Type media — floor plan, 3D render & masterplan": "وسائط النوع — المخطط، الرندر ثلاثي الأبعاد والمخطط العام",
  // subs
  "The developer collects the furnishing value from the buyer inside the unit price, then settles it with Revnu on the terms below. Applied to every order under this developer.": "يُحصّل المطوّر قيمة التأثيث من المشتري ضمن سعر الوحدة، ثم يُسوّيها مع Revnu وفق الشروط أدناه. تنطبق على كل طلب لدى هذا المطوّر.",
  "Logo, colors, legal entity and primary contact. This is what the sales portal will look like to their customers.": "الشعار والألوان والكيان القانوني وجهة الاتصال. هكذا ستبدو بوابة المبيعات لعملائهم.",
  "Design library": "مكتبة التصاميم",
  "Add, edit, change status. Status changes show up live for the developer's sales team.": "أضف وعدّل وغيّر الحالة. تظهر تغييرات الحالة مباشرةً لفريق مبيعات المطوّر.",
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
  const saveName = () => {
    D.patchDeveloper(dv.id, { name, nameAr, legalName: legalName.trim() || null, legalNameAr: legalNameAr.trim() || null, authorizedSigner: signer, authorizedSignerAr: signerAr, authorizedSignerTitle: signerTitle, authorizedSignerTitleAr: signerTitleAr });
  };
  return (
    <>
      <WsCardHead eye="// BRAND" title="Brand & onboarding details" sub="Logo, colors, legal entity and primary contact. This is what the sales portal will look like to their customers." />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
        <div className="card card-pad-lg">
          <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("LEGAL ENTITY")}</div>
          <BiField label={AR ? "اسم المطوّر (الهوية في المنصة)" : "Developer name (brand shown across the platform)"} en={name} ar={nameAr}
            onEn={setName} onAr={setNameAr} placeholder="Developer name" placeholderAr="اسم المطوّر بالعربية" />
          <BiField label={AR ? "الاسم القانوني (يظهر في العقود فقط)" : "Legal entity name (contracts only)"} en={legalName} ar={legalNameAr}
            onEn={setLegalName} onAr={setLegalNameAr} placeholder="e.g. Grova Tilal Real Estate Development Company" placeholderAr="مثال: شركة جروفا تلال للتطوير العقاري" />
          <BiField label={AR ? "المفوّض بالتوقيع (يظهر في العقد)" : "Authorised signatory (appears on the contract)"} en={signer} ar={signerAr}
            onEn={setSigner} onAr={setSignerAr} placeholder="e.g. Abdullah Najjar" placeholderAr="مثال: عبدالله النجّار" />
          <BiField label={AR ? "المنصب / الصفة (يظهر تحت التوقيع)" : "Signatory title (appears under the signature)"} en={signerTitle} ar={signerTitleAr}
            onEn={setSignerTitle} onAr={setSignerTitleAr} placeholder="e.g. Chief Executive Officer" placeholderAr="مثال: الرئيس التنفيذي" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Tagline"><input className="input" defaultValue={dv.tagline} /></Labeled>
            <Labeled label="CR Number"><input className="input mono" defaultValue={dv.crNumber} /></Labeled>
            <Labeled label="VAT"><input className="input mono" defaultValue={dv.vat} /></Labeled>
            <Labeled label="Primary contact"><input className="input" defaultValue={dv.primaryContact} /></Labeled>
            <Labeled label="Email"><input className="input" defaultValue={dv.primaryEmail} /></Labeled>
            <Labeled label="Subdomain"><input className="input mono" defaultValue={dv.domain} /></Labeled>
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
            <DevLogoSlot dv={dv} field="logo" label={AR ? "ملوّن (خلفية فاتحة)" : "Full-color (light bg)"} darkPreview={false} />
            <DevLogoSlot dv={dv} field="logoDark" label={AR ? "للوضع الداكن (خلفية داكنة)" : "Dark-mode (dark bg)"} darkPreview={true} />
          </div>
          <div className="soft" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>{AR ? "يُستخدم الشعار الملوّن على الخلفيات الفاتحة (الترويسات)، والنسخة الداكنة على الخلفيات الداكنة (غلاف العقد)." : "Full-color shows on light backgrounds (letterheads); the dark-mode logo shows on dark backgrounds (e.g. the contract cover)."}</div>
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
    features: { furnishing: true, smartHome: true, operations: true, fitout: false },
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
    // Create through the data layer so it persists across reloads (and can be deleted).
    D.createProject({
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
    });
    // Seed one default 3-instalment payment plan so the project is usable end-to-end.
    D.PAYMENT_PLANS.push({
      id: p.id + "-3x",
      projectId: p.id,
      name: "3 instalments",
      disc: 0,
      milestones: [
        { pct: 40, mileId: null, label: "On signature" },
        { pct: 30, mileId: null, label: "Mid construction" },
        { pct: 30, mileId: null, label: "Handover" },
      ],
      note: "Standard.",
      schedule: "40% On signature  ·  30% Mid construction  ·  30% Handover",
    });
    onCreated && onCreated();
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
            {window.I18N && window.I18N.isAR ? "يُنشأ مشروع فارغ بدون تصاميم / باقات / منزل ذكي / تشغيل / عقود. أكمل إعداد كل منها في مساحة المشروع." : "A blank project is created with empty designs / packages / smart / ops / contracts. Configure each in the project workspace afterwards."}
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
    try { const url = await fileToScaledDataURL(f, 600); D.setDevLogo(dv.id, { [field]: url }); bump((x) => x + 1); }
    catch (err) { console.error(err); }
    e.target.value = "";
  };
  const remove = () => { D.setDevLogo(dv.id, { [field]: "" }); bump((x) => x + 1); };
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
const CAN_DELETE = !!me && (me.roleId === "super_admin" || (me.role === "revnu_admin" && !me.roleId));

function DelBtn({ kind, id, name, after }) {
  if (!CAN_DELETE) return null;
  const AR = window.I18N && window.I18N.isAR;
  const onDel = (e) => {
    e.stopPropagation();
    const msg = AR ? ("حذف \"" + (name || "") + "\"؟ لا يمكن التراجع.") : ("Delete \"" + (name || "") + "\"? This cannot be undone.");
    if (!window.confirm(msg)) return;
    window.REVNU_DATA.removeEntity(kind, id);
    if (after) after(); else setTimeout(() => location.reload(), 50);
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
  const SKIPPABLE = { furnishing: true, smartHome: true, operations: true }; // fit-out is already optional by nature
  const [, force] = useState(0);
  const on = !!(project.features && project.features[opt.id]);
  const canSkip = !!(project.optional && project.optional[opt.id]);
  const toggleOn = () => { D.setProjectFlags(project.id, { features: { [opt.id]: !on } }); force((x) => x + 1); };
  const toggleSkip = () => { D.setProjectFlags(project.id, { optional: { [opt.id]: !canSkip } }); force((x) => x + 1); };
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
      {adding  && <DesignDrawer design={{ id: "new", name: "New design", mood: "", palette: ["#FFFFFF","#EEEEEF","#1D1D1F","#5EC4D4"], palettes: [{ id: "pal-1", name: "Palette 1", nameAr: "", colors: ["#EFE9DF","#C9B89A","#8C7A5E","#FFFFFF"] }], materials: [], images: [] }} onClose={() => setAdding(false)} />}
    </>
  );
}

function DesignDrawer({ design, onClose }) {
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
      for (const f of files) { const url = await fileToScaledDataURL(f, 1400); added.push({ id: "i" + Date.now().toString(36) + added.length, label: f.name.replace(/\.[^.]+$/, ""), labelAr: "", src: url }); }
      set({ images: [...d.images, ...added] });
    } catch (err) { console.error(err); }
    setImgBusy(false); e.target.value = "";
  };
  const onReplaceDesignImg = async (e, i) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { const url = await fileToScaledDataURL(f, 1400); set({ images: d.images.map((x, ix) => ix === i ? { ...x, src: url } : x) }); } catch (err) { console.error(err); }
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
              <Labeled label={AR ? "ماذا تغيّر اللوحة؟ (إنجليزي)" : "What the palette changes (English)"}><textarea className="input" rows={2} style={{ resize: "vertical", fontSize: 12 }} value={d.paletteNote || ""} onChange={(e) => set({ paletteNote: e.target.value })} placeholder="Accessories, cushions, rugs, bedding, wall art…" /></Labeled>
              <Labeled label="ماذا تغيّر اللوحة؟ (عربي)"><textarea className="input" dir="rtl" rows={2} style={{ resize: "vertical", fontSize: 12, fontFamily: "var(--font-ar)" }} value={d.paletteNoteAr || ""} onChange={(e) => set({ paletteNoteAr: e.target.value })} placeholder="الإكسسوارات والمخدات والسجاد والمفارش واللوحات…" /></Labeled>
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
              <button className="btn btn-sm btn-secondary" onClick={() => designImgInput.current && designImgInput.current.click()}>{imgBusy ? (AR ? "جارٍ الرفع…" : "Uploading…") : (AR ? "+ رفع صورة" : "+ Upload image")}</button>
              <input ref={designImgInput} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onUploadDesignImg} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-soft)", marginBottom: 10 }}>{AR ? "لقطات ثلاثية الأبعاد للثيم — يراها العميل في مرحلة المبيعات وتُطبع في الاتفاقية. النسبة المثلى 4:3." : "3D renders of the theme — the customer sees these in the sales flow and they print into the agreement. Best ratio 4:3."}</div>
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
            <button className="btn btn-primary grow" onClick={() => { D.setContentField("design", d.id, { name: d.name, nameAr: d.nameAr, mood: d.mood, moodAr: d.moodAr, palettes: d.palettes, palette: firstColors, materials: d.materials, paletteNote: d.paletteNote || "", paletteNoteAr: d.paletteNoteAr || "" }); onClose(); }}>{window.I18N?window.I18N.t("Save design"):"Save design"}</button>
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
        sub={window.I18N && window.I18N.isAR ? "لكل باقة تسعير حسب نوع الوحدة وجدول كميات. يُطبع جدول الكميات في ملحق التأثيث (F-1) ضمن اتفاقية المشتري." : "Each package has pricing per unit-type and a Bill of Quantities. The BOQ is printed into the buyer's Furnishing Schedule as Appendix F-1."}
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
                  <div className="soft" style={{ fontSize: 11.5, maxWidth: 320 }}>{window.I18N && window.I18N.isAR ? ((p.fitout.boq || []).length + " بندًا مسعّرًا — مجموعها هو سعر إضافة التشطيب الذي يُضاف إلى إضافات المشتري.") : ((p.fitout.boq || []).length + " priced line items — their sum is the fit-out add-on price added to the buyer's extras.")}</div>
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
                <div style={{ fontSize: 11.5, marginTop: 2, opacity: 0.85 }}>{window.I18N && window.I18N.isAR ? "باقة موقّعة من علامة تجارية — تظهر ببطاقة مميّزة مع شعار العلامة في بوابة المبيعات والعقد" : "A branded, co-signed package — gets a stand-out card with the brand's logo in the sales portal and the contract."}</div>
              </div>
              <label className="row" style={{ gap: 8, fontSize: 13, whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={!!p.signature} onChange={() => set({ signature: !p.signature })} /> {window.I18N && window.I18N.isAR ? "باقة موقّعة" : "Signature"}
              </label>
            </div>
            {p.signature && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Labeled label="Brand name"><input className="input" value={p.brandName || ""} onChange={(e) => set({ brandName: e.target.value })} placeholder="e.g. Bentley Home" /></Labeled>
                <Labeled label="اسم العلامة (عربي)"><input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={p.brandNameAr || ""} onChange={(e) => set({ brandNameAr: e.target.value })} placeholder="مثال: بنتلي هوم" /></Labeled>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="eyebrow" style={{ marginBottom: 6, color: "#d6b87c" }}>{TT("BRAND LOGO")}</div>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    {p.brandLogo ? <img src={p.brandLogo} alt="" style={{ height: 34, maxWidth: 130, objectFit: "contain", filter: "brightness(0) invert(1)" }} /> : <span style={{ fontSize: 11.5, opacity: 0.6 }}>{window.I18N && window.I18N.isAR ? "لم يُرفع شعار" : "No logo yet"}</span>}
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
            <button className="btn btn-primary grow" onClick={() => {
              const fields = { name: p.name, nameAr: p.nameAr, tier: p.tier, tierAr: p.tierAr, summary: p.summary, summaryAr: p.summaryAr,
                               pieces: Number(p.pieces) || 0, warranty: Number(p.warranty) || 0, pricing: { ...p.pricing },
                               signature: !!p.signature, brandName: p.brandName || "", brandNameAr: p.brandNameAr || "", brandLogo: p.brandLogo || null,
                               fitout: p.fitout ? { ...p.fitout } : null };
              if (p.id === "new") {
                D.createPackage(Object.assign({ projectId, boq: p.boq || [] }, fields));
              } else {
                D.setContentField("package", p.id, fields);
              }
              onClose();
            }}>{window.I18N?window.I18N.t("Save package"):"Save package"}</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>{window.I18N && window.I18N.isAR ? "يُحفظ محلياً ويبقى بعد إعادة التحميل." : "Saved locally — persists across reloads."}</div>
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
  const save = () => {
    if (!canSave) return;
    if (pkg.field === "fitout") {
      D.setContentField("package", pkg.parent.id, { fitout: Object.assign({}, pkg.parent.fitout, { boq }) });
      if (pkg.parent.fitout) pkg.parent.fitout.boq = boq;
    } else {
      D.setContentField("package", pkg.parent.id, { boq });
      pkg.parent.boq = boq;
    }
    setSaved(true);
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
            <button className="btn btn-secondary btn-sm">Upload CSV</button>
            <button className="btn btn-secondary btn-sm">Download PDF</button>
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

function WsSmart({ T }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding]   = useState(false);
  return (
    <>
      <WsCardHead eye="// SMART HOME" title="Smart-home tiers" sub={window.I18N && window.I18N.isAR ? "طبقات اختيارية. كل فئة بسعر ثابت يُضاف إلى باقة التأثيث." : "Optional layers. Each tier is a fixed-price kit added on top of the furnishing package."}
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
      {adding  && <SmartDrawer tier={{ id: "new", name: "", price: 12000, includes: [], images: [] }} onClose={() => setAdding(false)} />}
    </>
  );
}

function SmartDrawer({ tier, onClose }) {
  const [t, setT] = useState({ ...tier, includes: [...tier.includes], includesAr: [...(tier.includesAr || [])], images: [...(tier.images || [])] });
  const set = (patch) => setT((p) => ({ ...p, ...patch }));
  const [line, setLine] = useState("");
  const imgInput = React.useRef(null);
  const [busy, setBusy] = useState(false);
  const AR = window.I18N && window.I18N.isAR;
  const onUploadImg = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    setBusy(true);
    try { const url = await fileToScaledDataURL(f); set({ images: [...t.images, { id: "si" + Date.now().toString(36).slice(-5), label: "", src: url }] }); }
    catch (err) { console.error(err); }
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
              <input className="input mono" type="number" step="500" value={t.price || 0} onChange={(e) => set({ price: Number(e.target.value) || 0 })} />
              <span className="muted">SAR</span>
            </div>
          </Labeled>
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
              <button className="btn btn-sm btn-secondary" onClick={() => imgInput.current && imgInput.current.click()}>{busy ? (AR ? "جارٍ الرفع…" : "Uploading…") : (AR ? "+ رفع صورة" : "+ Upload image")}</button>
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
            <button className="btn btn-primary grow" onClick={() => { D.setContentField("smart", t.id, { name: t.name, nameAr: t.nameAr, price: Number(t.price) || 0, summary: t.summary || "", summaryAr: t.summaryAr || "", includes: t.includes, includesAr: t.includesAr, images: t.images }); onClose(); }}>{window.I18N?window.I18N.t("Save tier"):"Save tier"}</button>
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
      {adding  && <OpsDrawer model={{ id: "new", name: "", kind: "daily", mgmtFee: 22, occLow: 60, occHigh: 80, summary: "", defaultRate: {} }} unitTypes={T.unitTypes} onClose={() => setAdding(false)} />}
    </>
  );
}

function OpsDrawer({ model, unitTypes, onClose }) {
  const [o, setO] = useState({ ...model, defaultRate: { ...model.defaultRate }, assume: JSON.parse(JSON.stringify(model.assume || {})) });
  const set = (patch) => setO((p) => ({ ...p, ...patch }));
  const setRate = (typeId, val) => setO((p) => ({ ...p, defaultRate: { ...p.defaultRate, [typeId]: Number(val) } }));
  const setAssume = (typeId, patch) => setO((p) => ({ ...p, assume: { ...p.assume, [typeId]: { ...(p.assume[typeId] || {}), ...patch } } }));
  const midOcc = Math.round((o.occLow + o.occHigh) / 2);
  const defaultRisk = o.kind === "daily" ? "high" : /long/i.test(o.name) ? "low" : "medium";
  const save = () => {
    unitTypes.forEach((t) => {
      const a = o.assume[t.id];
      if (a) D.setOpsAssumption(o.id, t.id, { occ: a.occ != null ? Number(a.occ) : midOcc, risk: a.risk || defaultRisk });
    });
    D.setContentField("ops", o.id, { name: o.name, nameAr: o.nameAr, summary: o.summary, summaryAr: o.summaryAr });
    onClose();
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
              <div className="row" style={{ gap: 6 }}><input className="input mono" type="number" step="0.5" value={o.mgmtFee} onChange={(e) => set({ mgmtFee: Number(e.target.value) })} /><span className="muted">%</span></div>
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
                    <input className="input mono" style={{ width: 110, height: 30 }} type="number" value={o.defaultRate[t.id] || 0} onChange={(e) => setRate(t.id, e.target.value)} />
                    <span className="muted" style={{ fontSize: 11 }}>{o.kind === "daily" ? (window.I18N && window.I18N.isAR ? "ريال/ليلة" : "SAR/nt") : (window.I18N && window.I18N.isAR ? "ريال/شهر" : "SAR/mo")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" onClick={save}>{window.I18N?window.I18N.t("Save model"):"Save model"}</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WsContracts({ dv, T }) {
  const AR = window.I18N && window.I18N.isAR;
  const [, setV] = useState(0);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const refresh = () => setV((x) => x + 1);
  const list = D.CONTRACTS.filter((c) => T.contracts.some((x) => x.id === c.id) || (c._created && c.projectId === T.project.id));
  const langLabel = (l) => l === "ar" ? (AR ? "عربي فقط" : "Arabic only") : l === "en" ? (AR ? "إنجليزي فقط" : "English only") : (AR ? "عربي + إنجليزي" : "Arabic + English");
  return (
    <>
      <WsCardHead eye="// CONTRACTS" title={AR ? "نماذج العقود" : "Contract templates"} sub={AR ? ("تُملأ تلقائياً من بيانات الطلب. لكل نموذج نسخة عربية وإنجليزية، وأكواد متغيّرة تُعبّأ من الصفقة. يوقّع المشتري مع " + dv.name + ".") : ("Auto-filled from order data. Each template holds an Arabic + English version with variable codes. Buyer signs with " + dv.name + ".")}
        action={<button className="btn btn-primary" onClick={() => setEditing({ _new: true, projectId: T.project.id, name: "", nameAr: "", kind: "sale", lang: "both", body: "", bodyAr: "" })}>{AR ? "+ نموذج جديد" : "+ New template"}</button>} />
      <div className="card card-flush">
        <table className="tbl">
          <thead><tr><th>{TT("Template")}</th><th>{TT("Kind")}</th><th>{AR ? "اللغة" : "Language"}</th><th>{TT("Version")}</th><th>{TT("Updated")}</th><th className="right">{TT("Actions")}</th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td><strong>{(AR && c.nameAr) ? c.nameAr : c.name}</strong></td>
                <td><span className="chip">{window.I18N ? window.I18N.t(({ sale: "Sale", furnish: "Furnishing", ops: "Operations", kyc: "KYC" }[c.kind] || c.kind)) : c.kind}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{langLabel(c.lang || "both")}</td>
                <td className="mono">{c.version}</td>
                <td className="mono" style={{ fontSize: 12 }}>{D.fmtDate(c.updated)}</td>
                <td className="right">
                  <button className="btn btn-sm btn-secondary" onClick={() => setPreview(c)}>{AR ? "معاينة" : "Preview"}</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ ...c })}>{AR ? "تعديل" : "Edit"}</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--text-soft)" }}>{AR ? "لا توجد نماذج بعد." : "No templates yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <ContractEditDrawer tpl={editing} onClose={() => { setEditing(null); refresh(); }} />}
      {preview && <ContractPreview tpl={preview} project={T.project} onClose={() => setPreview(null)} />}
    </>
  );
}

// Resolve a sample order for previewing variable fills (latest in this project, else any).
function _sampleOrder(projectId) {
  return D.ORDERS.find((o) => o.projectId === projectId) || D.ORDERS[0] || null;
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
    if (t._new) D.createContract(payload); else D.setContract(t.id, payload);
    onClose();
  };
  const del = () => { D.removeContract(t.id); onClose(); };
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
          <span className="soft" style={{ fontSize: 11 }}>{TL("Insert variable codes below; they auto-fill from the deal.", "أدرج أكواد المتغيّرات أدناه؛ تُعبّأ تلقائياً من الصفقة.")}</span>
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
            <textarea ref={arRef} className="input" dir="rtl" value={t.bodyAr || ""} onChange={(e) => set({ bodyAr: e.target.value })} style={{ minHeight: 200, fontFamily: "var(--font-ar)", fontSize: 13.5, lineHeight: 1.7 }} placeholder="اكتب نص العقد… استخدم الأزرار أعلاه لإدراج {{المتغيّرات}}." />
          </div>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary grow" disabled={!valid} onClick={save}>{t._new ? TL("Create template", "إنشاء النموذج") : TL("Save", "حفظ")}</button>
          {!t._new && t._created && CAN_DELETE && <button className="btn btn-ghost" onClick={del} style={{ color: "var(--negative, #c0492f)" }}>{TL("Remove", "إزالة")}</button>}
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
            <div className="eyebrow">{TL("PREVIEW · auto-filled", "معاينة · مُعبّأة تلقائياً")}</div>
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
          {order ? TL("Filled from order " + order.id, "مُعبّأ من الطلب " + order.id) : TL("No sample order — codes shown as [placeholders].", "لا يوجد طلب نموذجي — تظهر الأكواد كـ [عناصر نائبة].")}
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
  const scopeHint = (sc) => sc === "own" ? L("the rep who closes the deal", "المندوب الذي يُغلق الصفقة")
    : sc === "team" ? L("paid to their manager up the reporting chain", "تُدفع لمديره في سلسلة الإدارة")
    : L("paid to this role across the whole developer", "تُدفع لصاحب هذا الدور على مستوى المطوّر كله");
  const setLvl = (i, patch) => setLadder((ls) => ls.map((l, ix) => ix === i ? { ...l, ...patch } : l));
  const addLvl = () => setLadder((ls) => [...ls, { id: "lvl-" + Date.now().toString(36).slice(-5), name: "New level", nameAr: "", pct: 0, scope: "team" }]);
  const rmLvl = (i) => setLadder((ls) => ls.filter((_, ix) => ix !== i));
  const saveLadder = () => { if (valid) { D.setCommissionLadder(dv.id, ladder); bump((x) => x + 1); } };

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
  const markPaid = (l, paid) => { D.setPayoutStatus(l.orderId, l.userId, l.levelId, paid ? "paid" : "pending"); bump((x) => x + 1); };
  const [openPerson, setOpenPerson] = useState(null);

  return (
    <>
      <WsCardHead eye={L("// SALES COMMISSIONS", "// عمولات المبيعات")} title={L("Sales commissions", "عمولات المبيعات")}
        sub={L("Set how each deal's commission pool splits across the sales org, then track Revnu's payouts. Revnu pays each person after the customer's first payment lands.",
                "حدّد كيف تتوزّع عمولة كل صفقة على فريق المبيعات، ثم تتبّع تحويلات Revnu. تدفع Revnu لكل شخص بعد استلام الدفعة الأولى من العميل.")} />

      {/* ---- Ladder editor ---- */}
      <div className="card card-pad-lg" style={{ marginBottom: 20 }}>
        <div className="row-between" style={{ marginBottom: 6 }}>
          <div className="eyebrow">{L("// COMMISSION LADDER", "// سلّم العمولة")}</div>
          <span className="chip" style={{ background: valid ? "var(--positive-soft, rgba(31,138,91,0.12))" : "var(--warning-soft, rgba(184,134,11,0.14))", color: valid ? "var(--positive, #1f8a5b)" : "var(--warning, #b8860b)" }}>
            {L("Total", "الإجمالي")}: {sum}%{valid ? " ✓" : L(" — must be 100%", " — يجب أن يساوي 100%")}
          </span>
        </div>
        <div className="soft" style={{ fontSize: 12, marginBottom: 14 }}>
          {L("The pool is the project's sales commission (% of the extras' ex-VAT value). Shares below split that pool.", "العمولة الإجمالية = عمولة مبيعات المشروع (% من الإضافات بدون الضريبة). النسب أدناه تقسّم هذه العمولة.")}
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
          <button className="btn btn-primary" disabled={!valid} onClick={saveLadder}>{L("Save ladder", "حفظ السلّم")}</button>
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
        <Stat label={L("Transferred", "حُوّلت")}   value={D.fmtSAR(totalPaid)}    unit="SAR" delta={L("marked paid", "معلّمة كمدفوعة")} />
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
            <th className="right">{L("Pending", "المعلّق")}</th>
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
                          ? <button className="btn btn-sm" style={{ background: "var(--positive-soft, rgba(31,138,91,0.12))", color: "var(--positive, #1f8a5b)" }} onClick={() => markPaid(l, false)}>✓ {L("Transferred", "حُوّلت")}</button>
                          : <button className="btn btn-sm btn-primary" onClick={() => markPaid(l, true)}>{L("Mark transferred", "تعليم كمحوّلة")}</button>}
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
      <WsCardHead eye="// TEAM" title={AR ? "المستخدمون والأدوار" : "Users & roles"} sub={AR ? "كل من يعمل لدى المطوّر — بأي مسمّى — مع صلاحياته ومشاريعه. يمكن إسناد المندوبين لمشاريع محددة." : "Everyone who works for the developer — any title — with their permissions and project access."}
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
    if (m._new) D.createDevUser(payload); else D.setDevUser(m.id, payload);
    onClose();
  };
  const del = () => { D.removeDevUser(m.id); onClose(); };
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
        <label className="field-label">{TL("Role / title", "الدور / المسمّى")}</label>
        <div className="soft" style={{ fontSize: 11, margin: "2px 0 8px" }}>{TL("Free text — a label only. Access is controlled by the permissions below, not the title.", "نص حرّ — مجرد مسمّى. الوصول تتحكّم به الصلاحيات أدناه وليس المسمّى.")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <input className="input" value={m.role || ""} onChange={(e) => set({ role: e.target.value })} placeholder={TL("e.g. Sales Manager", "بالإنجليزية")} />
          <input className="input" dir="rtl" style={{ fontFamily: "var(--font-ar)" }} value={m.roleAr || ""} onChange={(e) => set({ roleAr: e.target.value })} placeholder="مثال: مدير المبيعات" />
        </div>
        <label className="field-label">{TL("Permissions", "الصلاحيات")}</label>
        <div className="soft" style={{ fontSize: 11, margin: "2px 0 8px" }}>{TL("Tick exactly what this person can access — independent of their title.", "حدّد بالضبط ما يمكن لهذا الشخص الوصول إليه — بصرف النظر عن مسمّاه.")}</div>
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
            <div className="soft" style={{ fontSize: 11, margin: "2px 0 6px" }}>{TL("Which rung of the ladder this person sits on.", "أي درجة في سلّم العمولة يشغلها هذا الشخص.")}</div>
            <select className="select" style={{ marginBottom: 12 }} value={m.commissionLevelId || ""} onChange={(e) => set({ commissionLevelId: e.target.value || null })}>
              <option value="">{TL("— none —", "— لا شيء —")}</option>
              {ladder.map((l) => <option key={l.id} value={l.id}>{(AR ? (l.nameAr || l.name) : l.name) + " · " + l.pct + "%"}</option>)}
            </select>
            <label className="field-label">{TL("Reports to", "يتبع إدارياً")}</label>
            <div className="soft" style={{ fontSize: 11, margin: "2px 0 6px" }}>{TL("Their manager — used to route the team override up the chain.", "مديره — يُستخدم لتوجيه حصة الفريق للأعلى.")}</div>
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
          <button className="btn btn-primary grow" disabled={!valid} onClick={save}>{m._new ? TL("Send invite", "إرسال الدعوة") : TL("Save", "حفظ")}</button>
          {!m._new && CAN_DELETE && <button className="btn btn-ghost" onClick={() => { if (confirm(TL("Remove " + m.name + "? They will lose access immediately.", "إزالة " + (m.nameAr || m.name) + "؟ سيفقد الوصول فورًا.")) ) del(); }} style={{ color: "var(--negative, #c0492f)" }}>{TL("Remove", "إزالة")}</button>}
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
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "ما يدفعه كل مطوّر لـ Revnu مقابل ملحق التأثيث / الذكي / التشغيل، لكل طلب وفق شروط دفعه. التشغيل يُتابَع كوحدات مُسجّلة فقط — بلا مبالغ." : "What each developer owes Revnu for the furnishing / smart / operations addendum, per order — on their own payment terms. Operations is tracked as locked units only — no amounts."}</p>
        </div>
      </div>

      {recur.activeUnits > 0 && (
        <div className="card card-pad-lg" style={{ marginBottom: 18, background: "var(--brand-soft)", border: "1px solid var(--line)" }}>
          <div className="row-between" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div className="eyebrow">{window.I18N && window.I18N.isAR ? "// التشغيل · وحدات مُسجّلة" : "// OPERATIONS · LOCKED UNITS"}</div>
            <span className="chip">{window.I18N && window.I18N.isAR ? (recur.activeUnits + " وحدة") : (recur.activeUnits + " unit" + (recur.activeUnits !== 1 ? "s" : ""))}</span>
          </div>
          <div className="soft" style={{ fontSize: 12, lineHeight: 1.6 }}>
            {window.I18N && window.I18N.isAR
              ? "هذه الوحدات مُسجّلة في وحدة التشغيل وأُبلغت بها شركة التشغيل. لا نتتبّع دخل التشغيل داخل النظام — يُدار خارجه. يرى المطوّر رقم الوحدة ونسبته المتفق عليها فقط، بلا مبالغ."
              : "These units are locked into the operations module and the operator company has been notified. We don't track operating income in the system — it's handled off-system. The developer sees only the unit and their agreed % cut, no amounts."}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
        <Stat label={window.I18N && window.I18N.isAR ? "مُفوتَر للمطوّرين" : "Invoiced to developers"} value={D.fmtSAR(totPayable) + " SAR"} delta={rows.length + (window.I18N && window.I18N.isAR ? " فاتورة · بعد دفع العميل" : " invoices · after customer payment")} />
        <Stat label={window.I18N && window.I18N.isAR ? "المُحصّل" : "Collected"} value={D.fmtSAR(totCollected) + " SAR"} />
        <Stat label={window.I18N && window.I18N.isAR ? "المتبقّي" : "Outstanding"} value={D.fmtSAR(totOutstanding) + " SAR"} />
        <Stat label={window.I18N && window.I18N.isAR ? "متوقّع" : "Projected"} value={D.fmtSAR(projected) + " SAR"} delta={projectedRows.length + (window.I18N && window.I18N.isAR ? " صفقة لم يدفع عميلها بعد" : " deals not yet paid by the customer")} />
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
            {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 36, color: "var(--text-soft)" }}>{window.I18N && window.I18N.isAR ? "لا توجد فواتير بعد — تُنشأ عند دفع العميل الدفعة الأولى." : "No invoices yet — one is raised when a customer makes the first payment."}</td></tr>}
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
  const togglePaid = (id) => {
    if (paidIds.includes(id)) { if (!CAN_DELETE) return; const next = paidIds.filter((x) => x !== id); setPaidIds(next); D.setOrderPaid(order.id, next); return; }
    // Marking a milestone as received requires the developer's proof of transfer.
    if (!window.RevnuSupport) return;
    window.RevnuSupport.pickFile(".pdf,image/*").then((f) => { if (!f) return; window.RevnuSupport.storeFile("revnu_dev_transfer_proofs", order.id + "|" + id, f); const next = [...paidIds, id]; setPaidIds(next); D.setOrderPaid(order.id, next); });
  };
  const [, tick] = useState(0);
  const live = D.ORDERS.find((x) => x.id === order.id) || order;
  const FLOW = ["active", "issued", "signed", "paid"];
  const flowIdx = FLOW.indexOf(live.status === "draft" || live.status === "review" ? "active" : (live.status === "completed" ? "paid" : live.status));
  const moveTo = (st) => {
    const i = FLOW.indexOf(st); if (i !== flowIdx + 1) return;   // one step forward at a time
    if (st === "signed" && !live.signedContractUrl) { window.RevnuSupport.pickFile(".pdf,image/*").then((f) => { if (!f) return; window.RevnuSupport.storeFile("revnu_signed_files", live.id, f); D.updateOrder(live.id, { signedContractUrl: f.name, signedAt: new Date().toISOString().slice(0, 10), status: "signed" }); tick((x) => x + 1); }); return; }
    if (st === "paid" && !live.paymentProofUrl) { window.RevnuSupport.pickFile(".pdf,image/*").then((f) => { if (!f) return; window.RevnuSupport.storeFile("revnu_payment_proofs", live.id, f); D.updateOrder(live.id, { paymentProofUrl: f.name, paidAt: new Date().toISOString().slice(0, 10), status: "paid" }); tick((x) => x + 1); }); return; }
    D.updateOrder(live.id, { status: st }); tick((x) => x + 1);
  };
  const AR = window.I18N && window.I18N.isAR;
  const agreementHref = "/sales?dev=" + order.developerId + "&order=" + order.id;
  const RS = window.RevnuSupport;
  const signedFile = RS ? RS.getFile("revnu_signed_files", live.id) : null;
  const proofFile  = RS ? RS.getFile("revnu_payment_proofs", live.id) : null;
  const docs = [
    { name: AR ? "اتفاقية الشراء والاستثمار (مع الملاحق أ · ب)" : "Purchase & Investment Agreement (with Schedules A · B)", sub: AR ? "النسخة المُصدَرة — عرض · Word · PDF" : "Issued copy — view · Word · PDF", ref: "AGR-" + live.id.replace(/\D/g, ""), href: agreementHref, ok: true },
    { name: AR ? "الاتفاقية الموقّعة" : "Signed agreement", sub: live.signedContractUrl ? live.signedContractUrl + (live.signedAt ? " · " + live.signedAt : "") : (AR ? "لم تُرفع بعد" : "not uploaded yet"), ref: live.signedContractUrl ? "✓" : "—", ok: !!live.signedContractUrl, file: signedFile },
    { name: AR ? "إثبات دفع العميل" : "Customer proof of payment", sub: live.paymentProofUrl ? live.paymentProofUrl + (live.paidAt ? " · " + live.paidAt : "") : (AR ? "لم يُرفع بعد" : "not uploaded yet"), ref: live.paymentProofUrl ? "✓" : "—", ok: !!live.paymentProofUrl, file: proofFile },
  ].concat(schedule.filter((m) => m.paid).map((m) => { const pf = RS ? RS.getFile("revnu_dev_transfer_proofs", live.id + "|" + m.id) : null; return { name: (AR ? "إثبات تحويل المطوّر — " : "Developer transfer proof — ") + m.label, sub: pf ? pf.name : (AR ? "مُعلَّمة كمدفوعة" : "marked as paid"), ref: "✓", ok: true, file: pf }; }));
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
            <span className="soft" style={{ fontSize: 12 }}>{AR ? "أُنشئ " : "created "}{D.fmtDate(live.createdAt)}</span>
          </div>
          {/* Process line — click the next stage to move the order (gated by the required document) */}
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            {FLOW.map((st, i) => (
              <React.Fragment key={st}>
                <button type="button" onClick={() => moveTo(st)} disabled={i !== flowIdx + 1}
                  title={i === flowIdx + 1 ? (st === "signed" ? (AR ? "يلزم رفع العقد الموقّع" : "Requires the signed agreement") : st === "paid" ? (AR ? "يلزم إثبات الدفع" : "Requires proof of payment") : (AR ? "نقل الطلب إلى هذه المرحلة" : "Move the order to this stage")) : ""}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 14, cursor: i === flowIdx + 1 ? "pointer" : "default", background: i <= flowIdx ? "var(--brand)" : "transparent", color: i <= flowIdx ? "var(--brand-text)" : (i === flowIdx + 1 ? "var(--brand-deep)" : "var(--text-muted)"), border: "1px solid " + (i <= flowIdx || i === flowIdx + 1 ? "var(--brand)" : "var(--line-strong)"), borderStyle: i === flowIdx + 1 ? "dashed" : "solid" }}>
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
          <SecRow k={AR ? "التشطيب" : "Fit-out"}  v={order.fitout ? (AR ? "مُضمَّن" : "Included") : (AR ? "غير مُضمَّن" : "Not included")} />
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
            <span>{AR ? "سعر الوحدة (يُسوَّى بموجب عقد الشراء)" : "Unit price (settled under the purchase agreement)"}</span>
            <span className="mono">{D.fmtSAR(order.unitPrice)} SAR</span>
          </div>


          {/* ===== Developer → Revnu payment tracking ===== */}
          <hr className="hr-thin" style={{ margin: "22px 0 12px" }} />
          <div className="row-between" style={{ marginBottom: 4 }}>
            <div className="eyebrow">{TT("DEVELOPER → REVNU PAYMENT")}</div>
            <span className="mono soft" style={{ fontSize: 11 }}>{dv?.name}</span>
          </div>
          <p className="soft" style={{ fontSize: 11.5, margin: "0 0 12px", lineHeight: 1.5 }}>
            {AR ? ("ما يدين به " + (dv?.nameAr || dv?.name) + " لـ Revnu عن هذا الطلب — قيمة الإضافات بعد خصم هامشه التعاقدي، وفق شروط دفعه." + (D.isCustomerPaid(order) ? "" : " تُصدر الفاتورة عند دفع العميل الدفعة الأولى.")) : ("What " + dv?.name + " owes Revnu on this order — the extras value net of their contract markup, on their payment terms." + (D.isCustomerPaid(order) ? "" : " The invoice is raised once the customer makes the first payment."))}
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
            <MiniStat label={AR ? "مستحق لـ Revnu" : "Payable to Revnu"} v={D.fmtSAR(payable)} />
            <MiniStat label={AR ? "المُحصّل" : "Collected"} v={D.fmtSAR(paidTotal)} tone="positive" />
            <MiniStat label={AR ? "المتبقّي" : "Outstanding"} v={D.fmtSAR(outstanding)} tone={outstanding > 0 ? "warning" : "positive"} />
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
                  : d.file && d.file.data ? <a className="btn btn-sm btn-secondary" href={d.file.data} download={d.file.name}>{AR ? "تنزيل" : "Download"}</a>
                  : d.ok ? <span className="chip chip-positive">{AR ? "مُسجَّل" : "on file"}</span> : <span className="chip">{AR ? "مفقود" : "missing"}</span>}
              </div>
            ))}
          </div>
          <a className="btn btn-primary" style={{ width: "100%", marginTop: 14, justifyContent: "center" }} href={agreementHref}>{AR ? "فتح الاتفاقية · تنزيل Word / PDF ←" : "Open agreement · download Word / PDF →"}</a>
          {order.status === "cancelled" && (
            <div className="card card-pad" style={{ marginTop: 14, background: "rgba(192,73,47,0.07)", border: "1px solid rgba(192,73,47,0.3)", fontSize: 12.5 }}>
              <strong style={{ color: "#c0492f" }}>{AR ? "مُلغى" : "Cancelled"}</strong> · {order.cancelReason || (AR ? "بدون سبب مسجّل" : "no reason recorded")}{order.cancelledBy ? " · " + order.cancelledBy : ""}
            </div>
          )}
          {CAN_DELETE && (
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {order.status !== "cancelled"
                ? <button className="btn btn-ghost btn-sm" style={{ color: "#c0492f" }} onClick={() => { const why = prompt(AR ? "سبب الإلغاء (إلزامي):" : "Reason for cancelling (required):"); if (why == null) return; if (!why.trim()) return alert(AR ? "السبب إلزامي." : "A reason is required."); D.cancelOrder(order.id, why.trim(), me && (me.name || me.email)); onClose(); }}>{AR ? "إلغاء الطلب" : "Cancel order"}</button>
                : <button className="btn btn-ghost btn-sm" onClick={() => { if (!D.reinstateOrder(order.id)) alert(AR ? "لا يمكن الاستعادة — الوحدة في صفقة أخرى." : "Cannot reinstate — unit is in another live deal."); onClose(); }}>{AR ? "استعادة الطلب" : "Reinstate"}</button>}
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
   Onboard Wizard — pop-over for adding a new developer tenant
============================================================ */
function OnboardWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const STEPS = ["Company", "Brand", "Subdomain", "Confirm"];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.36)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "100vw", background: "var(--bg-card)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
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
              <BiField label={TT("LEGAL NAME")} en={""} ar={""} onEn={() => {}} onAr={() => {}}
                placeholder="Aravan Real Estate" placeholderAr="أرافان العقارية" />
              <Labeled label="CR Number"><input className="input mono" placeholder="CR 10xxxxxxxx" /></Labeled>
              <Labeled label="VAT"><input className="input mono" placeholder="VAT 3xxxxxxxxxxxxxx" /></Labeled>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Labeled label="Primary contact"><input className="input" placeholder="Sami Al-Ghamdi" /></Labeled>
                <Labeled label="Email"><input className="input" placeholder="sami@aravan.sa" /></Labeled>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="stack-md">
              <Labeled label="Brand primary color"><input className="input mono" defaultValue="#0E7C66" /></Labeled>
              <Labeled label="Brand deep / hover"><input className="input mono" defaultValue="#085A4B" /></Labeled>
              <Labeled label="Tagline"><input className="input" placeholder="A short brand line" /></Labeled>
              <Labeled label="Logo">
                <div style={{ padding: 18, border: "1px dashed var(--line-strong)", borderRadius: "var(--r-md)", textAlign: "center", color: "var(--text-soft)", fontSize: 12.5 }}>
                  Drop SVG / PNG · <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }}>Choose file</button>
                </div>
              </Labeled>
            </div>
          )}
          {step === 2 && (
            <div className="stack-md">
              <Labeled label="Subdomain">
                <div className="row" style={{ gap: 0 }}>
                  <input className="input mono" placeholder="aravan" style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }} />
                  <span className="mono" style={{ padding: "0 12px", height: 38, display: "inline-flex", alignItems: "center", background: "var(--bg-tint)", border: "1px solid var(--line-strong)", borderLeft: 0, borderTopRightRadius: "var(--r-sm)", borderBottomRightRadius: "var(--r-sm)", fontSize: 13 }}>.revnu.sa</span>
                </div>
              </Labeled>
              <Labeled label="Default feature set">
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {["Furnishing","Smart home","Operations"].map((f) => (
                    <label key={f} className="row" style={{ gap: 6, fontSize: 13 }}>
                      <input type="checkbox" defaultChecked /> {f}
                    </label>
                  ))}
                </div>
              </Labeled>
              <p className="muted" style={{ fontSize: 12.5 }}>You can override these per project after onboarding.</p>
            </div>
          )}
          {step === 3 && (
            <div className="stack-md">
              <p style={{ margin: 0 }}>Once you confirm, the partner is created with empty designs / packages / payments / operations / contracts. Configure them inside the developer's workspace.</p>
              <div className="card card-pad" style={{ background: "var(--bg-sunken)" }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>{TT("READY TO PROVISION")}</div>
                <div style={{ fontSize: 13.5 }}>A blank partner account, a working login at the subdomain, and a workspace populated with sensible defaults you can tune.</div>
              </div>
            </div>
          )}
        </div>
        <div className="row-between" style={{ padding: "14px 26px", borderTop: "1px solid var(--line)" }}>
          <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          <div className="row" style={{ gap: 8 }}>
            {step > 0 && <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>Back</button>}
            {step < STEPS.length - 1 && <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Continue →</button>}
            {step === STEPS.length - 1 && <button className="btn btn-primary" onClick={onClose}>Provision partner</button>}
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
    { id: "ops",       label: "Operations" },
    { id: "contracts", label: "Contracts" },
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
              <span key={k} className="chip" style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }}>{({ furnishing: ["Furnishing", "التأثيث"], smartHome: ["Smart home", "المنزل الذكي"], operations: ["Operations", "التشغيل"], fitout: ["Fit-out", "التشطيب"], paymentPlans: ["Payment plans", "خطط الدفع"] }[k] || [k, k])[window.I18N && window.I18N.isAR ? 1 : 0]}</span>
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
    D.setProjectInfo(P.project.id, {
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
    });
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
              <div className="soft" style={{ fontSize: 11, marginTop: 4 }}>{window.I18N && window.I18N.isAR ? "لكل صفقة — % من قيمة الإضافات بدون ضريبة القيمة المضافة، أو مبلغ ثابت. تُقسَّم على الفريق حسب سلّم العمولة." : "Per deal — % of the extras' ex-VAT value, or a flat amount. Split across the team by the commission ladder."}</div>
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
          <p className="muted" style={{ margin: "0 0 14px", fontSize: 12.5 }}>{window.I18N && window.I18N.isAR ? "أوقف ميزة لإزالتها من رحلة المشتري بالكامل. للميزات المُفعّلة، حدّد ما إذا كان مندوب المطوّر يستطيع تخطّيها لكل عملية بيع (اختياري) أو يجب تضمينها دائماً (إلزامي)." : <>Toggle a feature off to remove it from the buyer journey entirely. For features that stay on, decide whether the developer's rep may <strong>skip</strong> it per sale (Optional) or must always include it (Mandatory).</>}</p>
          <div className="stack-sm">
            {[
              { id: "furnishing",   label: "Furnishing",    hint: "Design + package + smart steps" },
              { id: "fitout",       label: "Fit-out",       hint: "Turnkey fit-out add-on per package" },
              { id: "smartHome",    label: "Smart home",    hint: "Smart-home tier sub-step" },
              { id: "operations",   label: "Operations",    hint: "Ops + calculator + PM contract" },
            ].map((opt) => <FeatureRow key={opt.id} project={P.project} opt={opt} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function fileToScaledDataURL(file, maxW) {
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
        cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);
        cx.drawImage(im, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", 0.85));
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
    try { const url = await fileToScaledDataURL(f); D.setTypeMedia(typeId, { [field]: url }); onChange(); }
    catch (err) { console.error(err); }
    setBusy(false);
    e.target.value = "";
  };
  const remove = () => { D.setTypeMedia(typeId, { [field]: "" }); onChange(); };
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
          sub={AR ? "عرّف كل نوع (بالعربية والإنجليزية) وارفع وسائطه مرة واحدة. يرتبط بكل وحدة من هذا النوع ويظهر في اتفاقية المشتري." : "Define each type (Arabic + English) and upload its media once. It links to every unit of that type and prints into the buyer's agreement."} />
        <button className="btn btn-primary" onClick={() => setEditing({ _new: true, projectId: P.project.id, name: "", nameAr: "", bedrooms: 1, baths: 1, area: 0, basePrice: 0 })}>{AR ? "+ إضافة نوع وحدة" : "+ Add unit type"}</button>
      </div>
      <div className="stack-md">
        {types.map((t) => (
          <div key={t.id} className="card card-pad-lg">
            <div className="row-between" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ fontSize: 15 }}>{(AR && t.nameAr) ? t.nameAr : t.name}</strong>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {t.bedrooms} {AR ? "غرفة" : "bed"} · {t.baths} {AR ? "حمّام" : "bath"} · {t.area} m²{window.unitLevels && window.unitLevels(t) > 1 ? " · " + window.unitLevels(t) + (AR ? " طوابق" : "-storey") : ""} · {AR ? "الأساس" : "base"} {D.fmtSAR(t.basePrice)} SAR
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
  const valid = (t.name || "").trim() || (t.nameAr || "").trim();
  const save = () => {
    const payload = {
      name: t.name || t.nameAr, nameAr: t.nameAr || "",
      bedrooms: Number(t.bedrooms) || 0, baths: Number(t.baths) || 0,
      area: Number(t.area) || 0, basePrice: Number(t.basePrice) || 0,
      projectId: t.projectId,
    };
    if (t._new) D.createUnitType(payload);
    else D.setUnitType(t.id, payload);
    onClose();
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
        <div className="soft" style={{ fontSize: 11.5, margin: "8px 0 18px", lineHeight: 1.5 }}>{TL("Units of this type inherit the base price; each unit can add a price adjustment. Floor plan, 3D render and masterplan are uploaded per type on the cards.", "ترث وحدات هذا النوع السعر الأساسي، ويمكن لكل وحدة إضافة تعديل سعري. تُرفع المخططات والصور لكل نوع من البطاقات.")}</div>
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
  const setStatus = (number, status) => { D.setUnitStatus(number, status); setUnits((arr) => arr.map((u) => u.number === number ? { ...u, status } : u)); };
  const saveEdit  = (next) => { D.updateUnit(next.number, next); setUnits((arr) => arr.map((u) => u.number === next.number ? { ...u, ...next } : u)); setEditing(null); };
  const addUnit   = (u) => { const created = D.addUnit({ ...u, projectId: P.project.id, priceAdj: Number(u.priceAdj) || 0, floor: Number(u.floor) || 0 }); if (created) setUnits((arr) => [created, ...arr]); setAdding(false); };

  return (
    <>
      <WsCardHead eye="// UNITS" title={units.length + (window.I18N && window.I18N.isAR ? " وحدة" : " units")} sub={window.I18N && window.I18N.isAR ? "أضف وعدّل وغيّر الحالة. تظهر التغييرات مباشرةً لفريق مبيعات المطوّر. الوحدات المرتبطة بصفقة حيّة مقفلة." : "Add, edit, change status. Status changes show up live for the developer's sales team. Units in a live deal are locked."}
        action={<div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => D.downloadCSV("units-" + P.project.id + ".csv", units, [{ key: "number", label: "number" }, { key: "projectId", label: "projectId" }, { key: "typeId", label: "typeId" }, { key: "tower", label: "tower" }, { key: "floor", label: "floor" }, { key: "view", label: "view" }, { key: "priceAdj", label: "priceAdj" }, { key: "priceBen", label: "priceBen" }, { key: "status", label: "status" }])}>{TT("Export CSV")}</button>
          <label className="btn btn-secondary" style={{ cursor: "pointer" }}>{window.I18N?window.I18N.t("Bulk upload CSV"):"Bulk upload CSV"}<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const rows = D.parseCSV(r.result); let ok = 0, skip = 0; rows.forEach((row) => { const c = row.number && D.addUnit({ number: row.number, projectId: P.project.id, typeId: row.typeId, tower: row.tower || "", floor: Number(row.floor) || 0, view: row.view || "", priceAdj: Number(row.priceAdj) || 0, priceBen: row.priceBen !== undefined && row.priceBen !== "" ? Number(row.priceBen) : undefined }); if (c) ok++; else skip++; }); alert((window.I18N && window.I18N.isAR) ? (ok + " وحدة أُضيفت · " + skip + " تم تجاوزها") : (ok + " units added · " + skip + " skipped (duplicate / missing number)")); setUnits(D.UNITS.filter((u) => u.projectId === P.project.id)); }; r.readAsText(f); e.target.value = ""; }} /></label>
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
  const [u, setU] = useState({ ...unit });
  const set = (patch) => setU((p) => ({ ...p, ...patch }));
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
          <div className="soft" style={{ fontSize: 11, marginTop: -6 }}>{TL("Non-beneficiary buyers pay the market price; beneficiaries (Sakani / housing support) pay the beneficiary price. Both feed the return study.", "غير المستفيد يدفع سعر السوق، والمستفيد (سكني / الدعم) يدفع سعر المستفيد. كلاهما يُستخدم في دراسة العائد.")}</div>
          <Labeled label="Status">
            <select className="select" value={u.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>
            </select>
          </Labeled>
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" onClick={() => onSave(u)}>Save</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PwUnitAddDrawer({ project, types, onClose, onAdd }) {
  const [u, setU] = useState({ number: "", projectId: project.id, typeId: types[0]?.id || "", tower: "", floor: 1, view: "", priceAdj: 0, status: "available" });
  const set = (patch) => setU((p) => ({ ...p, ...patch }));
  const valid = u.number.trim() && u.typeId && u.tower.trim();
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
          <div className="soft" style={{ fontSize: 11, marginTop: -6 }}>{TL("Non-beneficiary buyers pay the market price; beneficiaries (Sakani / housing support) pay the beneficiary price. Both feed the return study.", "غير المستفيد يدفع سعر السوق، والمستفيد (سكني / الدعم) يدفع سعر المستفيد. كلاهما يُستخدم في دراسة العائد.")}</div>
          <Labeled label="Status">
            <select className="select" value={u.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>
            </select>
          </Labeled>
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

