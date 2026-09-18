"use client";
// Sign-in — same card, same copy and white-labelling as the prototype's login.html,
// now backed by Supabase Auth (email + password). Flow:
//   email + password → (first sign-in: set a new password) → land in the right portal.
// Nothing about other users is ever sent to the browser (audit SEC-02).
import { useEffect, useRef, useState } from "react";
import api, { ApiError } from "@/lib/data/api";
import { destinationFor } from "@/lib/auth/routing";
import "./login.css";

const REVNU_ICON = <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="42" fill="none" stroke="#5EC4D4" strokeWidth="9"/><circle cx="100" cy="100" r="18" fill="#5EC4D4"/></svg>;

export default function LoginClient({ dev, asDev, next, signedInAs, mode: initialMode }) {
  const AR = !!(typeof window !== "undefined" && window.I18N && window.I18N.isAR);
  const L = (en, ar) => (AR ? ar : en);
  const [mode, setMode] = useState(initialMode || (signedInAs ? "welcome" : "signin")); // signin | welcome | setpw | forgot | forgot-sent
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [profile, setProfile] = useState(signedInAs || null);
  const langRef = useRef(null);

  useEffect(() => {
    try { const lt = langRef.current; if (lt && window.I18N) { lt.innerHTML = window.I18N.toggleHTML(); window.I18N.wire(lt); } } catch (e) {}
    if (dev) {
      const r = document.documentElement.style; const b = dev.brand || {};
      if (b.primary) r.setProperty("--brand", b.primary); if (b.deep) r.setProperty("--brand-deep", b.deep);
      if (b.soft) r.setProperty("--brand-soft", b.soft); if (b.text) r.setProperty("--brand-text", b.text);
    }
    document.title = L("Sign in — ", "تسجيل الدخول — ") + (dev ? dev.name : "Revnu");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unified = !dev && !asDev;

  // Where to go after sign-in: the requested page if it belongs to this person's portal, else their home.
  function landing(p) {
    const home = destinationFor(p);
    if (next && next.startsWith("/")) {
      const portal = next.split(/[?#]/)[0].split("/")[1];
      const homePortal = home.split(/[?#]/)[0].split("/")[1];
      if (portal === homePortal || (portal === "sales" && p.developerId)) return next;
    }
    return home;
  }

  function friendly(e) {
    if (e instanceof ApiError) {
      if (e.code === "BAD_CREDENTIALS") return L("That email and password don't match. Check them and try again, or reset your password.", "البريد وكلمة المرور غير متطابقين. تحقّق منهما وحاول مجددًا، أو أعد تعيين كلمة المرور.");
      if (e.code === "EMAIL_UNCONFIRMED") return L("This account isn't activated yet. Ask your admin to check the invitation.", "هذا الحساب غير مفعّل بعد. اطلب من مديرك مراجعة الدعوة.");
      return e.friendly(AR);
    }
    return L("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى.");
  }

  async function signIn(e) {
    e && e.preventDefault(); setErr("");
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setErr(L("Enter a valid work email.", "أدخل بريدًا مهنيًا صحيحًا."));
    if (!password) return setErr(L("Enter your password.", "أدخل كلمة المرور."));
    setBusy(true);
    try {
      await api.auth.signIn(em, password);
      const p = await api.auth.myProfile();
      if (!p) { await api.auth.signOut(); return setErr(L("Your account isn't linked to a workspace yet. Ask your admin for an invite.", "حسابك غير مرتبط بمساحة عمل بعد. اطلب دعوة من مديرك.")); }
      if (dev && p.developerId !== dev.id) { await api.auth.signOut(); return setErr(L("This email belongs to another company. Use your company's sign-in link.", "هذا البريد يتبع شركة أخرى. استخدم رابط دخول شركتك.")); }
      if (asDev && !p.developerId) { await api.auth.signOut(); return setErr(L("Revnu staff: sign in at the Revnu admin.", "فريق Revnu: الدخول عبر إدارة Revnu.")); }
      setProfile(p);
      if (p.mustChangePassword) { setMode("setpw"); return; }
      location.href = landing(p);
    } catch (ex) { setErr(friendly(ex)); }
    finally { setBusy(false); }
  }

  async function setNewPassword(e) {
    e && e.preventDefault(); setErr("");
    if (pw1.length < 8) return setErr(L("Use at least 8 characters.", "استخدم 8 أحرف على الأقل."));
    if (pw1 !== pw2) return setErr(L("The two passwords don't match.", "كلمتا المرور غير متطابقتين."));
    setBusy(true);
    try {
      await api.auth.setPassword(pw1);
      const p = profile || (await api.auth.myProfile());
      location.href = p ? landing(p) : "/login";
    } catch (ex) { setErr(friendly(ex)); }
    finally { setBusy(false); }
  }

  async function sendReset(e) {
    e && e.preventDefault(); setErr("");
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setErr(L("Enter a valid work email.", "أدخل بريدًا مهنيًا صحيحًا."));
    setBusy(true);
    try { await api.auth.requestReset(em); setMode("forgot-sent"); }
    catch (ex) { setErr(friendly(ex)); }
    finally { setBusy(false); }
  }

  async function signOut() { setBusy(true); await api.auth.signOut(); setProfile(null); setMode("signin"); setBusy(false); }

  const title = mode === "setpw" ? L("Choose a new password", "اختر كلمة مرور جديدة")
              : mode === "forgot" || mode === "forgot-sent" ? L("Reset your password", "إعادة تعيين كلمة المرور")
              : mode === "welcome" ? L("Welcome back", "أهلاً بعودتك")
              : dev ? L("Sign in to ", "تسجيل الدخول إلى ") + (AR && dev.nameAr ? dev.nameAr : dev.name)
              : asDev ? L("Sign in to your workspace", "سجّل الدخول إلى مساحتك")
              : L("Sign in", "تسجيل الدخول");
  const sub = mode === "setpw" ? L("This is your first sign-in (or your password was reset). Pick a password only you know — at least 8 characters.", "هذا أول تسجيل دخول لك (أو أُعيد تعيين كلمة مرورك). اختر كلمة مرور لا يعرفها غيرك — 8 أحرف على الأقل.")
            : mode === "forgot" ? L("Enter your work email and we'll send you a link to choose a new password.", "أدخل بريدك المهني وسنرسل لك رابطًا لاختيار كلمة مرور جديدة.")
            : mode === "forgot-sent" ? L("If an account exists for that email, a reset link is on its way. It expires in 1 hour. If nothing arrives, your admin can reset your password from Users & roles.", "إذا كان هناك حساب بهذا البريد، فرابط إعادة التعيين في طريقه إليك ويصلح لمدة ساعة. إن لم يصلك شيء، يمكن لمديرك إعادة تعيين كلمة مرورك من صفحة المستخدمين.")
            : mode === "welcome" ? L("You're already signed in.", "أنت مسجّل الدخول بالفعل.")
            : dev ? L("Enter your work email and password.", "أدخل بريدك المهني وكلمة المرور.")
            : asDev ? L("Use your work email — we'll route you to your company.", "استخدم بريدك المهني وسنوجّهك إلى شركتك.")
            : L("Enter your work email and password — we'll take you straight to your own workspace.", "أدخل بريدك المهني وكلمة المرور — ونوجّهك مباشرةً إلى مساحتك الخاصة.");

  return (
    <div className="login-root">
      <div className="bg-art" />
      <header className="login-nav">
        <div className="dev-mark">
          {dev ? (
            dev.logo
              ? <span className="glyph" style={{ width: "auto", padding: "7px 13px" }}><img src={dev.logoDark || dev.logo} alt={dev.name} style={{ height: 22, display: "block" }} /></span>
              : <span className="glyph">{dev.initials}</span>
          ) : <span className="glyph revnu">{REVNU_ICON}</span>}
          <div className="col" style={{ lineHeight: 1.15 }}>
            {!(dev && dev.logo) && <span className="name">{dev ? dev.name : "Revnu"}</span>}
            <span className="sub">{dev ? dev.domain : L("one sign-in for every account", "دخول واحد لكل الحسابات")}</span>
          </div>
        </div>
        <div className="row" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="i18n-toggle" ref={langRef} />
        </div>
      </header>

      <main className="login-stage">
        <div className="login-card" dir={AR ? "rtl" : "ltr"}>
          <div className="topline">
            <span>{L("SIGN IN", "تسجيل الدخول")}</span>
            {dev && <span className="pwr">{L("POWERED BY REVNU", "مُشغَّل بواسطة REVNU")}</span>}
          </div>
          <h1>{title}</h1>
          <p className="sub">{sub}</p>

          {mode === "welcome" && profile && (
            <>
              <div className="rv-alert info" style={{ marginBottom: 14 }}>
                <strong>{AR && profile.nameAr ? profile.nameAr : profile.name}</strong><br /><span className="rv-help">{profile.email}</span>
              </div>
              <button className={"sign-btn" + (busy ? " is-busy" : "")} disabled={busy} onClick={() => { location.href = landing(profile); }}>{L("Continue to my workspace →", "المتابعة إلى مساحتي ←")}</button>
              <div className="links"><a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>{L("Not you? Sign out", "لست أنت؟ تسجيل الخروج")}</a><a href="mailto:support@revnu.sa">{L("Need help?", "تحتاج مساعدة؟")}</a></div>
            </>
          )}

          {mode === "signin" && (
            <form onSubmit={signIn} noValidate>
              <div className="field">
                <label htmlFor="email">{L("Work email", "البريد المهني")}</label>
                <input className="input" id="email" type="email" autoComplete="username" placeholder="name@company.sa" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label htmlFor="password">{L("Password", "كلمة المرور")}</label>
                <div className="pw-wrap">
                  <input className="input" id="password" type={showPw ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="pw-eye" onClick={() => setShowPw((v) => !v)} aria-label={L("Show password", "إظهار كلمة المرور")}>{showPw ? L("Hide", "إخفاء") : L("Show", "إظهار")}</button>
                </div>
              </div>
              <button className={"sign-btn" + (busy ? " is-busy" : "")} disabled={busy} type="submit">{busy ? L("Signing in…", "جارٍ الدخول…") : L("Sign in →", "تسجيل الدخول ←")}</button>
              {err && <div className="form-err" role="alert">{err}</div>}
              <div className="links">
                <a href="#" onClick={(e) => { e.preventDefault(); setErr(""); setMode("forgot"); }}>{L("Forgot password?", "نسيت كلمة المرور؟")}</a>
                <a href="mailto:support@revnu.sa">{L("Need help?", "تحتاج مساعدة؟")}</a>
              </div>
            </form>
          )}

          {mode === "setpw" && (
            <form onSubmit={setNewPassword} noValidate>
              <div className="field">
                <label htmlFor="pw1">{L("New password", "كلمة المرور الجديدة")}</label>
                <div className="pw-wrap">
                  <input className="input" id="pw1" type={showPw ? "text" : "password"} autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoFocus />
                  <button type="button" className="pw-eye" onClick={() => setShowPw((v) => !v)}>{showPw ? L("Hide", "إخفاء") : L("Show", "إظهار")}</button>
                </div>
                <div className="rv-help">{L("At least 8 characters. A short phrase you'll remember works well.", "8 أحرف على الأقل. عبارة قصيرة تتذكرها تفي بالغرض.")}</div>
              </div>
              <div className="field">
                <label htmlFor="pw2">{L("Repeat new password", "أعد كتابة كلمة المرور")}</label>
                <input className="input" id="pw2" type={showPw ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </div>
              <button className={"sign-btn" + (busy ? " is-busy" : "")} disabled={busy} type="submit">{busy ? L("Saving…", "جارٍ الحفظ…") : L("Save & continue →", "حفظ ومتابعة ←")}</button>
              {err && <div className="form-err" role="alert">{err}</div>}
              <div className="links"><a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>{L("Cancel & sign out", "إلغاء وتسجيل الخروج")}</a><a href="mailto:support@revnu.sa">{L("Need help?", "تحتاج مساعدة؟")}</a></div>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={sendReset} noValidate>
              <div className="field">
                <label htmlFor="email">{L("Work email", "البريد المهني")}</label>
                <input className="input" id="email" type="email" autoComplete="username" placeholder="name@company.sa" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <button className={"sign-btn" + (busy ? " is-busy" : "")} disabled={busy} type="submit">{busy ? L("Sending…", "جارٍ الإرسال…") : L("Send reset link →", "إرسال رابط إعادة التعيين ←")}</button>
              {err && <div className="form-err" role="alert">{err}</div>}
              <div className="links"><a href="#" onClick={(e) => { e.preventDefault(); setErr(""); setMode("signin"); }}>{L("← Back to sign in", "→ العودة لتسجيل الدخول")}</a><a href="mailto:support@revnu.sa">{L("Need help?", "تحتاج مساعدة؟")}</a></div>
            </form>
          )}

          {mode === "forgot-sent" && (
            <>
              <div className="rv-alert ok" style={{ marginBottom: 14 }}>{L("Check your inbox for ", "تحقّق من بريدك ")}<strong>{email.trim()}</strong>.</div>
              <button className="sign-btn" onClick={() => { setErr(""); setMode("signin"); }}>{L("← Back to sign in", "→ العودة لتسجيل الدخول")}</button>
            </>
          )}

          {!unified && (
            <div className="powered-by">
              <span className="pby">{L("POWERED BY", "مُشغَّل بواسطة")}</span>
              <span className="nd"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="42" fill="none" stroke="#080B14" strokeWidth="14"/><circle cx="100" cy="100" r="18" fill="#080B14"/></svg></span>
              <span className="word">Revnu</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
