// Shown when an auth account exists but no profile row is linked to it.
import SignOutButton from "./SignOutButton";

export default function NoWorkspace({ email }: { email?: string }) {
  return (
    <div className="rv-fullscreen">
      <div className="card card-pad-lg">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{"// ACCOUNT"}</div>
        <div className="display-sm" style={{ marginBottom: 8 }}>Your account isn&apos;t linked to a workspace yet</div>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          {email ? <><strong>{email}</strong> can sign in, but no company or team has been assigned to it. </> : null}
          Ask your admin (or Revnu support) to add you from <em>Users &amp; roles</em>.
        </p>
        <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 16 }}>
          <a className="btn btn-secondary" href="mailto:support@revnu.sa">Contact support</a>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
