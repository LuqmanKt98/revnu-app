// =================================================================
//  home-ar.js — Arabic localization for the marketing home page.
//  Natural marketing Arabic (not literal), no diacritics.
//  Mounts a compact language dropdown (globe) in the nav.
// =================================================================
(function () {
  var AR = window.I18N && window.I18N.isAR;

  // ---- compact language dropdown (both languages) ----
  try {
    var nav = document.querySelector(".nav");
    if (nav) {
      var wrap = document.createElement("div");
      wrap.style.cssText = "position:relative;display:inline-flex;align-items:center;";
      wrap.innerHTML =
        '<button id="langBtn" style="display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(8,11,20,0.22);background:transparent;border-radius:20px;padding:7px 13px;cursor:pointer;font-size:12.5px;font-weight:700;color:#080B14;font-family:inherit;">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c2.5 2.6 4 6.1 4 10s-1.5 7.4-4 10c-2.5-2.6-4-6.1-4-10s1.5-7.4 4-10z"/></svg>' +
        (AR ? "العربية" : "English") +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg></button>' +
        '<div id="langMenu" style="display:none;position:absolute;top:calc(100% + 8px);inset-inline-end:0;background:#fff;border:1px solid rgba(8,11,20,0.14);border-radius:12px;box-shadow:0 12px 32px rgba(8,11,20,0.14);min-width:150px;overflow:hidden;z-index:90;">' +
        '<div data-lang="ar" style="padding:10px 14px;cursor:pointer;font-size:13px;font-family:Almarai,sans-serif;display:flex;justify-content:space-between;align-items:center;' + (AR ? "font-weight:700;" : "") + '">العربية' + (AR ? " <span style=\"color:#0E7490\">✓</span>" : "") + "</div>" +
        '<div data-lang="en" style="padding:10px 14px;cursor:pointer;font-size:13px;border-top:1px solid rgba(8,11,20,0.07);display:flex;justify-content:space-between;align-items:center;' + (!AR ? "font-weight:700;" : "") + '">English' + (!AR ? " <span style=\"color:#0E7490\">✓</span>" : "") + "</div></div>";
      // place at the very end of the nav (after the links)
      nav.appendChild(wrap);
      var btn = wrap.querySelector("#langBtn"), menu = wrap.querySelector("#langMenu");
      btn.addEventListener("click", function (e) { e.stopPropagation(); menu.style.display = menu.style.display === "none" ? "block" : "none"; });
      document.addEventListener("click", function () { menu.style.display = "none"; });
      menu.querySelectorAll("[data-lang]").forEach(function (it) {
        it.addEventListener("mouseenter", function () { it.style.background = "rgba(8,11,20,0.05)"; });
        it.addEventListener("mouseleave", function () { it.style.background = "transparent"; });
        it.addEventListener("click", function () { if (window.I18N) window.I18N.setLang(it.getAttribute("data-lang")); });
      });
    }
  } catch (e) {}

  if (!AR) return; // English page stays as authored

  // ---- direction + typeface ----
  document.documentElement.dir = "rtl";
  document.documentElement.lang = "ar";
  var fontCss = document.createElement("style");
  // In the standalone bundle styles.css already carries Almarai as inlined data
  // URLs — injecting path-based @font-face here would override them and break.
  var ffRules = window.__resources ? "" :
    "@font-face{font-family:'Almarai';src:url('brand/fonts/Almarai-Regular.ttf') format('truetype');font-weight:400;}" +
    "@font-face{font-family:'Almarai';src:url('brand/fonts/Almarai-Bold.ttf') format('truetype');font-weight:700;}" +
    "@font-face{font-family:'Almarai';src:url('brand/fonts/Almarai-ExtraBold.ttf') format('truetype');font-weight:800;}";
  fontCss.textContent = ffRules +
    "body, h1, h2, h3, h4, .lede, p, a, button, input, select, textarea, label { font-family: 'Almarai', sans-serif !important; }";
  document.head.appendChild(fontCss);
  document.body.style.fontFamily = "'Almarai', sans-serif";

  function set(sel, html) { var el = document.querySelector(sel); if (el) el.innerHTML = html; }
  function setAll(sel, fn) { document.querySelectorAll(sel).forEach(fn); }

  // ---- nav ----
  var navMap = { "#win": "لماذا Revnu", "#calc": "احسب عائدك", "#how": "كيف نعمل", "#request": "سجل اهتمامك" };
  document.querySelectorAll(".nav .links a").forEach(function (a) {
    var h = a.getAttribute("href");
    if (navMap[h]) a.textContent = navMap[h];
    if (a.classList.contains("signin")) a.textContent = "دخول المطورين ←";
  });

  // ---- hero ----
  set(".hero-eye",
    '<span class="live-pulse"><span class="dot"></span>تجربة حية · تعمل الآن</span>' +
    '<span class="s">·</span> منصة عقارية متكاملة <span class="s">·</span> V1.0');
  set(".hero h1",
    'بع الوحدة <em id="wordReelAr">مؤثثة</em><span style="color:var(--cyan);font-style:italic;">..</span> وسلمها وهي تكسب لصاحبها.');
  set(".hero .lede",
    'Revnu تركب فوق رحلة مبيعاتك الحالية، فتبيع الوحدة مع تأثيثها وتشغيلها في جلسة واحدة — على الخارطة أو جاهزة، لأي مطور لديه وحدات للبيع. ' +
    '<strong style="color:var(--cyan);font-weight:500;">المطور</strong> يضيف خط ربح جديد على كل وحدة. ' +
    '<strong style="color:var(--cyan);font-weight:500;">المندوب</strong> يكسب عمولة أعلى على نفس الصفقة. ' +
    '<strong style="color:var(--cyan);font-weight:500;">والعميل</strong> يستلم وحدة جاهزة تدخل عليه من أول يوم.');
  var cta = document.querySelectorAll(".cta-row a");
  if (cta[0]) cta[0].textContent = "سجل اهتمامك ←";
  if (cta[1]) cta[1].textContent = "احسب عائدك ↓";
  var trustAr = [
    ["// نظام حماية البيانات", "متوافقة من التصميم"],
    ["// التوقيع الإلكتروني", "جاهز من اليوم الأول"],
    ["// عربي وإنجليزي", "حزمة العقود باللغتين"],
    ["// جلسة واحدة", "من العرض إلى التوقيع بنحو ٣٠ دقيقة"],
  ];
  document.querySelectorAll(".trust .pr").forEach(function (el, i) {
    if (trustAr[i]) el.innerHTML = "<strong>" + trustAr[i][0] + "</strong>" + trustAr[i][1];
  });

  // Arabic word reel
  (function () {
    var words = ["مؤثثة", "مشغلة", "جاهزة للسكن"];
    var i = 0, el = document.getElementById("wordReelAr");
    if (!el) return;
    el.style.transition = "opacity 0.25s";
    setInterval(function () {
      i = (i + 1) % words.length;
      el.style.opacity = 0;
      setTimeout(function () { el.textContent = words[i]; el.style.opacity = 1; }, 220);
    }, 2200);
  })();

  // ---- WIN × WIN × WIN ----
  set("#win .section-eye", "// الكل كسبان");
  set("#win .section-head h2", "صفقة واحدة.. والكل يخرج منها رابح.");
  set("#win .section-head p", "ثلاثة أطراف في كل عملية بيع، وRevnu صممت ليكسب كل واحد منهم — بدون ما تنحاز لأحد.");

  function winCard(sel, badge, h3, who, gainLbl, gainUnit, items) {
    var c = document.querySelector(sel);
    if (!c) return;
    var b = c.querySelector(".badge"); if (b) { var nm = b.querySelector(".nm") ? b.querySelector(".nm").outerHTML : ""; b.innerHTML = nm + badge; }
    var h = c.querySelector("h3"); if (h) h.textContent = h3;
    var w = c.querySelector(".who"); if (w) w.textContent = who;
    var gl = c.querySelector(".gain div div"); if (gl) gl.textContent = gainLbl;
    var gu = c.querySelector(".gain .l"); if (gu) gu.textContent = gainUnit;
    var lis = c.querySelectorAll("ul li > span:last-child");
    items.forEach(function (t, i) { if (lis[i]) lis[i].textContent = t; });
  }
  winCard(".win.developer", "// المطور",
    "دخل إضافي على كل وحدة تبيعها أصلا.",
    "نفس المبنى ونفس المشتري — لكن الآن تبيع معه التأثيث والمنزل الذكي، وتاخذ نصيبك من دخل التشغيل لسنوات.",
    "متوسط الزيادة على الوحدة", "ريال",
    ["هامش على التأثيث والمنزل الذكي في كل وحدة توقع.",
     "نصيب من دخل التشغيل يستمر بعد التسليم بسنوات.",
     "كل شيء باسمك: بوابتك ورابطك وعقودك."]);
  winCard(".win.agent", "// مندوب المبيعات",
    "عمولة أعلى على نفس الصفقة.",
    "كل باقة تأثيث أو منزل ذكي أو نموذج تشغيل يقفله المندوب يرفع قيمة الصفقة — وعمولته معها.",
    "عمولة إضافية على الصفقة", "ريال",
    ["عمولة ١٪ على كامل باقة التأثيث.",
     "إقفال أسرع: جلسة واحدة وتوقيع واحد وفاتورة واحدة.",
     "تجربة بيع تخلي المندوب يبان محترف أمام العميل."]);
  winCard(".win.customer", "// العميل",
    "تأثيث بسعر الجملة.. ودخل من أول يوم.",
    "المشتري العادي ما يوصل لأسعار المطورين في الأثاث والتشغيل. مع Revnu يوصل لها — ووحدته تبدأ تكسب من يوم الاستلام.",
    "وفر مقارنة بالتأثيث الذاتي", "من السعر",
    ["أثاث ومنزل ذكي بأسعار الشراء بالجملة.",
     "تأجير يومي أو شهري أو سنوي — الوحدة تشتغل من أول يوم.",
     "يطلع من الاجتماع وحزمة عقوده موقعة بيده."]);

  // ---- CALCULATOR ----
  set("#calc .section-eye", "// احسب عائدك");
  set("#calc .section-head h2", "حط أرقام مشروعك.. وشف الفرق بنفسك.");
  set("#calc .section-head p", "حرك المؤشرات والأرقام تحت تتحدث مباشرة — نفس معادلات المنصة الفعلية على صفقة نموذجية.");
  set(".calc-head h3", "مشروعك القادم");
  set(".calc-head > p", "حساب تقريبي لكنه مبني على معادلات المنصة نفسها. يفترض باقة المنزل الكامل والتشغيل اليومي. الأرقام استرشادية — أرقامك الفعلية تنضبط عند الانضمام.");
  var calcLblAr = ["متوسط سعر الوحدة ", "الوحدات المباعة في الربع ", "نسبة التأثيث من سعر الوحدة "];
  document.querySelectorAll(".calc-input label").forEach(function (l, i) {
    if (!calcLblAr[i]) return;
    var v = l.querySelector(".v");
    l.innerHTML = calcLblAr[i] + (v ? v.outerHTML : "");
  });
  var roAr = [
    ['// المطور', 'هامش التأثيث على الوحدة'],
    ['// المطور', 'نصيبك من دخل التشغيل في السنة <span style="font-family:var(--font-mono);font-size:9.5px;color:var(--cyan);letter-spacing:0.08em;margin-inline-start:6px;">(استرشادي)</span>'],
    ['// المندوب', 'العمولة الإضافية على الوحدة'],
    ['// العميل', 'صافي دخل المالك في السنة (متوسط)'],
  ];
  document.querySelectorAll(".calc-out .ro .nm").forEach(function (el, i) {
    if (roAr[i]) el.innerHTML = '<span class="who">' + roAr[i][0] + "</span>" + roAr[i][1];
  });
  set(".calc-out .total .nm", "// دخل المطور الإضافي · في الربع الواحد");
  set(".calc-fine", "// الأرقام استرشادية · تنضبط لكل مطور عند الانضمام");

  // ---- HOW IT WORKS ----
  set("#how .section-eye", "// كيف نعمل");
  set("#how .section-head h2", "من توقيع الصفقة إلى دفعات شهرية — وكل شيء باسمك.");
  var stepsAr = [
    ["نجهز حسابك", "ورشة واحدة نرفع فيها مشاريعك ووحداتك وتصاميمك وباقاتك ونماذج عقودك وهويتك — كلها في مساحتك الخاصة."],
    ["فريقك يدخل المنصة", "المندوبون والمدراء يدخلون على بوابة تحمل علامتك أنت، وكل واحد بصلاحياته."],
    ["المندوب يمشي مع المشتري خطوة خطوة", "رحلة البيع كاملة على جهاز لوحي. كل خطوة قابلة للضبط حسب المشروع، والأسعار من أرقامك."],
    ["والتوقيع في نفس الجلسة", "حزمة العقود تطلع بترويستك وتروح للتوقيع الإلكتروني على الطاولة."],
    ["نشغل نحن.. وتقبض أنت", "Revnu تتولى التنفيذ كاملا — تأثيث واستضافة ودفعات — تحت اسمك، وأنت تتابع كل شيء من لوحتك."],
  ];
  document.querySelectorAll(".flow-step").forEach(function (s, i) {
    if (!stepsAr[i]) return;
    var h = s.querySelector("h4"), p = s.querySelector("p");
    if (h) h.textContent = stepsAr[i][0];
    if (p) p.textContent = stepsAr[i][1];
  });

  // ---- WHAT WE HANDLE ----
  set("#handle .section-eye", "// وش نتولى عنك");
  set("#handle .section-head h2", "كل ما يقع بين البيع والعائد.. علينا.");
  var handleAr = [
    ["باقات التأثيث", "فئات مسعرة لكل نوع وحدة وبضمان ٥ سنوات. نشتري بأحجام المطورين."],
    ["أنماط التصميم", "اتجاهات بصرية منسقة لكل مشروع. العميل يختار الذوق والسعر ما يتغير."],
    ["المنزل الذكي", "طبقات اختيارية: قفل ذكي وتكييف وإضاءة وصوت — بسعر ثابت لكل فئة."],
    ["خطط الدفع", "دفعة واحدة أو أقساط أو تمويل بنكي، والخصومات تنحسب مباشرة."],
    ["نماذج التشغيل", "يومي أو شهري أو عقد سنوي. السعر في الإشغال — والعائد يطلع لك جاهز."],
    ["العقود", "نماذجك أنت، تتعبأ تلقائيا من بيانات المشتري والوحدة. والعميل يوقع معك، مو معنا."],
    ["مرونة لكل مشروع", "مو شرط كل مشروع ياخذ كل شيء. فعل أو عطل التأثيث والذكي والتشغيل لكل مشروع على حدة."],
  ];
  setAll("#handle .handle > ul > li", function (li, i) {
    if (!handleAr[i]) return;
    var what = li.querySelector(".what"), desc = li.querySelector(".desc");
    if (what) what.textContent = handleAr[i][0];
    if (desc) desc.textContent = handleAr[i][1];
  });
  set("#handle .panel .quote", "«اخترنا Revnu لأن العميل يظل عميلنا — وفوقها أضفنا خط ربح ما كان موجود. مندوبينا يتسابقون مين يسوي العرض.»");
  set("#handle .panel .author", "— شريك في التجربة · الرياض");
  var statLbls = document.querySelectorAll("#handle .stats .stat-lbl");
  var statAr = ["// من الجلسة إلى التوقيع"];
  statLbls.forEach(function (el, i) { if (statAr[i]) el.textContent = statAr[i]; });
  var statNums = document.querySelectorAll("#handle .stats .stat-num");
  if (statNums[0]) statNums[0].textContent = "~٣٠ دقيقة";

  // ---- BIG NUMBERS ----
  var bnAr = [
    ["// مطورون في التجربة", "تجربة حية في أكثر من منطقة."],
    ["// خطوات رحلة البيع", "كل خطوة تتفعل أو تتعطل حسب المشروع. الجلسة بمتوسط ٣٠ دقيقة."],
    ["// ساعة حتى الإطلاق", "من توقيع التجربة إلى بوابة بعلامتك جاهزة للبيع."],
  ];
  document.querySelectorAll(".bignum .bn").forEach(function (bn, i) {
    if (!bnAr[i]) return;
    var l = bn.querySelector(".l"), d = bn.querySelector(".d");
    if (l) l.textContent = bnAr[i][0];
    if (d) d.textContent = bnAr[i][1];
  });
  // the "48h" counter: drop the latin suffix — the Arabic label already says ساعة
  var hCount = document.querySelector('.count[data-suf="h"]');
  if (hCount) hCount.setAttribute("data-suf", "");

  // ---- REQUEST ACCESS ----
  set("#request .section-eye", "// انضم للتجربة");
  set("#request .left h2", "خل مشروعك القادم يبدأ معنا.");
  set("#request .left > p", "عطنا فكرة عن مشروعك، ونرجع لك خلال ٤٨ ساعة بعرض كامل: وش بنجهز لك، وكيف بتطلع عقودك، ومتى تكون جاهز للانطلاق.");
  var talk = document.querySelectorAll("#request .talk > div");
  if (talk[0]) talk[0].innerHTML = "// البريد<strong>partners@revnu.sa</strong>";
  if (talk[1]) talk[1].innerHTML = "// الهاتف<strong>+966 11 234 8800</strong>";
  var fieldAr = {
    "name": ["الاسم الكامل", "عبدالله النجار"],
    "role": ["المنصب", "مدير المبيعات"],
    "company": ["الشركة", "شركة مرسى العقارية"],
    "email": ["البريد الرسمي", "name@company.sa"],
    "phone": ["الجوال", "+966 5x xxx xxxx"],
    "city": ["المدينة", null],
    "units": ["عدد وحدات مشروعك القادم", null],
    "notes": ["وش تبي Revnu تتولى عنك؟", "التأثيث فقط؟ أو التشغيل بعد؟ وهل عندك متطلبات خاصة بالعقود أو خطط الدفع؟"],
  };
  setAll("#request-form .field", function (f) {
    var input = f.querySelector("input,select,textarea");
    var label = f.querySelector("label");
    if (!input) return;
    var conf = fieldAr[input.name];
    if (!conf) return;
    if (label) label.textContent = conf[0];
    if (conf[1] && input.placeholder !== undefined) input.placeholder = conf[1];
  });
  var citySel = document.querySelector('select[name="city"]');
  if (citySel) {
    var cityAr = { "Riyadh": "الرياض", "Dammam / Khobar": "الدمام / الخبر", "Madinah": "المدينة المنورة", "Makkah": "مكة المكرمة", "NEOM": "نيوم", "Other": "أخرى" };
    [...citySel.options].forEach(function (o) { if (cityAr[o.textContent.trim()]) o.textContent = cityAr[o.textContent.trim()]; });
  }
  var submitBtn = document.querySelector("#request-form .submit");
  if (submitBtn) submitBtn.textContent = "أرسل الطلب ←";
  set("#request-form .fine", "بإرسالك للطلب توافق على تواصل فريق شراكات Revnu معك. ولا نشارك بياناتك مع أي جهة أخرى.");

  // Arabic confirmation after submit
  var form = document.getElementById("request-form");
  if (form) form.addEventListener("submit", function () {
    setTimeout(function () {
      var sub = document.querySelector(".request .submitted");
      if (sub) {
        var h = sub.querySelector(".h"), p = sub.querySelector(".p");
        if (h) h.textContent = "وصلنا طلبك.";
        if (p) p.textContent = "شكرا لك — فريق شراكات Revnu بيتواصل معك خلال ٤٨ ساعة.";
      }
    }, 30);
  });

  // ---- footer ----
  document.querySelectorAll(".foot a").forEach(function (a) { if (/staff sign-in/i.test(a.textContent)) a.textContent = "دخول فريق Revnu"; });
  setAll(".foot span", function (s) { if (s.textContent.trim() === "Riyadh") s.textContent = "الرياض"; });
})();
