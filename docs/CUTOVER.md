# Cut-over runbook (single maintenance window, Fri/Sat)

Nothing below touches the client's current Cloudflare demo until step 5. Do the steps in order; each has
a rollback.

## 0. Before the window

- [ ] `npm run test:rls` green against the production Supabase project.
- [ ] Playwright smoke green against the `*.vercel.app` deployment (`E2E_BASE_URL=https://… npm run test:e2e`).
- [ ] Client UAT sign-off on `*.vercel.app` (all three portals, both languages, phone + desktop).
- [ ] Hosting decision confirmed (Vercel vs Cloudflare). If Cloudflare: deploy with OpenNext first and repeat the smoke test there.
- [ ] Hand the seeded temporary passwords (`SEED-CREDENTIALS.local.txt`) to the client securely, then delete the file.

## 1. Resend (e-mail)

- [ ] Add the client's sending domain in Resend → add the DKIM/SPF/DMARC records at the DNS provider → verify.
- [ ] Create an API key (sending only).
- [ ] Vercel env: `MAIL_MODE=resend`, `RESEND_API_KEY=…`, `MAIL_FROM="Revnu <no-reply@<domain>>"` → redeploy.
- [ ] Send a test order notification (transition a test order) and confirm delivery.
- [ ] Supabase Dashboard → Authentication → SMTP: enable custom SMTP with Resend
      (`smtp.resend.com`, port 465, user `resend`, password = the API key, sender = the same address)
      so password-reset e-mails go out through the branded sender.
- Rollback: `MAIL_MODE=log` + disable custom SMTP.

## 2. Domain

- [ ] Add the domain(s) to the Vercel project (e.g. `app.<domain>` for the portals, `www`/apex for the site).
- [ ] Lower the DNS TTL a day ahead; at the window, point the records at Vercel (CNAME / A per Vercel's instructions).
- [ ] Vercel env `NEXT_PUBLIC_SITE_URL=https://app.<domain>` → redeploy.
- [ ] `node scripts/configure-auth.mjs --site https://app.<domain>` (site URL + allowed redirect URLs).
- Rollback: repoint DNS to the previous target (the Cloudflare demo keeps working untouched until then).

## 3. Verify

- [ ] Sign in as each role on the new domain; language toggle; one full sale; upload + download a document; a password reset e-mail arrives.
- [ ] `https://<domain>/` serves the marketing site; lead form lands in Revnu HQ → Interested.

## 4. Turn on the sweeper (optional)

- [ ] Vercel → Settings → Cron Jobs: `GET /api/notifications/dispatch` every 15 minutes with header
      `Authorization: Bearer <CRON_SECRET>` (`vercel.json` already declares the schedule; set `CRON_SECRET`).

## 5. Retire the demo

- [ ] Only after the client confirms: disable the Cloudflare deployment. Keep a copy of the prototype folder.

## Roles reference

| Portal | Who |
|---|---|
| `/revnu` | Revnu staff (Super Admin / Admin / Team) |
| `/developer?dev=<id>` | the developer's admins/managers/finance; reps land on `&as=rep` (My deals) |
| `/sales?dev=<id>` | the developer's sales team (wizard); Revnu staff may open a recorded agreement read-only |
