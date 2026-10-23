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
| `…018_v2_audit_fixes.sql` | first v2 audit: permission checks that cannot be NULL, signatory versions pinned per order (`developer_signatories`), read-every-page evidence per language with a server-side minimum, per-IP limits (`private.public_hits`), locked steps kept on the server, auto-decline on any sale, link validity caps, suspension pauses links |
| `…019_v2_public_limits.sql` | the per-IP limits set for shared office Wi-Fi and carrier NAT |
| `…020`–`…023` | `private.deal_prices()` (the wizard's pricing in SQL) and the deferred price check on every new order; "ready to sign" re-queued after an e-mail correction |
| `…024_v2_second_audit_fixes.sql` | second v2 audit: the caller's IP from the edge only; reads counted per pagination; beneficiary flips re-price; operator fee, monthly net and the item columns checked; refusals before a REV number is drawn; unknown codes counted on every public function; signatory image allowlist; signing links (re)issued by the rep or a manager only; deterministic catalogue order; the outbox "sending" claim |
| `…025_v2_hidden_steps_payment.sql` | client feedback: steps the rep switches off are hidden from the buyer (`private.effective_locks`: a Mandatory step left empty stays with the buyer); `projects.payment_details` (bank, IBAN, first payment %) — never on a sale link, on the signing page once signed |
| `…026_v2_buyer_email_required.sql` | the buyer's e-mail is required wherever buyer details are checked (`private.clean_customer`) |
| `…027_v2_payment_iban_free.sql` | the IBAN / account number in the payment details is kept as entered (any bank's format) |

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

The session cookie is shared by every tab of a browser, so signing in as someone else in a second tab makes an
already-open portal page act as that other account (an open Revnu Admin tab would then be refused by RLS while still
looking like HQ). `lib/auth/account-guard.js` (installed by `PortalBoot`) notices the switch — on the cross-tab
auth event, when the tab regains focus, and before a refused write is reported as "no permission" — and asks the
person to reload, which lets the gate route them to the right portal.

## 5. Files

Uploads go straight from the browser to Storage with explicit size/type validation and visible errors
(audit B-06), then `attach_document()` indexes the object against the order. Downloads use short-lived
signed URLs. Catalogue images (logos, renders, floor plans, design photos) are scaled in the browser as
before, then stored in the public `media` bucket instead of as base64 inside the record.

## 6. E-mail

`transition_order()` writes an outbox row (`notifications`); the browser then calls
`POST /api/notifications/dispatch` for that order (any signed-in user; only queued rows are touched).
`lib/email/mailer.ts` logs in `MAIL_MODE=log` and sends through Resend otherwise. Templates are bilingual. A dispatcher
claims each row (`queued` → `sending`, a conditional update) before sending it, so two dispatchers never send the same
e-mail; a claim older than ten minutes is retried.
A new or corrected buyer e-mail on an issued agreement queues "ready to sign" again; a changed or removed address
supersedes the rows still queued for the old one. The buyer is signed out when signing, so the sign page posts `{ signingCode }` to the same route, which
sends only that signed order's queued rows.
When the project has payment details (HQ → project → Settings → Payment after signing), the "signed" e-mail carries the
first payment (a % of the order total), the bank, account holder and IBAN, the order number as the reference and a link
to the signed agreement; the buyer's signed screen and the rep's one-tap WhatsApp (`R.paymentMessage`) show the same
figures (`R.paymentDue`). Links in e-mails use the request's origin. Production sends through Resend
(`MAIL_MODE=resend`, a sending-only `RESEND_API_KEY`) from `no-reply@notify.revnu.sa`: the subdomain is verified in
Resend (region eu-west-1) with DKIM + return-path records at T2, so the Google Workspace mail on revnu.sa is untouched.
Local development stays on `MAIL_MODE=log`.
Sign-in never depends on e-mail; password-reset links do (Supabase Auth SMTP → Resend at cut-over).

## 7. Frontend

* `portals/*/…App.jsx` are the prototype files transformed by `scripts/port-prototype.mjs` (imports,
  links, module wrapper) plus hand-made semantic changes (bootstrap from the verified session, async
  writes with busy/success/error UX, Storage uploads). Module-level state is intentional: each portal is
  a full page load, exactly as before.
* `public/i18n.js` is the prototype engine unchanged except the language now also lives in a cookie so the
  server renders `<html dir lang>` correctly on first paint.
* The public site is the client's original one (from their Lovable project), merged in front of the portals:
  `/` serves `public/home.html` via a rewrite (the original landing page unpacked from its single-file bundle; it uses
  our `/i18n.js` and `/home-ar.js`, the videos in `public/media/`, and the "Request demo" form posts to `/api/leads`);
  `/why-us` and `/how-it-works` are app pages (`components/public/`, the original `.public-*` styles); `/auth` is the
  sign-in page (same as `/login`). The language is one setting everywhere (`revnu_lang` cookie + localStorage), so a
  choice made on the landing carries into the portals. Old addresses of the original site redirect (`next.config.ts`).
* Error boundaries wrap every portal (audit §10); the production React build replaces CDN React + in-browser Babel.
* Spreadsheet imports are CSV (`lib/data/store.js`: `readTableFile`, `planUnitImport`, `planBoqImport`; the flow and the
  per-row report in `lib/data/support.js`). They accept what Excel / Numbers / Sheets save — comma, semicolon or tab,
  UTF-8 (BOM or not) or Windows-Arabic, title rows above the headings, English or Arabic headings — and refuse a
  workbook with a "save it as CSV UTF-8" hint. Units: "Download template" (headings + one `EXAMPLE-…` row per unit
  type, ignored on upload); the unit type is matched by name (EN/AR) or code; every row that isn't added is listed
  with its reason. Unit numbers are the table's primary key, so they are unique across the platform: the insert is
  `ON CONFLICT DO NOTHING` (`api.units.createNew`), a number taken elsewhere is reported, never overwritten.
  BOQ: "Download template" (Room, Item, Qty, [Unit price,] Supplier, Notes); a sheet with its own headings
  (e.g. Category / Item / Specification / Notes / Qty) is read too, section and subtotal rows skipped.
* v2 phone-first sale: `portals/shared/mobile-wizard.jsx` is the client's wizard (rep and buyer), `portals/shared/sign.jsx`
  the read-and-sign page; `lib/data/remote.js` is the prototype's `REVNU_REMOTE` API on Supabase (sync reads from the
  store, server functions for writes). Buyer pages: `/order/<slug>-<CODE>` and `/sign/<slug>-<CODE>` (no sign-in; the
  store is hydrated from `public_link_view` / `public_signing_view`, which return only what that link may show).

## 7a. Remote ordering and e-signature (v2)

1. A rep creates a share link (fixed units, a shortlist, or a public type-only link routed to one rep or round robin)
   and sends it by WhatsApp (`wa.me` pre-filled message) or QR. Nothing is held. Routing pools only take sales staff
   (a commission level); the link opens in the language the rep chose unless the phone already picked one.
2. The buyer opens it on the phone, configures, enters their details and submits (a public link first records a lead).
   Steps the rep switched off are hidden from the buyer and keep the rep's choices on the server (`private.apply_locks`),
   whatever the phone sends. Only steps that can be hidden count (`private.effective_locks` / `R.effectiveLocks`): one
   with the rep's choice, one with nothing to pick (layout, flooring), or an Optional one (left out of the sale); a
   Mandatory step the rep left empty stays with the buyer.
3. The rep accepts with one tap: `submission_accept()` creates the order through `create_order_core()` (the unit is
   locked), issues it with the pinned agreement snapshot, opens a signing link. Any sale of a unit (remote or office,
   or a reinstated order) auto-declines pending submissions on it (trigger on `order_units`).
4. The buyer reads every page and signs with a finger or typed name; `public_signing_sign()` records the signature,
   consent, IP, device and the SHA-256 fingerprint, and moves the order to `signed`. The phone sends the fingerprint of
   the version on its screen; an agreement re-issued since (a buyer edit) is refused with `AGREEMENT_CHANGED` and reloads.
5. The rep confirms the first payment by attaching the transfer receipt (mandatory) — `transition_order()` → `paid`.

Evidence and integrity rules (migrations 018 and 024, after the two audits of 11 Oct 2026):

* **Read every page.** Nothing is reported or counted until the agreement's pagination has settled (fonts and images
  loaded) — there is no time-based fallback; until then the phone says "Preparing the pages…". The phone numbers its
  sheets `p1…pN` and sends that list; a list in any other form (repeated or out-of-order ids) is ignored. Every read
  records its language and the page count it was made on, so reads count only for that pagination: the same agreement
  can paginate differently on another device or in the other language, and nothing from one pagination completes (or
  blocks) another. Signing needs one pagination — language + N pages, N ≥ `private.agreement_min_pages()` (a lower bound
  from the pinned layout) — with every page read in it. Any complete language suffices; reads stored before 024 carry no
  page count and count for any.
* **Signatory versions.** `developer_signatories` stores every signatory / signature / stamp version (written by a
  trigger on `developers`); issuing an order pins `orders.signatory_id`, which is part of the deal fingerprint. The
  agreement, sign page, certificate, Word export (including §1) and contract variables print the pinned version
  (`D.signerOf`). Signature and stamp images are PNG/JPEG/WebP data URLs, files under `/brand/`, or this project's public
  `media` bucket — no `..` and no percent-encoding (`private.safe_signatory_src`, also a CHECK on `developers`).
* **Prices.** `private.deal_prices()` prices a deal on the server exactly as the wizard does (catalogue look-ups, skip
  flags, feature switches, JavaScript arithmetic: double precision, `Math.round`, VAT per line), including the operating
  model's rental projection (`private.ops_annual_net`, identical to `D.opsEconomics` for every unit × model × price basis).
  Every new order is checked before it draws its REV number (and again by a deferred trigger): the unit price, every
  extras line, the monthly net (within 3 SAR per unit), the operator fee, and the item columns (package, smart home,
  operating model of the first unit; kitchen and cooling of the first unit in per-unit mode, else of the first unit that
  prices them) — `PRICE_MISMATCH`; a kitchen, cooling or catalogue item the project does not offer — `NOT_OFFERED:<item>`.
  A refused order therefore never uses up a reference. Catalogue rows are listed in one order everywhere
  (`created_at, id`), because the wizard takes the first layout option per area. VAT is rounded per line (`D.withVat`), so
  agreement lines — and every priced Word appendix — add up to the total.
* **Price basis.** "Housing-subsidy beneficiary" belongs to the buyer (`customer.beneficiary`), one answer per deal, in
  the rep's wizard and on the buyer's phone (an older phone's answer kept with the configuration is moved to the buyer
  when it submits). Flipping it on an order that is not yet signed re-prices the units from the inventory (and the rental
  projection that follows the unit price), re-issues the agreement and restarts the buyer's reading.
* **Public functions** are rate-limited per IP (`private.public_hits`, limits in `private.over_limit`): 60 unknown
  codes, 60 leads, 30 submissions and 60 signatures an hour → `RATE_LIMITED` (set for shared office Wi-Fi and carrier
  NAT). Every public function counts unknown codes and answers them with `{status: "not_found"}` (an error would roll the
  count back). The IP is `cf-connecting-ip` (set by Cloudflare, which refuses a request carrying its own) or else the last
  `x-forwarded-for` entry (appended by the gateway); nothing else the caller sends is used. Test runs from one machine
  count too (`scripts/rls-tests.mjs` uses 2 submissions + 1 signature and removes its rows when it can).
* A suspended developer's live links show as paused (view and status poll), and leads and submissions are refused; a
  revoked link cannot be extended; extending never passes the project's maximum validity (90 days for public links).
  The signing page receives no internal order fields. A new signing link (which revokes the open one) is issued only by
  the order's rep, a manager (`team`) or Revnu staff. Routing reaches only active sales staff, checked at every routing.
* Times on buyer documents (link expiry, signature, certificate) and in the developer's order drawer are printed in
  Riyadh time on every device. A customisation deadline closes at the end of that day in Riyadh, in the wizard and on the
  server (the database clock is UTC).

## 8. Known deliberate limitations

* Payment gateway is out of scope (client decision). The e-signature is a finger signature + certificate on the buyer's
  phone (no Nafath / qualified e-signature provider).
* Orders issued before migration 018 have no pinned signatory version; they show the developer's current signatory.
* The Word export is in English whatever the interface language (the on-screen agreement and its print/PDF are bilingual).
* Reading is evidenced by the buyer's own phone: an API client that holds a signing code can report reads it never made.
  The server enforces the shape (p1…pN, one pagination, the minimum page count) and the time, IP and device are recorded.
* Bulk CSV unit import runs on the client and inserts in one request (fine for hundreds of rows).
* Order read scope for developer members is tenant-wide (client chose to mirror the prototype).
