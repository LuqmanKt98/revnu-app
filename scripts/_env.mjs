// Tiny .env.local loader for scripts (no dependency on dotenv). Never logs values.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadEnv() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const f of [".env", ".env.local"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}

export function projectRef() {
  const m = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  return m ? m[1] : null;
}

export function need(name) {
  const v = process.env[name];
  if (!v) { console.error(`${name} is missing in .env.local`); process.exit(1); }
  return v;
}
