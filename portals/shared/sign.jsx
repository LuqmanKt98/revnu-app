"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import D from "@/lib/data/store";
import R from "@/lib/data/remote";
import { FullAgreement, agreementCtxFromOrder } from "./contract";
import { SignaturePad } from "./mobile-wizard";
/* =================================================================
   sign.jsx — the buyer reads the agreement as a native phone document and signs it there (sign.html?code=…).
   Sections = agreement pages (FullAgreement). “Sign” unlocks after every page was read (project setting).
   Signing records time, device, consent and the deal fingerprint; the sealed PDF (print) exists only after that.
================================================================= */
const isAR = () => !!(window.I18N && window.I18N.isAR); const L = (en, ar) => (isAR() ? ar : en);
const errMsg = (e) => (e && typeof e.friendly === "function" ? e.friendly(isAR()) : (e && e.message) || String(e || ""));
const TX = (o, k) => (o ? ((isAR() && o[k + "Ar"]) ? o[k + "Ar"] : (o[k] || "")) : "");
const fmt = (iso) => (iso ? new Date(iso).toLocaleString(isAR() ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }) : "—");   // Riyadh time on every device
const shortUa = (ua) => { const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : ""; const br = /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : ""; return [os, br].filter(Boolean).join(" · "); };

function SigBlocks({ developer, order, sig }) {
  const c = order.customer || {}; const issued = D.activityFor(order.id).find((a) => a.event === "created");
  return <div className="rs-sigs">
    <div><div className="pw-eye">{L("THE DEVELOPER", "المطور")}</div><div className="rs-sigbox" style={{ height: 96 }}>{(developer.signatureData || developer.signature) ? <img src={developer.signatureData || developer.signature} alt="signature" style={{ maxHeight: 70 }} /> : <span className="pw-hint">{L("Signed electronically at issue", "موقع إلكترونيا عند الإصدار")}</span>}{(developer.stampData || developer.stamp) ? <img src={developer.stampData || developer.stamp} alt="stamp" style={{ height: 84 }} /> : <span className="rs-stamp">Revnu.sa</span>}</div><b>{TX(developer, "authorizedSigner") || TX(developer, "name")}</b><div className="pw-hint">{TX(developer, "authorizedSignerTitle")}</div><div className="pw-hint" style={{ color: "var(--growth)" }}>{L("Signed & stamped at issue", "تم التوقيع والختم عند الإصدار")}{issued ? " · " + fmt(issued.at) : ""}</div></div>
    <div><div className="pw-eye">{L("THE BUYER", "المشتري")}</div><div className="rs-sigbox" style={{ justifyContent: "center" }}>{sig && sig.signatureData ? <img src={sig.signatureData} alt="signature" style={{ maxWidth: "90%" }} /> : sig && sig.typedName ? <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontStyle: "italic" }}>{sig.typedName}</span> : <span className="pw-hint">{L("Awaiting the buyer's signature", "بانتظار توقيع المشتري")}</span>}</div><b>{c.fullName || order.customerName}</b><div className="pw-hint">{L("ID", "الهوية")} ••••••{String(c.nationalId || order.customerId || "").slice(-4)}</div>{sig ? <div className="pw-hint" style={{ color: "var(--growth)" }}>{L("Signed on the buyer's phone", "تم التوقيع من جوال المشتري")} · {fmt(sig.signedAt)}</div> : <div className="pw-hint">{L("Awaiting", "بانتظار")}</div>}</div>
  </div>;
}
function Certificate({ order, sig, developer, code, bare }) {
  const read = sig.readSections || [];
  const rows = [[L("Agreement", "العقد"), order.id + (order.agreement ? " · v" + order.agreement.version : "")], [L("Document fingerprint (SHA-256)", "بصمة المستند (SHA-256)"), sig.documentHash], [L("Developer", "المطور"), (TX(developer, "authorizedSigner") || developer.name) + " · " + L("signature + stamp at issue", "توقيع وختم عند الإصدار")],
    [L("Buyer", "المشتري"), sig.signerName + " · " + L("ID", "الهوية") + " ••••••" + (sig.signerIdLast4 || "")], [L("Signed at", "وقت التوقيع"), fmt(sig.signedAt) + " (" + L("Riyadh time, UTC+3", "بتوقيت الرياض، UTC+3") + ")"], [L("From", "من"), [sig.ip || L("IP recorded server-side in production", "يسجل عنوان IP من الخادم في النسخة الفعلية"), sig.userAgent ? shortUa(sig.userAgent) : ""].filter(Boolean).join(" · ")],
    [L("Via", "عبر"), L("Signing link", "رابط التوقيع") + " " + code + " · " + L("buyer's own device", "جهاز المشتري")], [L("Read", "القراءة"), read.length ? R.readSummary(read, isAR()) + " · " + fmt(read[0].at) + (isAR() ? " ← " : " → ") + fmt(read[read.length - 1].at) : "—"], [L("Consent", "الموافقة"), fmt(sig.consentAt) + (sig.termsVersion ? " · " + L("terms", "الشروط") + " " + sig.termsVersion : "")]];
  return <section className={"rs-cert" + (bare ? "" : " card card-pad")} style={{ display: "grid", gap: 10 }}>{!bare && <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 18 }}>{L("Signature certificate", "شهادة التوقيع")}</h3>}<p className="pw-hint" style={{ margin: 0 }}>{L("This page is part of the signed agreement. Any change to the agreement's facts or text would produce a different fingerprint.", "هذه الصفحة جزء من العقد الموقع، وأي تغيير في بياناته أو نصه ينتج بصمة مختلفة.")}</p>
    <table><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td style={{ fontFamily: /SHA|link|رابط|بصمة/.test(k) ? "var(--font-mono)" : undefined, wordBreak: "break-all" }}>{v}</td></tr>)}</tbody></table>
    {sig.signatureData && <div><div className="pw-eye">{L("Captured signature", "التوقيع الملتقط")}</div><img src={sig.signatureData} alt="signature" style={{ maxHeight: 80, marginTop: 6 }} /></div>}</section>;
}

/* Phone agreement viewer: A4 sheets fitted to width; pinch or the button zooms, the box then scrolls in both directions. */
function AgreementViewer({ children, innerRef }) {
  const [z, setZ] = useState(1); const box = useRef(null);
  const apply = (nz) => { nz = Math.max(1, Math.min(3, Math.round(nz * 20) / 20)); window.__agZoom = nz; setZ(nz); window.dispatchEvent(new Event("ag-zoom")); };
  useEffect(() => () => { window.__agZoom = 1; window.dispatchEvent(new Event("ag-zoom")); }, []);
  useEffect(() => { const el = box.current; if (!el) return; let d0 = 0, z0 = 1; const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const ts = (e) => { if (e.touches.length === 2) { d0 = dist(e.touches); z0 = window.__agZoom || 1; } }; const tm = (e) => { if (e.touches.length === 2 && d0) { e.preventDefault(); apply(z0 * dist(e.touches) / d0); } }; const te = () => { d0 = 0; };
    el.addEventListener("touchstart", ts, { passive: true }); el.addEventListener("touchmove", tm, { passive: false }); el.addEventListener("touchend", te); return () => { el.removeEventListener("touchstart", ts); el.removeEventListener("touchmove", tm); el.removeEventListener("touchend", te); }; }, []);
  return <div ref={box} className="ag-zoom" style={{ height: "min(78vh, 720px)" }}><div className="ag-zoombar"><button onClick={() => apply(z > 1 ? 1 : 1.75)}>{z > 1 ? L("Fit", "ملاءمة") : L("Zoom", "تكبير")}</button></div><div ref={innerRef}>{children}</div></div>;
}
function Shell({ children, right, white, developer, scroller }) {
  return <div className="pw"><div className="pw-shell single"><div ref={scroller} className="pw-col narrow pw-scroll" style={{ background: white ? "#fff" : undefined }}>
    <div className="pw-top">{developer && developer.logo ? <img src={developer.logo} alt="" style={{ height: 22 }} /> : <b style={{ fontFamily: "var(--font-display)" }}>{developer ? TX(developer, "name") : "Revnu"}</b>}{right || <span />}</div>{children}</div></div></div>;
}
function Problem({ title, body, developer, rep }) {
  const repName = rep ? TX(rep, "name") : "";
  return <Shell developer={developer}><div className="pw-body" style={{ gap: 16 }}><div className="pw-center" style={{ paddingTop: 50 }}><span className="pw-ok mute" style={{ fontFamily: "var(--font-mono)", fontSize: 22 }}>!</span><h2 style={{ fontSize: 26 }}>{title}</h2><p className="pw-hint" style={{ maxWidth: 320, fontSize: 14, margin: 0 }}>{body}</p></div>{rep && rep.mobile && <a className="pw-cta wide" target="_blank" rel="noopener" href={R.wa(rep.mobile, "")}>{L("WhatsApp " + repName, "تواصل مع " + repName + " على واتساب")}</a>}</div></Shell>;
}

function SignApp() {
  const AR = isAR(); const code = R.paramCode();
  const [g, setG] = useState(() => R.openSigning(code)); const order = g ? D.ORDERS.find((o) => o.id === g.orderId) : null;
  const developer = order ? D.devById(order.developerId) : null; const project = order ? D.projById(order.projectId) : null; const signer = developer ? D.signerOf(developer, order) : null; const rep = order ? D.userById(order.repId) : null; const repName = rep ? TX(rep, "name") : "";
  const [phase, setPhase] = useState(order && ["signed", "paid", "completed"].includes(order.status) ? "signed" : "read"); const lang = AR ? "ar" : "en";
  const ctx = useMemo(() => (order && agreementCtxFromOrder ? agreementCtxFromOrder(order, lang) : null), [order && order.id, lang, phase]);
  // Reads count for the pagination they were made on — this language and this page count (the same agreement can paginate
  // differently on another device or in the other language). Entries from before carry no language / page count and count for any.
  const readsFor = (n) => new Set(((g && g.readLog) || []).filter((r) => (!r.lang || r.lang === "xx" || r.lang === lang) && (r.n == null || r.n === n)).map((r) => r.id));
  const [sections, setSections] = useState((g && g.pages && g.pages[lang]) || []); const [read, setRead] = useState(() => readsFor(sections.length)); const [active, setActive] = useState("");
  const [png, setPng] = useState(null); const [typed, setTyped] = useState(""); const [useTyped, setUseTyped] = useState(false); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [printing, setPrinting] = useState(false); const [ibanCopied, setIbanCopied] = useState(false);
  const pages = useRef(null); const scroller = useRef(null);
  useEffect(() => { if (developer) { const r = document.documentElement.style; r.setProperty("--brand", developer.brand.primary); r.setProperty("--brand-deep", developer.brand.deep); r.setProperty("--brand-soft", developer.brand.soft); r.setProperty("--brand-text", developer.brand.text); document.title = (order ? order.id : "") + " — " + L("Agreement", "العقد"); } }, [developer]);
  // Read tracking. Nothing is reported or counted until the pagination has settled (fonts and images loaded) — there is no
  // time-based fallback, because sheets laid out with fallback fonts can break differently. Only sheets on screen count: a
  // page is read once at least half of what fits of it stayed in view for a moment. The page list (p1…pN) and every read go
  // to the server with the page count, and signing needs every page of one pagination read in this language.
  const [pageGen, setPageGen] = useState(0); const [settled, setSettled] = useState(false); const [slow, setSlow] = useState(false);
  useEffect(() => {
    const f = (e) => { if (e.detail && e.detail.settled) setSettled(true); setPageGen((x) => x + 1); };
    window.addEventListener("ag-paginated", f); const t = setTimeout(() => setSlow(true), 20000);   // still loading after 20 s: offer a reload
    return () => { window.removeEventListener("ag-paginated", f); clearTimeout(t); };
  }, []);
  useEffect(() => {
    if (phase !== "read" || !settled || !pages.current) return;
    const els = [...pages.current.querySelectorAll(".ag-sheet, .doc-page")]; els.forEach((el, i) => { el.id = "p" + (i + 1); }); const ids = els.map((e) => e.id);
    if (!ids.length) return;
    setSections(ids); setRead(readsFor(ids.length)); R.markSectionRead(code, null, ids, lang);
    const timers = new Map(); const DWELL = 500;
    const mark = (id) => setRead((s) => { if (s.has(id)) return s; const n = new Set(s); n.add(id); R.markSectionRead(code, id, ids, lang); return n; });
    const io = new IntersectionObserver((entries) => { entries.forEach((e) => {
      const el = e.target; const id = el.id; const rb = e.rootBounds; const h = e.boundingClientRect.height;
      const shown = el.isConnected && h > 120 && rb && e.isIntersecting && e.intersectionRect.height >= Math.min(h, rb.height) * 0.5;
      if (shown) { setActive(id); if (!timers.has(id)) timers.set(id, setTimeout(() => { timers.delete(id); if (el.isConnected) mark(id); }, DWELL)); }
      else if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); }
    }); }, { root: pages.current.closest(".ag-zoom") || scroller.current, threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
    els.forEach((el) => io.observe(el));
    return () => { io.disconnect(); timers.forEach((t) => clearTimeout(t)); };
  }, [phase, lang, !!ctx, pageGen, settled]);
  useEffect(() => { pages.current && [...pages.current.querySelectorAll(".ag-sheet, .doc-page")].forEach((el) => el.classList.toggle("on", el.id === active)); }, [active]);
  const jump = (id) => { const el = document.getElementById(id); const root = pages.current && pages.current.closest(".ag-zoom"); if (!el || !root) return; const k = parseFloat(getComputedStyle(root.querySelector(".ag-fit-inner") || root).getPropertyValue("--ag-s")) || 1; root.scrollTo({ top: el.offsetTop * k + 4, behavior: "smooth" }); };
  const requireAll = R.settings(project).requireReadAll; const allRead = sections.length > 0 && sections.every((id) => read.has(id)); const canSign = !requireAll || allRead;
  const sig = order ? R.signatureFor(order.id) : null;

  const doSign = async () => { setBusy(true); setErr(null); try { await R.sign(code, { signatureData: useTyped ? null : png, typedName: useTyped ? typed : null, consent, termsVersion: order.agreement ? String(order.agreement.version) : null, hash: order.contractHash || null }); setG(R.getSigning(code)); setPhase("signed"); } catch (e) { setErr(errMsg(e)); if (e && e.code === "AGREEMENT_CHANGED") setTimeout(() => location.reload(), 2500); } finally { setBusy(false); } };
  const doPrint = () => { const after = () => { setPrinting(false); window.removeEventListener("afterprint", after); }; window.addEventListener("afterprint", after); setPrinting(true); setTimeout(() => window.print(), 400); };

  if (!g || !order || !developer || !ctx) return <Problem developer={developer} rep={rep} title={L("This link isn't valid", "هذا الرابط غير صالح")} body={L("Check the link you received, or ask your sales rep for a new one.", "تأكد من الرابط أو اطلب رابطا جديدا من مندوب المبيعات.")} />;
  if (g.status === "revoked" && phase !== "signed") return <Problem developer={developer} rep={rep} title={L("This signing link was withdrawn", "تم إلغاء رابط التوقيع")} body={L("Ask " + repName + " to send you a new one.", "اطلب رابطا جديدا من " + repName + ".")} />;
  if (g.status === "expired" && phase !== "signed") return <Problem developer={developer} rep={rep} title={L("This signing link has expired", "انتهت صلاحية رابط التوقيع")} body={L("It was valid until " + R.fmtUntil(g.validUntil, false) + ". Ask " + repName + " to send a new one.", "كان الرابط صالحا حتى " + R.fmtUntil(g.validUntil, true) + ". اطلب رابطا جديدا من " + repName + ".")} />;
  if (order.status !== "issued" && phase !== "signed") return <Problem developer={developer} rep={rep} title={L("This agreement isn't open for signing", "هذا العقد غير متاح للتوقيع حاليا")} body={L("Please contact ", "تواصل مع ") + repName + "."} />;
  const units = order.unitNumbers || [order.unitNumber]; const total = (order.unitPrice || 0) + (order.furnishCost || 0); const unitsLabel = units.length > 1 ? units.length + " " + L("units", "وحدات") : units[0];
  const agreement = <div className="rs-pages ag-doc-wrap" dir={AR ? "rtl" : "ltr"}>{FullAgreement(ctx)}</div>;

  if (phase === "signed") return <><Shell developer={developer} scroller={scroller}>
    <div className="pw-body no-print" style={{ gap: 16 }}>
      <div className="pw-center"><span className="pw-ok">✓</span><h2>{L("Agreement signed", "تم توقيع العقد")}</h2><div className="pw-eye">{order.id} · {fmt(sig ? sig.signedAt : order.signedAt)}</div><p className="pw-hint" style={{ maxWidth: 320, margin: 0 }}>{units.length > 1 ? L("Units " + units.join(", ") + " are now reserved for you. You and " + TX(developer, "name") + " hold the same sealed copy.", "الوحدات " + units.join("، ") + " محجوزة لك الآن، ولديك أنت و" + TX(developer, "name") + " النسخة المختومة نفسها.") : L("Unit " + units[0] + " is now reserved for you. You and " + TX(developer, "name") + " hold the same sealed copy.", "الوحدة " + units[0] + " محجوزة لك الآن، ولديك أنت و" + TX(developer, "name") + " النسخة المختومة نفسها.")}</p></div>
      <div className="pw-row"><button className="pw-cta wide" onClick={doPrint}>{L("Download PDF", "تنزيل PDF")}</button>{navigator.share && <button className="pw-ghost" style={{ flex: "none" }} onClick={() => navigator.share({ title: order.id, url: location.href })}>{L("Share", "مشاركة")}</button>}</div>
      <div className="pw-list"><div style={{ alignItems: "flex-start", gap: 12, justifyContent: "flex-start" }}><span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, flex: "none" }}>1</span><span style={{ flex: 1, minWidth: 0 }}><b>{L("Next: first payment", "الخطوة التالية: الدفعة الأولى")}</b>
        {(() => { const pay = R.paymentDue(order, project); if (!pay) return <div className="pw-hint">{L("Your sales rep sends you the payment details.", "يرسل لك مندوب المبيعات تفاصيل الدفع.")}</div>;
          const note = AR ? (pay.noteAr || pay.note) : (pay.note || pay.noteAr);
          return <>
            <div className="pw-steps" style={{ fontSize: 13, marginTop: 8 }}>
              {pay.amount ? <><span>{L("Amount", "المبلغ")}</span><b>SAR {D.fmtSAR(pay.amount)} <span className="pw-hint">· {pay.pct}% {L("of", "من")} SAR {D.fmtSAR(pay.total)}</span></b></> : null}
              {pay.days ? <><span>{L("Pay within", "السداد خلال")}</span><b>{R.daysText(pay.days, AR)}</b></> : null}
              <span>{L("Bank", "البنك")}</span><b>{AR ? (pay.bankAr || pay.bank) : (pay.bank || pay.bankAr)}</b>
              <span>{L("Account name", "اسم الحساب")}</span><b>{pay.holder}</b>
              <span>IBAN</span><b dir="ltr" style={{ fontFamily: "var(--font-mono)", textAlign: AR ? "right" : "left" }}>{R.fmtIban(pay.iban)}</b>
              <span>{L("Reference", "المرجع")}</span><b>{order.id}</b>
            </div>
            {note && <div className="pw-hint" style={{ marginTop: 6 }}>{note}</div>}
            <div className="pw-row" style={{ marginTop: 8 }}><button className="pw-pill" onClick={() => { try { navigator.clipboard.writeText(pay.iban); } catch { /* copy is a convenience */ } setIbanCopied(true); setTimeout(() => setIbanCopied(false), 1500); }}>{ibanCopied ? L("Copied", "تم النسخ") : L("Copy IBAN", "نسخ الآيبان")}</button></div>
          </>; })()}</span></div></div>
      <div><div className="pw-eye" style={{ marginBottom: 8 }}>{L("Your agreement", "العقد")} · {unitsLabel} · SAR {D.fmtSAR(total)}</div><AgreementViewer>{agreement}</AgreementViewer><div className="pw-hint" style={{ textAlign: "center", marginTop: 6 }}>{L("Pinch to zoom · scroll inside to turn pages", "قرب بإصبعيك للتكبير · مرر داخل الإطار لتقليب الصفحات")}</div></div>
      <details className="card card-pad" style={{ padding: 0 }}><summary style={{ cursor: "pointer", padding: "14px 16px", fontWeight: 600, fontSize: 14, listStyle: "none", display: "flex", justifyContent: "space-between" }}><span>{L("Signatures", "التوقيعات")}</span><span className="pw-hint">+</span></summary><div style={{ padding: "0 16px 16px" }}><SigBlocks developer={signer} order={order} sig={sig} /></div></details>
      {sig && <details className="card card-pad" style={{ padding: 0 }}><summary style={{ cursor: "pointer", padding: "14px 16px", fontWeight: 600, fontSize: 14, listStyle: "none", display: "flex", justifyContent: "space-between" }}><span>{L("Signature certificate", "شهادة التوقيع")}</span><span className="pw-hint">+</span></summary><div style={{ padding: "0 16px 16px" }}><Certificate order={order} sig={sig} developer={signer} code={g.code} bare /></div></details>}
    </div></Shell>
    {printing && createPortal(<div className="print-doc">{FullAgreement(ctx)}</div>, document.body)}
  </>;

  if (phase === "sign") return <Shell developer={developer} scroller={scroller}>
    <div className="pw-head"><div className="pw-eye">{L("Agreement", "العقد")} {order.id} · {L("all " + R.pagesText(sections.length, false) + " read", "تمت قراءة " + R.pagesText(sections.length, true) + " كلها")}</div><h2>{L("Sign the agreement", "توقيع العقد")}</h2></div>
    <div className="pw-body" style={{ gap: 14 }}>
      <div className="card card-pad"><SigBlocks developer={signer} order={order} sig={null} /></div>
      <div className="pw-between"><span className="pw-eye">{useTyped ? L("Type your full name", "اكتب اسمك الكامل") : L("Draw your signature", "ارسم توقيعك")}</span><button className="pw-pill" style={{ minHeight: 28 }} onClick={() => setUseTyped(!useTyped)}>{useTyped ? L("Draw instead", "الرسم بدلا من ذلك") : L("Type my name instead", "كتابة الاسم بدلا من ذلك")}</button></div>
      {useTyped ? <input className="pw-input" style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 22, minHeight: 64 }} placeholder={order.customer && order.customer.fullName} value={typed} onChange={(e) => setTyped(e.target.value)} /> : <SignaturePad onChange={setPng} />}
      <label className="pw-row" style={{ alignItems: "flex-start", fontSize: 13 }}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} /><span>{L("I have read all " + R.pagesText(sections.length, false) + " and agree to be bound by this agreement. I understand my electronic signature has the same effect as a handwritten one.", "قرأت " + R.pagesText(sections.length, true) + " كلها وأوافق على الالتزام بهذا العقد، وأقر بأن توقيعي الإلكتروني له نفس أثر التوقيع بخط اليد.")}</span></label>
      {err && <p style={{ color: "var(--alert)", fontSize: 13, margin: 0 }}>{err}</p>}
    </div>
    <div className="pw-foot" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}><div className="pw-row"><button className="pw-ghost" onClick={() => setPhase("read")}>{AR ? "›" : "‹"}</button><button className="pw-cta wide" style={{ minHeight: 52 }} disabled={busy || !consent || (useTyped ? typed.trim().length < 3 : !png)} onClick={doSign}>{L("Sign agreement", "توقيع العقد")}</button></div><span className="pw-hint" style={{ textAlign: "center" }}>{L("Recorded with date, time, device and consent, locked to this document's fingerprint.", "يسجل التوقيع مع التاريخ والوقت والجهاز والموافقة، ويرتبط ببصمة هذا المستند.")}</span></div>
  </Shell>;

  const doneCount = sections.filter((id) => read.has(id)).length;
  return <Shell developer={developer} scroller={scroller} white right={<button className="pw-pill" onClick={() => window.I18N && window.I18N.setLang(AR ? "en" : "ar")}>{AR ? "EN" : "عربي"}</button>}>
    <div className="pw-tabs">{sections.map((id, i) => <button key={id} className={"pw-pill" + (active === id ? " on" : "")} style={{ flex: "none", minHeight: 30, background: read.has(id) && active !== id ? "var(--bg-sunken)" : undefined }} onClick={() => jump(id)}>{read.has(id) ? "✓ " : ""}{L("Page", "صفحة")} {i + 1}</button>)}</div>
    <div className="pw-body" style={{ gap: 14, paddingTop: 18 }}>
      <div><div className="pw-eye">{L("Agreement", "العقد")} {order.id}{order.agreement ? " · v" + order.agreement.version : ""}{settled ? " · " + R.pagesText(sections.length, AR) : ""}</div><h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1.15, fontWeight: 500, margin: "4px 0 0" }}>{L("Purchase & Investment Agreement", "عقد الشراء والاستثمار")}</h2><div className="pw-hint">{TX(developer, "name")} · {order.customer && order.customer.fullName} · {unitsLabel} · SAR {D.fmtSAR(total)}</div></div>
      <AgreementViewer innerRef={pages}>{agreement}</AgreementViewer>
      <div className="card card-pad"><SigBlocks developer={signer} order={order} sig={null} /></div>
    </div>
    <div className="pw-foot"><div className="pw-grow"><div className="pw-hint">{!settled ? <>{L("Preparing the pages… reading counts once the agreement has fully loaded.", "جار تجهيز الصفحات… تحتسب القراءة بعد اكتمال تحميل العقد.")}{slow && <button className="pw-pill" style={{ minHeight: 26, marginInlineStart: 8 }} onClick={() => location.reload()}>{L("Reload", "إعادة التحميل")}</button>}</> : L("Read " + doneCount + " of " + sections.length + " pages", "تمت قراءة " + doneCount + " من " + sections.length + " صفحات")}</div><div style={{ height: 4, background: "var(--bg-tint)", borderRadius: 2, marginTop: 6 }}><div style={{ width: Math.round((doneCount / Math.max(1, sections.length)) * 100) + "%", height: 4, background: "var(--brand)", borderRadius: 2 }} /></div></div><button className="pw-cta" disabled={!canSign || !settled} onClick={() => setPhase("sign")}>{canSign ? L("Sign", "توقيع") : L("Sign · after reading", "التوقيع بعد القراءة")}</button></div>
  </Shell>;
}
export default SignApp;
export { SignApp, Certificate, SigBlocks };
