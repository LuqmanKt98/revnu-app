#!/usr/bin/env node
// =====================================================================
//  rls-tests.mjs — signs in as each seeded role against the REAL project and
//  asserts what Postgres allows / refuses. This is the regression suite for
//  audit findings SEC-01 / SEC-03 (forgeable session, cosmetic permissions)
//  and B-05 (upload gate bypass). Safe to run repeatedly: it cleans up after itself.
//
//  Needs: NEXT_PUBLIC_SUPABASE_URL + ANON key in .env.local, and the seeded
//  users' passwords (SEED-CREDENTIALS.local.txt from seed-users.mjs, or
//  TEST_PASSWORD_<legacyId> env vars, e.g. TEST_PASSWORD_nk_afnan=...).
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, need } from "./_env.mjs";

loadEnv();
const url = need("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = need("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- credentials -------------------------------------------------------
const people = JSON.parse(fs.readFileSync(path.join(root, "supabase", "seed-users.json"), "utf8"));
const passwords = {};
try {
  const txt = fs.readFileSync(path.join(root, "SEED-CREDENTIALS.local.txt"), "utf8");
  let cur = null;
  for (const line of txt.split(/\r?\n/)) {
    const e = line.match(/^\s+email:\s+(\S+)/); if (e) cur = e[1].toLowerCase();
    const p = line.match(/^\s+password:\s+(\S+)/); if (p && cur) passwords[cur] = p[1];
  }
} catch {}
for (const p of people) { const v = process.env["TEST_PASSWORD_" + p.legacyId.replace(/-/g, "_")]; if (v) passwords[p.email] = v; }

const byLegacy = Object.fromEntries(people.map((p) => [p.legacyId, p]));
async function signIn(legacyId) {
  const p = byLegacy[legacyId];
  const pw = passwords[p.email];
  if (!pw) throw new Error(`no password known for ${p.email} (run seed-users.mjs or set TEST_PASSWORD_${legacyId.replace(/-/g, "_")})`);
  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: p.email, password: pw });
  if (error) throw new Error(`sign-in ${p.email}: ${error.message}`);
  return sb;
}

// ---- tiny harness --------------------------------------------------------
let pass = 0, fail = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); pass++; results.push(["PASS", name]); console.log("  ✓", name); }
  catch (e) { fail++; results.push(["FAIL", name, e.message]); console.log("  ✗", name, "—", e.message); }
}
const expectErr = async (promise, re) => {
  const r = await promise;
  if (!r.error) throw new Error("expected an error but call succeeded");
  if (re && !re.test(r.error.message + " " + (r.error.code || ""))) throw new Error("unexpected error: " + r.error.message);
};
const expectOk = async (promise) => { const r = await promise; if (r.error) throw new Error(r.error.message); return r.data; };
const expectRows = async (promise, n, cmp = "=") => {
  const data = await expectOk(promise); const len = (data || []).length;
  if (cmp === "=" && len !== n) throw new Error(`expected ${n} rows, got ${len}`);
  if (cmp === ">" && !(len > n)) throw new Error(`expected > ${n} rows, got ${len}`);
};
/** No access at all: either the grant is missing (permission denied) or RLS filters everything out.
 *  Both are correct outcomes for a signed-out visitor; anything returned is a leak. */
const expectNoAccess = async (promise) => {
  const { data, error } = await promise;
  if (error) return;
  if ((data || []).length) throw new Error(`returned ${data.length} row(s) — data leak`);
};

async function main() {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  console.log("\nanon (signed out)");
  for (const rel of ["developers", "profiles", "orders", "units", "documents", "leads", "support_tickets", "notifications", "profiles_v", "orders_v", "support_tickets_v"]) {
    await t(`cannot read ${rel}`, () => expectNoAccess(anon.from(rel).select("*").limit(5)));
  }
  await t("can read developers_public (brand only)", async () => {
    const rows = await expectOk(anon.from("developers_public").select("*").eq("id", "noor-khuzam"));
    if (!rows.length) throw new Error("no row"); if ("cr_number" in rows[0] || "primary_email" in rows[0]) throw new Error("confidential column exposed");
  });
  await t("cannot call create_order", () => expectErr(anon.rpc("create_order", { p: {} })));
  // The public marketing form posts through /api/leads with the anon key: inserting must work,
  // reading back must not, and the status cannot be forged.
  const leadId = "L-RLS" + Date.now().toString(36).slice(-5).toUpperCase();
  await t("can submit the public Interested form", () => expectOk(anon.from("leads").insert({ id: leadId, name: "RLS Test", email: "rls@example.com", status: "new" })));
  await t("cannot submit a lead with a forged status", () => expectErr(anon.from("leads").insert({ id: leadId + "X", name: "x", email: "x@example.com", status: "onboarded" })));

  const rep = await signIn("nk-afnan");        // sales rep: perms [orders]
  const director = await signIn("nk-tarek");   // sales director: orders, inventory, financials, team, cancel
  const finance = await signIn("nk-mohamed");  // finance: financials, orders
  const admin = await signIn("msiyadi");       // Revnu super admin

  console.log("\nsales rep (orders only)");
  await t("reads own developer", () => expectRows(rep.from("developers").select("id"), 1));
  await t("reads units of own developer", () => expectRows(rep.from("units").select("number"), 0, ">"));
  await t("cannot edit developer details", () => expectRows(rep.from("developers").update({ tagline: "x" }).eq("id", "noor-khuzam").select("id"), 0));
  await t("cannot add a unit (no inventory perm)", () => expectErr(rep.from("units").insert({ number: "RLS-TEST-1", project_id: "nk-noor-khuzam", type_id: "NK-S" })));
  await t("cannot write orders directly", () => expectErr(rep.from("orders").insert({ id: "REV-99-1", developer_id: "noor-khuzam", project_id: "nk-noor-khuzam" })));
  await t("cannot invite team members (no team perm)", () => expectErr(rep.from("profiles").insert({ id: "00000000-0000-0000-0000-000000000001", developer_id: "noor-khuzam", name: "x", email: "x@x.sa" })));

  // pick two available units
  const units = await expectOk(rep.from("units").select("number, type_id").eq("status", "available").eq("project_id", "nk-noor-khuzam").limit(3));
  if (units.length < 2) throw new Error("need 2 available units for the tests");
  const [u1, u2] = units;
  let orderId = null, orderId2 = null;
  await t("reserve_order_id returns a REV-26-N reference", async () => {
    orderId = await expectOk(rep.rpc("reserve_order_id"));
    if (!/^REV-26-\d+$/.test(orderId)) throw new Error("bad id " + orderId);
  });
  const payload = (id, unit) => ({ id, projectId: "nk-noor-khuzam", unitNumbers: [unit], customerName: "RLS Test", customerId: "1000000000", customerEmail: "rls-test@example.com", customer: { fullName: "RLS Test" }, packageId: "nk-pkg-modern-minimal", designId: "nk-modern-minimal", unitPrice: 100000, furnishCost: 48300, status: "issued" });
  await t("create_order succeeds and locks the unit", async () => {
    await expectOk(rep.rpc("create_order", { p: payload(orderId, u1.number) }));
    const u = await expectOk(rep.from("units").select("status").eq("number", u1.number).single());
    if (u.status !== "sold") throw new Error("unit not locked: " + u.status);
  });
  await t("same unit cannot be sold twice (B-01)", async () => {
    const id = await expectOk(rep.rpc("reserve_order_id"));
    await expectErr(rep.rpc("create_order", { p: payload(id, u1.number) }), /UNIT_TAKEN/);
  });
  await t("issued → signed refused without a signed contract (B-05)", () => expectErr(rep.rpc("transition_order", { p_order: orderId, p_to: "signed" }), /NEEDS_SIGNED_CONTRACT/));
  await t("cannot skip a step (issued → paid)", () => expectErr(rep.rpc("transition_order", { p_order: orderId, p_to: "paid" }), /INVALID_TRANSITION/));
  await t("attach_document indexes the signed contract", () => expectOk(rep.rpc("attach_document", { p_order: orderId, p_kind: "signed_contract", p_path: `noor-khuzam/${orderId}/signed_contract-test.pdf`, p_name: "signed.pdf" })));
  await t("attach_document refuses a path outside the order folder", () => expectErr(rep.rpc("attach_document", { p_order: orderId, p_kind: "payment_proof", p_path: `other-dev/${orderId}/x.pdf`, p_name: "x.pdf" })));
  await t("issued → signed now allowed", () => expectOk(rep.rpc("transition_order", { p_order: orderId, p_to: "signed" })));
  await t("signed → paid refused without proof of payment", () => expectErr(rep.rpc("transition_order", { p_order: orderId, p_to: "paid" }), /NEEDS_PAYMENT_PROOF/));
  await t("rep cannot cancel (no cancel perm)", () => expectErr(rep.rpc("cancel_order", { p_order: orderId, p_reason: "test" }), /not allowed/i));
  await t("rep cannot mark receivables paid", () => expectErr(rep.rpc("set_receivable_paid", { p_order: orderId, p_milestone: "sign", p_paid: true }), /not allowed/i));

  console.log("\nfinance (financials + orders view)");
  await t("cannot submit an order? (finance holds 'orders' → allowed by design)", async () => {
    orderId2 = await expectOk(finance.rpc("reserve_order_id"));
    await expectOk(finance.rpc("create_order", { p: payload(orderId2, u2.number) }));
  });
  await t("cannot invite team members", () => expectErr(finance.from("profiles").insert({ id: "00000000-0000-0000-0000-000000000002", developer_id: "noor-khuzam", name: "x", email: "y@x.sa" })));

  console.log("\nsales director (cancel + team + inventory)");
  await t("cancel_order requires a reason", () => expectErr(director.rpc("cancel_order", { p_order: orderId2, p_reason: "  " }), /REASON_REQUIRED/));
  await t("cancel_order releases the unit", async () => {
    await expectOk(director.rpc("cancel_order", { p_order: orderId2, p_reason: "rls test" }));
    const u = await expectOk(director.from("units").select("status").eq("number", u2.number).single());
    if (u.status !== "available") throw new Error("unit still " + u.status);
  });
  await t("reinstate_order re-locks the unit", async () => {
    await expectOk(director.rpc("reinstate_order", { p_order: orderId2 }));
    const u = await expectOk(director.from("units").select("status").eq("number", u2.number).single());
    if (u.status !== "sold") throw new Error("unit is " + u.status);
  });
  await t("can edit a unit (inventory perm)", () => expectRows(director.from("units").update({ view: "rls" }).eq("number", u2.number).select("number"), 1));
  await t("cannot edit the developer's commission ladder (Revnu only)", () => expectRows(director.from("commission_levels").update({ pct: 1 }).eq("developer_id", "noor-khuzam").eq("id", "lvl-rep").select("id"), 0));
  await t("cannot see Revnu staff profiles", () => expectRows(director.from("profiles").select("id").is("developer_id", null), 0));
  await t("cannot promote a colleague to Revnu staff", () => expectErr(director.from("profiles").update({ revnu_role_id: "super_admin", developer_id: null }).eq("legacy_id", "nk-afnan").select("id")));

  console.log("\nRevnu super admin");
  await t("reads every developer's data", () => expectRows(admin.from("orders").select("id"), 0, ">"));
  await t("can edit the developer", () => expectRows(admin.from("developers").update({ tagline: "A home of getaways" }).eq("id", "noor-khuzam").select("id"), 1));
  await t("can read the notification outbox", () => expectRows(admin.from("notifications").select("id").eq("order_id", orderId), 0, ">"));
  await t("activity log recorded the transitions", () => expectRows(admin.from("order_activity").select("id").eq("order_id", orderId), 2, ">"));
  await t("delete_order cleans up and releases units", async () => {
    await expectOk(admin.rpc("delete_order", { p_order: orderId }));
    await expectOk(admin.rpc("delete_order", { p_order: orderId2 }));
    const u = await expectOk(admin.from("units").select("status").eq("number", u1.number).single());
    if (u.status !== "available") throw new Error("unit still " + u.status);
    await admin.from("units").update({ view: "" }).eq("number", u2.number);
    await admin.from("leads").delete().like("id", "L-RLS%");
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("\nharness error:", e.message); process.exit(2); });
