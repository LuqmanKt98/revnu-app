// =================================================================
//  Revnu i18n — global Arabic-first bilingual + RTL layer.
//  Loaded on every surface BEFORE the app scripts.
//
//  • Language is persisted in localStorage ("revnu_lang"), default "ar".
//  • On load it sets <html dir/lang> and a `lang-ar` class so the
//    stylesheet can switch the whole app to Almarai + RTL.
//  • window.I18N.t(key)        → UI-chrome string in the active language
//  • window.I18N.tx(obj, base) → bilingual CONTENT field: returns
//    obj[base+"Ar"] in Arabic when present, else obj[base].
//  • window.I18N.setLang(l)    → persist + reload (clean re-render).
//  • window.I18N.fmtNum / fmtDate honour the locale.
// =================================================================
(function () {
  const KEY = "revnu_lang";
  let lang = "ar";
  // The cookie is the source of truth (the server renders <html dir/lang> from it, so
  // there is no RTL flash); localStorage is kept as a mirror for older links.
  try {
    const m = document.cookie.match(/(?:^|;\s*)revnu_lang=(ar|en)/);
    lang = (m && m[1]) || localStorage.getItem(KEY) || "ar";
  } catch (e) {}
  const AR = lang === "ar";

  // ---- UI-chrome dictionary (extend as surfaces are localised) ----
  const DICT = {
    // generic
    "Save": "حفظ", "Cancel": "إلغاء", "Close": "إغلاق", "Edit": "تعديل", "Delete": "حذف",
    "Add": "إضافة", "Continue": "متابعة", "Back": "رجوع", "Search": "بحث", "All": "الكل",
    "Available": "متاحة", "Reserved": "محجوزة", "Sold": "مباعة", "Status": "الحالة",
    "Optional": "اختياري", "Mandatory": "إلزامي", "Include": "تضمين", "Skip": "تخطّي",
    "Print / PDF": "طباعة / PDF", "Download Word (.doc)": "تنزيل Word",
    "Sign out": "تسجيل الخروج", "Switch project": "تبديل المشروع",
    // sales steps
    "Customer": "العميل", "Unit": "الوحدة", "Units": "الوحدات", "Design": "التصميم",
    "Package": "الباقة", "Smart": "المنزل الذكي", "Smart home": "المنزل الذكي",
    "Operate": "التشغيل", "Operations": "التشغيل", "Calc": "الحاسبة", "Sign": "التوقيع",
    "Furnishing": "التأثيث", "Fit-out": "التجهيز الداخلي",
    "My deals": "صفقاتي", "My earnings": "أرباحي", "Inventory": "المخزون",
    "My team": "فريقي", "Support tickets": "تذاكر الدعم", "Walkthrough": "الدليل", "Support": "الدعم", "Organisation": "المنظمة", "Super Admin": "مدير عام", "Admin": "مدير", "Team": "عضو فريق",
    "Sales commissions": "عمولات المبيعات", "Sales Director": "مدير عام المبيعات", "Sales Manager": "مدير المبيعات",
    "Per-project commercials — the two-part operating fee, the sales commission, and the contract markup.": "شروط تجارية لكل مشروع — رسوم التشغيل المكوّنة من جزأين، وعمولة المبيعات، وهامش العقد.",
    "Project name": "اسم المشروع", "Project name *": "اسم المشروع *", "City": "المدينة", "Delivery": "التسليم",
    "Total units": "إجمالي الوحدات", "Total units in development *": "إجمالي الوحدات في المشروع *",
    "Operating cut from customer (Revnu, gross %)": "حصّة التشغيل من العميل (Revnu، إجمالي %)",
    "Operating cut back to developer (% of operator gross)": "حصّة التشغيل العائدة للمطوّر (% من إجمالي المشغّل)",
    "Shown to the buyer in the PM contract.": "تظهر للمشتري في عقد إدارة الأملاك.",
    "Developer's slice of the operator's gross. Not shown to the buyer.": "حصّة المطوّر من إجمالي المشغّل. لا تظهر للمشتري.",
    "Developer may skip this": "يمكن للمطوّر تخطّي هذا",
    "Design + package + smart steps": "خطوات التصميم والباقة والمنزل الذكي",
    "Design + package + smart-home steps": "خطوات التصميم والباقة والمنزل الذكي",
    "Design + package + smart-home": "التصميم والباقة والمنزل الذكي",
    "Turnkey fit-out add-on per package": "إضافة تجهيز داخلي متكامل لكل باقة",
    "Optional turnkey fit-out add-on per package": "إضافة تجهيز داخلي اختيارية متكاملة لكل باقة",
    "Smart-home tier sub-step": "خطوة فرعية لفئة المنزل الذكي",
    "Sub-step under furnishing": "خطوة فرعية ضمن التأثيث",
    "Ops model + calculator + PM contract": "نموذج التشغيل + الحاسبة + عقد الإدارة",
    "Ops + calculator + PM contract": "التشغيل + الحاسبة + عقد الإدارة",
    "BASIC INFO": "المعلومات الأساسية", "OPERATING FEE · TWO-PART": "رسوم التشغيل · جزأين",
    "PROJECT NAME": "اسم المشروع", "TOTAL UNITS": "إجمالي الوحدات",
    "OPERATING CUT FROM CUSTOMER (REVNU, GROSS %)": "حصّة التشغيل من العميل (REVNU، إجمالي %)",
    "OPERATING CUT BACK TO DEVELOPER (% OF OPERATOR GROSS)": "حصّة التشغيل العائدة للمطوّر (% من إجمالي المشغّل)",
    "FEATURES & SKIP RULES": "الميزات وقواعد التخطّي", "SALES & MARGIN": "المبيعات والهامش",
    "paymentPlans": "خطط الدفع", "smartHome": "المنزل الذكي", "operations": "التشغيل", "furnishing": "التأثيث", "fitout": "التجهيز الداخلي",
    "Sales commission": "عمولة المبيعات", "Sales commission (% of extras)": "عمولة المبيعات (% من الإضافات)",
    "Contract markup (developer)": "هامش العقد (المطوّر)",
    "Per closed deal — % of contract value, or a flat amount.": "لكل صفقة مغلقة — % من قيمة العقد، أو مبلغ ثابت.",
    "Added on top of the buyer's total — earned by the developer.": "يُضاف فوق إجمالي المشتري — يكسبه المطوّر.",
    "SALES COMMISSION & MARKUP": "عمولة المبيعات والهامش",
    "Project details, commercials & features": "تفاصيل المشروع والشروط التجارية والميزات",
    "Start new sale": "بدء عملية بيع", "+ New order": "+ طلب جديد",
    "Who is the buyer?": "من هو المشتري؟",
    "Pick units": "اختر الوحدات", "Choose a design style": "اختر نمط التصميم",
    "Choose a package": "اختر الباقة", "Smart-home layer": "طبقة المنزل الذكي",
    "Choose how it'll be operated": "اختر طريقة التشغيل", "Investment calculator": "حاسبة الاستثمار",
    "Review & sign the agreement": "مراجعة وتوقيع الاتفاقية", "Review & sign": "المراجعة والتوقيع",
    // misc labels
    "Project": "المشروع", "Projects": "المشاريع", "Orders": "الطلبات", "Order": "الطلب",
    "Developer": "المطوّر", "Developers": "المطوّرون", "Dashboard": "لوحة التحكم",
    "Revnu payments": "مدفوعات Revnu", "Developer payments": "مدفوعات المطوّرين",
    "Total": "الإجمالي", "Price": "السعر", "Floor": "الدور", "View": "الإطلالة",
    "Type": "النوع", "Tower": "البرج", "Area": "المساحة", "Bedrooms": "غرف النوم",
    // admin chrome
    "Pipeline": "خط العمليات", "Tenants": "المستأجرون", "Partners": "الشركاء", "Interested": "المهتمون",
    "All orders": "كل الطلبات", "Revnu Admin": "مدير Revnu", "Developer Admin": "مدير المطوّر",
    "Sales Rep": "مندوب مبيعات", "Production": "الإنتاج", "developers": "مطوّرون",
    "Cross-developer platform health": "صحة المنصّة عبر المطوّرين",
    "Active orders": "الطلبات النشطة", "Units in inventory": "الوحدات في المخزون",
    "Brand & onboarding": "الهوية والإعداد", "Team": "الفريق", "Settings": "الإعدادات",
    "Unit types": "أنواع الوحدات", "Contracts": "العقود", "Operating": "التشغيل",
    "Designs": "التصاميم", "Packages": "الباقات", "Revnu payment terms": "شروط الدفع لـ Revnu",
    "Outstanding": "المتبقّي", "Collected": "المُحصّل", "Paid": "مدفوع", "Due": "مستحق",
    "Mark paid": "تحديد كمدفوع", "+ Add unit": "+ إضافة وحدة", "+ New project": "+ مشروع جديد",
    "Export CSV": "تصدير CSV", "Bulk upload": "رفع مجمّع",
    "My earnings": "أرباحي", "Commission": "العمولة", "Pieces": "عدد القطع",
    "Warranty (years)": "الضمان (سنوات)", "Name (English)": "الاسم (إنجليزي)",
    "Activity by developer": "النشاط حسب المطوّر",
    "Save model": "حفظ النموذج", "Save tier": "حفظ الباقة", "Save design": "حفظ التصميم",
    "Save package": "حفظ الباقة", "Cancel": "إلغاء", "Discard": "تجاهل",
    "Sales team": "فريق المبيعات", "Users & roles": "المستخدمون والصلاحيات", "Financials": "المالية", "Inventory": "المخزون",
    "order statuses helper": "",
    "issued": "صدر العقد", "paid": "دفع العميل", "Contract issued": "صدر العقد", "Customer paid": "دفع العميل",
    // order statuses
    "draft": "مسودة", "review": "قيد المراجعة", "signed": "موقّعة", "active": "نشطة", "completed": "مكتملة",
    "available": "متاحة", "reserved": "محجوزة", "sold": "مباعة",
    // common buttons / headers
    "Mark as signed": "تحديد كموقّعة", "Mark as active": "تحديد كنشطة", "Mark as completed": "تحديد كمكتملة",
    "Customer": "العميل", "Created": "أُنشئت", "Extras": "الإضافات", "Actions": "إجراءات",
    "Milestone": "المرحلة", "Amount": "المبلغ", "Share": "الحصة", "Due next": "المستحق التالي",
    "Upcoming": "قادمة", "Settled": "مُسوّاة", "Payable": "المستحق", "Item": "البند",
    "Room": "الغرفة", "Qty": "الكمية", "Supplier": "المورّد", "Notes": "ملاحظات",
    // step eyebrows
    "BUYER": "المشتري", "AESTHETIC": "الطابع", "FURNISHING": "التأثيث", "SMART HOME": "المنزل الذكي",
    "OPERATIONS": "التشغيل", "WHAT-IF TOOL": "أداة المحاكاة", "PROJECTION": "الإسقاط",
    "REVIEW & SIGN": "المراجعة والتوقيع",
    // step titles + misc hardcoded
    "Pick units": "اختر الوحدات", "Smart-home layer": "طبقة المنزل الذكي",
    "Order submitted": "تم إرسال الطلب", "Floor plan": "المخطط", "3D render": "تصوير ثلاثي الأبعاد",
    "Masterplan": "المخطط العام", "View unit": "عرض الوحدة", "Switch project": "تبديل المشروع",
    "bed ·": "غرفة ·", "bath ·": "حمّام ·", "· base": "· الأساس", "units linked": "وحدة مرتبطة",
    "3D RENDER": "تصوير ثلاثي الأبعاد", "Replace": "استبدال", "Remove": "إزالة",
    "FLOOR PLAN": "المخطط", "Replaces the auto-drawn plan": "يستبدل المخطط المرسوم تلقائياً",
    "Click to upload": "انقر للرفع", "Upload": "رفع", "MASTERPLAN · LOCATION": "المخطط العام · الموقع",
    "Sea + corner": "بحر + زاوية", "Sea panorama": "إطلالة بحرية", "Sea + sunset": "بحر + غروب",
    "Corner · 270°": "زاوية · ٢٧٠°", "Full panorama": "إطلالة كاملة", "Top floor · corner": "الطابق العلوي · زاوية",
    "+ Add design style": "+ إضافة نمط تصميم", "3D INTERIOR": "تصميم داخلي ثلاثي الأبعاد",
    "+ New package": "+ باقة جديدة", "BOQ ·": "جدول الكميات ·", "lines": "بنود", "pieces": "قطعة",
    "-year warranty": "سنوات ضمان", "// FIT-OUT ADD-ON": "// إضافة التجهيز الداخلي", "-yr finishes": "سنوات للتشطيبات",
    "Fit-out BOQ ·": "جدول كميات التجهيز ·",
    "+ Add tier": "+ إضافة فئة", "2 smart speakers": "مكبّرا صوت ذكيان", "Security cameras": "كاميرات أمنية",
    "+ Add model": "+ إضافة نموذج", "Nightly": "ليلي", "Fee": "الرسوم", "Occ": "الإشغال", "Monthly+": "شهري+",
    "+ Upload template": "+ رفع نموذج", "sale": "بيع", "furnish": "تأثيث", "ops": "تشغيل", "kyc": "اعرف عميلك",
    "Sale": "بيع", "KYC": "اعرف عميلك", "Furnishing kit": "طقم التأثيث",
    "Sign out": "تسجيل الخروج", "Start new sale": "بدء عملية بيع جديدة", "Start new sale →": "بدء عملية بيع جديدة ←",
    "Sale only": "بيع فقط", "← My deals": "→ صفقاتي", "Single": "أعزب", "Married": "متزوج", "Other": "أخرى",
    "Annual net": "الصافي السنوي", "Nightly rate": "السعر الليلي", "Monthly rent": "الإيجار الشهري",
    // developers / projects (brand names)
    "Marsa Developments": "مرسى للتطوير", "North Ridge Holdings": "نورث ريدج القابضة",
    "Alia Estates": "عاليه العقارية", "Noor Khuzam": "نور خزام",
    "Marsa Cove Residences": "مساكن مرسى كوف", "Marsa Sky Towers": "أبراج مرسى سكاي",
    "North Vista": "نورث فيستا", "Alia Park": "حديقة عاليه", "Noor Gardens": "حدائق نور",
    // people (demo)
    "Abdullah Najjar": "عبدالله النجار", "Reem Al-Otaibi": "ريم العتيبي", "Talal Hakami": "طلال حكمي",
    "Yasmin Bakr": "ياسمين بكر", "Ahmed Al-Sayed": "أحمد السيد", "Yara Saif": "يارا سيف",
    "Fahd Al-Rashed": "فهد الراشد", "Noor Khaled": "نور خالد", "Lina Mahmoud": "لينا محمود",
    "Hessa Bin Saud": "حصة بن سعود", "Tariq Al-Harbi": "طارق الحربي", "Huda Al-Amoudi": "هدى العمودي",
    "Majed Al-Zahrani": "ماجد الزهراني", "Rashid Al-Amri": "راشد العمري", "Amal Khan": "أمل خان",
    // placeholders
    "name@domain.com": "name@domain.com",
    "Jeddah": "جدة", "Riyadh": "الرياض", "Dammam": "الدمام",
    // table headers
    "Projects": "المشاريع", "Units": "الوحدات", "Orders": "الطلبات", "Extras sold": "الإضافات المباعة",
    "Primary contact": "جهة الاتصال", "Brand": "الهوية", "Onboarded": "تاريخ الانضمام",
    "Unit #": "رقم الوحدة", "Tower / Floor": "البرج / الدور", "Base price": "السعر الأساسي",
    "Model": "النموذج", "Kind": "النوع", "Operator fee": "رسوم المشغّل", "Occupancy band": "نطاق الإشغال",
    "Ref": "المرجع", "Date": "التاريخ", "Next due": "الاستحقاق التالي",
    "Email": "البريد", "Role": "الدور", "Assigned projects": "المشاريع المعيّنة",
    "Template": "النموذج", "Parties": "الأطراف", "Version": "الإصدار", "Updated": "آخر تحديث",
    "Price adj": "تعديل السعر", "Phone": "الهاتف", "Company": "الشركة", "Project size": "حجم المشروع",
    "Submitted": "تاريخ الإرسال", "Schedule": "الجدول", "Discount / surcharge": "خصم / رسوم إضافية",
    "Order": "الطلب", "Name": "الاسم", "Rep": "المندوب",
    // content names (fallback for items without an explicit Arabic field)
    "Essential": "الأساسية", "Full Home": "المنزل الكامل", "Full Smart": "ذكي كامل",
    "Modern Minimal": "بسيط عصري", "Coastal Warm": "ساحلي دافئ", "Arabian Heritage": "تراث عربي",
    "Sky Modern": "سماء عصري", "Sky Warm": "سماء دافئ", "Riyadh Minimal": "رياض بسيط",
    "Park Family": "عائلي على الحديقة", "Luminous": "مُشرق", "Contemporary": "معاصر",
    "Daily / Airbnb": "يومي / إيربنب", "Monthly Rental": "إيجار شهري", "Long Lease (12mo+)": "إيجار طويل (12 شهراً+)",
    "Off": "بدون", "Tier I": "الفئة الأولى", "Tier II": "الفئة الثانية", "Tier III": "الفئة الثالثة",
    "Bespoke": "فاخر مخصّص", "Daily": "يومي", "Bulk upload CSV": "رفع ملف CSV",
    "Save": "حفظ", "Save design": "حفظ التصميم", "Save package": "حفظ الباقة", "Save tier": "حفظ الباقة", "Save model": "حفظ النموذج", "Save plan": "حفظ الخطة", "Discard": "تجاهل", "+ Add unit": "+ إضافة وحدة", "Export CSV": "تصدير CSV", "Bulk upload": "رفع مجمّع", "+ New project": "+ مشروع جديد", "Open project workspace": "فتح مساحة المشروع", "+ Add color": "+ إضافة لون", "Add": "إضافة", "+ New order": "+ طلب جديد",
    "Name": "الاسم", "Tagline": "الشعار النصّي", "CR Number": "السجل التجاري", "Subdomain": "النطاق الفرعي",
    "Primary": "الأساسي", "Deep / hover": "الغامق / التمرير", "Project name *": "اسم المشروع *",
    "City *": "المدينة *", "Delivery (qtr)": "التسليم (ربع)", "Delivery (year)": "التسليم (سنة)",
    "Total units in development *": "إجمالي الوحدات في المشروع *",
    "Customer ops fee (%)": "رسوم التشغيل للعميل (%)", "Developer share of ops fee (%)": "حصة المطوّر من رسوم التشغيل (%)",
    "Sales commission (% of extras)": "عمولة المبيعات (% من الإضافات)", "Developer markup on extras (%)": "هامش المطوّر على الإضافات (%)",
    "Mood / description (English)": "الوصف (إنجليزي)", "Tier": "الفئة", "Summary (English)": "الملخّص (إنجليزي)",
    "Summary": "الملخّص", "Warranty (yrs)": "الضمان (سنوات)", "Plan name": "اسم الخطة",
    "Discount (-) or surcharge (+) %": "خصم (-) أو رسوم (+) %", "Customer-facing note": "ملاحظة تظهر للعميل",
    "Tier name (English)": "اسم الباقة (إنجليزي)", "Set price (SAR)": "السعر الثابت (ريال)",
    "Delivery": "التسليم",
    "LEGAL ENTITY": "الكيان القانوني", "BRAND COLORS": "ألوان الهوية", "// COMMERCIALS": "// الشروط التجارية",
    "BASIC INFO": "المعلومات الأساسية", "DEFAULT RATE · PER UNIT TYPE": "السعر الافتراضي · لكل نوع وحدة",
    "PRICING · PER UNIT TYPE": "التسعير · لكل نوع وحدة", "PALETTE": "لوحة الألوان",
    "Units sold": "الوحدات المباعة", "Total payable to Revnu": "إجمالي المستحق لـ Revnu",
    "One-time payable to Revnu": "مستحق لمرة واحدة لـ Revnu", "Gross rent / mo": "إجمالي الإيجار شهرياً",
    "Mgmt fee collected": "رسوم الإدارة المُحصّلة", "Developer share": "حصة المطوّر", "Revnu share / mo": "حصة Revnu شهرياً",
    "Payable to Revnu": "المستحق لـ Revnu",
    "// REVNU MONEY FLOW": "// تدفّق أموال Revnu", "// REVNU PAYMENT TERMS": "// شروط الدفع لـ Revnu",
    "LOGO": "الشعار", "FEATURE TOGGLES · PER PROJECT": "مفاتيح الميزات · لكل مشروع", "// NEW PROJECT": "// مشروع جديد",
    "// FEATURE TOGGLES": "// مفاتيح الميزات", "// EDIT DESIGN": "// تعديل التصميم",
    "3D INTERIOR PICTURES": "صور داخلية ثلاثية الأبعاد", "MATERIALS": "الخامات", "// PACKAGE": "// الباقة",
    "FIT-OUT ADD-ON": "إضافة التجهيز", "FIT-OUT PRICE · FROM BOQ": "سعر التجهيز · من جدول الكميات",
    "// CONSTRUCTION MILESTONES FOR THIS PROJECT": "// مراحل البناء لهذا المشروع", "// PAYMENT PLAN": "// خطة الدفع",
    "// EDIT TIER": "// تعديل الباقة", "// EDIT OPERATING MODEL": "// تعديل نموذج التشغيل",
    "OUR ASSUMPTION · PER UNIT TYPE": "افتراضنا · لكل نوع وحدة",
    "// RECURRING · OPERATIONS REVENUE (MONTHLY)": "// متكرر · إيراد التشغيل (شهرياً)",
    "// BY DEVELOPER": "// حسب المطوّر", "DEVELOPER → REVNU PAYMENT": "دفعة المطوّر → Revnu",
    "DOCUMENT PACK": "حزمة المستندات", "// ONBOARD A NEW DEVELOPER": "// إعداد مطوّر جديد",
    "READY TO PROVISION": "جاهز للتفعيل", "OPERATING FEE · TWO-PART": "رسوم التشغيل · جزأين",
    "SALES COMMISSION & MARKUP": "عمولة المبيعات والهامش", "FEATURES & SKIP RULES": "الميزات وقواعد التخطّي",
    "// EDIT UNIT": "// تعديل الوحدة", "// ADD UNIT": "// إضافة وحدة", "Recent orders": "أحدث الطلبات",
    "// PROJECT": "// المشروع", "// ORDERS": "// الطلبات", "// EXTRAS SOLD": "// الإضافات المباعة",
    "// MONTHLY NET": "// الصافي الشهري", "// PROJECT WORKSPACE": "// مساحة المشروع",
    "// PACKAGE MIX · CLOSED DEALS": "// توزيع الباقات · الصفقات المغلقة",
    "// OPERATING MODEL · CLOSED DEALS": "// نموذج التشغيل · الصفقات المغلقة",
    "// SALES LEADERBOARD · THIS PROJECT": "// ترتيب المبيعات · هذا المشروع",
    "// ORDER STATUS FLOW": "// مسار حالة الطلب", "// LEADERBOARD": "// لوحة الترتيب",
    "Active units · monthly run-rate": "الوحدات النشطة · المعدّل الشهري", "// YOUR REVNU PAYMENT TERMS": "// شروط دفعك لـ Revnu",
    "furnishing + smart home": "التأثيث + المنزل الذكي", "before cost of goods": "قبل تكلفة البضاعة",
    "from active units' rental income": "من دخل إيجار الوحدات النشطة", "from project's contract-markup commercial": "من هامش العقد للمشروع",
    "from project's developer-share commercial": "من حصة المطوّر للمشروع", "onboarded": "تم الإعداد",
    "Revnu hub": "مركز Revnu", "Demo hub": "مركز العرض", "Negative discounts, positive surcharges.": "الخصومات سالبة والرسوم موجبة.",
    "Brand": "الهوية", "Customer view": "عرض العميل", "Owner": "المالك", "Buyer": "المشتري", "Seller": "البائع",
    "Powered by": "مُشغّل بواسطة", "Active units": "الوحدات النشطة", "In contract": "ضمن العقد",
    "Monthly net to owners": "الصافي الشهري للملّاك", "from active units": "من الوحدات النشطة",
    "Latest 5": "آخر 5", "View all →": "عرض الكل ←", "units in system": "وحدة في النظام",
    "available / reserved": "متاحة / محجوزة", "Recent orders": "أحدث الطلبات", "Pipeline value": "قيمة خط العمليات",
    "Closed this month": "أُغلقت هذا الشهر", "Conversion": "معدّل التحويل", "Avg deal size": "متوسّط حجم الصفقة",
    "Top performer": "الأفضل أداءً", "This month": "هذا الشهر", "All time": "كل الأوقات",
    "Rooms": "الغرف", "All": "الكل", "Coverage": "التغطية", "Sequencing": "التسلسل",
    "Finishes warranty": "ضمان التشطيبات", "Model": "النموذج", "Occupancy": "الإشغال",
    "Net to owner / yr": "الصافي للمالك سنوياً", "Gross yield": "العائد الإجمالي", "Payback": "فترة الاسترداد",
    "Draft": "مسودة", "Signed": "موقّعة", "Active": "نشطة", "Completed": "مكتملة", "Review": "قيد المراجعة",
    "Active deal": "صفقة نشطة", "Deal is live / in progress": "الصفقة جارية",
    "Issue contract": "إصدار العقد", "Mark signed": "تأكيد التوقيع", "Mark customer paid": "تأكيد دفع العميل",
    "Contract sent to customer for signing": "أُرسل العقد للعميل للتوقيع",
    "Signed contract uploaded — awaiting payment": "رُفع العقد الموقّع — بانتظار الدفع",
    "Customer paid — Revnu can invoice the developer": "دفع العميل — يمكن لـ Revnu فوترة المطوّر",
    "all": "الكل",
    "Every order created through the sales portal for this developer. Click a row to inspect and download the document pack.": "كل طلب أُنشئ عبر بوابة المبيعات لهذا المطوّر. انقر على صف للاطلاع وتنزيل حزمة المستندات.",
    "One-time payable to Revnu": "مستحق لمرة واحدة لـ Revnu", "Collected": "محصَّل",
    "Sales rep building the offer": "المندوب يجهّز العرض", "Customer signed — waiting for handover": "وقّع العميل — بانتظار التسليم",
    "Unit handed over, operating & paying out": "تم تسليم الوحدة، قيد التشغيل والتوزيع", "Operating term complete": "انتهت مدة التشغيل",
    "Monthly gross rental": "إجمالي الإيجار الشهري", "Extras sold (all time)": "الإضافات المباعة (كل الأوقات)",
    "furnishing + smart, all orders": "تأثيث + ذكي، كل الطلبات", "Per-unit breakdown": "تفصيل لكل وحدة",
    "Op. fee": "رسوم التشغيل", "Gross / mo": "الإجمالي / شهر", "Net to owner / mo": "الصافي للمالك / شهر",
    "Commission earned": "العمولة المكتسبة", "paid on extras only": "تُدفع على الإضافات فقط",
    "Smart-home attach": "إرفاق المنزل الذكي", "Avg extras / deal": "متوسّط الإضافات / صفقة",
    "Sales reps · extras performance": "المندوبون · أداء الإضافات", "Sort by": "ترتيب حسب",
    "Deals": "الصفقات", "Smart attach": "إرفاق ذكي", "Deals (closed / pipe)": "الصفقات (مغلقة / محتملة)",
    "Performance on the": "الأداء على", "extras": "الإضافات", "— furnishing & smart home.": "— التأثيث والمنزل الذكي.",
    "Commission is paid on extras only": "تُدفع العمولة على الإضافات فقط", ", not on the unit price.": "، وليس على سعر الوحدة.",
    "Download P&L": "تنزيل قائمة الدخل", "+ Invite user": "+ دعوة مستخدم", "matching": "مطابقة",
    "← My deals": "→ صفقاتي",
    "Full name · as in ID *": "الاسم الكامل · كما في الهوية *", "Full name · Arabic": "الاسم الكامل · بالعربية",
    "National ID / Iqama *": "الهوية الوطنية / الإقامة *", "Date of birth": "تاريخ الميلاد", "Mobile *": "الجوال *",
    "Marital status": "الحالة الاجتماعية", "Single": "أعزب", "Married": "متزوّج", "Other": "أخرى",
    "Source of funds": "مصدر التمويل", "Cash": "نقد", "Mortgage": "تمويل عقاري", "Mixed": "مختلط", "Corporate / SPV": "شركة / كيان",
    "Buyer data stays inside": "تبقى بيانات المشتري داخل", "'s tenant. Saudi PDPL compliant.": " — متوافق مع نظام حماية البيانات السعودي.",
    "Email *": "البريد الإلكتروني *", "City": "المدينة",
    "Unit price": "سعر الوحدة", "Design style": "نمط التصميم", "BOQ": "جدول الكميات", "BOQ lines": "بنود جدول الكميات",
    "// Preview BOQ · Appendix F-1": "// معاينة جدول الكميات · الملحق F-1",
    "// Preview fit-out BOQ · Appendix F-2 · itemised": "// معاينة جدول كميات التجهيز · الملحق F-2 · مُفصّل",
    "// OPTIONAL ADD-ON": "// إضافة اختيارية", "Scope": "النطاق", "Line total": "إجمالي البند",
    "Fit-out total (excl. VAT)": "إجمالي التجهيز (بدون ضريبة)", "Unit": "الوحدة",
    // rooms
    "Living": "المعيشة", "Living room": "غرفة المعيشة", "Bedroom": "غرفة النوم", "Kitchen": "المطبخ",
    "Bath": "الحمّام", "Dining": "الطعام", "Entry": "المدخل", "Master Bedroom": "غرفة النوم الرئيسية",
    "Balcony": "الشرفة", "Lounge": "الصالة", "Powder": "دورة مياه",
    "Second Bedroom": "غرفة النوم الثانية", "Third Bedroom": "غرفة النوم الثالثة", "Living Room": "غرفة المعيشة", "Bathroom": "الحمّام", "Smart Home & Tech": "المنزل الذكي والتقنية", "Outdoor / Balcony": "الشرفة", "General": "عام",
    // materials
    "Warm oak": "بلوط دافئ", "Bouclé": "بوكليه", "Travertine": "ترافرتين", "Smoked oak": "بلوط مدخّن",
    "Microcement": "مايكروسمنت", "Matte black steel": "فولاذ أسود مطفي", "Linen": "كتّان", "Wool": "صوف",
    "Bleached oak": "بلوط فاتح", "Black steel": "فولاذ أسود",
    // design moods
    "Warm woods, linen drapes, sea-blue accents.": "أخشاب دافئة وستائر كتّانية ولمسات زرقاء بحرية.",
    "Quiet, gallery-like. Negative space, one sculptural piece per room.": "هادئ كصالة عرض. فراغ متّسع، وقطعة نحتية واحدة لكل غرفة.",
    "Carved teak, mashrabiya screens, oud-warm tones.": "خشب ساج محفور، ومشربيات، ودرجات دافئة كالعود.",
    "Polished concrete, black steel, deep navy.": "خرسانة مصقولة، وفولاذ أسود، وكحلي غامق.",
    "Walnut, cream wool, brushed copper.": "جوز، وصوف كريمي، ونحاس مصقول.",
    "Clean lines, durable surfaces, neutral palette.": "خطوط نظيفة، وأسطح متينة، ولوحة ألوان محايدة.",
    "Soft, warm, kid-friendly. Built to last.": "ناعم ودافئ ومناسب للأطفال. مصنوع ليدوم.",
    "Quiet contemporary, parkside calm.": "معاصر هادئ بسكون الحدائق.",
    // design materials
    "Hand-knotted wool": "صوف معقود يدوياً", "Mashrabiya": "مشربية", "Carved teak": "خشب ساج محفور",
    "Inlaid brass": "نحاس مطعّم", "Whitewashed oak": "بلوط مبيّض", "Brushed brass": "نحاس مصقول",
    "Polished concrete": "خرسانة مصقولة", "Navy velvet": "مخمل كحلي", "Smoked glass": "زجاج مدخّن",
    "Walnut": "جوز", "Cream wool": "صوف كريمي", "Brushed copper": "نحاس مصقول", "Oak laminate": "بلوط لامينيت",
    "Steel": "فولاذ", "Glass": "زجاج", "Solid oak": "بلوط صلب", "Sisal": "سيزال",
    // room labels
    "MAJLIS": "مجلس", "Majlis": "مجلس", "Foyer": "بهو", "Study": "مكتب", "Family": "العائلة", "Stair": "الدرج",
    "Family room": "غرفة العائلة", "Kids room": "غرفة الأطفال", "Master Bedroom": "غرفة النوم الرئيسية",
    "Ensuite": "حمّام داخلي", "Powder / Study": "دورة مياه / مكتب", "Guest Bedroom": "غرفة الضيوف",
    // unit type names
    "1 Bedroom · Marina": "غرفة نوم · إطلالة مارينا", "2 Bedroom · Garden": "غرفتا نوم · إطلالة حديقة",
    "3 Bedroom · Horizon": "٣ غرف نوم · إطلالة أفق", "Penthouse · Skyline": "بنتهاوس · إطلالة بانورامية",
    "1 Bedroom · Sky": "غرفة نوم · سكاي", "2 Bedroom · Sky": "غرفتا نوم · سكاي",
    "Studio": "استوديو", "1 Bedroom": "غرفة نوم", "2 Bedroom · Park": "غرفتا نوم · إطلالة حديقة",
    "Lower floor": "الطابق السفلي", "Upper floor": "الطابق العلوي",
    // tiers
    "Tier I": "الفئة الأولى", "Tier II": "الفئة الثانية", "Tier III": "الفئة الثالثة",
    "Essential": "الأساسية", "Full Home": "المنزل الكامل", "Bespoke": "فاخر مخصّص",
    // package summaries
    "Move-in basics, tuned for short-term rental performance.": "أساسيات جاهزة للسكن، مهيّأة لأداء الإيجار قصير الأمد.",
    "Full kit: furniture, soft goods, kitchen, art, smart-home prep.": "طقم كامل: أثاث ومفروشات ومطبخ وأعمال فنية وتجهيز للمنزل الذكي.",
    "Designer-led, custom millwork, premium fabrics, on-site walkthrough included.": "بإشراف مصمّم، نجارة مخصّصة، أقمشة فاخرة، مع جولة تفقّدية ميدانية.",
    "Urban compact kit for short or monthly rental.": "طقم حضري مدمج للإيجار القصير أو الشهري.",
    "Full move-in pack, designed for the Sky towers.": "حزمة سكن كاملة، مصمّمة لأبراج سكاي.",
    "Compact, durable kit tuned for monthly rental.": "طقم مدمج ومتين مهيّأ للإيجار الشهري.",
    "Full move-in kit for long-stay tenants.": "طقم سكن كامل للمستأجرين طويلي الإقامة.",
    "Park-side living with a soft, family-warm palette.": "حياة بمحاذاة الحديقة بلوحة ألوان دافئة عائلية.",
    // fit-out summaries
    "Turnkey fit-out": "تجهيز متكامل جاهز",
    "Full interior fit-out — flooring, ceilings, joinery, paint and lighting, delivered before the furniture goes in.": "تجهيز داخلي كامل — أرضيات وأسقف ونجارة ودهان وإضاءة، يُسلّم قبل دخول الأثاث.",
    "Designer-led interior fit-out — engineered oak, gypsum ceilings with cove lighting, custom joinery and upgraded kitchen.": "تجهيز داخلي بإشراف مصمّم — بلوط هندسي وأسقف جبسية بإضاءة مخفية ونجارة مخصّصة ومطبخ مطوّر.",
    "Bespoke interior fit-out — wide-plank oak with marble inlay, multi-level ceilings, Venetian plaster and full custom millwork.": "تجهيز داخلي فاخر — بلوط عريض الألواح بطعوم رخامية وأسقف متعدّدة المستويات وجص فينيسي ونجارة مخصّصة بالكامل.",
    // ops summaries
    "Nightly rental, fully managed. Highest upside, more variance.": "إيجار ليلي بإدارة كاملة. أعلى عائد محتمل مع تذبذب أكبر.",
    "30+ day stays. Steady cashflow, smaller swings.": "إقامات 30 يوماً فأكثر. تدفّق نقدي ثابت بتذبذب أقل.",
    "Single tenant, 12-month minimum. Lowest fee.": "مستأجر واحد، 12 شهراً كحدّ أدنى. أقل رسوم.",
    "Daily / Airbnb": "يومي / إيربنب", "Monthly Rental": "إيجار شهري", "Long Lease (12mo+)": "إيجار طويل (12 شهراً+)",
    // calculator + ops figures
    "Nightly rate": "السعر الليلي", "Monthly rent": "الإيجار الشهري", "Occupancy": "الإشغال",
    "Annual net": "الصافي السنوي", "Net ROI / yr": "العائد الصافي / سنة", "Net ROI / year": "العائد الصافي / سنة",
    "Gross yield": "العائد الإجمالي", "Gross": "الإجمالي", "Net to owner": "الصافي للمالك", "Monthly net": "الصافي الشهري",
    "Operator fee": "رسوم المشغّل", "Payback": "فترة الاسترداد", "Total": "الإجمالي",
    "SCENARIO · WHAT-IF": "سيناريو · محاكاة", "PERFORMANCE · SCENARIO": "الأداء · سيناريو",
    "ANNUAL INCOME · SCENARIO": "الدخل السنوي · سيناريو", "TOTAL INVESTMENT": "إجمالي الاستثمار",
    "Investment horizon": "أفق الاستثمار", "What-if — not the contract": "محاكاة — ليست العقد",
    "Reset to our assumption": "إعادة إلى افتراضنا",
    "Furnishing (incl. VAT)": "التأثيث (شامل الضريبة)", "Fit-out (incl. VAT)": "التجهيز (شامل الضريبة)",
    // towers / views
    "Garden A": "حديقة A", "Horizon": "هورايزن", "Courtyard": "فناء", "Garden": "حديقة",
    "Garden + pool": "حديقة + مسبح", "City": "مدينة", "City + sea": "مدينة + بحر", "Corner · sea": "زاوية · بحر",
    "Sky · sea panorama": "سماء · بانوراما بحرية", "Penthouse · 270°": "بنتهاوس · 270°",
    "Cove A": "كوف A", "Cove B": "كوف B", "Skyline": "سكايلاين", "Marina view": "إطلالة مارينا",
    "Marina + sunset": "مارينا + غروب", "Garden + sea": "حديقة + بحر", "Sea + garden": "بحر + حديقة",
    "Sea view": "إطلالة بحرية", "Park view": "إطلالة حديقة", "Park": "حديقة", "Pool view": "إطلالة مسبح",
    "Marina": "مارينا", "Sea": "بحر", "Cove A & B": "كوف A و B", "Tower A": "البرج A", "Tower B": "البرج B",
    // BOQ item names
    "L-shape sofa": "كنبة على شكل L", "3-seat sofa": "كنبة 3 مقاعد", "Coffee + side tables": "طاولة قهوة + جانبية",
    "Coffee table": "طاولة قهوة", "Rug": "سجادة", "King bed + mattress": "سرير كينج + مرتبة",
    "Queen bed + mattress": "سرير كوين + مرتبة", "Wardrobe": "خزانة ملابس", "Dining table + 6": "طاولة طعام + 6",
    "Dining table + 4": "طاولة طعام + 4", "Full cookware pack": "طقم أواني طهي كامل", "Smart-lock prep": "تجهيز قفل ذكي",
    "Engineered oak flooring": "أرضيات بلوط هندسي", "Large-format porcelain": "بورسلين كبير الحجم",
    "Porcelain tile + skirting": "بلاط بورسلين + وزرات", "Laminate flooring": "أرضيات لامينيت",
    "Gypsum ceiling + cove lighting": "سقف جبسي + إضاءة مخفية", "Gypsum false ceiling": "سقف جبسي معلّق",
    "Paint + feature wall panel": "دهان + جدار مميّز", "Paint · 2 coats": "دهان · طبقتان",
    "Wardrobes + TV unit + console": "خزائن + وحدة تلفزيون + كونسول", "Built-in wardrobes": "خزائن مدمجة",
    "Upgraded cabinetry + stone top": "خزائن مطوّرة + سطح حجري", "Layered lighting + dimmers": "إضاءة متدرّجة + خافتات",
    "Recessed LED downlights": "إضاءة LED غائرة", "AC reposition + smart points": "نقل المكيّف + نقاط ذكية",
    "AC grilles + smart points": "شبكات تكييف + نقاط ذكية", "Towel set": "طقم مناشف", "Sanitaryware upgrade": "ترقية الأدوات الصحية",
    // BOQ categories
    "Flooring": "أرضيات", "Ceiling": "أسقف", "Walls": "جدران", "Joinery": "نجارة", "Lighting": "إضاءة",
    "MEP": "كهروميكانيك", "Plumbing": "سباكة", "Smart": "ذكي",
    "active order": "طلب نشط", "6 months to handover": "6 أشهر قبل التسليم", "On signing": "عند التوقيع",
    "Retention · after handover": "احتجاز · بعد التسليم", "Close ×": "إغلاق ×", "created": "أُنشئ في",
    "Onboard developer +": "+ إضافة مطوّر", "+ Onboard developer": "+ إضافة مطوّر", "Onboard developer": "إضافة مطوّر", "Open workspace": "فتح مساحة العمل",
    "Active units": "وحدات نشطة", "In contract": "قيد التعاقد", "Extras sold": "الإضافات المباعة", "Monthly net to owners": "الصافي الشهري للملّاك",
    "Units sold": "الوحدات المباعة", "Smart-home attach": "إرفاق المنزل الذكي", "Commission earned": "العمولة المكتسبة",
    "Monthly net to owner": "الصافي الشهري للمالك", "Operator fee": "رسوم المشغّل", "furnishing + smart home": "تأثيث + منزل ذكي",
    "paid on extras only": "تُدفع على الإضافات فقط", "No closed deals yet for this project.": "لا توجد صفقات مغلقة بعد لهذا المشروع.",
    "No operating model": "بدون نموذج تشغيل", "furnishing-only deals": "صفقات تأثيث فقط",
    "Deals (closed / pipe)": "الصفقات (مغلقة / محتملة)", "Smart attach": "إرفاق ذكي", "Rep": "المندوب",
    "Furnishing": "التأثيث", "Operating": "التشغيل", "Package": "الباقة", "Tier": "الفئة", "Cost": "التكلفة",
    "Fit-out cost": "تكلفة التجهيز", "Model": "النموذج", "Area": "المساحة", "Not included": "غير مضمّن",
    "Turnkey fit-out": "تجهيز متكامل", "Extras (furnishing + smart)": "الإضافات (تأثيث + ذكي)",
    "OPERATOR FEE · REVNU": "رسوم المشغّل · REVNU", "OUTSTANDING TO REVNU": "المتبقّي لـ REVNU", "AMOUNT DUE": "المبلغ المستحق",
    "Confirm": "تأكيد", "Add milestone +": "+ إضافة دفعة", "Save terms": "حفظ الشروط", "Provision partner": "تفعيل الشريك",
    "Identity": "الهوية", "Subdomain": "النطاق الفرعي",
    "BRAND PRIMARY COLOR": "اللون الأساسي للعلامة", "BRAND DEEP / HOVER": "اللون الداكن / التمرير",
    "LOGO": "الشعار", "DEFAULT FEATURE SET": "الميزات الافتراضية",
    "CONTACT": "جهة الاتصال", "Filter": "تصفية", "Export CSV": "تصدير CSV",
    "TOTAL LEADS": "إجمالي العملاء", "Total leads": "إجمالي العملاء", "All developers": "كل المطوّرين",
    "Any status": "أي حالة", "← All developers": "→ كل المطوّرين", "Contact": "جهة الاتصال",
    "CEO": "رئيس تنفيذي", "Head of Sales": "مدير مبيعات", "Project Director": "مدير مشروع",
    "Looking at furnishing-only for first project, ops in phase 2.": "يدرس التأثيث فقط للمشروع الأول، والتشغيل في المرحلة الثانية.",
    "Wants custom payment plans and bespoke contract templates.": "يريد خطط دفع مخصّصة ونماذج عقود خاصة.",
    "Interested in white-label sales portal for two towers in Jeddah.": "مهتم ببوابة مبيعات بعلامة خاصة لبرجين في جدة.",
    "Outstanding": "المتبقّي", "NEW": "جديد", "QUALIFIED": "مؤهّل", "IN PROPOSAL": "قيد العرض",
    "New": "جديد", "Qualified": "مؤهّل", "In proposal": "قيد العرض", "Passed": "مُستبعد",
    "closing window": "نافذة الإغلاق", "needs proposal": "بانتظار عرض", "not yet qualified": "غير مؤهّل بعد",
    "You can override these per project after onboarding.": "يمكنك تعديل هذه لكل مشروع بعد الإعداد.",
    "Once you confirm, the partner is created with empty designs / packages / payments / operations / contracts. Configure them inside the developer's workspace.": "بمجرد التأكيد، يُنشأ الشريك بتصاميم وباقات ومدفوعات وعمليات وعقود فارغة. اضبطها داخل مساحة عمل المطوّر.",
    "A blank partner account, a working login at the subdomain, and a workspace populated with sensible defaults you can tune.": "حساب شريك فارغ، وتسجيل دخول فعّال على النطاق الفرعي، ومساحة عمل مهيّأة بإعدادات افتراضية مناسبة يمكنك تعديلها.",
    "Every project under this developer carries its own designs, packages, smart-home tiers, payment plans, operating models and contract templates. Click into a project to manage everything.": "كل مشروع لدى هذا المطوّر يحمل تصاميمه وباقاته وفئات منزله الذكي وخطط الدفع ونماذج التشغيل ونماذج العقود الخاصة به. انقر على مشروع لإدارة كل شيء.",
    "Developer admins and sales reps. Reps can be assigned to specific projects.": "مدراء المطوّر ومندوبو المبيعات. يمكن إسناد المندوبين لمشاريع محددة.",
    "Leads from the marketing site and direct outreach. Move them through the pipeline.": "العملاء المحتملون من الموقع التسويقي والتواصل المباشر. حرّكهم عبر خط العمليات.",
    "New leads come from the request-access form on the marketing site. Status changes are stored client-side in this demo.": "يأتي العملاء الجدد من نموذج طلب الوصول في الموقع التسويقي. تُحفظ تغييرات الحالة محلياً في هذا العرض.",
    "Included": "مضمّن", "Extras (furnishing + smart)": "الإضافات (تأثيث + ذكي)", "of which fit-out": "منها التجهيز",
    "Unit price (paid separately to developer)": "سعر الوحدة (يُدفع للمطوّر بشكل منفصل)",
    "Unit Sale Agreement": "اتفاقية بيع الوحدة", "Property Management Agreement": "اتفاقية إدارة الأملاك",
    "KYC & PDPL Acknowledgement": "إقرار اعرف عميلك وحماية البيانات", "Preview": "معاينة", "Download": "تنزيل",
    "Download full pack (ZIP)": "تنزيل الحزمة الكاملة (ZIP)", "What": "ما", "'s payment terms.": " شروط دفعه.",
    "Furnishing Schedule": "جدول التأثيث", "Monthly net": "الصافي الشهري",
    "Developer → Revnu payment": "دفعة المطوّر → Revnu",
    "Open project →": "فتح المشروع ←", "Open project": "فتح المشروع",
    "← All projects": "→ كل المشاريع", "← All developers": "→ كل المطوّرين",
    "Open sales portal →": "فتح بوابة المبيعات ←", "Open developer admin →": "فتح إدارة المطوّر ←",
    "Continue →": "متابعة ←", "Provision tenant": "تفعيل المستأجر", "Provision partner": "تفعيل الشريك",
    "Open my deals →": "فتح صفقاتي ←", "Start new sale →": "بدء عملية بيع جديدة ←",
    "Paid on extras only": "تُدفع على الإضافات فقط", "Average per deal": "المتوسّط لكل صفقة",
    "(furnishing + smart home) — not on the unit price.": "(تأثيث + منزل ذكي) — وليس على سعر الوحدة.",
    "National ID": "رقم الهوية", "Number": "الرقم", "Fit-out cost": "تكلفة التجهيز", "Cost": "التكلفة",
    "Monthly net to owner": "الصافي الشهري للمالك", "Download contract": "تنزيل العقد", "View documents": "عرض المستندات",
    "Customer": "العميل", "Unit number": "رقم الوحدة", "Package value": "قيمة الباقة", "Smart layer": "طبقة الذكاء",
    "Coverage and BOQ": "التغطية وجدول الكميات", "Design style": "نمط التصميم",
    "Standard locks": "أقفال عادية", "Wi-Fi only": "واي فاي فقط", "No smart devices": "بدون أجهزة ذكية",
    "Smart lock": "قفل ذكي", "Smart thermostat": "منظّم حرارة ذكي", "Voice control": "تحكّم صوتي",
    "Smart lighting (living + bed)": "إضاءة ذكية (المعيشة + النوم)", "Smart lock + intercom": "قفل ذكي + إنتركوم",
    "HVAC zoning": "تقسيم التكييف", "Whole-home audio": "صوت لكامل المنزل", "Smart blinds": "ستائر ذكية",
    "Energy dashboard": "لوحة الطاقة", "Smart lighting": "إضاءة ذكية", "Thermostat": "منظّم الحرارة",
    "Medium risk": "مخاطر متوسطة", "Low risk": "مخاطر منخفضة", "High risk": "مخاطر عالية",
    "Nightly rate": "السعر الليلي", "Annual net": "الصافي السنوي", "Net ROI / yr": "العائد الصافي / سنة",
    "Monthly rent": "الإيجار الشهري", "Operating model": "نموذج التشغيل",
    "Reset to our assumption": "إعادة إلى افتراضنا", "Average daily rate (ADR)": "متوسّط السعر اليومي",
    "Investment horizon": "أفق الاستثمار", "Years the projection runs for": "عدد سنوات الإسقاط",
    "What-if — not the contract": "محاكاة — ليست في العقد", "Gross": "الإجمالي", "Net to owner": "الصافي للمالك",
    "Net ROI / year": "العائد الصافي / سنة", "The agreement records": "تسجّل الاتفاقية", "our assumption": "افتراضنا",
    "TOTAL INVESTMENT": "إجمالي الاستثمار", "Furnishing (incl. VAT)": "التأثيث (شامل الضريبة)",
    "Fit-out (incl. VAT)": "التجهيز (شامل الضريبة)", "Calculator": "الحاسبة", "Occupancy": "الإشغال",
    "yrs": "سنة", "years": "سنوات", "Payback": "فترة الاسترداد", "Gross yield": "العائد الإجمالي",
    "ANNUAL INCOME · SCENARIO": "الدخل السنوي · سيناريو", "PERFORMANCE · SCENARIO": "الأداء · سيناريو",
    "SCENARIO · WHAT-IF": "سيناريو · محاكاة", "OUR ASSUMPTION · GOES IN THE CONTRACT": "افتراضنا · يُدرج في العقد",
    "Operator fee": "رسوم المشغّل", "Monthly net": "الصافي الشهري", "Annual gross": "الإجمالي السنوي",
    "Reset defaults": "إعادة الافتراضات", "Horizon": "الأفق",
  };

  function t(s) {
    if (!AR) return s;
    return DICT[s] || s;
  }
  function tx(obj, base) {
    if (!obj) return "";
    if (AR && obj[base + "Ar"]) return obj[base + "Ar"];
    const v = obj[base] || "";
    // Fall back to the dictionary so common content names (e.g. "Essential",
    // "Full Home", "Daily / Airbnb") show in Arabic even without an explicit Ar field.
    if (AR && v && DICT[v]) return DICT[v];
    return v;
  }
  function fmtDate(d) {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString(AR ? "ar-SA" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
    catch (e) { return d; }
  }
  function setLang(l) {
    try { localStorage.setItem(KEY, l); } catch (e) {}
    try { document.cookie = KEY + "=" + l + "; path=/; max-age=31536000; samesite=lax"; } catch (e) {}
    location.reload();
  }

  // ---- apply to the document shell as early as possible ----
  function apply() {
    const el = document.documentElement;
    el.setAttribute("lang", AR ? "ar" : "en");
    el.setAttribute("dir", AR ? "rtl" : "ltr");
    el.classList.toggle("lang-ar", AR);
  }
  apply();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);

  // ---- runtime DOM auto-translator -----------------------------------
  // Catches every standalone label/button/title across all surfaces by
  // walking text nodes + key attributes and swapping exact dictionary
  // matches. Re-runs on DOM mutations (React re-renders). Arabic only.
  const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1, SVG: 1, "IMAGE-SLOT": 1 };
  const arrowFlipped = new WeakSet();
  function trDict(raw) {
    if (!raw) return null;
    const key = raw.trim();
    if (!key) return null;
    const hit = DICT[key];
    if (!hit || hit === key) return null;
    // preserve leading/trailing whitespace around the trimmed text
    return raw.replace(key, hit);
  }
  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) { // text
      const p = node.parentNode;
      if (p && SKIP_TAGS[p.nodeName]) return;
      const out = trDict(node.nodeValue);
      if (out != null) node.nodeValue = out;
      // RTL: mirror directional arrows once per node (idempotent via WeakSet).
      // Skip Arabic-authored text — those strings already carry correct arrows;
      // the mirror is only for untranslated English remnants.
      if (AR && !arrowFlipped.has(node)) {
        const v = node.nodeValue;
        if (v && !/[\u0600-\u06FF]/.test(v) && /[A-Za-z]/.test(v) && (v.indexOf("\u2192") >= 0 || v.indexOf("\u2190") >= 0)) {
          node.nodeValue = v.replace(/[\u2192\u2190]/g, (c) => c === "\u2192" ? "\u2190" : "\u2192");
        }
        arrowFlipped.add(node);
      }
      return;
    }
    if (node.nodeType !== 1) return;
    if (SKIP_TAGS[node.nodeName] || node.isContentEditable) return;
    if (node.hasAttribute && node.hasAttribute("data-i18n-skip")) return;   // e.g. an English agreement inside an Arabic UI
    // translate common attributes
    if (node.placeholder) { const o = trDict(node.placeholder); if (o != null) node.placeholder = o; }
    if (node.title) { const o = trDict(node.title); if (o != null) node.title = o; }
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  let scheduled = false;
  function sweep() {
    scheduled = false;
    if (!AR) return;
    try { walk(document.body); } catch (e) {}
  }
  function schedule() { if (!scheduled) { scheduled = true; setTimeout(sweep, 30); } }
  function startAutoTranslate() {
    if (!AR || !document.body) return;
    sweep();
    try {
      const mo = new MutationObserver(() => schedule());
      mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title"] });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startAutoTranslate);
  else startAutoTranslate();

  // ---- a drop-in language toggle (vanilla) any page can mount ----
  // Usage: I18N.toggleHTML()  → returns markup; or I18N.mountToggle(el)
  function toggleHTML() {
    return '<button data-i18n-lang="en" class="i18n-seg ' + (!AR ? "on" : "") + '">EN</button>' +
           '<button data-i18n-lang="ar" class="i18n-seg ' + (AR ? "on" : "") + '" style="font-family:Almarai,sans-serif">عربي</button>';
  }
  function wire(root) {
    (root || document).querySelectorAll("[data-i18n-lang]").forEach((b) => {
      if (b.__wired) return; b.__wired = true;
      b.addEventListener("click", () => setLang(b.getAttribute("data-i18n-lang")));
    });
  }

  // tr(): dictionary lookup that ALWAYS returns Arabic (or null) — for documents whose language
  // is chosen independently of the UI language (the agreement).
  function tr(s) { if (s == null) return null; const k = String(s).trim(); return Object.prototype.hasOwnProperty.call(DICT, k) ? DICT[k] : null; }
  // rev(): Arabic → English through the same dictionary (for English documents holding Arabic-entered values).
  let REV = null;
  function rev(s) { if (s == null) return null; if (!REV) { REV = {}; Object.keys(DICT).forEach((k) => { if (REV[DICT[k]] == null) REV[DICT[k]] = k; }); } const k = String(s).trim(); return Object.prototype.hasOwnProperty.call(REV, k) ? REV[k] : null; }
  window.I18N = { get lang() { return lang; }, isAR: AR, t, tx, tr, rev, fmtDate, setLang, toggleHTML, wire };
})();
