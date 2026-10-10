import type { Metadata } from "next";
import PublicBoot from "@/components/PublicBoot";
import "@/styles/public-doc.css";

// The buyer reads the agreement and signs it on their own phone.
export const metadata: Metadata = { title: "Your agreement", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PublicBoot kind="sign" code={decodeURIComponent(code)} />;
}
