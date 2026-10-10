// =====================================================================
//  Tenant snapshot: everything the signed-in person is allowed to see,
//  fetched in one parallel round and mapped to the prototype's shapes.
//  RLS decides the rows — the same function serves Revnu HQ (everything)
//  and a developer's team (their tenant only). Used server-side for the
//  initial render and client-side for refreshes after writes.
// =====================================================================
import * as M from "./mappers";

const PLAN = [
  ["devPerms", "dev_perms", "sort"],
  ["devRoles", "dev_roles", "sort"],
  ["revnuPerms", "revnu_perms", "sort"],
  ["revnuRoles", "revnu_roles", "sort"],
  ["contractVars", "contract_vars", "sort"],
  ["developers", "developers", "onboarded"],
  ["commissionLevels", "commission_levels", "sort"],
  ["projects", "projects", "created_at"],
  ["unitTypes", "unit_types", "created_at"],
  ["units", "units", "number"],
  ["designStyles", "design_styles", "created_at"],
  ["packages", "packages", "created_at"],
  ["smartHome", "smart_home", "level"],
  ["opsModels", "ops_models", "created_at"],
  ["flooringFinishes", "flooring_finishes", "created_at"],
  ["flooringZones", "flooring_zones", "created_at"],
  ["kitchens", "kitchens", "created_at"],
  ["acSystems", "ac_systems", "created_at"],
  ["coolingPoints", "cooling_points", "created_at"],
  ["layoutOptions", "layout_options", "created_at"],
  ["constructionMilestones", "construction_milestones", "sort"],
  ["paymentPlans", "payment_plans", "id"],
  ["contractTemplates", "contract_templates", "created_at"],
  ["profiles", "profiles_v", "created_at"],
  ["orders", "orders_v", "created_at", { ascending: false }],
  ["orderActivity", "order_activity", "at"],
  ["documents", "documents", "created_at"],
  ["invoices", "invoices", "issued_at"],
  ["receivablePaid", "receivable_paid", "paid_at"],
  ["payouts", "payouts", "updated_at"],
  ["supportTickets", "support_tickets_v", "created_at", { ascending: false }],
  ["leads", "leads", "created_at", { ascending: false }],
  // v2: remote ordering + e-signature (RLS: a rep sees their own rows, managers the team's)
  ["saleLinks", "sale_links", "created_at", { ascending: false }],
  ["saleLeads", "sale_leads", "updated_at", { ascending: false }],
  ["submissions", "submissions", "created_at", { ascending: false }],
  ["signingLinks", "signing_links", "created_at", { ascending: false }],
  ["signatures", "signatures", "signed_at"],
  ["inbox", "inbox_notifications", "created_at", { ascending: false }],
  // v2: agreement composer + platform billing
  ["agreementLayouts", "agreement_layouts", "key"],
  ["agreementVersions", "agreement_versions", "saved_at", { ascending: false }],
  ["billingSettings", "billing_settings", "updated_at"],
  ["platformInvoices", "platform_invoices", "id"],
];

/** Fetch every collection in parallel. `only` limits the fetch to a subset (used by refresh). */
export async function fetchSnapshot(supabase, only) {
  const plan = only ? PLAN.filter(([k]) => only.includes(k)) : PLAN;
  const results = await Promise.all(plan.map(async ([key, table, orderBy, opts]) => {
    // Postgres/PostgREST caps at 1000 rows by default; page through to be safe.
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select("*").order(orderBy, opts || { ascending: true }).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return [key, rows.map((r) => M[key].fromRow(r))];
  }));
  return Object.fromEntries(results);
}

export const SNAPSHOT_KEYS = PLAN.map(([k]) => k);
