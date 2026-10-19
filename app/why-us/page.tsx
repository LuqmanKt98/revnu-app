import type { Metadata } from "next";
import { cookies } from "next/headers";
import PublicContentPage from "@/components/public/PublicContentPage";

const lang = async () => ((await cookies()).get("revnu_lang")?.value === "en" ? "en" : "ar");

export async function generateMetadata(): Promise<Metadata> {
  const ar = (await lang()) === "ar";
  return {
    title: ar ? "لماذا نحن — Revnu" : "Why Us — Revnu",
    description: "See how Revnu creates more value for property developers, sales teams and buyers through one connected sales journey.",
    openGraph: { title: "Why Us — Revnu", description: "One connected property sales journey designed so developers, sales teams and buyers all win.", type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export default async function WhyUsPage() {
  return <PublicContentPage page="why-us" lang={await lang()} />;
}
