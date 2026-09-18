#!/usr/bin/env node
// =====================================================================
//  configure-auth.mjs — one-time Supabase Auth settings through the
//  Management API (needs SUPABASE_ACCESS_TOKEN):
//    • public sign-ups OFF (accounts are created by admins only)
//    • password minimum length 8 (matches the sign-in page copy)
//    • site URL + allowed redirect URLs for the password-reset link
//
//  Usage: node scripts/configure-auth.mjs [--site https://your-app.vercel.app]
// =====================================================================
import { loadEnv, need, projectRef } from "./_env.mjs";

loadEnv();
const token = need("SUPABASE_ACCESS_TOKEN");
const ref = projectRef();
const i = process.argv.indexOf("--site");
const site = (i >= 0 ? process.argv[i + 1] : process.env.NEXT_PUBLIC_SITE_URL) || "http://localhost:3000";

const allow = [
  "http://localhost:3000/**",
  "https://*.vercel.app/**",
  site.replace(/\/$/, "") + "/**",
];

const body = {
  site_url: site,
  uri_allow_list: [...new Set(allow)].join(","),
  disable_signup: true,
  password_min_length: 8,
  mailer_autoconfirm: false,
  security_refresh_token_rotation_enabled: true,
  jwt_exp: 3600,
};

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}: ${text.slice(0, 800)}`); process.exit(1); }
const cfg = JSON.parse(text);
console.log("Auth configured:", { site_url: cfg.site_url, disable_signup: cfg.disable_signup, password_min_length: cfg.password_min_length, uri_allow_list: cfg.uri_allow_list });
