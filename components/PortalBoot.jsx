"use client";
// Boots a portal on the client: hydrates the store with the server-fetched, RLS-scoped
// snapshot, installs the support layer (tours / tickets / toasts), then renders the ported
// portal app (client-only, exactly like the prototype's in-browser React apps).
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import D from "@/lib/data/store";
import { installSupport } from "@/lib/data/support";
import ErrorBoundary from "./ErrorBoundary";
import MobileNav from "./MobileNav";

function Loading() {
  return <div className="rv-fullscreen"><div><div className="rv-spinner" /><div className="muted" style={{ fontSize: 13 }}>…</div></div></div>;
}
const APPS = {
  sales:     dynamic(() => import("@/portals/sales/SalesApp"),         { ssr: false, loading: Loading }),
  developer: dynamic(() => import("@/portals/developer/DeveloperApp"), { ssr: false, loading: Loading }),
  revnu:     dynamic(() => import("@/portals/revnu/RevnuApp"),         { ssr: false, loading: Loading }),
};

export default function PortalBoot({ portal, snapshot, me, params }) {
  const [ready] = useState(() => { D.setMe(me); D.hydrate(snapshot); return true; });
  useEffect(() => { installSupport(); }, []);

  // Keep the snapshot fresh across colleagues: quietly re-fetch when the tab regains focus.
  useEffect(() => {
    let last = Date.now();
    const onVis = () => { if (document.visibilityState === "visible" && Date.now() - last > 20000) { last = Date.now(); D.refresh().catch(() => {}); } };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, []);

  const App = APPS[portal];
  if (!ready || !App) return <Loading />;
  return (
    <ErrorBoundary>
      <App params={params} />
      <MobileNav />
    </ErrorBoundary>
  );
}
