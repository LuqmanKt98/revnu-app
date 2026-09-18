import { gate } from "@/lib/auth/gate";
import PortalBoot from "@/components/PortalBoot";
import NoWorkspace from "@/components/NoWorkspace";

export const dynamic = "force-dynamic";
type SP = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { profile, snapshot, params } = await gate("developer", sp, "/developer");
  if (!profile) return <NoWorkspace />;
  return <PortalBoot portal="developer" snapshot={snapshot} me={profile} params={params} />;
}
