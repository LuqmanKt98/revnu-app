# Revnu — sales-enablement platform (Phase 1 rebuild + Phase 2)

Three portals (Sales wizard · Developer back office · Revnu HQ) plus the public marketing site,
rebuilt on **Next.js 16 + Supabase (Postgres, Auth, Storage)** under the client-approved front end.
The UI, copy, bilingual EN/AR + RTL system and business logic are ported 1:1 from the prototype;
the foundation underneath is new: a real database with relations, server-enforced authorization
(Row Level Security), real accounts, file storage, and a production build.

## Phase 2 (Release 2)

* **Four new options on every sale** — layout changes, flooring, kitchens, cooling/AC: catalogues in Revnu HQ,
  prices per unit type, a wizard step each and agreement appendices F-3 to F-6.
* **Phone-first sales wizard** shared by the rep and the buyer (up to 11 steps), one or many units, a full
  agreement preview before anything is issued.
* **Selling by link** — fixed units, a shortlist, or a public link routed to the reps; QR or a WhatsApp link;
  the rep approves with one tap. Steps the rep switches off are hidden from the buyer.
* **E-signature on the buyer's phone** — every page read before signing, the developer's signature and stamp
  pre-applied, a signature certificate; Nafath can be added later.
* **Payment after signing** — per-project bank details (HQ → project → Settings) shown on the buyer's signed
  screen, in the "signed" e-mail and in the rep's one-tap WhatsApp message.
* **Around it** — international mobile numbers, proof of payment before "Customer paid", buyer details editable
  until signing (the buyer's e-mail is required), activity history, the agreement editor and platform fees in HQ.
* **E-mail notifications live** through Resend from `no-reply@notify.revnu.sa`.
* **The client's original public site** in front of the platform: its landing page at `/` (with the bilingual video;
  "Request demo" feeds HQ → Interested), `/why-us`, `/how-it-works`, and "Sign in" at `/auth` (our sign-in).
  Addresses of the original site (`/admin`, `/sales/…`, `/portal/…`, `/reset-password`, `/login.html`) redirect to the
  matching portal (`next.config.ts`).
* The server re-prices every order and enforces every rule; see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7a.

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
| E-mail | Resend via `lib/email` — live in production from `no-reply@notify.revnu.sa`; `MAIL_MODE=log` in local development |
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
| `MAIL_MODE`, `RESEND_API_KEY`, `MAIL_FROM` | `log` locally; production uses `resend` with `MAIL_FROM="Noor Khuzam via Revnu <no-reply@notify.revnu.sa>"` |
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
app/            routes: / (static landing), /why-us, /how-it-works, /auth + /login (sign-in), /sales, /developer,
                /revnu, /order, /sign, /api/*, /auth/callback
components/     shared shells; public/ = Why Us + How It Works (ported from the client's original site)
portals/        the ported prototype apps (SalesApp, DeveloperApp, RevnuApp) + shared contract/word/floor-plan
lib/data/       store.js (ported data.js: reads in memory, writes via API), api.js (Supabase transport,
                friendly errors), mappers.js (DB <-> prototype shapes), snapshot.js, support.js (tours/tickets/uploads)
lib/auth/       session/gate/routing helpers (server), permission helpers for route handlers
lib/supabase/   browser / server / admin clients
lib/email/      Resend mailer + bilingual templates
supabase/       migrations, generated seed.sql, seed-users.json
scripts/        provisioning + tests (see above)
public/         brand/, images/, fonts, i18n.js, home.html + home-ar.js (the landing served at /), media/ (its videos)
styles/         styles.css + mobile.css — the prototype's design tokens, unchanged
tests/e2e/      Playwright specs
```

## Deployment (Vercel)

1. `vercel link` and set the environment variables above in the Vercel project (Production + Preview).
   Production sends e-mail (`MAIL_MODE=resend`); keep `MAIL_MODE=log` for previews.
2. Every push to `main` builds; `npm run build` must be green (CI runs lint + build on every push).
3. After the first deployment run `node scripts/configure-auth.mjs --site https://<deployment>.vercel.app`
   so password-reset links redirect to the right origin.
4. The custom domain (www.revnu.sa) and Supabase SMTP are switched at the end — see [`docs/CUTOVER.md`](docs/CUTOVER.md).
   The Resend sending domain `notify.revnu.sa` is already verified (region eu-west-1; DKIM and return-path records at T2).

## Current state (16 October 2026)

| Item | State |
|---|---|
| Database | 27 migrations (`…001` to `…027`) applied to the client's Supabase project |
| Policy tests | `npm run test:rls` — 104 assertions, all passing |
| Port check | `npm run check:port` — passing |
| Verified end to end | rep → link → buyer's phone (switched-off steps hidden) → one-tap Approve → every page read → signature and certificate; the "ready to sign" and "signed" e-mails sent through Resend; the payment block on the signed screen and in the rep's WhatsApp message |
| E-mail | Live on production from `no-reply@notify.revnu.sa` |

## Phase 1 state (21 September 2026)

| Item | State |
|---|---|
| Database | Six migrations applied to the client's project; catalogue seeded (1 developer, 1 project, 5 unit types, **373 units**, 3 designs, 3 packages, 3 smart tiers, 3 operating models) |
| Accounts | The five seeded people exist as real accounts, each with a one-time temporary password in `SEED-CREDENTIALS.local.txt` and a forced password change at first sign-in. **No e-mail was sent to anyone.** |
| Policy tests | `npm run test:rls` — 46 assertions, all passing |
| Port check | `npm run check:port` — every call site, RPC, table and column verified |
| Verified end to end | rep signs in → 8-step wizard → order submitted (`issued`) → developer uploads the signed agreement (→ `signed`) → uploads proof of payment (→ `paid`) → invoice raised → Revnu HQ shows the 78,200 SAR receivable. Unit locked and released correctly throughout. |
| E-mail | `MAIL_MODE=log`: notifications are queued and marked `logged`, nothing is sent. Flip to `resend` at cut-over. |
| Test data | Removed after verification — the database is clean (0 orders, 0 documents, 0 leads, all 373 units available). |

## Not included yet (by client decision)

Automatic WhatsApp messages (need the client's WhatsApp Business API; the rep's one-tap WhatsApp works today),
Nafath / a licensed e-signature provider, an online payment gateway, the Arabic Word export, and the move to the
client's own Vercel account with www.revnu.sa (final cut-over step).
