"use client";
// mobile.js port — injects a hamburger into the admin topbar (≤860px) that opens the sidebar
// as an off-canvas drawer. No-op on pages without a .sidebar. Works for RTL and LTR.
import { useEffect } from "react";

export default function MobileNav() {
  useEffect(() => {
    let backdrop = null;
    function init() {
      const topbar = document.querySelector(".topbar");
      const sidebar = document.querySelector(".sidebar");
      if (!topbar || !sidebar || topbar.querySelector(".mnav-burger")) return false;
      const burger = document.createElement("button");
      burger.className = "mnav-burger"; burger.type = "button";
      burger.setAttribute("aria-label", "Menu");
      burger.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
      topbar.insertBefore(burger, topbar.firstChild);
      const close = () => { sidebar.classList.remove("m-open"); if (backdrop) { backdrop.remove(); backdrop = null; } };
      burger.addEventListener("click", () => {
        if (sidebar.classList.contains("m-open")) return close();
        sidebar.classList.add("m-open");
        backdrop = document.createElement("div"); backdrop.className = "m-backdrop"; backdrop.addEventListener("click", close);
        document.body.appendChild(backdrop);
      });
      sidebar.addEventListener("click", (e) => { if (e.target.closest(".side-link")) close(); });
      return true;
    }
    let tries = 0;
    const iv = setInterval(() => { if (init() || ++tries > 40) clearInterval(iv); }, 250);
    return () => { clearInterval(iv); if (backdrop) backdrop.remove(); };
  }, []);
  return null;
}
