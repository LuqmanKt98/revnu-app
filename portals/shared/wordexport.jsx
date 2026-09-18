"use client";
import React from "react";
import * as ReactDOMClient from "react-dom/client";
import D from "@/lib/data/store";
import "./floorplan";
if (typeof window !== "undefined") { window.React = React; window.ReactDOM = ReactDOMClient; }
// =================================================================
//  Word (.doc) export of the Purchase & Investment Agreement.
//  Produces a Word-compatible HTML document (opens natively in MS Word
//  / Pages / Google Docs, fully editable, colours + tables + images
//  intact) and triggers a download. Far more reliable than browser
//  print-to-PDF, which depends on the user's print-dialog settings.
//
//  window.downloadAgreementWord(ctx)  →  builds + downloads "<ref>.doc"
//
//  Images are embedded as base64 data URLs so the file is self-contained:
//   • developer logo      — same-origin PNG, drawn to canvas
//   • floor plan(s)       — inline SVG serialised + rasterised
//   • design photos       — CORS-loaded from the image CDN, rasterised
//                           (falls back to a palette block if blocked)
// =================================================================


/* ---------- colour helpers (mirror contract.jsx) ---------- */
function lum(hex) {
  const c = (hex || "#000").replace("#", "");
  if (c.length < 6) return 0;
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function darkest(p) { if (!p || !p.length) return "#1D1D1F"; let b = p[0], bl = 999; p.forEach(h => { const l = lum(h); if (l < bl) { bl = l; b = h; } }); return b; }
function readable(hex) { return lum(hex) > 150 ? "#1D1D1F" : "#FFFFFF"; }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/* ---------- image rasterisation ---------- */
function imgToDataURL(src, { cors, maxW, jpeg, cropAspect } = {}) {
  return new Promise((resolve) => {
    const im = new Image();
    if (cors) im.crossOrigin = "anonymous";
    im.onload = () => {
      try {
        let sx = 0, sy = 0, sw = im.naturalWidth || 800, sh = im.naturalHeight || 600;
        // crop source to a target aspect ratio (cover), so the embedded image
        // is already the right shape — Word has no object-fit.
        if (cropAspect) {
          const cur = sw / sh;
          if (cur > cropAspect) { const nw = sh * cropAspect; sx = (sw - nw) / 2; sw = nw; }
          else { const nh = sw / cropAspect; sy = (sh - nh) / 2; sh = nh; }
        }
        let cw = sw, ch = sh;
        if (maxW && cw > maxW) { ch = Math.round(ch * (maxW / cw)); cw = maxW; }
        const cv = document.createElement("canvas");
        cv.width = cw; cv.height = ch;
        const cx = cv.getContext("2d");
        if (jpeg) { cx.fillStyle = "#fff"; cx.fillRect(0, 0, cw, ch); }
        cx.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch);
        resolve({ url: jpeg ? cv.toDataURL("image/jpeg", 0.82) : cv.toDataURL("image/png"), w: cw, h: ch });
      } catch (e) { resolve(null); }   // tainted / blocked
    };
    im.onerror = () => resolve(null);
    im.src = src;
    setTimeout(() => resolve(null), 8000);
  });
}

function svgElToDataURL(svgEl, scale) {
  return new Promise((resolve) => {
    try {
      const clone = svgEl.cloneNode(true);
      const vb = (clone.getAttribute("viewBox") || "0 0 520 360").split(/\s+/).map(Number);
      const w = vb[2] || 520, h = vb[3] || 360;
      clone.setAttribute("width", w);
      clone.setAttribute("height", h);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const xml = new XMLSerializer().serializeToString(clone);
      const svg64 = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      const im = new Image();
      im.onload = () => {
        const s = scale || 2;
        const cv = document.createElement("canvas");
        cv.width = w * s; cv.height = h * s;
        const cx = cv.getContext("2d");
        cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        resolve({ url: cv.toDataURL("image/png"), w, h });
      };
      im.onerror = () => resolve(null);
      im.src = svg64;
      setTimeout(() => resolve(null), 8000);
    } catch (e) { resolve(null); }
  });
}

// Render a FloorPlan SVG offscreen and rasterise it.
function renderFloorPlanPNG(type, palette, view, level) {
  return new Promise((resolve) => {
    if (!window.FloorPlan || !window.ReactDOM || !window.React) { resolve(null); return; }
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:520px;height:360px;";
    document.body.appendChild(host);
    try {
      const el = window.FloorPlan({ type, palette, view, level });
      const root = window.ReactDOM.createRoot ? window.ReactDOM.createRoot(host) : null;
      if (root) root.render(el); else window.ReactDOM.render(el, host);
      setTimeout(async () => {
        const svg = host.querySelector("svg");
        const out = svg ? await svgElToDataURL(svg, 2) : null;
        try { if (root) root.unmount(); } catch (e) {}
        host.remove();
        resolve(out);
      }, 220);
    } catch (e) { host.remove(); resolve(null); }
  });
}

/* ---------- small HTML builders (Word-safe, table-driven) ---------- */
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS  = "Calibri, Arial, sans-serif";
const MONO  = "Consolas, 'Courier New', monospace";
const INK = "#1D1D1F", MUT = "#55555A", SOFT = "#8A8A90", LINE = "#D9D7D1";

function row2(k, v, strong) {
  return `<tr>
    <td style="width:30%;padding:5px 8px 5px 0;border-bottom:1px solid #EFEDE7;color:${SOFT};font-size:9.5pt;font-family:${SANS};vertical-align:top;">${esc(k)}</td>
    <td style="padding:5px 0;border-bottom:1px solid #EFEDE7;color:${INK};font-size:10.5pt;font-family:${SANS};${strong ? "font-weight:bold;" : ""}vertical-align:top;">${esc(v)}</td>
  </tr>`;
}
function kvTable(rows) { return `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:4px 0;">${rows}</table>`; }

function sectionHead(n, title, kicker, brand) {
  return `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border-bottom:2px solid ${INK};margin:22px 0 12px;">
    <tr>
      <td style="padding:0 10px 6px 0;font-family:${MONO};font-size:11pt;font-weight:bold;color:${brand};white-space:nowrap;vertical-align:bottom;">§${esc(n)}</td>
      <td style="padding:0 0 6px;font-family:${SERIF};font-size:16pt;font-weight:bold;color:${INK};vertical-align:bottom;">${esc(title)}</td>
      <td style="padding:0 0 8px;text-align:right;font-family:${MONO};font-size:8pt;color:${SOFT};vertical-align:bottom;">${esc(kicker || "")}</td>
    </tr>
  </table>`;
}

function term(n, h, body) {
  return `<p style="margin:12px 0 0;font-family:${SANS};"><span style="font-family:${MONO};font-size:9pt;color:${SOFT};">${esc(n)}</span>&nbsp;&nbsp;<b style="font-size:10.5pt;color:${INK};">${esc(h)}</b><br/>
    <span style="font-size:10pt;line-height:1.5;color:#3A3A3E;">${esc(body)}</span></p>`;
}

function moneyTable(lines) {
  // lines: [{k, sub, v, total}]
  return `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:4px 0;">` +
    lines.map(l => `<tr>
      <td style="padding:${l.total ? "10px 0 0" : "6px 0"};${l.total ? "border-top:2px solid " + INK + ";" : ""}font-family:${SANS};font-size:${l.total ? "11.5pt" : "10pt"};${l.total ? "font-weight:bold;color:" + INK : "color:" + MUT};">${esc(l.k)}${l.sub ? ` <span style="color:${SOFT};font-size:8.5pt;">${esc(l.sub)}</span>` : ""}</td>
      <td style="padding:${l.total ? "10px 0 0" : "6px 0"};${l.total ? "border-top:2px solid " + INK + ";" : ""}text-align:right;font-family:${MONO};font-size:${l.total ? "13pt" : "10.5pt"};font-weight:${l.total ? "bold" : "normal"};color:${l.total ? (l.brand || INK) : INK};white-space:nowrap;">${esc(l.v)}</td>
    </tr>`).join("") + `</table>`;
}

function pageBreak() { return `<br clear="all" style="mso-special-character:line-break;page-break-before:always;" />`; }

function letterhead(developer, brand, ref, today, logoData) {
  const left = logoData
    ? `<table cellspacing="0" cellpadding="0"><tr><td style="background:${brand};padding:5px 9px;"><img src="${logoData}" width="60" height="16" style="display:block;" /></td><td style="padding-left:10px;font-family:${SERIF};font-size:11pt;font-weight:bold;">${esc(developer.name)}</td></tr></table>`
    : `<table cellspacing="0" cellpadding="0"><tr><td style="background:${brand};color:${readable(brand)};width:26px;height:26px;text-align:center;font-family:${SERIF};font-weight:bold;">${esc(developer.initials)}</td><td style="padding-left:10px;font-family:${SERIF};font-size:11pt;font-weight:bold;">${esc(developer.name)}</td></tr></table>`;
  return `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border-bottom:1px solid ${LINE};padding-bottom:8px;margin-bottom:6px;">
    <tr>
      <td width="62%" style="vertical-align:middle;">${left}</td>
      <td width="38%" style="text-align:right;vertical-align:middle;font-family:${MONO};font-size:8pt;color:${SOFT};"><b style="color:${INK};">${esc(ref)}</b><br/>${esc(today)}</td>
    </tr>
  </table>`;
}

/* ---------- the document body ---------- */
function buildBody(ctx, assets) {
  const { developer, project, order, unit, design, pkg, smart, ops,
          furnishTotal, fitoutOn, fitoutTotal, furnishOnlyTotal, totalPrice, our } = ctx;
  // The Word agreement records OUR (admin-set) assumption — not the calculator's what-if values.
  const o = our || {};
  const opsRows = (o.rows || []).filter((r) => r.ops && r.ec);
  const opsMixed = !!o.mixed;
  const opsAny = opsRows.length > 0;
  const opsMain = ops || (opsRows[0] && opsRows[0].ops) || null;
  const nmOf = (x) => x ? x.name : "";
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
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const fmt = (n) => D.fmtSAR(n) + " SAR";
  const fitoutBoqTotal = (pkg && pkg.fitout) ? D.boqTotal(pkg.fitout.boq) : 0;
  const furnBoq = D.boqFor(pkg, unit ? unit.typeId : null);
  const legal = D.legalNameOf(developer, false);
  const regLine = [developer.crNumber, developer.vat].filter(Boolean).join(" · ");
  const unitVat = (unit ? unit.price : 0) * 0.15;
  const _wUnitsSum = ((ctx.units && ctx.units.length) ? ctx.units : (unit ? [unit] : [])).reduce((acc, u) => acc + (u.price || 0), 0);
  const logo = assets.logo;

  let H = "";

  /* ===== COVER ===== */
  const logoW = 113; // 800x213 logo at height 30
  const heroLogo = logo
    ? `<img src="${logo}" width="${logoW}" height="30" style="display:block;" />`
    : `<div style="font-family:${SERIF};font-size:22pt;font-weight:bold;color:${readable(hero)};">${esc(developer.name)}</div>`;
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:${hero};">
    <tr><td style="padding:40px 44px 36px;">
      <table cellspacing="0" cellpadding="0" style="width:100%;"><tr>
        <td width="55%" style="vertical-align:top;">${heroLogo}</td>
        <td width="45%" style="text-align:right;vertical-align:top;font-family:${MONO};font-size:9pt;color:${readable(hero)};">${esc(ref)}<br/>${esc(today)}</td>
      </tr></table>
      <div style="font-family:${MONO};font-size:9.5pt;letter-spacing:3px;text-transform:uppercase;color:${readable(hero)};margin-top:48px;">PURCHASE &amp; INVESTMENT AGREEMENT</div>
      <div style="font-family:${SERIF};font-size:32pt;font-weight:bold;color:${readable(hero)};margin-top:8px;line-height:1.05;">${esc(project ? project.name : "—")}</div>
      <div style="font-family:${SANS};font-size:12pt;color:${readable(hero)};margin-top:8px;">Unit ${esc(unit ? unit.number : "—")} · ${esc(unit ? unit.tower : "")}${unit ? ", " + (unit.floorSpan ? "Floors " + unit.floorSpan : "Floor " + unit.floor) : ""} · ${esc(project ? project.city : "")}</div>
      <table cellspacing="0" cellpadding="0" style="margin-top:30px;width:60%;"><tr>${palette.map(hex => `<td style="background:${hex};height:8px;">&nbsp;</td>`).join("")}</tr></table>
    </td></tr>
  </table>`;
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:26px;"><tr>
    <td style="width:50%;vertical-align:top;padding-right:18px;">
      <div style="font-family:${MONO};font-size:8.5pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;">Prepared for</div>
      <div style="font-family:${SERIF};font-size:15pt;font-weight:bold;margin-top:5px;">${esc(c.fullName || "—")}</div>
      <div style="font-family:${SANS};font-size:10pt;color:${MUT};margin-top:3px;">${esc(c.email || "")}${c.mobile ? " · " + esc(c.mobile) : ""}</div>
    </td>
    <td style="width:50%;vertical-align:top;">
      <div style="font-family:${MONO};font-size:8.5pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;">Issued by</div>
      <div style="font-family:${SERIF};font-size:15pt;font-weight:bold;margin-top:5px;">${esc(legal)}</div>
      <div style="font-family:${SANS};font-size:10pt;color:${MUT};margin-top:3px;">${esc(regLine)}</div>
    </td>
  </tr></table>`;
  H += `<p style="font-family:${SANS};font-size:10pt;color:${MUT};line-height:1.55;margin-top:22px;border-top:1px solid ${LINE};padding-top:16px;">This Agreement records the sale of the Unit described herein by ${esc(developer.name)} (the “Seller”) to the Buyer named above, together with the interior furnishing, fit-out and (where applicable) operating services the Buyer has selected, and the investment projection on which the Buyer has relied. The Seller is the sole counterparty to the Buyer under this Agreement.</p>`;

  /* ===== §1 PARTIES + §2 PROPERTY ===== */
  H += pageBreak();
  H += letterhead(developer, brand, ref, today, logo);
  H += sectionHead("1", "The Parties", "", brand);
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr>
    <td style="width:50%;vertical-align:top;padding-right:16px;">
      <div style="font-family:${MONO};font-size:8.5pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;margin-bottom:3px;">The Buyer</div>
      ${kvTable(row2("Full name", c.fullName || "—") + row2("National ID", c.nationalId || "—") + row2("Mobile", c.mobile || "—") + row2("Email", c.email || "—") + row2("City", c.city || "—"))}
    </td>
    <td style="width:50%;vertical-align:top;">
      <div style="font-family:${MONO};font-size:8.5pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;margin-bottom:3px;">The Seller</div>
      ${kvTable(row2("Developer", legal) + row2("CR number", developer.crNumber) + (developer.vat ? row2("VAT", developer.vat) : "") + row2("Authorised signatory", developer.primaryContact) + row2("Contact", developer.primaryEmail))}
    </td>
  </tr></table>`;
  H += sectionHead("2", "The Property", "", brand);
  H += kvTable(
    row2("Project", (project ? project.name : "—") + " · " + (project ? project.city : "")) +
    row2("Unit number", (unit ? unit.number : "—") + " · " + (unit ? unit.tower : "") + ", " + (unit ? (unit.floorSpan ? "Floors " + unit.floorSpan : "Floor " + unit.floor) : "")) +
    row2("Unit type", (unit ? unit.type.name : "—") + (unit && window.unitLevels && window.unitLevels(unit.type) > 1 ? " · " + window.unitLevels(unit.type) + "-storey duplex" : "")) +
    row2("Built-up area", unit ? (unit.area || unit.type.area) + " m²" : "—") +
    row2("Bedrooms / baths", unit ? unit.type.bedrooms + " bed · " + unit.type.baths + " bath" : "—") +
    row2("Aspect / view", unit ? unit.view : "—")
  );
  // 3D render of the unit type
  if (assets.render3d) {
    const r = assets.render3d; const rw = 515; const rh = Math.round(rw * (r.h / r.w));
    H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:14px;"><tr><td style="padding:0;"><img src="${r.url}" width="${rw}" height="${rh}" style="display:block;width:100%;border:1px solid ${LINE};" /><div style="font-family:${MONO};font-size:8pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;margin-top:4px;">${esc(unit ? unit.type.name : "")} · 3D render</div></td></tr></table>`;
  }
  // floor plan(s)
  if (assets.plans && assets.plans.length) {
    const multi = assets.plans.length > 1;
    const uploaded = assets.plans[0] && assets.plans[0].uploaded;
    const dispW = multi ? 215 : 400;
    H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid ${LINE};margin-top:14px;">
      <tr><td colspan="${multi ? 2 : 1}" style="background:#FAF8F3;border-bottom:1px solid ${LINE};padding:7px 12px;font-family:${MONO};font-size:8.5pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;">Appendix A · Floor plan</td></tr>
      <tr>
      ${assets.plans.map(p => { const h = Math.round(dispW * (p.h / p.w)); return `<td style="padding:10px;text-align:center;vertical-align:top;">${p.label ? `<div style="font-family:${MONO};font-size:8pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;margin-bottom:4px;">${esc(p.label)}</div>` : ""}<img src="${p.url}" width="${dispW}" height="${h}" style="display:inline-block;border:1px solid ${LINE};" /></td>`; }).join("")}
      </tr>
      <tr><td colspan="${multi ? 2 : 1}" style="font-family:${SANS};font-size:8pt;color:${SOFT};text-align:center;padding:0 0 8px;">${uploaded ? "Indicative layout — refer to the final architectural drawings." : "Schematic layout · indicative only, not to construction scale."}</td></tr>
    </table>`;
  }
  // masterplan / site location
  if (assets.masterplan) {
    const r = assets.masterplan; const mw = 515; const mh = Math.round(mw * (r.h / r.w));
    H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid ${LINE};margin-top:14px;">
      <tr><td style="background:#FAF8F3;border-bottom:1px solid ${LINE};padding:7px 12px;font-family:${MONO};font-size:8.5pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;">Appendix A.2 · Site &amp; location</td></tr>
      <tr><td style="padding:10px;text-align:center;"><img src="${r.url}" width="${mw}" height="${mh}" style="display:block;width:100%;border:1px solid ${LINE};" /></td></tr>
      <tr><td style="font-family:${SANS};font-size:8pt;color:${SOFT};text-align:center;padding:0 0 8px;">Masterplan showing the location of Unit ${esc(unit ? unit.number : "")} within ${esc(project ? project.name : "the development")}.</td></tr>
    </table>`;
  }

  /* ===== §3 INTERIOR ===== */
  H += pageBreak();
  H += letterhead(developer, brand, ref, today, logo);
  H += sectionHead("3", "The Interior", design ? design.name : "", brand);
  if (assets.photos && assets.photos.length) {
    const pw = assets.photos.length > 1 ? 300 : 460;
    H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr>
      ${assets.photos.slice(0, 2).map((ph, i) => { const hh = Math.round(pw * (ph.h / ph.w)); return `<td width="50%" style="padding:${i === 0 ? "0 5px 0 0" : "0 0 0 5px"};vertical-align:top;"><img src="${ph.url}" width="${pw}" height="${hh}" style="display:block;" /><div style="font-family:${MONO};font-size:8pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;margin-top:3px;">${esc(ph.label)}</div></td>`; }).join("")}
    </tr></table>`;
  }
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr>
    <td style="vertical-align:top;padding-right:16px;">
      <div style="font-family:${SERIF};font-size:14pt;font-weight:bold;">${esc(design ? design.name : "—")}</div>
      <div style="font-family:${SANS};font-size:10pt;color:${MUT};margin-top:4px;line-height:1.5;">${esc(design ? design.mood : "")}</div>
      <div style="margin-top:8px;">${(design && design.materials ? design.materials : []).map(m => `<span style="font-family:${SANS};font-size:9pt;color:#4A4A4E;background:#EFEDE7;padding:3px 8px;margin-right:5px;border-radius:10px;">${esc(m)}</span>`).join(" ")}</div>
    </td>
    <td style="width:150px;vertical-align:top;">
      <div style="font-family:${MONO};font-size:8pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;margin-bottom:5px;">Palette${chosenPalette ? " · " + esc(chosenPalette.name) : ""}</div>
      <table cellspacing="0" cellpadding="0">${palette.map(hex => `<tr><td style="background:${hex};width:15px;height:15px;border:1px solid ${LINE};">&nbsp;</td><td style="font-family:${MONO};font-size:9pt;color:${MUT};padding-left:7px;">${esc(hex.toUpperCase())}</td></tr>`).join("")}</table>
    </td>
  </tr></table>`;
  H += `<p style="font-family:${SANS};font-size:10.5pt;font-weight:bold;margin:18px 0 2px;">Furnishing package</p>`;
  H += kvTable(
    row2("Tier · package", (pkg ? pkg.tier : "—") + " — " + (pkg ? pkg.name : "")) +
    row2("Scope", pkg ? pkg.summary : "—") +
    row2("Pieces", pkg ? pkg.pieces + " items" : "—") +
    row2("Furniture & finishes warranty", pkg ? pkg.warranty + " years" : "—") +
    row2("Furnishing BOQ", "Appendix F-1 — " + furnBoq.length + " lines, by room") +
    (smart ? row2("Smart-home layer", smart.name + " · " + D.fmtSAR(smart.price) + " SAR" + (smart.includes ? " — " + smart.includes.join(", ") : "")) : "")
  );
  if (fitoutOn) {
    H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:14px;background:#FAF8F3;border:1px solid ${LINE};"><tr><td style="padding:12px 14px;">
      <table cellspacing="0" cellpadding="0" style="width:100%;"><tr>
        <td style="font-family:${SANS};font-size:10.5pt;font-weight:bold;">Fit-out <span style="font-family:${MONO};font-size:8pt;font-weight:normal;color:${SOFT};">INCLUDED</span></td>
        <td style="text-align:right;font-family:${MONO};font-size:10.5pt;font-weight:bold;">${esc(D.fmtSAR(fitoutBoqTotal))} SAR <span style="font-weight:normal;color:${SOFT};font-size:8pt;">excl. VAT</span></td>
      </tr></table>
      <div style="font-family:${SANS};font-size:9.5pt;color:${MUT};margin-top:5px;line-height:1.5;">${esc(pkg && pkg.fitout ? pkg.fitout.summary : "")}</div>
      <div style="font-family:${SANS};font-size:8.5pt;color:${SOFT};margin-top:6px;">Full itemised scope at Schedule A · Appendix F-2 (${(pkg && pkg.fitout && pkg.fitout.boq ? pkg.fitout.boq.length : 0)} priced lines).</div>
    </td></tr></table>`;
  } else {
    H += kvTable(row2("Fit-out", "Not selected"));
  }

  /* ===== §4 INVESTMENT + §5 PAYMENT ===== */
  H += pageBreak();
  H += letterhead(developer, brand, ref, today, logo);
  const heroRateRows = opsMixed
    ? '<tr><td style="padding:3px 0;opacity:.8;">Units in operation</td><td style="text-align:right;font-family:' + MONO + ';">' + opsRows.length + " / " + (o.rows || []).length + '</td></tr><tr><td style="padding:3px 0;opacity:.8;">Priced on</td><td style="text-align:right;font-family:' + MONO + ';">' + esc(fmt(o.opsUnitsPrice || 0)) + "</td></tr>"
    : '<tr><td style="padding:3px 0;opacity:.8;">' + (isDaily ? "Avg nightly rate" : "Monthly rent") + '</td><td style="text-align:right;font-family:' + MONO + ';">' + esc(fmt(rate)) + '</td></tr><tr><td style="padding:3px 0;opacity:.8;">Occupancy</td><td style="text-align:right;font-family:' + MONO + ';">' + occ + "%</td></tr>";
  H += sectionHead("4", "Investment Summary", "THE FIGURES YOU CHOSE", brand);
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr>
    <td style="width:${ops ? "50%" : "100%"};vertical-align:top;padding-right:${ops ? "18px" : "0"};">
      <div style="font-family:${MONO};font-size:8.5pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;margin-bottom:4px;">Total investment</div>
      ${moneyTable([
        { k: "Unit price", sub: "excl. VAT", v: fmt(unit ? unit.price : 0) },
        { k: "Furnishing", sub: "incl. VAT", v: fmt(fitoutOn ? furnishOnlyTotal : furnishTotal) },
        ...(fitoutOn ? [{ k: "Fit-out", sub: "incl. VAT", v: fmt(fitoutTotal) }] : []),
        { k: "Total investment", total: true, brand: brand, v: fmt(totalPrice) },
      ])}
      <div style="font-family:${SANS};font-size:8.5pt;color:${SOFT};margin-top:10px;line-height:1.5;">Unit price is subject to VAT and government registration fees handled per §6. The furnishing and fit-out figures are shown inclusive of 15% VAT and are added to the unit consideration, settled under the Buyer\u2019s Unit Purchase Agreement (see §5).</div>
    </td>
    ${(ops || opsAny) ? `<td style="width:50%;vertical-align:top;"><table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:${hero};"><tr><td style="padding:16px 18px;color:${readable(hero)};">
      <div style="font-family:${MONO};font-size:8.5pt;letter-spacing:1px;text-transform:uppercase;opacity:.85;">Projected return · ${opsMixed ? "per unit — see Schedule B" : esc(nmOf(opsMain))}${o.risk ? " · " + esc((D.RISK_META[o.risk] || {}).label || o.risk) : ""}</div>
      <div style="font-family:${SERIF};font-size:28pt;font-weight:bold;margin-top:4px;">${roi.toFixed(1)}%<span style="font-family:${SANS};font-size:10pt;font-weight:normal;opacity:.85;"> net ROI / year</span></div>
      <table cellspacing="0" cellpadding="0" style="width:100%;margin-top:12px;font-family:${SANS};font-size:9.5pt;color:${readable(hero)};">
        ${heroRateRows}
        <tr><td style="padding:3px 0;opacity:.8;">Annual gross</td><td style="text-align:right;font-family:${MONO};">${esc(fmt(annualGross))}</td></tr>
        <tr><td style="padding:3px 0;opacity:.8;">Operator fee · ${operatorFee}%</td><td style="text-align:right;font-family:${MONO};">−${esc(D.fmtSAR(annualGross - annualNet))} SAR</td></tr>
        <tr><td style="padding:3px 0;opacity:.8;">Net to owner / yr</td><td style="text-align:right;font-family:${MONO};">${esc(fmt(annualNet))}</td></tr>
        <tr><td style="padding:3px 0;opacity:.8;">Payback</td><td style="text-align:right;font-family:${MONO};">${annualNet > 0 ? (totalPrice / annualNet).toFixed(1) + " yrs" : "—"}</td></tr>
      </table>
      <div style="font-family:${SANS};font-size:8pt;opacity:.75;margin-top:12px;line-height:1.45;">Projection only — actual returns depend on market conditions and are not guaranteed by the Seller. Net to owner is paid monthly by ${esc(developer.name)} per Schedule B.</div>
    </td></tr></table></td>` : ""}
  </tr></table>`;
  // payment — addendum to the Unit Purchase Agreement (no separate schedule)
  H += sectionHead("5", "Payment", "ONE CONSIDERATION", brand);
  H += `<p style="font-family:${SANS};font-size:10pt;color:${MUT};margin:0 0 12px;line-height:1.6;">This Agreement is an addendum to the Buyer's Unit Purchase Agreement with ${esc(legal)}. The furnishing, interior${fitoutOn ? ", fit-out" : ""}${ops ? " and operating" : ""} works set out above are not separately invoiced to the Buyer — their value is added to the unit consideration and settled under the payment plan and construction milestones of that Unit Purchase Agreement. No separate furnishing instalment schedule applies.</p>`;
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
    <tr style="border-bottom:1px solid #EFEDE7;"><td style="padding:7px 0;font-family:${SANS};font-size:10pt;color:${MUT};">Furnishing &amp; interior addendum <span style="color:${SOFT};font-size:8pt;">net</span></td><td style="text-align:right;font-family:${MONO};font-size:10pt;">${esc(D.fmtSAR(furnishTotal/1.15))} SAR</td></tr>
    <tr style="border-bottom:1px solid #EFEDE7;"><td style="padding:7px 0;font-family:${SANS};font-size:10pt;color:${MUT};">VAT on furnishing &amp; interior <span style="color:${SOFT};font-size:8pt;">15%</span></td><td style="text-align:right;font-family:${MONO};font-size:10pt;">${esc(D.fmtSAR(furnishTotal-furnishTotal/1.15))} SAR</td></tr>
    <tr style="border-top:1.5px solid ${INK};"><td style="padding:8px 0;font-family:${SANS};font-size:10.5pt;font-weight:bold;">Total — furnishing &amp; interior addendum <span style="color:${SOFT};font-size:8pt;font-weight:normal;">incl. VAT · settled on the Unit Purchase Agreement schedule</span></td><td style="text-align:right;font-family:${MONO};font-weight:bold;color:${brand};">${esc(D.fmtSAR(furnishTotal))} SAR</td></tr>
  </table>
  <p style="font-family:${SANS};font-size:8pt;color:${SOFT};margin-top:8px;line-height:1.5;">Furnishing, smart-home and fit-out are services subject to 15% VAT (shown above). The unit is a residential property sale, exempt from VAT and subject to the 5% Real Estate Transaction Tax (RETT), settled on registration per §6.3. Payable to ${esc(developer.name)} on the instalments set out in the Unit Purchase Agreement.</p>`;

  /* ===== SCHEDULE A ===== */
  H += pageBreak();
  H += letterhead(developer, brand, ref, today, logo);
  H += sectionHead("A", "Schedule A — Furnishing & Interior", pkg ? pkg.tier + " · " + pkg.name : "", brand);
  H += term("A.1", "Scope", `The Seller shall supply and install the furnishing package “${pkg ? pkg.tier : ""} — ${pkg ? pkg.name : ""}” (${pkg ? pkg.pieces : 0} items) executed in the “${design ? design.name : ""}” design${smart ? ", with the “" + smart.name + "” smart-home layer" : ""}${fitoutOn ? ", together with the interior fit-out itemised below" : ""}. The bills of quantities below form part of this Schedule.`);
  // F-1
  H += `<p style="font-family:${SANS};font-size:10pt;font-weight:bold;margin:18px 0 5px;">Appendix F-1 · Furnishing bill of quantities <span style="font-family:${MONO};font-size:8.5pt;font-weight:normal;color:${SOFT};">${furnBoq.length} LINES</span></p>`;
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
    <tr style="border-bottom:1px solid ${INK};">${["ROOM", "ITEM", "QTY", "SUPPLIER", "NOTES"].map((h, i) => `<td style="font-family:${MONO};font-size:8pt;color:${SOFT};padding-bottom:5px;${i === 2 ? "text-align:center;" : ""}">${h}</td>`).join("")}</tr>
    ${furnBoq.map(b => `<tr style="border-bottom:1px solid #EFEDE7;"><td style="padding:4px 0;font-family:${SANS};font-size:9pt;color:${MUT};">${esc(b.room)}</td><td style="padding:4px 0;font-family:${SANS};font-size:9pt;font-weight:bold;">${esc(b.item)}</td><td style="padding:4px 0;text-align:center;font-family:${MONO};font-size:9pt;">${esc(b.qty)}</td><td style="padding:4px 0;font-family:${SANS};font-size:9pt;color:${MUT};">${esc(b.supplier)}</td><td style="padding:4px 0;font-family:${SANS};font-size:9pt;color:${SOFT};">${esc(b.notes)}</td></tr>`).join("")}
    ${furnBoq.length === 0 ? `<tr><td colspan="5" style="padding:10px 0;font-family:${SANS};font-size:9pt;color:${SOFT};">Furnishing schedule attached separately.</td></tr>` : ""}
  </table>`;
  if (fitoutOn) {
    const fb = (pkg && pkg.fitout && pkg.fitout.boq ? pkg.fitout.boq : []);
    H += `<p style="font-family:${SANS};font-size:10pt;font-weight:bold;margin:20px 0 5px;">Appendix F-2 · Fit-out bill of quantities <span style="font-family:${MONO};font-size:8.5pt;font-weight:normal;color:${SOFT};">PRICED</span></p>`;
    H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid ${INK};">${[["SCOPE", "l"], ["ITEM", "l"], ["QTY", "c"], ["UNIT", "r"], ["LINE TOTAL", "r"]].map(h => `<td style="font-family:${MONO};font-size:8pt;color:${SOFT};padding-bottom:5px;text-align:${h[1] === "c" ? "center" : h[1] === "r" ? "right" : "left"};">${h[0]}</td>`).join("")}</tr>
      ${fb.map(b => `<tr style="border-bottom:1px solid #EFEDE7;"><td style="padding:4px 0;font-family:${SANS};font-size:9pt;color:${MUT};">${esc(b.room)}</td><td style="padding:4px 0;font-family:${SANS};font-size:9pt;font-weight:bold;">${esc(b.item)}</td><td style="padding:4px 0;text-align:center;font-family:${MONO};font-size:9pt;">${esc(b.qty)}</td><td style="padding:4px 0;text-align:right;font-family:${MONO};font-size:9pt;">${esc(D.fmtSAR(b.unitPrice))}</td><td style="padding:4px 0;text-align:right;font-family:${MONO};font-size:9pt;">${esc(D.fmtSAR((b.qty || 0) * (b.unitPrice || 0)))}</td></tr>`).join("")}
      <tr style="border-top:1.5px solid ${INK};"><td colspan="4" style="padding:6px 0;font-family:${SANS};font-size:10pt;font-weight:bold;">Fit-out total (excl. VAT)</td><td style="text-align:right;font-family:${MONO};font-weight:bold;color:${brand};">${esc(D.fmtSAR(fitoutBoqTotal))}</td></tr>
    </table>`;
  }
  H += term("A.2", "Procurement & installation", `Procurement occurs T-9 to T-7 months and installation T-4 to T-1 months before handover${fitoutOn ? "; the fit-out completes before furniture installation" : ""}. A joint walkthrough is held T-1 month with the Buyer present.`);
  H += term("A.3", "Title & risk in the goods", "Title to the furnishing items passes to the Buyer on full payment of the package value; risk passes on installation and handover of the Unit. Items are new, unused and supplied to the specification in the bills of quantities.");
  H += term("A.4", "Warranty & defects", `The Seller warrants the furniture and finishes for ${pkg ? pkg.warranty : 5} years${fitoutOn && pkg && pkg.fitout && pkg.fitout.warranty ? ", and the fit-out finishes for " + pkg.fitout.warranty + " years" : ""} from handover, fair wear and tear excepted. Defects reported within the 30-day snagging window are remedied at no cost to the Buyer.`);
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:14px;background:#FAF8F3;border:1px solid ${LINE};"><tr><td style="padding:12px 14px;">
    <div style="font-family:${MONO};font-size:8pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;margin-bottom:4px;">A.5 · Commercial value</div>
    ${moneyTable([
      { k: "Furnishing", sub: "incl. VAT", v: fmt(fitoutOn ? furnishOnlyTotal : furnishTotal) },
      ...(fitoutOn ? [{ k: "Fit-out", sub: "incl. VAT", v: fmt(fitoutTotal) }] : []),
      { k: "Package value", total: true, brand: brand, v: fmt(furnishTotal) },
    ])}
  </td></tr></table>`;

  /* ===== SCHEDULE B ===== */
  if (ops || opsAny) {
    H += pageBreak();
    H += letterhead(developer, brand, ref, today, logo);
    H += sectionHead("B", "Schedule B — Operating & Rental Management", opsMixed ? "Per-unit models" : nmOf(opsMain), brand);
    if (opsMixed) {
      H += term("B.1", "Appointment & models", "The Buyer (the “Owner”) appoints " + legal + " (the “Operator”) to manage the letting of the following Units, each under its own model: " + opsRows.map((r) => r.unit.number + " — “" + r.ops.name + "” (" + (r.ops.kind === "daily" ? "nightly" : "monthly") + ", " + r.ops.mgmtFee + "% fee)").join("; ") + ". The Operator markets, books, checks in guests, cleans and maintains the Units on the Owner's behalf.");
      H += term("B.2", "Operator fee & payout", "The Operator charges each model's fee as set out in B.1 (weighted average " + operatorFee + "% of gross rental). Net rental is paid to the Owner monthly, by the 5th of the following month, to the Owner's nominated account.");
    } else {
      H += term("B.1", "Appointment & model", "The Buyer (the “Owner”) appoints " + legal + " (the “Operator”) to manage the letting of the Unit under the “" + nmOf(opsMain) + "” model (" + (opsMain && opsMain.kind === "daily" ? "nightly / short-stay" : "monthly / long-stay") + "). The Operator markets, books, checks in guests, cleans and maintains the Unit on the Owner's behalf.");
      H += term("B.2", "Operator fee & payout", "The Operator charges " + operatorFee + "% of gross rental. Net rental is paid to the Owner monthly, by the 5th of the following month, to the Owner's nominated account.");
    }
    const b7PerUnit = opsRows.length > 1
      ? '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-family:' + SANS + ';font-size:9pt;margin-bottom:8px;"><tr style="font-family:' + MONO + ';font-size:7.5pt;letter-spacing:.5px;color:' + SOFT + ';text-transform:uppercase;"><td style="padding:3px 0;">Unit</td><td>Model</td><td style="text-align:right;">Rate</td><td style="text-align:right;">Occ.</td><td style="text-align:right;">Fee</td><td style="text-align:right;">Net / yr</td><td style="text-align:right;">Net ROI</td></tr>'
        + opsRows.map((r) => '<tr style="border-top:1px dotted ' + LINE + ';"><td style="padding:4px 0;font-family:' + MONO + ';font-weight:bold;">' + esc(r.unit.number) + "</td><td>" + esc(r.ops.name) + '</td><td style="text-align:right;font-family:' + MONO + ';">' + esc(D.fmtSAR(r.ec.rate)) + (r.ops.kind === "daily" ? "/nt" : "/mo") + '</td><td style="text-align:right;font-family:' + MONO + ';">' + r.ec.occ + '%</td><td style="text-align:right;font-family:' + MONO + ';">' + r.ops.mgmtFee + '%</td><td style="text-align:right;font-family:' + MONO + ';">' + esc(D.fmtSAR(r.ec.annualNet)) + '</td><td style="text-align:right;font-family:' + MONO + ';font-weight:bold;">' + r.ec.roi.toFixed(1) + "%</td></tr>").join("")
        + "</table>"
      : "";
    H += term("B.3", "Reporting", "A monthly income statement is delivered to the Owner showing gross rental, operator fee, platform and utility costs, and net to the Owner.");
    H += term("B.4", "Term, renewal & termination", "Minimum term of two (2) years from activation, then 12-month auto-renewal unless either party gives sixty (60) days' notice. Early termination by the Owner attracts a charge equal to three (3) months' average net revenue.");
    H += term("B.5", "Owner obligations", "The Owner shall keep the Unit insured, maintain the furnishing in lettable condition (fair wear and tear excepted), and not let the Unit independently of the Operator during the term.");
    H += term("B.6", "Delivery & counterparty", "The Operator may discharge these services through a back-to-back agreement with Revnu Property Management while remaining the Owner's sole counterparty for performance, reporting and payouts.");
    H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:14px;background:#FAF8F3;border:1px solid ${LINE};"><tr><td style="padding:12px 14px;">
      <div style="font-family:${MONO};font-size:8pt;letter-spacing:1px;color:${SOFT};text-transform:uppercase;margin-bottom:6px;">B.7 · Projected economics (indicative)</div>
      ${b7PerUnit}
      ${kvTable(
        (opsMixed ? "" : row2(isDaily ? "Average nightly rate" : "Monthly rent", fmt(rate)) + row2("Occupancy", occ + "%")) +
        row2("Annual gross rental", fmt(annualGross)) +
        row2("Operator fee · " + operatorFee + "%", "−" + D.fmtSAR(annualGross - annualNet) + " SAR") +
        row2("Annual net to Owner", fmt(annualNet), true) +
        row2("Gross yield", grossYield.toFixed(1) + "%") +
        row2("Net ROI / year", roi.toFixed(1) + "%") +
        row2("Indicative payback", annualNet > 0 ? (totalPrice / annualNet).toFixed(1) + " years" : "—")
      )}
      <div style="font-family:${SANS};font-size:8pt;color:${SOFT};margin-top:8px;line-height:1.45;">Projection only — actual returns depend on market conditions and are not guaranteed by the Operator.</div>
    </td></tr></table>`;
  }

  /* ===== §6 GENERAL TERMS ===== */
  H += pageBreak();
  H += letterhead(developer, brand, ref, today, logo);
  H += sectionHead("6", "General Terms & Conditions", "", brand);
  const terms = [
    ["6.1", "Definitions", `“Seller” means ${legal}; “Buyer” means the party named in §1; “Unit” means the property described in §2; “Works” means the furnishing, fit-out and smart-home scope in §3. Words importing the singular include the plural and vice versa.`],
    ["6.2", "Sale & transfer of title", `The Seller agrees to sell and the Buyer agrees to purchase the Unit free of encumbrance. Title transfers to the Buyer upon receipt of the full Total Contract Value and completion of registration with the competent authority, expected on or about ${project ? project.delivery : "the target delivery date"}.`],
    ["6.3", "Price, VAT & RETT", `The furnishing, smart-home and fit-out works are services subject to value-added tax at the prevailing rate (currently 15%), shown explicitly in §5. The Unit itself is a sale of residential real estate: it is exempt from VAT and instead subject to the 5% Real Estate Transaction Tax (RETT), being ${D.fmtSAR(_wUnitsSum * 0.05)} SAR, together with any government registration fees — settled with the competent authority on registration. All taxes and fees are payable as set out in §4 and §5.`],
    ["6.4", "Payment", "The Total Consideration in §5 \u2014 the unit price together with the furnishing and interior addendum \u2014 is payable by the Buyer to the Seller under the Buyer\u2019s Unit Purchase Agreement, on the instalments and construction milestones set out in that agreement. No separate furnishing payment schedule applies; late payment and default are governed by the Unit Purchase Agreement."],
    ["6.5", "Furnishing, fit-out & operations", `The furnishing and fit-out works are supplied, sequenced and warranted under Schedule A (with the bills of quantities at Appendices F-1${fitoutOn ? " and F-2" : ""})${ops ? "; rental management is provided under Schedule B" : ""}. Those Schedules form part of this Agreement and are incorporated by reference.`],
    ["6.6", "Handover & snagging", "At handover the Buyer is given a snagging period of thirty (30) days to report defects in the Unit or the Works. The Seller shall remedy verified defects within forty-five (45) days at no cost to the Buyer."],
    ["6.7", "Warranties", `The Seller warrants the Unit against structural defects for ten (10) years and the Works (furniture and finishes) for ${pkg ? pkg.warranty : 5} years${fitoutOn && pkg && pkg.fitout && pkg.fitout.warranty ? ", and the fit-out finishes for " + pkg.fitout.warranty + " years" : ""} from handover, fair wear and tear excepted.`],
    ["6.8", "Default & termination", "Either party may terminate on thirty (30) days' written notice for material breach left uncured. On Buyer default, the Seller may retain liquidated damages of up to 10% of the Total Contract Value; on Seller default, sums paid are refunded with profit at the prevailing SAIBOR."],
    ["6.9", "Force majeure", "Neither party is liable for delay or failure caused by events beyond reasonable control. Delivery dates extend by the period of the event."],
    ["6.10", "Data protection", "The Buyer's personal data is processed under the Saudi Personal Data Protection Law (PDPL) solely for KYC, contract execution and ongoing service, as acknowledged in the KYC & PDPL appendix to this pack."],
    ["6.11", "Governing law & disputes", `This Agreement is governed by the laws of the Kingdom of Saudi Arabia. Disputes are referred to the competent courts of ${project ? project.city : "the Seller's city"}, save that the parties shall first attempt amicable settlement within thirty (30) days.`],
    ["6.12", "Entire agreement", "This Agreement, with its Schedules and Appendices, constitutes the entire agreement between the parties and supersedes prior discussions. Amendments must be in writing and signed by both parties."],
  ];
  H += terms.map(t => term(t[0], t[1], t[2])).join("");

  /* ===== §7 EXECUTION ===== */
  H += pageBreak();
  H += letterhead(developer, brand, ref, today, logo);
  H += sectionHead("7", "Execution", "SIGNED BY THE PARTIES", brand);
  H += `<p style="font-family:${SANS};font-size:10pt;color:${MUT};line-height:1.55;margin:0 0 18px;">By signing below, the Buyer and ${esc(legal)} agree to be bound by this Agreement together with its Schedules and Appendices — the floor plan (Appendix A), the furnishing and fit-out bills of quantities (Schedule A, Appendices F-1${fitoutOn ? " & F-2" : ""})${ops ? ", the operating terms (Schedule B)" : ""} and the KYC &amp; PDPL acknowledgement.</p>`;
  H += sigTable(developer, c);
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:28px;border-top:1px solid ${LINE};padding-top:10px;"><tr><td style="font-family:${MONO};font-size:8pt;color:${SOFT};">${esc(ref)} · ${esc(project ? project.name : "")}</td><td style="text-align:right;font-family:${MONO};font-size:8pt;color:${SOFT};letter-spacing:1px;">PREPARED ON REVNU</td></tr></table>`;

  /* ===== KYC APPENDIX ===== */
  H += pageBreak();
  H += letterhead(developer, brand, ref + "-KYC", today, logo);
  H += `<div style="font-family:${SERIF};font-size:18pt;font-weight:bold;margin:18px 0 2px;">KYC &amp; PDPL Acknowledgement</div>`;
  H += `<div style="font-family:${SANS};font-size:10pt;color:${MUT};margin-bottom:16px;">Appendix to ${esc(ref)}</div>`;
  H += `<p style="font-family:${SANS};font-size:10.5pt;font-weight:bold;margin:0 0 6px;">1 · Acknowledgement</p>`;
  H += `<p style="font-family:${SANS};font-size:10pt;line-height:1.55;color:#3A3A3E;margin:0;">The Buyer acknowledges that their personal data has been collected by ${esc(developer.name)} under the Saudi Personal Data Protection Law (PDPL). Data is used solely for KYC, contract execution and ongoing service.</p>`;
  H += kvTable(
    row2("Name", c.fullName || "—") +
    row2("National ID", c.nationalId || "—") +
    row2("Buyer category", c.beneficiary ? "Beneficiary — subsidised unit price" : "Non-beneficiary — market unit price") +
    row2("Mobile", c.mobile || "—") +
    row2("Email", c.email || "—") +
    row2("City", c.city || "—")
  );
  H += `<p style="font-family:${SANS};font-size:10.5pt;font-weight:bold;margin:18px 0 6px;">2 · Rights</p>`;
  H += `<p style="font-family:${SANS};font-size:10pt;line-height:1.55;color:#3A3A3E;margin:0;">The Buyer may request access, correction or deletion of their data at any time, subject to ${esc(developer.name)}'s retention obligations.</p>`;
  H += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:34px;"><tr><td style="width:50%;vertical-align:top;padding-right:20px;">${sigBlock("The Buyer", c.fullName || "—", "Beneficiary")}</td><td style="width:50%;vertical-align:top;">${sigBlock("The Seller", D.legalNameOf(developer, false), (developer.authorizedSigner || developer.primaryContact) + ", " + (developer.authorizedSignerTitle || "authorised signatory"))}</td></tr></table>`;

  return H;
}

function sigBlock(role, name, sub) {
  return `<div style="font-family:${MONO};font-size:8pt;color:${SOFT};letter-spacing:1px;text-transform:uppercase;font-weight:bold;">${esc(role)}</div>
    <div style="border-bottom:1px solid ${INK};height:30px;margin-top:18px;"></div>
    <div style="font-family:${SANS};font-size:10pt;font-weight:bold;margin-top:5px;">${esc(name)}</div>
    <div style="font-family:${SANS};font-size:9pt;color:${MUT};">${esc(sub)}</div>
    <div style="font-family:${SANS};font-size:9pt;color:${SOFT};margin-top:9px;">Date: ____________________</div>`;
}
function sigTable(developer, c) {
  return `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr>
    <td style="width:50%;vertical-align:top;padding-right:20px;">${sigBlock("The Buyer", c.fullName || "—", "Beneficiary")}</td>
    <td style="width:50%;vertical-align:top;">${sigBlock("The Seller", D.legalNameOf(developer, false), (developer.authorizedSigner || developer.primaryContact) + ", " + (developer.authorizedSignerTitle || "authorised signatory"))}</td>
  </tr></table>`;
}

/* ---------- assemble + download ---------- */
async function gatherAssets(ctx) {
  const { developer, unit, design } = ctx;
  const palette = (design && design.palette) || ["#1D1D1F"];
  const assets = { logo: null, plans: [], photos: [], render3d: null, masterplan: null };

  // logo (same-origin)
  if (developer.logo) { const r = await imgToDataURL(developer.logo, {}); assets.logo = r ? r.url : null; }

  // 3D render of the unit type (uploaded in admin)
  if (unit && unit.type && unit.type.render3dImg) {
    const r = await imgToDataURL(unit.type.render3dImg, { cors: true, maxW: 1000, jpeg: true });
    if (r) assets.render3d = { url: r.url, w: r.w, h: r.h };
  }

  // floor plan(s) — uploaded image takes priority over the auto-drawn schematic
  const _plans = unit && unit.type ? D.floorPlansOf(unit.type) : [];
  if (_plans.length) {
    const show = (unit.type.levels || 1) > 1 ? _plans : _plans.slice(0, 1);
    for (const p of show) { const r = await imgToDataURL(p.src, { cors: true, maxW: 1000, jpeg: true }); if (r) assets.plans.push({ url: r.url, w: r.w, h: r.h, label: p.label || "", uploaded: true }); }
  } else if (unit && unit.type) {
    const lv = window.unitLevels ? window.unitLevels(unit.type) : 1;
    if (lv <= 1) {
      const p = await renderFloorPlanPNG(unit.type, palette, unit.view, 0);
      if (p) assets.plans.push({ url: p.url, w: p.w, h: p.h, label: "" });
    } else {
      for (let i = 0; i < lv; i++) {
        const p = await renderFloorPlanPNG(unit.type, palette, unit.view, i);
        if (p) assets.plans.push({ url: p.url, w: p.w, h: p.h, label: window.unitLevelName ? window.unitLevelName(unit.type, i) : "Floor " + (i + 1) });
      }
    }
  }

  // masterplan / site location (uploaded in admin)
  if (unit && unit.type && unit.type.masterplanImg) {
    const r = await imgToDataURL(unit.type.masterplanImg, { cors: true, maxW: 1000, jpeg: true });
    if (r) assets.masterplan = { url: r.url, w: r.w, h: r.h };
  }

  // design photos (CORS-load, cropped to a fixed landscape aspect + rasterised)
  if (design && design.images) {
    for (const img of design.images.slice(0, 2)) {
      if (!img.src) continue;
      const r = await imgToDataURL(img.src, { cors: true, maxW: 640, jpeg: true, cropAspect: 1.6 });
      if (r) assets.photos.push({ url: r.url, w: r.w, h: r.h, label: img.label });
    }
  }
  return assets;
}

async function downloadAgreementWord(ctx) {
  const ref = "AGR-" + (ctx.order && ctx.order.id ? ctx.order.id.replace(/[^0-9]/g, "") : "26212");
  const assets = await gatherAssets(ctx);
  const body = buildBody(ctx, assets);

  const html =
`<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${ref}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
@page Section1 { size: 595.3pt 841.9pt; margin: 38pt 44pt 40pt 44pt; }
div.Section1 { page:Section1; }
body { font-family: Calibri, Arial, sans-serif; color:#1D1D1F; }
table { border-collapse: collapse; }
img { border: 0; }
</style>
</head>
<body>
<div class="Section1">
${body}
</div>
</body>
</html>`;

  // BOM + msword blob so Word opens it directly with correct encoding
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ref + ".doc";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  return true;
}

window.downloadAgreementWord = downloadAgreementWord;

export { downloadAgreementWord };
