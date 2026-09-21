"use client";
import React from "react";
import D from "@/lib/data/store";
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
      <div style={{ textAlign: "right", fontSize: 9.5, color: SOFT, fontFamily: MONO, letterSpacing: "0.04em" }}>
        <div style={{ color: INK, fontWeight: 600 }}>{refno}</div>
        <div>{date} · {L("Page","صفحة")} {page} {L("of","من")} {pages}</div>
      </div>
    </div>
  );
}

function Page({ children, style }) {
  return (
    <div className="ag-page" style={Object.assign({
      background: "#fff", maxWidth: 820, margin: "0 auto 22px", padding: "46px 60px 40px",
      borderRadius: 4, boxShadow: "0 16px 48px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)",
      color: INK, lineHeight: 1.55, position: "relative",
    }, style)}>{children}</div>
  );
}

/* ---- the document ----------------------------------------------------- */
function FullAgreement(ctx) {
  const { developer, project, order, unit, units, nUnits, design, pkg, smart, ops,
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
  const chosenPalette = design ? D.designPaletteById(design, order.paletteId) : null;
  const palette = (chosenPalette && chosenPalette.colors) || (design && design.palette) || [INK, SOFT, LINE, "#fff"];
  const hero = darkest(palette);
  const ref = "AGR-" + (order.id ? order.id.replace(/[^0-9]/g, "") : "26212");
  const today = new Date().toLocaleDateString(AR ? "ar-SA-u-ca-islamic" : "en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const pages = 6 + dealUnits.length + ((ops || opsAny) ? 1 : 0);   // cover · parties · one per unit · investment · schedule A · (schedule B) · terms · execution
  let __pg = 1;
  const np = () => (++__pg);
  const unitVat = (unit ? unit.price : 0) * 0.15;
  const fitoutBoqTotal = (pkg && pkg.fitout) ? D.boqTotal(pkg.fitout.boq) : 0;
  const furnBoq = D.boqFor(pkg, unit ? unit.typeId : null);

  return (
    <div className="ag-doc-wrap" key={AR ? "doc-ar" : "doc-en"} dir={AR ? "rtl" : "ltr"} lang={AR ? "ar" : "en"} data-i18n-skip={AR ? undefined : "1"} style={{ background: "linear-gradient(180deg, var(--bg-tint), var(--bg-sunken))", padding: "30px 22px", borderRadius: "var(--r-lg)", border: "1px solid var(--line)", fontFamily: AR ? AR_FONT : undefined, textAlign: AR ? "right" : undefined }}>

      {/* ============ PAGE 1 — COVER ============ */}
      <Page style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ background: hero, color: readable(hero), padding: "54px 60px 46px" }}>
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
          <h1 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", margin: "12px 0 0", lineHeight: 1.05 }}>{project ? TXc(project, "name") : "—"}</h1>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 10 }}>
            {multi ? dealUnits.length + (AR ? " وحدات · " : " units · ") + TXc(project, "name") : (AR ? "وحدة " : "Unit ") + (unit ? unit.number : "—") + " · " + (unit ? TD(unit.tower) : "")}{!multi && unit ? (AR ? "، " : ", ") + (unit.floorSpan ? (AR ? "الطوابق " : "Floors ") + unit.floorSpan : (AR ? "الطابق " : "Floor ") + unit.floor) : ""} · {project ? project.city : ""}
          </div>
          <div style={{ marginTop: 40, display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", height: 8 }}>
            {palette.map((hex, i) => <div key={i} style={{ flex: 1, background: hex }} />)}
          </div>
        </div>
        <div style={{ padding: "30px 60px 40px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase" }}>{L("Prepared for","أُعدّ لصالح")}</div>
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
            {AR ? `تُوثّق هذه الاتفاقية بيع الوحدة الموضّحة فيها من ${legal} ("البائع") إلى المشتري المذكور أعلاه، مع التأثيث الداخلي والتجهيز و(عند الانطباق) خدمات التشغيل التي اختارها المشتري، وإسقاط الاستثمار الذي اعتمد عليه المشتري. البائع هو الطرف الوحيد تجاه المشتري بموجب هذه الاتفاقية.` : `This Agreement records the sale of the Unit described herein by ${developer.name} (the “Seller”) to the Buyer named above, together with the interior furnishing, fit-out and (where applicable) operating services the Buyer has selected, and the investment projection on which the Buyer has relied. The Seller is the sole counterparty to the Buyer under this Agreement.`}
          </p>
        </div>
      </Page>

      {/* ============ PAGE 2 — PARTIES & PROPERTY ============ */}
      <Page>
        <Letterhead developer={developer} brand={brand} refno={ref} page={np()} pages={pages} date={today} />
        <AgSection n="1" title={L("The Parties","الأطراف")} brand={brand}>
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
              <AgRow k={L("Developer","المطوّر")} v={legal} />
              <AgRow k={L("CR number","السجل التجاري")} v={developer.crNumber} />
              {developer.vat ? <AgRow k={L("VAT","الرقم الضريبي")} v={developer.vat} /> : null}
              <AgRow k={L("Authorised signatory","المفوّض بالتوقيع")} v={((AR ? (developer.authorizedSignerAr || developer.authorizedSigner) : developer.authorizedSigner) || developer.primaryContact) + ((AR ? (developer.authorizedSignerTitleAr || developer.authorizedSignerTitle) : developer.authorizedSignerTitle) ? (AR ? "، " : " — ") + (AR ? (developer.authorizedSignerTitleAr || developer.authorizedSignerTitle) : developer.authorizedSignerTitle) : "")} />
              <AgRow k={L("Contact","جهة الاتصال")} v={developer.primaryEmail} />
            </div>
          </div>
        </AgSection>
        <AgSection n="2" title={L("The Property","العقار")} brand={brand} kicker={multi ? (dealUnits.length + L(" units", " وحدات")) : L("Unit particulars","بيانات الوحدة")}>
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
              <AgRow k={L("Bedrooms / baths","غرف النوم / الحمامات")} v={unit ? unit.type.bedrooms + (AR ? " غرف · " : " bed · ") + (unit.baths || unit.type.baths) + (AR ? " حمّام" : " bath") : "—"} />
            </>
          )}
          <p style={{ fontSize: 10.5, color: SOFT, margin: "10px 0 0", lineHeight: 1.55 }}>
            {AR ? (multi ? "لكل وحدة صفحتها الخاصة فيما يلي: المخطط، واللقطة ثلاثية الأبعاد، والموقع على المخطط العام، ومواصفات التشطيب والتأثيث المختارة لها." : "تلي هذه الصفحة صفحة الوحدة: المخطط، واللقطة ثلاثية الأبعاد، والموقع على المخطط العام، ومواصفات التشطيب والتأثيث المختارة.") : (multi ? "Each unit has its own page below: floor plan, 3D view, location on the masterplan, and the interior and furnishing specification selected for it." : "The unit page follows: floor plan, 3D view, location on the masterplan, and the interior and furnishing specification selected.")}
          </p>
        </AgSection>
      </Page>

      {/* ============ ONE PAGE PER UNIT — PLAN · 3D · MASTERPLAN · INTERIOR ============ */}
      {dealUnits.map((du, ui) => {
        const row = perUnitRows.find((r) => r.unit && r.unit.number === du.number) || null;
        const uDesign = row ? row.design : design;
        const uPkg    = row ? row.pkg : pkg;
        const uSmart  = row ? row.smart : smart;
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
            <Letterhead developer={developer} brand={brand} refno={ref} page={pn} pages={pages} date={today} />
            <AgSection n={multi ? "2." + (ui + 1) : "2.1"} title={L("Unit " + du.number, "الوحدة " + du.number)} brand={brand} kicker={TXc(du.type, "name") + " · " + uArea + " m²" + (multi ? " · " + L("Unit " + (ui + 1) + " of " + dealUnits.length, "الوحدة " + (ui + 1) + " من " + dealUnits.length) : "")}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 18, alignItems: "start" }}>
                <div>
                  <KV k={L("Building · floor","المبنى · الدور")} v={TD(du.tower) + " · " + (du.floorSpan ? L("Floors ", "الأدوار ") + du.floorSpan : L("Floor ", "الدور ") + du.floor)} />
                  <KV k={L("Unit type","نوع الوحدة")} v={TXc(du.type, "name") + (lv > 1 ? L(" · " + lv + "-storey duplex", " · دوبلكس من " + lv + " طوابق") : "")} />
                  <KV k={L("Built-up area","المساحة المبنية")} v={uArea + " m²"} />
                  <KV k={L("Bedrooms / baths","غرف النوم / الحمّامات")} v={du.type.bedrooms + L(" bed · ", " غرف · ") + (du.baths || du.type.baths) + L(" bath", " حمّام")} />
                  <KV k={L("Handover condition","حالة التسليم")} v={uPkg ? L("Furnished per Schedule A" + (uFit ? " · fit-out included" : ""), "مؤثّثة وفق الملحق أ" + (uFit ? " · مع التجهيز الداخلي" : "")) : L("As per the Unit Purchase Agreement","وفق عقد شراء الوحدة")} />
                  {uOps ? <KV k={L("Operating model","نموذج التشغيل")} v={TXc(uOps, "name") + " · " + L("operator fee ", "رسوم المشغّل ") + uOps.mgmtFee + "%"} /> : null}
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
                      <div style={{ fontSize: 9, color: SOFT, marginTop: 3, textAlign: "center" }}>{plans.length ? L("Indicative layout — refer to the final architectural drawings.","مخطط استرشادي — يُرجى الرجوع إلى الرسومات المعمارية النهائية.") : L("Schematic layout · indicative only, not to construction scale.","مخطط تخطيطي · استرشادي فقط، ليس بمقياس البناء.")}</div>
                    </div>
                  </div>
                </div>
              </div>
            </AgSection>

            <SubHead n={multi ? "3." + (ui + 1) : "3"} title={L("The Interior","التشطيب الداخلي")} kicker={uDesign ? TXc(uDesign, "name") + (uPal && uPal.name ? " · " + (AR ? (uPal.nameAr || uPal.name) : uPal.name) : "") : L("Not included","غير مُضمَّن")} />
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
                    {uPkg && uPkg.signature ? <KV k={L("Signature edition","إصدار موقّع")} v={L("Co-branded with ", "بالتعاون مع ") + ((AR ? (uPkg.brandNameAr || uPkg.brandName) : uPkg.brandName) || "—")} /> : null}
                    <KV k={L("Pieces · warranty","القطع · الضمان")} v={uPkg ? uPkg.pieces + L(" items · ", " قطعة · ") + uPkg.warranty + L(" years", " سنوات") : "—"} />
                    <KV k={L("Furnishing BOQ","جدول كميات التأثيث")} v={uPkg ? L("Schedule A · F-1 — ", "الملحق أ · F-1 — ") + D.boqFor(uPkg, du.typeId).length + L(" lines, by room", " بنداً، حسب الغرفة") : "—"} />
                    <KV k={L("Smart-home layer","طبقة المنزل الذكي")} v={uSmart ? TXc(uSmart, "name") + " · " + D.fmtSAR(uSmart.price) + L(" SAR", " ريال") : L("Not included","غير مُضمَّن")} />
                    <KV k={L("Fit-out","التجهيز الداخلي")} v={uFit ? L("Included — Schedule A · F-2","مُضمَّن — الملحق أ · F-2") : L("Not selected","غير مختار")} />
                  </div>
                </div>
              </>
            ) : (
              <KV k={L("Furnishing","التأثيث")} v={L("Not included in this agreement — the unit is delivered as per the Unit Purchase Agreement.","غير مُضمَّن في هذه الاتفاقية — تُسلَّم الوحدة وفق عقد شراء الوحدة.")} />
            )}
          </Page>
        );
      })}

      {/* ============ PAGE 4 — INVESTMENT SUMMARY ============ */}
      <Page>
        <Letterhead developer={developer} brand={brand} refno={ref} page={np()} pages={pages} date={today} />
        <AgSection n="4" title={L("Investment Summary","ملخص الاستثمار")} brand={brand} kicker={L("OUR PROJECTION","إسقاطنا المعتمد")}>
          <div style={{ display: "grid", gridTemplateColumns: (ops || opsAny) ? "1fr 1fr" : "1fr", gap: 28 }}>
            {/* Capital outlay */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase", marginBottom: 6 }}>{L("This addendum","قيمة هذا الملحق")}</div>
              <MoneyRow k={L("Furnishing & smart home","التأثيث والمنزل الذكي")} sub={L("incl. VAT","شامل الضريبة")} v={D.fmtSAR(fitoutOn ? furnishOnlyTotal : furnishTotal) + " SAR"} />
              {fitoutOn ? <MoneyRow k={L("Fit-out","التجهيز الداخلي")} sub={L("incl. VAT","شامل الضريبة")} v={D.fmtSAR(fitoutTotal) + " SAR"} /> : null}
              <MoneyRow k={L("Total addendum value","إجمالي قيمة الملحق")} total brand={brand} v={D.fmtSAR(furnishTotal) + " SAR"} />
              <p style={{ fontSize: 10.5, color: SOFT, marginTop: 12, lineHeight: 1.55 }}>
                {AR ? "سعر الوحدة وخطة دفعها محدّدان في عقد شراء الوحدة المستقل بين المشتري و" + legal + " ولا يشكّلان جزءًا من هذا الملحق. تُعرض أرقام التأثيث والتجهيز شاملةً ضريبة القيمة المضافة 15% وتُسوَّى وفق جدول دفعات ذلك العقد (انظر §5). أما العائد المتوقّع فهو دراسة استرشادية محسوبة على سعر الوحدة." : "The unit price and its payment plan are set out in the Buyer's separate Unit Purchase Agreement with " + legal + " and form no part of this addendum. Furnishing and fit-out figures are shown inclusive of 15% VAT and are settled on that agreement's payment schedule (see §5). The projected return is an indicative study computed on the unit price."}
              </p>
            </div>
            {/* Rental projection */}
            {(ops || opsAny) ? (
              <div style={{ padding: "16px 18px", borderRadius: 10, background: hero, color: readable(hero) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", opacity: 0.78, textTransform: "uppercase" }}>{L("Projected return","العائد المتوقّع")} · {opsMixed ? L("per unit — see below", "لكل وحدة — أدناه") : TXc(ops || (opsRows[0] && opsRows[0].ops), "name")}</div>
                  {o.risk ? <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid " + readable(hero), borderRadius: 20, padding: "2px 8px", opacity: 0.9 }}>{(() => { const m = { low: ["Low risk", "مخاطر منخفضة"], medium: ["Medium risk", "مخاطر متوسطة"], high: ["High risk", "مخاطر عالية"] }[o.risk]; return m ? (AR ? m[1] : m[0]) : o.risk; })()}</span> : null}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{roi.toFixed(1)}%</span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>{L("net ROI / year","عائد صافٍ / سنة")}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", marginTop: 18, fontSize: 11 }}>
                  {!opsMixed && <ProjStat label={isDaily ? L("Avg nightly rate","متوسط السعر الليلي") : L("Monthly rent","الإيجار الشهري")} v={D.fmtSAR(rate) + " SAR"} />}
                  {!opsMixed && <ProjStat label={L("Occupancy","نسبة الإشغال")} v={occ + "%"} />}
                  {opsMixed && <ProjStat label={L("Units in operation","الوحدات في التشغيل")} v={opsRows.length + " / " + (o.rows || []).length} />}
                  {opsMixed && <ProjStat label={L("Priced on","على أساس سعر")} v={D.fmtSAR(o.opsUnitsPrice || 0) + " SAR"} />}
                  <ProjStat label={L("Annual gross","الإجمالي السنوي")} v={D.fmtSAR(annualGross) + " SAR"} />
                  <ProjStat label={(AR ? "رسوم المشغّل · " : "Operator fee · ") + operatorFee + "%"} v={"−" + D.fmtSAR(annualGross - annualNet) + " SAR"} />
                  <ProjStat label={L("Net to owner / yr","الصافي للمالك / سنة")} v={D.fmtSAR(annualNet) + " SAR"} />
                  <ProjStat label={L("Gross yield","العائد الإجمالي")} v={grossYield.toFixed(1) + "%"} />
                  <ProjStat label={L("Horizon", "الأفق")} v={(order.years || 5) + L(" yrs", " سنة")} />
                </div>
                <p style={{ fontSize: 9.5, opacity: 0.72, marginTop: 16, lineHeight: 1.5 }}>
                  {AR ? `إسقاط تقديري فقط — تعتمد العوائد الفعلية على ظروف السوق ولا يضمنها البائع. يُدفع الصافي للمالك شهرياً من ${developer.name} وفق الملحق ب.` : `Projection only — actual returns depend on market conditions and are not guaranteed by the Seller. Net to owner is paid monthly by ${developer.name} per Schedule B.`}
                </p>
              </div>
            ) : null}
          </div>
        </AgSection>

        {/* PAGE 5 content folded in — Payment (addendum to the Unit Purchase Agreement) */}
        <AgSection n="5" title={L("Payment","الدفعات")} brand={brand} kicker={L("ONE CONSIDERATION","مقابل إجمالي واحد")}>
          <p style={{ fontSize: 11.5, color: MUT, margin: "0 0 14px", lineHeight: 1.6 }}>
            {AR
              ? ("تُعدّ هذه الاتفاقية ملحقًا لعقد شراء الوحدة المُبرم بين المشتري و" + legal + ". أعمال التأثيث والتشطيب الداخلي" + (fitoutOn ? " والتجهيز" : "") + (ops ? " والتشغيل" : "") + " المبيّنة أعلاه لا تُفوتَر للمشتري بشكل منفصل — بل تُضاف قيمتها إلى مقابل الوحدة وتُسوَّى وفق خطة الدفع ومراحل الإنشاء الواردة في عقد شراء الوحدة. ولا يسري أي جدول أقساط منفصل للتأثيث.")
              : <>This Agreement is an addendum to the Buyer's Unit Purchase Agreement with {legal}. The
            furnishing, interior{fitoutOn ? ", fit-out" : ""}{ops ? " and operating" : ""} works set out above are
            not separately invoiced to the Buyer — their value is added to the unit consideration and settled
            under the payment plan and construction milestones of that Unit Purchase Agreement. No separate
            furnishing instalment schedule applies.</>}
          </p>
          {mixedConfig && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, marginBottom: 14 }}>
              <thead><tr style={{ color: SOFT, fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                <th style={{ textAlign: "start", padding: "4px 0" }}>{L("Unit", "الوحدة")}</th><th style={{ textAlign: "start" }}>{L("Package", "الباقة")}</th><th style={{ textAlign: "start" }}>{L("Design · palette", "التصميم · اللوحة")}</th><th style={{ textAlign: "start" }}>{L("Smart home", "المنزل الذكي")}</th><th style={{ textAlign: "start" }}>{L("Fit-out", "التشطيب")}</th><th style={{ textAlign: "start" }}>{L("Operating", "التشغيل")}</th><th style={{ textAlign: "end" }}>{L("Extras incl. VAT", "الإضافات شاملة الضريبة")}</th>
              </tr></thead>
              <tbody>
                {perUnitRows.map((r) => (
                  <tr key={r.unit.number} style={{ borderTop: "1px dotted " + LINE }}>
                    <td style={{ padding: "5px 0", fontFamily: MONO, fontWeight: 600 }}>{r.unit.number}<span style={{ color: SOFT, fontWeight: 400, marginInlineStart: 6 }}>{TXc(r.unit.type, "name")}</span></td>
                    <td>{r.pkg ? TXc(r.pkg, "name") : "—"}</td>
                    <td>{r.design ? TXc(r.design, "name") + (r.palette ? " · " + (AR ? (r.palette.nameAr || r.palette.name) : r.palette.name) : "") : "—"}</td>
                    <td>{r.smart ? TXc(r.smart, "name") : "—"}</td>
                    <td>{r.fitout ? L("Included", "مُضمَّن") : "—"}</td>
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
                <td style={{ padding: "8px 0", color: MUT }}>{L("Furnishing, smart home" + (fitoutOn ? " & fit-out" : ""), "التأثيث والمنزل الذكي" + (fitoutOn ? " والتجهيز" : ""))} <span style={{ color: SOFT, fontSize: 10 }}>{L("net", "صافي")}</span></td>
                <td style={{ textAlign: AR ? "left" : "right", fontFamily: MONO }}>{D.fmtSAR(furnishNet)} SAR</td>
              </tr>
              <tr style={{ borderBottom: "1px dotted " + LINE }}>
                <td style={{ padding: "8px 0", color: MUT }}>{L("VAT", "ضريبة القيمة المضافة")} <span style={{ color: SOFT, fontSize: 10 }}>15%</span></td>
                <td style={{ textAlign: AR ? "left" : "right", fontFamily: MONO }}>{D.fmtSAR(furnishVat)} SAR</td>
              </tr>
              <tr style={{ borderTop: "1.5px solid " + INK }}>
                <td style={{ padding: "9px 0", fontWeight: 700 }}>{L("Total addendum value", "إجمالي قيمة الملحق")} <span style={{ color: SOFT, fontSize: 10, fontWeight: 400 }}>{L("incl. VAT · added to the unit consideration", "شامل الضريبة · يُضاف إلى مقابل الوحدة")}</span></td>
                <td style={{ textAlign: AR ? "left" : "right", fontFamily: MONO, fontWeight: 700, color: brand }}>{D.fmtSAR(furnishTotal)} SAR</td>
              </tr>
            </tbody>
          </table>
            );
          })()}
          <p style={{ fontSize: 10, color: SOFT, marginTop: 10, lineHeight: 1.5 }}>
            {AR
              ? ("جميع أسعار الباقات والمنتجات التي اختارها المشتري معروضة شاملةً ضريبة القيمة المضافة 15%، وقد فُصلت أعلاه إلى القيمة الصافية والضريبة. التأثيث والمنزل الذكي والتجهيز خدمات تخضع لضريبة القيمة المضافة 15%. تُدفع قيمة هذا الملحق إلى " + legal + " ضمن دفعات عقد شراء الوحدة وبنفس مواعيدها ونسبها، ولا يترتّب على المشتري أي جدول دفع منفصل.")
              : ("All package and product prices selected by the Buyer are quoted inclusive of 15% VAT and are split above into net value and VAT. Furnishing, smart-home and fit-out are services subject to 15% VAT. The value of this addendum is paid to " + legal + " within the instalments of the Unit Purchase Agreement, on the same dates and proportions — no separate payment schedule applies to the Buyer.")}
          </p>
        </AgSection>
      </Page>

      {/* ============ SCHEDULE A — FURNISHING & INTERIOR ============ */}
      <Page>
        <Letterhead developer={developer} brand={brand} refno={ref} page={np()} pages={pages} date={today} />
        <AgSection n="A" title={L("Schedule A — Furnishing & Interior","الملحق أ — التأثيث والتشطيب")} brand={brand} kicker={mixedConfig ? L("Per-unit packages","باقات لكل وحدة") : (pkg ? ((AR && pkg.tierAr) ? pkg.tierAr : pkg.tier) + " · " + TXc(pkg, "name") : "")}>
          <Term n="A.1" h={L("Scope","النطاق")}>{mixedConfig ? (AR ? "يقوم البائع بتوريد وتركيب باقة التأثيث المحدّدة لكل وحدة في §3 من هذه الاتفاقية، منفّذة بالتصميم ولوحة الألوان المختارة لتلك الوحدة، مع طبقة المنزل الذكي والتجهيز الداخلي حيثما اختيرا. وتُعدّ جداول الكميات أدناه جزءاً من هذا الملحق." : "The Seller shall supply and install the furnishing package specified for each unit in §3 of this Agreement, executed in the design and colour palette selected for that unit, together with the smart-home layer and interior fit-out where selected. The bills of quantities below form part of this Schedule.") : AR ? ("يقوم البائع بتوريد وتركيب باقة التأثيث «" + (pkg ? ((AR && pkg.tierAr) ? pkg.tierAr : pkg.tier) : "") + " — " + (pkg ? TXc(pkg, "name") : "") + "» (" + (pkg ? pkg.pieces : 0) + " قطعة) منفّذة بتصميم «" + (design ? design.name : "") + "»" + (smart ? "، مع طبقة المنزل الذكي «" + smart.name + "»" : "") + (fitoutOn ? "، إضافةً إلى التجهيز الداخلي المفصّل أدناه" : "") + ". وتُعدّ جداول الكميات أدناه جزءاً من هذا الملحق.") : ("The Seller shall supply and install the furnishing package “" + (pkg ? ((AR && pkg.tierAr) ? pkg.tierAr : pkg.tier) : "") + " — " + (pkg ? TXc(pkg, "name") : "") + "” (" + (pkg ? pkg.pieces : 0) + " items) executed in the “" + (design ? design.name : "") + "” design" + (smart ? ", with the “" + smart.name + "” smart-home layer" : "") + (fitoutOn ? ", together with the interior fit-out itemised below" : "") + ". The bills of quantities below form part of this Schedule.")}</Term>

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
                {groups.length === 0 ? <p style={{ fontSize: 10.5, color: SOFT, margin: "16px 0" }}>{L("Furnishing schedule attached separately.","جدول التأثيث مرفق منفصلاً.")}</p> : null}
                {groups.map((g, n) => (
                  <React.Fragment key={"f1-" + n}>
                    <h4 style={{ fontSize: 11.5, fontWeight: 700, margin: "22px 0 6px" }}>{L("Appendix F-1" + (groups.length > 1 ? "." + (n + 1) : "") + " · Furnishing bill of quantities", "الملحق F-1" + (groups.length > 1 ? "." + (n + 1) : "") + " · جدول كميات التأثيث")} <span style={{ fontWeight: 400, color: SOFT, fontFamily: MONO, fontSize: 9.5, marginInlineStart: 6 }}>{g.units.join(" · ")} · {TXc(g.pkg, "name")} · {g.boq.length} {L("LINES","بنداً")}</span></h4>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
                      <thead><tr style={{ color: SOFT, borderBottom: "1px solid " + INK }}>{TH(L("ROOM","الغرفة"))}{TH(L("ITEM","البند"))}{TH(L("QTY","الكمية"), { textAlign: "center" })}{TH(L("SUPPLIER","المورّد"))}{TH(L("NOTES","ملاحظات"))}</tr></thead>
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
                        {g.boq.length === 0 ? <tr><td colSpan={5} style={{ padding: "12px 0", color: SOFT }}>{L("Furnishing schedule attached separately.","جدول التأثيث مرفق منفصلاً.")}</td></tr> : null}
                      </tbody>
                    </table>
                  </React.Fragment>
                ))}
                {fgroups.map((g, n) => (
                  <React.Fragment key={"f2-" + n}>
                    <h4 style={{ fontSize: 11.5, fontWeight: 700, margin: "24px 0 6px" }}>{L("Appendix F-2" + (fgroups.length > 1 ? "." + (n + 1) : "") + " · Fit-out bill of quantities", "الملحق F-2" + (fgroups.length > 1 ? "." + (n + 1) : "") + " · جدول كميات التجهيز")} <span style={{ fontWeight: 400, color: SOFT, fontFamily: MONO, fontSize: 9.5, marginInlineStart: 6 }}>{g.units.join(" · ")} · {L("PRICED","مُسعّر")}</span></h4>
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

          <Term n="A.2" h={L("Procurement & installation","التوريد والتركيب")}>{AR ? ("يتم التوريد قبل التسليم بـ 9 إلى 7 أشهر، والتركيب قبله بـ 4 إلى شهر واحد" + (fitoutOn ? "؛ ويكتمل التجهيز قبل تركيب الأثاث" : "") + ". تُجرى جولة تفقّدية مشتركة قبل التسليم بشهر بحضور المشتري.") : ("Procurement occurs T-9 to T-7 months and installation T-4 to T-1 months before handover" + (fitoutOn ? "; the fit-out completes before furniture installation" : "") + ". A joint walkthrough is held T-1 month with the Buyer present.")}</Term>
          <Term n="A.3" h={L("Title & risk in the goods","الملكية والمخاطر في البضائع")}>{AR ? "تنتقل ملكية بنود التأثيث إلى المشتري عند سداد كامل قيمة الباقة؛ وتنتقل المخاطر عند التركيب وتسليم الوحدة. البنود جديدة وغير مستعملة ومورّدة وفق المواصفات في جداول الكميات." : "Title to the furnishing items passes to the Buyer on full payment of the package value; risk passes on installation and handover of the Unit. Items are new, unused and supplied to the specification in the bills of quantities."}</Term>
          <Term n="A.4" h={L("Warranty & defects","الضمان والعيوب")}>{AR ? ("يضمن البائع الأثاث والتشطيبات لمدة " + (pkg ? pkg.warranty : 5) + " سنوات" + (fitoutOn && pkg && pkg.fitout && pkg.fitout.warranty ? "، وتشطيبات التجهيز لمدة " + pkg.fitout.warranty + " سنوات" : "") + " من التسليم، باستثناء الاستهلاك المعتاد. تُصلَح العيوب المبلّغ عنها خلال فترة الملاحظات (30 يوماً) دون تكلفة على المشتري.") : ("The Seller warrants the furniture and finishes for " + (pkg ? pkg.warranty : 5) + " years" + (fitoutOn && pkg && pkg.fitout && pkg.fitout.warranty ? ", and the fit-out finishes for " + pkg.fitout.warranty + " years" : "") + " from handover, fair wear and tear excepted. Defects reported within the 30-day snagging window are remedied at no cost to the Buyer.")}</Term>
          <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 8, background: "#FAF8F3", border: "1px solid " + LINE }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase", marginBottom: 4 }}>{L("A.5 · Commercial value","A.5 · القيمة التجارية")}</div>
            <MoneyRow k={L("Furnishing","التأثيث")} sub={L("incl. VAT","شامل الضريبة")} v={D.fmtSAR(fitoutOn ? furnishOnlyTotal : furnishTotal) + " SAR"} />
            {fitoutOn ? <MoneyRow k={L("Fit-out","التجهيز الداخلي")} sub={L("incl. VAT","شامل الضريبة")} v={D.fmtSAR(fitoutTotal) + " SAR"} /> : null}
            <MoneyRow k={L("Package value","قيمة الباقة")} total brand={brand} v={D.fmtSAR(furnishTotal) + " SAR"} />
          </div>
        </AgSection>
      </Page>

      {/* ============ SCHEDULE B — OPERATIONS ============ */}
      {(ops || opsAny) ? (
        <Page>
          <Letterhead developer={developer} brand={brand} refno={ref} page={np()} pages={pages} date={today} />
          <AgSection n="B" title={L("Schedule B — Operating & Rental Management","الملحق ب — التشغيل وإدارة الإيجار")} brand={brand} kicker={opsMixed ? L("Per-unit models", "نماذج لكل وحدة") : TXc(ops || opsRows[0].ops, "name")}>
            {opsMixed ? (
              <Term n="B.1" h={L("Appointment & models","التعيين ونماذج التشغيل")}>{AR ? ("يعيّن المشتري («المالك») " + legal + " («المشغّل») لإدارة تأجير الوحدات التالية، كلٌّ وفق نموذجها: " + opsRows.map((r) => r.unit.number + " — «" + TXc(r.ops, "name") + "» (" + (r.ops.kind === "daily" ? "يومي" : "شهري") + "، رسوم " + r.ops.mgmtFee + "%)").join("؛ ") + ". يتولّى المشغّل التسويق والحجز واستقبال النزلاء والتنظيف والصيانة نيابةً عن المالك.") : ("The Buyer (the “Owner”) appoints " + developer.name + " (the “Operator”) to manage the letting of the following Units, each under its own model: " + opsRows.map((r) => r.unit.number + " — “" + TXc(r.ops, "name") + "” (" + (r.ops.kind === "daily" ? "nightly" : "monthly") + ", " + r.ops.mgmtFee + "% fee)").join("; ") + ". The Operator markets, books, checks in guests, cleans and maintains the Units on the Owner's behalf.")}</Term>
            ) : (
              <Term n="B.1" h={L("Appointment & model","التعيين ونموذج التشغيل")}>{(() => { const m = ops || opsRows[0].ops; const dly = m.kind === "daily"; return AR ? ("يعيّن المشتري («المالك») " + legal + " («المشغّل») لإدارة تأجير الوحدة وفق نموذج «" + TXc(m, "name") + "» (" + (dly ? "يومي / إقامة قصيرة" : "شهري / إقامة طويلة") + "). يتولّى المشغّل التسويق والحجز واستقبال النزلاء والتنظيف والصيانة نيابةً عن المالك.") : ("The Buyer (the “Owner”) appoints " + developer.name + " (the “Operator”) to manage the letting of the Unit under the “" + m.name + "” model (" + (dly ? "nightly / short-stay" : "monthly / long-stay") + "). The Operator markets, books, checks in guests, cleans and maintains the Unit on the Owner's behalf."); })()}</Term>
            )}
            <Term n="B.2" h={L("Operator fee & payout","رسوم المشغّل والتوزيع")}>{opsMixed ? (AR ? ("يتقاضى المشغّل رسوم كل نموذج كما هو مبيّن في B.1 (متوسط موزون " + operatorFee + "% من إجمالي الإيجار). يُدفع صافي الإيجار للمالك شهرياً، قبل اليوم الخامس من الشهر التالي، إلى حساب المالك المحدّد.") : ("The Operator charges each model's fee as set out in B.1 (weighted average " + operatorFee + "% of gross rental). Net rental is paid to the Owner monthly, by the 5th of the following month, to the Owner's nominated account.")) : (AR ? ("يتقاضى المشغّل " + operatorFee + "% من إجمالي الإيجار. يُدفع صافي الإيجار للمالك شهرياً، قبل اليوم الخامس من الشهر التالي، إلى حساب المالك المحدّد.") : ("The Operator charges " + operatorFee + "% of gross rental. Net rental is paid to the Owner monthly, by the 5th of the following month, to the Owner's nominated account."))}</Term>
            <Term n="B.3" h={L("Reporting","التقارير")}>{AR ? "يُسلَّم للمالك بيان دخل شهري يوضّح إجمالي الإيجار ورسوم المشغّل وتكاليف المنصّات والمرافق والصافي للمالك." : "A monthly income statement is delivered to the Owner showing gross rental, operator fee, platform and utility costs, and net to the Owner."}</Term>
            <Term n="B.4" h={L("Term, renewal & termination","المدة والتجديد والإنهاء")}>{AR ? "مدة أدناها سنتان (2) من التفعيل، ثم تجديد تلقائي لمدة 12 شهراً ما لم يُخطر أحد الطرفين قبل ستين (60) يوماً. يترتّب على الإنهاء المبكر من المالك رسم يعادل متوسط صافي إيراد ثلاثة (3) أشهر." : "Minimum term of two (2) years from activation, then 12-month auto-renewal unless either party gives sixty (60) days' notice. Early termination by the Owner attracts a charge equal to three (3) months' average net revenue."}</Term>
            <Term n="B.5" h={L("Owner obligations","التزامات المالك")}>{AR ? "يلتزم المالك بالتأمين على الوحدة، والحفاظ على التأثيث في حالة صالحة للتأجير (باستثناء الاستهلاك المعتاد)، وعدم تأجير الوحدة بمعزل عن المشغّل خلال المدة." : "The Owner shall keep the Unit insured, maintain the furnishing in lettable condition (fair wear and tear excepted), and not let the Unit independently of the Operator during the term."}</Term>
            <Term n="B.6" h={L("Delivery & counterparty","التنفيذ والطرف المقابل")}>{AR ? "يجوز للمشغّل تنفيذ هذه الخدمات عبر اتفاقية ظهر‑لظهر مع Revnu لإدارة الأملاك، مع بقائه الطرف الوحيد تجاه المالك في الأداء والتقارير والتوزيعات." : "The Operator may discharge these services through a back-to-back agreement with Revnu Property Management while remaining the Owner's sole counterparty for performance, reporting and payouts."}</Term>
            <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 8, background: "#FAF8F3", border: "1px solid " + LINE }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: SOFT, textTransform: "uppercase", marginBottom: 8 }}>{L("B.7 · Projected economics (indicative)","B.7 · الاقتصاديات المتوقّعة (إرشادية)")}</div>
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
              <AgRow k={(AR ? "رسوم المشغّل · " : "Operator fee · ") + operatorFee + "%"} v={"−" + D.fmtSAR(annualGross - annualNet) + " SAR"} />
              <AgRow k={L("Annual net to Owner","صافي الدخل السنوي للمالك")} v={D.fmtSAR(annualNet) + " SAR"} strong />
              <AgRow k={L("Gross yield","العائد الإجمالي")} v={grossYield.toFixed(1) + "%"} />
              <AgRow k={L("Net ROI / year","العائد الصافي السنوي")} v={roi.toFixed(1) + "%"} />
              <p style={{ fontSize: 10, color: SOFT, margin: "10px 0 0", lineHeight: 1.5 }}>{L("Projection only — actual returns depend on market conditions and are not guaranteed by the Operator.","إسقاط تقديري فقط — تعتمد العوائد الفعلية على ظروف السوق ولا يضمنها المشغّل.")}</p>
            </div>
          </AgSection>
        </Page>
      ) : null}

      {/* ============ GENERAL TERMS ============ */}
      <Page>
        <Letterhead developer={developer} brand={brand} refno={ref} page={np()} pages={pages} date={today} />
        <AgSection n="6" title={L("General Terms & Conditions","الأحكام والشروط العامة")} brand={brand}>
          <Term n="6.1" h={L("Definitions","التعريفات")}>{AR ? ("يُقصد بـ«البائع» " + legal + "؛ و«المشتري» الطرف المذكور في §1؛ و«الوحدة» العقار الموصوف في §2؛ و«الأعمال» نطاق التأثيث والتجهيز والمنزل الذكي في §3. وتشمل صيغة المفرد الجمع والعكس.") : ("“Seller” means " + legal + "; “Buyer” means the party named in §1; “Unit” means the property described in §2; “Works” means the furnishing, fit-out and smart-home scope in §3. Words importing the singular include the plural and vice versa.")}</Term>
          <Term n="6.2" h={L("Relationship to the Unit Purchase Agreement","العلاقة بعقد شراء الوحدة")}>{AR ? ("هذه الاتفاقية ملحق لعقد شراء الوحدة المُبرم بين المشتري و" + legal + "، ولا تُنشئ بيعًا مستقلًا للوحدة ولا تُعدّل سعرها أو خطة دفعها أو أحكام نقل ملكيتها. وعند التعارض، تسري أحكام عقد شراء الوحدة فيما يخص الوحدة، وأحكام هذا الملحق فيما يخص الأعمال.") : ("This Agreement is an addendum to the Unit Purchase Agreement between the Buyer and " + legal + ". It creates no separate sale of the Unit and does not vary its price, payment plan or title-transfer terms. In case of conflict, the Unit Purchase Agreement governs the Unit and this addendum governs the Works.")}</Term>
          <Term n="6.3" h={L("Price & VAT","السعر وضريبة القيمة المضافة")}>{AR ? "أعمال التأثيث والمنزل الذكي والتجهيز خدمات تخضع لضريبة القيمة المضافة بالنسبة السائدة (حاليًا 15%) المبيّنة صراحةً في §5. ولا يتناول هذا الملحق سعر الوحدة ولا الضرائب والرسوم المرتبطة بتسجيلها، فهي محكومة بعقد شراء الوحدة." : "The furnishing, smart-home and fit-out works are services subject to value-added tax at the prevailing rate (currently 15%), shown explicitly in §5. The unit price and any taxes or fees on its registration are outside this addendum and governed by the Unit Purchase Agreement."}</Term>
          <Term n="6.4" h={L("Payment","الدفع")}>{AR ? "تُضاف قيمة هذا الملحق (§5) إلى مقابل الوحدة وتُدفع من المشتري إلى البائع ضمن دفعات عقد شراء الوحدة وبنفس مواعيدها ونسبها. لا يسري أي جدول دفع منفصل للتأثيث، ويخضع التأخير في السداد والتخلّف عنه لأحكام عقد شراء الوحدة." : "The value of this addendum (§5) is added to the unit consideration and paid by the Buyer to the Seller within the instalments of the Unit Purchase Agreement, on the same dates and in the same proportions. No separate furnishing payment schedule applies; late payment and default are governed by the Unit Purchase Agreement."}</Term>
          <Term n="6.5" h={L("Furnishing, fit-out & operations","التأثيث والتجهيز والتشغيل")}>{AR ? ("تُورَّد أعمال التأثيث والتجهيز وتُجدوَل وتُضمَن بموجب الملحق أ (مع جداول الكميات في الملاحق F-1" + (fitoutOn ? " و F-2" : "") + ")" + (ops ? "؛ وتُقدَّم إدارة الإيجار بموجب الملحق ب" : "") + ". وتُعدّ هذه الملاحق جزءاً من هذه الاتفاقية ومُدرجة بالإحالة.") : ("The furnishing and fit-out works are supplied, sequenced and warranted under Schedule A (with the bills of quantities at Appendices F-1" + (fitoutOn ? " and F-2" : "") + ")" + (ops ? "; rental management is provided under Schedule B" : "") + ". Those Schedules form part of this Agreement and are incorporated by reference.")}</Term>
          <Term n="6.6" h={L("Handover & snagging","التسليم والملاحظات")}>{AR ? "عند التسليم يُمنح المشتري فترة ملاحظات مدتها ثلاثون (30) يوماً للإبلاغ عن عيوب الوحدة أو الأعمال. ويلتزم البائع بإصلاح العيوب المؤكّدة خلال خمسة وأربعين (45) يوماً دون تكلفة على المشتري." : "At handover the Buyer is given a snagging period of thirty (30) days to report defects in the Unit or the Works. The Seller shall remedy verified defects within forty-five (45) days at no cost to the Buyer."}</Term>
          <Term n="6.7" h={L("Warranties","الضمانات")}>{AR ? ("يضمن البائع الأعمال (الأثاث والتشطيبات) ضد عيوب التصنيع لمدة " + (pkg ? pkg.warranty : 2) + " سنوات" + (fitoutOn && pkg && pkg.fitout && pkg.fitout.warranty ? "، وتشطيبات التجهيز لمدة " + pkg.fitout.warranty + " سنوات" : "") + " من الإنجاز. وتخضع الأجهزة والإلكترونيات لضمان الشركة الصانعة. ويُستثنى البلى الطبيعي وسوء الاستخدام وأضرار المستأجرين والتعديل غير المرخّص. أما ضمان الوحدة الإنشائي فيحكمه عقد شراء الوحدة.") : ("The Seller warrants the Works (furniture and finishes) against manufacturing defects for " + (pkg ? pkg.warranty : 2) + " years" + (fitoutOn && pkg && pkg.fitout && pkg.fitout.warranty ? ", and the fit-out finishes for " + pkg.fitout.warranty + " years" : "") + " from completion. Appliances and electronics carry the manufacturer's warranty. Fair wear and tear, misuse, tenant damage and unauthorised modification are excluded. The structural warranty of the Unit is governed by the Unit Purchase Agreement.")}</Term>
          <Term n="6.8" h={L("Default & termination","التخلّف والإنهاء")}>{AR ? "يجوز لأي طرف الإنهاء بإشعار كتابي مدته ثلاثون (30) يوماً عند إخلال جوهري لم يُعالَج. وعند إلغاء المشتري بعد بدء التوريد يجوز للبائع الاحتفاظ بالتكاليف المتكبَّدة فعلاً بحد أقصى 10% من قيمة هذا الملحق؛ وعند تخلّف البائع تُردّ المبالغ المدفوعة عن الأعمال غير المُنجَزة." : "Either party may terminate on thirty (30) days' written notice for material breach left uncured. If the Buyer cancels after procurement has started, the Seller may retain costs actually incurred up to 10% of the value of this addendum; on Seller default, sums paid for Works not delivered are refunded."}</Term>
          <Term n="6.9" h={L("Force majeure","القوة القاهرة")}>{AR ? "لا يُسأل أي طرف عن تأخير أو إخفاق ناتج عن أحداث خارجة عن السيطرة المعقولة. وتُمدَّد مواعيد التسليم بمقدار مدة الحدث." : "Neither party is liable for delay or failure caused by events beyond reasonable control. Delivery dates extend by the period of the event."}</Term>
          <Term n="6.10" h={L("Data protection","حماية البيانات")}>{AR ? "تُستخدم بيانات المشتري الشخصية لإبرام هذه الاتفاقية وتنفيذها وتقديم الخدمة المستمرّة فقط، ولا تُشارك مع أطراف أخرى إلا بالقدر اللازم لتنفيذ الأعمال." : "The Buyer's personal data is used solely to conclude and perform this Agreement and to provide ongoing service, and is shared only as necessary to deliver the Works."}</Term>
          <Term n="6.11" h={L("Governing law & disputes","القانون الحاكم والنزاعات")}>{AR ? ("تخضع هذه الاتفاقية لأنظمة المملكة العربية السعودية. وتُحال النزاعات إلى المحاكم المختصّة في " + (project ? project.city : "مدينة البائع") + "، على أن يسعى الطرفان أولاً للتسوية الودّية خلال ثلاثين (30) يوماً.") : ("This Agreement is governed by the laws of the Kingdom of Saudi Arabia. Disputes are referred to the competent courts of " + (project ? project.city : "the Seller's city") + ", save that the parties shall first attempt amicable settlement within thirty (30) days.")}</Term>
          <Term n="6.12" h={L("Entire agreement","الاتفاق الكامل")}>{AR ? "تُشكّل هذه الاتفاقية، مع ملاحقها وجداولها، كامل الاتفاق بين الطرفين وتَجُبّ المناقشات السابقة. ويجب أن تكون أي تعديلات كتابية وموقّعة من الطرفين." : "This Agreement, with its Schedules and Appendices, constitutes the entire agreement between the parties and supersedes prior discussions. Amendments must be in writing and signed by both parties."}</Term>
        </AgSection>
      </Page>

      {/* ============ EXECUTION ============ */}
      <Page>
        <Letterhead developer={developer} brand={brand} refno={ref} page={np()} pages={pages} date={today} />
        <AgSection n="7" title={L("Execution","التوقيع والإبرام")} brand={brand} kicker={L("SIGNED BY THE PARTIES","موقّع من الطرفين")}>
          <p style={{ fontSize: 11.5, color: MUT, lineHeight: 1.6, margin: "0 0 20px" }}>
            {AR
              ? ("بالتوقيع أدناه، يوافق المشتري و" + legal + " على الالتزام بهذه الاتفاقية مع ملاحقها وجداولها — المخطط الأرضي (الملحق أ)، وجداول كميات التأثيث والتجهيز (الملحق أ، الملاحق F-1" + (fitoutOn ? " و F-2" : "") + ")" + (ops ? "، وشروط التشغيل (الملحق ب)" : "") + "، وإقرار اعرف عميلك وحماية البيانات.")
              : ("By signing below, the Buyer and " + legal + " agree to be bound by this Agreement together with its Schedules and Appendices — the floor plan (Appendix A), the furnishing and fit-out bills of quantities (Schedule A, Appendices F-1" + (fitoutOn ? " & F-2" : "") + ")" + (ops ? ", the operating terms (Schedule B)" : "") + " and the KYC & PDPL acknowledgement.")}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 6 }}>
            <AgSig role={L("The Buyer","المشتري")} name={c.fullName || "—"} sub={L("Beneficiary","المستفيد")} ar={AR} />
            <AgSig role={L("The Seller","البائع")} name={legal} sub={(() => {
              const nm = (AR ? (developer.authorizedSignerAr || developer.authorizedSigner) : developer.authorizedSigner) || developer.primaryContact;
              const title = AR ? (developer.authorizedSignerTitleAr || developer.authorizedSignerTitle) : developer.authorizedSignerTitle;
              return nm + (title ? (AR ? "، " : ", ") + title : (AR ? "، المفوّض بالتوقيع" : ", authorised signatory"));
            })()} ar={AR} />
          </div>
          <div style={{ marginTop: 34, fontSize: 9.5, color: SOFT, display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px dotted " + LINE }}>
            <span style={{ fontFamily: MONO }}>{ref} · {project ? project.name : ""}</span>
            <span style={{ fontFamily: MONO, letterSpacing: "0.08em" }}>{L("PREPARED ON REVNU","أُعدّ عبر Revnu")}</span>
          </div>
        </AgSection>
      </Page>

    </div>
  );
}

function ProjStat({ label, v }) {
  return (
    <div>
      <div style={{ opacity: 0.72, fontSize: 9.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600 }}>{v}</div>
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
window.AppendixKyc = AppendixKyc;

export { FullAgreement, AppendixKyc };
