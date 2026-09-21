import { test, expect, haveCreds, signIn, setLang, USERS, PASSWORDS } from "./helpers";

test.describe("public surfaces", () => {
  test("marketing site is served at / with the 8-step copy (B-07)", async ({ page }) => {
    await setLang(page, "en");   // the site defaults to Arabic; the English copy carries the "8 STEPS" stat
    await page.goto("/");
    await expect(page.locator("body")).toContainText("8 STEPS");
    await expect(page.locator("body")).not.toContainText("9 STEPS");
    await expect(page.locator('a[href="/login"]').first()).toBeVisible();
  });

  test("portals redirect signed-out visitors to /login and expose no data", async ({ page }) => {
    for (const p of ["/revnu", "/developer?dev=noor-khuzam", "/sales?dev=noor-khuzam"]) {
      const res = await page.goto(p);
      await expect(page).toHaveURL(/\/login\?next=/);
      const html = await page.content();
      expect(html).not.toContain("grovadevelopments.com"); // audit SEC-02: no confidential data before sign-in
      expect(res?.status()).toBeLessThan(500);
    }
  });

  test("sign-in page renders Arabic by default (RTL) and can switch to English", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
    await page.locator('[data-i18n-lang="en"]').click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("white-labelled sign-in shows the developer brand from the public view only", async ({ page }) => {
    await setLang(page, "en");
    await page.goto("/login?dev=noor-khuzam");
    await expect(page.getByRole("heading", { name: /Sign in to Noor Khuzam/ })).toBeVisible();
    await expect(page.getByText("POWERED BY REVNU")).toBeVisible();
  });

  test("wrong password shows a friendly message, not a raw error", async ({ page }) => {
    await setLang(page, "en");
    await page.goto("/login");
    await page.getByLabel("Work email").fill(USERS.rep.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: /Sign in/ }).click();
    // .form-err, not role=alert: Next.js renders its own route announcer with that role.
    await expect(page.locator(".form-err")).toContainText("don't match");
  });
});

test.describe("roles land in the right portal", () => {
  test.skip(!haveCreds("admin", "director", "rep"), "seeded passwords not available");

  test("Revnu super admin → /revnu", async ({ page }) => {
    await signIn(page, "admin");
    await expect(page).toHaveURL(/\/revnu/);
    await expect(page.getByText("Developers").first()).toBeVisible();
  });

  test("sales director → developer admin", async ({ page }) => {
    await signIn(page, "director");
    await expect(page).toHaveURL(/\/developer\?dev=noor-khuzam$/);
    await expect(page.locator(".side-link", { hasText: "Orders" })).toBeVisible();
  });

  test("sales rep → My deals, and cannot open Revnu HQ", async ({ page }) => {
    await signIn(page, "rep");
    await expect(page).toHaveURL(/as=rep/);
    await expect(page.locator(".side-link", { hasText: "My deals" })).toBeVisible();
    await page.goto("/revnu");
    await expect(page).not.toHaveURL(/\/revnu/);
  });
});

test.describe("end-to-end sale", () => {
  test.skip(!haveCreds("rep", "director", "admin"), "seeded passwords not available");
  test.describe.configure({ mode: "serial" });
  let orderId = "";

  test("rep runs the 8-step wizard and submits an order", async ({ page }) => {
    await signIn(page, "rep");
    await page.goto("/sales?dev=noor-khuzam");
    // Order reference is reserved server-side
    const chip = page.locator(".chip.chip-mono", { hasText: /ORDER #REV-26-\d+/ });
    await expect(chip).toBeVisible({ timeout: 20_000 });
    orderId = (await chip.textContent())!.match(/REV-26-\d+/)![0];

    // 1 Customer
    await page.locator("input").first().fill("E2E Buyer");
    await page.getByRole("button", { name: /Continue/ }).click();
    // 2 Unit — first available row of the live inventory table
    await page.locator("table.tbl tbody tr").first().click();
    await page.getByRole("button", { name: /Continue/ }).click();
    // 3..7 — accept the first option on each step until Review & sign
    for (let i = 0; i < 6; i++) {
      const cont = page.getByRole("button", { name: /Continue/ });
      if (!(await cont.isVisible().catch(() => false))) break;
      if (await cont.isDisabled()) {
        const opt = page.locator(".pkg-signature, .opt, .card.opt, [role=option]").first();
        if (await opt.isVisible().catch(() => false)) await opt.click();
      }
      if (await cont.isDisabled()) break;
      await cont.click();
    }
    const submit = page.getByRole("button", { name: /Submit order/ });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page.getByText("Order submitted")).toBeVisible({ timeout: 30_000 });
  });

  test("developer admin sees the order and the upload gate holds (B-05)", async ({ page }) => {
    await signIn(page, "director");
    await page.locator(".side-link", { hasText: "Orders" }).click();
    const row = page.locator("tr", { hasText: orderId });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Contract issued");
    // the table shortcut must route through the upload, never advance directly
    await row.getByRole("button", { name: /Upload signed/ }).click();
    await expect(page.getByText("Upload signed contract")).toBeVisible();
  });

  test("Revnu HQ sees the order in All orders", async ({ page }) => {
    await signIn(page, "admin");
    await page.locator(".side-link", { hasText: "All orders" }).click();
    await expect(page.locator("body")).toContainText(orderId);
  });
});

test("mobile: sidebar becomes a drawer @mobile", async ({ page }) => {
  test.skip(!haveCreds("director"), "seeded passwords not available");
  await signIn(page, "director");
  await expect(page.locator(".mnav-burger")).toBeVisible();
  await page.locator(".mnav-burger").click();
  await expect(page.locator(".sidebar.m-open")).toBeVisible();
});

export { PASSWORDS };
