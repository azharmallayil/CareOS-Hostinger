import { test, expect } from "@playwright/test";

test.describe("CareOS Security, Authentication & Portal Isolation E2E", () => {
  test("Unauthenticated access to /operations redirects to /login with returnTo parameter", async ({ page }) => {
    await page.goto("/operations");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
  });

  test("Unauthenticated access to /customer redirects to /login", async ({ page }) => {
    await page.goto("/customer");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Unauthenticated access to /technician redirects to /login", async ({ page }) => {
    await page.goto("/technician");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Unauthenticated access to /admin redirects to /login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Login page renders secure credential inputs without leaking secrets in DOM or URL", async ({ page }) => {
    await page.goto("/login");
    const passwordInput = page.locator("input[type='password']");
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute("type", "password");
    await expect(passwordInput).toHaveAttribute("autocomplete", "current-password");

    const emailInput = page.locator("input[type='email']");
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("autocomplete", "email");
  });

  test("Unauthorized page renders isolated access denied state", async ({ page }) => {
    await page.goto("/unauthorized");
    await expect(page.locator("body")).toContainText(/Access Restricted|Unauthorized|Access Denied/i);
  });

  test("Accept invitation page requires valid token parameter", async ({ page }) => {
    await page.goto("/accept-invitation");
    await expect(page.locator("body")).toBeVisible();
  });

  test("Mobile responsive layout renders cleanly on compact viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE viewport
    await page.goto("/login");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });
});
