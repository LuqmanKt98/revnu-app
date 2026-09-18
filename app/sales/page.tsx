import { gate } from "@/lib/auth/gate";
import PortalBoot from "@/components/PortalBoot";
import NoWorkspace from "@/components/NoWorkspace";

export const dynamic = "force-dynamic";
type SP = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { profile, snapshot, params } = await gate("sales", sp, "/sales");
  if (!profile) return <NoWorkspace />;
  return <PortalBoot portal="sales" snapshot={snapshot} me={profile} params={params} />;
}
