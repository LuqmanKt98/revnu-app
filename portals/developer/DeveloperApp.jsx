"use client";
// Developer Admin — back-office for ONE developer.
// Read-mostly. Orders, inventory, team, financials.

import React, { useState, useMemo } from "react";
import D from "@/lib/data/store";
import { useStoreVersion } from "@/lib/data/useStore";

const params = new URLSearchParams(window.location.search);
const devId = params.get("dev") || (D.DEVELOPERS[0] && D.DEVELOPERS[0].id);
const developer = D.devById(devId) || D.DEVELOPERS[0];

// Apply the developer's brand color so the sidebar accent matches.
document.documentElement.style.setProperty("--brand",      developer.brand.primary);
document.documentElement.style.setProperty("--brand-deep", developer.brand.deep);
document.documentElement.style.setProperty("--brand-soft", developer.brand.soft);
document.documentElement.style.setProperty("--brand-text", developer.brand.text);

const ICONS = {
  dash:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="14" width="7.5" height="7" rx="1.5"/></svg>,
  orders:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,
  units:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>,
  team:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 21c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M14.5 21c0-2.5 2-4.5 4.5-4.5"/></svg>,
  money:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18l5-6 4 4 6-8 3 4"/><path d="M3 21h18"/></svg>,
  projects:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V8l5-3v16"/><path d="M14 21V11l5 2v8"/><path d="M7 11h0M7 14h0M7 17h0M16 16h0M16 18h0"/></svg>,
  perf:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-5 3 3 5-7"/></svg>,
};

const TT = (s) => (window.I18N ? window.I18N.t(s) : s);
const NAV = [
  { id: "dash",      label: "Dashboard",          icon: ICONS.dash },
  { id: "projects",  label: "Projects",           icon: ICONS.projects },
  { id: "orders",    label: "Orders",             icon: ICONS.orders },
  { id: "milestones",label: "Revnu payments",   icon: ICONS.money },
  { id: "units",     label: "Inventory",          icon: ICONS.units },
  { id: "team",      label: "Sales team",         icon: ICONS.perf },
  { id: "users",     label: "Users & roles",      icon: ICONS.team || ICONS.perf },
  { id: "money",     label: "Financials",         icon: ICONS.money },
];

const REP_NAV = [
  { id: "mine",     label: "My deals",      icon: ICONS.orders },
  { id: "earnings", label: "My earnings",   icon: ICONS.money },
  { id: "units",    label: "Inventory",     icon: ICONS.units },
];

// Logged-in user. URL can force the sales-rep view: ?as=rep (optionally &u=<userId>),
// so links from the sales portal land on the rep's "My deals" home even without a session.
let session = null;
try { session = JSON.parse(sessionStorage.getItem("revnu_session") || localStorage.getItem("revnu_session") || "null"); } catch (e) {}
const asRole = params.get("as");          // "rep" | "admin" (default: admin)
const forcedUser = params.get("u");
const findAdmin = () => D.USERS.find((u) => u.developerId === developer.id && u.role === "developer_admin") || D.USERS.find((u) => u.developerId === developer.id);
const findRep   = () => D.USERS.find((u) => u.developerId === developer.id && D.devHasPerm(u, "orders") && !D.devHasPerm(u, "team")) || D.USERS.find((u) => u.developerId === developer.id && u.role === "sales_rep") || findAdmin();
// ---- Who is here? The SESSION decides; URL params only narrow the view. ----
//  · session user of THIS developer      → that user, permissions enforced
//  · Revnu staff session                  → impersonate (admin, or ?u= for a rep demo)
//  · session of another developer / none → back to this developer's login
let me = null;
const sessionUser = session && (D.userById(session.id) || (session.role === "revnu_admin" ? session : null));
if (sessionUser && sessionUser.developerId === developer.id) {
  me = sessionUser;
} else {
  // No cross-account shortcuts: Revnu staff (or anyone else) must sign in with an account of THIS developer.
  location.replace("/login");
  throw new Error("redirecting to login");
}
if (!me) me = findAdmin();
const PERM_FOR_PAGE = { dash: null, projects: "projects", orders: "orders", milestones: "financials", units: "inventory", team: "team", users: "team", money: "financials" };
const canSee = (pageId) => !PERM_FOR_PAGE[pageId] || D.devHasPerm(me, PERM_FOR_PAGE[pageId]);

// ============================================================
// Order status flow — there's a single forward path the team follows:
//   draft → signed → active → completed
// "draft"   = sales rep is still building the offer in the sales wizard
// "signed"  = customer signed the contract (rep marks it on hand-off)
// "active"  = unit handed over, now operating & paying out
// "completed" = end of the operating term / contract fulfilled
// ("review" is an older optional state — we treat it like draft.)
// ============================================================
const STATUS_ORDER = ["active", "issued", "signed", "paid"];
const STATUS_INFO = {
  draft:     { label: "Submitted", labelAr: "مُقدَّمة", when: "Deal submitted — contract not issued yet", whenAr: "صفقة مُقدَّمة — لم يصدر العقد بعد", next: "issued", nextLabel: "Issue contract" },
  review:    { label: "Submitted", labelAr: "مُقدَّمة", when: "Deal submitted — contract not issued yet", whenAr: "صفقة مُقدَّمة — لم يصدر العقد بعد", next: "issued", nextLabel: "Issue contract" },
  active:    { label: "Submitted", labelAr: "مُقدَّمة", when: "Deal submitted — contract not issued yet", whenAr: "صفقة مُقدَّمة — لم يصدر العقد بعد", next: "issued", nextLabel: "Issue contract" },
  issued:    { label: "Contract issued", labelAr: "صدر العقد", when: "Sent to the customer for signature", whenAr: "أُرسل للعميل للتوقيع", next: "signed", nextLabel: "Mark signed" },
  signed:    { label: "Signed", labelAr: "موقّع", when: "Signed contract uploaded — awaiting first payment", whenAr: "رُفع العقد الموقّع — بانتظار الدفعة الأولى", next: "paid", nextLabel: "Mark customer paid" },
  paid:      { label: "Customer paid", labelAr: "دفع العميل", when: "First payment in — Revnu invoices the developer, commission earned", whenAr: "وصلت الدفعة الأولى — تُفوتر Revnu المطوّر وتُستحق العمولة", next: null, nextLabel: null },
  cancelled: { label: "Cancelled", labelAr: "مُلغى", when: "Cancelled — units released, excluded from all figures", whenAr: "مُلغى — تحرّرت الوحدات واستُثني من كل الأرقام", next: null, nextLabel: null },
  completed: { label: "Customer paid", labelAr: "دفع العميل", when: "First payment in", whenAr: "وصلت الدفعة الأولى", next: null, nextLabel: null },
};
const STATUS_FLOW = ["active", "issued", "signed", "paid"];
const statusLabel = (st) => { const i = STATUS_INFO[st]; if (!i) return st; return (window.I18N && window.I18N.isAR) ? i.labelAr : i.label; };
function canAdvance(role, from) {
  const info = STATUS_INFO[from];
  if (!info?.next) return false;
  if (role === "sales_rep") return ["active", "issued", "signed"].includes(from); // reps drive active→issue→sign→paid
  return true; // developer_admin & revnu_admin can advance any step
}

const STATUS_CHIP = {
  draft:     "chip",
  review:    "chip",
  active:    "chip",
  issued:    "chip chip-warning",
  signed:    "chip chip-brand",
  paid:      "chip chip-positive",
  completed: "chip chip-positive",
  cancelled: "chip chip-negative",
};
const CAN_CANCEL = !!me && D.devHasPerm(me, "cancel");

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

function UserMenu({ me, roleLabel, onSignOut, canSwitch, inSales, onSales, onAdmin }) {
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
          <span style={{ display: "block", fontSize: 10.5, color: "var(--text-soft)", whiteSpace: "nowrap" }}>{roleDisplay(me)}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-soft)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", insetInlineEnd: 0, top: "calc(100% + 8px)", width: 240, background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.14)", padding: 8, zIndex: 100 }}>
          <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--line)", marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{me.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 1 }}>{me.email || roleDisplay(me)}</div>
          </div>
          <div style={{ padding: "4px 10px 8px" }}>
            {canSwitch && (
              <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
                <button type="button" onClick={() => { setOpen(false); (inSales ? onAdmin : onSales)(); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", border: "none", borderRadius: 8, background: inSales ? "transparent" : "var(--brand-soft)", cursor: "pointer", color: "var(--text)", fontSize: 13, fontWeight: 600 }}>
                  {inSales ? TL("⚙ Admin workspace", "⚙ مساحة الإدارة") : TL("📋 My deals (sales)", "📋 صفقاتي (المبيعات)")}
                </button>
                {!inSales && <button type="button" onClick={() => { setOpen(false); onAdmin(); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--text-soft)", fontSize: 12.5 }}>
                  {TL("You're in the admin view", "أنت في عرض الإدارة")}
                </button>}
              </div>
            )}
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

function App() {
  const canSell = me && D.devHasPerm(me, "orders");
  const isAdminish = me && (D.devHasPerm(me, "team") || D.devHasPerm(me, "projects"));
  const isRep = canSell && !isAdminish;
  const [salesView, setSalesView] = useState(asRole === "rep" && canSell);
  const inRep = isRep || salesView;
  const [page, setPage] = useState((isRep || (asRole === "rep" && canSell)) ? "mine" : "dash");
  const [selectedProject, setSelectedProject] = useState(null);
  const [orderVersion, setOrderVersion] = useState(0);
  const orders = useMemo(() => D.ORDERS.filter((o) => o.developerId === developer.id), [orderVersion]);
  const myOrders = useMemo(() => orders.filter((o) => o.repId === me?.id), [orders, me?.id]);
  const advanceStatus = (orderId) => {
    const cur = D.ORDERS.find((o) => o.id === orderId)?.status;
    if (!cur) return;
    const next = STATUS_INFO[cur]?.next;
    if (!next || !canAdvance(me?.role, cur)) return;
    const o = D.ORDERS.find((x) => x.id === orderId);
    if (cur === "issued" && !o.signedContractUrl) { alert(window.I18N && window.I18N.isAR ? "ارفع العقد الموقّع أولاً — من بطاقة الطلب." : "Upload the signed contract first — open the order card."); return; }
    if (cur === "signed" && !o.paymentProofUrl) {
      // Customer paid → proof of payment is mandatory before the deal moves on.
      if (!window.RevnuSupport) return;
      window.RevnuSupport.pickFile(".pdf,image/*").then((f) => {
        if (!f) return;
        window.RevnuSupport.storeFile("revnu_payment_proofs", orderId, f);
        D.updateOrder(orderId, { paymentProofUrl: f.name, paidAt: new Date().toISOString().slice(0, 10), status: next });
        setOrderVersion((v) => v + 1);
        window.RevnuSupport.toast(window.I18N && window.I18N.isAR ? "تم حفظ إثبات الدفع ونقل الصفقة إلى «دفع العميل»." : "Proof of payment saved — deal moved to Customer paid.");
      });
      return;
    }
    D.updateOrder(orderId, { status: next });
    setOrderVersion((v) => v + 1);
  };
  const [gOrder, setGOrder] = useState(null);
  window.__revnu_openOrder = (id) => setGOrder(D.ORDERS.find((x) => x.id === id) || null);
  React.useEffect(() => { if (window.RevnuSupport) window.RevnuSupport.firstRun(inRep ? "rep" : "developer"); }, []);
  // Make advanceStatus available to nested components via window for simplicity
  window.__revnu_advanceStatus = advanceStatus;
  window.__revnu_bump = () => setOrderVersion((v) => v + 1);
  window.__revnu_role = me?.role;
  window.__revnu_isRep = isRep;

  const signOut = () => {
    try { sessionStorage.removeItem("revnu_session"); localStorage.removeItem("revnu_session"); } catch (e) {}
    location.href = "/login";
  };

  const nav = inRep ? REP_NAV : NAV.filter((n) => canSee(n.id));
  const enterSales = () => { setSalesView(true); setPage("mine"); setSelectedProject(null); };
  const enterAdmin = () => { setSalesView(false); setPage("dash"); setSelectedProject(null); };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          {developer.logo ? (
            <div className="col" style={{ gap: 5 }}>
              <span style={{ display: "inline-flex", alignItems: "center", background: "var(--brand)", borderRadius: 8, padding: "7px 13px" }}>
                <img src={developer.logoDark || developer.logo} alt={developer.name} style={{ height: 22, display: "block" }} />
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-soft)", letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 2 }}>{developer.domain}</span>
            </div>
          ) : (
            <React.Fragment>
              <span className="dev-glyph">{developer.initials}</span>
              <div className="col" style={{ lineHeight: 1.1 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 17, letterSpacing: "-0.005em" }}>{developer.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{developer.domain}</span>
              </div>
            </React.Fragment>
          )}
        </div>
        <div className="row" style={{ gap: 12 }}>
          {window.RevnuSupport && <window.RevnuSupport.SupportButtons portal={inRep ? "rep" : "developer"} />}
          {me && <UserMenu me={me} roleLabel={roleLabel} onSignOut={signOut}
            canSwitch={canSell && !isRep} inSales={salesView} onSales={enterSales} onAdmin={enterAdmin} />}
        </div>
        {gOrder && <OrderDrawer order={gOrder} onClose={() => { setGOrder(null); setOrderVersion((v) => v + 1); }} />}
      </header>

      <div className="app-body">
        <aside className="sidebar">
          {nav.map((n) => (
            <div key={n.id} className={"side-link " + (page === n.id ? "active" : "")} onClick={() => setPage(n.id)}>
              {n.icon}<span>{window.I18N ? window.I18N.t(n.label) : n.label}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ flex: 1 }} />
        </aside>

        <main>
          <div className="page-body">
            {page === "dash"      && <Dashboard orders={orders} onOpenProject={(id) => { setSelectedProject(id); setPage("projects"); }} />}
            {page === "projects"  && canSee("projects") && <Projects orders={orders} selectedId={selectedProject} setSelectedId={setSelectedProject} />}
            {page === "orders"    && canSee("orders") && <Orders orders={orders} />}
            {page === "milestones"&& canSee("milestones") && <Milestones orders={orders} />}
            {page === "units"     && <Inventory />}
            {page === "team"      && canSee("team") && <Team orders={orders} />}
            {page === "users"     && canSee("users") && <DevUsers />}
            {page === "money"     && canSee("money") && <Money orders={orders} />}
            {!inRep && page !== "dash" && page !== "units" && !canSee(page) && <div className="card card-pad muted" style={{ textAlign: "center" }}>{window.I18N && window.I18N.isAR ? "ليس لديك صلاحية لهذه الصفحة." : "You don't have access to this page."}</div>}
            {page === "mine"      && <RepDeals orders={myOrders} />}
            {page === "earnings"  && <RepEarnings orders={myOrders} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function roleLabel(r) {
  const TT = (x) => (window.I18N ? window.I18N.t(x) : x);
  if (r === "revnu_admin")     return TT("Revnu Admin");
  if (window.REVNU_DATA && window.REVNU_DATA.DEV_ROLES) {
    const dr = window.REVNU_DATA.DEV_ROLES.find((x) => x.id === r);
    if (dr) return (window.I18N && window.I18N.isAR) ? dr.ar : dr.en;
  }
  if (r === "developer_admin") return TT("Developer Admin");
  if (r === "sales_rep")       return window.I18N ? window.I18N.t("Sales Rep") : "Sales Rep";
  return r;
}
// Display a user's role: free-typed text wins (bilingual), else the known-id label.
function roleDisplay(u) {
  if (!u) return "";
  const AR = window.I18N && window.I18N.isAR;
  const known = window.REVNU_DATA && window.REVNU_DATA.DEV_ROLES.find((x) => x.id === u.role);
  if (!known && u.role && u.role !== "revnu_admin") return AR ? (u.roleAr || u.role) : (u.role || u.roleAr || "");
  if (AR && u.roleAr) return u.roleAr;
  return roleLabel(u.role);
}

/* ============================================================
   Dashboard
============================================================ */
function Dashboard({ orders, onOpenProject }) {
  const AR = window.I18N && window.I18N.isAR;
  const submitted  = orders.filter(D.isSubmitted).length;
  const issued     = orders.filter(D.isContractOut).length;
  const signedOnly = orders.filter((o) => o.status === "signed").length;
  const paidN      = orders.filter(D.isCustomerPaid).length;
  const addOnsTotal = orders.filter(D.isSigned).reduce((s, o) => s + addOnsFor(o), 0);
  const addOnsPipe  = orders.filter((o) => D.isLive(o) && !D.isSigned(o)).reduce((s, o) => s + addOnsFor(o), 0);
  const projects   = D.PROJECTS.filter((p) => p.developerId === developer.id);
  const units      = D.UNITS.filter((u) => projects.some((p) => p.id === u.projectId));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N ? window.I18N.t("Dashboard") : "Dashboard"}</h1>
          <p className="page-sub">{window.I18N && window.I18N.isAR ? ("نظرة على كل صفقة نشطة عبر مشاريع " + developer.name + " (" + projects.length + ").") : ("An overview of every live deal across the " + projects.length + " project" + (projects.length > 1 ? "s" : "") + " of " + developer.name + ".")}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <Stat label={AR ? "عقود قيد التوقيع" : "Contracts out"} value={issued + submitted} delta={AR ? `${submitted} مُقدَّمة · ${issued} صدر عقدها` : `${submitted} submitted · ${issued} issued`} />
        <Stat label={AR ? "موقّعة · بانتظار الدفع" : "Signed · awaiting payment"} value={signedOnly} delta={AR ? `${units.length} وحدة في المخزون` : `${units.length} units in inventory`} />
        <Stat label={AR ? "عملاء دفعوا" : "Customer paid"} value={paidN} delta={AR ? "استُحقّت العمولة وفوترة Revnu" : "commission earned · Revnu invoiced"} />
        <Stat label={AR ? "إضافات مباعة" : "Extras sold"} value={D.fmtSAR(addOnsTotal)} unit="SAR" delta={AR ? `موقّعة أو مدفوعة · ${D.fmtSAR(addOnsPipe)} قيد التوقيع` : `signed or paid · ${D.fmtSAR(addOnsPipe)} awaiting signature`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        <div className="card">
          <div className="row-between" style={{ padding: "16px 20px 0" }}>
            <div>
              <div className="eyebrow">{TT("Recent orders")}</div>
              <div className="display-sm" style={{ marginTop: 2 }}>Latest 5</div>
            </div>
          </div>
          <table className="tbl tbl-flush" style={{ marginTop: 8 }}>
            <thead><tr><th>{TT("Ref")}</th><th>{TT("Customer")}</th><th>{TT("Unit")}</th><th>{TT("Operating")}</th><th>{TT("Status")}</th><th className="right">{TT("Extras")}</th></tr></thead>
            <tbody>
              {orders.slice(0, 5).map((o) => (
                <tr key={o.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{o.id}</td>
                  <td>{o.customerName}</td>
                  <td className="mono">{(o.unitNumbers && o.unitNumbers.length ? o.unitNumbers : [o.unitNumber]).join(" · ")}</td>
                  <td style={{ fontSize: 12.5 }}>{D.opsById(o.opsId)?.name || <span className="soft">—</span>}</td>
                  <td><span className={STATUS_CHIP[o.status]}>{statusLabel(o.status)}</span></td>
                  <td className="right mono">{D.fmtSAR(o.furnishCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card card-pad-lg">
          <div className="row-between" style={{ marginBottom: 4 }}>
            <div className="eyebrow">{TT("Projects")}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => onOpenProject && onOpenProject(null)}>{AR ? "عرض الكل ←" : "View all →"}</button>
          </div>
          <div className="stack-md" style={{ marginTop: 12 }}>
            {projects.map((p) => {
              const projUnits = D.UNITS.filter((u) => u.projectId === p.id);
              const sold      = projUnits.filter((u) => u.status === "sold").length;
              const reserved  = projUnits.filter((u) => u.status === "reserved").length;
              const avail     = projUnits.filter((u) => u.status === "available").length;
              const deals     = orders.filter((o) => o.projectId === p.id).length;
              return (
                <div key={p.id} onClick={() => onOpenProject && onOpenProject(p.id)} style={{ cursor: "pointer", padding: "8px 10px", margin: "-8px -10px", borderRadius: 8, transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-sunken)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <div className="row-between">
                    <strong>{window.I18N && window.I18N.isAR && p.nameAr ? p.nameAr : p.name}</strong>
                    <span className="soft" style={{ fontSize: 11 }}>{p.delivery} {AR ? "←" : "→"}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{p.city} · {projUnits.length} {AR ? "وحدة في النظام" : "units in system"} · {deals} {AR ? "صفقة" : (deals === 1 ? "deal" : "deals")}</div>
                  <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: "var(--bg-tint)", overflow: "hidden", display: "flex" }}>
                    <div style={{ width: ((sold / (projUnits.length || 1)) * 100) + "%", height: "100%", background: "var(--brand)" }} />
                    <div style={{ width: ((reserved / (projUnits.length || 1)) * 100) + "%", height: "100%", background: "var(--warning, #b8860b)" }} />
                  </div>
                  <div className="row-between" style={{ marginTop: 4 }}>
                    <span className="soft" style={{ fontSize: 11 }}>{sold} {AR ? "مباعة" : "sold"}{reserved ? " · " + reserved + (AR ? " محجوزة" : " reserved") : ""}</span>
                    <span className="soft" style={{ fontSize: 11 }}>{avail} {AR ? "متاحة" : "available"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, unit, delta }) {
  return (
    <div className="stat">
      <div className="stat-label">{window.I18N ? window.I18N.t(label) : label}</div>
      <div className="stat-value">{value} <span className="muted" style={{ fontSize: 13, fontFamily: "var(--font)", fontWeight: 400 }}>{unit}</span></div>
      {delta && <div className="stat-delta">{delta}</div>}
    </div>
  );
}

/* ============================================================
   Projects — list of all projects this developer has on Revnu,
   with drill-down into a project-scoped view (units, orders,
   sales-rep performance on extras).
============================================================ */
function Projects({ orders, selectedId, setSelectedId }) {
  const projects = D.PROJECTS.filter((p) => p.developerId === developer.id);
  if (selectedId) {
    const p = projects.find((x) => x.id === selectedId);
    if (p) return <ProjectDetail project={p} onBack={() => setSelectedId(null)} />;
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N ? window.I18N.t("Projects") : "Projects"}</h1>
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "لكل مشروع على Revnu وحداته وطلباته وأداء مبيعاته. انقر على مشروع للتفاصيل." : "Each project on Revnu has its own units, orders and sales performance. Click into a project to drill down."}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
        {projects.map((p) => {
          const projUnits  = D.UNITS.filter((u) => u.projectId === p.id);
          const sold       = projUnits.filter((u) => u.status === "sold").length;
          const reserved   = projUnits.filter((u) => u.status === "reserved").length;
          const avail      = projUnits.filter((u) => u.status === "available").length;
          const pOrders    = orders.filter((o) => o.projectId === p.id);
          const pClosed    = pOrders.filter(D.isSigned);
          const addOns     = pClosed.reduce((s, o) => s + addOnsFor(o), 0);
          const monthly    = pOrders.filter(D.isOperating).reduce((s, o) => s + o.monthlyNet, 0);
          const reps       = D.USERS.filter((u) => u.developerId === developer.id && D.devHasPerm(u, "orders") && (!u.assignedProjectIds || u.assignedProjectIds.length === 0 || u.assignedProjectIds.includes(p.id)));
          const cm         = D.milesByProject(p.id);
          return (
            <div key={p.id} className="card card-pad-lg" onClick={() => setSelectedId(p.id)} style={{ cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-pop)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = ""; }}>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <div>
                  <div className="eyebrow">{TT("// PROJECT")}</div>
                  <div className="display-sm" style={{ marginTop: 2 }}>{p.name}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{p.city} · {window.I18N && window.I18N.isAR ? "التسليم" : "delivery"} {p.delivery}</div>
                </div>
                <span className="chip">{projUnits.length} {window.I18N && window.I18N.isAR ? "وحدة" : "units"}</span>
              </div>

              {/* Sales progress */}
              <div style={{ marginTop: 16 }}>
                <div className="row-between" style={{ fontSize: 11.5, color: "var(--text-soft)", marginBottom: 4 }}>
                  <span>{window.I18N && window.I18N.isAR ? `${sold} مباعة · ${reserved} محجوزة · ${avail} متاحة` : `${sold} sold · ${reserved} reserved · ${avail} available`}</span>
                  <span className="mono">{Math.round((sold / Math.max(1, projUnits.length)) * 100)}% {window.I18N && window.I18N.isAR ? "مباع" : "sold"}</span>
                </div>
                <div style={{ display: "flex", height: 8, borderRadius: 4, background: "var(--bg-tint)", overflow: "hidden" }}>
                  <div style={{ width: ((sold / Math.max(1, projUnits.length)) * 100) + "%", background: "var(--brand)" }} />
                  <div style={{ width: ((reserved / Math.max(1, projUnits.length)) * 100) + "%", background: "var(--warning)" }} />
                </div>
              </div>

              {/* KPI grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div>
                  <div className="eyebrow" style={{ fontSize: 10 }}>{TT("// ORDERS")}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500, marginTop: 2 }}>{pOrders.length}</div>
                </div>
                <div>
                  <div className="eyebrow" style={{ fontSize: 10 }}>{TT("// EXTRAS SOLD")}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500, marginTop: 2 }}>{D.fmtSAR(addOns)}</div>
                  <div className="soft" style={{ fontSize: 10 }}>SAR · {window.I18N && window.I18N.isAR ? "موقّعة" : "signed"}</div>
                </div>
                <div>
                  <div className="eyebrow" style={{ fontSize: 10 }}>{window.I18N && window.I18N.isAR ? "// الإضافات" : "// EXTRAS"}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500, marginTop: 2 }}>{D.fmtSAR(addOns)}</div>
                  <div className="soft" style={{ fontSize: 10 }}>SAR</div>
                </div>
              </div>

              <div className="row-between" style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--text-soft)" }}>
                <span>{window.I18N && window.I18N.isAR ? `${reps.length} مندوب · ${cm.length} مرحلة إنشائية` : `${reps.length} rep${reps.length === 1 ? "" : "s"} · ${cm.length} construction milestones`}</span>
                <span className="mono" style={{ color: "var(--brand)" }}>{window.I18N && window.I18N.isAR ? "فتح المشروع ←" : "Open project →"}</span>
              </div>
            </div>
          );
        })}
        {projects.length === 0 && <div className="card card-pad muted" style={{ gridColumn: "1 / -1", textAlign: "center" }}>No projects yet — contact Revnu to onboard your first project.</div>}
      </div>
    </>
  );
}

function ProjectDetail({ project, onBack }) {
  const AR = window.I18N && window.I18N.isAR;
  const allOrders = D.ORDERS.filter((o) => o.projectId === project.id);
  const projUnits = D.UNITS.filter((u) => u.projectId === project.id);
  const closed    = allOrders.filter(D.isSigned);
  const pipeline  = allOrders.filter((o) => D.isLive(o) && !D.isSigned(o));
  const active    = allOrders.filter(D.isOperating);
  const addOns    = closed.reduce((s, o) => s + addOnsFor(o), 0);
  const monthly   = active.reduce((s, o) => s + o.monthlyNet, 0);
  const attach    = closed.length ? Math.round((closed.filter(hasSmart).length / closed.length) * 100) : 0;
  const sold      = projUnits.filter((u) => u.status === "sold").length;
  const reserved  = projUnits.filter((u) => u.status === "reserved").length;
  const avail     = projUnits.filter((u) => u.status === "available").length;

  // Sales-rep performance for this project
  const reps = D.USERS.filter((u) => u.developerId === developer.id && D.devHasPerm(u, "orders"));
  const repPerf = reps.map((r) => {
    const mine    = allOrders.filter((o) => o.repId === r.id);
    const mClosed = mine.filter(D.isSigned);
    const addons  = mClosed.reduce((s, o) => s + addOnsFor(o), 0);
    const commission = mClosed.reduce((s, o) => s + commissionFor(o), 0);
    const smartCnt = mClosed.filter(hasSmart).length;
    return { rep: r, deals: mClosed.length, pipeline: mine.length - mClosed.length, addons, commission, smartCnt, attach: mClosed.length ? Math.round((smartCnt / mClosed.length) * 100) : 0 };
  }).filter((s) => s.deals + s.pipeline > 0).sort((a, b) => b.addons - a.addons);

  // Package mix
  const pkgs = D.PACKAGES.filter((p) => p.projectId === project.id);
  const pkgMix = pkgs.map((pk) => ({ pkg: pk, count: closed.filter((o) => o.packageId === pk.id).length }));
  const totalPkgs = pkgMix.reduce((s, x) => s + x.count, 0);

  // Operating-model mix — which operating model each customer chose
  const opsModels = D.OPS_MODELS.filter((o) => o.projectId === project.id);
  const opsMix = opsModels.map((om) => ({ ops: om, count: closed.filter((o) => o.opsId === om.id).length }));
  const totalOps = opsMix.reduce((s, x) => s + x.count, 0);
  const noOps = closed.filter((o) => !o.opsId).length;

  const [tab, setTab] = useState("overview");
  const c = project.commercials?.salesCommission || { kind: "pct", value: 0 };

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← All projects</button>
      </div>

      {/* Project header */}
      <div className="card card-pad-lg" style={{ marginBottom: 18, background: "linear-gradient(135deg, var(--brand-soft), transparent 70%)" }}>
        {project.heroImg && (
          <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 18, border: "1px solid var(--line)" }}>
            <img src={project.heroImg} alt="" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
            {(project.tagline || project.taglineAr) && (
              <div style={{ position: "absolute", insetInlineStart: 18, bottom: 14, color: "#fff", fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em", textShadow: "0 2px 12px rgba(0,0,0,0.45)" }}>{AR ? (project.taglineAr || project.tagline) : project.tagline}</div>
            )}
          </div>
        )}
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="eyebrow">{TT("// PROJECT WORKSPACE")}</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 500, letterSpacing: "-0.012em", margin: "6px 0 4px" }}>{AR && project.nameAr ? project.nameAr : project.name}</h1>
            <div className="muted" style={{ fontSize: 13.5 }}>{project.city} · {window.I18N && window.I18N.isAR ? "التسليم" : "delivery"} {project.delivery} · {projUnits.length} {window.I18N && window.I18N.isAR ? "وحدة إجمالاً" : "units total"}</div>
          </div>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <span className="chip">{project.features?.furnishing ? "Furnishing ✓" : "No furnishing"}</span>
            <span className="chip">{project.features?.fitout ? "Fit-out ✓" : "No fit-out"}</span>
            <span className="chip">{project.features?.smartHome ? "Smart home ✓" : "No smart home"}</span>
            <span className="chip">{project.features?.operations ? "Operations ✓" : "No operations"}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginTop: 22 }}>
          <Stat label="Units sold"      value={sold}  delta={`${reserved} reserved · ${avail} available`} />
          <Stat label="Orders"          value={allOrders.length} delta={window.I18N && window.I18N.isAR ? `${closed.length} مغلقة · ${pipeline.length} قيد الإعداد` : `${closed.length} closed · ${pipeline.length} drafting`} />
          <Stat label="Extras sold"      value={D.fmtSAR(addOns)} unit="SAR" delta="furnishing + smart home" />
          <Stat label="Smart-home attach" value={attach + "%"} delta={window.I18N && window.I18N.isAR ? `${closed.filter(hasSmart).length} من ${closed.length} صفقة` : `${closed.filter(hasSmart).length} of ${closed.length} deals`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="row" style={{ gap: 4, marginBottom: 14, borderBottom: "1px solid var(--line)" }}>
        {[["overview", TT("Overview")],["sales", TT("Sales team")],["orders", TT("Orders")],["inventory", TT("Inventory")]].map(([k, l]) => (
          <button key={k} className={"btn btn-sm " + (tab === k ? "btn-primary" : "btn-ghost")} style={{ borderRadius: 0, borderBottom: tab === k ? "2px solid var(--brand)" : "2px solid transparent", marginBottom: -1 }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14 }}>
          <div className="card card-pad-lg">
            <div className="eyebrow">{TT("// PACKAGE MIX · CLOSED DEALS")}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>{AR ? "الباقات الأكثر مبيعاً" : "Which furnishing packages are selling"}</div>
            <div className="stack-md" style={{ marginTop: 16 }}>
              {pkgMix.length === 0 || totalPkgs === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>No closed deals yet for this project.</div>
              ) : pkgMix.map((x) => (
                <div key={x.pkg.id}>
                  <div className="row-between" style={{ fontSize: 13, marginBottom: 4 }}>
                    <span><strong>{x.pkg.name}</strong> <span className="soft" style={{ fontSize: 11.5 }}>· {x.pkg.tier}</span></span>
                    <span className="mono" style={{ fontSize: 12 }}>{x.count} deal{x.count === 1 ? "" : "s"} · {Math.round((x.count / totalPkgs) * 100)}%</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-tint)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: ((x.count / totalPkgs) * 100) + "%", height: "100%", background: "var(--brand)" }} />
                  </div>
                </div>
              ))}
            </div>

            <hr className="hr-thin" style={{ margin: "22px 0 16px" }} />

            <div className="eyebrow">{TT("// OPERATING MODEL · CLOSED DEALS")}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>{AR ? "كيف اختار العملاء تشغيل وحداتهم" : "How customers chose to operate their units"}</div>
            <div className="stack-md" style={{ marginTop: 16 }}>
              {totalOps === 0 && noOps === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>No operating model tracked yet for this project.</div>
              ) : <>
                {opsMix.map((x) => {
                  const pct = totalOps + noOps > 0 ? Math.round((x.count / (totalOps + noOps)) * 100) : 0;
                  return (
                    <div key={x.ops.id}>
                      <div className="row-between" style={{ fontSize: 13, marginBottom: 4 }}>
                        <span>
                          <strong>{x.ops.name}</strong>
                          <span className="soft" style={{ fontSize: 11.5, marginLeft: 6 }}>· {x.ops.kind === "daily" ? "Nightly" : "Monthly+"} · op. fee {x.ops.mgmtFee}%</span>
                        </span>
                        <span className="mono" style={{ fontSize: 12 }}>{x.count} deal{x.count === 1 ? "" : "s"} · {pct}%</span>
                      </div>
                      <div style={{ height: 6, background: "var(--bg-tint)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: pct + "%", height: "100%", background: "var(--brand)" }} />
                      </div>
                    </div>
                  );
                })}
                {noOps > 0 && (
                  <div>
                    <div className="row-between" style={{ fontSize: 13, marginBottom: 4 }}>
                      <span><strong>No operating model</strong> <span className="soft" style={{ fontSize: 11.5 }}>· furnishing-only deals</span></span>
                      <span className="mono" style={{ fontSize: 12 }}>{noOps} deal{noOps === 1 ? "" : "s"} · {Math.round((noOps / (totalOps + noOps)) * 100)}%</span>
                    </div>
                    <div style={{ height: 6, background: "var(--bg-tint)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: Math.round((noOps / (totalOps + noOps)) * 100) + "%", height: "100%", background: "var(--text-soft)" }} />
                    </div>
                  </div>
                )}
              </>}
            </div>
          </div>

          <div className="card card-pad-lg">
            <div className="eyebrow">{TT("// COMMERCIALS")}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>{AR ? "كيف يُربح هذا المشروع" : "How this project pays"}</div>
            <div className="stack-md" style={{ marginTop: 14 }}>
              <Row k={AR ? "رسوم تشغيل العميل" : "Customer op. fee"}      v={(project.commercials?.customerOpsFeePct ?? 0) + "%"} />
              <Row k={AR ? "حصة المطوّر من التشغيل" : "Developer ops share"}   v={(project.commercials?.developerOpsSharePct ?? 0) + (AR ? "% من رسوم التشغيل" : "% of op. fee")} />
              <Row k={AR ? "عمولة المبيعات" : "Sales commission"}      v={c.kind === "pct" ? c.value + (AR ? "% من الإضافات" : "% of extras") : "SAR " + D.fmtSAR(c.value) + (AR ? " ثابت" : " flat")} />
              <Row k={AR ? "هامش العقد" : "Contract markup"}       v={project.commercials?.contractMarkup?.kind === "pct" ? project.commercials.contractMarkup.value + "%" : "SAR " + D.fmtSAR(project.commercials?.contractMarkup?.value)} />
              <Row k={AR ? "الإضافات المباعة" : "Extras sold"}           v={D.fmtSAR(addOns) + " SAR"} mono />
            </div>
            <div className="soft" style={{ fontSize: 11, marginTop: 14, padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: 6 }}>
              Sales reps earn commission on <strong>extras only</strong> (furnishing + smart home), not on the unit price.
            </div>
          </div>
        </div>
      )}

      {tab === "sales" && (
        <div className="card card-flush">
          <div className="row-between" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div className="eyebrow">{TT("// SALES LEADERBOARD · THIS PROJECT")}</div>
              <div className="display-sm" style={{ marginTop: 2 }}>{AR ? "أداء الإضافات" : "Extras performance"} — {project.name}</div>
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>{TT("Rep")}</th>
                <th className="right">Deals (closed / pipe)</th>
                <th className="right">Extras sold</th>
                <th className="right">Smart attach</th>
                <th className="right">{TT("Commission")}</th>
              </tr>
            </thead>
            <tbody>
              {repPerf.map((s, i) => (
                <tr key={s.rep.id}>
                  <td>{i < 3 ? <span className="chip chip-brand" style={{ padding: "2px 7px", fontSize: 10.5 }}>#{i + 1}</span> : <span className="soft mono" style={{ fontSize: 12 }}>#{i + 1}</span>}</td>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 600 }}>
                        {s.rep.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </span>
                      <div className="col" style={{ lineHeight: 1.2 }}>
                        <span style={{ fontWeight: 500 }}>{s.rep.name}</span>
                        <span className="soft" style={{ fontSize: 11 }}>{s.rep.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="right mono" style={{ fontSize: 12.5 }}><strong>{s.deals}</strong> <span className="soft">/ {s.pipeline}</span></td>
                  <td className="right mono" style={{ fontWeight: 600 }}>{D.fmtSAR(s.addons)} <span className="soft" style={{ fontSize: 10.5 }}>SAR</span></td>
                  <td className="right">
                    <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                        <div style={{ width: 64, height: 5, background: "var(--bg-strong)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: s.attach + "%", background: "var(--brand)" }} />
                        </div>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{s.attach}%</span>
                      </div>
                      <span className="soft" style={{ fontSize: 10.5 }}>{s.smartCnt} {window.I18N && window.I18N.isAR ? "من" : "of"} {s.deals}</span>
                    </div>
                  </td>
                  <td className="right mono" style={{ color: "var(--positive)", fontWeight: 600 }}>+{D.fmtSAR(s.commission)}</td>
                </tr>
              ))}
              {repPerf.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-soft)" }}>No rep activity on this project yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "orders" && <Orders orders={allOrders} />}

      {tab === "inventory" && (
        <div className="card card-flush">
          <table className="tbl">
            <thead><tr><th>{TT("Unit")}</th><th>{TT("Type")}</th><th>{TT("Tower")}</th><th>{TT("Floor")}</th><th>{TT("Area")}</th><th className="right">Price</th><th>{TT("Status")}</th></tr></thead>
            <tbody>
              {projUnits.map((u) => {
                const t = D.unitTypeById(u.typeId);
                const price = (t?.basePrice || 0) + (u.priceAdj || 0);
                const chip = u.status === "sold" ? "chip chip-positive" : u.status === "reserved" ? "chip chip-warning" : "chip";
                return (
                  <tr key={u.number}>
                    <td className="mono" style={{ fontWeight: 600 }}>{u.number}</td>
                    <td>{t?.name}</td>
                    <td>{u.tower}</td>
                    <td className="mono">{u.floor}</td>
                    <td className="mono">{t?.area} m²</td>
                    <td className="right mono">{D.fmtSAR(price)}</td>
                    <td><span className={chip} style={{ textTransform: "capitalize" }}>{window.I18N ? window.I18N.t(u.status) : u.status}</span></td>
                  </tr>
                );
              })}
              {projUnits.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--text-soft)" }}>No units in this project yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Orders
============================================================ */
function Orders({ orders }) {
  const [statusF, setStatusF] = useState("all");
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(null);
  const filtered = orders.filter((o) => {
    if (statusF === "all" ? o.status === "cancelled" : o.status !== statusF) return false;
    const q = query.trim().toLowerCase();
    if (q && ![o.id, o.customerName, ...(o.unitNumbers || [o.unitNumber])].some((x) => (x || "").toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N ? window.I18N.t("Orders") : "Orders"}</h1>
          <p className="page-sub">{orders.length} {window.I18N && window.I18N.isAR ? "طلب عبر مشاريعك." : "orders across your projects."}</p>
        </div>
      </div>

      {/* Status-flow legend */}
      <div className="card card-pad" style={{ marginBottom: 14, background: "var(--bg-sunken)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{TT("// ORDER STATUS FLOW")}</div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {STATUS_FLOW.map((s, i) => {
            const info = STATUS_INFO[s];
            return (
              <React.Fragment key={s}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className={STATUS_CHIP[s]} style={{ alignSelf: "flex-start" }}>{statusLabel(s)}</span>
                  <span className="soft" style={{ fontSize: 11 }}>{window.I18N && window.I18N.isAR ? info.whenAr : info.when}</span>
                </div>
                {i < 3 && <span style={{ color: "var(--text-soft)", fontSize: 16 }}>{window.I18N && window.I18N.isAR ? "←" : "→"}</span>}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder={window.I18N && window.I18N.isAR ? "ابحث بالمرجع أو العميل أو الوحدة…" : "Search by ref, customer, or unit…"} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="divider-v" style={{ height: 22 }} />
        <span className="muted" style={{ fontSize: 12 }}>{TT("Status")}</span>
        {["all"].concat(STATUS_FLOW).concat(["cancelled"]).map((s) => (
          <button key={s} className={"btn btn-sm " + (statusF === s ? "btn-primary" : "btn-secondary")} onClick={() => setStatusF(s)} style={s === "cancelled" ? { opacity: 0.8 } : undefined}>{s === "all" ? (window.I18N && window.I18N.isAR ? "الكل" : "All") : statusLabel(s)}{s === "cancelled" ? " (" + orders.filter((o) => o.status === "cancelled").length + ")" : ""}</button>
        ))}
        <span style={{ marginInlineStart: "auto", fontSize: 12, color: "var(--text-soft)" }}>{filtered.length} {window.I18N && window.I18N.isAR ? "مطابق" : "matching"}</span>
        <button className="btn btn-sm btn-secondary" onClick={() => D.downloadCSV("orders-" + developer.id + ".csv", filtered, [{ key: "id", label: "Ref" }, { label: "Customer", get: (o) => o.customerName }, { label: "Units", get: (o) => (o.unitNumbers || [o.unitNumber]).join(" ") }, { label: "Package", get: (o) => D.pkgById(o.packageId)?.name || "" }, { label: "Operating", get: (o) => D.opsById(o.opsId)?.name || "" }, { label: "Rep", get: (o) => D.userById(o.repId)?.name || "" }, { key: "createdAt", label: "Date" }, { key: "furnishCost", label: "Extras (SAR)" }, { key: "status", label: "Status" }])}>{TT("Export CSV")}</button>
      </div>

      <div className="card card-flush">
        <table className="tbl tbl-clickable">
          <thead>
            <tr>
              <th>{TT("Ref")}</th><th>{TT("Customer")}</th><th>{TT("Unit")}</th><th>{TT("Package")}</th><th>{TT("Operating")}</th><th>{TT("Rep")}</th><th>{TT("Date")}</th><th className="right">{TT("Extras")}</th><th className="right">{TT("Status")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const u = D.unitByNumber(o.unitNumber);
              return (
                <tr key={o.id} onClick={() => setOpen(o)}>
                  <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{o.id}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{o.customerName}</div>
                    <div className="soft" style={{ fontSize: 11 }}>{o.customerEmail}</div>
                  </td>
                  <td>
                    <div className="mono" style={{ fontWeight: 600 }}>{(o.unitNumbers && o.unitNumbers.length ? o.unitNumbers : [o.unitNumber]).join(" · ")}</div>
                    <div className="soft" style={{ fontSize: 11 }}>{(o.unitNumbers || []).length > 1 ? ((o.unitNumbers.length) + (window.I18N && window.I18N.isAR ? " وحدات" : " units")) : (window.I18N ? window.I18N.tx(u?.type, "name") : u?.type?.name)}</div>
                  </td>
                  <td>{D.pkgById(o.packageId)?.name}</td>
                  <td>{D.opsById(o.opsId)?.name}</td>
                  <td>{D.userById(o.repId)?.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{D.fmtDate(o.createdAt)}</td>
                  <td className="right mono">{D.fmtSAR(o.furnishCost)}</td>
                  <td className="right">
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                      <span className={STATUS_CHIP[o.status]}>{statusLabel(o.status)}</span>
                      {canAdvance(window.__revnu_role, o.status) && (
                        <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); if (o.status === "issued" && !o.signedContractUrl) setOpen(o); else window.__revnu_advanceStatus(o.id); }} title={STATUS_INFO[o.status]?.nextLabel} style={{ padding: "0 8px", height: 24, fontSize: 11 }}>
                          {o.status === "issued" && !o.signedContractUrl ? (window.I18N && window.I18N.isAR ? "⬆ رفع العقد الموقّع" : "⬆ Upload signed") : (window.I18N ? window.I18N.t(STATUS_INFO[o.status]?.nextLabel) : STATUS_INFO[o.status]?.nextLabel)} {window.I18N && window.I18N.isAR ? "←" : "→"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 36, color: "var(--text-soft)" }}>{orders.length === 0 ? (window.I18N && window.I18N.isAR ? "لا توجد طلبات بعد — تبدأ الطلبات من بوابة المبيعات." : "No orders yet — orders start in the sales portal.") : (window.I18N && window.I18N.isAR ? "لا توجد طلبات مطابقة. وسّع الفلاتر." : "No orders match. Widen the filters.")}</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <OrderDrawer order={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function OrderDrawer({ order: orderProp, onClose }) {
  const [, tick] = useState(0);
  const order = D.ORDERS.find((x) => x.id === orderProp.id) || orderProp;   // always the LIVE record, never a stale prop
  const u = D.unitByNumber(order.unitNumber);
  const pkg = D.pkgById(order.packageId);
  const ops = D.opsById(order.opsId);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 100,
      display: "flex", justifyContent: "flex-end",
    }} onClick={onClose}>
      <div style={{
        width: 480, background: "var(--bg-card)", height: "100vh",
        boxShadow: "var(--shadow-pop)", overflow: "auto",
      }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">{TT("Order")}</div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{order.id}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>

        <div style={{ padding: 24 }}>
          {(() => {
            const AR = window.I18N && window.I18N.isAR;
            const M = D.ORDER_STATUS_META || {};
            const meta = M[order.status] || {};
            const isRep = window.__revnu_isRep;
            const needsUpload = order.status === "issued" && !order.signedContractUrl;
            const uploadSigned = (e) => {
              const f = e.target.files && e.target.files[0]; if (!f) return;
              const fr = new FileReader();
              fr.onload = () => {
                try { if (f.size < 2500000) { const m = JSON.parse(localStorage.getItem("revnu_signed_files") || "{}"); m[order.id] = { name: f.name, type: f.type, data: fr.result }; localStorage.setItem("revnu_signed_files", JSON.stringify(m)); } } catch (err) {}
                D.updateOrder(order.id, { signedContractUrl: f.name, signedAt: new Date().toISOString().slice(0, 10) });
                if (order.status === "issued") window.__revnu_advanceStatus && window.__revnu_advanceStatus(order.id);   // a signed upload IS the "Signed" step
                window.__revnu_bump && window.__revnu_bump(); tick((x) => x + 1);
              };
              fr.readAsDataURL(f); e.target.value = "";
            };
            const steps = ["issued", "signed", "paid", "active"];
            const ci = steps.indexOf(order.status);
            return (
              <div style={{ marginBottom: 18, padding: "14px 16px", background: "var(--bg-sunken)", borderRadius: "var(--r-md)", border: "1px solid var(--line)" }}>
                <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {steps.map((s, i) => (
                    <React.Fragment key={s}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 14,
                        background: i <= ci ? "var(--brand)" : "transparent", color: i <= ci ? "var(--brand-text)" : "var(--text-muted)",
                        border: "1px solid " + (i <= ci ? "var(--brand)" : "var(--line-strong)") }}>
                        {AR ? (M[s]?.ar || s) : (M[s]?.en || s)}
                      </span>
                      {i < steps.length - 1 && <span className="soft" style={{ fontSize: 11 }}>{AR ? "←" : "→"}</span>}
                    </React.Fragment>
                  ))}
                </div>
                <div className="soft" style={{ fontSize: 12, marginBottom: 10 }}>· {window.I18N ? window.I18N.t(STATUS_INFO[order.status]?.when || "") : STATUS_INFO[order.status]?.when}</div>

                {/* Contract issue / signed upload */}
                <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: order.status === "paid" || D.firstPaymentReceived(order) ? 10 : 0 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => location.href = "/sales?dev=" + order.developerId + "&order=" + order.id}>{AR ? "تنزيل العقد" : "Download contract"}</button>
                  {order.signedContractUrl
                    ? <React.Fragment><span className="chip chip-positive">{AR ? "✓ العقد الموقّع: " : "✓ Signed: "}{order.signedContractUrl}</span>{(() => { let sf = null; try { sf = JSON.parse(localStorage.getItem("revnu_signed_files") || "{}")[order.id]; } catch (err) {} return sf && sf.data ? <a className="btn btn-sm btn-ghost" href={sf.data} download={sf.name}>{AR ? "تنزيل الموقّع" : "Download signed"}</a> : null; })()}</React.Fragment>
                    : <label className="btn btn-sm btn-ghost" style={{ cursor: "pointer" }}>{AR ? "رفع العقد الموقّع" : "Upload signed contract"}<input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" style={{ display: "none" }} onChange={uploadSigned} /></label>}
                  {order.paymentProofUrl ? (() => { const pf = window.RevnuSupport ? window.RevnuSupport.getFile("revnu_payment_proofs", order.id) : null; return <span className="chip chip-positive">{AR ? "✓ إثبات الدفع: " : "✓ Proof of payment: "}{pf && pf.data ? <a href={pf.data} download={pf.name} style={{ color: "inherit", textDecoration: "underline" }}>{order.paymentProofUrl}</a> : order.paymentProofUrl}</span>; })() : null}
                  {canAdvance(window.__revnu_role, order.status) && (
                    <button className="btn btn-sm btn-primary" style={{ marginInlineStart: "auto" }}
                      disabled={needsUpload}
                      title={needsUpload ? (AR ? "ارفع العقد الموقّع أولاً" : "Upload the signed contract first") : ""}
                      onClick={() => { window.__revnu_advanceStatus(order.id); onClose && onClose(); }}>
                      {order.status === "signed" ? (AR ? "⬆ إثبات الدفع · تأكيد دفع العميل" : "⬆ Proof of payment · customer paid") : (AR ? (meta.nextAr || M[STATUS_INFO[order.status]?.next]?.ar) : (meta.nextEn || STATUS_INFO[order.status]?.nextLabel))} {AR ? "←" : "→"}
                    </button>
                  )}
                </div>
                {order.status === "paid" && (
                  <div className="row" style={{ gap: 8, alignItems: "center", padding: "8px 10px", background: "var(--positive-soft, rgba(31,138,91,0.1))", borderRadius: "var(--r-sm)" }}>
                    <span style={{ fontSize: 13 }}>💰</span>
                    <span style={{ fontSize: 12, color: "var(--positive, #1f8a5b)", fontWeight: 600 }}>{AR ? "تم استلام الدفعة الأولى — يمكن لـ Revnu فوترة المطوّر لتحصيل الدفعة الأولى." : "First payment received — Revnu can now invoice the developer for the first instalment."}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {(() => { const AR = window.I18N && window.I18N.isAR; const L = (en, ar) => AR ? ar : en; const TX = (o, k) => window.I18N ? window.I18N.tx(o, k) : (o && o[k]); const unitsList = order.unitNumbers && order.unitNumbers.length ? order.unitNumbers : [order.unitNumber]; const per = order.perUnit || {}; const act = D.activityFor(order.id); return (<>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>{L("Buyer", "المشتري")}</h3>
          <Row k={L("Name", "الاسم")} v={AR && order.customer && order.customer.fullNameAr ? order.customer.fullNameAr : order.customerName} />
          <Row k={L("National ID", "رقم الهوية")} v={order.customerId} mono />
          <Row k={L("Mobile", "الجوال")} v={order.customer && order.customer.mobile} mono />
          <Row k={L("Buyer category", "فئة المشتري")} v={order.customer && order.customer.beneficiary ? L("Beneficiary · subsidised price", "مستفيد · سعر المستفيد") : L("Non-beneficiary · market price", "غير مستفيد · سعر السوق")} />
          <Row k={L("Email", "البريد")} v={order.customerEmail} />

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px" }}>{unitsList.length > 1 ? L("Units", "الوحدات") + " (" + unitsList.length + ")" : L("Unit", "الوحدة")}</h3>
          {unitsList.map((n) => { const uu = D.unitByNumber(n); const cfg = per[n] || {}; const pk = D.pkgById(cfg.packageId || order.packageId); const ds = D.designById(cfg.designId || order.designId); const sm = D.smartById(cfg.smartId || order.smartId); return (
            <div key={n} style={{ marginBottom: 8 }}>
              <Row k={n} v={uu ? TX(uu.type, "name") + " · " + (window.I18N ? window.I18N.t(uu.tower) : uu.tower) + " · " + (AR ? "الدور " : "floor ") + uu.floor + " · " + uu.type.area + " m²" : "—"} mono />
              {unitsList.length > 1 && <Row k={L("Config", "التجهيز")} v={[pk && TX(pk, "name"), ds && TX(ds, "name"), sm && TX(sm, "name")].filter(Boolean).join(" · ")} />}
            </div>); })}

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px" }}>{L("Furnishing", "التأثيث")}</h3>
          <Row k={L("Package", "الباقة")} v={pkg ? TX(pkg, "name") : L("Skipped", "بدون")} />
          {pkg && <Row k={L("Tier", "الفئة")} v={pkg.tier} />}
          <Row k={L("Design", "التصميم")} v={D.designById(order.designId) ? TX(D.designById(order.designId), "name") : "—"} />
          <Row k={L("Smart home", "المنزل الذكي")} v={D.smartById(order.smartId) ? TX(D.smartById(order.smartId), "name") : L("None", "بدون")} />
          <Row k={L("Fit-out", "التشطيب")} v={order.fitout ? (pkg?.fitout?.name || L("Fit-out", "تشطيب")) + L(" · included", " · مُضمَّن") : L("Not included", "غير مُضمَّن")} />
          {order.fitout && order.fitoutCost ? <Row k={L("Fit-out cost", "تكلفة التشطيب")} v={D.fmtSAR(order.fitoutCost) + " SAR"} mono /> : null}

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px" }}>{L("Operating", "التشغيل")}</h3>
          <Row k={L("Model", "النموذج")} v={ops ? TX(ops, "name") : L("Skipped", "بدون")} />
          {ops && <Row k={L("Operator fee", "رسوم التشغيل")} v={`${order.operatorFee}%`} />}

          <hr className="hr-thin" style={{ margin: "20px 0" }} />
          <div className="row-between" style={{ fontSize: 15 }}>
            <strong>{L("Extras incl. VAT (furnishing + smart + fit-out)", "الإضافات شاملة الضريبة (تأثيث + ذكي + تشطيب)")}</strong>
            <strong className="mono">{D.fmtSAR(order.furnishCost)} SAR</strong>
          </div>
          <div className="row-between" style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 4 }}>
            <span>{L("Unit price (settled under the purchase agreement)", "سعر الوحدة (يُسوَّى بموجب عقد الشراء)")}</span>
            <span className="mono">{D.fmtSAR(order.unitPrice)} SAR</span>
          </div>
          {(() => {
            const gross = Number(order.furnishCost) || 0, net = gross / 1.15;
            const proj = D.projById(order.projectId); const sc = (proj && proj.commercials && proj.commercials.salesCommission) || { kind: "pct", value: 0 };
            const pool = D.commissionPoolFor(order); const split = D.commissionSplit(order);
            if (!pool) return null;
            return (
              <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r-sm)", fontSize: 12 }}>
                <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{L("// SALES COMMISSION · ON EX-VAT EXTRAS", "// عمولة المبيعات · على الإضافات بدون الضريبة")}</div>
                <div className="row-between"><span>{L("Extras incl. VAT", "الإضافات شاملة الضريبة")}</span><span className="mono">{D.fmtSAR(gross)}</span></div>
                <div className="row-between"><span>{L("÷ 1.15 → ex-VAT base", "÷ 1.15 ← الأساس بدون الضريبة")}</span><span className="mono">{D.fmtSAR(net)}</span></div>
                <div className="row-between" style={{ fontWeight: 600 }}><span>{sc.kind === "pct" ? ("× " + sc.value + "% = " + L("commission pool", "إجمالي العمولة")) : L("Flat commission", "عمولة ثابتة")}</span><span className="mono">{D.fmtSAR(pool)} SAR</span></div>
                {split.map((sp, i) => <div key={i} className="row-between soft" style={{ fontSize: 11.5, paddingInlineStart: 10 }}><span>{sp.pct}% · {(AR && sp.levelNameAr) || sp.levelName} · {sp.userId ? ((AR && sp.userNameAr) || sp.userName) : L("unassigned", "غير مُسنَد")}</span><span className="mono">{D.fmtSAR(sp.amount)}</span></div>)}
              </div>
            );
          })()}

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px" }}>{L("Activity", "السجل")}</h3>
          {act.length === 0 && <div className="soft" style={{ fontSize: 12 }}>{L("No activity recorded yet.", "لا يوجد نشاط مسجّل بعد.")}</div>}
          {act.slice().reverse().map((a, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "118px 1fr", gap: 10, padding: "5px 0", borderBottom: "1px dotted var(--line)", fontSize: 12 }}>
              <span className="mono soft" style={{ fontSize: 10.5 }}>{new Date(a.at).toLocaleString(AR ? "ar-SA" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span>{a.event === "created" ? L("Order created", "أُنشئ الطلب") : a.event === "status" ? L("Status", "الحالة") + ": " + statusLabel(a.from) + " → " + statusLabel(a.to) : a.event === "upload" ? L("Signed contract uploaded", "رُفع العقد الموقّع") + " · " + a.file : a.event === "notification" ? "✉ " + L("Email queued", "بريد مُجدوَل") + ": " + (AR ? a.subjectAr : a.subject) + " → " + a.to : a.event === "invoice" ? L("Invoice created", "أُنشئت الفاتورة") + " " + a.invoice : a.event === "cancelled" ? L("Order cancelled", "أُلغي الطلب") + (a.reason ? " · " + a.reason : "") : a.event === "reinstated" ? L("Order reinstated", "استُعيد الطلب") + " → " + statusLabel(a.to) : a.event}<span className="soft"> · {a.by}</span></span>
            </div>
          ))}

          {order.status === "cancelled" && (
            <div className="card card-pad" style={{ marginTop: 18, background: "rgba(192,73,47,0.07)", border: "1px solid rgba(192,73,47,0.3)" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#c0492f" }}>{L("Cancelled", "طلب مُلغى")} · <span className="mono soft" style={{ fontWeight: 400, fontSize: 11 }}>{order.cancelledAt ? new Date(order.cancelledAt).toLocaleDateString(AR ? "ar-SA" : "en-GB") : ""}</span></div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>{order.cancelReason || L("No reason recorded.", "لم يُسجَّل سبب.")}</div>
              {order.cancelledBy && <div className="soft" style={{ fontSize: 11, marginTop: 4 }}>{L("By", "بواسطة")} {order.cancelledBy}</div>}
            </div>
          )}
          <div className="row" style={{ gap: 8, marginTop: 22, flexWrap: "wrap" }}>
            <button className="btn btn-secondary grow" onClick={() => location.href = "/sales?dev=" + order.developerId + "&order=" + order.id}>{L("Open agreement", "فتح الاتفاقية")}</button>
            {CAN_CANCEL && order.status !== "cancelled" && (
              <button className="btn btn-ghost" style={{ color: "#c0492f" }} onClick={() => {
                const why = prompt(L("Reason for cancelling " + order.id + " (required):", "سبب إلغاء الطلب " + order.id + " (إلزامي):"));
                if (why == null) return;
                if (!why.trim()) { alert(L("A reason is required.", "السبب إلزامي.")); return; }
                if (D.isCustomerPaid(order) && !confirm(L("The customer has already paid on this order. Cancelling will remove it from Revnu invoices and commissions. Continue?", "العميل دفع على هذا الطلب. الإلغاء سيُخرجه من فواتير Revnu والعمولات. هل تريد المتابعة؟"))) return;
                D.cancelOrder(order.id, why.trim(), me && (me.name || me.email)); onClose();
              }}>{L("Cancel order", "إلغاء الطلب")}</button>
            )}
            {CAN_CANCEL && order.status === "cancelled" && (
              <button className="btn btn-ghost" onClick={() => { const r = D.reinstateOrder(order.id); if (!r) alert(L("Cannot reinstate — a unit in this order is now in another live deal.", "لا يمكن الاستعادة — إحدى وحدات الطلب دخلت في صفقة أخرى.")); onClose(); }}>{L("Reinstate", "استعادة الطلب")}</button>
            )}
          </div>
          </>); })()}
        </div>
      </div>
    </div>
  );
}
function Row({ k, v, mono }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12, padding: "6px 0", borderBottom: "1px dotted var(--line)", fontSize: 13 }}>
      <span className="soft">{k}</span>
      <span className={mono ? "mono" : ""} style={{ fontWeight: 500 }}>{v || "—"}</span>
    </div>
  );
}

/* ============================================================
   Inventory — developer can ADD units and update STATUS
============================================================ */
function Inventory() {
  const isRep = me && D.devHasPerm(me, "orders") && !D.devHasPerm(me, "inventory");
  const projects = D.PROJECTS.filter((p) => p.developerId === developer.id);
  const initial = D.UNITS.filter((u) => projects.some((p) => p.id === u.projectId));
  const [units, setUnits] = useState(initial);
  const [projF, setProjF] = useState("all");
  const [stat,  setStat]  = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // unit or null
  const [adding, setAdding]   = useState(false);

  const filtered = units.filter((u) => {
    if (projF !== "all" && u.projectId !== projF) return false;
    if (stat !== "all" && u.status !== stat) return false;
    const q = query.trim().toLowerCase();
    if (q && ![u.number, u.tower, u.view].some((x) => x.toLowerCase().includes(q))) return false;
    return true;
  });

  const setStatus = (number, status) => {
    D.setUnitStatus(number, status);
    setUnits((all) => all.map((u) => u.number === number ? { ...u, status } : u));
  };
  const saveEdit = (next) => {
    setUnits((all) => all.map((u) => u.number === next.number ? next : u));
    setEditing(null);
  };
  const addUnit = (u) => {
    const created = D.addUnit({ ...u, priceAdj: Number(u.priceAdj) || 0, floor: Number(u.floor) || 0 });
    if (created) setUnits((all) => [created, ...all]);
    setAdding(false);
  };
  // CSV columns: number, projectId, typeId, tower, floor, view, priceAdj  (same as Export CSV)
  const bulkUpload = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = D.parseCSV(reader.result); let ok = 0, skipped = 0;
      rows.forEach((r) => { if (!r.number || !projects.some((p) => p.id === r.projectId)) { skipped++; return; } const c = D.addUnit({ number: r.number, projectId: r.projectId, typeId: r.typeId, tower: r.tower || "", floor: Number(r.floor) || 0, view: r.view || "", priceAdj: Number(r.priceAdj) || 0 }); if (c) { ok++; setUnits((all) => [c, ...all]); } else skipped++; });
      alert((window.I18N && window.I18N.isAR) ? (ok + " وحدة أُضيفت · " + skipped + " تم تجاوزها (مكرّرة أو مشروع غير معروف)") : (ok + " units added · " + skipped + " skipped (duplicate or unknown project)"));
    };
    reader.readAsText(f); e.target.value = "";
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N ? window.I18N.t("Inventory") : "Inventory"}</h1>
          <p className="page-sub">{isRep
            ? (window.I18N && window.I18N.isAR ? "التوفّر المباشر عبر مشاريعك. تُدار الحالة من مدير المطوّر — هذا العرض للقراءة فقط." : "Live availability across your projects. Status is managed by your developer admin — this view is read-only.")
            : (window.I18N && window.I18N.isAR ? "أضف وحدات جديدة، وحدّد حالتها متاحة / محجوزة / مباعة. تظهر التغييرات مباشرةً لفريق مبيعاتك." : "Upload new units, mark them available / reserved / sold. Status changes show up live for your sales team.")}</p>
        </div>
        {!isRep && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => D.downloadCSV("units-" + developer.id + ".csv", filtered, [{ key: "number", label: "number" }, { key: "projectId", label: "projectId" }, { key: "typeId", label: "typeId" }, { key: "tower", label: "tower" }, { key: "floor", label: "floor" }, { key: "view", label: "view" }, { key: "priceAdj", label: "priceAdj" }, { key: "status", label: "status" }])}>{window.I18N?window.I18N.t("Export CSV"):"Export CSV"}</button>
            <label className="btn btn-secondary" style={{ cursor: "pointer" }}>{window.I18N?window.I18N.t("Bulk upload"):"Bulk upload"}<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={bulkUpload} /></label>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>{window.I18N?window.I18N.t("+ Add unit"):"+ Add unit"}</button>
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search unit…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" style={{ width: "auto" }} value={projF} onChange={(e) => setProjF(e.target.value)}>
          <option value="all">{window.I18N && window.I18N.isAR ? "كل المشاريع" : "All projects"}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={stat} onChange={(e) => setStat(e.target.value)}>
          <option value="all">{window.I18N && window.I18N.isAR ? "أي حالة" : "Any status"}</option>
          <option value="available">{window.I18N && window.I18N.isAR ? "متاحة" : "Available"}</option>
          <option value="reserved">{window.I18N && window.I18N.isAR ? "محجوزة" : "Reserved"}</option>
          <option value="sold">{window.I18N && window.I18N.isAR ? "مباعة" : "Sold"}</option>
        </select>
        <span style={{ marginInlineStart: "auto", fontSize: 12, color: "var(--text-soft)" }}>{window.I18N && window.I18N.isAR ? (filtered.length + " من " + units.length + " وحدة") : (filtered.length + " of " + units.length + " units")}</span>
      </div>

      <div className="card card-flush">
        <table className="tbl tbl-clickable">
          <thead><tr>
            <th>{TT("Unit #")}</th><th>{TT("Project")}</th><th>{TT("Type")}</th><th>{TT("Tower")}</th><th>{TT("Floor")}</th><th>{TT("Area")}</th><th>Price</th><th>{TT("Status")}</th>{!isRep && <th className="right">{TT("Actions")}</th>}
          </tr></thead>
          <tbody>
            {filtered.map((u) => {
              const t = D.unitTypeById(u.typeId);
              const p = D.projById(u.projectId);
              const price = (t?.basePrice || 0) + (u.priceAdj || 0);
              return (
                <tr key={u.number}>
                  <td className="mono" style={{ fontWeight: 600 }}>{u.number}</td>
                  <td>{p?.name}</td>
                  <td>{window.I18N ? window.I18N.tx(t, "name") : t?.name}</td>
                  <td>{window.I18N ? window.I18N.t(u.tower) : u.tower}</td>
                  <td className="mono">{u.floor}</td>
                  <td className="mono">{t?.area} m²</td>
                  <td className="mono">{D.fmtSAR(price)}</td>
                  <td>
                    {isRep
                      ? <span className={"chip " + (u.status === "available" ? "chip-positive" : u.status === "reserved" ? "chip-warning" : "chip")} style={{ textTransform: "capitalize" }}>{window.I18N ? window.I18N.t(u.status) : u.status}</span>
                      : D.isUnitTaken(u.number)
                        ? <span className="chip" title={window.I18N && window.I18N.isAR ? "مرتبطة بصفقة حيّة — تتحرّر عند حذف الطلب" : "Locked by a live deal — released if the order is deleted"}>🔒 {window.I18N && window.I18N.isAR ? "مباعة · صفقة حيّة" : "Sold · live deal"}</span>
                        : <select className="select" style={{ width: 120, height: 28, fontSize: 12 }} value={u.status} onChange={(e) => setStatus(u.number, e.target.value)}>
                          <option value="available">{window.I18N && window.I18N.isAR ? "متاحة" : "Available"}</option>
                          <option value="reserved">{window.I18N && window.I18N.isAR ? "محجوزة" : "Reserved"}</option>
                          <option value="sold">{window.I18N && window.I18N.isAR ? "مباعة" : "Sold"}</option>
                        </select>}
                  </td>
                  {!isRep && (
                    <td className="right">
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditing(u)}>Edit</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={isRep ? 8 : 9} style={{ textAlign: "center", padding: 36, color: "var(--text-soft)" }}>No units match.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <UnitEditDrawer unit={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}
      {adding && <UnitAddDrawer projects={projects} onClose={() => setAdding(false)} onAdd={addUnit} />}
    </>
  );
}

function UnitEditDrawer({ unit, onClose, onSave }) {
  const [u, setU] = useState({ ...unit });
  const set = (patch) => setU((prev) => ({ ...prev, ...patch }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 440, background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">{TT("// EDIT UNIT")}</div>
            <div className="display-sm mono" style={{ marginTop: 2 }}>{u.number}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <Labeled label="Tower"><input className="input" value={u.tower} onChange={(e) => set({ tower: e.target.value })} /></Labeled>
          <Labeled label="Floor"><input className="input mono" type="number" value={u.floor} onChange={(e) => set({ floor: Number(e.target.value) })} /></Labeled>
          <Labeled label="View"><input className="input" value={u.view} onChange={(e) => set({ view: e.target.value })} /></Labeled>
          <Labeled label="Price adjustment (SAR)">
            <input className="input mono" type="number" value={u.priceAdj} onChange={(e) => set({ priceAdj: Number(e.target.value) })} />
          </Labeled>
          <Labeled label="Status">
            <select className="select" value={u.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
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

function UnitAddDrawer({ projects, onClose, onAdd }) {
  const firstP  = projects[0];
  const types   = firstP ? D.UNIT_TYPES.filter((t) => t.projectId === firstP.id) : [];
  const [u, setU] = useState({
    number: "",
    projectId: firstP?.id || "",
    typeId: types[0]?.id || "",
    tower: "",
    floor: 1,
    view: "",
    priceAdj: 0,
    status: "available",
  });
  const set = (patch) => setU((prev) => {
    const next = { ...prev, ...patch };
    if (patch.projectId) {
      const ts = D.UNIT_TYPES.filter((t) => t.projectId === patch.projectId);
      next.typeId = ts[0]?.id || "";
    }
    return next;
  });
  const valid = u.number.trim() && u.projectId && u.typeId && u.tower.trim();
  const availTypes = D.UNIT_TYPES.filter((t) => t.projectId === u.projectId);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 460, background: "var(--bg-card)", height: "100vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">{TT("// ADD UNIT")}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>New inventory entry</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ×</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <Labeled label="Unit number *"><input className="input mono" value={u.number} onChange={(e) => set({ number: e.target.value })} placeholder="A-0512" /></Labeled>
          <Labeled label="Project *">
            <select className="select" value={u.projectId} onChange={(e) => set({ projectId: e.target.value })}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Labeled>
          <Labeled label="Unit type *">
            <select className="select" value={u.typeId} onChange={(e) => set({ typeId: e.target.value })}>
              {availTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Labeled>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Labeled label="Tower"><input className="input" value={u.tower} onChange={(e) => set({ tower: e.target.value })} placeholder="Cove A" /></Labeled>
            <Labeled label="Floor"><input className="input mono" type="number" value={u.floor} onChange={(e) => set({ floor: Number(e.target.value) })} /></Labeled>
          </div>
          <Labeled label="View"><input className="input" value={u.view} onChange={(e) => set({ view: e.target.value })} placeholder="Marina view" /></Labeled>
          <Labeled label="Price adjustment (SAR)"><input className="input mono" type="number" value={u.priceAdj} onChange={(e) => set({ priceAdj: Number(e.target.value) })} /></Labeled>
          <Labeled label="Status">
            <select className="select" value={u.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
            </select>
          </Labeled>
          <hr className="hr-thin" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" disabled={!valid} onClick={() => onAdd(u)}>Add unit</button>
            <button className="btn btn-ghost" onClick={onClose}>{window.I18N?window.I18N.t("Cancel"):"Cancel"}</button>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>Demo: the unit lives in this session only — no backend persistence yet.</div>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{window.I18N ? window.I18N.t(label) : label}</div>
      {children}
    </div>
  );
}

/* ============================================================
   Users & roles — invite and control authority (separate from Sales team)
============================================================ */
function DevUsers() {
  const AR = window.I18N && window.I18N.isAR;
  const [, bump] = useState(0);
  const [editing, setEditing] = useState(null);
  const projects = D.PROJECTS.filter((p) => p.developerId === developer.id);
  const users = D.USERS.filter((u) => u.developerId === developer.id);
  const isAdmin = !me || D.devHasPerm(me, "team");
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{AR ? "المستخدمون والصلاحيات" : "Users & roles"}</h1>
          <p className="page-sub">{AR ? "ادعُ أعضاء الفريق وتحكّم في أدوارهم وصلاحياتهم وصلاحية وصولهم للمشاريع." : "Invite team members and control their roles, permissions and project access."}</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setEditing({ _new: true, developerId: developer.id, name: "", nameAr: "", email: "", role: "", roleAr: "", perms: ["orders"], assignedProjectIds: [] })}>{AR ? "+ دعوة مستخدم" : "+ Invite user"}</button>}
      </div>
      <div className="card card-flush">
        <table className="tbl">
          <thead><tr><th>{TT("Name")}</th><th>{TT("Email")}</th><th>{TT("Role")}</th><th>{AR ? "المشاريع المعيّنة" : "Assigned projects"}</th>{isAdmin && <th className="right">{TT("Actions")}</th>}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                    <span>{(AR && u.nameAr) ? u.nameAr : u.name}{u.id === (me && me.id) ? <span className="soft" style={{ fontSize: 11 }}> ({AR ? "أنت" : "you"})</span> : ""}</span>
                  </div>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{u.email}</td>
                <td><span className="chip chip-brand">{roleDisplay(u)}</span></td>
                <td className="soft" style={{ fontSize: 12 }}>{!D.devHasPerm(u, "orders") ? "—" : (!u.assignedProjectIds || u.assignedProjectIds.length === 0 ? (AR ? "كل المشاريع" : "All projects") : u.assignedProjectIds.map((id) => { const p = D.projById(id); return (AR && p?.nameAr) ? p.nameAr : p?.name; }).join(window.I18N && window.I18N.isAR ? "، " : ", "))}</td>
                {isAdmin && <td className="right"><div className="row" style={{ gap: 6, justifyContent: "flex-end" }}><button className="btn btn-sm btn-ghost" onClick={() => setEditing({ ...u })}>{AR ? "إدارة" : "Manage"}</button>{u.id !== (me && me.id) && <button className="btn btn-sm btn-ghost" style={{ color: "var(--negative, #c0492f)" }} onClick={() => { if (confirm(AR ? ("إزالة " + (u.nameAr || u.name) + " من الفريق؟ سيفقد الوصول فورًا.") : ("Remove " + u.name + " from the team? They will lose access immediately."))) { D.removeDevUser(u.id); bump((x) => x + 1); } }}>{AR ? "إزالة" : "Remove"}</button>}</div></td>}
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--text-soft)" }}>{AR ? "لا يوجد مستخدمون بعد." : "No users yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <DevTeamDrawer member={editing} projects={projects} onClose={() => { setEditing(null); bump((x) => x + 1); }} />}
    </>
  );
}

/* ============================================================
   Sales team — performance on extras (furnishing + smart home)
============================================================ */
function Team({ orders }) {
  // Who shows on the sales leaderboard: anyone placed on a commission level OR who has closed deals.
  const onLadder = (u) => u.commissionLevelId || orders.some((o) => o.repId === u.id);
  const [reps, setReps] = useState(() => D.USERS.filter((u) => u.developerId === developer.id && onLadder(u)));
  const [editing, setEditing] = useState(null);
  const refresh = () => setReps(D.USERS.filter((u) => u.developerId === developer.id && onLadder(u)));
  const [sortKey, setSortKey] = useState("addons");
  const projects = D.PROJECTS.filter((p) => p.developerId === developer.id);
  const allClosed = orders.filter(D.isCustomerPaid);
  const allPending = orders.filter((o) => D.isLive(o) && !D.isCustomerPaid(o));
  const ladder = D.commissionLadderFor(developer.id);
  const scopeOf = (u) => { const lvl = ladder.find((l) => l.id === u.commissionLevelId); return lvl ? lvl.scope : "own"; };

  const stats = reps.map((r) => {
    const mine    = orders.filter((o) => o.repId === r.id);
    const closed  = mine.filter(D.isSigned);
    const pipeline= mine.filter((o) => D.isLive(o) && !D.isSigned(o));
    const addons      = closed.reduce((s, o) => s + addOnsFor(o), 0);
    const addonsPipe  = pipeline.reduce((s, o) => s + addOnsFor(o), 0);
    // Commission EARNED = this person's share across deals where the customer has paid; pending = the rest.
    const commission  = allClosed.reduce((s, o) => s + myShareFor(o, r.id), 0);
    const commissionPending = allPending.reduce((s, o) => s + myShareFor(o, r.id), 0);
    const smartCount  = closed.filter(hasSmart).length;
    const attach      = closed.length ? Math.round((smartCount / closed.length) * 100) : 0;
    const avgAddOn    = closed.length ? addons / closed.length : 0;
    return { rep: r, mine, closed, pipeline, addons, addonsPipe, commission, commissionPending, attach, avgAddOn, smartCount, isRep: scopeOf(r) === "own", scope: scopeOf(r) };
  });

  const sorted = [...stats].sort((a, b) => {
    if (!a.isRep && b.isRep) return 1;
    if (!b.isRep && a.isRep) return -1;
    if (sortKey === "addons")     return b.addons - a.addons;
    if (sortKey === "deals")      return b.closed.length - a.closed.length;
    if (sortKey === "attach")     return b.attach - a.attach;
    if (sortKey === "commission") return b.commission - a.commission;
    return 0;
  });

  const repsOnly = sorted.filter((s) => s.isRep);
  const teamAddons     = repsOnly.reduce((s, x) => s + x.addons, 0);
  const teamCommission = stats.reduce((s, x) => s + x.commission, 0);
  const teamPending    = stats.reduce((s, x) => s + x.commissionPending, 0);
  const teamDeals      = repsOnly.reduce((s, x) => s + x.closed.length, 0);
  const teamSmart      = repsOnly.reduce((s, x) => s + x.smartCount, 0);
  const teamAttach     = teamDeals ? Math.round((teamSmart / teamDeals) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N ? window.I18N.t("Sales team") : "Sales team"}</h1>
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "الأداء على الإضافات — التأثيث والمنزل الذكي. العمولة تُدفع على الإضافات فقط وتتوزّع على المندوب ومديره والإدارة حسب سلّم العمولة." : <>Performance on the <strong>extras</strong> — furnishing &amp; smart home. <strong>Commission is paid on extras only</strong> and splits across the rep, their manager and leadership per the commission ladder.</>}</p>
        </div>
      </div>

      {/* Team-wide rollups */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
        <Stat label="Extras sold"       value={D.fmtSAR(teamAddons)} unit="SAR" delta={window.I18N && window.I18N.isAR ? `${teamDeals} صفقة موقّعة` : `${teamDeals} signed deal${teamDeals === 1 ? "" : "s"}`} />
        <Stat label="Commission earned"  value={D.fmtSAR(teamCommission)} unit="SAR" delta={window.I18N && window.I18N.isAR ? `بعد دفع العميل · ${D.fmtSAR(teamPending)} معلّقة` : `after customer payment · ${D.fmtSAR(teamPending)} pending`} />
        <Stat label="Smart-home attach"  value={teamAttach + "%"} delta={window.I18N && window.I18N.isAR ? `${teamSmart} من ${teamDeals} صفقة` : `${teamSmart} of ${teamDeals} deals`} />
        <Stat label="Avg extras / deal"  value={D.fmtSAR(teamDeals ? teamAddons / teamDeals : 0)} unit="SAR" />
      </div>

      {/* Leaderboard */}
      <div className="card card-flush">
        <div className="row-between" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">{TT("// LEADERBOARD")}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>Sales reps · extras performance</div>
          </div>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 11.5 }}>Sort by</span>
            {[["addons","Extras sold"],["deals","Deals"],["attach","Smart attach"],["commission","Commission"]].map(([k, l]) => (
              <button key={k} className={"btn btn-sm " + (sortKey === k ? "btn-primary" : "btn-ghost")} onClick={() => setSortKey(k)}>{l}</button>
            ))}
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>{TT("Name")}</th>
              <th>{TT("Role")}</th>
              <th className="right">Deals (closed / pipe)</th>
              <th className="right">Extras sold</th>
              <th className="right">Avg extras / deal</th>
              <th className="right">Smart attach</th>
              <th className="right">{TT("Commission")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const isRep = s.isRep;
              const rank  = isRep ? repsOnly.findIndex((x) => x.rep.id === s.rep.id) + 1 : null;
              const proj  = projects.find((p) => p.id === (s.rep.assignedProjectIds || [])[0]);
              const c = proj?.commercials?.salesCommission || { kind: "pct", value: 0 };
              return (
                <tr key={s.rep.id} style={{ opacity: isRep ? 1 : 0.55 }}>
                  <td className="mono" style={{ color: "var(--text-soft)", fontSize: 12 }}>
                    {rank ? (rank <= 3 ? <span className="chip chip-brand" style={{ padding: "2px 7px", fontSize: 10.5 }}>#{rank}</span> : "#" + rank) : "—"}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
                        {s.rep.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </span>
                      <div className="col" style={{ lineHeight: 1.2 }}>
                        <span style={{ fontWeight: 500 }}>{(window.I18N && window.I18N.isAR && s.rep.nameAr) ? s.rep.nameAr : s.rep.name}</span>
                        <span className="soft" style={{ fontSize: 11 }}>{s.rep.email}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="chip">{roleDisplay(s.rep)}</span></td>
                  <td className="right mono" style={{ fontSize: 12.5 }}>
                    {isRep ? <><strong>{s.closed.length}</strong> <span className="soft">/ {s.pipeline.length}</span></> : "—"}
                  </td>
                  <td className="right mono" style={{ fontWeight: 600 }}>
                    {isRep ? <>{D.fmtSAR(s.addons)} <span className="soft" style={{ fontSize: 10.5 }}>SAR</span></> : "—"}
                    {isRep && s.addonsPipe > 0 && <div className="soft" style={{ fontSize: 10.5, fontWeight: 400 }}>+{D.fmtSAR(s.addonsPipe)} in pipe</div>}
                  </td>
                  <td className="right mono">{isRep ? D.fmtSAR(s.avgAddOn) : "—"}</td>
                  <td className="right">
                    {isRep ? (
                      <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
                        <div className="row" style={{ gap: 6, alignItems: "center" }}>
                          <div style={{ width: 64, height: 5, background: "var(--bg-strong)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: s.attach + "%", background: "var(--brand)" }} />
                          </div>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{s.attach}%</span>
                        </div>
                        <span className="soft" style={{ fontSize: 10.5 }}>{s.smartCount} {window.I18N && window.I18N.isAR ? "من" : "of"} {s.closed.length}</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="right mono" style={{ color: "var(--positive)", fontWeight: 600 }}>
                    +{D.fmtSAR(s.commission)}
                    <div className="soft" style={{ fontSize: 10.5, fontWeight: 400, color: "var(--text-soft)" }}>
                      {s.scope === "own" ? (window.I18N && window.I18N.isAR ? "حصته من صفقاته" : "share of own deals")
                        : s.scope === "team" ? (window.I18N && window.I18N.isAR ? "حصة الفريق" : "team override")
                        : (window.I18N && window.I18N.isAR ? "حصة الإدارة" : "company override")}
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--text-soft)" }}>No team members yet.</td></tr>}
          </tbody>
        </table>
      </div>
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

/* ============================================================
   Developer team member editor — bilingual name, role, project access
============================================================ */
function DevTeamDrawer({ member, projects, onClose }) {
  const AR = window.I18N && window.I18N.isAR;
  const TL = (en, ar) => (AR ? ar : en);
  // Seeded users carry a role-id; show it as a readable, editable label.
  const _known = D.DEV_ROLES.find((r) => r.id === member.role);
  const _initRole   = _known ? _known.en : (member.role || "");
  const _initRoleAr = _known ? _known.ar : (member.roleAr || "");
  const _initPerms  = member.perms ? member.perms.slice() : (member._new ? ["orders"] : D.devPermsFor(member).slice());
  const [m, setM] = useState({ ...member, role: _initRole, roleAr: _initRoleAr, perms: _initPerms, assignedProjectIds: [...(member.assignedProjectIds || [])] });
  const set = (patch) => setM((x) => ({ ...x, ...patch }));
  const toggleProj = (id) => setM((x) => ({ ...x, assignedProjectIds: x.assignedProjectIds.includes(id) ? x.assignedProjectIds.filter((p) => p !== id) : [...x.assignedProjectIds, id] }));
  const valid = ((m.name || "").trim() || (m.nameAr || "").trim()) && /@/.test(m.email || "");
  const save = () => {
    const payload = { name: (m.name || m.nameAr).trim(), nameAr: (m.nameAr || "").trim(), email: m.email.trim(), role: (m.role || "").trim(), roleAr: (m.roleAr || "").trim(), perms: m.perms, developerId: member.developerId, assignedProjectIds: m.assignedProjectIds,
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
        <div className="soft" style={{ fontSize: 11, margin: "2px 0 8px" }}>{TL("Free text — a label only. What this person can actually access is set by the permissions below.", "نص حرّ — مجرد مسمّى. ما يستطيع هذا الشخص الوصول إليه تحدّده الصلاحيات أدناه.")}</div>
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
            {managers.map((u) => <option key={u.id} value={u.id}>{((AR && u.nameAr) ? u.nameAr : u.name) + " · " + roleDisplay(u)}</option>)}
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
          {!m._new && m.id !== (me && me.id) && <button className="btn btn-ghost" onClick={() => { if (confirm(TL("Remove " + m.name + " from the team? They will lose access immediately.", "إزالة " + (m.nameAr || m.name) + " من الفريق؟ سيفقد الوصول فورًا.")) ) del(); }} style={{ color: "var(--negative, #c0492f)" }}>{TL("Remove", "إزالة")}</button>}
          <button className="btn btn-ghost" onClick={onClose}>{TL("Cancel", "إلغاء")}</button>
        </div>
        {m._new && <div className="soft" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>{TL("They sign in with this email at the developer portal. (Demo: any password.)", "يسجّل الدخول بهذا البريد في بوابة المطوّر. (للعرض: أي كلمة مرور.)")}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   Financials
============================================================ */
function Money({ orders }) {
  const AR = window.I18N && window.I18N.isAR;
  const active = orders.filter(D.isOperating);
  const extrasSold = orders.filter(D.isSigned).reduce((s, o) => s + (Number(o.furnishCost) || 0), 0);
  const downloadPL = () => D.downloadCSV("financials-" + developer.id + ".csv", orders.filter(D.isLive), [{ key: "id", label: "Ref" }, { label: "Customer", get: (o) => o.customerName }, { label: "Units", get: (o) => (o.unitNumbers || [o.unitNumber]).join(" ") }, { key: "status", label: "Status" }, { key: "unitPrice", label: "Unit price (SAR)" }, { key: "furnishCost", label: "Extras incl. VAT (SAR)" }, { label: "Owed to Revnu (SAR)", get: (o) => D.isCustomerPaid(o) ? D.revnuPayableForOrder(o) : 0 }, { label: "Operating model", get: (o) => D.opsById(o.opsId)?.name || "" }]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N ? window.I18N.t("Financials") : "Financials"}</h1>
          <p className="page-sub">{window.I18N && window.I18N.isAR ? "الوحدات المرتبطة بالتشغيل وإجمالي الإضافات المباعة عبر مشاريعك. دخل التشغيل يُدار خارج المنصة." : "Units locked into operations and total extras sold across your projects. Operating income is handled off-platform."}</p>
        </div>
        <button className="btn btn-secondary" onClick={downloadPL}>{window.I18N && window.I18N.isAR ? "تنزيل CSV" : "Download CSV"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <Stat label={AR ? "وحدات في التشغيل" : "Units in operations"} value={active.length} delta={AR ? "الدخل يُدار خارج المنصة" : "income handled off-platform"} />
        <Stat label={AR ? "الإضافات المباعة (كل الأوقات)" : "Extras sold (all time)"} value={D.fmtSAR(extrasSold)} unit="SAR" delta={AR ? "تأثيث + ذكي، الصفقات الموقّعة" : "furnishing + smart, signed deals"} />
      </div>

      <div className="card">
        <div className="row-between" style={{ padding: "16px 20px 0" }}>
          <div>
            <div className="eyebrow">{AR ? "// وحدات في التشغيل" : "// UNITS IN OPERATIONS"}</div>
            <div className="display-sm" style={{ marginTop: 2 }}>{AR ? "تفصيل لكل وحدة" : "Per-unit breakdown"}</div>
          </div>
        </div>
        <table className="tbl tbl-flush" style={{ marginTop: 8 }}>
          <thead><tr><th>{TT("Unit")}</th><th>{TT("Customer")}</th><th>{window.I18N && window.I18N.isAR ? "النموذج" : "Model"}</th><th className="right">{window.I18N && window.I18N.isAR ? "حصتكم المتفق عليها" : "Your agreed cut"}</th></tr></thead>
          <tbody>
            {active.map((o) => {
              const devPct = Number(D.projById(o.projectId)?.commercials?.developerOpsSharePct) || 0;
              return (
                <tr key={o.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{o.unitNumber}</td>
                  <td>{o.customerName}</td>
                  <td>{D.opsById(o.opsId)?.name}</td>
                  <td className="right mono" style={{ fontWeight: 600 }}>{devPct}% {window.I18N && window.I18N.isAR ? "من رسوم التشغيل" : "of op. fee"}</td>
                </tr>
              );
            })}
            {active.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--text-soft)" }}>{AR ? "لا توجد وحدات في التشغيل بعد — تُضاف عند دفع العميل لصفقة تتضمّن التشغيل." : "No units in operations yet — a unit is added when its customer pays on a deal that includes operations."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ============================================================
   Revnu payments — what THIS developer owes Revnu per order
   (furnishing / smart / operations addendum), on the developer's
   own Revnu payment terms (e.g. 30% sign · 60% pre-handover · 10% retention).
============================================================ */
function OrderRevnuCard({ o }) {
  const u    = D.unitByNumber(o.unitNumber);
  const proj = D.projById(o.projectId);
  const schedule = D.revnuScheduleForOrder(o);              // paid state is confirmed by Revnu (shared store)
  const payable  = D.revnuPayableForOrder(o);
  const paid     = schedule.filter((m) => m.paid).reduce((a, m) => a + m.amount, 0);
  const inv      = D.invoiceFor(o);
  const firstUnpaid = schedule.find((m) => !m.paid);
  return (
    <div className="card card-pad-lg">
      <div className="row-between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <strong>{o.customerName}</strong>
            <span className="chip mono">{o.id}</span>
            {inv && <span className="chip mono chip-brand">{inv.id}</span>}
            <span className="chip">{(o.unitNumbers && o.unitNumbers.length ? o.unitNumbers : [o.unitNumber]).join(" · ")}{u && (o.unitNumbers || []).length <= 1 ? " · " + (window.I18N ? window.I18N.tx(u.type, "name") : u.type.name) : ""}</span>
            <span className="chip chip-soft">{proj?.name}</span>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {window.I18N && window.I18N.isAR ? "مستحق لـ Revnu عن التأثيث والمنزل الذكي" : "Owed to Revnu on furnishing & smart home"}
            <span className="soft" style={{ marginInlineStart: 8, fontSize: 11.5 }}>{window.I18N && window.I18N.isAR ? `(سعر الوحدة ${D.fmtSAR(o.unitPrice)} ريال — يُسوَّى مع المشتري، ليس جزءاً من هذا)` : `(unit price ${D.fmtSAR(o.unitPrice)} SAR — settled with the buyer, not part of this)`}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-soft)", letterSpacing: "0.08em" }}>
            {window.I18N && window.I18N.isAR ? `${D.fmtSAR(paid)} مدفوع من ${D.fmtSAR(payable)} ريال` : `${D.fmtSAR(paid)} of ${D.fmtSAR(payable)} SAR PAID`}
          </div>
          <div style={{ height: 4, width: 240, marginTop: 6, background: "var(--bg-strong)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(paid / Math.max(1, payable)) * 100}%`, background: "var(--brand)", transition: "width 0.3s" }} />
          </div>
        </div>
      </div>
      <table className="tbl" style={{ marginTop: 4 }}>
        <thead>
          <tr>
            <th style={{ width: 32 }}></th>
            <th>{window.I18N && window.I18N.isAR ? "الدفعة" : "Milestone"}</th>
            <th className="right">%</th>
            <th className="right">{window.I18N && window.I18N.isAR ? "المبلغ المستحق" : "Amount due"}</th>
            <th className="right">{TT("Status")}</th>
            <th className="right"></th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((r, i) => {
            const isNext = firstUnpaid && r.id === firstUnpaid.id;
            return (
              <tr key={r.id} style={{ opacity: r.paid ? 0.72 : 1 }}>
                <td>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: r.paid ? "var(--brand)" : "var(--bg-card)", color: r.paid ? "var(--brand-text)" : "var(--text-muted)", border: r.paid ? "0" : "1.5px solid var(--line-strong)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600 }}>{r.paid ? "✓" : i + 1}</span>
                </td>
                <td><strong style={{ fontSize: 13.5 }}>{r.label}</strong></td>
                <td className="right mono" style={{ fontWeight: 600 }}>{r.pct}%</td>
                <td className="right mono">{D.fmtSAR(r.amount)} <span className="soft" style={{ fontSize: 10.5 }}>SAR</span></td>
                <td className="right">
                  {r.paid ? <span className="chip chip-positive">{window.I18N && window.I18N.isAR ? "مدفوعة" : "Paid"}</span>
                    : isNext ? <span className="chip chip-warning">{window.I18N && window.I18N.isAR ? "المستحقة التالية" : "Due next"}</span>
                    : <span className="chip" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>{window.I18N && window.I18N.isAR ? "قادمة" : "Upcoming"}</span>}
                </td>
                <td className="right soft" style={{ fontSize: 11 }}>
                  {!r.paid && isNext && (window.I18N && window.I18N.isAR ? "تؤكّد Revnu الاستلام" : "Revnu confirms receipt")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Milestones({ orders: allOrders }) {
  const terms = developer.revnuTerms || { milestones: [], preHandoverMonths: 6 };
  const orders = allOrders.filter(D.isCustomerPaid);                  // invoiced only after the customer's first payment
  const projected = allOrders.filter((o) => D.isLive(o) && !D.isCustomerPaid(o)).reduce((a, o) => a + D.revnuPayableForOrder(o), 0);
  const payable = orders.reduce((a, o) => a + D.revnuPayableForOrder(o), 0);
  const collected = orders.reduce((a, o) => a + D.revnuScheduleForOrder(o).filter((m) => m.paid).reduce((s, m) => s + m.amount, 0), 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N ? window.I18N.t("Revnu payments") : "Revnu payments"}</h1>
          <p className="page-sub">{window.I18N && window.I18N.isAR
            ? <>ما تدين به لـ Revnu عن كل طلب — <strong>التأثيث والمنزل الذكي والتشغيل</strong> — يُسوَّى وفق شروطكم المتفق عليها. سعر الوحدة يُحصَّل من المشتري مباشرة بموجب عقد الشراء.</>
            : <>What you owe Revnu for each order's <strong>furnishing, smart home &amp; operations</strong> — settled on your agreed terms. The unit price is collected from the buyer separately under their purchase contract.</>}</p>
        </div>
      </div>

      <div className="card card-pad-lg" style={{ marginBottom: 16, background: "var(--brand-soft)", border: "1px solid var(--line)" }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{TT("// YOUR REVNU PAYMENT TERMS")}</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {terms.milestones.map((m) => (
                <span key={m.id} className="chip" style={{ background: "var(--bg-card)" }}>
                  <strong className="mono" style={{ marginRight: 6 }}>{m.pct}%</strong>{m.label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono soft" style={{ fontSize: 10.5, letterSpacing: "0.08em" }}>{window.I18N && window.I18N.isAR ? "المتبقّي لـ REVNU" : "OUTSTANDING TO REVNU"}</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{D.fmtSAR(payable - collected)} <span className="soft" style={{ fontSize: 11 }}>SAR</span></div>
            <div className="soft" style={{ fontSize: 11 }}>{window.I18N && window.I18N.isAR ? `${D.fmtSAR(collected)} مدفوع من ${D.fmtSAR(payable)} ريال · ${D.fmtSAR(projected)} متوقّع من صفقات لم يدفع عميلها بعد` : `${D.fmtSAR(collected)} paid of ${D.fmtSAR(payable)} SAR · ${D.fmtSAR(projected)} projected from deals not yet paid by the customer`}</div>
          </div>
        </div>
      </div>

      <div className="stack-md">
        {orders.map((o) => <OrderRevnuCard key={o.id} o={o} />)}
        {orders.length === 0 && (
          <div className="card card-pad muted" style={{ textAlign: "center" }}>{window.I18N && window.I18N.isAR ? "لا توجد فواتير بعد — تُنشأ الفاتورة عندما يدفع العميل الدفعة الأولى." : "No invoices yet — an invoice is created when a customer makes the first payment."}</div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   Sales-rep views — "my deals" + "my earnings"
   Commission is paid on EXTRAS ONLY (furnishing + smart home),
   not on the unit price.
============================================================ */
function addOnsFor(o) {
  // furnishCost on the order already bundles furnishing + smart-home uplift
  // (priced through the wizard). This is what commission is paid on.
  return Number(o.furnishCost) || 0;
}
// One person's SHARE of a deal's commission, via the developer's split ladder.
function myShareFor(o, userId) {
  return D.commissionSplit(o).filter((s) => s.userId === userId).reduce((sum, s) => sum + s.amount, 0);
}
function commissionFor(o) {
  const proj = D.projById(o.projectId);
  const c = proj?.commercials?.salesCommission || { kind: "pct", value: 0 };
  const base = addOnsFor(o) / 1.15;   // commission is on the ex-VAT value of the extras
  return c.kind === "pct" ? base * (c.value / 100) : Number(c.value) || 0;
}
function hasSmart(o) { return !!(o.smartId && o.smartId !== "cove-off"); }

function RepDeals({ orders }) {
  const [open, setOpen] = useState(null);
  const [, bump] = useState(0);
  const AR = window.I18N && window.I18N.isAR;
  const M = D.ORDER_STATUS_META || {};
  const COLS = ["active", "issued", "signed", "paid"];
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");
  // Required document gating per transition (from → needs upload before leaving)
  const needsDocToLeave = (o) => o.status === "issued" && !o.signedContractUrl;
  const advance = (o) => {
    const i = COLS.indexOf(o.status);
    if (i < 0 || i >= COLS.length - 1) {
      // issued→signed etc handled here; also allow active→completed via window helper
    }
    if (needsDocToLeave(o)) return; // gated
    window.__revnu_advanceStatus(o.id); bump((x) => x + 1);
  };
  const uploadSigned = (o, e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    e.target.value = "";
    const fr = new FileReader();
    fr.onload = () => {
      try { if (f.size < 2500000) { const m = JSON.parse(localStorage.getItem("revnu_signed_files") || "{}"); m[o.id] = { name: f.name, type: f.type, data: fr.result }; localStorage.setItem("revnu_signed_files", JSON.stringify(m)); } } catch (err) {}
      D.updateOrder(o.id, { signedContractUrl: f.name, signedAt: new Date().toISOString().slice(0, 10) });
      if (o.status === "issued") window.__revnu_advanceStatus(o.id);   // upload = Signed
      bump((x) => x + 1);
    };
    fr.readAsDataURL(f);
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N ? window.I18N.t("My deals") : "My deals"}</h1>
          <p className="page-sub">{AR ? "حرّك كل صفقة عبر المراحل. للانتقال إلى المرحلة التالية قد يلزم رفع مستند." : "Move each deal through the stages. Advancing a stage may require uploading a document."}</p>
        </div>
        <a className="btn btn-primary" href={"/sales?dev=" + developer.id + (me && D.devHasPerm(me, "orders") ? "&u=" + me.id : "")}>{AR ? "+ طلب جديد" : "+ New order"}</a>
      </div>

      <div dir={AR ? "rtl" : "ltr"} style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(220px, 1fr))", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
        {COLS.map((col) => {
          const cards = orders.filter((o) => o.status === col || (col === "active" && (o.status === "draft" || o.status === "review")) || (col === "paid" && o.status === "completed"));
          return (
            <div key={col} style={{ background: "var(--bg-sunken)", borderRadius: "var(--r-md)", border: "1px solid var(--line)", padding: 10, minWidth: 220 }}>
              <div className="row-between" style={{ marginBottom: 10, padding: "2px 4px" }}>
                <strong style={{ fontSize: 13 }}>{AR ? (M[col]?.ar || col) : (M[col]?.en || col)}</strong>
                <span className="chip" style={{ fontSize: 11 }}>{cards.length}</span>
              </div>
              <div className="stack-sm">
                {cards.map((o) => {
                  const i = COLS.indexOf(o.status);
                  const isLast = o.status === "paid" || o.status === "completed";
                  const gated = needsDocToLeave(o);
                  const nextLabel = AR ? (M[o.status]?.nextAr || "التالي") : (M[o.status]?.nextEn || "Next");
                  return (
                    <div key={o.id} className="card card-pad" style={{ cursor: "pointer", padding: 12 }} onClick={() => setOpen(o)}>
                      <div className="row-between" style={{ marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{o.id}</span>
                        <span className="mono soft" style={{ fontSize: 11 }}>{(o.unitNumbers && o.unitNumbers.length ? o.unitNumbers : [o.unitNumber]).join(" · ")}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{o.customerName}</div>
                      <div className="mono soft" style={{ fontSize: 11.5, marginBottom: 8 }}>{D.fmtSAR(addOnsFor(o))} SAR · {AR ? "عمولتك" : "your commission"} {D.fmtSAR(me ? myShareFor(o, me.id) : commissionFor(o))} <span style={{ opacity: 0.7 }}>({AR ? "على الصافي بدون الضريبة" : "on ex-VAT extras"})</span></div>
                      {o.signedContractUrl && o.status !== "issued" && <div className="chip chip-positive" style={{ fontSize: 10, marginBottom: 6 }}>{AR ? "✓ عقد موقّع" : "✓ Signed"}</div>}
                      {!isLast && (
                        gated ? (
                          <label className="btn btn-sm btn-secondary" style={{ width: "100%", cursor: "pointer", justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
                            {AR ? "⬆ رفع العقد الموقّع للمتابعة" : "⬆ Upload signed contract to advance"}
                            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" style={{ display: "none" }} onChange={(e) => uploadSigned(o, e)} />
                          </label>
                        ) : (
                          <button className="btn btn-sm btn-primary" style={{ width: "100%" }} onClick={(e) => { e.stopPropagation(); advance(o); }}>
                            {nextLabel} {AR ? "←" : "→"}
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
                {cards.length === 0 && <div className="soft" style={{ fontSize: 11.5, textAlign: "center", padding: "16px 0", lineHeight: 1.5 }}>{col === "active" ? (AR ? "لا صفقات مُقدَّمة — ابدأ طلبًا جديدًا" : "Nothing submitted — start a new order") : col === "issued" ? (AR ? "لا عقود بانتظار التوقيع" : "No contracts awaiting signature") : col === "signed" ? (AR ? "لا عقود موقّعة بانتظار الدفع" : "No signed deals awaiting payment") : (AR ? "لم يدفع أي عميل بعد" : "No customer payments yet")}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {open && <OrderDrawer order={open} onClose={() => { setOpen(null); bump((x) => x + 1); }} />}
    </>
  );
}

function RepEarnings({ orders }) {
  const uid = me && me.id;
  const closed = orders.filter(D.isCustomerPaid);
  const pipeline = orders.filter((o) => D.isLive(o) && !D.isCustomerPaid(o));
  const earnedTotal = closed.reduce((s, o) => s + myShareFor(o, uid), 0);
  const pipelineTotal = pipeline.reduce((s, o) => s + myShareFor(o, uid), 0);
  const ladder = D.commissionLadderFor(developer.id);
  const myLvl = me && ladder.find((l) => l.id === me.commissionLevelId);
  const AR = window.I18N && window.I18N.isAR;
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{window.I18N ? window.I18N.t("My earnings") : "My earnings"}</h1>
          <p className="page-sub">{AR ? <>عمولتك المكتسبة حتى الآن وما هو في خط الأنابيب. <strong>تُدفع على الإضافات فقط، وعلى قيمتها بدون ضريبة القيمة المضافة</strong> (التأثيث + المنزل الذكي){myLvl ? " — حصتك " + myLvl.pct + "% من عمولة كل صفقة" : ""}.</> : <>Commission earned to date, and what's still in the pipeline. <strong>Paid on extras only, on their ex-VAT value</strong> (furnishing + smart home){myLvl ? " — your share is " + myLvl.pct + "% of each deal's commission" : ""}.</>}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        <Stat label="Commission earned"  value={D.fmtSAR(earnedTotal)} unit="SAR" delta={window.I18N && window.I18N.isAR ? (closed.length + " صفقة دفع عميلها") : `${closed.length} deal${closed.length === 1 ? "" : "s"} with customer paid`} />
        <Stat label={window.I18N && window.I18N.isAR ? "معلّقة" : "Pending"} value={D.fmtSAR(pipelineTotal)} unit="SAR" delta={window.I18N && window.I18N.isAR ? (pipeline.length + " صفقة بانتظار التوقيع أو الدفع") : `${pipeline.length} deal${pipeline.length === 1 ? "" : "s"} awaiting signature or payment`} />
        <Stat label="Average per deal"   value={D.fmtSAR(closed.length ? earnedTotal / closed.length : 0)} unit="SAR" />
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead><tr><th>{TT("Ref")}</th><th>{TT("Customer")}</th><th>{TT("Project")}</th><th>{TT("Status")}</th><th className="right">{TT("Extras")}</th><th className="right">{TT("Commission")}</th></tr></thead>
          <tbody>
            {orders.map((o) => {
              const proj = D.projById(o.projectId);
              const commission = myShareFor(o, uid);
              return (
                <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => window.__revnu_openOrder && window.__revnu_openOrder(o.id)}>
                  <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{o.id}</td>
                  <td>{o.customerName}</td>
                  <td>{proj?.name}</td>
                  <td><span className={STATUS_CHIP[o.status]}>{statusLabel(o.status)}</span></td>
                  <td className="right mono" style={{ fontWeight: 600 }}>{D.fmtSAR(addOnsFor(o))}</td>
                  <td className="right mono" style={{ fontWeight: 600 }}>
                    +{D.fmtSAR(commission)} <span className="soft" style={{ fontSize: 10 }}>SAR</span>
                    <div className="soft" style={{ fontSize: 10.5, fontWeight: 400 }}>{D.isCustomerPaid(o) ? (AR ? "مستحقة" : "earned") : (AR ? "معلّقة" : "pending")}{myLvl ? " · " + myLvl.pct + (AR ? "% من العمولة" : "% of commission") : ""}</div>
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

