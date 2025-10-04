import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

test('home shows login or dashboard', async ({ page }) => {
  await page.goto(BASE);

  // Check for common login form elements or dashboard element
  const hasLogin = await page.locator('input[name="mobileNumber"]').count() || await page.locator('input[type="password"]').count();
  const hasHeading = await page.locator('h1').first().textContent();

  expect(hasLogin || hasHeading).toBeTruthy();
});
