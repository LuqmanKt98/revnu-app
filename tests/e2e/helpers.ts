import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

// Seeded accounts (see supabase/seed-users.json). Passwords come from SEED-CREDENTIALS.local.txt
// (written by scripts/seed-users.mjs) or E2E_PASSWORD_<legacy_id> env vars.
export const USERS = {
  admin:    { legacy: "msiyadi",   email: "m@revnu.com" },
  director: { legacy: "nk-tarek",  email: "tarek.sowilam@grovadevelopments.com" },
  manager:  { legacy: "nk-majed",  email: "majed.saeed@grovadevelopments.com" },
  rep:      { legacy: "nk-afnan",  email: "afnan.alammari@grovadevelopments.com" },
  finance:  { legacy: "nk-mohamed", email: "mohamed.relsayed@grovadevelopments.com" },
};

function readPasswords(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const txt = fs.readFileSync(path.join(process.cwd(), "SEED-CREDENTIALS.local.txt"), "utf8");
    let cur: string | null = null;
    for (const line of txt.split(/\r?\n/)) {
      const e = line.match(/^\s+email:\s+(\S+)/); if (e) cur = e[1].toLowerCase();
      const p = line.match(/^\s+password:\s+(\S+)/); if (p && cur) out[cur] = p[1];
    }
  } catch {}
  for (const u of Object.values(USERS)) {
    const v = process.env["E2E_PASSWORD_" + u.legacy.replace(/-/g, "_")];
    if (v) out[u.email] = v;
  }
  return out;
}
export const PASSWORDS = readPasswords();
export const haveCreds = (...keys: (keyof typeof USERS)[]) => keys.every((k) => !!PASSWORDS[USERS[k].email]);

export async function setLang(page: Page, lang: "en" | "ar") {
  await page.context().addCookies([{ name: "revnu_lang", value: lang, url: process.env.E2E_BASE_URL || "http://localhost:3000" }]);
}

/** Sign in through the real form and land on the portal. Handles the forced first-sign-in password change. */
export async function signIn(page: Page, who: keyof typeof USERS) {
  const u = USERS[who];
  const pw = PASSWORDS[u.email];
  if (!pw) throw new Error("no password for " + u.email);
  await setLang(page, "en");
  await page.goto("/login");
  // If a previous test left a session, use "Not you? Sign out"
  const notYou = page.getByText("Not you? Sign out");
  if (await notYou.isVisible().catch(() => false)) await notYou.click();
  await page.getByLabel("Work email").fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(pw);
  await page.getByRole("button", { name: /Sign in/ }).click();
  // First sign-in: the person must choose a NEW password (Supabase refuses the temporary one again).
  // We derive one from the temporary password and remember it for the rest of this run; afterwards the
  // seeded file is consumed exactly as it would be by a real first sign-in — pass E2E_PASSWORD_<legacy_id>
  // or re-run `npm run db:seed-users -- --reset` before the next run.
  const newPw = page.getByLabel("New password", { exact: true });
  if (await newPw.isVisible({ timeout: 4000 }).catch(() => false)) {
    const chosen = pw + "-e2e";
    await newPw.fill(chosen);
    await page.getByLabel("Repeat new password").fill(chosen);
    await page.getByRole("button", { name: /Save/ }).click();
    PASSWORDS[u.email] = chosen;
  }
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

export const test = base;
export { expect };
