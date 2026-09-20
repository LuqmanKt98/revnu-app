# Revnu — sales-enablement platform (Phase 1 rebuild)

Three portals (Sales wizard · Developer back office · Revnu HQ) plus the public marketing site,
rebuilt on **Next.js 16 + Supabase (Postgres, Auth, Storage)** under the client-approved front end.
The UI, copy, bilingual EN/AR + RTL system and business logic are ported 1:1 from the prototype;
the foundation underneath is new: a real database with relations, server-enforced authorization
(Row Level Security), real accounts, file storage, and a production build.

**Live (staging):** https://revnu-app.vercel.app — Vercel default domain; the client's own
domain is connected only at the final cut-over.
Repository: https://github.com/LuqmanKt98/revnu-app · Docs: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/CUTOVER.md`](docs/CUTOVER.md)

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, the prototype's `styles.css`/`mobile.css` unchanged |
| Database | Supabase Postgres — `supabase/migrations/*.sql` (schema, RLS, RPCs, storage, views) |
| Auth | Supabase Auth, **email + password** (admin-created accounts, forced password change on first sign-in, admin resets) |
| Files | Supabase Storage — private `documents` bucket (contracts, proofs), public `media` bucket (renders, logos) |
| E-mail | Resend via `lib/email` — `MAIL_MODE=log` in development, switched on at cut-over |
| Hosting | Vercel (`*.vercel.app` until cut-over); nothing Vercel-specific in the code |

## Local setup

```bash
npm install
cp .env.example .env.local       # then fill in the values (see below)
npm run dev                      # http://localhost:3000
```

`.env.local` (never committed):

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything |
| `SUPABASE_ACCESS_TOKEN` | `npm run db:apply`, `configure-auth` (Management API; never used at runtime) |
| `SUPABASE_SERVICE_ROLE_KEY` | `db:seed-users`, inviting users, password resets, e-mail dispatch (server only) |
| `MAIL_MODE`, `RESEND_API_KEY`, `MAIL_FROM` | `log` until cut-over, then `resend` + branded sender |
| `NEXT_PUBLIC_SITE_URL` | links inside e-mails and password-reset redirects |
| `CRON_SECRET` | optional: protects `GET /api/notifications/dispatch` for a scheduler |

## Database — first-time provisioning (in order)

```bash
npm run db:export-seed     # prototype data.js  ->  supabase/seed.sql + seed-users.json (already committed)
npm run db:apply           # applies supabase/migrations/*.sql through the Management API (tracks what ran)
npm run db:seed            # loads the catalogue (developer, project, unit types, 373 units, designs, packages…)
npm run db:seed-users      # creates the seeded people as real accounts (NO e-mail is sent)
                           #   -> temporary passwords land in SEED-CREDENTIALS.local.txt (git-ignored)
node scripts/configure-auth.mjs --site https://<deployment>.vercel.app
npm run test:rls           # policy regression suite (signs in as each role; cleans up after itself)
```

`db:apply` is idempotent (applied migrations are recorded in `private.applied_migrations`);
`db:seed` uses upserts and can be re-run.

## Accounts and passwords (no e-mail dependency)

* Accounts are created by admins — from **Users & roles** (developer team), **My team** (Revnu staff),
  the **Onboard developer** wizard, or `db:seed-users`. Each new account gets a **temporary password
  shown once** to the admin, to share privately. The person must choose their own password at first sign-in.
* Locked out? An admin clicks **Reset password** on the person's card → a new temporary password.
* **Forgot password?** on the sign-in page sends a reset link by e-mail — it works once an e-mail
  sender is live (Supabase default SMTP is rate-limited and only reaches project members; Resend at cut-over).
* Removing a user soft-deletes the profile (order history keeps their name) and blocks the account.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` / `lint` | Next.js |
| `npm run db:apply` / `db:seed` / `db:seed-users` / `db:export-seed` | see above |
| `npm run test:rls` | database policy tests against the real project |
| `npm run test:e2e` | Playwright end-to-end (needs a dev server + seeded passwords; `npx playwright install chromium` once) |
| `node scripts/db-apply.mjs --sql "select 1"` | ad-hoc SQL via the Management API |

## Project layout

```
app/            routes: / (static marketing), /login, /sales, /developer, /revnu, /api/*, /auth/callback
portals/        the ported prototype apps (SalesApp, DeveloperApp, RevnuApp) + shared contract/word/floor-plan
lib/data/       store.js (ported data.js: reads in memory, writes via API), api.js (Supabase transport,
                friendly errors), mappers.js (DB <-> prototype shapes), snapshot.js, support.js (tours/tickets/uploads)
lib/auth/       session/gate/routing helpers (server), permission helpers for route handlers
lib/supabase/   browser / server / admin clients
lib/email/      Resend mailer + bilingual templates
supabase/       migrations, generated seed.sql, seed-users.json
scripts/        provisioning + tests (see above)
public/         brand/, images/, fonts, i18n.js, home.html (marketing site served at /)
styles/         styles.css + mobile.css — the prototype's design tokens, unchanged
tests/e2e/      Playwright specs
```

## Deployment (Vercel)

1. `vercel link` and set the environment variables above in the Vercel project (Production + Preview).
   Use `MAIL_MODE=log` until cut-over.
2. Every push to `main` builds; `npm run build` must be green (CI runs lint + build on every push).
3. After the first deployment run `node scripts/configure-auth.mjs --site https://<deployment>.vercel.app`
   so password-reset links redirect to the right origin.
4. Domain, DNS, Resend and Supabase SMTP are switched at the end — see [`docs/CUTOVER.md`](docs/CUTOVER.md).

## Current state (21 September 2026)

| Item | State |
|---|---|
| Database | Six migrations applied to the client's project; catalogue seeded (1 developer, 1 project, 5 unit types, **373 units**, 3 designs, 3 packages, 3 smart tiers, 3 operating models) |
| Accounts | The five seeded people exist as real accounts, each with a one-time temporary password in `SEED-CREDENTIALS.local.txt` and a forced password change at first sign-in. **No e-mail was sent to anyone.** |
| Policy tests | `npm run test:rls` — 46 assertions, all passing |
| Port check | `npm run check:port` — every call site, RPC, table and column verified |
| Verified end to end | rep signs in → 8-step wizard → order submitted (`issued`) → developer uploads the signed agreement (→ `signed`) → uploads proof of payment (→ `paid`) → invoice raised → Revnu HQ shows the 78,200 SAR receivable. Unit locked and released correctly throughout. |
| E-mail | `MAIL_MODE=log`: notifications are queued and marked `logged`, nothing is sent. Flip to `resend` at cut-over. |
| Test data | Removed after verification — the database is clean (0 orders, 0 documents, 0 leads, all 373 units available). |

## Not in this phase (by client decision)

Payment gateway (Phase 2), e-signature integration (unconfirmed; the download → sign offline → upload flow stays),
custom domain + Resend activation (final cut-over step).
