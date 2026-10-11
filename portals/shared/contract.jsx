"use client";
import React from "react";
import { createPortal } from "react-dom";
import D from "@/lib/data/store";
import R from "@/lib/data/remote";
// FullAgreement keeps its page renderers in a local `R`; module-level helpers from the remote module go through these names.
const readSummary = (log, ar) => R.readSummary(log, ar);
import "./floorplan";
// =================================================================
//  Full-fledged Purchase & Investment Agreement  (Buyer ↔ Developer)
//  Rendered inside the Sales portal's Review & Sign step.
//  A single, multi-page document: cover, parties, property, interior
//  (with the chosen design board + image slots), the investment
//  calculation the buyer chose, payment schedule, full terms, signatures.
//  Exports window.FullAgreement(ctx) and window.AppendixKyc({ c, developer }).
// =================================================================

// Module-level fallback (English). FullAgreement shadows this with an AR-aware L.
// The agreement's language is chosen per document (EN/AR toggle), independent of the UI language.
let __docAR = !!(window.I18N && window.I18N.isAR);
const L = (en, ar) => (__docAR ? ar : en);

/* ---- palette helpers -------------------------------------------------- */
function darkest(palette) {
  if (!palette || !palette.length) return "#1D1D1F";
  let best = palette[0], bestL = 999;
  palette.forEach((hex) => {
    const c = hex.replace("#", "");
    if (c.length < 6) return;
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (l < bestL) { bestL = l; best = hex; }
  });
  return best;
}
function readable(hex) {
  const c = (hex || "#000").replace("#", "");
  if (c.length < 6) return "#fff";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150 ? "#1D1D1F" : "#FFFFFF";
}

/* ---- shared atoms (namespaced to avoid collision with sales.jsx) ------ */
const INK = "#1D1D1F", MUT = "#55555A", SOFT = "#8A8A90", LINE = "#E2E0DA", HAIR = "#EFEDE7";
const SERIF = "'Playfair Display', Georgia, serif";
const MONO = "'JetBrains Mono', monospace";

function AgRow({ k, v, strong }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 16, padding: "9px 0", borderBottom: "1px dotted " + LINE }}>
      <div style={{ color: SOFT, fontSize: 11 }}>{k}</div>
      <div style={{ fontSize: 12.5, fontWeight: strong ? 700 : 500, color: INK, overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 }}>{v}</div>
    </div>
  );
}

function AgSection({ n, title, kicker, brand, children }) {
  return (
    <section style={{ marginTop: 38 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "baseline", borderBottom: "1.5px solid " + INK, paddingBottom: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: brand, letterSpacing: "0.06em" }}>§{n}</span>
        <h2 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, margin: 0, letterSpacing: "-0.01em", flex: 1 }}>{title}</h2>
        {kicker ? <span style={{ fontSize: 10.5, color: SOFT, fontFamily: MONO, letterSpacing: "0.04em" }}>{kicker}</span> : null}
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

function Term({ n, h, children }) {
  return (
    <div style={{ marginTop: 18, breakInside: "avoid" }}>
      <h4 style={{ fontSize: 12.5, fontWeight: 700, margin: 0, letterSpacing: "0.01em", lineHeight: 1.4 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: SOFT, marginRight: 10, fontWeight: 500 }}>{n}</span>{h}
      </h4>
      <p style={{ margin: "5px 0 0 34px", fontSize: 11.5, lineHeight: 1.62, color: "#3A3A3E" }}>{children}</p>
    </div>
  );
}

function MoneyRow({ k, v, sub, total, brand }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: total ? "14px 0 0" : "8px 0", borderTop: total ? "2px solid " + INK : "none", marginTop: total ? 6 : 0 }}>
      <span style={{ fontSize: total ? 13.5 : 12, fontWeight: total ? 700 : 400, color: total ? INK : MUT, paddingRight: 12 }}>{k}{sub ? <span style={{ color: SOFT, fontSize: 10.5, marginLeft: 8 }}>{sub}</span> : null}</span>
      <span style={{ fontFamily: MONO, fontSize: total ? 16 : 12.5, fontWeight: total ? 700 : 500, color: total ? brand : INK, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
}

function Letterhead({ developer, brand, refno, page, pages, date }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottom: "1px solid " + LINE }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {developer.logo || developer.logoDark
          ? <span style={{ display: "inline-flex", alignItems: "center", background: brand, borderRadius: 7, padding: "6px 11px" }}><img src={developer.logoDark || developer.logo} alt={developer.name} style={{ height: 18, display: "block" }} /></span>
          : <span style={{ width: 30, height: 30, borderRadius: 7, background: brand, color: readable(brand), display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, fontWeight: 600, fontSize: 15 }}>{developer.initials}</span>}
        <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 600 }}>{developer.name}</div>
      </div>
      <div style={{ textAlign: "end", fontSize: 9.5, color: SOFT, fontFamily: MONO, letterSpacing: "0.04em", whiteSpace: "nowrap", flex: "none" }}>
        <div style={{ color: INK, fontWeight: 600 }}>{refno}</div>
        <div>{date}</div>
      </div>
    </div>
  );
}

/* ---- A4 engine ---------------------------------------------------------
   A4 @ 96dpi = 794 x 1123 px. Every sheet has a pinned letterhead and footer;
   content lives in a fixed-height well. Logical <Page> blocks are measured
   off-screen and split across sheets at child boundaries whenever they
   overflow, so nothing ever collides with the header/footer. Screen and
   print render the SAME sheets (print CSS only removes shadows/margins). */
const A4 = { w: 794, h: 1123, padX: 56, padTop: 40, padBot: 34, head: 58, foot: 30 };
A4.well = A4.h - A4.padTop - A4.padBot - A4.head - A4.foot;
function Page({ children, style, cover }) { return <div data-ag-logical="1" data-cover={cover ? "1" : undefined} style={style}>{children}</div>; }
function Sheet({ head, foot, children, cover, style, innerRef }) {
  return (
    <div ref={innerRef} className="ag-page ag-sheet" style={Object.assign({ width: A4.w, height: A4.h, boxSizing: "border-box", background: "#fff", color: INK, lineHeight: 1.55, position: "relative", overflow: "hidden", flex: "none", boxShadow: "0 16px 48px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)", padding: cover ? 0 : A4.padTop + "px " + A4.padX + "px " + A4.padBot + "px", display: "flex", flexDirection: "column" }, style)}>
      {!cover && <div style={{ height: A4.head, flex: "none" }}>{head}</div>}
      <div className="ag-well" style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", paddingTop: cover ? 0 : 18 }}>{children}</div>
      {!cover && <div style={{ height: A4.foot, flex: "none", display: "flex", alignItems: "flex-end" }}>{foot}</div>}
    </div>
  );
}
/* Scales fixed A4 sheets to the container width on screen (print ignores the transform via CSS). */
const FLOW_BELOW = 560;   // narrower than this (phones) → readable flowing layout instead of a shrunken A4 sheet
function FitA4({ children, dir }) {
  const ref = React.useRef(null); const [s, setS] = React.useState(1); const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => { const el = ref.current; if (!el) return; const host = el.parentElement || el; const measure = () => { const cs = getComputedStyle(host); const cw = host.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0); if (cw <= 0) return; setW(cw); setS(cw >= A4.w ? 1 : Math.max(0.2, cw / A4.w)); }; const ro = new ResizeObserver(measure); ro.observe(host); measure(); return () => ro.disconnect(); }, []);
  const inner = React.useRef(null); const [h, setH] = React.useState(0); const [z, setZ] = React.useState(() => (typeof window !== "undefined" && window.__agZoom) || 1);
  React.useEffect(() => { const f = () => setZ(window.__agZoom || 1); window.addEventListener("ag-zoom", f); return () => window.removeEventListener("ag-zoom", f); }, []);
  React.useLayoutEffect(() => { const el = inner.current; if (!el) return; const ro = new ResizeObserver(() => { const nh = el.scrollHeight; setH((p) => (Math.abs(p - nh) < 1 ? p : nh)); }); ro.observe(el); return () => ro.disconnect(); }, []);
  const flow = false; // phones get real A4 sheets too — fitted to width and pinch-zoomable (see .ag-zoom)
  if (flow) return <div ref={ref} className="ag-fit ag-fit-flow" style={{ width: "100%", minWidth: 0 }}><div ref={inner} className="ag-fit-inner" style={{ width: "100%" }}>{typeof children === "function" ? children(true) : children}</div></div>;
  const S = s * z;
  const boxW = A4.w * S; const origin = dir === "rtl" ? "top right" : "top left";
  return <div ref={ref} className="ag-fit" style={{ width: boxW, maxWidth: z > 1 ? "none" : "100%", minWidth: 0, height: h ? h * S : undefined, overflow: "hidden", marginInline: z > 1 ? 0 : "auto", position: "relative" }}><div ref={inner} className="ag-fit-inner" style={{ position: "absolute", top: 0, insetInlineStart: 0, transform: "scale(" + S + ")", transformOrigin: origin, width: A4.w, ["--ag-s"]: S }}>{typeof children === "function" ? children(false) : children}</div></div>;
}
/* DOM paginator. Each logical page is rendered once into a hidden probe at well width; its DOM is then flowed
   onto sheets greedily. Containers (sections, divs, tables) are split at child boundaries, tables at row
   boundaries with the <thead> repeated, and open ancestors are re-opened on the continuation sheet. */
function A4Doc({ logical, head, foot, dir, lang, fontFamily, flow }) {
  const probe = React.useRef(null); const [plan, setPlan] = React.useState(null); const [tick, setTick] = React.useState(0); const [settled, setSettled] = React.useState(false);
  const sig = logical.map((p) => (p.key || "") + ":" + React.Children.count(p.props.children)).join("|") + "|" + lang + "|" + tick;
  React.useEffect(() => { let on = true; let fontsDone = !(document.fonts && document.fonts.ready); const imgs = [...(probe.current ? probe.current.querySelectorAll("img") : [])].filter((i) => !i.complete); let left = imgs.length;
    const check = () => { if (on && fontsDone && left <= 0) setSettled(true); };
    if (!fontsDone) document.fonts.ready.then(() => { fontsDone = true; if (on) setTick((t) => t + 1); check(); });
    imgs.forEach((i) => { const d = () => { if (--left === 0 && on) setTick((t) => t + 1); check(); }; i.addEventListener("load", d, { once: true }); i.addEventListener("error", d, { once: true }); });
    check(); return () => { on = false; }; }, []);
  React.useLayoutEffect(() => {
    const root = probe.current; if (!root || flow) return;
    const limit = A4.well - 18;
    const H = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0); };
    const SKIP = { THEAD: 1, COLGROUP: 1, CAPTION: 1, SCRIPT: 1, STYLE: 1 };
    const splittable = (el) => { if (/^(P|H[1-6]|IMG|SVG|TR|TD|TH|SPAN|B|STRONG|EM|LABEL|BUTTON|IMAGE-SLOT)$/.test(el.tagName)) return false; if (getComputedStyle(el).breakInside === "avoid") return false; if (el.tagName === "TABLE") return el.querySelector(":scope > tbody") && el.querySelector(":scope > tbody").children.length > 1; if (getComputedStyle(el).display.indexOf("grid") >= 0 || getComputedStyle(el).display.indexOf("flex") >= 0) return false; const kids = [...el.children].filter((k) => !SKIP[k.tagName]); if (kids.length < 2) return false; return [...el.childNodes].every((n) => n.nodeType === 1 || !n.textContent.trim()); };
    const shellOf = (el) => { const cl = el.cloneNode(false); cl.removeAttribute("id"); const o = cl.outerHTML; let open = o.slice(0, o.lastIndexOf("</")); let close = o.slice(o.lastIndexOf("</")); let overhead = 0; const cs = getComputedStyle(el);
      if (el.tagName === "TABLE") { const th = el.querySelector(":scope > thead"); const tb = el.querySelector(":scope > tbody"); if (th) { open += th.outerHTML; overhead += th.getBoundingClientRect().height; } if (tb) { const t = tb.cloneNode(false).outerHTML; open += t.slice(0, t.lastIndexOf("</")); close = "</tbody>" + close; } }
      else overhead += ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth", "marginTop", "marginBottom"].reduce((s, k) => s + (parseFloat(cs[k]) || 0), 0);
      return { open, close, overhead }; };
    const out = [];
    [...root.querySelectorAll("[data-probe-page]")].forEach((pg, pi) => {
      if (pg.getAttribute("data-cover") === "1") { out.push({ page: pi, cover: true, first: true }); return; }
      let cur = [], used = 0, leaves = 0, first = true; const stack = [];
      const flush = () => { cur.push(stack.slice().reverse().map((s) => s.close).join("")); out.push({ page: pi, html: cur.join(""), first }); first = false; cur = [stack.map((s) => s.open).join("")]; used = stack.reduce((s, x) => s + x.overhead, 0); leaves = 0; };
      const walk = (el) => { const h = H(el);
        if (used + h <= limit) { cur.push(el.outerHTML); used += h; leaves++; return; }
        if (!splittable(el)) { if (leaves) flush(); cur.push(el.outerHTML); used += h; leaves++; return; }
        const sh = shellOf(el); stack.push(sh); cur.push(sh.open); used += sh.overhead;
        const kids = el.tagName === "TABLE" ? [...el.querySelector(":scope > tbody").children] : [...el.children].filter((k) => !SKIP[k.tagName]);
        const headish = el.tagName !== "TABLE" && kids.length > 1 && (/^H[1-6]$/.test(kids[0].tagName) || H(kids[0]) < 70);
        if (headish && used + H(kids[0]) + Math.min(H(kids[1]), 120) > limit && leaves) { cur.pop(); used -= sh.overhead; stack.pop(); flush(); stack.push(sh); cur.push(sh.open); used += sh.overhead; }
        kids.forEach(walk); stack.pop(); cur.push(sh.close); };
      [...pg.children].forEach(walk);
      if (leaves) { out.push({ page: pi, html: cur.join(""), first }); }
    });
    setPlan({ sig, sheets: out });
  }, [sig, flow]);
  React.useEffect(() => { if (plan && plan.sig === sig) window.dispatchEvent(new CustomEvent("ag-paginated", { detail: { sheets: plan.sheets.length, settled } })); }, [plan && plan.sig === sig ? plan.sheets.length : -1, sig, settled]);
  if (flow) return <>{logical.map((p, i) => <div key={i} className="ag-page ag-flow" style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 2px rgba(8,11,20,.06)", border: "1px solid " + LINE, padding: p.props.cover ? 0 : "18px 18px 22px", overflow: "hidden", color: INK, lineHeight: 1.6 }}>{!p.props.cover && <div style={{ marginBottom: 14 }}>{head(i + 1, logical.length)}</div>}{p.props.children}</div>)}</>;
  const ready = plan && plan.sig === sig;
  const probeEl = createPortal(<div ref={probe} aria-hidden="true" dir={dir} lang={lang} className="ag-probe" style={{ position: "fixed", left: 0, top: 0, width: A4.w, fontFamily, color: INK, lineHeight: 1.55, visibility: "hidden", pointerEvents: "none", zIndex: -1, overflow: "hidden", height: 0 }}>
    {logical.map((p, i) => <div key={i} data-probe-page="1" data-cover={p.props.cover ? "1" : undefined} style={{ width: p.props.cover ? A4.w : A4.w - A4.padX * 2, boxSizing: "border-box" }}>{p.props.children}</div>)}
  </div>, document.body);
  if (!ready) return <>{probeEl}{logical.map((p, i) => <Sheet key={i} head={head(i + 1, logical.length)} foot={foot(i + 1, logical.length)} cover={!!p.props.cover}>{p.props.children}</Sheet>)}</>;
  const n = plan.sheets.length;
  return <>{probeEl}{plan.sheets.map((s, si) => <Sheet key={si} cover={!!s.cover} head={head(si + 1, n)} foot={foot(si + 1, n, !s.first)}>{s.cover ? logical[s.page].props.children : <div dangerouslySetInnerHTML={{ __html: s.html }} />}</Sheet>)}</>;
}

/* ---- the document ----------------------------------------------------- */
function FullAgreement(ctx) {
  const { developer, project, order, unit, units, nUnits, design, pkg, smart, kitchen, ac, ops,
          furnishTotal, fitoutOn, fitoutTotal, furnishOnlyTotal, totalPrice, our, lang } = ctx;
  const perUnitRows = ctx.perUnitRows || [];
  const regLine = [developer.crNumber, developer.vat].filter(Boolean).join(" · ");
  const mixedConfig = perUnitRows.length > 1 && perUnitRows.some((r) => (r.pkg && r.pkg.id) !== (perUnitRows[0].pkg && perUnitRows[0].pkg.id) || (r.design && r.design.id) !== (perUnitRows[0].design && perUnitRows[0].design.id) || (r.smart && r.smart.id) !== (perUnitRows[0].smart && perUnitRows[0].smart.id) || r.fitout !== perUnitRows[0].fitout || (r.ops && r.ops.id) !== (perUnitRows[0].ops && perUnitRows[0].ops.id));
  const TXc = (o, k) => o ? ((AR && o[k + "Ar"]) ? o[k + "Ar"] : o[k]) : "";
  const AR = lang === "ar";
  __docAR = AR;
  const L = (en, ar) => AR ? ar : en;
  // Dictionary lookup tied to the DOCUMENT language (tower names, cities, room names…).
  const TD = (x) => { if (x == null || x === "") return ""; if (!AR) { const e = (window.I18N && window.I18N.rev) ? window.I18N.rev(x) : null; return e == null ? String(x) : e; } const v = (window.I18N && window.I18N.tr) ? window.I18N.tr(x) : null; return v == null ? String(x) : v; };
  const legal = D.legalNameOf(developer, AR);                       // contracting party (Grova Tilal); the brand stays on the letterhead
  const AR_FONT = "'Almarai', 'Outfit', system-ui, sans-serif";
  const dealUnits = (units && units.length) ? units : (unit ? [unit] : []);
  const multi = dealUnits.length > 1;
  // The agreement records OUR (admin-set) assumption — never the calculator's what-if values.
  const o = our || {};
  const opsRows = (o.rows || []).filter((r) => r.ops && r.ec);
  const opsMixed = !!o.mixed;
  const opsAny = opsRows.length > 0;
  const isDaily = o.isDaily, rate = o.rate || 0, occ = o.occ || 0,
        annualGross = o.annualGross || 0, annualNet = o.annualNet || 0,
        operatorFee = o.operatorFee || (ops ? ops.mgmtFee : 0),
        grossYield = o.grossYield || 0, roi = o.roi || 0;
  const c = order.customer || {};
  const brand = developer.brand.primary;
  // e-signature state: the developer signs & stamps at issue; the buyer's signature arrives from sign.html
  const esig = ctx.sig || null; const issued = !!(order.id && order.id !== "DRAFT" && order.status !== "draft"); const issuedAt = ctx.issuedAt || order.createdAt || null;
  const fmtTs = (iso) => { if (!iso) return "—"; const d = new Date(iso); const loc = AR ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB"; return String(iso).length <= 10 ? d.toLocaleDateString(loc, { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Riyadh" }) : d.toLocaleString(loc, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }); };   // Riyadh time on every device
  const sgn = D.signerOf(developer, order);   // the signatory, signature and stamp this order was issued with
  const devSigImg = sgn.signatureData || sgn.signature || null; const devStampImg = sgn.stampData || sgn.stamp || null;
  const signerName = (AR ? (sgn.authorizedSignerAr || sgn.authorizedSigner) : sgn.authorizedSigner) || developer.primaryContact || "";
  const chosenPalette = design ? D.designPaletteById(design, order.paletteId) : null;
  const palette = (chosenPalette && chosenPalette.colors) || (design && design.palette) || [INK, SOFT, LINE, "#fff"];
  const hero = darkest(palette);
  const refDigits = String(order.id || "").replace(/\D/g, ""); const ref = refDigits ? "AGR-" + refDigits : L("DRAFT · not issued", "مسودة · لم تصدر");
  const today = new Date().toLocaleDateString(AR ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "2-digit", month: "long", year: "numeric" });
  // ---- Agreement layout (block composer): pinned on the order at issue, else the developer's current layout ----
  const layoutSrc = ctx.layout || (order && order.agreement && order.agreement.blocks ? order.agreement : D.agreementLayoutFor(developer.id));
  const flAny = perUnitRows.some((r) => r.flooringUp && r.flooringUp.length);
  const layAny = perUnitRows.some((r) => r.layout && r.layout.length);
  const flags = { flooring: flAny, layout: layAny, furnishing: !!(pkg || fitoutOn || kitchen || ac || flAny || layAny || perUnitRows.some((r) => r.pkg || r.kitchen || r.ac || r.fitout)), smart: !!(smart || perUnitRows.some((r) => r.smart)), kitchen: !!(kitchen || perUnitRows.some((r) => r.kitchen)), cooling: !!(ac || perUnitRows.some((r) => r.ac)), fitout: !!fitoutOn, ops: !!(ops || opsAny), multi };
  const showOk = (w) => !w || w === "always" || !!flags[w];
  const visible = (layoutSrc.blocks || []).filter((b) => b.enabled !== false && showOk(b.showWhen) && !(b.kind === "data" && b.ref === "schedule_b" && !flags.ops));
  const seq = []; visible.forEach((b) => {
    if (b.kind === "clause") { const last = seq[seq.length - 1]; if (last && last.kind === "clauses") last.items.push(b); else seq.push({ kind: "clauses", items: [b] }); }
    else seq.push(b);
  });
  const N = {}; let secNo = 0;
  seq.forEach((s) => {
    if (s.kind === "clauses") {
      s.sections = []; s.items.forEach((b) => { const st = (AR ? (b.sectionAr || b.section) : (b.section || b.sectionAr)) || L("Terms & Conditions", "الأحكام والشروط"); const last = s.sections[s.sections.length - 1]; if (last && last.title === st) last.items.push(b); else s.sections.push({ title: st, items: [b] }); });
      s.sections.forEach((sec) => { sec.no = ++secNo; });
    } else if (s.ref === "parties") { N.parties = ++secNo; N.property = ++secNo; }
    else if (s.ref === "investment") { N.investment = ++secNo; N.payment = ++secNo; }
    else if (s.ref === "execution") { N.execution = ++secNo; }
  });
  N.parties = N.parties || 1; N.property = N.property || 2; N.investment = N.investment || 3; N.payment = N.payment || 4; N.execution = N.execution || (secNo + 1);
  const pages = seq.reduce((a, s) => a + (s.kind === "clauses" ? 1 : s.ref === "unit_pages" ? dealUnits.length : 1), 0);
  const fillX = { vals: { sec_parties: String(N.parties), sec_property: String(N.property), sec_investment: String(N.investment), sec_payment: String(N.payment), sec_execution: String(N.execution),
                          developer_legal_name: legal, warranty_years: String(pkg ? (pkg.warranty || 2) : 2), fitout_warranty_years: (pkg && pkg.fitout && pkg.fitout.warranty) ? String(pkg.fitout.warranty) : "",
                          agreement_ref: ref, n_units: String(dealUnits.length), units_list: dealUnits.map((u) => u.number).join(", "), addendum_value: D.fmtSAR(furnishTotal) + " SAR",
                          total_price: D.fmtSAR(totalPrice) + " SAR", furnish_cost: D.fmtSAR(furnishTotal) + " SAR", unit_price: D.fmtSAR(dealUnits.reduce((a, u) => a + (u.price || 0), 0)) + " SAR",
                          buyer_name: (AR && c.fullNameAr) ? c.fullNameAr : (c.fullName || ""), buyer_id: c.nationalId || "", buyer_email: c.email || "", buyer_mobile: D.fmtMobile(c), project_city: project ? TD(project.city) : "" },
                  flags: { has_ops: flags.ops, has_smart: flags.smart, has_kitchen: flags.kitchen, has_ac: flags.cooling, has_flooring: flags.flooring, has_layout: flags.layout, has_fitout: flags.fitout, has_furnishing: flags.furnishing, has_multi: multi } };
  fillX.vals.flooring_cost = flAny ? D.fmtSAR(perUnitRows.reduce((a, r) => a + (r.flooringPrice || 0), 0)) + " SAR" : "";
  fillX.vals.layout_cost = layAny ? D.fmtSAR(perUnitRows.reduce((a, r) => a + (r.layoutPrice || 0), 0)) + " SAR" : "";
  const clauseBody = (txt) => D.fillContract(txt || "", order, AR, fillX).split(/\n{2,}/).map((p, i) => <span key={i} style={{ display: "block", marginTop: i ? 6 : 0, whiteSpace: "pre-line" }}>{p}</span>);
  let __pg = visible.some((b) => b.kind === "data" && b.ref === "cover") ? 1 : 0;
  const np = () => (++__pg);
  const unitVat = (unit ? unit.price : 0) * 0.15;
  const fitoutBoqTotal = (pkg && pkg.fitout) ? D.boqTotal(pkg.fitout.boq) : 0;
  const furnBoq = D.boqFor(pkg, unit ? unit.typeId : null);

  const R = {};
  R.cover = () => (
      <Page cover>
        <div style={{ background: hero, color: readable(hero), padding: "clamp(24px, 6vw, 54px) clamp(18px, 7vw, 60px) clamp(22px, 5vw, 46px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            {developer.logoDark || developer.logo
              ? <img src={developer.logoDark || developer.logo} alt={developer.name} style={{ height: 30, display: "block" }} />
              : <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600 }}>{developer.name}</div>}
            <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", opacity: 0.8 }}>
              <div>{ref}</div>
              <div style={{ marginTop: 3 }}>{today}</div>
            </div>
          </div>
          <div style={{ marginTop: 64, fontFamily: MONO, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.78 }}>{L("Purchase & Investment Agreement","اتفاقية شراء واستثمار")}</div>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(26px, 6vw, 40px)", fontWeight: 600, letterSpacing: "-0.02em", margin: "12px 0 0", lineHeight: 1.05 }}>{project ? TXc(project, "name") : "—"}</h1>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 10 }}>
            {multi ? dealUnits.length + (AR ? " وحدات · " : " units · ") + TXc(project, "name") : (AR ? "وحدة " : "Unit ") + (unit ? unit.number : "—") + " · " + (unit ? TD(unit.tower) : "")}{!multi && unit ? (AR ? "، " : ", ") + (unit.floorSpan ? (AR ? "الطوابق " : "Floors ") + unit.floorSpan : (AR ? "الطابق " : "Floor ") + unit.floor) : ""} · {project ? project.city : ""}
          </div>
          <div style={{ marginTop: 40, display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", height: 8 }}>
            {palette.map((hex, i) => <div key={i} style={{ flex: 1, background: hex }} />)}
          </div>
        </div>
        <div style={{ padding: "clamp(18px, 4vw, 30px) clamp(18px, 7vw, 60px) clamp(22px, 5vw, 40px)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "clamp(16px, 4vw, 36px)" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase" }}>{L("Prepared for","أعد لصالح")}</div>
              <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, marginTop: 6 }}>{c.fullName || "—"}</div>
              <div style={{ fontSize: 11.5, color: MUT, marginTop: 3 }}>{c.email || ""}{c.mobile ? " · " + c.mobile : ""}</div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase" }}>{L("Issued by","صادر عن")}</div>
              <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, marginTop: 6 }}>{legal}</div>
              <div style={{ fontSize: 11.5, color: MUT, marginTop: 3 }}>{regLine}{developer.legalName && developer.name !== developer.legalName ? (regLine ? " · " : "") + (AR ? "مشروع " : "Project: ") + (AR ? (developer.nameAr || developer.name) : developer.name) : ""}</div>
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: MUT, lineHeight: 1.6, marginTop: 28, paddingTop: 18, borderTop: "1px solid " + LINE }}>
            {AR ? `توثق هذه الاتفاقية بيع الوحدة الموضحة فيها من ${legal} ("البائع") إلى المشتري المذكور أعلاه، مع التأثيث الداخلي والتجهيز و(عند الانطباق) خدمات التشغيل التي اختارها المشتري، وإسقاط الاستثمار الذي اعتمد عليه المشتري. البائع هو الطرف الوحيد تجاه المشتري بموجب هذه الاتفاقية.` : `This Agreement records the sale of the Unit described herein by ${developer.name} (the “Seller”) to the Buyer named above, together with the interior furnishing, fit-out and (where applicable) operating services the Buyer has selected, and the investment projection on which the Buyer has relied. The Seller is the sole counterparty to the Buyer under this Agreement.`}
          </p>
        </div>
      </Page>
  );
  R.parties = () => (
      <Page>
        <AgSection n={N.parties} title={L("The Parties","الأطراف")} brand={brand}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase", marginBottom: 4 }}>{L("The Buyer","المشتري")}</div>
              <AgRow k={L("Full name","الاسم الكامل")} v={(AR && c.fullNameAr) ? c.fullNameAr : (c.fullName || "—")} />
              <AgRow k={L("National ID","رقم الهوية")} v={c.nationalId || "—"} />
              <AgRow k={L("Mobile","الجوال")} v={c.mobile || "—"} />
              <AgRow k={L("Email","البريد الإلكتروني")} v={c.email || "—"} />
              <AgRow k={L("City","المدينة")} v={TD(c.city) || "—"} />
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase", marginBottom: 4 }}>{L("The Seller","البائع")}</div>
              <AgRow k={L("Developer","المطور")} v={legal} />
              <AgRow k={L("CR number","السجل التجاري")} v={developer.crNumber} />
              {developer.vat ? <AgRow k={L("VAT","الرقم الضريبي")} v={developer.vat} /> : null}
              <AgRow k={L("Authorised signatory","المفوض بالتوقيع")} v={((AR ? (sgn.authorizedSignerAr || sgn.authorizedSigner) : sgn.authorizedSigner) || developer.primaryContact) + ((AR ? (sgn.authorizedSignerTitleAr || sgn.authorizedSignerTitle) : sgn.authorizedSignerTitle) ? (AR ? "، " : " — ") + (AR ? (sgn.authorizedSignerTitleAr || sgn.authorizedSignerTitle) : sgn.authorizedSignerTitle) : "")} />
              <AgRow k={L("Contact","جهة الاتصال")} v={developer.primaryEmail} />
            </div>
          </div>
        </AgSection>
        <AgSection n={N.property} title={L("The Property","العقار")} brand={brand} kicker={multi ? (dealUnits.length + L(" units", " وحدات")) : L("Unit particulars","بيانات الوحدة")}>
          <AgRow k={L("Project","المشروع")} v={TXc(project, "name") + (project && project.city ? " · " + TD(project.city) : "")} />
          {multi ? (
            <>
              <AgRow k={L("Units in this deal","الوحدات في هذه الصفقة")} v={dealUnits.length + L(" units", " وحدات")} />
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, margin: "8px 0 6px" }}>
                <thead><tr style={{ color: SOFT, textAlign: "start", borderBottom: "1px solid " + INK }}>
                  <th style={{ fontWeight: 500, padding: "0 0 6px", fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textAlign: "start" }}>{L("UNIT","الوحدة")}</th>
                  <th style={{ fontWeight: 500, fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textAlign: "start" }}>{L("TYPE","النوع")}</th>
                  <th style={{ fontWeight: 500, fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textAlign: "start" }}>{L("BUILDING · FLOOR","المبنى · الدور")}</th>
                  <th style={{ fontWeight: 500, fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textAlign: "start" }}>{L("AREA","المساحة")}</th>
                  <th style={{ fontWeight: 500, fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textAlign: "start" }}>{L("DETAILS","التفاصيل")}</th>
                </tr></thead>
                <tbody>
                  {dealUnits.map((u, i) => (
                    <tr key={u.number} style={{ borderBottom: "1px dotted " + LINE }}>
                      <td style={{ padding: "6px 0", fontFamily: MONO, fontWeight: 600 }}>{u.number}</td>
                      <td>{TXc(u.type, "name")}</td>
                      <td>{TD(u.tower)} · {u.floorSpan ? L("Floors ", "الأدوار ") + u.floorSpan : L("Floor ", "الدور ") + u.floor}</td>
                      <td style={{ fontFamily: MONO }}>{u.area || u.type.area} m²</td>
                      <td style={{ color: SOFT }}>{L("Page ", "صفحة ") + (3 + i)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <AgRow k={L("Unit number","رقم الوحدة")} v={(unit ? unit.number : "—") + (unit ? " · " + TD(unit.tower) + (AR ? "، " : ", ") + (unit.floorSpan ? L("Floors ", "الأدوار ") + unit.floorSpan : L("Floor ", "الدور ") + unit.floor) : "")} />
              <AgRow k={L("Unit type","نوع الوحدة")} v={(unit ? TXc(unit.type, "name") : "—") + (unit && window.unitLevels && window.unitLevels(unit.type) > 1 ? L(" · " + window.unitLevels(unit.type) + "-storey duplex", " · دوبلكس من " + window.unitLevels(unit.type) + " طوابق") : "")} />
              <AgRow k={L("Built-up area","المساحة المبنية")} v={unit ? (unit.area || unit.type.area) + " m²" : "—"} />
              <AgRow k={L("Bedrooms / baths","غرف النوم / الحمامات")} v={unit ? unit.type.bedrooms + (AR ? " غرف · " : " bed · ") + (unit.baths || unit.type.baths) + (AR ? " حمام" : " bath") : "—"} />
            </>
          )}
          <p style={{ fontSize: 10.5, color: SOFT, margin: "10px 0 0", lineHeight: 1.55 }}>
            {AR ? (multi ? "لكل وحدة صفحتها الخاصة فيما يلي: المخطط، واللقطة ثلاثية الأبعاد، والموقع على المخطط العام، ومواصفات التشطيب والتأثيث المختارة لها." : "تلي هذه الصفحة صفحة الوحدة: المخطط، واللقطة ثلاثية الأبعاد، والموقع على المخطط العام، ومواصفات التشطيب والتأثيث المختارة.") : (multi ? "Each unit has its own page below: floor plan, 3D view, location on the masterplan, and the interior and furnishing specification selected for it." : "The unit page follows: floor plan, 3D view, location on the masterplan, and the interior and furnishing specification selected.")}
          </p>
        </AgSection>
      </Page>
  );
  R.unit_pages = () => dealUnits.map((du, ui) => {
        const row = perUnitRows.find((r) => r.unit && r.unit.number === du.number) || null;
        const uDesign = row ? row.design : design;
        const uPkg    = row ? row.pkg : pkg;
        const uSmart  = row ? row.smart : smart;
        const uKit    = row ? row.kitchen : (kitchen || null);
        const uKitTxt = uKit ? (TXc(uKit, "name") + (row && row.kitchenPalette ? " · " + (AR ? (row.kitchenPalette.nameAr || row.kitchenPalette.name) : row.kitchenPalette.name) : "") + (row && row.kitchenScope ? " · " + TXc(row.kitchenScope, "name") : "") + (row && row.kitchenAddons && row.kitchenAddons.length ? " · " + L("with ", "مع ") + row.kitchenAddons.map((a) => TXc(a, "name")).join(L(", ", "، ")) : "") + (row && row.kitchenPrice ? " · " + D.fmtSAR(row.kitchenPrice) + L(" SAR incl. VAT", " ريال شامل الضريبة") : "")) : null;
        const uFit    = row ? !!row.fitout : fitoutOn;
        const uOps    = row ? row.ops : ops;
        const uPal    = (row && row.palette && row.palette.colors) ? row.palette : chosenPalette;
        const uColors = (uPal && uPal.colors) || (uDesign && uDesign.palette) || palette;
        const plans   = D.floorPlansOf(du.type);
        const lv      = window.unitLevels ? window.unitLevels(du.type) : 1;
        const uArea   = du.area || du.type.area;
        const uImgs   = (uDesign && uDesign.images ? uDesign.images : []).filter((im) => im.src).slice(0, 3);
        const pn      = np();
        const KV = ({ k, v }) => (
          <div style={{ display: "grid", gridTemplateColumns: "118px minmax(0, 1fr)", gap: 10, padding: "5px 0", borderBottom: "1px dotted " + LINE, fontSize: 10.5, lineHeight: 1.45 }}>
            <span style={{ color: MUT }}>{k}</span><span style={{ fontWeight: 500, color: INK }}>{v}</span>
          </div>
        );
        const SubHead = ({ n, title, kicker }) => (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid " + LINE }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: brand, textTransform: "uppercase" }}>{n}</div>
            <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, margin: "2px 0 8px" }}>{title}{kicker ? <span style={{ fontSize: 10.5, color: SOFT, fontWeight: 400, marginInlineStart: 8, fontFamily: "inherit" }}>{kicker}</span> : null}</div>
          </div>
        );
        return (
          <Page key={du.number}>
            <AgSection n={multi ? N.property + "." + (ui + 1) : N.property + ".1"} title={L("Unit " + du.number, "الوحدة " + du.number)} brand={brand} kicker={TXc(du.type, "name") + " · " + uArea + " m²" + (multi ? " · " + L("Unit " + (ui + 1) + " of " + dealUnits.length, "الوحدة " + (ui + 1) + " من " + dealUnits.length) : "")}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 18, alignItems: "start" }}>
                <div>
                  <KV k={L("Building · floor","المبنى · الدور")} v={TD(du.tower) + " · " + (du.floorSpan ? L("Floors ", "الأدوار ") + du.floorSpan : L("Floor ", "الدور ") + du.floor)} />
                  <KV k={L("Unit type","نوع الوحدة")} v={TXc(du.type, "name") + (lv > 1 ? L(" · " + lv + "-storey duplex", " · دوبلكس من " + lv + " طوابق") : "")} />
                  <KV k={L("Built-up area","المساحة المبنية")} v={uArea + " m²"} />
                  <KV k={L("Bedrooms / baths","غرف النوم / الحمامات")} v={du.type.bedrooms + L(" bed · ", " غرف · ") + (du.baths || du.type.baths) + L(" bath", " حمام")} />
                  <KV k={L("Handover condition","حالة التسليم")} v={uPkg ? L("Furnished per Schedule A" + (uFit ? " · fit-out included" : ""), "مؤثثة وفق الملحق أ" + (uFit ? " · مع التجهيز الداخلي" : "")) : L("As per the Unit Purchase Agreement","وفق عقد شراء الوحدة")} />
                  {uOps ? <KV k={L("Operating model","نموذج التشغيل")} v={TXc(uOps, "name") + " · " + L("operator fee ", "رسوم المشغل ") + uOps.mgmtFee + "%"} /> : null}
                  {du.type.masterplanImg ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase", marginBottom: 5 }}>{L("Appendix A." + (ui + 1) + ".2 · Site & location", "الملحق أ." + (ui + 1) + ".2 · الموقع العام")}</div>
                      <img src={du.type.masterplanImg} alt="" style={{ width: "100%", height: 96, objectFit: "cover", borderRadius: 6, border: "1px solid " + LINE, display: "block" }} />
                      <div style={{ fontSize: 9.5, color: SOFT, marginTop: 3, lineHeight: 1.45 }}>{AR ? ("موقع الوحدة " + du.number + " ضمن " + TXc(project, "name") + ".") : ("Location of Unit " + du.number + " within " + TXc(project, "name") + ".")}</div>
                    </div>
                  ) : null}
                </div>
                <div>
                  {du.type.render3dImg ? (
                    <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid " + LINE, position: "relative", height: 128, marginBottom: 10 }}>
                      <img src={du.type.render3dImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", insetInlineStart: 10, bottom: 7, fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{TXc(du.type, "name")} · {L("3D render","تصوير ثلاثي الأبعاد")}</div>
                    </div>
                  ) : null}
                  <div style={{ border: "1px solid " + LINE, borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 10px", borderBottom: "1px solid " + LINE, background: "#FAF8F3" }}>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase" }}>{L("Appendix A." + (ui + 1) + " · Floor plan", "الملحق أ." + (ui + 1) + " · المخطط")}</span>
                      <span style={{ fontSize: 9.5, color: MUT }}>{uArea} m²</span>
                    </div>
                    <div style={{ padding: "6px 10px" }}>
                      {plans.length ? (() => {
                        const show = lv > 1 ? plans : plans.slice(0, 1);
                        return (
                          <div style={{ display: "grid", gridTemplateColumns: show.length > 1 ? "1fr 1fr" : "1fr", gap: 8 }}>
                            {show.map((p, i) => (
                              <div key={i}>
                                <img src={p.src} alt="" style={{ width: "100%", height: show.length > 1 ? 150 : 178, objectFit: "contain", display: "block", borderRadius: 4, background: "#fff" }} />
                                {p.label ? <div style={{ fontSize: 9, color: SOFT, textAlign: "center", marginTop: 2 }}>{AR ? (p.labelAr || p.label) : p.label}</div> : null}
                              </div>
                            ))}
                          </div>
                        );
                      })() : (window.FloorPlan ? (lv <= 1
                          ? window.FloorPlan({ type: du.type, palette: uColors, view: du.view || "" })
                          : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{Array.from({ length: lv }).map((_, i) => (
                              <div key={i}>
                                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", color: SOFT, textTransform: "uppercase", marginBottom: 4, textAlign: "center" }}>{window.unitLevelName(du.type, i)}</div>
                                {window.FloorPlan({ type: du.type, palette: uColors, view: du.view || "", level: i })}
                              </div>))}</div>) : null)}
                      <div style={{ fontSize: 9, color: SOFT, marginTop: 3, textAlign: "center" }}>{plans.length ? L("Indicative layout — refer to the final architectural drawings.","مخطط استرشادي — يرجى الرجوع إلى الرسومات المعمارية النهائية.") : L("Schematic layout · indicative only, not to construction scale.","مخطط تخطيطي · استرشادي فقط، ليس بمقياس البناء.")}</div>
                    </div>
                  </div>
                </div>
              </div>
            </AgSection>

            <SubHead n={multi ? "3." + (ui + 1) : "3"} title={L("The Interior","التشطيب الداخلي")} kicker={uDesign ? TXc(uDesign, "name") + (uPal && uPal.name ? " · " + (AR ? (uPal.nameAr || uPal.name) : uPal.name) : "") : L("Not included","غير مضمن")} />
            {uDesign ? (
              <>
                {uImgs.length ? (
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    {uImgs.map((img, i) => (
                      <div key={img.id || i} style={{ flex: 1, height: 96, borderRadius: 8, overflow: "hidden", position: "relative", background: uColors[i % uColors.length] }}>
                        <img src={img.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 45%)", pointerEvents: "none" }} />
                        <div style={{ position: "absolute", insetInlineStart: 10, bottom: 6, fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>{(AR && img.labelAr) ? img.labelAr : img.label}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
                  <div>
                    <p style={{ fontSize: 10.5, color: MUT, margin: "0 0 6px", lineHeight: 1.5 }}>{TXc(uDesign, "mood")}</p>
                    {uDesign.materials ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                        {((AR && uDesign.materialsAr && uDesign.materialsAr.length) ? uDesign.materialsAr : uDesign.materials).map((m, i) => (
                          <span key={i} style={{ fontSize: 9.5, padding: "2px 8px", borderRadius: 20, background: HAIR, color: "#4A4A4E" }}>{m}</span>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", color: SOFT, textTransform: "uppercase", marginBottom: 5 }}>{L("Palette","لوحة الألوان")}{uPal && uPal.name ? " · " + (AR ? (uPal.nameAr || uPal.name) : uPal.name) : ""}</div>
                    <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 14, border: "1px solid " + LINE }}>{uColors.map((hex, i) => <div key={i} style={{ flex: 1, background: hex }} />)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, color: SOFT, marginTop: 4 }}>{uColors.map((h) => String(h).toUpperCase()).join(" · ")}</div>
                    {(uDesign.paletteNote || uDesign.paletteNoteAr) ? <div style={{ fontSize: 8.5, color: SOFT, marginTop: 4, lineHeight: 1.45 }}>{AR ? (uDesign.paletteNoteAr || uDesign.paletteNote) : uDesign.paletteNote}</div> : null}
                  </div>
                  <div>
                    <KV k={L("Tier · package","الفئة · الباقة")} v={uPkg ? ((AR && uPkg.tierAr) ? uPkg.tierAr : uPkg.tier) + " — " + TXc(uPkg, "name") : "—"} />
                    {uPkg && uPkg.signature ? <KV k={L("Signature edition","إصدار موقع")} v={L("Co-branded with ", "بالتعاون مع ") + ((AR ? (uPkg.brandNameAr || uPkg.brandName) : uPkg.brandName) || "—")} /> : null}
                    <KV k={L("Pieces · warranty","القطع · الضمان")} v={uPkg ? uPkg.pieces + L(" items · ", " قطعة · ") + uPkg.warranty + L(" years", " سنوات") : "—"} />
                    <KV k={L("Furnishing BOQ","جدول كميات التأثيث")} v={uPkg ? L("Schedule A · F-1 — ", "الملحق أ · F-1 — ") + D.boqFor(uPkg, du.typeId).length + L(" lines, by room", " بندا، حسب الغرفة") : "—"} />
                    <KV k={L("Smart-home layer","طبقة المنزل الذكي")} v={uSmart ? TXc(uSmart, "name") + " · " + D.fmtSAR(uSmart.price) + L(" SAR", " ريال") : L("Not included","غير مضمن")} />
                    {(project.features && project.features.kitchens) ? <KV k={L("Kitchen","المطبخ")} v={uKitTxt || L("Not included","غير مضمن")} /> : null}
                    {(project.features && project.features.cooling) ? <KV k={L("Cooling","التكييف")} v={row && row.ac ? (AR ? (row.ac.brandAr || row.ac.brand) : row.ac.brand) + " " + TXc(row.ac, "name") + " · " + (row.acPoints || []).length + L(" indoor units", " وحدات داخلية") + (row.acPrice ? " · " + D.fmtSAR(row.acPrice) + L(" SAR incl. VAT", " ريال شامل الضريبة") : "") : L("Not included","غير مضمن")} /> : null}
                    {(project.features && project.features.flooring) ? <KV k={L("Flooring","الأرضيات")} v={row && row.flooringUp && row.flooringUp.length ? D.flooringSummary(project.id, du.typeId, Object.fromEntries(row.flooringUp.map((l) => [l.zone, { finishId: l.finish.id, sizeId: l.size ? l.size.id : null }])), AR) + (row.flooringPrice ? " · " + D.fmtSAR(row.flooringPrice) + L(" SAR incl. VAT · Appendix F-5", " ريال شامل الضريبة · الملحق F-5") : "") : L("Standard finish — included","التشطيب القياسي — مضمن")} /> : null}
                    {(project.features && project.features.layout) ? <KV k={L("Layout","المخطط")} v={row && row.layout && row.layout.length ? row.layout.map((o) => (AR ? (o.nameAr || o.name) : o.name)).join(" · ") + (row.layoutPrice ? " · " + D.fmtSAR(row.layoutPrice) + L(" SAR incl. VAT · Appendix F-6", " ريال شامل الضريبة · الملحق F-6") : L(" · no charge · Appendix F-6", " · بدون تكلفة · الملحق F-6")) : L("As designed","كما في التصميم")} /> : null}
                    <KV k={L("Fit-out","التجهيز الداخلي")} v={uFit ? L("Included — Schedule A · F-2","مضمن — الملحق أ · F-2") : L("Not selected","غير مختار")} />
                  </div>
                </div>
              </>
            ) : (
              <KV k={L("Furnishing","التأثيث")} v={L("Not included in this agreement — the unit is delivered as per the Unit Purchase Agreement.","غير مضمن في هذه الاتفاقية — تسلم الوحدة وفق عقد شراء الوحدة.")} />
            )}
          </Page>
        );
      });
  R.investment = () => (
      <Page>
        <AgSection n={N.investment} title={L("Investment Summary","ملخص الاستثمار")} brand={brand} kicker={L("OUR PROJECTION","إسقاطنا المعتمد")}>
          <div style={{ display: "grid", gridTemplateColumns: (ops || opsAny) ? "1fr 1fr" : "1fr", gap: 28 }}>
            {/* Capital outlay */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase", marginBottom: 6 }}>{L("This addendum","قيمة هذا الملحق")}</div>
              {(() => { const kt = perUnitRows.reduce((a, r) => a + (r.kitchenPrice || 0), 0); const hasKit = kt > 0; const acT = perUnitRows.reduce((a, r) => a + (r.acPrice || 0), 0); const hasAc = acT > 0; const flT = perUnitRows.reduce((a, r) => a + (r.flooringPrice || 0), 0); const hasFl = flT > 0; const layT = perUnitRows.reduce((a, r) => a + (r.layoutPrice || 0), 0); const hasLay = layT > 0; return (
                <React.Fragment>
                  <MoneyRow k={L("Furnishing & smart home","التأثيث والمنزل الذكي")} sub={L("incl. VAT","شامل الضريبة")} v={D.fmtSAR((fitoutOn ? furnishOnlyTotal : furnishTotal) - kt - acT - flT - layT) + " SAR"} />
                  {hasLay ? <MoneyRow k={L("Layout changes","تعديلات المخطط")} sub={L("incl. VAT · Appendix F-6","شامل الضريبة · الملحق F-6")} v={D.fmtSAR(layT) + " SAR"} /> : null}
                  {hasFl ? <MoneyRow k={L("Flooring upgrade","ترقية الأرضيات")} sub={L("incl. VAT · Appendix F-5","شامل الضريبة · الملحق F-5")} v={D.fmtSAR(flT) + " SAR"} /> : null}
                  {hasKit ? <MoneyRow k={L("Kitchen","المطبخ")} sub={L("incl. VAT · Appendix F-3","شامل الضريبة · الملحق F-3")} v={D.fmtSAR(kt) + " SAR"} /> : null}
                  {hasAc ? <MoneyRow k={L("Cooling / AC","التكييف")} sub={L("incl. VAT · Appendix F-4","شامل الضريبة · الملحق F-4")} v={D.fmtSAR(acT) + " SAR"} /> : null}
                </React.Fragment>); })()}
              {fitoutOn ? <MoneyRow k={L("Fit-out","التجهيز الداخلي")} sub={L("incl. VAT","شامل الضريبة")} v={D.fmtSAR(fitoutTotal) + " SAR"} /> : null}
              <MoneyRow k={L("Total addendum value","إجمالي قيمة الملحق")} total brand={brand} v={D.fmtSAR(furnishTotal) + " SAR"} />
              <p style={{ fontSize: 10.5, color: SOFT, marginTop: 12, lineHeight: 1.55 }}>
                {AR ? "سعر الوحدة وخطة دفعها محددان في عقد شراء الوحدة المستقل بين المشتري و" + legal + " ولا يشكلان جزءا من هذا الملحق. تعرض أرقام التأثيث والتجهيز شاملة ضريبة القيمة المضافة 15% وتسوى وفق جدول دفعات ذلك العقد (انظر §5). أما العائد المتوقع فهو دراسة استرشادية محسوبة على سعر الوحدة." : "The unit price and its payment plan are set out in the Buyer's separate Unit Purchase Agreement with " + legal + " and form no part of this addendum. Furnishing and fit-out figures are shown inclusive of 15% VAT and are settled on that agreement's payment schedule (see §5). The projected return is an indicative study computed on the unit price."}
              </p>
            </div>
            {/* Rental projection */}
            {(ops || opsAny) ? (
              <div style={{ padding: "16px 18px", borderRadius: 10, background: hero, color: readable(hero) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", opacity: 0.78, textTransform: "uppercase" }}>{L("Projected return","العائد المتوقع")} · {opsMixed ? L("per unit — see below", "لكل وحدة — أدناه") : TXc(ops || (opsRows[0] && opsRows[0].ops), "name")}</div>
                  {o.risk ? <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid " + readable(hero), borderRadius: 20, padding: "2px 8px", opacity: 0.9 }}>{(() => { const m = { low: ["Low risk", "مخاطر منخفضة"], medium: ["Medium risk", "مخاطر متوسطة"], high: ["High risk", "مخاطر عالية"] }[o.risk]; return m ? (AR ? m[1] : m[0]) : o.risk; })()}</span> : null}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{roi.toFixed(1)}%</span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>{L("net ROI / year","عائد صاف / سنة")}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", marginTop: 18, fontSize: 11 }}>
                  {!opsMixed && <ProjStat label={isDaily ? L("Avg nightly rate","متوسط السعر الليلي") : L("Monthly rent","الإيجار الشهري")} v={D.fmtSAR(rate) + " SAR"} />}
                  {!opsMixed && <ProjStat label={L("Occupancy","نسبة الإشغال")} v={occ + "%"} />}
                  {opsMixed && <ProjStat label={L("Units in operation","الوحدات في التشغيل")} v={opsRows.length + " / " + (o.rows || []).length} />}
                  {opsMixed && <ProjStat label={L("Priced on","على أساس سعر")} v={D.fmtSAR(o.opsUnitsPrice || 0) + " SAR"} />}
                  <ProjStat label={L("Annual gross","الإجمالي السنوي")} v={D.fmtSAR(annualGross) + " SAR"} />
                  <ProjStat label={(AR ? "رسوم المشغل · " : "Operator fee · ") + operatorFee + "%"} v={"−" + D.fmtSAR(annualGross - annualNet) + " SAR"} />
                  <ProjStat label={L("Net to owner / yr","الصافي للمالك / سنة")} v={D.fmtSAR(annualNet) + " SAR"} />
                  <ProjStat label={L("Gross yield","العائد الإجمالي")} v={grossYield.toFixed(1) + "%"} />
                  <ProjStat label={L("Horizon", "الأفق")} v={(order.years || 5) + L(" yrs", " سنة")} />
                </div>
                <p style={{ fontSize: 9.5, opacity: 0.72, marginTop: 16, lineHeight: 1.5 }}>
                  {AR ? `إسقاط تقديري فقط — تعتمد العوائد الفعلية على ظروف السوق ولا يضمنها البائع. يدفع الصافي للمالك شهريا من ${developer.name} وفق الملحق ب.` : `Projection only — actual returns depend on market conditions and are not guaranteed by the Seller. Net to owner is paid monthly by ${developer.name} per Schedule B.`}
                </p>
              </div>
            ) : null}
          </div>
        </AgSection>

        {/* PAGE 5 content folded in — Payment (addendum to the Unit Purchase Agreement) */}
        <AgSection n={N.payment} title={L("Payment","الدفعات")} brand={brand} kicker={L("ONE CONSIDERATION","مقابل إجمالي واحد")}>
          <p style={{ fontSize: 11.5, color: MUT, margin: "0 0 14px", lineHeight: 1.6 }}>
            {AR
              ? ("تعد هذه الاتفاقية ملحقا لعقد شراء الوحدة المبرم بين المشتري و" + legal + ". أعمال التأثيث والتشطيب الداخلي" + (fitoutOn ? " والتجهيز" : "") + (ops ? " والتشغيل" : "") + " المبينة أعلاه لا تفوتر للمشتري بشكل منفصل — بل تضاف قيمتها إلى مقابل الوحدة وتسوى وفق خطة الدفع ومراحل الإنشاء الواردة في عقد شراء الوحدة. ولا يسري أي جدول أقساط منفصل للتأثيث.")
              : <>This Agreement is an addendum to the Buyer's Unit Purchase Agreement with {legal}. The
            furnishing, interior{fitoutOn ? ", fit-out" : ""}{ops ? " and operating" : ""} works set out above are
            not separately invoiced to the Buyer — their value is added to the unit consideration and settled
            under the payment plan and construction milestones of that Unit Purchase Agreement. No separate
            furnishing instalment schedule applies.</>}
          </p>
          {mixedConfig && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, marginBottom: 14 }}>
              <thead><tr style={{ color: SOFT, fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                <th style={{ textAlign: "start", padding: "4px 0" }}>{L("Unit", "الوحدة")}</th><th style={{ textAlign: "start" }}>{L("Package", "الباقة")}</th><th style={{ textAlign: "start" }}>{L("Design · palette", "التصميم · اللوحة")}</th><th style={{ textAlign: "start" }}>{L("Smart home", "المنزل الذكي")}</th><th style={{ textAlign: "start" }}>{L("Kitchen", "المطبخ")}</th><th style={{ textAlign: "start" }}>{L("Cooling", "التكييف")}</th><th style={{ textAlign: "start" }}>{L("Fit-out", "التشطيب")}</th><th style={{ textAlign: "start" }}>{L("Operating", "التشغيل")}</th><th style={{ textAlign: "end" }}>{L("Extras incl. VAT", "الإضافات شاملة الضريبة")}</th>
              </tr></thead>
              <tbody>
                {perUnitRows.map((r) => (
                  <tr key={r.unit.number} style={{ borderTop: "1px dotted " + LINE }}>
                    <td style={{ padding: "5px 0", fontFamily: MONO, fontWeight: 600 }}>{r.unit.number}<span style={{ color: SOFT, fontWeight: 400, marginInlineStart: 6 }}>{TXc(r.unit.type, "name")}</span></td>
                    <td>{r.pkg ? TXc(r.pkg, "name") : "—"}</td>
                    <td>{r.design ? TXc(r.design, "name") + (r.palette ? " · " + (AR ? (r.palette.nameAr || r.palette.name) : r.palette.name) : "") : "—"}</td>
                    <td>{r.smart ? TXc(r.smart, "name") : "—"}</td>
                    <td>{r.kitchen ? TXc(r.kitchen, "name") + (r.kitchenScope ? " · " + TXc(r.kitchenScope, "name") : "") + (r.kitchenAddons && r.kitchenAddons.length ? " (+" + r.kitchenAddons.length + ")" : "") : "—"}</td>
                    <td>{r.ac ? r.ac.brand + " " + TXc(r.ac, "name") : "—"}</td>
                    <td>{r.fitout ? L("Included", "مضمن") : "—"}</td>
                    <td>{r.ops ? TXc(r.ops, "name") : "—"}</td>
                    <td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(r.furnish)} SAR</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(() => {
            const furnishNet = furnishTotal / 1.15;
            const furnishVat = furnishTotal - furnishNet;
            return (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <tbody>
              <tr style={{ borderBottom: "1px dotted " + LINE }}>
                <td style={{ padding: "8px 0", color: MUT }}>{L("Furnishing, smart home" + (kitchen || perUnitRows.some((r) => r.kitchen) ? ", kitchen" : "") + (ac || perUnitRows.some((r) => r.ac) ? ", cooling" : "") + (fitoutOn ? " & fit-out" : ""), "التأثيث والمنزل الذكي" + (kitchen || perUnitRows.some((r) => r.kitchen) ? " والمطبخ" : "") + (ac || perUnitRows.some((r) => r.ac) ? " والتكييف" : "") + (fitoutOn ? " والتجهيز" : ""))} <span style={{ color: SOFT, fontSize: 10 }}>{L("net", "صافي")}</span></td>
                <td style={{ textAlign: AR ? "left" : "right", fontFamily: MONO }}>{D.fmtSAR(furnishNet)} SAR</td>
              </tr>
              <tr style={{ borderBottom: "1px dotted " + LINE }}>
                <td style={{ padding: "8px 0", color: MUT }}>{L("VAT", "ضريبة القيمة المضافة")} <span style={{ color: SOFT, fontSize: 10 }}>15%</span></td>
                <td style={{ textAlign: AR ? "left" : "right", fontFamily: MONO }}>{D.fmtSAR(furnishVat)} SAR</td>
              </tr>
              <tr style={{ borderTop: "1.5px solid " + INK }}>
                <td style={{ padding: "9px 0", fontWeight: 700 }}>{L("Total addendum value", "إجمالي قيمة الملحق")} <span style={{ color: SOFT, fontSize: 10, fontWeight: 400 }}>{L("incl. VAT · added to the unit consideration", "شامل الضريبة · يضاف إلى مقابل الوحدة")}</span></td>
                <td style={{ textAlign: AR ? "left" : "right", fontFamily: MONO, fontWeight: 700, color: brand }}>{D.fmtSAR(furnishTotal)} SAR</td>
              </tr>
            </tbody>
          </table>
            );
          })()}
          <p style={{ fontSize: 10, color: SOFT, marginTop: 10, lineHeight: 1.5 }}>
            {AR
              ? ("جميع أسعار الباقات والمنتجات التي اختارها المشتري معروضة شاملة ضريبة القيمة المضافة 15%، وقد فصلت أعلاه إلى القيمة الصافية والضريبة. التأثيث والمنزل الذكي والتجهيز خدمات تخضع لضريبة القيمة المضافة 15%. تدفع قيمة هذا الملحق إلى " + legal + " ضمن دفعات عقد شراء الوحدة وبنفس مواعيدها ونسبها، ولا يترتب على المشتري أي جدول دفع منفصل.")
              : ("All package and product prices selected by the Buyer are quoted inclusive of 15% VAT and are split above into net value and VAT. Furnishing, smart-home and fit-out are services subject to 15% VAT. The value of this addendum is paid to " + legal + " within the instalments of the Unit Purchase Agreement, on the same dates and proportions — no separate payment schedule applies to the Buyer.")}
          </p>
        </AgSection>
      </Page>
  );
  R.schedule_a = () => (
      <Page>
        <AgSection n="A" title={L("Schedule A — Furnishing & Interior","الملحق أ — التأثيث والتشطيب")} brand={brand} kicker={mixedConfig ? L("Per-unit packages","باقات لكل وحدة") : (pkg ? ((AR && pkg.tierAr) ? pkg.tierAr : pkg.tier) + " · " + TXc(pkg, "name") : "")}>
          <Term n="A.1" h={L("Scope","النطاق")}>{mixedConfig ? (AR ? "يقوم البائع بتوريد وتركيب باقة التأثيث المحددة لكل وحدة في §3 من هذه الاتفاقية، منفذة بالتصميم ولوحة الألوان المختارة لتلك الوحدة، مع طبقة المنزل الذكي والتجهيز الداخلي حيثما اختيرا. وتعد جداول الكميات أدناه جزءا من هذا الملحق." : "The Seller shall supply and install the furnishing package specified for each unit in §3 of this Agreement, executed in the design and colour palette selected for that unit, together with the smart-home layer and interior fit-out where selected. The bills of quantities below form part of this Schedule.") : AR ? ("يقوم البائع بتوريد وتركيب باقة التأثيث «" + (pkg ? ((AR && pkg.tierAr) ? pkg.tierAr : pkg.tier) : "") + " — " + (pkg ? TXc(pkg, "name") : "") + "» (" + (pkg ? pkg.pieces : 0) + " قطعة) منفذة بتصميم «" + (design ? design.name : "") + "»" + (smart ? "، مع طبقة المنزل الذكي «" + smart.name + "»" : "") + (kitchen ? "، ومطبخ «" + (kitchen.nameAr || kitchen.name) + "» وفق الملحق F-3" : "") + (ac ? "، وتكييف " + (ac.brandAr || ac.brand) + " " + (ac.nameAr || ac.name) + " وفق الملحق F-4" : "") + (flAny ? "، وترقية الأرضيات وفق الملحق F-5" : "") + (layAny ? "، وتعديلات المخطط الداخلي وفق الملحق F-6" : "") + (fitoutOn ? "، إضافة إلى التجهيز الداخلي المفصل أدناه" : "") + ". وتعد جداول الكميات أدناه جزءا من هذا الملحق.") : ("The Seller shall supply and install the furnishing package “" + (pkg ? ((AR && pkg.tierAr) ? pkg.tierAr : pkg.tier) : "") + " — " + (pkg ? TXc(pkg, "name") : "") + "” (" + (pkg ? pkg.pieces : 0) + " items) executed in the “" + (design ? design.name : "") + "” design" + (smart ? ", with the “" + smart.name + "” smart-home layer" : "") + (kitchen ? ", and the “" + kitchen.name + "” kitchen per Appendix F-3" : "") + (ac ? ", and " + ac.brand + " " + ac.name + " cooling per Appendix F-4" : "") + (flAny ? ", and upgraded flooring per Appendix F-5" : "") + (layAny ? ", and the internal layout modifications per Appendix F-6" : "") + (fitoutOn ? ", together with the interior fit-out itemised below" : "") + ". The bills of quantities below form part of this Schedule.")}</Term>

          {(() => {
            // One F-1 table per distinct package × unit type; one F-2 per package with fit-out selected.
            const src = perUnitRows.length ? perUnitRows : (pkg && unit ? [{ unit, pkg, fitout: fitoutOn }] : []);
            const groups = []; const gi = {};
            src.forEach((r) => { if (!r.pkg || !r.unit) return; const k = r.pkg.id + "|" + r.unit.typeId; if (gi[k] == null) { gi[k] = groups.length; groups.push({ pkg: r.pkg, units: [], boq: D.boqFor(r.pkg, r.unit.typeId) }); } groups[gi[k]].units.push(r.unit.number); });
            const fgroups = []; const fi = {};
            src.forEach((r) => { if (!(r.fitout && r.pkg && r.pkg.fitout && r.unit)) return; const k = r.pkg.id; if (fi[k] == null) { fi[k] = fgroups.length; fgroups.push({ pkg: r.pkg, units: [], boq: r.pkg.fitout.boq || [] }); } fgroups[fi[k]].units.push(r.unit.number); });
            const TH = (t, extra) => <th style={Object.assign({ fontWeight: 500, fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textAlign: "start", padding: "0 0 6px" }, extra || {})}>{t}</th>;
            return (
              <React.Fragment>
                {groups.length === 0 ? <p style={{ fontSize: 10.5, color: SOFT, margin: "16px 0" }}>{L("Furnishing schedule attached separately.","جدول التأثيث مرفق منفصلا.")}</p> : null}
                {groups.map((g, n) => (
                  <React.Fragment key={"f1-" + n}>
                    <h4 style={{ fontSize: 11.5, fontWeight: 700, margin: "22px 0 6px" }}>{L("Appendix F-1" + (groups.length > 1 ? "." + (n + 1) : "") + " · Furnishing bill of quantities", "الملحق F-1" + (groups.length > 1 ? "." + (n + 1) : "") + " · جدول كميات التأثيث")} <span style={{ fontWeight: 400, color: SOFT, fontFamily: MONO, fontSize: 9.5, marginInlineStart: 6 }}>{g.units.join(" · ")} · {TXc(g.pkg, "name")} · {g.boq.length} {L("LINES","بندا")}</span></h4>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
                      <thead><tr style={{ color: SOFT, borderBottom: "1px solid " + INK }}>{TH(L("ROOM","الغرفة"))}{TH(L("ITEM","البند"))}{TH(L("QTY","الكمية"), { textAlign: "center" })}{TH(L("SUPPLIER","المورد"))}{TH(L("NOTES","ملاحظات"))}</tr></thead>
                      <tbody>
                        {g.boq.map((b, i) => (
                          <tr key={i} style={{ borderBottom: "1px dotted " + LINE }}>
                            <td style={{ padding: "3px 0", color: MUT }}>{(AR && b.roomAr) ? b.roomAr : TD(b.room)}</td>
                            <td style={{ fontWeight: 500 }}>{(AR && b.itemAr) ? b.itemAr : b.item}</td>
                            <td style={{ textAlign: "center", fontFamily: MONO }}>{b.qty}</td>
                            <td style={{ color: MUT }}>{b.supplier}</td>
                            <td style={{ color: SOFT }}>{AR ? (b.notesAr || "") : (b.notes || "")}</td>
                          </tr>
                        ))}
                        {g.boq.length === 0 ? <tr><td colSpan={5} style={{ padding: "12px 0", color: SOFT }}>{L("Furnishing schedule attached separately.","جدول التأثيث مرفق منفصلا.")}</td></tr> : null}
                      </tbody>
                    </table>
                  </React.Fragment>
                ))}
                {(() => {
                  // F-3 · Kitchen schedule — one block per distinct kitchen × scope × palette × add-ons
                  const kg = []; const ki = {};
                  perUnitRows.forEach((r) => { if (!r.kitchen || !r.unit) return; const ids = (r.kitchenAddons || []).map((a) => a.id).sort().join(","); const k = r.kitchen.id + "|" + (r.kitchenScope ? r.kitchenScope.id : "") + "|" + (r.kitchenPalette ? r.kitchenPalette.id : "") + "|" + ids; if (ki[k] == null) { ki[k] = kg.length; kg.push({ kit: r.kitchen, scope: r.kitchenScope, pal: r.kitchenPalette, addons: r.kitchenAddons || [], rows: [] }); } kg[ki[k]].rows.push(r); });
                  if (!kg.length) return null;
                  const KV = ({ k, v }) => <div style={{ display: "grid", gridTemplateColumns: "92px minmax(0, 1fr)", gap: 8, padding: "4px 0", borderBottom: "1px dotted " + LINE, lineHeight: 1.45 }}><span style={{ color: MUT }}>{k}</span><span style={{ fontWeight: 500, color: INK }}>{v}</span></div>;
                  return kg.map((g, n) => {
                    const sc = g.kit.scopes && g.scope ? g.kit.scopes[g.scope.id] : null;
                    const inc = sc ? ((AR && sc.includesAr && sc.includesAr.length) ? sc.includesAr : (sc.includes || [])) : [];
                    return (
                      <React.Fragment key={"f3-" + n}>
                        <h4 style={{ fontSize: 11.5, fontWeight: 700, margin: "24px 0 6px" }}>{L("Appendix F-3" + (kg.length > 1 ? "." + (n + 1) : "") + " · Kitchen", "الملحق F-3" + (kg.length > 1 ? "." + (n + 1) : "") + " · المطبخ")} <span style={{ fontWeight: 400, color: SOFT, fontFamily: MONO, fontSize: 9.5, marginInlineStart: 6 }}>{g.rows.map((r) => r.unit.number).join(" · ")} · {L("PRICED","مسعر")}</span></h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 18px", fontSize: 10.5, marginBottom: 8 }}>
                          <KV k={L("Design","التصميم")} v={TXc(g.kit, "name")} />
                          <KV k={L("Colour palette","لوحة الألوان")} v={g.pal ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ display: "inline-flex", gap: 2 }}>{(g.pal.colors || []).slice(0, 4).map((c, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.12)" }} />)}</span>{AR ? (g.pal.nameAr || g.pal.name) : g.pal.name}</span> : "—"} />
                          <KV k={L("Scope","النطاق")} v={g.scope ? TXc(g.scope, "name") : "—"} />
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
                          <thead><tr style={{ color: SOFT, borderBottom: "1px solid " + INK }}>{TH(L("SCOPE","النطاق"))}{TH(L("ITEM","البند"))}{TH(L("PRICE (EXCL. VAT)","السعر (بدون ضريبة)"), { textAlign: "end" })}</tr></thead>
                          <tbody>
                            {inc.map((it, i) => (
                              <tr key={"i" + i} style={{ borderBottom: "1px dotted " + LINE }}>
                                <td style={{ padding: "3px 0", color: MUT }}>{i === 0 ? (g.scope ? TXc(g.scope, "name") : "") : ""}</td>
                                <td style={{ fontWeight: 500 }}>{it}</td>
                                <td style={{ textAlign: "end", fontFamily: MONO, color: SOFT }}>{i === 0 ? L("included", "مضمن") : ""}</td>
                              </tr>
                            ))}
                            {g.addons.map((a, i) => (
                              <tr key={"a" + i} style={{ borderBottom: "1px dotted " + LINE }}>
                                <td style={{ padding: "3px 0", color: MUT }}>{i === 0 ? L("Optional items", "إضافات اختيارية") : ""}</td>
                                <td style={{ fontWeight: 500 }}>{TXc(a, "name")}</td>
                                <td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(a.price)}</td>
                              </tr>
                            ))}
                            {g.rows.map((r) => (
                              <tr key={r.unit.number} style={{ borderTop: "1.5px solid " + INK }}>
                                <td colSpan={2} style={{ padding: "7px 0", fontWeight: 700 }}>{L("Kitchen total · ", "إجمالي المطبخ · ")}{r.unit.number} <span style={{ fontWeight: 400, color: SOFT }}>{TXc(r.unit.type, "name")} · {L("incl. VAT", "شامل الضريبة")}</span></td>
                                <td style={{ textAlign: "end", fontFamily: MONO, fontWeight: 700, color: brand }}>{D.fmtSAR(r.kitchenPrice || 0)} SAR</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </React.Fragment>
                    );
                  });
                })()}
                {(() => {
                  // F-4 · Cooling schedule — one block per system × unit type × add-ons
                  const ag = []; const ai = {};
                  perUnitRows.forEach((r) => { if (!r.ac || !r.unit) return; const ids = (r.acAddons || []).map((a) => a.id).sort().join(","); const k = r.ac.id + "|" + r.unit.typeId + "|" + ids; if (ai[k] == null) { ai[k] = ag.length; ag.push({ ac: r.ac, pts: r.acPoints || [], addons: r.acAddons || [], typeId: r.unit.typeId, rows: [] }); } ag[ai[k]].rows.push(r); });
                  if (!ag.length) return null;
                  const KV = ({ k, v }) => <div style={{ display: "grid", gridTemplateColumns: "92px minmax(0, 1fr)", gap: 8, padding: "4px 0", borderBottom: "1px dotted " + LINE, lineHeight: 1.45 }}><span style={{ color: MUT }}>{k}</span><span style={{ fontWeight: 500, color: INK }}>{v}</span></div>;
                  return ag.map((g, n) => {
                    const ty = D.acTypeById(g.ac.type); const install = (Number(g.ac.install) || 0) * g.pts.length;
                    return (
                      <React.Fragment key={"f4-" + n}>
                        <h4 style={{ fontSize: 11.5, fontWeight: 700, margin: "24px 0 6px" }}>{L("Appendix F-4" + (ag.length > 1 ? "." + (n + 1) : "") + " · Cooling", "الملحق F-4" + (ag.length > 1 ? "." + (n + 1) : "") + " · التكييف")} <span style={{ fontWeight: 400, color: SOFT, fontFamily: MONO, fontSize: 9.5, marginInlineStart: 6 }}>{g.rows.map((r) => r.unit.number).join(" · ")} · {L("PRICED","مسعر")}</span></h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 18px", fontSize: 10.5, marginBottom: 8 }}>
                          <KV k={L("System","النظام")} v={<span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{g.ac.logo ? <img src={g.ac.logo} alt="" style={{ height: 12, maxWidth: 52, objectFit: "contain" }} /> : null}<span>{(AR ? (g.ac.brandAr || g.ac.brand) : g.ac.brand) + " " + TXc(g.ac, "name")}</span></span>} />
                          <KV k={L("Type","النوع")} v={AR ? ty.ar : ty.en} />
                          <KV k={L("Warranty","الضمان")} v={g.ac.warrantyYears ? g.ac.warrantyYears + L(" years", " سنوات") : "—"} />
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
                          <thead><tr style={{ color: SOFT, borderBottom: "1px solid " + INK }}>{TH(L("ROOM","الغرفة"))}{TH(L("CAPACITY","السعة"))}{TH(L("PRICE (EXCL. VAT)","السعر (بدون ضريبة)"), { textAlign: "end" })}</tr></thead>
                          <tbody>
                            {g.pts.map((p, i) => (
                              <tr key={"p" + i} style={{ borderBottom: "1px dotted " + LINE }}>
                                <td style={{ padding: "3px 0", fontWeight: 500 }}>{AR ? (p.roomAr || p.room) : p.room}</td>
                                <td style={{ fontFamily: MONO, color: MUT }}>{D.fmtSAR(p.btu)} BTU</td>
                                <td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(D.acTierPrice(g.ac, p.btu))}</td>
                              </tr>
                            ))}
                            <tr style={{ borderBottom: "1px dotted " + LINE }}><td style={{ padding: "3px 0", color: MUT }}>{L("Installation & commissioning", "التركيب والتشغيل")}</td><td style={{ fontFamily: MONO, color: MUT }}>× {g.pts.length}</td><td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(install)}</td></tr>
                            {g.addons.map((a, i) => (
                              <tr key={"a" + i} style={{ borderBottom: "1px dotted " + LINE }}>
                                <td style={{ padding: "3px 0", color: MUT }}>{i === 0 ? L("Optional items", "إضافات اختيارية") : ""}</td>
                                <td style={{ fontWeight: 500 }}>{TXc(a, "name")}</td>
                                <td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(a.price)}</td>
                              </tr>
                            ))}
                            {g.rows.map((r) => (
                              <tr key={r.unit.number} style={{ borderTop: "1.5px solid " + INK }}>
                                <td colSpan={2} style={{ padding: "7px 0", fontWeight: 700 }}>{L("Cooling total · ", "إجمالي التكييف · ")}{r.unit.number} <span style={{ fontWeight: 400, color: SOFT }}>{TXc(r.unit.type, "name")} · {L("incl. VAT", "شامل الضريبة")}</span></td>
                                <td style={{ textAlign: "end", fontFamily: MONO, fontWeight: 700, color: brand }}>{D.fmtSAR(r.acPrice || 0)} SAR</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </React.Fragment>
                    );
                  });
                })()}
                {(() => {
                  // F-5 · Flooring schedule — one block per unit with upgraded zones: zone · standard · selected · m² · rate · amount
                  const fr = perUnitRows.filter((r) => r.unit && r.flooringUp && r.flooringUp.length);
                  if (!fr.length) return null;
                  const Sw = ({ f }) => <span style={{ width: 9, height: 9, borderRadius: 2, display: "inline-block", verticalAlign: "middle", marginInlineEnd: 5, background: f && f.image ? "url(" + f.image + ") center/cover" : ((f && f.swatch) || "#DDD"), border: "1px solid rgba(0,0,0,0.15)" }} />;
                  const fnm = (o, k) => (AR && o && o[k + "Ar"]) ? o[k + "Ar"] : (o ? (o[k] || "") : "");
                  return fr.map((r, n) => {
                    const net = r.flooringUp.reduce((a, l) => a + l.amount, 0);
                    return (
                      <React.Fragment key={"f5-" + n}>
                        <h4 style={{ fontSize: 11.5, fontWeight: 700, margin: "24px 0 6px" }}>{L("Appendix F-5" + (fr.length > 1 ? "." + (n + 1) : "") + " · Flooring upgrades", "الملحق F-5" + (fr.length > 1 ? "." + (n + 1) : "") + " · ترقية الأرضيات")} <span style={{ fontWeight: 400, color: SOFT, fontFamily: MONO, fontSize: 9.5, marginInlineStart: 6 }}>{r.unit.number} · {TXc(r.unit.type, "name")} · {L("PRICED PER m²", "مسعر بالمتر المربع")}</span></h4>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
                          <thead><tr style={{ color: SOFT, borderBottom: "1px solid " + INK }}>{TH(L("ZONE","المنطقة"))}{TH(L("STANDARD (INCLUDED)","القياسي (مضمن)"))}{TH(L("SELECTED FINISH · SIZE","التشطيب المختار · المقاس"))}{TH(L("AREA","المساحة"), { textAlign: "end" })}{TH(L("RATE / m²","السعر / م²"), { textAlign: "end" })}{TH(L("AMOUNT (EXCL. VAT)","المبلغ (بدون ضريبة)"), { textAlign: "end" })}</tr></thead>
                          <tbody>
                            {r.flooring.map((l) => (
                              <tr key={l.zone} style={{ borderBottom: "1px dotted " + LINE, color: l.finish ? INK : SOFT }}>
                                <td style={{ padding: "3px 0", fontWeight: l.finish ? 600 : 400 }}>{AR ? l.meta.ar : l.meta.en}</td>
                                <td style={{ color: MUT }}>{l.standard ? <React.Fragment><Sw f={l.standard} />{fnm(l.standard, "name")}</React.Fragment> : "—"}</td>
                                <td style={{ fontWeight: 500 }}>{l.finish ? <React.Fragment><Sw f={l.finish} />{fnm(l.finish, "name")}{l.size ? " · " + fnm(l.size, "label") : ""}</React.Fragment> : L("As standard", "قياسي")}</td>
                                <td style={{ textAlign: "end", fontFamily: MONO }}>{l.area} m²</td>
                                <td style={{ textAlign: "end", fontFamily: MONO }}>{l.finish ? D.fmtSAR(l.rate) : "—"}</td>
                                <td style={{ textAlign: "end", fontFamily: MONO }}>{l.finish ? D.fmtSAR(l.amount) : L("included", "مضمن")}</td>
                              </tr>
                            ))}
                            <tr style={{ borderTop: "1px solid " + LINE }}><td colSpan={5} style={{ padding: "5px 0", color: MUT }}>{L("Flooring upgrade · net", "ترقية الأرضيات · صاف")}</td><td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(net)}</td></tr>
                            <tr style={{ borderTop: "1.5px solid " + INK }}>
                              <td colSpan={5} style={{ padding: "7px 0", fontWeight: 700 }}>{L("Flooring total · ", "إجمالي الأرضيات · ")}{r.unit.number} <span style={{ fontWeight: 400, color: SOFT }}>{L("incl. VAT", "شامل الضريبة")}</span></td>
                              <td style={{ textAlign: "end", fontFamily: MONO, fontWeight: 700, color: brand }}>{D.fmtSAR(r.flooringPrice || 0)} SAR</td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={{ fontSize: 9.5, color: SOFT, margin: "6px 0 0", lineHeight: 1.5 }}>{L("Zones marked “as standard” are delivered in the project's standard finish at no cost. Areas are nominal per unit type; natural stone and timber vary in tone and veining.", "تسلم المناطق المؤشر عليها «قياسي» بالتشطيب القياسي للمشروع دون تكلفة. المساحات اسمية حسب نوع الوحدة، ويتفاوت الحجر الطبيعي والخشب في اللون والعروق.")}</p>
                      </React.Fragment>
                    );
                  });
                })()}
                {(() => {
                  // F-6 · Layout modifications — one block per unit with changes: area · option · works · rooms after · price
                  const lr = perUnitRows.filter((r) => r.unit && r.layout && r.layout.length);
                  if (!lr.length) return null;
                  return lr.map((r, n) => {
                    const net = r.layout.reduce((a, o) => a + D.layoutPrice(o, project), 0);
                    return (
                      <React.Fragment key={"f6-" + n}>
                        <h4 style={{ fontSize: 11.5, fontWeight: 700, margin: "24px 0 6px" }}>{L("Appendix F-6" + (lr.length > 1 ? "." + (n + 1) : "") + " · Layout modifications", "الملحق F-6" + (lr.length > 1 ? "." + (n + 1) : "") + " · تعديلات المخطط")} <span style={{ fontWeight: 400, color: SOFT, fontFamily: MONO, fontSize: 9.5, marginInlineStart: 6 }}>{r.unit.number} · {TXc(r.unit.type, "name")} · {L("PRE-APPROVED", "معتمدة مسبقا")}</span></h4>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
                          <thead><tr style={{ color: SOFT, borderBottom: "1px solid " + INK }}>{TH(L("AREA","المنطقة"))}{TH(L("AS DESIGNED → SELECTED","كما في التصميم ← المختار"))}{TH(L("WORKS INCLUDED","الأعمال المشمولة"))}{TH(L("ROOMS AFTER","الغرف بعد التعديل"))}{TH(L("PRICE (EXCL. VAT)","السعر (بدون ضريبة)"), { textAlign: "end" })}</tr></thead>
                          <tbody>
                            {r.layout.map((o) => { const works = (AR && o.worksAr && o.worksAr.length) ? o.worksAr : (o.works || []); const price = D.layoutPrice(o, project); return (
                              <tr key={o.id} style={{ borderBottom: "1px dotted " + LINE }}>
                                <td style={{ padding: "3px 0", fontWeight: 600, verticalAlign: "top" }}>{AR ? (o.areaNameAr || o.areaName) : o.areaName}</td>
                                <td style={{ verticalAlign: "top" }}><span style={{ color: MUT }}>{AR ? (o.asDesignedAr || o.asDesigned) : o.asDesigned}</span> → <span style={{ fontWeight: 500 }}>{AR ? (o.nameAr || o.name) : o.name}</span><div style={{ color: SOFT, fontSize: 9 }}>{o.kind === "remove" ? L("wall removed", "إزالة جدار") : L("wall added", "إضافة جدار")}{o.wallM ? " · " + o.wallM + " m" : ""}{o.doors ? " · " + o.doors + L(" door(s)", " باب") : ""}</div></td>
                                <td style={{ color: MUT, verticalAlign: "top" }}>{works.join(" · ")}</td>
                                <td style={{ verticalAlign: "top" }}>{(AR ? (o.roomsAfterAr || o.roomsAfter) : o.roomsAfter) || "—"}</td>
                                <td style={{ textAlign: "end", fontFamily: MONO, verticalAlign: "top" }}>{price ? D.fmtSAR(price) : L("no charge", "بدون تكلفة")}</td>
                              </tr>); })}
                            <tr style={{ borderTop: "1px solid " + LINE }}><td colSpan={4} style={{ padding: "5px 0", color: MUT }}>{L("Layout changes · net", "تعديلات المخطط · صاف")}</td><td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(net)}</td></tr>
                            <tr style={{ borderTop: "1.5px solid " + INK }}>
                              <td colSpan={4} style={{ padding: "7px 0", fontWeight: 700 }}>{L("Layout total · ", "إجمالي المخطط · ")}{r.unit.number} <span style={{ fontWeight: 400, color: SOFT }}>{L("incl. VAT", "شامل الضريبة")}</span></td>
                              <td style={{ textAlign: "end", fontFamily: MONO, fontWeight: 700, color: brand }}>{D.fmtSAR(r.layoutPrice || 0)} SAR</td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={{ fontSize: 9.5, color: SOFT, margin: "6px 0 0", lineHeight: 1.5 }}>{(() => { const dl = D.deadlineFor(project, "layout"); const dt = dl ? dl.toLocaleDateString(AR ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "2-digit", month: "long", year: "numeric" }) : ""; return L("Pre-approved modifications to non-load-bearing partitions and doors; the registered area and external envelope are unchanged. Where a modification changes the number or use of rooms, this appendix prevails over the room count in the unit description." + (dt ? " Layout selections are final after " + dt + "." : ""), "تعديلات معتمدة مسبقا على الجدران غير الحاملة والأبواب؛ المساحة المسجلة والغلاف الخارجي دون تغيير. وحيثما يغير التعديل عدد الغرف أو استخدامها يعتد بهذا الملحق على وصف الوحدة." + (dt ? " تصبح اختيارات المخطط نهائية بعد " + dt + "." : "")); })()}</p>
                      </React.Fragment>
                    );
                  });
                })()}
                {fgroups.map((g, n) => (
                  <React.Fragment key={"f2-" + n}>
                    <h4 style={{ fontSize: 11.5, fontWeight: 700, margin: "24px 0 6px" }}>{L("Appendix F-2" + (fgroups.length > 1 ? "." + (n + 1) : "") + " · Fit-out bill of quantities", "الملحق F-2" + (fgroups.length > 1 ? "." + (n + 1) : "") + " · جدول كميات التجهيز")} <span style={{ fontWeight: 400, color: SOFT, fontFamily: MONO, fontSize: 9.5, marginInlineStart: 6 }}>{g.units.join(" · ")} · {L("PRICED","مسعر")}</span></h4>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
                      <thead><tr style={{ color: SOFT, borderBottom: "1px solid " + INK }}>{TH(L("SCOPE","النطاق"))}{TH(L("ITEM","البند"))}{TH(L("QTY","الكمية"), { textAlign: "center" })}{TH(L("UNIT PRICE","سعر الوحدة"), { textAlign: "end" })}{TH(L("LINE TOTAL","إجمالي البند"), { textAlign: "end" })}</tr></thead>
                      <tbody>
                        {g.boq.map((b, i) => (
                          <tr key={i} style={{ borderBottom: "1px dotted " + LINE }}>
                            <td style={{ padding: "3px 0", color: MUT }}>{(AR && b.roomAr) ? b.roomAr : TD(b.room)}</td>
                            <td style={{ fontWeight: 500 }}>{(AR && b.itemAr) ? b.itemAr : b.item}</td>
                            <td style={{ textAlign: "center", fontFamily: MONO }}>{b.qty}</td>
                            <td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(b.unitPrice)}</td>
                            <td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR((b.qty || 0) * (b.unitPrice || 0))}</td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: "1.5px solid " + INK }}>
                          <td colSpan={4} style={{ padding: "7px 0", fontWeight: 700 }}>{L("Fit-out total per unit (excl. VAT)","إجمالي التجهيز لكل وحدة (بدون ضريبة)")}{g.units.length > 1 ? " × " + g.units.length : ""}</td>
                          <td style={{ textAlign: "end", fontFamily: MONO, fontWeight: 700, color: brand }}>{D.fmtSAR(D.boqTotal(g.boq))}{g.units.length > 1 ? " × " + g.units.length : ""}</td>
                        </tr>
                      </tbody>
                    </table>
                  </React.Fragment>
                ))}
              </React.Fragment>
            );
          })()}

          <Term n="A.2" h={L("Procurement & installation","التوريد والتركيب")}>{AR ? ("يتم التوريد قبل التسليم ب 9 إلى 7 أشهر، والتركيب قبله ب 4 إلى شهر واحد" + (fitoutOn ? "؛ ويكتمل التجهيز قبل تركيب الأثاث" : "") + ". تجرى جولة تفقدية مشتركة قبل التسليم بشهر بحضور المشتري.") : ("Procurement occurs T-9 to T-7 months and installation T-4 to T-1 months before handover" + (fitoutOn ? "; the fit-out completes before furniture installation" : "") + ". A joint walkthrough is held T-1 month with the Buyer present.")}</Term>
          <Term n="A.3" h={L("Title & risk in the goods","الملكية والمخاطر في البضائع")}>{AR ? "تنتقل ملكية بنود التأثيث إلى المشتري عند سداد كامل قيمة الباقة؛ وتنتقل المخاطر عند التركيب وتسليم الوحدة. البنود جديدة وغير مستعملة وموردة وفق المواصفات في جداول الكميات." : "Title to the furnishing items passes to the Buyer on full payment of the package value; risk passes on installation and handover of the Unit. Items are new, unused and supplied to the specification in the bills of quantities."}</Term>
          <Term n="A.4" h={L("Warranty & defects","الضمان والعيوب")}>{AR ? ("يضمن البائع الأثاث والتشطيبات لمدة " + (pkg ? pkg.warranty : 5) + " سنوات" + (fitoutOn && pkg && pkg.fitout && pkg.fitout.warranty ? "، وتشطيبات التجهيز لمدة " + pkg.fitout.warranty + " سنوات" : "") + " من التسليم، باستثناء الاستهلاك المعتاد. تصلح العيوب المبلغ عنها خلال فترة الملاحظات (30 يوما) دون تكلفة على المشتري.") : ("The Seller warrants the furniture and finishes for " + (pkg ? pkg.warranty : 5) + " years" + (fitoutOn && pkg && pkg.fitout && pkg.fitout.warranty ? ", and the fit-out finishes for " + pkg.fitout.warranty + " years" : "") + " from handover, fair wear and tear excepted. Defects reported within the 30-day snagging window are remedied at no cost to the Buyer.")}</Term>
          <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 8, background: "#FAF8F3", border: "1px solid " + LINE }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase", marginBottom: 4 }}>{L("A.5 · Commercial value","A.5 · القيمة التجارية")}</div>
            <MoneyRow k={L("Furnishing","التأثيث")} sub={L("incl. VAT","شامل الضريبة")} v={D.fmtSAR(fitoutOn ? furnishOnlyTotal : furnishTotal) + " SAR"} />
            {fitoutOn ? <MoneyRow k={L("Fit-out","التجهيز الداخلي")} sub={L("incl. VAT","شامل الضريبة")} v={D.fmtSAR(fitoutTotal) + " SAR"} /> : null}
            <MoneyRow k={L("Package value","قيمة الباقة")} total brand={brand} v={D.fmtSAR(furnishTotal) + " SAR"} />
          </div>
        </AgSection>
      </Page>
  );
  R.schedule_b = () => (ops || opsAny) ? (
        <Page>
          <AgSection n="B" title={L("Schedule B — Operating & Rental Management","الملحق ب — التشغيل وإدارة الإيجار")} brand={brand} kicker={opsMixed ? L("Per-unit models", "نماذج لكل وحدة") : TXc(ops || opsRows[0].ops, "name")}>
            {opsMixed ? (
              <Term n="B.1" h={L("Appointment & models","التعيين ونماذج التشغيل")}>{AR ? ("يعين المشتري («المالك») " + legal + " («المشغل») لإدارة تأجير الوحدات التالية، كل وفق نموذجها: " + opsRows.map((r) => r.unit.number + " — «" + TXc(r.ops, "name") + "» (" + (r.ops.kind === "daily" ? "يومي" : "شهري") + "، رسوم " + r.ops.mgmtFee + "%)").join("؛ ") + ". يتولى المشغل التسويق والحجز واستقبال النزلاء والتنظيف والصيانة نيابة عن المالك.") : ("The Buyer (the “Owner”) appoints " + developer.name + " (the “Operator”) to manage the letting of the following Units, each under its own model: " + opsRows.map((r) => r.unit.number + " — “" + TXc(r.ops, "name") + "” (" + (r.ops.kind === "daily" ? "nightly" : "monthly") + ", " + r.ops.mgmtFee + "% fee)").join("; ") + ". The Operator markets, books, checks in guests, cleans and maintains the Units on the Owner's behalf.")}</Term>
            ) : (
              <Term n="B.1" h={L("Appointment & model","التعيين ونموذج التشغيل")}>{(() => { const m = ops || opsRows[0].ops; const dly = m.kind === "daily"; return AR ? ("يعين المشتري («المالك») " + legal + " («المشغل») لإدارة تأجير الوحدة وفق نموذج «" + TXc(m, "name") + "» (" + (dly ? "يومي / إقامة قصيرة" : "شهري / إقامة طويلة") + "). يتولى المشغل التسويق والحجز واستقبال النزلاء والتنظيف والصيانة نيابة عن المالك.") : ("The Buyer (the “Owner”) appoints " + developer.name + " (the “Operator”) to manage the letting of the Unit under the “" + m.name + "” model (" + (dly ? "nightly / short-stay" : "monthly / long-stay") + "). The Operator markets, books, checks in guests, cleans and maintains the Unit on the Owner's behalf."); })()}</Term>
            )}
            <Term n="B.2" h={L("Operator fee & payout","رسوم المشغل والتوزيع")}>{opsMixed ? (AR ? ("يتقاضى المشغل رسوم كل نموذج كما هو مبين في B.1 (متوسط موزون " + operatorFee + "% من إجمالي الإيجار). يدفع صافي الإيجار للمالك شهريا، قبل اليوم الخامس من الشهر التالي، إلى حساب المالك المحدد.") : ("The Operator charges each model's fee as set out in B.1 (weighted average " + operatorFee + "% of gross rental). Net rental is paid to the Owner monthly, by the 5th of the following month, to the Owner's nominated account.")) : (AR ? ("يتقاضى المشغل " + operatorFee + "% من إجمالي الإيجار. يدفع صافي الإيجار للمالك شهريا، قبل اليوم الخامس من الشهر التالي، إلى حساب المالك المحدد.") : ("The Operator charges " + operatorFee + "% of gross rental. Net rental is paid to the Owner monthly, by the 5th of the following month, to the Owner's nominated account."))}</Term>
            <Term n="B.3" h={L("Reporting","التقارير")}>{AR ? "يسلم للمالك بيان دخل شهري يوضح إجمالي الإيجار ورسوم المشغل وتكاليف المنصات والمرافق والصافي للمالك." : "A monthly income statement is delivered to the Owner showing gross rental, operator fee, platform and utility costs, and net to the Owner."}</Term>
            <Term n="B.4" h={L("Term, renewal & termination","المدة والتجديد والإنهاء")}>{AR ? "مدة أدناها سنتان (2) من التفعيل، ثم تجديد تلقائي لمدة 12 شهرا ما لم يخطر أحد الطرفين قبل ستين (60) يوما. يترتب على الإنهاء المبكر من المالك رسم يعادل متوسط صافي إيراد ثلاثة (3) أشهر." : "Minimum term of two (2) years from activation, then 12-month auto-renewal unless either party gives sixty (60) days' notice. Early termination by the Owner attracts a charge equal to three (3) months' average net revenue."}</Term>
            <Term n="B.5" h={L("Owner obligations","التزامات المالك")}>{AR ? "يلتزم المالك بالتأمين على الوحدة، والحفاظ على التأثيث في حالة صالحة للتأجير (باستثناء الاستهلاك المعتاد)، وعدم تأجير الوحدة بمعزل عن المشغل خلال المدة." : "The Owner shall keep the Unit insured, maintain the furnishing in lettable condition (fair wear and tear excepted), and not let the Unit independently of the Operator during the term."}</Term>
            <Term n="B.6" h={L("Delivery & counterparty","التنفيذ والطرف المقابل")}>{AR ? "يجوز للمشغل تنفيذ هذه الخدمات عبر اتفاقية ظهر‑لظهر مع Revnu لإدارة الأملاك، مع بقائه الطرف الوحيد تجاه المالك في الأداء والتقارير والتوزيعات." : "The Operator may discharge these services through a back-to-back agreement with Revnu Property Management while remaining the Owner's sole counterparty for performance, reporting and payouts."}</Term>
            <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 8, background: "#FAF8F3", border: "1px solid " + LINE }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase", marginBottom: 8 }}>{L("B.7 · Projected economics (indicative)","B.7 · الاقتصاديات المتوقعة (إرشادية)")}</div>
              {opsRows.length > 1 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, marginBottom: 10 }}>
                  <thead><tr style={{ color: SOFT, fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    <th style={{ textAlign: "start", padding: "4px 0" }}>{L("Unit", "الوحدة")}</th><th style={{ textAlign: "start" }}>{L("Model", "النموذج")}</th><th style={{ textAlign: "end" }}>{L("Rate", "السعر")}</th><th style={{ textAlign: "end" }}>{L("Occ.", "الإشغال")}</th><th style={{ textAlign: "end" }}>{L("Fee", "الرسوم")}</th><th style={{ textAlign: "end" }}>{L("Net / yr", "الصافي / سنة")}</th><th style={{ textAlign: "end" }}>{L("Net ROI", "العائد الصافي")}</th>
                  </tr></thead>
                  <tbody>
                    {opsRows.map((r) => (
                      <tr key={r.unit.number} style={{ borderTop: "1px dotted " + LINE }}>
                        <td style={{ padding: "5px 0", fontFamily: MONO, fontWeight: 600 }}>{r.unit.number}</td>
                        <td>{TXc(r.ops, "name")}</td>
                        <td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(r.ec.rate)}{r.ops.kind === "daily" ? L("/nt", "/ليلة") : L("/mo", "/شهر")}</td>
                        <td style={{ textAlign: "end", fontFamily: MONO }}>{r.ec.occ}%</td>
                        <td style={{ textAlign: "end", fontFamily: MONO }}>{r.ops.mgmtFee}%</td>
                        <td style={{ textAlign: "end", fontFamily: MONO }}>{D.fmtSAR(r.ec.annualNet)}</td>
                        <td style={{ textAlign: "end", fontFamily: MONO, fontWeight: 600 }}>{r.ec.roi.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!opsMixed && <AgRow k={isDaily ? L("Average nightly rate","متوسط السعر الليلي") : L("Monthly rent","الإيجار الشهري")} v={D.fmtSAR(rate) + " SAR"} />}
              {!opsMixed && <AgRow k={L("Occupancy","نسبة الإشغال")} v={occ + "%"} />}
              <AgRow k={L("Annual gross rental","إجمالي الإيجار السنوي")} v={D.fmtSAR(annualGross) + " SAR"} />
              <AgRow k={(AR ? "رسوم المشغل · " : "Operator fee · ") + operatorFee + "%"} v={"−" + D.fmtSAR(annualGross - annualNet) + " SAR"} />
              <AgRow k={L("Annual net to Owner","صافي الدخل السنوي للمالك")} v={D.fmtSAR(annualNet) + " SAR"} strong />
              <AgRow k={L("Gross yield","العائد الإجمالي")} v={grossYield.toFixed(1) + "%"} />
              <AgRow k={L("Net ROI / year","العائد الصافي السنوي")} v={roi.toFixed(1) + "%"} />
              <p style={{ fontSize: 10, color: SOFT, margin: "10px 0 0", lineHeight: 1.5 }}>{L("Projection only — actual returns depend on market conditions and are not guaranteed by the Operator.","إسقاط تقديري فقط — تعتمد العوائد الفعلية على ظروف السوق ولا يضمنها المشغل.")}</p>
            </div>
          </AgSection>
        </Page>
      ) : null;
  R.execution = () => (
      <Page>
        <AgSection n={N.execution} title={L("Execution","التوقيع والإبرام")} brand={brand} kicker={L("SIGNED BY THE PARTIES","موقع من الطرفين")}>
          <p style={{ fontSize: 11.5, color: MUT, lineHeight: 1.6, margin: "0 0 20px" }}>
            {AR
              ? ("بالتوقيع أدناه، يوافق المشتري و" + legal + " على الالتزام بهذه الاتفاقية مع ملاحقها وجداولها — المخطط الأرضي (الملحق أ)، وجداول كميات التأثيث والتجهيز (الملحق أ، الملاحق F-1" + (fitoutOn ? " و F-2" : "") + ")" + (ops ? "، وشروط التشغيل (الملحق ب)" : "") + "، وإقرار اعرف عميلك وحماية البيانات.")
              : ("By signing below, the Buyer and " + legal + " agree to be bound by this Agreement together with its Schedules and Appendices — the floor plan (Appendix A), the furnishing and fit-out bills of quantities (Schedule A, Appendices F-1" + (fitoutOn ? " & F-2" : "") + ")" + (ops ? ", the operating terms (Schedule B)" : "") + " and the KYC & PDPL acknowledgement.")}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 6 }}>
            <AgSigBlock role={L("The Buyer","المشتري")} name={c.fullName || "—"} sub={L("Beneficiary","المستفيد")} ar={AR} img={esig ? esig.signatureData : null} typed={esig ? esig.typedName : null} when={esig ? fmtTs(esig.signedAt) : null} note={L("Signed electronically on the buyer's own device","توقيع إلكتروني من جهاز المشتري")} />
            <AgSigBlock role={L("The Seller","البائع")} name={legal} ar={AR} img={issued ? devSigImg : null} stamp={issued ? devStampImg : null} when={issued ? fmtTs(issuedAt) : null} note={L("Signed & stamped electronically at issue","توقيع وختم إلكتروني عند الإصدار")} sub={(() => {
              const nm = (AR ? (sgn.authorizedSignerAr || sgn.authorizedSigner) : sgn.authorizedSigner) || developer.primaryContact;
              const title = AR ? (sgn.authorizedSignerTitleAr || sgn.authorizedSignerTitle) : sgn.authorizedSignerTitle;
              return nm + (title ? (AR ? "، " : ", ") + title : (AR ? "، المفوض بالتوقيع" : ", authorised signatory"));
            })()} />
          </div>
          <div style={{ marginTop: 34, fontSize: 9.5, color: SOFT, display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px dotted " + LINE }}>
            <span style={{ fontFamily: MONO }}>{ref} · {project ? project.name : ""}</span>
            <span style={{ fontFamily: MONO, letterSpacing: "0.08em" }}>Revnu.sa</span>
          </div>
        </AgSection>
      </Page>
  );
  // Signature certificate — the last page of a signed agreement (how, when and from where it was signed)
  R.certificate = () => {
    if (!esig) return null;
    const read = esig.readSections || []; const code = esig.signingCode || "";
    const ua = (u) => { const os = /iPhone|iPad/.test(u) ? "iPhone" : /Android/.test(u) ? "Android" : /Mac OS/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : ""; const br = /CriOS|Chrome/.test(u) ? "Chrome" : /Safari/.test(u) ? "Safari" : /Firefox/.test(u) ? "Firefox" : ""; return [os, br].filter(Boolean).join(" · "); };
    const rows = [
      [L("Agreement","العقد"), ref + " · " + order.id + (order.agreement ? " · v" + order.agreement.version : "")],
      [L("Document fingerprint (SHA-256)","بصمة المستند (SHA-256)"), esig.documentHash || "—", true],
      [L("Seller","البائع"), (signerName || legal) + " · " + L("signature & stamp applied electronically at issue","توقيع وختم إلكتروني عند الإصدار") + (issuedAt ? " · " + fmtTs(issuedAt) : "")],
      [L("Buyer","المشتري"), (esig.signerName || c.fullName || "—") + " · " + L("ID","الهوية") + " ••••••" + (esig.signerIdLast4 || "")],
      [L("Signed at","وقت التوقيع"), fmtTs(esig.signedAt) + " (" + L("Riyadh time, UTC+3","بتوقيت الرياض، UTC+3") + ")"],
      [L("From","من"), [esig.ip || L("IP recorded server-side in production","يسجل عنوان IP من الخادم في النسخة الفعلية"), esig.userAgent ? ua(esig.userAgent) : ""].filter(Boolean).join(" · ")],
      [L("Via","عبر"), L("Signing link","رابط التوقيع") + " " + code + " · " + L("buyer's own device","جهاز المشتري")],
      [L("Read","القراءة"), read.length ? readSummary(read, AR) + " · " + fmtTs(read[0].at) + (AR ? " ← " : " → ") + fmtTs(read[read.length - 1].at) : "—"],
      [L("Consent","الموافقة"), fmtTs(esig.consentAt) + (esig.termsVersion ? " · " + L("terms v","الشروط ") + esig.termsVersion : "")],
    ];
    return (
      <Page key="certificate">
        <section style={{ marginTop: 38 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "baseline", borderBottom: "1.5px solid " + INK, paddingBottom: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: brand, letterSpacing: "0.06em" }}>✓</span>
            <h2 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, margin: 0, letterSpacing: "-0.01em", flex: 1 }}>{L("Signature certificate","شهادة التوقيع")}</h2>
            <span style={{ fontSize: 10.5, color: SOFT, fontFamily: MONO, letterSpacing: "0.04em" }}>{L("PART OF THE SIGNED AGREEMENT","جزء من العقد الموقع")}</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 11.5, color: MUT, lineHeight: 1.6, margin: "0 0 14px" }}>{L("This page records how the agreement was signed. Any change to the agreement's facts or text would produce a different fingerprint.","تسجل هذه الصفحة كيفية توقيع العقد، وأي تغيير في بياناته أو نصه ينتج بصمة مختلفة.")}</p>
            {rows.map(([k, v, mono]) => <AgRow key={k} k={k} v={mono ? <span style={{ fontFamily: MONO, fontSize: 11 }}>{v}</span> : v} />)}
            {esig.signatureData ? <div style={{ marginTop: 18 }}><div style={{ fontSize: 9.5, color: SOFT, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, fontFamily: MONO }}>{L("Captured signature","التوقيع الملتقط")}</div><img src={esig.signatureData} alt="" style={{ maxHeight: 90, maxWidth: 320, marginTop: 8, display: "block" }} /></div> : null}
          </div>
        </section>
      </Page>
    );
  };
  R.clauses = (grp, gi) => (
    <Page key={"clauses-" + gi}>
      {grp.sections.map((sec, si) => (
        <AgSection key={si} n={sec.no} title={sec.title} brand={brand}>
          {sec.items.map((b, i) => (
            <Term key={b.id || i} n={sec.no + "." + (i + 1)} h={(AR ? (b.titleAr || b.title) : (b.title || b.titleAr)) || ""}>{clauseBody(AR ? (b.bodyAr || b.body) : (b.body || b.bodyAr))}</Term>
          ))}
        </AgSection>
      ))}
    </Page>
  );

  return (
    <div className="ag-doc-wrap" key={AR ? "doc-ar" : "doc-en"} dir={AR ? "rtl" : "ltr"} lang={AR ? "ar" : "en"} data-i18n-skip={AR ? undefined : "1"} style={{ background: "linear-gradient(180deg, var(--bg-tint), var(--bg-sunken))", padding: "30px 22px", borderRadius: "var(--r-lg)", border: "1px solid var(--line)", fontFamily: AR ? AR_FONT : undefined, textAlign: AR ? "right" : undefined, position: "relative", minWidth: 0, maxWidth: "100%" }}>
      <FitA4 dir={AR ? "rtl" : "ltr"}>{(flow) => <div className="ag-sheets" style={{ display: "flex", flexDirection: "column", alignItems: flow ? "stretch" : "center", gap: flow ? 14 : 22 }}>
        <A4Doc flow={flow} dir={AR ? "rtl" : "ltr"} lang={AR ? "ar" : "en"} fontFamily={AR ? AR_FONT : undefined}
          logical={seq.flatMap((s, i) => s.kind === "clauses" ? [R.clauses(s, i)] : (R[s.ref] ? [].concat(R[s.ref]()) : [])).filter(Boolean).concat(esig ? [R.certificate()] : [])}
          head={() => <Letterhead developer={developer} brand={brand} refno={ref} date={today} />}
          foot={(pg, n, cont) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", paddingTop: 8, borderTop: "1px solid " + LINE, fontSize: 9, color: SOFT, fontFamily: MONO, letterSpacing: "0.04em", whiteSpace: "nowrap" }}><span>{cont ? L("continued", "تابع") : (project ? TXc(project, "name") : "")}</span><span style={{ flex: "none", letterSpacing: "0.08em" }}>Revnu.sa</span><span style={{ flex: "none" }}>{L("Page", "صفحة")} {pg} {L("of", "من")} {n}</span></div>} />
      </div>}</FitA4>
    </div>
  );
}

/* ---- Rebuild the agreement context from a saved order (HQ preview, developer portal) ---- */
function agreementCtxFromOrder(order, lang) {
  if (!order) return null;
  const developer = D.devById(order.developerId); const project = D.projById(order.projectId);
  const P = D.scopedToProject ? D.scopedToProject(order.projectId) : null;
  if (!developer || !project || !P) return null;
  const isBen = !!(order.customer && order.customer.beneficiary);
  const nums = (order.unitNumbers && order.unitNumbers.length) ? order.unitNumbers : (order.unitNumber ? [order.unitNumber] : []);
  const units = nums.map((n) => D.unitByNumber(n, isBen)).filter(Boolean);
  const unit = units[0] || null;
  const cfgFor = (n) => (order.perUnitMode && order.perUnit && order.perUnit[n]) ? order.perUnit[n] : { packageId: order.packageId, designId: order.designId, paletteId: order.paletteId, smartId: order.smartId, kitchenId: order.kitchenId, kitchenPaletteId: order.kitchenPaletteId, kitchenScope: order.kitchenScope, kitchenAddons: order.kitchenAddons, acId: order.acId, acAddons: order.acAddons, flooring: order.flooring, layoutIds: order.layoutIds, fitout: order.fitout, opsId: order.opsId };
  const find = (list, id) => (id && (list || []).find((x) => x.id === id)) || null;
  const rows = units.map((u) => {
    const cfg = cfgFor(u.number) || {}; const skip = cfg.skip || {};   // as the wizard priced it: skipped steps and items not offered for this unit type are out
    const pk = skip.furnishing ? null : find(P.packages, cfg.packageId), ds = skip.furnishing ? null : find(P.designs, cfg.designId), sm = skip.smartHome ? null : find(P.smart, cfg.smartId), op = skip.operations ? null : find(P.ops, cfg.opsId);
    const kt0 = skip.kitchens ? null : find(P.kitchens, cfg.kitchenId), acS0 = skip.cooling ? null : find(P.ac, cfg.acId);
    const ktPrice = kt0 ? D.kitchenTotalPrice(kt0, cfg.kitchenScope, u.typeId, cfg.kitchenAddons) : 0; const kt = ktPrice > 0 ? kt0 : null;
    const acP = acS0 ? D.acTotalPrice(acS0, project.id, u.typeId, cfg.acAddons) : 0; const acS = acP > 0 ? acS0 : null;
    const flL = (project.features && project.features.flooring && !skip.flooring && cfg.flooring) ? D.flooringLines(project.id, u.typeId, cfg.flooring) : []; const flP = flL.reduce((a, l) => a + l.amount, 0);
    const layC = (project.features && project.features.layout && !skip.layout && cfg.layoutIds) ? D.layoutChosen(project.id, u.typeId, cfg.layoutIds) : []; const layP = layC.reduce((a, o) => a + D.layoutPrice(o, project), 0);
    const fo = !!(project.features && project.features.fitout && pk && pk.fitout && cfg.fitout);
    const pre = (pk ? ((pk.pricing || {})[u.typeId] || 0) : 0) + (sm ? (sm.price || 0) : 0) + (fo ? D.boqTotal(pk.fitout.boq) : 0) + ktPrice + acP + flP + layP;
    return { unit: u, pkg: pk, design: ds, palette: ds ? D.designPaletteById(ds, cfg.paletteId) : null, smart: sm, kitchen: kt, kitchenPalette: kt ? D.kitchenPaletteById(kt, cfg.kitchenPaletteId) : null, kitchenScope: kt ? D.kitchenScopeById(cfg.kitchenScope) : null, kitchenAddons: kt ? D.kitchenAddonsChosen(kt, cfg.kitchenScope, cfg.kitchenAddons) : [], kitchenPrice: D.withVat(ktPrice), ac: acS, acAddons: acS ? D.acAddonsChosen(acS, cfg.acAddons) : [], acPrice: D.withVat(acP), acPoints: acS ? D.coolingPointsFor(project.id, u.typeId) : [], flooring: flL, flooringUp: flL.filter((l) => l.finish), flooringPrice: D.withVat(flP), layout: layC, layoutPrice: D.withVat(layP), fitout: fo, furnish: D.withVatSum(pre - ktPrice - acP - flP - layP - (fo ? D.boqTotal(pk.fitout.boq) : 0), fo ? D.boqTotal(pk.fitout.boq) : 0, ktPrice, acP, flP, layP), ops: op };
  });
  const opsRows = rows.map((r) => ({ unit: r.unit, ops: r.ops, ec: r.ops ? D.opsEconomics(r.ops, r.unit, r.unit.price) : null }));
  const our = D.dealEconomics(opsRows);
  const first = rows[0] || {};
  const furnishTotal = order.furnishCost != null ? Number(order.furnishCost) : rows.reduce((a, r) => a + r.furnish, 0);
  const fitoutTotal = Number(order.fitoutCost || 0); const fitoutOn = fitoutTotal > 0 || rows.some((r) => r.fitout);
  const unitsPrice = units.reduce((a, u) => a + (u.price || 0), 0);
  const sig = (order.id && order.id !== "DRAFT") ? (R.signatureFor(order.id) || null) : null;
  let issuedAt = order.createdAt || null; try { const a = (D.activityFor ? D.activityFor(order.id) : []).find((x) => x.event === "created"); if (a && a.at) issuedAt = a.at; } catch (e) {}
  return { sig, issuedAt, developer, project, order, unit, units, nUnits: units.length, design: first.design || null, pkg: first.pkg || null, smart: first.smart || null, kitchen: first.kitchen || null, ac: first.ac || null, ops: first.ops || null,
           perUnitRows: rows, our, furnishTotal, fitoutOn, fitoutTotal, furnishOnlyTotal: furnishTotal - fitoutTotal, totalPrice: unitsPrice + furnishTotal, lang: lang || "en" };
}

function ProjStat({ label, v }) {
  return (
    <div>
      <div style={{ opacity: 0.72, fontSize: 9.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600 }}>{v}</div>
    </div>
  );
}

/* Signature block with the real marks: developer signature + stamp (applied at issue), buyer's drawn or typed signature (from sign.html). Blank line until then. */
function AgSigBlock({ role, name, sub, ar, img, stamp, typed, when, note }) {
  const signed = !!(img || typed || when);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: SOFT, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, fontFamily: MONO }}>{role}</div>
      <div style={{ height: 88, marginTop: 8, borderBottom: "1px solid " + INK, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingBottom: 4 }}>
        {img ? <img src={img} alt="" style={{ maxHeight: 74, maxWidth: stamp ? "56%" : "85%", objectFit: "contain", objectPosition: ar ? "right bottom" : "left bottom" }} /> : (typed ? <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 26, lineHeight: 1, paddingBottom: 6, color: INK }}>{typed}</span> : <span />)}
        {stamp ? <img src={stamp} alt="" style={{ height: 84, maxWidth: "42%", objectFit: "contain" }} /> : null}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 6 }}>{name}</div>
      <div style={{ fontSize: 10, color: MUT }}>{sub}</div>
      {signed
        ? <div style={{ fontSize: 10, color: "#2E7D5B", marginTop: 10, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}><span style={{ fontWeight: 600 }}>✓ {note}</span><span style={{ fontFamily: MONO }}>{when}</span></div>
        : <div style={{ fontSize: 10, color: SOFT, marginTop: 10 }}>{ar ? "التاريخ" : "Date"}: ____________________</div>}
    </div>
  );
}
function AgSig({ role, name, sub, ar }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: SOFT, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, fontFamily: MONO }}>{role}</div>
      <div style={{ height: 34, borderBottom: "1px solid " + INK, marginTop: 20 }} />
      <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 6 }}>{name}</div>
      <div style={{ fontSize: 10, color: MUT }}>{sub}</div>
      <div style={{ fontSize: 10, color: SOFT, marginTop: 10 }}>{ar ? "التاريخ" : "Date"}: ____________________</div>
    </div>
  );
}

/* ---- KYC appendix (kept separate) ------------------------------------- */
function AppendixKyc({ c, developer }) {
  c = c || {};
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>1 · Acknowledgement</h3>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0, color: "#3A3A3E" }}>
        The Buyer acknowledges that their personal data has been collected by {developer.name} under the Saudi
        Personal Data Protection Law (PDPL). Data is used solely for KYC, contract execution and ongoing service.
      </p>
      <div style={{ marginTop: 18 }}>
        <AgRow k={L("Name","الاسم")} v={(__docAR && c.fullNameAr) ? c.fullNameAr : (c.fullName || "—")} />
        <AgRow k={L("National ID","رقم الهوية")} v={c.nationalId || "—"} />
        <AgRow k={L("Buyer category","فئة المشتري")} v={c.beneficiary ? L("Beneficiary — subsidised unit price","مستفيد — سعر الوحدة المدعوم") : L("Non-beneficiary — market unit price","غير مستفيد — سعر السوق")} />
        <AgRow k={L("Mobile","الجوال")} v={c.mobile || "—"} />
        <AgRow k={L("Email","البريد الإلكتروني")} v={c.email || "—"} />
        <AgRow k={L("City","المدينة")} v={c.city || "—"} />
      </div>
      <h3 style={{ fontSize: 13, fontWeight: 700, margin: "22px 0 6px" }}>2 · Rights</h3>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0, color: "#3A3A3E" }}>
        The Buyer may request access, correction or deletion of their data at any time, subject to {developer.name}'s
        retention obligations.
      </p>
    </div>
  );
}

window.FullAgreement = FullAgreement;
window.agreementCtxFromOrder = agreementCtxFromOrder;
window.AppendixKyc = AppendixKyc;

export { FullAgreement, AppendixKyc, agreementCtxFromOrder };
