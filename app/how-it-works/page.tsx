import type { Metadata } from "next";
import { cookies } from "next/headers";
import PublicContentPage from "@/components/public/PublicContentPage";

const lang = async () => ((await cookies()).get("revnu_lang")?.value === "en" ? "en" : "ar");

export async function generateMetadata(): Promise<Metadata> {
  const ar = (await lang()) === "ar";
  return {
    title: ar ? "كيف نعمل — Revnu" : "How It Works — Revnu",
    description: "Follow the Revnu journey from developer onboarding and buyer selection to contracts, delivery and payouts.",
    openGraph: { title: "How It Works — Revnu", description: "From onboarding to delivery, see how Revnu connects every step of the property sales journey.", type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export default async function HowItWorksPage() {
  return <PublicContentPage page="how-it-works" lang={await lang()} />;
}
