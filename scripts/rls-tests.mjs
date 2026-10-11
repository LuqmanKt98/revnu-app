#!/usr/bin/env node
// =====================================================================
//  rls-tests.mjs — signs in as each seeded role against the REAL project and
//  asserts what Postgres allows / refuses. This is the regression suite for
//  audit findings SEC-01 / SEC-03 (forgeable session, cosmetic permissions)
//  and B-05 (upload gate bypass). Safe to run repeatedly: it cleans up after itself,
//  and every value it changes (tagline, a unit's view) is written back as it found it.
//  The public functions are rate-limited per IP (2 submissions + 1 signature per run;
//  10 an hour), so about five runs an hour from one machine.
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
  // the inventory price of a unit (non-beneficiary): the server refuses any other unit price (S3)
  const basePrice = Object.fromEntries((await expectOk(rep.from("unit_types").select("id, base_price").eq("project_id", "nk-noor-khuzam"))).map((x) => [x.id, Number(x.base_price) || 0]));
  const listPrice = async (number) => { const u = await expectOk(rep.from("units").select("type_id, price_adj").eq("number", number).single()); return (basePrice[u.type_id] || 0) + (Number(u.price_adj) || 0); };
  const priceOf = Object.fromEntries(await Promise.all([u1, u2].map(async (u) => [u.number, await listPrice(u.number)])));
  const u2view = (await expectOk(rep.from("units").select("view").eq("number", u2.number).single())).view;
  let orderId = null, orderId2 = null;
  await t("reserve_order_id returns a REV-26-N reference", async () => {
    orderId = await expectOk(rep.rpc("reserve_order_id"));
    if (!/^REV-26-\d+$/.test(orderId)) throw new Error("bad id " + orderId);
  });
  const payload = (id, unit) => ({ id, projectId: "nk-noor-khuzam", unitNumbers: [unit], customerName: "RLS Test", customerId: "1000000000", customerEmail: "rls-test@example.com", customer: { fullName: "RLS Test" }, packageId: "nk-pkg-modern-minimal", designId: "nk-modern-minimal", unitPrice: priceOf[unit] || 0, furnishCost: 48300, status: "issued" });
  await t("create_order succeeds and locks the unit", async () => {
    await expectOk(rep.rpc("create_order", { p: payload(orderId, u1.number) }));
    const u = await expectOk(rep.from("units").select("status").eq("number", u1.number).single());
    if (u.status !== "sold") throw new Error("unit not locked: " + u.status);
  });
  await t("create_order refuses a forged reference", async () => {
    await expectErr(rep.rpc("create_order", { p: payload("HACK-1", u2.number) }), /invalid order reference/);
    await expectErr(rep.rpc("create_order", { p: payload("REV-26-999999", u2.number) }), /invalid order reference/);
  });
  await t("create_order refuses negative amounts", () => expectErr(rep.rpc("create_order", { p: Object.assign(payload(null, u2.number), { unitPrice: -1 }) }), /negative/));
  await t("create_order refuses a unit price that is not the inventory price (S3)", () => expectErr(rep.rpc("create_order", { p: Object.assign(payload(null, u2.number), { unitPrice: 1 }) }), /PRICE_MISMATCH/));
  await t("same unit cannot be sold twice (B-01)", async () => {
    const id = await expectOk(rep.rpc("reserve_order_id"));
    await expectErr(rep.rpc("create_order", { p: payload(id, u1.number) }), /UNIT_TAKEN/);
  });
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
  await t("can edit the developer (writes the current tagline back)", async () => {
    const { tagline } = await expectOk(admin.from("developers").select("tagline").eq("id", "noor-khuzam").single());
    await expectRows(admin.from("developers").update({ tagline }).eq("id", "noor-khuzam").select("id"), 1);
  });
  await t("can read the notification outbox", () => expectRows(admin.from("notifications").select("id").eq("order_id", orderId), 0, ">"));
  await t("activity log recorded the transitions", () => expectRows(admin.from("order_activity").select("id").eq("order_id", orderId), 2, ">"));
  await t("delete_order cleans up and releases units", async () => {
    await expectOk(admin.rpc("delete_order", { p_order: orderId }));
    await expectOk(admin.rpc("delete_order", { p_order: orderId2 }));
    const u = await expectOk(admin.from("units").select("status").eq("number", u1.number).single());
    if (u.status !== "available") throw new Error("unit still " + u.status);
    await admin.from("units").update({ view: u2view }).eq("number", u2.number);
    const { data: gone } = await admin.from("leads").delete().like("id", "L-RLS%").select("id");
    if (!gone || !gone.length) throw new Error("test lead was not cleaned up (super admin cannot delete leads)");
    await admin.storage.from("documents").remove([`noor-khuzam/${orderId}/signed_contract-test.pdf`]);
  });

  // ---------------------------------------------------------------------
  // v2: remote ordering, phone e-signature, agreement composer, billing
  // ---------------------------------------------------------------------
  console.log("\nv2 · signed-out buyer");
  for (const rel of ["sale_links", "submissions", "sale_leads", "signing_links", "signatures", "inbox_notifications", "agreement_versions", "platform_invoices", "billing_settings"]) {
    await t(`cannot read ${rel}`, () => expectNoAccess(anon.from(rel).select("*").limit(5)));
  }
  await t("an unknown link code shows nothing", async () => { const v = await expectOk(anon.rpc("public_link_view", { p_code: "ZZZZZZ", p_open: false })); if (v.status !== "not_found") throw new Error("status " + v.status); });
  await t("cannot create a share link", () => expectErr(anon.rpc("sale_link_create", { p: {} })));
  await t("cannot save an agreement layout", () => expectErr(anon.rpc("save_agreement_layout", { p: { blocks: [] } })));

  console.log("\nv2 · rep → buyer → rep → buyer");
  const free = await expectOk(rep.from("units").select("number").eq("status", "available").eq("project_id", "nk-noor-khuzam").limit(2));
  if (free.length < 2) throw new Error("need 2 available units for the v2 tests");
  const freePrice = await listPrice(free[0].number), free2Price = await listPrice(free[1].number);
  let link = null, sub = null, acc = null, remoteOrder = null, link2 = null, sub2 = null, officeOrder = null;
  await t("rep creates a share link (design step locked)", async () => { link = await expectOk(rep.rpc("sale_link_create", { p: { projectId: "nk-noor-khuzam", mode: "units", unitNumbers: [free[0].number], customerHint: { name: "RLS Buyer" }, selections: { designId: "nk-modern-minimal" }, locks: { design: true } } })); });
  await t("the buyer's view hides HQ commercials and the routing", async () => {
    const v = await expectOk(anon.rpc("public_link_view", { p_code: link.slug + "-" + link.code, p_open: false }));
    if (v.status !== "live") throw new Error("status " + v.status);
    if ("commercials" in v.project || "plan" in v.developer || "routing" in v.link) throw new Error("internal data exposed");
  });
  await t("the buyer cannot submit without consent", () => expectErr(anon.rpc("public_link_submit", { p_code: link.code, p: { customer: { fullName: "RLS Buyer", nationalId: "1000000000" } } }), /CONSENT_REQUIRED/));
  await t("the buyer cannot submit an invalid national ID", () => expectErr(anon.rpc("public_link_submit", { p_code: link.code, p: { consent: true, customer: { fullName: "RLS Buyer", nationalId: "3000000000" } } }), /INVALID_NATIONAL_ID/));
  await t("the buyer submits", async () => { const r = await expectOk(anon.rpc("public_link_submit", { p_code: link.code, p: { consent: true, customer: { fullName: "RLS Buyer", nationalId: "1000000000", mobile: "0500000000" }, selections: { designId: "HACKED", smartId: "nk-smart-basic" } } })); sub = r.submission; });
  await t("a locked step keeps the rep's choice whatever the phone sends (S6)", async () => {
    const { selections } = await expectOk(rep.from("submissions").select("selections").eq("id", sub.id).single());
    if (selections.designId !== "nk-modern-minimal" || selections.smartId !== "nk-smart-basic") throw new Error(JSON.stringify(selections));
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
  await t("the signing page masks the national ID", async () => {
    const v = await expectOk(anon.rpc("public_signing_view", { p_code: acc.signingCode, p_open: false }));
    if (!/^•+0000$/.test(v.order.customer_national_id)) throw new Error("ID not masked: " + v.order.customer_national_id);
    const leaked = ["submission_id", "sale_link_code", "signed_contract_url", "payment_proof_url"].filter((k) => k in v.order);
    if (leaked.length) throw new Error("internal fields sent to the phone (S7): " + leaked.join(", "));
    if (!v.signatory || !v.signatory.id) throw new Error("the signatory version issued with the order is missing (B3)");
  });
  await t("signing is refused before every page is read", () => expectErr(anon.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer" } }), /READ_ALL/));
  await t("a page list shorter than the agreement cannot unlock signing (S2)", async () => {
    await expectOk(anon.rpc("public_signing_read", { p_code: acc.signingCode, p_section: null, p_sections: ["p1"], p_lang: "en" }));
    await expectOk(anon.rpc("public_signing_read", { p_code: acc.signingCode, p_section: "p1", p_lang: "en" }));
    await expectErr(anon.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer" } }), /READ_ALL/);
  });
  const pages = Array.from({ length: 12 }, (_, i) => "p" + (i + 1));
  await t("the page list only grows", async () => {
    await expectOk(anon.rpc("public_signing_read", { p_code: acc.signingCode, p_section: null, p_sections: pages, p_lang: "en" }));
    const r = await expectOk(anon.rpc("public_signing_read", { p_code: acc.signingCode, p_section: null, p_sections: pages.slice(0, 6), p_lang: "en" }));
    if (!r.pages || !r.pages.en || r.pages.en.length !== pages.length) throw new Error(JSON.stringify(r.pages));
  });
  await t("pages read in another language do not count", async () => {
    for (const p of pages.slice(0, -1)) await expectOk(anon.rpc("public_signing_read", { p_code: acc.signingCode, p_section: p, p_lang: "en" }));
    await expectOk(anon.rpc("public_signing_read", { p_code: acc.signingCode, p_section: pages[pages.length - 1], p_lang: "ar" }));
    await expectErr(anon.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer" } }), /READ_ALL/);
  });
  await t("after reading every page the buyer signs", async () => {
    await expectOk(anon.rpc("public_signing_read", { p_code: acc.signingCode, p_section: pages[pages.length - 1], p_lang: "en" }));
    await expectOk(anon.rpc("public_signing_sign", { p_code: acc.signingCode, p: { consent: true, typedName: "RLS Buyer" } }));
    const o = await expectOk(rep.from("orders").select("status, contract_hash").eq("id", remoteOrder).single());
    if (o.status !== "signed" || !o.contract_hash) throw new Error(JSON.stringify(o));
  });
  await t("the rep sees the signature; the buyer cannot read it back", async () => {
    await expectRows(rep.from("signatures").select("id").eq("order_id", remoteOrder), 1);
    await expectNoAccess(anon.from("signatures").select("*").eq("order_id", remoteOrder));
  });
  await t("buyer details are locked after signing", () => expectErr(rep.rpc("update_order_customer", { p_order: remoteOrder, p: { fullName: "Changed" } }), /BUYER_LOCKED/));
  await t("an office sale of the unit declines a pending submission at once (B10)", async () => {
    link2 = await expectOk(rep.rpc("sale_link_create", { p: { projectId: "nk-noor-khuzam", mode: "units", unitNumbers: [free[1].number] } }));
    sub2 = (await expectOk(anon.rpc("public_link_submit", { p_code: link2.code, p: { consent: true, customer: { fullName: "RLS Buyer Two", nationalId: "1000000002", mobile: "0500000002" } } }))).submission;
    officeOrder = (await expectOk(rep.rpc("create_order", { p: Object.assign(payload(null, free[1].number), { unitPrice: free2Price, status: "active" }) }))).id;
    const s2 = await expectOk(rep.from("submissions").select("status, decline_reason").eq("id", sub2.id).single());
    if (s2.status !== "auto_declined") throw new Error(JSON.stringify(s2));
  });

  console.log("\nv2 · HQ-only functions");
  await t("a rep cannot save agreement layouts", () => expectErr(rep.rpc("save_agreement_layout", { p: { blocks: [] } }), /not allowed/i));
  await t("a rep cannot change the price book", () => expectErr(rep.rpc("set_billing_price_book", { p: { onboardingFee: 1 } }), /not allowed/i));
  await t("developer finance cannot mark platform invoices paid", () => expectErr(finance.rpc("set_platform_invoice", { p_id: "PF-N-Y1", p_dev: "noor-khuzam", p: { status: "paid" } }), /not allowed/i));
  await t("a rep cannot change the signatory (no contracts perm)", () => expectErr(rep.rpc("set_signatory", { p_dev: "noor-khuzam", p: { authorizedSigner: "x" } }), /not allowed/i));
  await t("the master agreement is readable by the developer team", () => expectRows(rep.from("agreement_layouts").select("key").eq("key", "master"), 1));
  await t("a developer cannot read the agreement history", () => expectRows(director.from("agreement_versions").select("id"), 0));
  await t("clean-up: the remote test orders and links are removed", async () => {
    await expectOk(admin.rpc("delete_order", { p_order: remoteOrder }));
    if (officeOrder) await expectOk(admin.rpc("delete_order", { p_order: officeOrder }));
    await expectRows(admin.from("sale_links").delete().in("code", [link.code].concat(link2 ? [link2.code] : [])).select("code"), link2 ? 2 : 1);
    // inbox rows are private to their owner (a delete must also pass the read rule), so the rep clears her own
    await expectOk(rep.from("inbox_notifications").delete().gte("created_at", new Date(Date.now() - 15 * 60e3).toISOString()).in("kind", ["submission", "accepted", "signed", "auto_declined"]).select("id"));
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("\nharness error:", e.message); process.exit(2); });
