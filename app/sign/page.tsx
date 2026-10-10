import { redirect } from "next/navigation";

// The prototype's sign.html?c=<slug>-<CODE> links keep working.
type SP = Record<string, string | string[] | undefined>;
export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const c = String(sp.c || sp.code || "").trim();
  redirect(c ? "/sign/" + encodeURIComponent(c) : "/");
}
