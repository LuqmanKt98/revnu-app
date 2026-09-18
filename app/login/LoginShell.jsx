"use client";
// The sign-in card reads window.I18N at render time (like every prototype surface), so it is client-only.
import dynamic from "next/dynamic";
import ErrorBoundary from "@/components/ErrorBoundary";

const LoginClient = dynamic(() => import("./LoginClient"), { ssr: false, loading: () => <div className="rv-fullscreen"><div className="rv-spinner" /></div> });

export default function LoginShell(props) {
  return <ErrorBoundary><LoginClient {...props} /></ErrorBoundary>;
}
