#!/usr/bin/env node
// =====================================================================
//  check-port.mjs — static cross-reference check of the ported code.
//  The three portals were ported from the prototype partly mechanically,
//  so this verifies that every call site still resolves:
//
//    portals/*.jsx      D.xxx(…)      -> exported by lib/data/store.js
//    lib/data/store.js  api.a.b(…)    -> defined in lib/data/api.js
//    lib/data/api.js    .rpc("name")  -> a function in supabase/migrations
//    api.js/snapshot.js .from("t")    -> a table or view in supabase/migrations
//    lib/data/mappers.js columns      -> columns of that table/view
//    plus: prototype leftovers that must not survive the port
//
//  Runs offline (no database needed) and is part of CI.
//  Usage: node scripts/check-port.mjs
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const problems = [];
const note = (file, msg) => problems.push(`${file}: ${msg}`);

// ---------------------------------------------------------------------
// 1. SQL inventory: tables, views, columns, functions
// ---------------------------------------------------------------------
const sqlDir = path.join(root, "supabase", "migrations");
const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");

const tables = new Map(); // name -> Set(columns)
for (const m of sql.matchAll(/create table (?:if not exists )?(?:public|private)\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, name, body] = m;
  const cols = new Set();
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("--") || /^(primary key|unique|constraint|foreign key|check)\b/i.test(t)) continue;
    const c = t.match(/^"?(\w+)"?\s+/);
    if (c) cols.add(c[1]);
  }
  tables.set(name, cols);
}

// A view body contains no ";" until its end, so this is unambiguous.
const views = new Map();
for (const m of sql.matchAll(/create view public\.(\w+)([^;]*);/g)) {
  const [, name, body] = m;
  const cols = new Set();
  for (const base of body.matchAll(/from public\.(\w+)/g)) {
    if (tables.has(base[1])) for (const c of tables.get(base[1])) cols.add(c);
  }
  for (const alias of body.matchAll(/\bas (\w+)\b/g)) cols.add(alias[1]);           // … as effective_perms
  const select = body.match(/select\s+([\s\S]*?)\s+from\b/);
  if (select) {
    for (const piece of select[1].split(",")) {
      const direct = piece.trim().match(/^(?:\w+\.)?(\w+)$/);                        // plain column projections
      if (direct) cols.add(direct[1]);
    }
  }
  views.set(name, cols);
}
const relations = new Map([...tables, ...views]);
const functions = new Set([...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]));

// ---------------------------------------------------------------------
// 2. store.js exports  vs  D.* call sites in the portals
// ---------------------------------------------------------------------
const storeSrc = read("lib/data/store.js");
const exportBlock = storeSrc.slice(storeSrc.lastIndexOf("const D = {"), storeSrc.lastIndexOf("};"));
const storeExports = new Set();
for (const m of exportBlock.matchAll(/(?:^|[\s,{])([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,:}]|$)/gm)) storeExports.add(m[1]);

const portalFiles = [
  "portals/sales/SalesApp.jsx", "portals/developer/DeveloperApp.jsx", "portals/revnu/RevnuApp.jsx",
  "portals/shared/contract.jsx", "portals/shared/wordexport.jsx", "lib/data/support.js",
];
for (const f of portalFiles) {
  const src = read(f);
  const used = new Set([...src.matchAll(/\bD\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  for (const name of used) if (!storeExports.has(name)) note(f, `uses D.${name} which lib/data/store.js does not export`);
}

// ---------------------------------------------------------------------
// 3. api.* call sites  vs  the api surface (brace-depth scan, so single-line
//    groups such as `snapshot: { fetch: … }` are handled)
// ---------------------------------------------------------------------
const apiSrc = read("lib/data/api.js");
const apiBlock = apiSrc.slice(apiSrc.indexOf("export const api = {"));
const apiGroups = new Map();
{
  let depth = 0, group = null;
  for (let i = apiBlock.indexOf("{"); i < apiBlock.length; i++) {
    const ch = apiBlock[i];
    // Skip comments FIRST — an apostrophe in prose ("the caller's session") must not
    // be mistaken for a string quote, which would swallow the rest of the file.
    if (ch === "/" && apiBlock[i + 1] === "/") { i = apiBlock.indexOf("\n", i); if (i < 0) break; continue; }
    if (ch === "/" && apiBlock[i + 1] === "*") { i = apiBlock.indexOf("*/", i) + 1; if (i < 1) break; continue; }
    if (ch === '"' || ch === "'" || ch === "`") {                 // skip string literals
      const q = ch; i++;
      while (i < apiBlock.length && apiBlock[i] !== q) { if (apiBlock[i] === "\\") i++; i++; }
      continue;
    }
    if (ch === "{") { depth++; continue; }
    if (ch === "}") { depth--; if (depth <= 1) group = null; continue; }
    if (!/[A-Za-z_]/.test(ch)) continue;
    if (!/[\s{,]/.test(apiBlock[i - 1] || "")) continue;
    const key = apiBlock.slice(i).match(/^(?:async\s+)?(\w+)\s*[:(]/);
    if (!key) continue;
    if (depth === 1) { group = key[1]; if (!apiGroups.has(group)) apiGroups.set(group, new Set()); }
    else if (depth === 2 && group) apiGroups.get(group).add(key[1]);
    i += key[0].length - 1;
  }
}
for (const f of ["lib/data/store.js", "lib/data/support.js"]) {
  const src = read(f);
  for (const m of src.matchAll(/\bapi\.(\w+)\.(\w+)\(/g)) {
    const [, group, method] = m;
    if (!apiGroups.has(group)) { note(f, `uses api.${group}.* — no such group in lib/data/api.js`); continue; }
    if (!apiGroups.get(group).has(method)) note(f, `uses api.${group}.${method}() — not defined in lib/data/api.js`);
  }
}

// ---------------------------------------------------------------------
// 4. RPC + table names used from the client  vs  SQL
// ---------------------------------------------------------------------
const clientFiles = [
  "lib/data/api.js", "lib/data/snapshot.js", "lib/auth/session.ts", "lib/auth/gate.ts",
  "app/api/users/route.ts", "app/api/users/[id]/route.ts", "app/api/users/[id]/reset-password/route.ts",
  "app/api/leads/route.ts", "app/api/notifications/dispatch/route.ts", "app/login/page.tsx", "scripts/seed-users.mjs",
];
for (const f of clientFiles) {
  const src = read(f);
  for (const m of src.matchAll(/\.rpc\(\s*["'](\w+)["']/g)) if (!functions.has(m[1])) note(f, `calls rpc("${m[1]}") which no migration defines`);
  for (const m of src.matchAll(/\.from\(\s*["'](\w+)["']/g)) {
    if (!relations.has(m[1])) note(f, `queries table/view "${m[1]}" which no migration defines`);
  }
}
const snapSrc = read("lib/data/snapshot.js");
for (const m of snapSrc.matchAll(/\["(\w+)",\s*"(\w+)"/g)) {
  if (!relations.has(m[2])) note("lib/data/snapshot.js", `snapshot plan references "${m[2]}" which no migration defines`);
}

// ---------------------------------------------------------------------
// 5. mapper columns  vs  real columns
// ---------------------------------------------------------------------
const mappers = await import(pathToFileURL(path.join(root, "lib", "data", "mappers.js")).href);
const MAPPER_RELATION = {
  developers: "developers", commissionLevels: "commission_levels", projects: "projects", unitTypes: "unit_types",
  units: "units", designStyles: "design_styles", packages: "packages", smartHome: "smart_home", opsModels: "ops_models",
  constructionMilestones: "construction_milestones", paymentPlans: "payment_plans", contractTemplates: "contract_templates",
  profiles: "profiles_v", orders: "orders_v", orderActivity: "order_activity", documents: "documents", invoices: "invoices",
  receivablePaid: "receivable_paid", payouts: "payouts", notifications: "notifications", supportTickets: "support_tickets_v",
  leads: "leads", devPerms: "dev_perms", devRoles: "dev_roles", revnuPerms: "revnu_perms", revnuRoles: "revnu_roles",
  contractVars: "contract_vars",
};
for (const [mapperName, relation] of Object.entries(MAPPER_RELATION)) {
  const m = mappers[mapperName];
  if (!m) { note("lib/data/mappers.js", `no mapper exported as "${mapperName}"`); continue; }
  const cols = relations.get(relation);
  if (!cols) { note("lib/data/mappers.js", `mapper "${mapperName}" targets "${relation}" which no migration defines`); continue; }
  for (const db of Object.keys(m.db2js)) {
    if (!cols.has(db)) note("lib/data/mappers.js", `${mapperName}: column "${db}" does not exist on ${relation}`);
  }
}

// ---------------------------------------------------------------------
// 6. Prototype leftovers that must not survive the port
// ---------------------------------------------------------------------
for (const f of [...portalFiles, "lib/data/store.js", "app/login/LoginClient.jsx"]) {
  const src = read(f);
  for (const [re, msg] of [
    [/localStorage\.(get|set|remove)Item\(\s*["']revnu_(?!lang|tour)/, "still reads/writes prototype data in localStorage"],
    [/sessionStorage\.(get|set|remove)Item\(\s*["']revnu_session/, "still uses the forgeable sessionStorage session (audit SEC-01)"],
    [/f\.size\s*<\s*2500000/, "still contains the silent 2.5 MB file drop (audit B-06)"],
    [/9 STEPS/, "still claims a 9-step flow (audit B-07)"],
  ]) if (re.test(src)) note(f, msg);
}
if (/9 STEPS/.test(read("public/home.html"))) note("public/home.html", "still claims a 9-step flow (audit B-07)");

// ---------------------------------------------------------------------
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`port check passed — ${tables.size} tables, ${views.size} views, ${functions.size} rpcs, ${storeExports.size} store exports verified`);
