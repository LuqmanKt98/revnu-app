// Shared server-side gate for the three portals: verified session → profile → snapshot.
import { redirect } from "next/navigation";
import { currentSession, destinationFor } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchSnapshot } from "@/lib/data/snapshot";

type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export async function gate(portal: "sales" | "developer" | "revnu", sp: SP, pathname: string) {
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))).toString();
  const here = pathname + (qs ? "?" + qs : "");
  const { user, profile } = await currentSession();
  if (!user) redirect("/login?next=" + encodeURIComponent(here));
  if (!profile) return { profile: null, snapshot: null, params: sp };          // account without a workspace → friendly page
  if (profile.mustChangePassword) redirect("/login?set-password=1&next=" + encodeURIComponent(here));

  const isRevnu = !profile.developerId;
  const devParam = one(sp.dev);
  // Portal rules ported from the prototype's bootstraps:
  //  · Revnu HQ only for Revnu staff; a developer-side session is bounced to its own home.
  //  · Developer portal: the SESSION decides; a session of another developer (or Revnu staff) goes to login/home.
  //  · Sales: a developer's own staff; Revnu staff may only open a recorded agreement (?order=) read-only.
  if (portal === "revnu" && !isRevnu) redirect(destinationFor(profile));
  if (portal === "developer") {
    if (isRevnu) redirect("/revnu");
    if (devParam && devParam !== profile.developerId) redirect(destinationFor(profile));
  }
  if (portal === "sales") {
    const viewingOrder = !!one(sp.order);
    if (isRevnu && !viewingOrder) redirect("/revnu");
    if (!isRevnu && devParam && devParam !== profile.developerId) redirect(destinationFor(profile));
  }
  const sb = await supabaseServer();
  const snapshot = await fetchSnapshot(sb);
  const params = { ...sp, dev: devParam || profile.developerId || "" };
  return { profile, snapshot, params };
}
