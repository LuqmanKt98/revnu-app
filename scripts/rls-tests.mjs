#!/usr/bin/env node
// =====================================================================
//  rls-tests.mjs — signs in as each seeded role against the REAL project and
//  asserts what Postgres allows / refuses. This is the regression suite for
//  audit findings SEC-01 / SEC-03 (forgeable session, cosmetic permissions)
//  and B-05 (upload gate bypass), and for both v2 audits of 11 Oct 2026.
//
//  The client works in this database, so a run leaves nothing behind but what it
//  cannot avoid: it creates three orders (three REV numbers per run — references are
//  never reused) and deletes them; it removes exactly the inbox rows that name its own
//  links and orders; every value it changes (a unit's view) is written back. With
//  SUPABASE_ACCESS_TOKEN set it also removes this machine's rate-limit rows
//  (private.public_hits); without it (CI) those age out after a day. Each run uses
//  2 submissions + 1 signature of the hourly per-IP limits (30 / 60).
//
//  Needs: NEXT_PUBLIC_SUPABASE_URL + ANON key in .env.local, and the seeded
//  users' passwords (SEED-CREDENTIALS.local.txt from seed-users.mjs, or
//  TEST_PASSWORD_<legacyId> env vars, e.g. TEST_PASSWORD_nk_afnan=...).
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, need, projectRef } from "./_env.mjs";

loadEnv();
const url = need("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = need("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runStart = new Date(Date.now() - 5000).toISOString();

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

// Management API (only with SUPABASE_ACCESS_TOKEN): this machine's rate-limit rows are not reachable otherwise.
async function managementSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`management API: HTTP ${res.status}`);
  return res.json();
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
const pageList = (n) => Array.from({ length: n }, (_, i) => "p" + (i + 1));

async function main() {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  // a buyer's phone that forges its address: the server must record the edge's address instead (S-A)
  const spoofer = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { "X-Forwarded-For": "1.2.3.4", "True-Client-IP": "1.2.3.4" } } });
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
  const director = await signIn("nk-tarek");   // sales director: orders, inventory, financials, team, cancel, contracts
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
  // the inventory price of a unit (list, or the beneficiary price): the server refuses any other unit price (S3)
  const basePrice = Object.fromEntries((await expectOk(rep.from("unit_types").select("id, base_price").eq("project_id", "nk-noor-khuzam"))).map((x) => [x.id, Number(x.base_price) || 0]));
  const listPrice = async (number) => { const u = await expectOk(rep.from("units").select("type_id, price_adj").eq("number", number).single()); return (basePrice[u.type_id] || 0) + (Number(u.price_adj) || 0); };
  const benPrice = async (number) => { const u = await expectOk(rep.from("units").select("price_ben").eq("number", number).single()); return u.price_ben == null ? listPrice(number) : Number(u.price_ben); };
  const priceOf = Object.fromEntries(await Promise.all([u1, u2].map(async (u) => [u.number, await listPrice(u.number)])));
  // the furnishing package's price for a unit, VAT per line as the wizard stores it: the server re-prices every extras line (S3)
  const pkgPricing = (await expectOk(rep.from("packages").select("pricing").eq("id", "nk-pkg-modern-minimal").single())).pricing || {};
  const typeOf = async (number) => (await expectOk(rep.from("units").select("type_id").eq("number", number).single())).type_id;
  const furnishFor = async (number) => Math.round((Number(pkgPricing[await typeOf(number)]) || 0) * 115 / 100);
  const furnishOf = Object.fromEntries(await Promise.all([u1, u2].map(async (u) => [u.number, await furnishFor(u.number)])));
  const u2view = (await expectOk(rep.from("units").select("view").eq("number", u2.number).single())).view;
  let orderId = null, orderId2 = null, link2 = null, sub2 = null;
  await t("reserve_order_id returns a REV-26-N reference", async () => {
    orderId = await expectOk(rep.rpc("reserve_order_id"));
    if (!/^REV-26-\d+$/.test(orderId)) throw new Error("bad id " + orderId);
  });
  const payload = (id, unit) => ({ id, projectId: "nk-noor-khuzam", unitNumbers: [unit], customerName: "RLS Test", customerId: "1000000000", customerEmail: "rls-test@example.com", customer: { fullName: "RLS Test", nationalId: "1000000000", email: "rls-test@example.com" }, packageId: "nk-pkg-modern-minimal", designId: "nk-modern-minimal", unitPrice: priceOf[unit] || 0, furnishCost: furnishOf[unit] || 0, status: "issued" });
  await t("create_order succeeds and locks the unit", async () => {
    await expectOk(rep.rpc("create_order", { p: payload(orderId, u1.number) }));
    const u = await expectOk(rep.from("units").select("status").eq("number", u1.number).single());
    if (u.status !== "sold") throw new Error("unit not locked: " + u.status);
  });
  // Every refusal below is decided before a REV number is drawn (B-6), so none of them uses one up.
  await t("create_order refuses a forged reference", async () => {
    await expectErr(rep.rpc("create_order", { p: payload("HACK-1", u2.number) }), /invalid order reference/);
    await expectErr(rep.rpc("create_order", { p: payload("REV-26-999999", u2.number) }), /invalid order reference/);
  });
  await t("create_order refuses negative amounts", () => expectErr(rep.rpc("create_order", { p: Object.assign(payload(null, u2.number), { unitPrice: -1 }) }), /negative/));
  await t("create_order refuses a unit price that is not the inventory price (S3)", () => expectErr(rep.rpc("create_order", { p: Object.assign(payload(null, u2.number), { unitPrice: 1 }) }), /PRICE_MISMATCH/));
  await t("create_order refuses an extras price that is not the catalogue's (S3)", () => expectErr(rep.rpc("create_order", { p: Object.assign(payload(null, u2.number), { furnishCost: 1 }) }), /PRICE_MISMATCH/));
  await t("create_order refuses a kitchen the project does not offer, by name (B-9)", () => expectErr(rep.rpc("create_order", { p: Object.assign(payload(null, u2.number), { kitchenId: "any-kitchen", kitchenCost: 0 }) }), /NOT_OFFERED:kitchen/));
  await t("create_order refuses a forged rental projection (B-13)", () => expectErr(rep.rpc("create_order", { p: Object.assign(payload(null, u2.number), { opsId: "nk-monthly", operatorFee: 10, monthlyNet: 999999999 }) }), /PRICE_MISMATCH:monthlyNet/));
  await t("create_order refuses item columns that contradict the per-unit choices (B-12)", async () => {
    const two = units.slice(0, 3).filter((u) => u.number !== u1.number).slice(0, 2);
    if (two.length < 2) return;
    const p = Object.assign(payload(null, two[0].number), { unitNumbers: two.map((u) => u.number), packageId: "nk-pkg-new-classic", perUnitMode: true,
      perUnit: Object.fromEntries(two.map((u) => [u.number, { packageId: "nk-pkg-modern-minimal" }])),
      unitPrice: (await Promise.all(two.map((u) => listPrice(u.number)))).reduce((a, b) => a + b, 0), furnishCost: (await Promise.all(two.map((u) => furnishFor(u.number)))).reduce((a, b) => a + b, 0) });
    await expectErr(rep.rpc("create_order", { p }), /PRICE_MISMATCH:packageId/);
  });
  await t("same unit cannot be sold twice (B-01)", () => expectErr(rep.rpc("create_order", { p: payload(null, u1.number) }), /UNIT_TAKEN/));
  await t("issued → signed refused without a signed contract (B-05)", () => expectErr(rep.rpc("transition_order", { p_order: orderId, p_to: "signed" }), /NEEDS_SIGNED_CONTRACT/));
  await t("cannot skip a step (issued → paid)", () => expectErr(rep.rpc("transition_order", { p_order: orderId, p_to: "paid" }), /INVALID_TRANSITION/));
  await t("attach_document refuses a file that was never uploaded (B-05 via API)", () => expectErr(rep.rpc("attach_document", { p_order: orderId, p_kind: "signed_contract", p_path: `noor-khuzam/${orderId}/signed_contract-phantom.pdf`, p_name: "phantom.pdf" }), /DOCUMENT_MISSING/));
  await t("attach_document refuses a path traversal", () => expectErr(rep.rpc("attach_document", { p_order: orderId, p_kind: "signed_contract", p_path: `noor-khuzam/${orderId}/../REV-26-1/x.pdf`, p_name: "x.pdf" }), /does not match|DOCUMENT_MISSING/));
  await t("rep can upload under the order's folder, not another tenant's", async () => {
    await expectOk(rep.storage.from("documents").upload(`noor-khuzam/${orderId}/signed_contract-test.pdf`, Buffer.from("%PDF-1.4 rls"), { contentType: "application/pdf" }));
    await expectErr(rep.storage.from("documents").upload(`other-dev/${orderId}/x.pdf`, Buffer.from("%PDF-1.4 rls"), { contentType: "application/pdf" }));
  });
  await t("attach_document indexes the uploaded signed contract", () => expectOk(rep.rpc("attach_document", { p_order: orderId, p_kind: "signed_contract", p_path: `noor-khuzam/${orderId}/signed_contract-test.pdf`, p_name: "signed.pdf" })));
  await t("attach_document refuses a path outside the order folder", () => expectErr(rep.rpc("attach_document", { p_order: orderId, p_kind: "payment_proof", p_path: `other-dev/${orderId}/x.pdf`, p_name: "x.pdf" })));
  await t("issued → signed now allowed", () => expectOk(rep.rpc("transition_order", { p_order: orderId, p_to: "signed" })));
  await t("signed → paid refused without proof of payment", () => expectErr(rep.rpc("transition_order", { p_order: orderId, p_to: "paid" }), /NEEDS_PAYMENT_PROOF/));
  await t("rep cannot cancel (no cancel perm)", () => expectErr(rep.rpc("cancel_order", { p_order: orderId, p_reason: "test" }), /not allowed/i));
  await t("rep cannot mark receivables paid", () => expectErr(rep.rpc("set_receivable_paid", { p_order: orderId, p_milestone: "sign", p_paid: true }), /not allowed/i));

  console.log("\nfinance (financials + orders view)");
  // B10 rides on this order: a buyer's pending submission for u2 is declined the moment u2 is sold at the office.
  await t("a buyer submits for the unit finance is about to sell; an old phone's beneficiary answer lands on the buyer (B-1)", async () => {
    link2 = await expectOk(rep.rpc("sale_link_create", { p: { projectId: "nk-noor-khuzam", mode: "units", unitNumbers: [u2.number] } }));
    sub2 = (await expectOk(anon.rpc("public_link_submit", { p_code: link2.code, p: { consent: true, selections: { beneficiary: true }, customer: { fullName: "RLS Buyer Two", nationalId: "1000000002", mobile: "0500000002", email: "rls-buyer2@example.com" } } }))).submission;
    const { customer } = await expectOk(rep.from("submissions").select("customer").eq("id", sub2.id).single());
    if (customer.beneficiary !== true) throw new Error(JSON.stringify(customer));
  });
  await t("finance holds 'orders' → may submit an order (by design); the pending submission is declined at once (B10)", async () => {
    orderId2 = (await expectOk(finance.rpc("create_order", { p: payload(null, u2.number) }))).id;
    const s2 = await expectOk(rep.from("submissions").select("status, decline_reason").eq("id", sub2.id).single());
    if (s2.status !== "auto_declined") throw new Error(JSON.stringify(s2));
  });
  await t("cannot invite team members", () => expectErr(finance.from("profiles").insert({ id: "00000000-0000-0000-0000-000000000002", developer_id: "noor-khuzam", name: "x", email: "y@x.sa" })));

  console.log("\nsales director (cancel + team + inventory + contracts)");
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
  await t("flipping the buyer to beneficiary re-prices the issued order from the inventory (S-B)", async () => {
    const ben = await benPrice(u2.number);
    const o = await expectOk(director.rpc("update_order_customer", { p_order: orderId2, p: { beneficiary: true } }));
    if (Number(o.unit_price) !== ben) throw new Error(`unit price ${o.unit_price}, beneficiary price ${ben}`);
    const back = await expectOk(director.rpc("update_order_customer", { p_order: orderId2, p: { beneficiary: false } }));
    if (Number(back.unit_price) !== priceOf[u2.number]) throw new Error(`unit price ${back.unit_price}, list price ${priceOf[u2.number]}`);
  });
  await t("signature images: no path traversal, no other project's storage (S-E)", async () => {
    await expectErr(director.rpc("set_signatory", { p_dev: "noor-khuzam", p: { signature: "/brand/../api/notifications/dispatch" } }), /SIGNATORY_IMAGE/);
    await expectErr(director.rpc("set_signatory", { p_dev: "noor-khuzam", p: { stamp: "https://attackerproj.supabase.co/storage/v1/object/public/media/x.png" } }), /SIGNATORY_IMAGE/);
  });
  await t("can edit a unit (inventory perm)", () => expectRows(director.from("units").update({ view: "rls" }).eq("number", u2.number).select("number"), 1));
  await t("cannot edit the developer's commission ladder (Revnu only)", () => expectRows(director.from("commission_levels").update({ pct: 1 }).eq("developer_id", "noor-khuzam").eq("id", "lvl-rep").select("id"), 0));
  await t("cannot see Revnu staff profiles", () => expectRows(director.from("profiles").select("id").is("developer_id", null), 0));
  await t("cannot promote a colleague to Revnu staff", () => expectErr(director.from("profiles").update({ revnu_role_id: "super_admin", developer_id: null }).eq("legacy_id", "nk-afnan").select("id")));

  console.log("\nRevnu super admin");
  await t("reads every developer's data", () => expectRows(admin.from("orders").select("id"), 0, ">"));
  await t("can edit the developer (an unchanged value leaves it untouched)", async () => {
    const before = await expectOk(admin.from("developers").select("tagline, updated_at").eq("id", "noor-khuzam").single());
    await expectRows(admin.from("developers").update({ tagline: before.tagline }).eq("id", "noor-khuzam").select("id"), 1);
    const after = await expectOk(admin.from("developers").select("updated_at").eq("id", "noor-khuzam").single());
    if (after.updated_at !== before.updated_at) throw new Error("updated_at moved on a write that changed nothing");
  });
  await t("can read the notification outbox", () => expectRows(admin.from("notifications").select("id").eq("order_id", orderId), 0, ">"));
  await t("activity log recorded the transitions", () => expectRows(admin.from("order_activity").select("id").eq("order_id", orderId), 2, ">"));

  // ---------------------------------------------------------------------
  // v2: remote ordering, phone e-signature, agreement composer, billing
  // ---------------------------------------------------------------------
  console.log("\nv2 · signed-out buyer");
  for (const rel of ["sale_links", "submissions", "sale_leads", "signing_links", "signatures", "inbox_notifications", "agreement_versions", "platform_invoices", "billing_settings"]) {
    await t(`cannot read ${rel}`, () => expectNoAccess(anon.from(rel).select("*").limit(5)));
  }
  await t("an unknown link code shows nothing", async () => { const v = await expectOk(anon.rpc("public_link_view", { p_code: "ZZZZZZ", p_open: false })); if (v.status !== "not_found") throw new Error("status " + v.status); });
  await t("an unknown code is a counted miss on the status poll and the read call too (S-D)", async () => {
    const s = await expectOk(anon.rpc("public_link_status", { p_code: "ZZZZZZ", p_submission: null }));
    const r = await expectOk(anon.rpc("public_signing_read", { p_code: "ZZZZZZ", p_section: "p1", p_sections: null, p_lang: "en" }));
    if (s.status !== "not_found" || r.status !== "not_found") throw new Error(JSON.stringify([s, r]));
  });
  await t("cannot create a share link", () => expectErr(anon.rpc("sale_link_create", { p: {} })));
  await t("cannot save an agreement layout", () => expectErr(anon.rpc("save_agreement_layout", { p: { blocks: [] } })));

  console.log("\nv2 · rep → buyer → rep → buyer");
  const free = await expectOk(rep.from("units").select("number").eq("status", "available").eq("project_id", "nk-noor-khuzam").limit(1));
  if (free.length < 1) throw new Error("need an available unit for the v2 tests");
  const freePrice = await listPrice(free[0].number);
  let link = null, link3 = null, sub = null, acc = null, remoteOrder = null, myIp = null;
  await t("rep creates a share link (design step locked)", async () => { link = await expectOk(rep.rpc("sale_link_create", { p: { projectId: "nk-noor-khuzam", mode: "units", unitNumbers: [free[0].number], customerHint: { name: "RLS Buyer" }, selections: { designId: "nk-modern-minimal" }, locks: { design: true } } })); });
  await t("the buyer's view hides HQ commercials and the routing", async () => {
    const v = await expectOk(anon.rpc("public_link_view", { p_code: link.slug + "-" + link.code, p_open: false }));
    if (v.status !== "live") throw new Error("status " + v.status);
    if ("commercials" in v.project || "plan" in v.developer || "routing" in v.link) throw new Error("internal data exposed");
    if ("payment_details" in v.project) throw new Error("payment details sent with a sale link (P-1)");
  });
  await t("the buyer cannot submit without consent", () => expectErr(anon.rpc("public_link_submit", { p_code: link.code, p: { customer: { fullName: "RLS Buyer", nationalId: "1000000000" } } }), /CONSENT_REQUIRED/));
  await t("the buyer cannot submit an invalid national ID", () => expectErr(anon.rpc("public_link_submit", { p_code: link.code, p: { consent: true, customer: { fullName: "RLS Buyer", nationalId: "3000000000" } } }), /INVALID_NATIONAL_ID/));
  await t("the buyer cannot submit without an e-mail (E-1)", () => expectErr(anon.rpc("public_link_submit", { p_code: link.code, p: { consent: true, customer: { fullName: "RLS Buyer", nationalId: "1000000000", mobile: "0500000000" } } }), /EMAIL_REQUIRED/));
  await t("the buyer submits", async () => { const r = await expectOk(anon.rpc("public_link_submit", { p_code: link.code, p: { consent: true, customer: { fullName: "RLS Buyer", nationalId: "1000000000", mobile: "0500000000", email: "rls-buyer@example.com" }, selections: { designId: "HACKED", smartId: "nk-smart-basic" } } })); sub = r.submission; });
  await t("a locked step keeps the rep's choice whatever the phone sends (S6)", async () => {
    const { selections } = await expectOk(rep.from("submissions").select("selections").eq("id", sub.id).single());
    if (selections.designId !== "nk-modern-minimal" || selections.smartId !== "nk-smart-basic") throw new Error(JSON.stringify(selections));
  });
  await t("a step the rep hid empty: Mandatory stays with the buyer, Optional is left out (H-1)", async () => {
    const { optional } = await expectOk(rep.from("projects").select("optional").eq("id", "nk-noor-khuzam").single());
    link3 = await expectOk(rep.rpc("sale_link_create", { p: { projectId: "nk-noor-khuzam", mode: "units", unitNumbers: [free[0].number], selections: {}, locks: { design: true, package: true, kitchen: true } } }));
    const r = await expectOk(anon.rpc("public_link_submit", { p_code: link3.code, p: { consent: true, customer: { fullName: "RLS Buyer Three", nationalId: "1000000003", mobile: "0500000003", email: "rls-buyer3@example.com" },
      selections: { designId: "nk-new-classic", packageId: "nk-pkg-new-classic", kitchenId: "nk-kit-linear" } } }));
    const { selections } = await expectOk(rep.from("submissions").select("selections").eq("id", r.submission.id).single());
    const keepsDesign = !(optional && optional.furnishing), keepsKitchen = !(optional && optional.kitchens);
    if ((selections.designId === "nk-new-classic") !== keepsDesign || (selections.kitchenId === "nk-kit-linear") !== keepsKitchen) throw new Error(JSON.stringify({ optional, selections }));
  });
  await t("a second submission on the same link is refused", () => expectErr(anon.rpc("public_link_submit", { p_code: link.code, p: { consent: true, customer: { fullName: "Other", nationalId: "1000000001" } } }), /LINK_CLOSED/));
  await t("the rep sees the submission; Revnu staff see it too", async () => {
    await expectRows(rep.from("submissions").select("id").eq("id", sub.id), 1);
    await expectRows(admin.from("submissions").select("id").eq("id", sub.id), 1);
  });
  await t("another seller without the team permission cannot decide it (S1)", () => expectErr(finance.rpc("submission_decline", { p_id: sub.id, p_reason: "hijacked" }), /not allowed/i));
  await t("the rep accepts: order issued + signing link", async () => {
    acc = await expectOk(rep.rpc("submission_accept", { p_id: sub.id, p: { unitPrice: freePrice, furnishCost: 0 } }));
    remoteOrder = acc.orderId;
    const o = await expectOk(rep.from("orders").select("status, source, sale_link_code").eq("id", remoteOrder).single());
    if (o.status !== "issued" || o.source !== "remote" || o.sale_link_code !== link.code) throw new Error(JSON.stringify(o));
  });
  await t("another seller without the team permission cannot reissue the rep's signing link (S-F)", () => expectErr(finance.rpc("signing_link_create", { p_order: remoteOrder, p_via: "qr" }), /not allowed/i));
  let hash = null;
  await t("the signing page masks the national ID", async () => {
    const v = await expectOk(anon.rpc("public_signing_view", { p_code: acc.signingCode, p_open: false }));
    if (!/^•+0000$/.test(v.order.customer_national_id)) throw new Error("ID not masked: " + v.order.customer_national_id);
    const leaked = ["submission_id", "sale_link_code", "signed_contract_url", "payment_proof_url"].filter((k) => k in v.order);
    if (leaked.length) throw new Error("internal fields sent to the phone (S7): " + leaked.join(", "));
    if (!v.signatory || !v.signatory.id) throw new Error("the signatory version issued with the order is missing (B3)");
    if ("payment_details" in v.project) throw new Error("payment details sent before signing (P-1)");
    hash = v.order.contract_hash;
  });
  const read = (section, sections, lang) => spoofer.rpc("public_signing_read", { p_code: acc.signingCode, p_section: section, p_sections: sections, p_lang: lang || "en" });
  await t("signing is refused before every page is read", () => expectErr(spoofer.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer" } }), /READ_ALL/));
  await t("a page list shorter than the agreement cannot unlock signing (S2)", async () => {
    await expectOk(read("p1", ["p1"]));
    await expectErr(spoofer.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer" } }), /READ_ALL/);
  });
  await t("a page list of repeated or out-of-order ids is ignored (S-C)", async () => {
    const r1 = await expectOk(read(null, Array(12).fill("p1")));
    const r2 = await expectOk(read(null, ["p2", "p1"]));
    if ((r1.pages.en || []).length !== 1 || (r2.pages.en || []).length !== 1) throw new Error(JSON.stringify([r1.pages, r2.pages]));
    await expectOk(read("p1", Array(12).fill("p1")));
    await expectErr(spoofer.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer" } }), /READ_ALL/);
  });
  const pages = pageList(12);
  await t("reads count only for the pagination they were made on (S-C)", async () => {
    for (const p of pages.slice(0, -1)) await expectOk(read(p, pages));                // 11 of 12 pages in English
    for (const p of pageList(10)) await expectOk(read(p, pageList(11), "ar"));          // another device, in Arabic: 10 of 11 pages
    await expectOk(read(pages[11], pageList(13)));                                      // the 12th page, but on a 13-page pagination
    await expectErr(spoofer.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer" } }), /READ_ALL/);
  });
  await t("a version re-issued since the page loaded cannot be signed (AGREEMENT_CHANGED)", async () => {
    await expectOk(read(pages[11], pages));
    await expectErr(spoofer.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer", hash: "0".repeat(64) } }), /AGREEMENT_CHANGED/);
  });
  await t("after reading every page the buyer signs the version on screen", async () => {
    await expectOk(spoofer.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer", hash } }));
    const o = await expectOk(rep.from("orders").select("status, contract_hash").eq("id", remoteOrder).single());
    if (o.status !== "signed" || !o.contract_hash) throw new Error(JSON.stringify(o));
  });
  await t("once signed, the agreement's page carries the project's payment details (P-1)", async () => {
    const v = await expectOk(anon.rpc("public_signing_view", { p_code: acc.signingCode, p_open: false }));
    if (!("payment_details" in v.project)) throw new Error("no payment details after signing");
  });
  await t("the signature records the edge's address, not the one the phone claims (S-A)", async () => {
    const s = await expectOk(rep.from("signatures").select("ip").eq("order_id", remoteOrder).single());
    myIp = s.ip;
    if (!s.ip || s.ip === "1.2.3.4") throw new Error("ip " + s.ip);
  });
  await t("the rep sees the signature; the buyer cannot read it back", async () => {
    await expectRows(rep.from("signatures").select("id").eq("order_id", remoteOrder), 1);
    await expectNoAccess(anon.from("signatures").select("*").eq("order_id", remoteOrder));
  });
  await t("buyer details are locked after signing", () => expectErr(rep.rpc("update_order_customer", { p_order: remoteOrder, p: { fullName: "Changed" } }), /BUYER_LOCKED/));

  console.log("\nv2 · HQ-only functions");
  await t("a rep cannot save agreement layouts", () => expectErr(rep.rpc("save_agreement_layout", { p: { blocks: [] } }), /not allowed/i));
  await t("a rep cannot change the price book", () => expectErr(rep.rpc("set_billing_price_book", { p: { onboardingFee: 1 } }), /not allowed/i));
  await t("developer finance cannot mark platform invoices paid", () => expectErr(finance.rpc("set_platform_invoice", { p_id: "PF-N-Y1", p_dev: "noor-khuzam", p: { status: "paid" } }), /not allowed/i));
  await t("a rep cannot change the signatory (no contracts perm)", () => expectErr(rep.rpc("set_signatory", { p_dev: "noor-khuzam", p: { authorizedSigner: "x" } }), /not allowed/i));
  await t("the master agreement is readable by the developer team", () => expectRows(rep.from("agreement_layouts").select("key").eq("key", "master"), 1));
  await t("a developer cannot read the agreement history", () => expectRows(director.from("agreement_versions").select("id"), 0));

  console.log("\nclean-up");
  await t("the test orders, links, uploads and the lead are removed and the units released", async () => {
    for (const id of [orderId, orderId2, remoteOrder].filter(Boolean)) await expectOk(admin.rpc("delete_order", { p_order: id }));
    const u = await expectOk(admin.from("units").select("status").eq("number", u1.number).single());
    if (u.status !== "available") throw new Error("unit still " + u.status);
    await admin.from("units").update({ view: u2view }).eq("number", u2.number);
    const codes = [link && link.code, link2 && link2.code, link3 && link3.code].filter(Boolean);
    if (codes.length) await expectRows(admin.from("sale_links").delete().in("code", codes).select("code"), codes.length);
    const { data: gone } = await admin.from("leads").delete().like("id", "L-RLS%").select("id");
    if (!gone || !gone.length) throw new Error("test lead was not cleaned up (super admin cannot delete leads)");
    await admin.storage.from("documents").remove([`noor-khuzam/${orderId}/signed_contract-test.pdf`]);
  });
  await t("only the inbox rows that name this run's links and orders are removed", async () => {
    // inbox rows are private to their owner (a delete must also pass the read rule): the rep clears her own
    const marks = [link && link.code, link2 && link2.code, link3 && link3.code, orderId, orderId2, remoteOrder].filter(Boolean);
    const mine = await expectOk(rep.from("inbox_notifications").select("id, title, body").gte("created_at", runStart));
    const ids = mine.filter((n) => marks.some((m) => new RegExp("\\b" + m + "\\b").test((n.title || "") + " " + (n.body || "")))).map((n) => n.id);
    if (ids.length) await expectOk(rep.from("inbox_notifications").delete().in("id", ids).select("id"));
  });
  if (process.env.SUPABASE_ACCESS_TOKEN && myIp) {
    await t("this machine's rate-limit rows from the run are removed", () => managementSql(`delete from private.public_hits where ip = '${String(myIp).replace(/'/g, "")}' and at >= '${runStart}'`));
  } else {
    console.log("  · rate-limit rows from this run stay until they age out (no SUPABASE_ACCESS_TOKEN)");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("\nharness error:", e.message); process.exit(2); });
