"use client";
// Boots a buyer page (/order/<code>, /sign/<code>). No sign-in: the code in the
// URL is the key. The store is hydrated from the code-keyed public view (only
// what this link may show), then the client's phone apps render unchanged.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import R from "@/lib/data/remote";
import { useStoreVersion } from "@/lib/data/useStore";
import ErrorBoundary from "./ErrorBoundary";

function Loading() {
  return <div className="rv-fullscreen"><div><div className="rv-spinner" /></div></div>;
}
const APPS = {
  order: dynamic(() => import("@/portals/shared/mobile-wizard").then((m) => m.RemoteOrderApp), { ssr: false, loading: Loading }),
  sign:  dynamic(() => import("@/portals/shared/sign").then((m) => m.SignApp), { ssr: false, loading: Loading }),
};

function Offline({ onRetry }) {
  const AR = typeof window !== "undefined" && window.I18N && window.I18N.isAR;
  return (
    <div className="rv-fullscreen">
      <div className="card card-pad-lg" style={{ maxWidth: 380, textAlign: "center" }}>
        <div className="display-sm" style={{ marginBottom: 8 }}>{AR ? "تعذر تحميل الصفحة" : "We couldn't load this page"}</div>
        <p className="muted" style={{ fontSize: 13.5 }}>{AR ? "تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى." : "Check your connection and try again."}</p>
        <button className="btn btn-primary" onClick={onRetry}>{AR ? "إعادة المحاولة" : "Try again"}</button>
      </div>
    </div>
  );
}

export default function PublicBoot({ kind, code }) {
  useStoreVersion();
  const [state, setState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        if (kind === "sign") {
          await R.loadSigning(code, true);
        } else {
          const l = await R.loadLink(code, true);
          // A buyer who already submitted from this phone sees their submission's state on return.
          let sid = null; try { sid = localStorage.getItem("revnu_my_sub_" + R.parseCode(code)); } catch (e) { /* private mode */ }
          if (l && sid) await R.pollLink(code, sid).catch(() => null);
        }
        if (!off) setState("ready");
      } catch (e) {
        console.error(e);
        if (!off) setState("error");
      }
    })();
    return () => { off = true; };
  }, [kind, code, attempt]);

  if (state === "loading") return <Loading />;
  if (state === "error") return <Offline onRetry={() => { setState("loading"); setAttempt((a) => a + 1); }} />;
  const App = APPS[kind];
  return <ErrorBoundary publicPage><App /></ErrorBoundary>;
}
