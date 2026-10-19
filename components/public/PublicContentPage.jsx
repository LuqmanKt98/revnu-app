"use client";
// Why Us and How It Works — ported from the client's original site (src/components/public-content-page.tsx).
// Same copy, sections and calculator maths. The language comes from the revnu_lang cookie (read by the page on the
// server) and switches through window.I18N, exactly like the landing page and the portals.
import Link from "next/link";
import { useEffect, useState } from "react";
import "./public.css";

// Icons (lucide shapes, inline so no icon package is needed)
const I = ({ children, ...p }) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>;
const ArrowRight = (p) => <I {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></I>;
const Check = (p) => <I {...p}><path d="M20 6 9 17l-5-5" /></I>;
const ChevronDown = (p) => <I {...p}><path d="m6 9 6 6 6-6" /></I>;
const Menu = (p) => <I {...p}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></I>;
const Globe = (p) => <I {...p}><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></I>;
const Building2 = (p) => <I {...p}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></I>;
const UsersRound = (p) => <I {...p}><path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" /></I>;
const KeyRound = (p) => <I {...p}><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" /><circle cx="16.5" cy="7.5" r=".5" fill="currentColor" /></I>;
const CircleDollarSign = (p) => <I {...p}><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" /></I>;

const WHY = [
  {
    icon: Building2,
    label: ["The developer", "المطور"],
    title: ["More value from every unit you already sell.", "قيمة أكبر من كل وحدة تبيعها بالفعل."],
    copy: ["Add furnishing, smart-home services and operating income without changing your existing sales journey.", "أضف الأثاث والمنزل الذكي ودخل التشغيل دون تغيير رحلة المبيعات الحالية."],
    points: [["Additional margin on every signed unit", "هامش إضافي على كل وحدة موقعة"], ["Recurring participation after handover", "مشاركة مستمرة بعد التسليم"], ["Your brand, URL and contracts stay visible", "تبقى علامتك ورابطك وعقودك في الواجهة"]],
  },
  {
    icon: UsersRound,
    label: ["The sales team", "فريق المبيعات"],
    title: ["A larger deal that is easier to explain.", "صفقة أكبر وأسهل في الشرح."],
    copy: ["A guided sales journey brings the unit, furnishing and operation into one clear conversation.", "تجمع رحلة البيع الموجهة الوحدة والأثاث والتشغيل في محادثة واحدة واضحة."],
    points: [["More commission from the same opportunity", "عمولة أكبر من نفس الفرصة"], ["One sitting, one journey and one signature", "جلسة واحدة ورحلة واحدة وتوقيع واحد"], ["Live pricing from the developer's setup", "أسعار مباشرة من إعدادات المطور"]],
  },
  {
    icon: KeyRound,
    label: ["The buyer", "المشتري"],
    title: ["A ready home with an earning plan from day one.", "منزل جاهز وخطة دخل من اليوم الأول."],
    copy: ["Buyers access developer-scale furnishing and choose how the property should operate after handover.", "يحصل المشترون على أسعار أثاث بحجم المطور ويختارون طريقة تشغيل العقار بعد التسليم."],
    points: [["Curated furnishing at scale", "أثاث مختار بأسعار تنافسية"], ["Daily, monthly or long-term operation", "تشغيل يومي أو شهري أو طويل المدى"], ["A complete contract pack in one meeting", "حزمة عقود متكاملة في اجتماع واحد"]],
  },
];

const STEPS = [
  ["We onboard your business", "نجهّز أعمالك", "One workshop captures your projects, units, designs, packages, contracts and brand.", "ورشة واحدة لجمع مشاريعك ووحداتك وتصاميمك وباقاتك وعقودك وعلامتك."],
  ["Your team signs in", "يسجل فريقك الدخول", "Sales representatives and managers enter your branded workspace with the right access.", "يدخل مندوبو المبيعات والمديرون إلى مساحتك بعلامتك وبالصلاحيات المناسبة."],
  ["The buyer chooses", "يختار المشتري", "Your team guides the buyer through the unit, design, furnishing, smart home and operating plan.", "يرشد فريقك المشتري لاختيار الوحدة والتصميم والأثاث والمنزل الذكي وخطة التشغيل."],
  ["Everything is signed together", "يتم توقيع كل شيء معًا", "The complete contract pack is generated under your letterhead and prepared for signature.", "تُنشأ حزمة العقود الكاملة باسمك وتُجهّز للتوقيع."],
  ["Delivery becomes visible", "تصبح مرحلة التنفيذ واضحة", "Furnishing, operation, collections and payouts stay visible to the teams responsible for them.", "يبقى الأثاث والتشغيل والتحصيل والمدفوعات واضحًا للفرق المسؤولة عنها."],
];

/** The shared language switch (cookie + revnu_lang, then a reload so the server renders the new direction). */
function setLang(l) {
  if (typeof window !== "undefined" && window.I18N && window.I18N.setLang) return window.I18N.setLang(l);
  try { document.cookie = "revnu_lang=" + l + "; path=/; max-age=31536000; samesite=lax"; localStorage.setItem("revnu_lang", l); } catch { /* the reload still applies the cookie when it was set */ }
  location.reload();
}

function UpsideCalculator({ ar }) {
  const [price, setPrice] = useState(2_000_000);
  const [units, setUnits] = useState(40);
  const [furnishingPercent, setFurnishingPercent] = useState(10);
  const format = (value) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
  const furnishing = price * (furnishingPercent / 100);
  const developerFurnishing = furnishing * 0.08;
  const annualGross = price * 0.0004 * 365 * 0.72;
  const developerOperations = annualGross * 0.22 * 0.06;
  const agentCommission = furnishing * 0.01;
  const customerNet = annualGross * 0.78;
  const quarterlyRevenue = (developerFurnishing + developerOperations) * units;
  const outputs = [
    [ar ? "المطور" : "DEVELOPER", ar ? "هامش الأثاث لكل وحدة" : "Furnishing margin per unit", developerFurnishing, ar ? "ر.س" : "SAR"],
    [ar ? "المطور" : "DEVELOPER", ar ? "حصة دخل التشغيل سنويًا" : "Operating-revenue share / yr", developerOperations, ar ? "ر.س / سنة" : "SAR / YR"],
    [ar ? "مندوب المبيعات" : "AGENT", ar ? "عمولة إضافية لكل وحدة مباعة" : "Extra commission per closed unit", agentCommission, ar ? "ر.س" : "SAR"],
    [ar ? "العميل" : "CUSTOMER", ar ? "صافي الدخل السنوي للمالك" : "Annual net to owner (avg)", customerNet, ar ? "ر.س" : "SAR"],
  ];

  return (
    <section className="public-calculator" id="calc" aria-labelledby="upside-title">
      <header className="public-calculator-heading">
        <div className="public-eyebrow">{ar ? "شاهد العائد" : "SEE THE UPSIDE"}</div>
        <h2 id="upside-title">{ar ? "أدخل أرقام مشروعك.. وشاهد الفرق بنفسك." : "Enter your project numbers.. and see the difference for yourself."}</h2>
        <p>{ar ? "حرّك المؤشرات — تتحدث الأرقام أدناه مباشرة باستخدام الحسابات الفعلية للمنصة في صفقة تطوير نموذجية." : "Drag the sliders — the numbers below recalculate live, using the platform’s actual math on a typical developer deal."}</p>
      </header>
      <div className="public-calculator-panel">
        <div className="public-calculator-inputs">
          <h3>{ar ? "مشروعك القادم" : "Your next project"}</h3>
          <p>{ar ? "تقدير مبسط مبني على إعدادات المنصة النموذجية. الأرقام استرشادية ويتم ضبطها لمشروعك عند الانضمام." : "A back-of-envelope estimate based on typical platform settings. Figures are indicative and configured for your project during onboarding."}</p>
          <label>
            <span>{ar ? "متوسط سعر الوحدة" : "Avg unit price"}<strong>{format(price)} {ar ? "ر.س" : "SAR"}</strong></span>
            <input type="range" min="100000" max="6000000" step="50000" value={price} onChange={(event) => setPrice(Number(event.target.value))} />
          </label>
          <label>
            <span>{ar ? "الوحدات المباعة كل ربع سنة" : "Units sold per quarter"}<strong>{format(units)}</strong></span>
            <input type="range" min="5" max="200" step="1" value={units} onChange={(event) => setUnits(Number(event.target.value))} />
          </label>
          <label>
            <span>{ar ? "الأثاث كنسبة من سعر الوحدة" : "Furnishing as % of unit price"}<strong>{furnishingPercent.toFixed(1)}%</strong></span>
            <input type="range" min="4" max="15" step="0.5" value={furnishingPercent} onChange={(event) => setFurnishingPercent(Number(event.target.value))} />
          </label>
        </div>
        <div className="public-calculator-results">
          {outputs.map(([who, label, value, unit]) => (
            <div className="public-calculator-result" key={label}>
              <div><span>{who}</span>{label}</div>
              <strong>{format(value)} <small>{unit}</small></strong>
            </div>
          ))}
          <div className="public-calculator-total">
            <span>{ar ? "دخل المطور الإضافي · هذا الربع" : "Developer additional revenue · this quarter"}</span>
            <strong>{format(quarterlyRevenue)} {ar ? "ر.س" : "SAR"}</strong>
          </div>
          <p className="public-calculator-fine">{ar ? "الأرقام استرشادية · يتم ضبطها لكل مطور عند الانضمام" : "Figures are indicative · configured per developer during onboarding"}</p>
        </div>
      </div>
    </section>
  );
}

function PublicHeader({ active, ar }) {
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => {
    if (!langOpen) return;
    const close = () => setLangOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [langOpen]);
  return (
    <header className="public-nav">
      <a href="/" className="public-brand" aria-label="Revnu home">
        <span className="public-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="42" fill="none" stroke="currentColor" strokeWidth="14" /><circle cx="100" cy="100" r="18" fill="currentColor" /></svg>
        </span>
        <span className="public-brand-word">Revnu</span>
      </a>
      <nav className={`public-links${open ? " open" : ""}`} aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
        <Link href="/why-us" className={active === "why-us" ? "active" : undefined}>{ar ? "لماذا نحن" : "Why Us"}</Link>
        <Link href="/how-it-works" className={active === "how-it-works" ? "active" : undefined}>{ar ? "كيف نعمل" : "How It Works"}</Link>
        <a href="/#request">{ar ? "اطلب عرضًا" : "Request demo"}</a>
        <a href="/auth" className="public-signin">{ar ? "تسجيل الدخول" : "Sign in"}<ArrowRight /></a>
        <div className="public-mobile-languages">
          <button type="button" className={"public-btn" + (ar ? " active" : "")} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" className={"public-btn" + (!ar ? " active" : "")} onClick={() => setLang("en")}>English</button>
        </div>
      </nav>
      <div className="public-actions">
        <div className="public-lang-wrap">
          <button type="button" className="public-btn public-lang" aria-haspopup="listbox" aria-expanded={langOpen} onClick={(event) => { event.stopPropagation(); setLangOpen((value) => !value); }}>
            <Globe />{ar ? "العربية" : "English"}<ChevronDown />
          </button>
          {langOpen ? (
            <div className="public-lang-menu" role="listbox" aria-label={ar ? "اللغة" : "Language"}>
              <button type="button" role="option" aria-selected={ar} className={`ar-label${ar ? " active" : ""}`} onClick={() => { setLangOpen(false); if (!ar) setLang("ar"); }}>
                العربية{ar ? <Check /> : null}
              </button>
              <button type="button" role="option" aria-selected={!ar} className={ar ? "" : "active"} onClick={() => { setLangOpen(false); if (ar) setLang("en"); }}>
                English{ar ? null : <Check />}
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" className="public-btn public-menu" aria-label={ar ? "القائمة" : "Menu"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <Menu />
        </button>
      </div>
    </header>
  );
}

function PublicFooter({ ar }) {
  return (
    <footer className="public-footer">
      <span>© 2026 Revnu</span>
      <div><Link href="/why-us">{ar ? "لماذا نحن" : "Why Us"}</Link><Link href="/how-it-works">{ar ? "كيف نعمل" : "How It Works"}</Link></div>
    </footer>
  );
}

export default function PublicContentPage({ page, lang }) {
  const ar = lang === "ar";
  const pick = (value) => value[ar ? 1 : 0];
  const isWhy = page === "why-us";

  return (
    <div className="public-page" dir={ar ? "rtl" : "ltr"} lang={lang}>
      <PublicHeader active={page} ar={ar} />
      <main>
        <section className="public-hero">
          <div className="public-eyebrow">{isWhy ? (ar ? "لماذا ريفنو" : "WHY REVNU") : (ar ? "من الاتفاق إلى الدخل" : "FROM DEAL TO INCOME")}</div>
          <h1>{isWhy ? (ar ? "منصة واحدة صُممت لينجح الجميع." : "One platform, designed so everyone wins.") : (ar ? "كيف تعمل ريفنو" : "How Revnu Works")}</h1>
          <p>{isWhy ? (ar ? "نربط المطور وفريق المبيعات والمشتري في رحلة واحدة تحقق قيمة أكبر دون تعقيد العملية." : "We align the developer, sales team and buyer in one journey that creates more value without adding complexity.") : (ar ? "نحوّل الوحدة من منتج عقاري إلى منزل مجهز وقابل للتشغيل ضمن رحلة واحدة تحمل علامتك." : "We turn a property unit into a furnished, operable home through one connected journey under your brand.")}</p>
        </section>

        {isWhy ? (
          <section className="public-content-grid" aria-label={ar ? "فوائد ريفنو" : "Revnu benefits"}>
            {WHY.map((item, index) => {
              const Icon = item.icon;
              return (
                <article className="public-benefit" key={item.label[0]}>
                  <div className="public-benefit-top"><span>0{index + 1}</span><Icon /></div>
                  <div className="public-eyebrow">{pick(item.label)}</div>
                  <h2>{pick(item.title)}</h2>
                  <p>{pick(item.copy)}</p>
                  <ul>{item.points.map((point) => <li key={point[0]}><Check />{pick(point)}</li>)}</ul>
                </article>
              );
            })}
          </section>
        ) : (
          <>
            <section className="public-steps" aria-label={ar ? "خطوات العمل" : "How it works steps"}>
              {STEPS.map((step, index) => (
                <article className="public-step" key={step[0]}>
                  <div className="public-step-number">{String(index + 1).padStart(2, "0")}</div>
                  <div><h2>{step[ar ? 1 : 0]}</h2><p>{step[ar ? 3 : 2]}</p></div>
                  <CircleDollarSign className="public-step-icon" />
                </article>
              ))}
            </section>
            <UpsideCalculator ar={ar} />
          </>
        )}

        <section className="public-cta">
          <div><div className="public-eyebrow">{ar ? "الخطوة التالية" : "NEXT STEP"}</div><h2>{ar ? "اجعل رحلة مبيعاتك تعمل أكثر." : "Make your sales journey work harder."}</h2></div>
          <a href="/auth">{ar ? "ابدأ مع ريفنو" : "Get started with Revnu"}<ArrowRight /></a>
        </section>
      </main>
      <PublicFooter ar={ar} />
    </div>
  );
}
