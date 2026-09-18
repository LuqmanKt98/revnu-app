"use client";
// The audit found no error boundaries anywhere: one uncaught error blanked a whole portal.
// This catches render errors and offers a friendly recovery instead of a white page.
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Portal error:", error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    const AR = typeof window !== "undefined" && window.I18N && window.I18N.isAR;
    return (
      <div className="rv-fullscreen">
        <div className="card card-pad-lg">
          <div className="eyebrow" style={{ marginBottom: 8 }}>{AR ? "// حدث خطأ" : "// SOMETHING WENT WRONG"}</div>
          <div className="display-sm" style={{ marginBottom: 8 }}>{AR ? "تعذّر عرض هذه الشاشة" : "This screen couldn't be displayed"}</div>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            {AR ? "لم يُفقد أي شيء — بياناتك محفوظة على الخادم. أعد تحميل الصفحة، وإذا تكرّر الخطأ أرسل بلاغًا للدعم." : "Nothing was lost — your data is saved on the server. Reload the page; if it keeps happening, raise a support ticket."}
          </p>
          <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => location.reload()}>{AR ? "إعادة التحميل" : "Reload"}</button>
            <a className="btn btn-secondary" href="/login">{AR ? "تسجيل الدخول" : "Sign in"}</a>
          </div>
        </div>
      </div>
    );
  }
}
