import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import "@/styles/styles.css";
import "@/styles/mobile.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revnu",
  description: "Sell furnished, smart, operated units in one sitting.",
  icons: { icon: "/brand/favicon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// The language cookie drives <html dir/lang> on the server so Arabic (the default)
// renders right-to-left from the first paint — no flash of the wrong direction.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get("revnu_lang")?.value === "en" ? "en" : "ar";
  const ar = lang === "ar";
  return (
    <html lang={lang} dir={ar ? "rtl" : "ltr"} className={ar ? "lang-ar" : undefined}>
      <head>
        {/* Same bilingual engine as the prototype (window.I18N) — loaded before any app code, exactly as before. */}
        <Script src="/i18n.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
