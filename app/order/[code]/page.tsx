import type { Metadata } from "next";
import PublicBoot from "@/components/PublicBoot";
import "@/styles/public-doc.css";

// The buyer's phone: a rep's share link (fixed units, shortlist or a public type-only link).
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PublicBoot kind="order" code={decodeURIComponent(code)} />;
}
