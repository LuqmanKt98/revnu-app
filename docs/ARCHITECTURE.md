# Architecture

Written for engineers maintaining Revnu after Phase 1. The audit report (`Revnu-Audit-Report.pdf`
in the prototype folder) is the reference for the findings this design answers.

## 1. Shape

```
Browser (client components = the ported prototype apps)
   reads   synchronous, from an in-memory tenant snapshot  (lib/data/store.js)
   writes  REVNU_API -> supabase-js (RLS) or .rpc()        (lib/data/api.js), then re-hydrate
      │
Server component per portal (app/<portal>/page.tsx → lib/auth/gate.ts)
   verifies the session (getUser), loads the profile, enforces portal rules, fetches the
   RLS-scoped snapshot and hands it to <PortalBoot>. Nothing renders without a verified session.
      │
Supabase  Postgres (RLS on every table) · Auth (password) · Storage · RPCs for lifecycle transitions
```

Why a hydrated store instead of async reads everywhere: the prototype's three apps make hundreds of
synchronous reads (`D.ORDERS.filter`, `D.unitByNumber`, `D.commissionSplit`) but only ~40 writes.
Keeping reads synchronous meant the approved UI and its business maths were ported verbatim; only
the write sites changed. After every write the affected collections are re-fetched, and the tab
re-fetches everything when it regains focus, so colleagues see each other's changes.

## 2. Database

`supabase/migrations/`

| File | Contents |
|---|---|
| `0001_schema.sql` | every entity from `data.js` with real FKs/constraints; `order_units` with a partial unique index (one live order per unit → audit B-01); `order_seq` (ids never reused → B-03); triggers keep `units.status` in sync with live orders |
| `0002_rls.sql` | helpers in schema `private` (`is_revnu`, `revnu_has`, `dev_has`, `can_read_dev`…) and policies on every table; `developers_public` view is the only anon-readable object (SEC-02) |
| `0003_rpc.sql` | `reserve_order_id`, `create_order`, `transition_order` (gates: issued→signed needs a `signed_contract` document, signed→paid needs `payment_proof` → B-05), `attach_document`, `cancel_order`, `reinstate_order`, `delete_order`, `set_receivable_paid`, `set_payout_status`, `clear_must_change_password` |
| `0004_storage.sql` | buckets `documents` (private, path `{developer}/{order}/{kind}-{uuid}`) and `media` (public) with object policies |
| `0005_views.sql` | `profiles_v` (assigned projects + effective perms), `orders_v` (unit numbers), `support_tickets_v` (replies) |

IDs: text keys are kept where the UI shows or builds them (`REV-26-231`, `14094-A-5-1-101`, `NK-S`,
`noor-khuzam`); people are `uuid = auth.users.id`. Bilingual fields keep the `_ar` suffix. `jsonb` is used
only where the UI edits a value as one document (brand colours, BOQ, feature flags, ops assumptions).

## 3. Authorization (RLS)

Read rule: Revnu staff read everything; a developer's members read everything with their `developer_id`;
anonymous reads only `developers_public`. This mirrors the prototype's page-level model (client decision).

| Table(s) | Writes |
|---|---|
| developers, commission_levels, projects, unit_types, design_styles, packages, smart_home, ops_models, milestones, payment_plans, contract_templates | Revnu `developers`; delete = super admin |
| units | Revnu `developers` or member with `inventory` (same developer) |
| orders, order_units, order_activity, invoices, documents | RPCs only (permission-checked inside); delete = super admin |
| receivable_paid, payouts | Revnu `financials` (un-ticking a received milestone = super admin) |
| profiles / profile_projects | own row (name, bank); same-developer rows with `team`; any row with Revnu `developers`; Revnu staff rows with Revnu `team`. Triggers block org changes / self-escalation. Account creation goes through `/api/users` |
| support_tickets / replies | any signed-in user raises; Revnu handles |
| leads | `/api/leads` inserts; Revnu reads/updates |

Permission source: `profiles.perms` when set, else the role's defaults from `dev_roles` / `revnu_roles`
(same as the prototype's `devPermsFor()`). `scripts/rls-tests.mjs` is the regression suite.

## 4. Authentication

Email + password (client decision: no OTP). Accounts are admin-created (`/api/users`, service role for
`auth.admin.createUser`, then the profile row is inserted under the caller's RLS). New/reset accounts carry
`must_change_password`; the sign-in page forces a new password before entering a portal. Sessions are
HttpOnly cookies managed by `@supabase/ssr`; `proxy.ts` refreshes them and keeps signed-out visitors off
the portals; each portal page re-checks the profile and the portal rules (`lib/auth/gate.ts`).

## 5. Files

Uploads go straight from the browser to Storage with explicit size/type validation and visible errors
(audit B-06), then `attach_document()` indexes the object against the order. Downloads use short-lived
signed URLs. Catalogue images (logos, renders, floor plans, design photos) are scaled in the browser as
before, then stored in the public `media` bucket instead of as base64 inside the record.

## 6. E-mail

`transition_order()` writes an outbox row (`notifications`); the browser then calls
`POST /api/notifications/dispatch` for that order (any signed-in user; only queued rows are touched).
`lib/email/mailer.ts` logs in `MAIL_MODE=log` and sends through Resend otherwise. Templates are bilingual.
Sign-in never depends on e-mail; password-reset links do (Supabase Auth SMTP → Resend at cut-over).

## 7. Frontend

* `portals/*/…App.jsx` are the prototype files transformed by `scripts/port-prototype.mjs` (imports,
  links, module wrapper) plus hand-made semantic changes (bootstrap from the verified session, async
  writes with busy/success/error UX, Storage uploads). Module-level state is intentional: each portal is
  a full page load, exactly as before.
* `public/i18n.js` is the prototype engine unchanged except the language now also lives in a cookie so the
  server renders `<html dir lang>` correctly on first paint.
* `/` serves `public/home.html` (the marketing site) verbatim via a rewrite; the lead form posts to `/api/leads`.
* Error boundaries wrap every portal (audit §10); the production React build replaces CDN React + in-browser Babel.

## 8. Known deliberate limitations

* Payment gateway and e-signature are out of scope (client decision).
* Bulk CSV unit import runs on the client and inserts in one request (fine for hundreds of rows).
* Order read scope for developer members is tenant-wide (client chose to mirror the prototype).
