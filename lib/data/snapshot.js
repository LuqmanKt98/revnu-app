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
