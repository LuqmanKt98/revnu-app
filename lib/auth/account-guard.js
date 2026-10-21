"use client";
// An open portal page belongs to the account it was loaded for. The sign-in cookie is shared by every tab of a browser,
// so signing in as someone else in another tab makes this page's requests run as that other account: the page still looks
// like the old one (e.g. Revnu Admin) but the database sees the new account and refuses with "no permission".
// This notices the switch and asks the person to reload, which lets the server route them to the right portal.
import { supabaseBrowser } from "@/lib/supabase/client";

let shown = false;
const AR = () => !!(typeof window !== "undefined" && window.I18N && window.I18N.isAR);
const L = (en, ar) => (AR() ? ar : en);

function announce() {
  if (shown || typeof document === "undefined") return;
  shown = true;
  const veil = document.createElement("div");
  veil.setAttribute("role", "alertdialog");
  veil.dir = AR() ? "rtl" : "ltr";
  veil.style.cssText = "position:fixed;inset:0;z-index:1000;background:rgba(8,11,20,.55);display:flex;align-items:center;justify-content:center;padding:20px";
  const card = document.createElement("div");
  card.style.cssText = "width:440px;max-width:100%;background:var(--bg-card,#fff);color:var(--text,#111);border-radius:16px;padding:22px 24px;box-shadow:0 24px 60px rgba(0,0,0,.35);font-size:14px;line-height:1.55";
  const h = document.createElement("h3");
  h.style.cssText = "margin:0 0 8px;font-size:18px";
  h.textContent = L("You're signed in as someone else now", "تم تسجيل الدخول بحساب آخر");
  const p = document.createElement("p");
  p.style.cssText = "margin:0 0 18px;color:var(--text-soft,#555)";
  p.textContent = L(
    "In another tab of this browser you signed in with a different account, so this page can no longer act as the account it was opened for. Reload to continue with the account you're using now. To keep two accounts open at the same time, use a private window or another browser.",
    "سجّلت الدخول بحساب مختلف في تبويب آخر من هذا المتصفح، لذلك لم تعد هذه الصفحة تعمل بالحساب الذي فُتحت له. أعد التحميل للمتابعة بالحساب الذي تستخدمه الآن. لإبقاء حسابين مفتوحين معًا استخدم نافذة خاصة أو متصفحًا آخر.");
  const b = document.createElement("button");
  b.className = "btn btn-primary";
  b.textContent = L("Reload", "إعادة التحميل");
  b.onclick = () => location.reload();
  card.append(h, p, b);
  veil.append(card);
  document.body.appendChild(veil);
  b.focus();
}

/** Is the browser's current session a different account from the one this page was loaded for? (reads the shared cookie) */
async function otherAccount(meId) {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    const uid = data && data.session && data.session.user && data.session.user.id;
    return !!uid && uid !== meId;
  } catch { return false; }
}

/** Resolves true (and shows the notice) when the account changed in another tab; used before blaming a refused write on permissions. */
export async function accountChanged(meId) {
  if (!meId) return false;
  if (!(await otherAccount(meId))) return false;
  announce();
  return true;
}

/** Portal boot: watch for another tab signing in as a different account. Returns the cleanup function. */
export function watchAccount(meId) {
  if (!meId) return () => {};
  const recheck = () => { accountChanged(meId); };
  const onVis = () => { if (document.visibilityState === "visible") recheck(); };
  // other tabs broadcast their sign-in; compare synchronously (no supabase calls inside the callback)
  const { data } = supabaseBrowser().auth.onAuthStateChange((_event, session) => {
    if (session && session.user && session.user.id !== meId) announce();
  });
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", recheck);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", recheck);
    if (data && data.subscription) data.subscription.unsubscribe();
  };
}
