import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The public marketing site is the prototype's index.html served verbatim (static, no app logic).
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/home.html" }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
};

export default nextConfig;
