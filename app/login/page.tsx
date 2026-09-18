import { createClient } from "@supabase/supabase-js";
import { currentSession } from "@/lib/auth/session";
import LoginShell from "./LoginShell";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function LoginPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const devId = one(sp.dev);
  const asDev = one(sp.as) === "dev";
  const next = one(sp.next);
  const setPw = one(sp["set-password"]) === "1" || one(sp.reset) === "1";

  // White-label chrome for ?dev= comes from the one anon-readable view (brand only, nothing confidential).
  let dev: Record<string, unknown> | null = null;
  if (devId) {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await anon.from("developers_public").select("*").eq("id", devId).maybeSingle();
    if (data) dev = { id: data.id, name: data.name, nameAr: data.name_ar, initials: data.initials, domain: data.domain, brand: data.brand, logo: data.logo, logoDark: data.logo_dark };
  }

  const { profile } = await currentSession();
  const mode = profile && (setPw || profile.mustChangePassword) ? "setpw" : undefined;
  const signedInAs = profile ? { id: profile.id, name: profile.name, nameAr: profile.nameAr, email: profile.email, developerId: profile.developerId, effectivePerms: profile.effectivePerms, mustChangePassword: profile.mustChangePassword } : null;

  return <LoginShell dev={dev} asDev={asDev} next={next} signedInAs={signedInAs} mode={mode} />;
}
