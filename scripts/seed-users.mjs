#!/usr/bin/env node
// =====================================================================
//  seed-users.mjs — creates the seeded people as real Supabase Auth users
//  (no e-mail is ever sent) and their profiles / project assignments.
//
//  Each NEW account gets a random temporary password and
//  must_change_password = true (the app forces a new password on first
//  sign-in). Temporary passwords are written ONLY to
//  SEED-CREDENTIALS.local.txt (git-ignored) for secure hand-over.
//
//  Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
//  Usage: node scripts/seed-users.mjs [--reset]   (--reset re-issues temp passwords)
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, need } from "./_env.mjs";

loadEnv();
const url = need("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");
const reset = process.argv.includes("--reset");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const people = JSON.parse(fs.readFileSync(path.join(root, "supabase", "seed-users.json"), "utf8"));

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// Readable, strong temporary password (no ambiguous glyphs) — users must replace it on first sign-in.
export function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}

async function findAuthUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function main() {
  const creds = [];
  const idByLegacy = {};

  for (const p of people) {
    let user = await findAuthUserByEmail(p.email);
    let pw = null;
    if (!user) {
      pw = tempPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email: p.email, password: pw, email_confirm: true,
        user_metadata: { name: p.name, name_ar: p.nameAr || null },
      });
      if (error) throw new Error(`createUser ${p.email}: ${error.message}`);
      user = data.user;
      console.log(`+ auth user ${p.email}`);
    } else if (reset) {
      pw = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(user.id, { password: pw });
      if (error) throw new Error(`reset ${p.email}: ${error.message}`);
      console.log(`~ password reset ${p.email}`);
    } else {
      console.log(`= auth user exists ${p.email}`);
    }
    idByLegacy[p.legacyId] = user.id;

    const row = {
      id: user.id, legacy_id: p.legacyId, developer_id: p.developerId,
      name: p.name, name_ar: p.nameAr, email: p.email,
      role: p.developerId ? p.role : null, role_ar: p.roleAr,
      revnu_role_id: p.developerId ? null : (p.roleId || "team"),
      perms: p.perms, commission_level_id: p.commissionLevelId,
      must_change_password: pw ? true : undefined,
    };
    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
    const { error: pe } = await admin.from("profiles").upsert(row, { onConflict: "id" });
    if (pe) throw new Error(`profile ${p.email}: ${pe.message}`);
    if (pw) creds.push({ email: p.email, name: p.name, password: pw });
  }

  // second pass: reporting lines + project assignments
  for (const p of people) {
    const id = idByLegacy[p.legacyId];
    if (p.reportsTo && idByLegacy[p.reportsTo]) {
      const { error } = await admin.from("profiles").update({ reports_to: idByLegacy[p.reportsTo] }).eq("id", id);
      if (error) throw new Error(`reports_to ${p.email}: ${error.message}`);
    }
    if (p.assignedProjectIds?.length) {
      const { error } = await admin.from("profile_projects").upsert(p.assignedProjectIds.map((project_id) => ({ profile_id: id, project_id })), { onConflict: "profile_id,project_id" });
      if (error) throw new Error(`profile_projects ${p.email}: ${error.message}`);
    }
  }

  if (creds.length) {
    const file = path.join(root, "SEED-CREDENTIALS.local.txt");
    const lines = ["Revnu — temporary sign-in credentials (hand over securely, then delete this file)", `Generated ${new Date().toISOString()}`, "Users must set a new password on first sign-in.", ""];
    creds.forEach((c) => lines.push(`${c.name}\n  email:    ${c.email}\n  password: ${c.password}\n`));
    fs.writeFileSync(file, lines.join("\n"), "utf8");
    console.log(`\n${creds.length} temporary password(s) written to ${path.basename(file)} (git-ignored).`);
  } else {
    console.log("\nNo new accounts; no credentials written.");
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
