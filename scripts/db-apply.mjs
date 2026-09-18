#!/usr/bin/env node
// =====================================================================
//  db-apply.mjs — applies supabase/migrations/*.sql (and optionally seed.sql)
//  to the client's Supabase project through the Management API.
//
//  Why not `supabase db push`? It needs the database password; the
//  Management API only needs SUPABASE_ACCESS_TOKEN, which we have.
//  Applied migrations are recorded in private.applied_migrations.
//
//  Usage:
//    node scripts/db-apply.mjs            # apply pending migrations
//    node scripts/db-apply.mjs --seed     # ... then run supabase/seed.sql (idempotent)
//    node scripts/db-apply.mjs --sql "select 1"   # ad-hoc query (debugging)
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, projectRef } from "./_env.mjs";

loadEnv();
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = projectRef();
if (!token) { console.error("SUPABASE_ACCESS_TOKEN is missing in .env.local"); process.exit(1); }
if (!ref) { console.error("NEXT_PUBLIC_SUPABASE_URL is missing/invalid in .env.local"); process.exit(1); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = `https://api.supabase.com/v1/projects/${ref}/database/query`;

export async function runSql(query, label = "query") {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} — ${text.slice(0, 2000)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function appliedSet() {
  try {
    const rows = await runSql("select name from private.applied_migrations order by name", "applied_migrations");
    return new Set((Array.isArray(rows) ? rows : []).map((r) => r.name));
  } catch (e) {
    if (/does not exist/i.test(String(e.message))) return new Set();
    throw e;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--sql");
  if (i >= 0) { console.log(JSON.stringify(await runSql(args[i + 1], "ad-hoc"), null, 2)); return; }

  const dir = path.join(root, "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = await appliedSet();
  for (const f of files) {
    if (done.has(f)) { console.log(`= ${f} (already applied)`); continue; }
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    process.stdout.write(`> ${f} … `);
    await runSql(sql, f);
    await runSql(`insert into private.applied_migrations(name) values ('${f}') on conflict do nothing`, "record " + f);
    console.log("ok");
  }
  if (args.includes("--seed")) {
    const seed = fs.readFileSync(path.join(root, "supabase", "seed.sql"), "utf8");
    process.stdout.write("> seed.sql … ");
    await runSql(seed, "seed.sql");
    console.log("ok");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error("\n" + e.message); process.exit(1); });
}
