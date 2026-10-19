import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The public site: "/" is the client's landing page (public/home.html, static); /why-us, /how-it-works and /auth are app pages.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/home.html" }], afterFiles: [], fallback: [] };
  },
  // Addresses of the client's original site (its own dashboards and sign-in helpers) open the matching part of this app.
  async redirects() {
    return [
      { source: "/admin", destination: "/developer", permanent: false },
      { source: "/admin/:path*", destination: "/developer", permanent: false },
      { source: "/sales/:path+", destination: "/sales", permanent: false },
      { source: "/revnu/:path+", destination: "/revnu", permanent: false },
      { source: "/portal/developer", destination: "/developer", permanent: false },
      { source: "/portal/sales", destination: "/sales", permanent: false },
      { source: "/portal/revnu", destination: "/revnu", permanent: false },
      { source: "/portal/:name", destination: "/login", permanent: false },
      { source: "/reset-password", destination: "/login", permanent: false },
      { source: "/access-denied", destination: "/login", permanent: false },
      { source: "/login.html", destination: "/login", permanent: false },
    ];
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Framing, plugins and <base> hijacking are off everywhere; scripts and styles keep their current sources.
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), web-share=(self)" },
      ],
    }];
  },
};

export default nextConfig;
