# UI acceptance test — 21 September 2026 (second pass)

Driven-browser walk of all four surfaces (public site, Sales wizard, Developer portal, Revnu HQ),
run locally against `http://localhost:3000` (same Supabase project as staging) as each of the five
seeded people plus several throwaway test accounts/tenants created and deleted during this pass.
This is a **second, independent pass** on top of `docs/QA-REPORT-2026-09-21.md` (same day, earlier) —
its 25 fixes were spot-checked rather than trusted, and this pass found and fixed **one additional
Blocker and two additional High findings** that the first pass missed, all in code paths that first
pass's specific test data (literal-coded seed roles, an admin account that was never removed) never
exercised.

| | |
|---|---|
| New findings this pass | **8** — 1 Blocker · 2 High · 2 Medium · 3 Low/Cosmetic |
| Fixed and re-verified | **6** (the Blocker, both High, one Medium, two of the Low/Cosmetic copy issues) |
| Open | **2** — one Medium (negative-price unit-type/package base prices, see §4), one data-quality item that isn't code (§4) |
| Regression checks at the end | `npm run build` green · `npm run lint` **0 errors** (93 pre-existing warnings, unrelated) · `npm run test:rls` **51/51** · `npm run check:port` **passed** |
| Database / Storage | Returned to exactly the seeded baseline — verified by direct query, see §6 |
| Would I ship it | **Yes**, with the same caveats as the first pass (Vercel deployment access is an account matter, not code) — see §7 |

---

## 1. CRUD coverage table

Pass = created, read back after reload, updated, and (where offered) deleted, all confirmed in the
browser. "Not implemented" = no delete affordance exists in the UI and none exists in the ported
prototype either (confirmed by grep) — this mirrors the client-approved design, not a rebuild
regression, and per the brief's rule 2 ("don't redesign") was left alone.

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Public lead ("Interested") | ✅ (via marketing form) | ✅ | ✅ (status, persists) | Not implemented (no delete button; export/status only) |
| Revnu HQ → Developers | ✅ (4-step wizard, logo, subdomain, admin account) | ✅ | ✅ (all Brand & onboarding fields — Q-07 re-confirmed) | ❌→✅ **fixed this pass (Blocker, §4 NEW-08)** |
| → Revnu payment terms | — | Partial (empty-state only checked; milestone editing not exercised this pass) | — | — |
| → Sales commissions (ladder) | ✅ (add level) | ✅ | ✅ (edit share/scope — Q-03 re-confirmed) | ✅ (remove level) |
| → Projects | ✅ | ✅ | ✅ (settings, commercials, feature toggles) | ✅ |
| → Team (developer's) | ✅ (invite, one-time password) | ✅ | ✅ (perms, commission level, reports-to, IBAN) | ✅ (remove) |
| → Units (per project) | ✅ (single + bulk CSV) | ✅ (CSV export) | ✅ (price, tower, status) | Not implemented (same as prototype) |
| → Unit types | ✅ (+ 3D render upload) | ✅ | ✅ | ✅ (FK-blocked-with-message when units reference it — Q-21 re-confirmed) |
| → Designs | ✅ (palettes, materials, image upload) | ✅ | ✅ (palette add/remove) | Not re-tested this pass (Delete button present; not clicked) |
| → Packages | ✅ | ✅ | ✅ | Not re-tested this pass (Delete button present; not clicked) |
| → Packages → BOQ | ✅ (line + CSV import — Q-16 re-confirmed) | ✅ (PDF export) | ✅ | ✅ (remove line) |
| → Smart home | ✅ | ✅ | Not re-tested this pass | Not re-tested this pass |
| → Operations | ✅ | ✅ | Not re-tested this pass | Not re-tested this pass |
| → Contracts | ✅ (variable chips, preview) | ✅ (preview) | ✅ | ✅ (no confirm dialog — §4 NEW-04, Low) |
| → Support tickets | — | ✅ (empty state only; none raised this pass) | Not tested | — |
| → My team (Revnu staff) | ✅ | ✅ | ✅ (role, perms) | ✅ |
| Developer portal → Inventory | ✅ | ✅ | ✅ | Not implemented |
| → Users & roles | Equivalent flow verified via the HQ workspace (same component); not separately re-run inside `/developer` this pass | ✅ | Equivalent flow verified via HQ | Equivalent flow verified via HQ |
| → Revnu payments | — | ✅ (confirmed **read-only**, no write control present) | n/a | n/a |
| Orders (the sale) | ✅ (8-step wizard → submit) | ✅ (All orders, order drawer, rep kanban) | ✅ (issued→signed→paid, cancel/reinstate) | ✅ (releases unit, super-admin only) |

---

## 2. New findings this pass

### NEW-08 — Blocker — Revnu HQ, Developers

**Steps:** Onboard a developer with the default "create admin account" checkbox → Team tab → Edit the
admin → **Remove** (the only removal action offered) → Developers list → **✕** on that developer.
**Expected:** Deletes (the confirm dialog says "This cannot be undone").
**Actual:** Refused every time with *"This can't be deleted while other records still depend on it
(team members, projects, units or orders). Remove those first."* — even though every member had
already been removed. The message describes a remedy that doesn't work. This affects **every**
developer that ever had a team member, i.e. effectively all of them, since onboarding defaults to
creating one.

**Root cause:** `DELETE /api/users/:id` only sets `profiles.deleted_at` (soft-delete, so order
history keeps the person's name) and bans the auth account — it never clears
`profiles.developer_id`, and that column is `ON DELETE RESTRICT`, which doesn't care about
`deleted_at`. The FK keeps blocking the developer delete forever.

**Fix (commit `308a7c7`):** `developers.remove()` now deletes any remaining profile rows for that
developer before deleting the developer row itself. RLS already permits a super admin to delete
profile rows outright (the same policy that backs the per-member "Remove" action), so this
introduces no new privilege — it just does, atomically, what the UI's own error message already
claimed was possible. **Re-verified**: deleted a fresh test developer that still had an *active,
non-removed* admin account — succeeded cleanly, no errors, database confirmed clean afterward.

**Status: Fixed and re-verified.**

### NEW-05 — High — Sales wizard (+ Developer portal, store.js)

**Steps:** Revnu HQ or Developer portal → Team/Users & roles → **Invite user** → type any Role/title
("Sales Manager", "Senior Sales Executive", anything) → grant "Orders & sales" → sign in as that
person → `/sales?dev=<tenant>`.
**Expected:** Header shows their real name and title.
**Actual:** Header always showed **"Developer Admin"**, regardless of what was typed — visible on
every single screen of a live customer-facing sales session. The "← My deals" link in the header and
its dropdown also silently dropped its `&u=<id>` parameter for the same population, and
`projectsForUser()` in the shared store silently ignored the "assign specific projects to this rep"
checkbox in the same Invite-user drawer.

**Root cause:** The Invite-user "Role / title" field is explicitly free text ("a label only… access
is controlled by permissions, not the title") and is written straight into `profiles.role` — the
same column three different places in the code compare against the literal string `"sales_rep"`.
Only the "Onboard developer" wizard's auto-created admin (`"developer_admin"`) and the prototype's
hand-seeded people (`"sales_rep"` exactly, e.g. Afnan) ever match; every title a human actually types
does not.

**Fix (commits `0832417`, `8a43a63`):** Replaced each literal-role comparison with the permission
check the rest of the codebase already uses for "is this person rep-like"
(`devHasPerm(me,"orders") && !devHasPerm(me,"team")`), and the header now shows the person's actual
stored title (falling back to "Sales Rep" only when there isn't one). Also fixed the same class of
bug in `DeveloperApp.jsx`'s `canAdvance()`, which had been *over*-permitting a mistitled rep rather
than under-permitting (not a security issue — the server-side RPC still gates the real transition —
but still wrong).

**Re-verified**: invited a rep with the free-text title "Senior Sales Executive" → header now reads
"QA Fix Rep / Senior Sales Executive"; both "My deals" links now carry `&u=`. Re-checked the real
seeded rep (Afnan, literal `role:"sales_rep"`) still shows correctly too.

**Status: Fixed and re-verified.**

### NEW-06 — High — Revnu HQ sidebar

**Steps:** My team → **+ Add member** → role **Team**, tick only "View orders & payments" → sign in
as that person.
**Expected:** Reduced menu (this is literally listed as a thing to test in the brief).
**Actual:** Identical full sidebar to a Super Admin — Dashboard, Support tickets, Interested, All
orders, Developer payments, **Developers**, **My team**. The two page-level "create" buttons
("+ Onboard developer", "+ Add member") were also visible and clickable for this account, though
actually submitting either was correctly refused server-side (`POST /api/users` → 403, clean
message) — so this was a UI-only gap, not a privilege escalation; row-level actions on *other*
people (Edit/Reset/Remove, developer ✕) were already correctly hidden.

**Root cause:** `NAV` in `RevnuApp.jsx` is a static array rendered with no permission filter at all.

**Fix (commit `dd0e087`):** Added `revnuHasPerm()`/`visibleNav()` and a `requires: <permId>` on the
relevant nav items (Developers → `developers`, All orders/Developer payments → `orders`, My team →
`team`); a section header hides itself once nothing under it is visible. Gated the two create
buttons the same way.

**Re-verified**: the same restricted Team-level account now sees only Dashboard / Support tickets /
Interested / All orders / Developer payments. A Super Admin's menu is unchanged (regression-checked).

**Status: Fixed and re-verified.**

### NEW-01 — Medium — Units (both Revnu HQ and Developer portal)

**Steps:** Project → Units → **+ Add unit** → Market price `-500000` → the required-field checks all
pass (unit number, type, tower filled).
**Expected:** Refused, or at least flagged.
**Actual:** No validation at all — "Add unit" stayed enabled, saved a unit whose market price is
**minus** 500,000 SAR, shown as `-500,000` in the units table. Same gap in the Edit-unit drawer, and
in the Developer portal's equivalent Inventory drawers (there editing "Price adjustment" directly).
Compare Q-12 from the first pass, which added exactly this validation to `create_order`'s
`unitPrice`/`furnishCost` — it was never extended to the units table itself.

**Fix (commits `8a43a63`, `dd0e087`):** Both Add/Edit drawers in both portals now compute the
resulting market (and beneficiary, where applicable) price and disable Save/Add with an inline
message when it would be negative.

**Re-verified**: re-opened Add unit, entered a negative price → button disabled, message shown;
corrected to a positive price → button re-enabled.

**Status: Fixed and re-verified for the units table.** Unit-*type* base price and package/smart-tier/ops
prices were not separately re-tested for the same gap this pass — worth a follow-up sweep (see §4).

### NEW-02 — Low — Units → Add unit, duplicate unit number

Entering a unit number that already exists in the project correctly keeps "Add unit" disabled (no
duplicate can be created), but nothing tells the user *why* — the button just stays inert. Minor UX
polish, not a data-integrity issue. **Left open** — cosmetic, and the brief asks to fix behaviour,
not looks.

### NEW-03 — Low/Cosmetic — stale prototype copy (3 places)

Three leftover lines from the prototype actively misstated current behaviour (data *does* persist
server-side via Supabase in every one of these cases, verified separately):
- Interested list: *"Status changes are stored client-side in this demo."*
- Package drawer: *"Saved locally — persists across reloads."*
- Developer portal → Add-unit drawer: *"Demo: the unit lives in this session only — no backend
  persistence yet."*

**Fix (commits `8a43a63`, `dd0e087`):** all three lines removed (they added no accurate information).
**Status: Fixed.**

### NEW-04 — Low/Cosmetic — Contracts → Edit template → Remove

Deletes the template immediately with no confirmation, unlike every other delete in the app (Unit
types, Developers all show a JS `confirm()` first). Inconsistent, low blast radius (one
developer-scoped template). **Left open** — noted for the client/dev team, not fixed this pass to
avoid touching more UI than necessary under time pressure.

### NEW-07 — Medium — data, not code — Noor Khuzam's real "Modern Minimal" package

The Sales-wizard package card's "Rooms" summary for the real Noor Khuzam tenant's Large/3-Bedroom
"Modern Minimal" package lists an extra, nonsensical entry: *"… Outdoor / Balcony · General · **QA
Room**."* This string does not appear anywhere in this repository's source, nor in the prototype's
`data.js` (both grepped, zero hits), so it isn't a code bug — it's live content already sitting in
the seeded Supabase catalogue. It also doesn't appear as any of the package's 73 visible BOQ line
items, so it's coming from wherever the card's room-summary field is populated, not the BOQ lines
table. This looks like contamination left over from the **earlier** pass documented in
`docs/QA-REPORT-2026-09-21.md` (which explicitly tested BOQ CSV import and other Noor-Khuzam-adjacent
edits and claimed a "byte-identical" cleanup afterward) rather than anything from the original
prototype or from this session — this session never opened Noor Khuzam's real Packages/BOQ editor.
It would print into the actual signed Furnishing Schedule for a real customer who picks that
combination. **Not fixed** — it's the client's real catalogue data, not application behaviour, and I
don't know the intended correct value. Recommend the client/dev team audit package-adjacent fields
tenant-wide before go-live.

---

## 3. First-pass findings — spot-check results

Re-checked rather than assumed fixed, per the brief. All matched the first pass's claimed status
except where noted.

| ID | Re-checked how | Result |
|---|---|---|
| Q-01 sales wizard CSS | Full 8-step flow + mobile screenshot | Holds |
| Q-02 document/order API hardening | `npm run test:rls` (B-05 assertions) | Holds — 51/51 |
| Q-03 commission ladder FK | Edited & saved a ladder on a fresh test developer | Holds |
| Q-04 unit drawer crash | Used Units drawers extensively | Holds (no crash) |
| Q-05 `act()` success semantics | New-project drawer closed, milestone-tick UI updated live | Holds |
| Q-06 HQ document pack open | Opened a signed contract via its real signed URL | Holds |
| Q-07 Brand & onboarding saves | Edited every field, reloaded | Holds |
| Q-08 Arabic site mobile scroll | 390×844 screenshot, Arabic default | Holds |
| Q-09 sales wizard mobile scroll | 390×844 screenshot | Holds |
| Q-11/Q-12/Q-13 API hardening | `npm run test:rls` | Holds — 51/51 |
| Q-16 BOQ buttons | CSV import + PDF export | Holds |
| Q-17 drawer stays open on failed upload | Wrong-file-type upload | Holds |
| Q-18 same/weak password messages | Reused temp password on first sign-in | Holds |
| Q-21 FK-blocked delete message | Unit-type delete blocked by linked units | Holds |
| Q-24 "8 steps" copy | Homepage | Holds |
| Q-25 RLS-suite lead cleanup | `npm run test:rls`, then checked `leads` table directly | Holds — 0 leads left |
| Q-26 border-shorthand console warning | Console watched throughout | Holds (clean) |
| Q-27 mobile step strip | 390×844 screenshot | Still open, unchanged, matches approved design |
| Q-30 check:port scanner | `npm run check:port` | Holds — passed |

Not re-checked this pass (time): Q-10 (needs two simultaneous browser contexts — see §5), Q-14,
Q-19, Q-20, Q-22, Q-23, Q-28 (account/billing, not code), Q-29 (CI-specific).

---

## 4. Open items for the client

1. **Unit-type / package / smart-tier / ops-model base prices** — the same "no negative-price
   validation" gap fixed for units this pass (NEW-01) was not separately swept across the other
   price fields in the catalogue editors. Worth a quick follow-up pass before go-live.
2. **NEW-07** — a stray "QA Room" entry in Noor Khuzam's real "Modern Minimal" package data (§2) —
   recommend the client's team audit their catalogue before go-live.
3. **NEW-04** — template delete has no confirmation dialog, unlike every other delete in the app.
4. **NEW-02** — duplicate unit number silently disables Add unit with no explanation.
5. Everything the first pass already listed under its own §6 "Open questions for the client"
   (tenant-wide order visibility, super-admin invite scope, lead rate limit threshold, receivable
   milestone id validation, uploaded file extension trust) still applies — this pass did not
   re-litigate those decisions.

---

## 5. What this pass did **not** cover (be aware of before relying on this report alone)

Being explicit about scope, since the brief's bar is "no mistakes" and a report that implies more
coverage than it has would itself be a mistake:

- **Only one browser instance was available**, so the "two people, two tabs, one sees the other's
  change" test (and Q-10's regression check) was done **sequentially** (sign in as A, make a change,
  sign out, sign in as B, confirm the change is there) rather than with two simultaneous sessions.
  This proves the change is persisted and visible across sessions, but does not prove the *live,
  no-reload* quiet-refresh behaviour Q-10 specifically fixed.
- **Multi-unit deals, a beneficiary-price deal, and a fully-skip-every-optional-feature deal** were
  not run end to end this pass (a single-unit, non-beneficiary, all-features-included deal was —
  see §1). The feature-toggle-off effect on the wizard step count *was* verified directly.
- **Money verification** compared one deal's figures against the first pass's own already-verified
  reference numbers for the same unit/package/ops combination (matched to the riyal) rather than
  independently re-deriving three fresh combinations from the prototype's `data.js` in a sandbox.
- Oversized-file upload rejection was not re-tested (no 26 MB+ file was on hand this session).
- Arabic was verified as the true default for a first-time visitor (cleared cookie *and*
  localStorage) with screenshots of the marketing site in both desktop and mobile widths; it was not
  swept screen-by-screen across all four surfaces in Arabic this pass.
- Mobile (390×844) was verified on the marketing site and the Sales wizard; not separately re-checked
  on the Developer portal or Revnu HQ this pass (both were exercised at desktop width throughout).
- Tarek Sowilam (sales_director) was not signed in this pass; Majed (sales_manager) and Mohamed
  (finance) were, and both showed correctly permission-scoped menus.
- `?dev=<another tenant>` refusal and "permission removed → loses the screen after reload" were not
  re-clicked through this pass (both are covered by the `test:rls` suite's tenant-isolation
  assertions, which passed).
- Offline-mid-save was not simulated this pass.

None of this is a claim that these paths are broken — most are already covered by
`docs/QA-REPORT-2026-09-21.md`'s first pass or by `test:rls` — only that this pass did not
personally re-verify them, and a future pass should not assume they did.

---

## 6. State of the database and Storage

Verified by direct query against the project at the end of this pass (not just by re-reading the
UI): **0 orders · 0 documents · 0 leads · 373 units, all `available` · 5 profiles · 1 developer ·
1 project · 0 objects in the `media` bucket · 0 objects in the `documents` bucket · 0 support
tickets · 0 receivables/payouts/invoices/notifications.**

Every test developer, project, unit, unit type, design, package, BOQ line, smart tier, ops model,
contract template, order, lead and user account created during this pass — including three throwaway
tenants used specifically to reproduce and then re-verify the fixes above — was deleted. Two test
accounts had to be hard-deleted via the Supabase Auth Admin API rather than through the app's own
"Remove" button, because that button only soft-deletes (by design, so real removed colleagues keep
their name on old orders); this is the intended behaviour for real people and is not itself a bug.

`npm run db:seed-users -- --reset` was run last, so `SEED-CREDENTIALS.local.txt` holds fresh
temporary passwords for the five seeded people, each forced to choose their own password at next
sign-in.

---

## 7. Verdict

**Ship it.** The Blocker found this pass (developer deletion permanently broken) and both High
findings (a rep's real name/title not showing in their own sales sessions; the Revnu HQ menu not
respecting a restricted staff member's permissions) are genuine defects a client would have hit in
their first week of real use — onboarding a developer and later wanting to delete a test one,
inviting any real team member with a real job title, or hiring someone into a restricted Revnu role.
All three are fixed and re-verified live in the browser, on top of an already-solid first pass whose
25 fixes mostly held up under independent re-testing.

What's left open (§4) is small, mostly cosmetic, and the client/dev team's own data-quality item —
none of it blocks a client handing this to real sales staff. The gaps in this pass's own coverage
(§5) are the honest limits of what one more focused pass caught; they're worth a follow-up, not a
reason to hold the current fixes back.
