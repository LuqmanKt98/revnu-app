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
| `…010_v2_catalogue.sql` | v2 catalogues: `flooring_finishes`, `flooring_zones`, `kitchens`, `ac_systems`, `cooling_points`, `layout_options`; order fields for them + the agreement snapshot; `create_order_core()` shared by the office wizard and remote Accept (deadline gates); 59 contract variables |
| `…011_v2_seed.sql` | the client's v2 catalogue rows (insert-only), project deadlines/rates, developer plan + signatory, Arabic text normalised |
| `…012_v2_remote_esign.sql` | `sale_links` (units / shortlist / public type links, single or round-robin routing), `sale_leads`, `submissions`, `signing_links`, `signatures`, `inbox_notifications`; rep RPCs (`sale_link_create/set`, `submission_accept/decline/assign_units`, `signing_link_create`, `update_order_customer`, `set_signatory`, `inbox_mark_read`); anon RPCs keyed by the 6-character code (`public_link_view/status/submit`, `public_lead_start/update`, `public_signing_view/read/sign`); `orders.contract_hash` = SHA-256 deal fingerprint |
| `…013_v2_agreement_billing.sql` | `agreement_layouts` (Revnu master + per developer) and `agreement_versions`; `billing_settings` (price book) and `platform_invoices` (paid / reference / note only — invoices are derived in the app) |
| `…014`–`…017` | lead dismiss, suspension (blocks new orders/links), signing evidence, clean-up policies |

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
| sale_links, submissions, sale_leads, signing_links, signatures, inbox_notifications | RPCs only. Read: Revnu staff; a member with `orders` sees their own rows (rep, creator or routing pool); `team` / `financials` see the developer's; signing links / signatures follow the order; inbox = owner. Anon: only through the `public_*` functions |
| agreement_layouts / agreement_versions | Revnu `developers` via `save_agreement_layout` / `reset_agreement_layout`; the master is readable by every signed-in user, a developer's layout by its team; history is Revnu-only |
| billing_settings, platform_invoices | Revnu `financials` via `set_billing_price_book` / `set_platform_invoice`; the developer reads its own invoices; the plan lives on `developers.plan` (Revnu `developers`) |

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
* v2 phone-first sale: `portals/shared/mobile-wizard.jsx` is the client's wizard (rep and buyer), `portals/shared/sign.jsx`
  the read-and-sign page; `lib/data/remote.js` is the prototype's `REVNU_REMOTE` API on Supabase (sync reads from the
  store, server functions for writes). Buyer pages: `/order/<slug>-<CODE>` and `/sign/<slug>-<CODE>` (no sign-in; the
  store is hydrated from `public_link_view` / `public_signing_view`, which return only what that link may show).

## 7a. Remote ordering and e-signature (v2)

1. A rep creates a share link (fixed units, a shortlist, or a public type-only link routed to one rep or round robin)
   and sends it by WhatsApp (`wa.me` pre-filled message) or QR. Nothing is held. Routing pools only take sales staff
   (a commission level); the link opens in the language the rep chose unless the phone already picked one.
2. The buyer opens it on the phone, configures, enters their details and submits (a public link first records a lead).
   Steps the rep locked keep the rep's choices on the server (`private.apply_locks`), whatever the phone sends.
3. The rep accepts with one tap: `submission_accept()` creates the order through `create_order_core()` (the unit is
   locked), issues it with the pinned agreement snapshot, opens a signing link. Any sale of a unit (remote or office,
   or a reinstated order) auto-declines pending submissions on it (trigger on `order_units`).
4. The buyer reads every page and signs with a finger or typed name; `public_signing_sign()` records the signature,
   consent, IP (from the gateway headers), device and the SHA-256 fingerprint, and moves the order to `signed`.
5. The rep confirms the first payment by attaching the transfer receipt (mandatory) — `transition_order()` → `paid`.

Evidence and integrity rules (migration 018, after the 11 Oct 2026 audit):

* **Read every page.** The phone reports its page list per language only once pagination has settled (fonts and
  images loaded); a page counts as read when at least half of what fits of it stayed on screen for ~0.5 s.
  `signing_links.pages` keeps the longest list per language and `read_log` entries carry the language. Signing needs a
  language whose list is at least `private.agreement_min_pages()` long (a lower bound from the pinned layout) with every
  page read in that language.
* **Signatory versions.** `developer_signatories` stores every signatory / signature / stamp version (written by a
  trigger on `developers`); issuing an order pins `orders.signatory_id`, which is part of the deal fingerprint. The
  agreement, sign page, certificate, Word export and contract variables print the pinned version (`D.signerOf`).
* **Prices.** A deferred constraint trigger refuses an order whose unit price is not the inventory price (list, or the
  beneficiary price) — `PRICE_MISMATCH`. Extras are still priced by the rep's app; VAT is rounded per line
  (`D.withVat`) so agreement lines always add up to the total.
* **Public functions** are rate-limited per IP (`private.public_hits`): 30 unknown codes, 20 leads, 10 submissions and
  10 signatures an hour → `RATE_LIMITED`. Test runs from one machine count too (`scripts/rls-tests.mjs` uses 2
  submissions + 1 signature).
* A suspended developer's live links show as paused; a revoked link cannot be extended; extending never passes the
  project's maximum validity (90 days for public links). The signing page receives no internal order fields.
* Times on buyer documents (link expiry, signature, certificate) are printed in Riyadh time on every device.

## 8. Known deliberate limitations

* Payment gateway is out of scope (client decision). The e-signature is a finger signature + certificate on the buyer's
  phone (no Nafath / qualified e-signature provider).
* Orders issued before migration 018 have no pinned signatory version; they show the developer's current signatory.
* Extras (furnishing, kitchen, cooling, flooring, layout) are priced in the rep's app; the server checks the unit price
  only.
* Bulk CSV unit import runs on the client and inserts in one request (fine for hundreds of rows).
* Order read scope for developer members is tenant-wide (client chose to mirror the prototype).
